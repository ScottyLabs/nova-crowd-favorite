import { building } from "$app/env";
import { db } from "./lib/server/db";
import { reconcileAutomaticBallots, watchVotingDeadline } from "./lib/server/automatic-ballots";
import type { Handle } from "@sveltejs/kit/hooks";

if (!building) watchVotingDeadline(db);

export const handle: Handle = async ({ event, resolve }) => {
  if (!building) reconcileAutomaticBallots(db);
  const response = await resolve(event);
  if (event.url.pathname.startsWith("/organizer")) {
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "same-origin");
    response.headers.set("x-frame-options", "DENY");
  }
  return response;
};
