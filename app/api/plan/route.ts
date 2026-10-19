import { NextResponse } from "next/server";
import { demoCandidates, type VibeCandidate } from "@/lib/demo";

export const runtime = "nodejs";
export const maxDuration = 25;

type Preference = { name: string; type: string };
type Member = { name: string; preferences: Preference[]; mood?: string };
type PlanRequest = { city: string; budget: string; duration: string; occasion: string; members: Member[]; mode?: "auto" | "demo" | "live"; rejected?: string[] };
type QlooEntity = { entity_id?: string; id?: string; name?: string; type?: string; subtype?: string; properties?: Record<string, unknown>; [key: string]: unknown };

const ALLOWED_TYPES = new Set(["urn:entity:artist", "urn:entity:movie", "urn:entity:tv_show", "urn:entity:brand", "urn:entity:place", "urn:entity:destination", "urn:entity:book"]);
const safeString = (v: unknown, max = 120) => typeof v === "string" ? v.trim().slice(0, max) : "";

async function qlooGet(path: string, params: Record<string, string>, timeoutMs = 8000) {
  const key = process.env.QLOO_API_KEY;
  if (!key) throw new Error("QLOO_API_KEY is not configured on the server.");
  const base = (process.env.QLOO_API_BASE_URL || "https://hackathon.api.qloo.com").replace(/\/$/, "");
  const url = new URL(`${base}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const response = await fetch(url, { headers: { "X-Api-Key": key, accept: "application/json" }, signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
  if (!response.ok) {
    const message = response.status === 401 ? "Qloo rejected the API key (401). Check the event-issued credential." : response.status === 403 ? "This Qloo credential does not have permission for that endpoint (403)." : response.status === 429 ? "Qloo rate limit reached. Please wait before retrying." : `Qloo request failed (${response.status}).`;
    throw new Error(message);
  }
  return response.json();
}

function entitiesFrom(payload: any): QlooEntity[] {
  const values = payload?.results?.entities ?? payload?.results ?? payload?.entities ?? payload?.data ?? [];
  return Array.isArray(values) ? values.filter((x: unknown) => x && typeof x === "object") as QlooEntity[] : [];
}

function normalizeEntity(entity: QlooEntity, category: string): VibeCandidate | null {
  const name = safeString(entity.name, 160);
  const id = safeString(entity.entity_id || entity.id, 180);
  if (!name || !id) return null;
  const props = entity.properties && typeof entity.properties === "object" ? entity.properties : {};
  const url = typeof props.url === "string" && /^https?:\/\//i.test(props.url) ? props.url : undefined;
  const address = typeof props.address === "string" ? props.address : "";
  return { id, name, category, description: address || "Candidate returned by Qloo Insights.", why: "Retrieved from Qloo Insights using the group's resolved taste signals. This is a recommendation signal, not a claim that every member likes it.", source: "QLOO LIVE", url };
}

export async function POST(request: Request) {
  let body: PlanRequest;
  try {
    const raw = await request.text();
    if (raw.length > 24_000) return NextResponse.json({ error: "This request is too large. Reduce the number of tastes and try again." }, { status: 413 });
    body = JSON.parse(raw) as PlanRequest;
  } catch { return NextResponse.json({ error: "Please send a valid JSON plan request." }, { status: 400 }); }
  if (!body || typeof body !== "object") return NextResponse.json({ error: "The plan request must be a JSON object." }, { status: 400 });
  const city = safeString(body.city, 100);
  const budget = safeString(body.budget, 60);
  const duration = safeString(body.duration, 40);
  const occasion = safeString(body.occasion, 80);
  const rejectedIds = Array.isArray(body.rejected) ? body.rejected.filter((x): x is string => typeof x === "string").slice(0, 12) : [];
  const members = Array.isArray(body.members) ? body.members.slice(0, 5) : [];
  if (!city || members.length < 2 || members.some(m => !m || typeof m !== "object" || !safeString(m.name, 60) || !Array.isArray(m.preferences))) {
    return NextResponse.json({ error: "Add a destination and at least two group members with preferences." }, { status: 400 });
  }
  const preferences = members.flatMap(m => m.preferences.slice(0, 8).filter((p): p is Preference => Boolean(p && typeof p === "object")).map(p => ({ member: safeString(m.name, 60), name: safeString(p.name, 100), type: ALLOWED_TYPES.has(p.type) ? p.type : "urn:entity:artist" }))).filter(p => p.name);
  if (!preferences.length) return NextResponse.json({ error: "Add at least one taste signal to the group." }, { status: 400 });

  const keyConfigured = Boolean(process.env.QLOO_API_KEY);
  const mode = body.mode || "auto";
  if (mode === "live" && !keyConfigured) return NextResponse.json({ error: "Live mode needs QLOO_API_KEY. Add it to .env.local on the server; do not paste it into chat or client code." }, { status: 400 });
  if (mode === "demo" || (!keyConfigured && mode === "auto")) {
    const rejected = new Set(rejectedIds);
    const picks = demoCandidates.filter(x => !rejected.has(x.id));
    return NextResponse.json({ mode: "demo", label: "DEMO DATA — not a live Qloo response", city, budget, duration, occasion, resolvedSignals: [], candidates: picks, evidence: [], summary: "The demo group has different cultural entry points: music, film, food and relaxed social spaces. These curated examples illustrate the experience only; they do not establish real Qloo affinity.", overlap: [], rejectedCount: rejected.size });
  }

  try {
    // Resolve up to six unique seeds to keep requests bounded and quota-conscious.
    const unique = [...new Map(preferences.map(p => [`${p.type}:${p.name.toLowerCase()}`, p])).values()].slice(0, 6);
    const resolved = await Promise.all(unique.map(async p => {
      const payload = await qlooGet("/search", { query: p.name, type: p.type });
      const entity = entitiesFrom(payload)[0];
      const id = entity && safeString(entity.entity_id || entity.id, 180);
      return id ? { ...p, id, resolvedName: safeString(entity.name, 160) || p.name } : null;
    }));
    const seeds = resolved.filter((x): x is NonNullable<typeof x> => Boolean(x));
    if (!seeds.length) return NextResponse.json({ error: "Qloo did not resolve these taste inputs. Try more recognizable artist, movie, brand or place names.", mode: "live", candidates: [], resolvedSignals: [] }, { status: 200 });

    const query: Record<string, string> = {
      "filter.type": "urn:entity:place",
      "signal.interests.entities": seeds.map(x => x.id).join(","),
      "filter.location.query": city,
      take: "12"
    };
    if (rejectedIds.length) query["filter.exclude.entities"] = rejectedIds.join(",");
    const payload = await qlooGet("/v2/insights", query);
    const candidates = entitiesFrom(payload).map(x => normalizeEntity(x, "PLACE / EXPERIENCE")).filter((x): x is VibeCandidate => Boolean(x));
    return NextResponse.json({ mode: "live", label: "QLOO LIVE — retrieved from the Qloo API", city, budget, duration, occasion, resolvedSignals: seeds.map(x => ({ member: x.member, input: x.name, resolvedName: x.resolvedName, type: x.type, id: x.id })), candidates, evidence: candidates.map(x => ({ id: x.id, name: x.name, source: x.source })), summary: candidates.length ? `Qloo returned ${candidates.length} place candidates using ${seeds.length} resolved group taste signals and the requested destination. Candidate ranking is based on Qloo's returned order; no individual affinity score is inferred.` : "Qloo returned no place candidates for these inputs and destination. Try a broader city or different taste signals.", overlap: [], rejectedCount: rejectedIds.length });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected Qloo error.";
    return NextResponse.json({ error: message, mode: "live", hint: "Demo mode remains available, but live data is never silently replaced with demo results." }, { status: 502 });
  }
}
