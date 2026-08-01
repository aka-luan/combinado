import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SETTINGS_GROUPS,
  parseSettingsHash,
  settingsHash,
} from "../../src/lib/settings/navigation.ts";

test("settings index groups the secondary Casa, Planejamento, and Aplicativo surfaces", () => {
  assert.deepEqual(
    SETTINGS_GROUPS.map((group) => group.label),
    ["Casa", "Planejamento", "Aplicativo"],
  );
  assert.deepEqual(
    SETTINGS_GROUPS.flatMap((group) => group.items.map((item) => item.id)),
    [
      "adults",
      "children",
      "household-state",
      "routines",
      "medications",
      "events",
      "notifications",
    ],
  );
});

test("settings history uses stable hashes for the index and focused screens", () => {
  assert.deepEqual(parseSettingsHash("#configuracoes"), { kind: "index" });
  assert.deepEqual(parseSettingsHash("#configuracoes/children"), {
    kind: "screen",
    screen: "children",
  });
  assert.deepEqual(parseSettingsHash("#other"), { kind: "closed" });
  assert.equal(settingsHash({ kind: "closed" }), "");
  assert.equal(settingsHash({ kind: "index" }), "#configuracoes");
  assert.equal(
    settingsHash({ kind: "screen", screen: "household-state" }),
    "#configuracoes/household-state",
  );
});
