import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("login privacy copy matches cloud Registro + device cache architecture", () => {
  const screen = readFileSync(join(root, "src/components/auth/LoginScreen.tsx"), "utf8");

  assert.match(screen, /Privado e só nosso/);
  assert.match(screen, /código enviado para o seu e-mail/);
  assert.match(screen, /nuvem da Casa/);
  assert.match(screen, /cache offline/);

  // Reject the mockup claim that data lives only on-device + backup.
  assert.doesNotMatch(screen, /apenas neste aparelho/);
  assert.doesNotMatch(screen, /backup da Casa/);
});

test("login screen keeps an empty illustration slot for later raster wiring", () => {
  const screen = readFileSync(join(root, "src/components/auth/LoginScreen.tsx"), "utf8");
  assert.match(screen, /data-login-illustration/);
  assert.match(screen, /wired later/i);
});

test("design tokens expose brand cream and olive on :root", () => {
  const css = readFileSync(join(root, "src/app/globals.css"), "utf8");
  assert.match(css, /--color-cream-50:\s*#fcfaf6/i);
  assert.match(css, /--brand-primary:\s*var\(--color-olive-800\)/);
  assert.match(css, /--radius-lg:\s*24px/);
});
