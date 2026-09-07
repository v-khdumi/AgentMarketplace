import test from "node:test";
import assert from "node:assert/strict";
import { normalizePackage, packageAvailableTo, CATALOG_PATH, GRAPH_ROOT } from "../src/lib/integrations.ts";

test("registry only admits Agent Builder and Copilot Studio, never generic apps", () => {
  assert.equal(normalizePackage({ id: 'app', platform: 'web', elementTypes: ['Bots'] }), null);
  assert.equal(normalizePackage({ id: 'agent', platform: 'Custom engine' }), null);
  assert.equal(normalizePackage({ id: 'builder', platform: 'Microsoft 365 Copilot Agent Builder' }).platform, 'Microsoft 365 Copilot Agent Builder');
  assert.equal(normalizePackage({ id: 'studio', platform: 'Copilot Studio' }).platform, 'Copilot Studio');
  assert.equal(GRAPH_ROOT, 'https://graph.microsoft.com/v1.0');
  assert.equal(CATALOG_PATH, '/copilot/admin/catalog/packages');
});

test("inventory presence alone does not imply availability to an individual", () => {
  const entry = normalizePackage({ id: 'studio', platform: 'Copilot Studio', availableTo: 'some', allowedUsersAndGroups: [{resourceId: 'group', resourceType: 'group'}] });
  assert.equal(packageAvailableTo(entry, { id: 'reader', groups: [] }), false);
  assert.equal(packageAvailableTo(entry, { id: 'reader', groups: ['group'] }), true);
  assert.equal(packageAvailableTo({ ...entry, isBlocked: true, availableTo: 'all' }, { id: 'reader', groups: ['group'] }), false);
});