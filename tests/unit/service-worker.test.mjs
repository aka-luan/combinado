import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  listCacheableFiles,
  buildVersion,
  renderServiceWorker,
} from "../../scripts/generate-sw.mjs";

function withFixtureDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "combinado-sw-"));
  try {
    writeFileSync(join(dir, "index.html"), "<html>shell v1</html>");
    writeFileSync(join(dir, "manifest.webmanifest"), "{}");
    writeFileSync(join(dir, "secrets.env"), "SHOULD_NOT_BE_CACHED=1");
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("listCacheableFiles only includes public app-shell asset types", () => {
  withFixtureDir((dir) => {
    const files = listCacheableFiles(dir);
    assert.deepEqual(files, ["/", "/manifest.webmanifest"]);
  });
});

test("listCacheableFiles maps the root index.html to / to avoid a redirect", () => {
  // Static hosts (Cloudflare Pages, `serve`) 301-redirect /index.html -> /.
  // A cache entry stored under the redirected URL can't be used to fulfill
  // a navigation respondWith(), so the root file must be keyed as "/".
  withFixtureDir((dir) => {
    const files = listCacheableFiles(dir);
    assert.ok(files.includes("/"));
    assert.ok(!files.includes("/index.html"));
  });
});

test("buildVersion changes when precached content changes", () => {
  withFixtureDir((dir) => {
    const files = listCacheableFiles(dir);
    const versionA = buildVersion(dir, files);

    writeFileSync(join(dir, "index.html"), "<html>shell v2</html>");
    const versionB = buildVersion(dir, files);

    assert.notEqual(versionA, versionB);
  });
});

test("renderServiceWorker embeds a versioned cache name and precache list", () => {
  const sw = renderServiceWorker("abc123", ["/index.html", "/manifest.webmanifest"]);

  assert.match(sw, /combinado-app-shell-abc123/);
  assert.match(sw, /"\/index\.html"/);
  assert.match(sw, /cache\.addAll\(PRECACHE_URLS\)/);
});

test("renderServiceWorker never writes runtime responses into the cache", () => {
  const sw = renderServiceWorker("abc123", ["/index.html"]);

  // The fetch handler must only ever read from the precache — it must not
  // call cache.put/cache.add anywhere outside the install handler's addAll.
  const fetchHandler = sw.slice(sw.indexOf('addEventListener("fetch"'));
  assert.doesNotMatch(fetchHandler, /cache\.put/);
  assert.doesNotMatch(fetchHandler, /caches\.open/);
});
