import { error } from "@sveltejs/kit";
import { apiRequest, signedIn } from "../../../../lib/server/organizer-session";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = ({ cookies, params, fetch }) => {
  if (!signedIn(cookies, process.env.ORGANIZER_PASSWORD ?? "")) error(401, "Sign in again.");
  if (params.kind !== "ballots" && params.kind !== "database") error(404);
  return fetch(`/api/organizer/export/${params.kind}`, apiRequest());
};
