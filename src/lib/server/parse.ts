export type ParsedTeam = {
  responseId: string;
  name: string;
  members: string;
  emails: string[];
  repoUrl: string | null;
  slidesUrl: string | null;
  videoUrl: string | null;
};

// "Bob, BobBob and Bobby; Bobbo" -> ["Bob", "BobBob", "Bobby", "Bobbo"]
const splitList = (s: string) =>
  s
    .split(/,|;|\band\b/iu)
    .map((x) => x.trim())
    .filter(Boolean);

// Emails: split on commas, semicolons, or spaces (never on "and")
const splitEmails = (s: string) =>
  s
    .split(/[,;\s]+/u)
    .map((x) => x.trim().toLowerCase())
    .filter(Boolean);

// Find each column by its header text, so reordering the form doesn't break anything
export function findColumns(header: string[]) {
  const find = (text: string) => header.findIndex((h) => h.toLowerCase().includes(text));
  return {
    timestamp: find("timestamp"),
    name: find("team name"),
    members: find("team members"),
    emails: find("team emails"),
    repo: find("github"),
    slides: find("slides"),
    video: find("video"),
  };
}

// Turn one Sheet row into a clean team, or null if the row is blank/broken
export function parseRow(row: string[], c: ReturnType<typeof findColumns>): ParsedTeam | null {
  const get = (i: number) => (i >= 0 ? (row[i] ?? "").trim() : "");

  const name = get(c.name);
  const timestamp = get(c.timestamp);
  if (name === "" || timestamp === "") return null;

  return {
    // Timestamp + name, so two teams submitting in the same second don't collide
    responseId: `${timestamp}|${name.toLowerCase()}`,
    name,
    members: splitList(get(c.members)).join(", "),
    emails: splitEmails(get(c.emails)),
    repoUrl: get(c.repo) || null,
    slidesUrl: get(c.slides) || null,
    videoUrl: get(c.video) || null,
  };
}
