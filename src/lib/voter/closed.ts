import { goto } from "$app/navigation";
import { ApiError } from "./api.ts";

// Once voting closes, the server refuses changes with a "voting-closed" error.
// Every page sends the voter to the "Voting closed" screen (Figma 6) when that happens.

/** If this error means voting has closed, go to the Voting closed screen and return true. */
export async function goToClosedIf(e: unknown): Promise<boolean> {
  if (!(e instanceof ApiError) || e.code !== "voting-closed") return false;
  await goto("/closed", { replace: true });
  return true;
}
