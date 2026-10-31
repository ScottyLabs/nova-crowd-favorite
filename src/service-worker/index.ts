import { self as worker } from "$app/service-worker";
import { immutable, assets as staticAssets } from "$app/manifest";
import { version } from "$app/env";

const name = `nova-shell-${version}`;
const assets = new Set(
  [...immutable, ...staticAssets].map(
    (entry) => new URL(entry.path, worker.location.origin).pathname,
  ),
);
const voterPage = /^\/(?:collection|team\/[^/]+|scan|closed|submitted)\/?$/u;

worker.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(name);
      await cache.addAll([...assets, "/collection", "/scan", "/closed", "/submitted"]);
    })(),
  );
});

worker.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      await Promise.all(
        (await caches.keys())
          .filter((key) => key.startsWith("nova-shell-") && key !== name)
          .map((key) => caches.delete(key)),
      );
      await worker.clients.claim();
    })(),
  );
});

worker.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== worker.location.origin) return;
  // Private API responses, organizer pages, and voter links never enter this cache.
  if (assets.has(url.pathname) || url.pathname.startsWith("/_app/immutable/")) {
    event.respondWith(
      caches.open(name).then(async (cache) => {
        const cached = await cache.match(request, { ignoreVary: true });
        if (cached !== undefined) return cached;
        // Keep assets from a newer deployment while this worker is still active.
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      }),
    );
  } else if (request.mode === "navigate" && voterPage.test(url.pathname)) {
    event.respondWith(
      fetch(request)
        .then(async (response) => {
          if (response.ok) await (await caches.open(name)).put(url.pathname, response.clone());
          return response;
        })
        .catch(async () => {
          return (await (await caches.open(name)).match(url.pathname)) ?? Response.error();
        }),
    );
  }
});

// Client navigation does not fetch HTML. Save the matching public shell for refreshes.
worker.addEventListener("message", (event) => {
  const path: unknown = event.data;
  if (typeof path !== "string" || !voterPage.test(path)) return;
  event.waitUntil(
    (async () => {
      const cache = await caches.open(name);
      if (await cache.match(path)) return;
      try {
        await cache.add(path);
      } catch {
        // A page first visited offline cannot be cached until the connection returns.
      }
    })(),
  );
});
