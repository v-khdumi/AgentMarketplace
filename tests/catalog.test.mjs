import test from "node:test";
import assert from "node:assert/strict";
import { filterCatalog } from "../src/lib/presentation.ts";

const agents = [
  { id: 'builder', name: 'Meeting Insights', summary: 'Meeting preparation', platform: 'agent-builder', category: 'productivity', ownerName: 'Workplace', tags: ['Teams'], updatedAt: '2026-09-01', hasLaunchUrl: true, requestAccess: false, downloadable: false, saved: false },
  { id: 'studio', name: 'Helpdesk', summary: 'Support', platform: 'copilot-studio', category: 'it', ownerName: 'IT', tags: [], updatedAt: '2026-09-02', hasLaunchUrl: true, requestAccess: true, downloadable: true, saved: true },
];
const filters = { query: '', category: '', platform: '', access: 'all', saved: false, sort: 'updated' };
test('platforms, Teams, Romanian categories and saved/download filters work', () => {
  assert.deepEqual(filterCatalog(agents, { ...filters, query: 'Copilot Studio' }).map(agent => agent.id), ['studio']);
  assert.deepEqual(filterCatalog(agents, { ...filters, query: 'Teams' }).map(agent => agent.id), ['builder']);
  assert.deepEqual(filterCatalog(agents, { ...filters, category: 'it' }).map(agent => agent.id), ['studio']);
  assert.deepEqual(filterCatalog(agents, { ...filters, query: 'productivitate' }).map(agent => agent.id), ['builder']);
  assert.deepEqual(filterCatalog(agents, { ...filters, access: 'download', saved: true }).map(agent => agent.id), ['studio']);
});