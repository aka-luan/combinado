import { test } from "node:test";
import assert from "node:assert/strict";
import { readSupabaseConfig } from "../../src/lib/auth/config.ts";

test("returns config when both variables are set", () => {
  const config = readSupabaseConfig({
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key",
  });
  assert.deepEqual(config, {
    url: "https://example.supabase.co",
    anonKey: "anon-key",
  });
});

test("returns null when the URL is missing", () => {
  const config = readSupabaseConfig({ NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon-key" });
  assert.equal(config, null);
});

test("returns null when the anon key is missing", () => {
  const config = readSupabaseConfig({ NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co" });
  assert.equal(config, null);
});

test("returns null when both are empty strings", () => {
  const config = readSupabaseConfig({
    NEXT_PUBLIC_SUPABASE_URL: "",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
  });
  assert.equal(config, null);
});

test("returns null with no env object at all", () => {
  const config = readSupabaseConfig({});
  assert.equal(config, null);
});
