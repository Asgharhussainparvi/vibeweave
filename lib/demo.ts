export type VibeCandidate = {
  id: string;
  name: string;
  category: string;
  description: string;
  why: string;
  source: "DEMO DATA" | "QLOO LIVE";
  url?: string;
};

export const demoCandidates: VibeCandidate[] = [
  { id: "demo-1", name: "Japanese listening bar", category: "FOOD & DRINK", description: "Small plates, considered playlists, low lighting.", why: "A bridge between the group's Japanese food interest and its music-first, cinematic atmosphere.", source: "DEMO DATA" },
  { id: "demo-2", name: "Independent art-house cinema", category: "FILM & CULTURE", description: "A director-led screening followed by a walk and conversation.", why: "Connects the movie lover's cinematic taste with the art-minded member's curiosity.", source: "DEMO DATA" },
  { id: "demo-3", name: "Late-night coffee & dessert", category: "SLOW DOWN", description: "A relaxed final stop for a no-pressure catch-up.", why: "Gives the comedy-and-coffee fan a comfortable landing after a more exploratory evening.", source: "DEMO DATA" }
];
