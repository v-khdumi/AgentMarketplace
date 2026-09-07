import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { api, ApiError } from "../src/lib/client.ts";

test("API client distinguishes valid responses, failures and malformed successes", async (context) => {
  const fetchMock = context.mock.method(globalThis, "fetch", async () => Response.json({ data: { saved: true } }));
  assert.deepEqual(await api("agents"), { saved: true });
  fetchMock.mock.mockImplementation(async () => Response.json({ error: "Permission denied" }, { status: 403 }));
  await assert.rejects(api("agents"), error => error instanceof ApiError && error.status === 403 && error.message === "Permission denied");
  fetchMock.mock.mockImplementation(async () => Response.json({ unexpected: true }));
  await assert.rejects(api("agents"), /unexpected response/);
  fetchMock.mock.mockImplementation(async () => new Response("Invalid JSON"));
  await assert.rejects(api("agents"), /unexpected response/);
});

test("API client times out a stalled request and preserves cancellation", async (context) => {
  context.mock.method(globalThis, "fetch", async (_, { signal }) => new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(signal.reason), { once: true });
  }));
  await Promise.all([assert.rejects(api("agents", { timeoutMs: 10 }), error => error.name === "TimeoutError"), delay(20)]);
  const controller = new AbortController();
  const request = api("agents", { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, error => error.name === "AbortError");
});