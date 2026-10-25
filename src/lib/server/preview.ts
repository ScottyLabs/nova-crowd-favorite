/** Only Kennel's isolated PR deployment URLs may expose demo database resets. */
export function isPreview(appUrl: string | undefined): boolean {
  if (appUrl === undefined || appUrl.length === 0) return false;
  try {
    const url = new URL(appUrl);
    return (
      url.protocol === "https:" &&
      /^nova-crowd-favorite-pr-[1-9]\d*\.scottylabs\.net$/u.test(url.hostname)
    );
  } catch {
    return false;
  }
}
