import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const manifestPath = join(__dirname, "..", "..", "public", "manifest.webmanifest");

test("manifest.webmanifest is valid JSON with the required PWA fields", () => {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  assert.equal(manifest.name, "Combinado");
  assert.equal(manifest.display, "standalone");
  assert.equal(typeof manifest.id, "string");
  assert.ok(manifest.id.length > 0, "manifest must declare a stable id");
  assert.equal(typeof manifest.theme_color, "string");
  assert.equal(typeof manifest.background_color, "string");
  assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);

  for (const icon of manifest.icons) {
    assert.equal(typeof icon.src, "string");
    assert.match(icon.sizes, /^\d+x\d+$/);
    assert.equal(icon.type, "image/png");
  }

  const sizes = new Set(manifest.icons.map((icon) => icon.sizes));
  assert.ok(sizes.has("192x192"), "must provide a 192x192 icon");
  assert.ok(sizes.has("512x512"), "must provide a 512x512 icon");
});
