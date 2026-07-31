import { test } from "node:test";
import assert from "node:assert/strict";
import {
  membershipMissingCopy,
  medicationSchemaMissingCopy,
  schemaMissingCopy,
} from "../../src/lib/household/setup-home.ts";

const PROVIDER = /Supabase|VAPID|Gmail|Cloudflare|GitHub|SMTP/i;

test("ordinary membership/schema copy never names providers", () => {
  assert.doesNotMatch(membershipMissingCopy(), PROVIDER);
  assert.doesNotMatch(schemaMissingCopy(), PROVIDER);
  assert.doesNotMatch(medicationSchemaMissingCopy(), PROVIDER);
  assert.match(membershipMissingCopy(), /Casa|bootstrap|operação administrativa/i);
  assert.match(schemaMissingCopy(), /servidor|migrations|configuração/i);
});
