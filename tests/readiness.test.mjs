import assert from "node:assert/strict";
import test from "node:test";
import { checkReadiness } from "../src/lib/readiness.ts";

test("readiness requires configuration and reachable storage", async () => {
  let checked = false;
  assert.equal(await checkReadiness({ configured: false, checkStorage: async () => { checked = true; } }), false);
  assert.equal(checked, false);
  assert.equal(await checkReadiness({ configured: true, checkStorage: async () => "azure-blob" }), true);
});

test("readiness fails closed on storage errors and timeouts", async () => {
  assert.equal(await checkReadiness({ configured: true, checkStorage: async () => { throw new Error("Unavailable"); } }), false);
  assert.equal(await checkReadiness({ configured: true, checkStorage: () => new Promise(() => {}), timeoutMs: 10 }), false);
});