import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MarketplaceRepository } from "../src/lib/repository.ts";
import { MarketplaceService } from "../src/lib/marketplace.ts";
import { newDraft } from "../src/lib/contracts.ts";

const actor = (id, role = "reader", extra = {}) => ({ id, role, tenantId: "tenant", name: id, email: `${id}@example.com`, groups: [], local: false, guest: false, ...extra });
const author = actor("publisher", "publisher"), reviewer = actor("reviewer", "reviewer"), admin = actor("admin", "admin"), reader = actor("reader");
function completeDraft() {
  const draft = newDraft();
  Object.assign(draft, { name: "A real agent", summary: "Find approved documents", description: "Original description", instructions: "  Original prompt\n", license: "Microsoft 365 Copilot" });
  draft.distribution.launchUrl = "https://m365.cloud.microsoft/chat/agents/example";
  return draft;
}

test("publish, revise and review without exposing or losing the approved version", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "marketplace-flow-"));
  try {
    const service = new MarketplaceService(new MarketplaceRepository({ directory }));
    await assert.rejects(service.save(reader, completeDraft()), /Publisher permission/);
    let record = await service.save(author, completeDraft());
    assert.equal((await service.list(reader)).length, 0);
    record = await service.submit(author, record.id, record.revision);
    await assert.rejects(service.review(author, record.id, record.revision, "approve", ""));
    record = await service.review(reviewer, record.id, record.revision, "approve", "Reviewed");
    assert.equal((await service.list(reader)).length, 1);
    assert.equal("instructions" in (await service.list(reader))[0], false);
    assert.equal((await service.detail(reader, record.id)).configuration.instructions, "  Original prompt\n");
    const updated = { ...completeDraft(), instructions: "New revision" };
    record = await service.save(author, updated, record.id, record.revision);
    assert.equal((await service.detail(reader, record.id)).configuration.instructions, "  Original prompt\n");
    await assert.rejects(service.save(author, updated, record.id, record.revision - 1), /changed/);
    record = await service.submit(author, record.id, record.revision);
    record = await service.review(reviewer, record.id, record.revision, "request-changes", "Add details");
    assert.equal(record.state, "changes-requested");
    assert.equal((await service.detail(author, record.id, { draft: true })).record.reviewNote, "Add details");
    record = await service.save(author, { ...updated, name: "Renamed agent" }, record.id, record.revision);
    record = await service.submit(author, record.id, record.revision);
    record = await service.review(reviewer, record.id, record.revision, "approve", "Reviewed again");
    const historical = await service.detail(reader, record.id, { version: 1 });
    assert.equal(historical.summary.name, "A real agent");
    assert.equal(historical.summary.version, 1);
    assert.equal((await service.list(actor("other", "reader", { tenantId: "other-tenant" }))).length, 0);
    assert.ok((await service.state(admin)).audit.some(entry => entry.action === "agent-published"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("access approval is not runtime access until sharing is confirmed; guest config is protected", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "marketplace-access-"));
  try {
    const service = new MarketplaceService(new MarketplaceRepository({ directory }));
    const draft = completeDraft(); draft.distribution.guestVisible = true;
    let record = await service.save(author, draft);
    record = await service.submit(author, record.id, record.revision);
    record = await service.review(reviewer, record.id, record.revision, "approve", "Reviewed");
    const guest = actor("guest", "reader", { guest: true });
    assert.equal((await service.detail(guest, record.id)).configuration, null);
    await assert.rejects(service.detail(reader, record.id, { draft: true }), /Configuration/);
    let request = await service.requestAccess(reader, record.id, "I need this for monthly reporting");
    request = await service.decideAccess(author, request.id, request.revision, "approve", "Approved");
    assert.equal((await service.detail(reader, record.id)).access.state, "approved");
    assert.equal((await service.detail(reader, record.id)).access.launchUrl, "");
    await assert.rejects(service.decideAccess(reader, request.id, request.revision, "fulfill", "Shared"), /owner/);
    request = await service.decideAccess(author, request.id, request.revision, "fulfill", "Shared with the requester in Microsoft 365");
    assert.equal((await service.detail(reader, record.id)).access.state, "available");
    await service.decideAccess(author, request.id, request.revision, "revoke", "Access removed in Microsoft 365");
    assert.equal((await service.detail(reader, record.id)).access.state, "request-required");
    const state = await service.state(admin);
    await service.settings(admin, { ...state.settings, allowGuests: false }, state.settingsRevision);
    await assert.rejects(service.list(guest), /Guest access/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("reviewers can inspect unpublished attachments but readers cannot", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "marketplace-review-file-"));
  try {
    const service = new MarketplaceService(new MarketplaceRepository({ directory }));
    const file = { id: "review-icon", ownerId: author.id, kind: "icon", name: "icon.png", mime: "image/png", bytes: 30, width: 192, height: 192, sha256: "test", createdAt: new Date().toISOString() };
    await service.registerFile(author, file);
    const record = await service.save(author, { ...completeDraft(), iconId: file.id });
    await service.submit(author, record.id, record.revision);
    assert.equal((await service.artifact(reviewer, file.id)).id, file.id);
    await assert.rejects(service.artifact(reader, file.id), /not permitted/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});