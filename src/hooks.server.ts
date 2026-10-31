import type { Handle } from "@sveltejs/kit/hooks";

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  if (event.url.pathname.startsWith("/organizer")) {
    response.headers.set("cache-control", "no-store");
    response.headers.set("referrer-policy", "same-origin");
    response.headers.set("x-frame-options", "DENY");
  }
  return response;
};
