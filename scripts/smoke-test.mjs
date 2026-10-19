const baseUrl = process.env.VIBEWEAVE_BASE_URL || "http://localhost:3000";
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const samplePlan = {
  city: "Karachi",
  budget: "PKR 5,000 / person",
  duration: "An evening · 4 hours",
  occasion: "A little bit of everything",
  mode: "demo",
  members: [
    { name: "Alex", mood: "cinematic", preferences: [{ name: "The Weeknd", type: "urn:entity:artist" }] },
    { name: "Sam", mood: "curious", preferences: [{ name: "Radiohead", type: "urn:entity:artist" }] },
  ],
  rejected: [],
};

await check("health endpoint returns safe readiness fields", async () => {
  const response = await fetch(`${baseUrl}/api/health`);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.status !== "ok" || data.app !== "vibeweave" || typeof data.liveConfigured !== "boolean") {
    throw new Error("Unexpected health response shape");
  }
  if ("apiKey" in data || "key" in data) throw new Error("Health endpoint must never expose credentials");
});

await check("demo planning returns explicitly labelled demo data", async () => {
  const response = await fetch(`${baseUrl}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(samplePlan),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (data.mode !== "demo" || !String(data.label).includes("DEMO DATA") || !Array.isArray(data.candidates)) {
    throw new Error("Demo response is missing its provenance label or candidates");
  }
});

await check("invalid plan input is rejected", async () => {
  const response = await fetch(`${baseUrl}/api/plan`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ city: "", members: [] }),
  });
  if (response.status !== 400) throw new Error(`Expected HTTP 400, received ${response.status}`);
});

if (failures.length) {
  console.error(`\n${failures.length} smoke test(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("\nAll smoke tests passed. These checks do not authenticate against Qloo.");
}
