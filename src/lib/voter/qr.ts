// Reads the team code out of a scanned QR.
// Team stickers hold a link like https://<our site>/t/<code>, so the phone camera
// also works. The in-app scanner only needs the <code> part.

const TEAM_LINK_PATH = /^\/t\/([^/]+)\/?$/u;

/** The sticker code in a scanned QR, or null if it isn't one of our team stickers. */
export function teamCodeFromQr(text: string): string | null {
  let url: URL;
  try {
    url = new URL(text.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const match = TEAM_LINK_PATH.exec(url.pathname);
  if (match === null) return null;
  try {
    const code = decodeURIComponent(match[1]);
    return code.length > 0 ? code : null;
  } catch {
    return null;
  }
}
