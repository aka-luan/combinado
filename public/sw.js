// Development placeholder. The production build overwrites this file with a
// versioned, precaching service worker — see scripts/generate-sw.mjs.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", () => self.clients.claim());
