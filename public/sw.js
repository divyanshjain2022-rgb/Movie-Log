// CinemaLog service worker.
//
// Deliberately hand-written rather than generated: the whole policy is the
// twenty lines below, and a build plugin would hide the one decision that
// matters here.
//
// THAT DECISION: pages are never cached. Every page in this app is a
// server-rendered view of one person's log — spending, ratings, gift card
// balances — behind an auth cookie. A cached page outlives the session that
// was allowed to see it, and signing out cannot reach into the cache. So
// navigations go to the network, and if the network is gone the user gets the
// offline card, not yesterday's numbers. Only build assets, which are
// content-hashed and carry nothing personal, are cached.

const VERSION = "v1";
const ASSETS = `cinemalog-assets-${VERSION}`;
const SHELL = `cinemalog-shell-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll([OFFLINE_URL, "/icon-192.png"]))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== ASSETS && key !== SHELL).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

// Let the page trigger an immediate update instead of waiting for the next
// navigation, and let sign-out wipe everything this worker holds.
self.addEventListener("message", (event) => {
  if (event.data === "skip-waiting") self.skipWaiting();
  if (event.data === "clear-caches") {
    event.waitUntil(caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key)))));
  }
});

function isCacheableAsset(url) {
  return (
    url.origin === self.location.origin &&
    (url.pathname.startsWith("/_next/static/") ||
      /\.(?:png|svg|jpg|jpeg|gif|webp|ico|woff2?)$/.test(url.pathname))
  );
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Never touch the API, auth, or anything cross-origin.
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(OFFLINE_URL)) || Response.error())
    );
    return;
  }

  if (!isCacheableAsset(url)) return;

  // Build assets are content-hashed, so a cache hit is always correct and a
  // background refresh is only for the handful that aren't.
  event.respondWith(
    caches.open(ASSETS).then(async (cache) => {
      const hit = await cache.match(request);
      const network = fetch(request)
        .then((response) => {
          if (response.ok) cache.put(request, response.clone());
          return response;
        })
        .catch(() => hit);
      return hit || network;
    })
  );
});
