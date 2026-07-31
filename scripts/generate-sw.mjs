// Runs after `next build` (static export into out/). Walks the exported
// site, builds a versioned precache list of the public app shell, and writes
// out/sw.js. The cache name is a content hash so a new deploy always
// invalidates old caches; nothing outside out/ is ever cached.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, "..", "out");

const CACHEABLE_EXTENSIONS = new Set([
  ".html",
  ".js",
  ".css",
  ".json",
  ".webmanifest",
  ".png",
  ".svg",
  ".ico",
  ".woff2",
]);

export function listCacheableFiles(root) {
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      const ext = entry.slice(entry.lastIndexOf("."));
      if (!CACHEABLE_EXTENSIONS.has(ext)) continue;
      let rel = "/" + relative(root, full).split(sep).join("/");
      if (rel === "/sw.js") continue;
      // Precache the site root as "/", not "/index.html": static hosts
      // (Cloudflare Pages, `serve`) 301-redirect the latter, and a
      // redirected cache entry can't fulfill a navigation respondWith().
      if (rel === "/index.html") rel = "/";
      files.push(rel);
    }
  };
  walk(root);
  return files.sort();
}

function toDiskPath(rel) {
  return rel === "/" ? "index.html" : rel.slice(1);
}

export function buildVersion(root, files) {
  const hash = createHash("sha256");
  for (const rel of files) {
    hash.update(rel);
    hash.update(readFileSync(join(root, toDiskPath(rel))));
  }
  return hash.digest("hex").slice(0, 12);
}

export function renderServiceWorker(version, precacheFiles) {
  return `// Generated at build time. Do not edit — see scripts/generate-sw.mjs.
const CACHE_NAME = "combinado-app-shell-${version}";
const PRECACHE_URLS = ${JSON.stringify(precacheFiles, null, 2)};

// Install precaches in the background but does NOT skipWaiting — the client
// offers the update only when no confirmation/edit is in progress (PRD §18).
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Only the precached app shell is ever served from cache — nothing fetched
  // at runtime (future API/data calls) is written into CACHE_NAME.
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).catch(() => {
        if (request.mode === "navigate") {
          return caches.match("/");
        }
        return undefined;
      });
    })
  );
});

self.addEventListener("push", (event) => {
  let title = "Combinado";
  let body = "Você tem uma atualização no Combinado.";
  let url = "/";

  if (event.data) {
    try {
      const payload = event.data.json();
      if (typeof payload.title === "string" && payload.title) title = payload.title;
      if (typeof payload.body === "string" && payload.body) body = payload.body;
      if (typeof payload.url === "string" && payload.url) url = payload.url;
    } catch {
      const text = event.data.text();
      if (text) body = text;
    }
  }

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      data: { url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = event.notification.data?.url || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) {
          client.navigate?.(target);
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(target);
      }
      return undefined;
    })
  );
});
`;
}

function main() {
  const files = listCacheableFiles(outDir);
  const version = buildVersion(outDir, files);
  const contents = renderServiceWorker(version, files);
  writeFileSync(join(outDir, "sw.js"), contents);
  // eslint-disable-next-line no-console
  console.log(`Generated sw.js (cache combinado-app-shell-${version}, ${files.length} precached files)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
