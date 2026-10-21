// Voter identity: the personal code from the voting link, saved in this browser.
//
// The voting link looks like https://<site>/v/<code>. Opening it saves the code
// here, and every API call sends it as `Authorization: Bearer <code>`.
// The server checks the code against the hashed tokens in the voters table.

const STORAGE_KEY = "nova-voter-code";

// Letters, digits, dash and underscore, 4 to 128 characters.
// Loose on purpose: the server decides if a code is real, this only
// rejects links that are obviously broken (cut off, extra characters).
const CODE_PATTERN = /^[A-Za-z0-9_-]{4,128}$/u;

export function isValidCode(code: string): boolean {
  return CODE_PATTERN.test(code);
}

/** The saved code, or null if this browser has none (or storage is blocked). */
export function getVoterCode(): string | null {
  try {
    const code = localStorage.getItem(STORAGE_KEY);
    return code !== null && isValidCode(code) ? code : null;
  } catch {
    return null;
  }
}

/** Save the code from a voting link. Returns false if the browser blocked storage. */
export function saveVoterCode(code: string): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, code);
    return true;
  } catch {
    return false;
  }
}

export function clearVoterCode(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing saved to clear
  }
}

/** Headers to send with every API request. Empty if there is no code. */
export function authHeaders(): Record<string, string> {
  const code = getVoterCode();
  return code === null ? {} : { Authorization: `Bearer ${code}` };
}
