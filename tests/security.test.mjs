import test from "node:test";
import assert from "node:assert/strict";
import { NextRequest } from "next/server";
import { middleware } from "../src/middleware.ts";
import { assertOrigin } from "../src/lib/api.ts";
import { effectiveRole } from "../src/lib/identity.ts";
import { isLocalMode, isPublicDemoMode, getRepository } from "../src/lib/repository.ts";
import { getActor } from "../src/lib/identity.ts";
import { isLoopbackHost, isLoopbackRequest } from "../src/lib/local-access.ts";

test("production never enables local identities, even if DEMO_MODE is set", async () => {
  const original = { node: process.env.NODE_ENV, demo: process.env.DEMO_MODE, storage: process.env.AZURE_STORAGE_ACCOUNT };
  try {
    process.env.NODE_ENV = 'production'; process.env.DEMO_MODE = 'true'; delete process.env.AZURE_STORAGE_ACCOUNT;
    assert.equal(isLocalMode(), false);
    assert.throws(() => getRepository(), /Configure Azure Storage/);
    const api = await middleware(new NextRequest('http://localhost:3001/api/agents'));
    assert.equal(api.status, 401);
    const page = await middleware(new NextRequest('http://localhost:3001/admin'));
    assert.equal(page.status, 307);
    assert.ok(page.headers.get('location').includes('/login'));
  } finally {
    for (const [name, value] of Object.entries({ NODE_ENV: original.node, DEMO_MODE: original.demo, AZURE_STORAGE_ACCOUNT: original.storage })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test("state changes require the configured application origin", () => {
  const original = process.env.NEXTAUTH_URL;
  try {
    process.env.NEXTAUTH_URL = 'https://marketplace.example';
    assert.throws(() => assertOrigin(new Request('https://marketplace.example/api', { method: 'POST', headers: { origin: 'https://untrusted.example' } })), /Cross-origin/);
    assert.throws(() => assertOrigin(new Request('https://marketplace.example/api', { method: 'POST' })), /Cross-origin/);
    assert.doesNotThrow(() => assertOrigin(new Request('https://marketplace.example/api', { method: 'POST', headers: { origin: 'https://marketplace.example' } })));
  } finally { if (original === undefined) delete process.env.NEXTAUTH_URL; else process.env.NEXTAUTH_URL = original; }
});

test("development identity rejects public hosts and forwarded remote hosts", () => {
  for (const host of ['localhost:3000', '127.0.0.1:3107', '[::1]:3000']) {
    assert.equal(isLoopbackHost(host), true);
    assert.equal(isLoopbackRequest(new Headers({ host })), true);
  }
  for (const host of [null, 'marketplace.example', 'localhost.example', 'localhost@untrusted.example', 'localhost:3107/path', 'localhost,marketplace.example']) assert.equal(isLoopbackHost(host), false);
  assert.equal(isLoopbackRequest(new Headers({ host: 'localhost:3000', 'x-forwarded-host': 'marketplace.example' })), false);
});

test("roles require a matching user or verified group; Entra admins retain recovery access", () => {
  const actor = { id: 'user', role: 'reader', groups: ['publishers'] };
  const assignments = [{ id: 'publishers', subjectType: 'group', role: 'publisher' }, { id: 'other-user', subjectType: 'user', role: 'admin' }];
  assert.equal(effectiveRole(actor, assignments), 'publisher');
  assert.equal(effectiveRole({ ...actor, groups: [] }, assignments), 'reader');
  assert.equal(effectiveRole({ ...actor, role: 'admin' }, [{ id: 'user', subjectType: 'user', role: 'reader' }]), 'admin');
});

test("public demo bypasses login with a shared reader but never enables local mode", async () => {
  const original = { node: process.env.NODE_ENV, publicDemo: process.env.PUBLIC_DEMO_MODE, tenant: process.env.DEMO_TENANT_ID };
  try {
    process.env.NODE_ENV = "production"; process.env.PUBLIC_DEMO_MODE = "true"; process.env.DEMO_TENANT_ID = "public-demo-test";
    assert.equal(isPublicDemoMode(), true); assert.equal(isLocalMode(), false);
    assert.equal((await middleware(new NextRequest("https://demo.example/community"))).status, 200);
    const actor = await getActor();
    assert.equal(actor.role, "reader"); assert.equal(actor.tenantId, "public-demo-test"); assert.equal(actor.local, false);
  } finally {
    for (const [name, value] of Object.entries({ NODE_ENV: original.node, PUBLIC_DEMO_MODE: original.publicDemo, DEMO_TENANT_ID: original.tenant })) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});