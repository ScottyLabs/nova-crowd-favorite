export interface TallySummary {
  provisional: boolean;
  submittedBallots: number;
  ranking: { rank: number; teamId: string; name: string }[];
}

export function isTallySummary(value: unknown): value is TallySummary {
  return (
    typeof value === "object" &&
    value !== null &&
    "provisional" in value &&
    typeof value.provisional === "boolean" &&
    "submittedBallots" in value &&
    typeof value.submittedBallots === "number" &&
    "ranking" in value &&
    Array.isArray(value.ranking) &&
    value.ranking.every(
      (entry: unknown) =>
        typeof entry === "object" &&
        entry !== null &&
        "rank" in entry &&
        typeof entry.rank === "number" &&
        "teamId" in entry &&
        typeof entry.teamId === "string" &&
        "name" in entry &&
        typeof entry.name === "string",
    )
  );
}

export function formatTally(result: TallySummary): string {
  const label = result.provisional ? "Provisional results" : "Final results";
  const lines = [`${label} · ${result.submittedBallots} submitted ballots`, ""];
  if (result.ranking.length === 0) {
    lines.push("No submitted ballots have eligible ranked teams.");
    return lines.join("\n");
  }
  const width = Math.max(4, ...result.ranking.map((entry) => String(entry.rank).length));
  lines.push(`${"Rank".padEnd(width)}  Team`);
  for (const entry of result.ranking) {
    const name = entry.name.replaceAll(/\s+/gu, " ").trim();
    lines.push(`${String(entry.rank).padEnd(width)}  ${name}`);
  }
  const places = new Map<number, string[]>();
  for (const entry of result.ranking) {
    const names = places.get(entry.rank) ?? [];
    names.push(entry.name.replaceAll(/\s+/gu, " ").trim());
    places.set(entry.rank, names);
  }
  for (const [rank, names] of places) {
    if (names.length > 1) lines.push(`\nShared rank ${rank}: ${names.join(", ")}`);
  }
  if (result.provisional) lines.push("\nVoting is still open. Results may change.");
  return lines.join("\n");
}
