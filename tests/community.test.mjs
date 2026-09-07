import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MarketplaceRepository } from "../src/lib/repository.ts";
import { CommunityService } from "../src/lib/community.ts";
import { MarketplaceService } from "../src/lib/marketplace.ts";
import { newDraft } from "../src/lib/contracts.ts";
import { dispatchNotifications } from "../src/lib/notification-delivery.ts";

const actor = (id, role = "reader", guest = false) => ({ id, role, guest, tenantId: "community-tenant", name: id, email: `${id}@example.test`, groups: [], local: false });
const member = actor("member"), guest = actor("guest", "reader", true), admin = actor("admin", "admin");
const profile = { headline: "Copilot creator", bio: "I build internal agents.", skills: ["Copilot Studio"], audience: "members", published: true };
const creator = actor("creator", "publisher"), reviewer = actor("reviewer", "reviewer");
const idea = { kind: "idea", agentId: "", title: "Automate policy lookup", body: "Help colleagues find the approved policy documents.", category: "productivity", audience: "members" };

async function publishedAgent(service, guestVisible = false) {
  const marketplace = new MarketplaceService(service.repository); const draft = newDraft();
  Object.assign(draft, { name: "Community test agent", summary: "Test agent", description: "Original description", instructions: "Original configuration", license: "Microsoft 365 Copilot" });
  draft.distribution.launchUrl = "https://m365.cloud.microsoft/chat/agents/community"; draft.distribution.guestVisible = guestVisible;
  let record = await marketplace.save(creator, draft);
  record = await marketplace.submit(creator, record.id, record.revision);
  return marketplace.review(reviewer, record.id, record.revision, "approve", "Reviewed");
}

async function fixture(run) {
  const directory = await mkdtemp(path.join(tmpdir(), "marketplace-community-"));
  try { await run(new CommunityService(new MarketplaceRepository({ directory })), directory); }
  finally { await rm(directory, { recursive: true, force: true }); }
}

test("community profiles persist without exposing member profiles or email to guests", () => fixture(async (service, directory) => {
  assert.equal((await service.profile(member, member.id)).published, false);
  const saved = await service.saveProfile(member, profile, 0);
  const reopened = new CommunityService(new MarketplaceRepository({ directory }));
  assert.equal((await reopened.profile(member, member.id)).headline, profile.headline);
  assert.equal("email" in (await reopened.profile(member, member.id)), false);
  assert.equal((await service.profiles(guest)).length, 0);
  await assert.rejects(service.profile(guest, member.id), /not found/);
  await assert.rejects(service.saveProfile(member, profile, 0), /changed/);
  await service.saveProfile(member, { ...profile, audience: "all" }, saved.revision);
  assert.equal((await service.profiles(guest)).length, 1);
  assert.equal((await service.profiles({ ...member, tenantId: "other-tenant" })).length, 0);
}));

test("community policy denies unauthorized changes and guest participation by default", () => fixture(async (service) => {
  const original = await service.policy(admin);
  await assert.rejects(service.savePolicy(member, original.policy, original.revision), /Administrator/);
  await assert.rejects(service.saveProfile(guest, profile, 0), /Guest participation/);
  await service.savePolicy(admin, { ...original.policy, allowGuestParticipation: true }, original.revision);
  await service.saveProfile(guest, { ...profile, audience: "all" }, 0);
  const current = await service.policy(admin);
  await service.savePolicy(admin, { ...current.policy, enabled: false }, current.revision);
  await assert.rejects(service.profiles(member), /closed/);
}));

test("agent details link only to published creator profiles visible to the viewer", () => fixture(async (service) => {
  const record = await publishedAgent(service, true); const marketplace = new MarketplaceService(service.repository);
  assert.equal((await marketplace.detail(member, record.id)).community.ownerProfileId, undefined);
  const published = await service.saveProfile(creator, profile, 0);
  assert.equal((await marketplace.detail(member, record.id)).community.ownerProfileId, creator.id);
  assert.equal((await marketplace.detail(guest, record.id)).community.ownerProfileId, undefined);
  await service.saveProfile(creator, { ...profile, audience: "all" }, published.revision);
  assert.equal((await marketplace.detail(guest, record.id)).community.ownerProfileId, creator.id);
  const policy = await service.policy(admin); await service.savePolicy(admin, { ...policy.policy, enabled: false }, policy.revision);
  assert.equal((await marketplace.detail(member, record.id)).community.enabled, false);
  assert.equal((await marketplace.detail(member, record.id)).community.ownerProfileId, undefined);
}));

test("discussion audience follows the published agent and only permitted authors can accept answers", () => fixture(async (service) => {
  const record = await publishedAgent(service);
  await assert.rejects(service.createTopic(member, { ...idea, kind: "discussion", agentId: record.id, audience: "all" }), /internal members/);
  const topic = await service.createTopic(member, { ...idea, kind: "discussion", agentId: record.id });
  await assert.rejects(service.topic(guest, topic.id), /not found/);
  const reply = await service.reply(creator, topic.id, { body: "Use the approved document library." });
  let current = await service.topic(member, topic.id);
  await assert.rejects(service.acceptReply(actor("other"), topic.id, reply.id, current.topic.revision), /must accept/);
  await service.acceptReply(member, topic.id, reply.id, current.topic.revision);
  current = await service.topic(member, topic.id);
  assert.equal(current.topic.acceptedReplyId, reply.id);
  await service.editReply(creator, reply.id, reply.revision, { body: "Use the revised document library." });
  assert.equal((await service.topic(member, topic.id)).topic.acceptedReplyId, "");
  await new MarketplaceService(service.repository).changeState(creator, record.id, record.revision, "archive");
  assert.equal((await service.topics(member)).length, 0);
  await assert.rejects(service.reply(member, topic.id, { body: "Another question" }), /not found/);
}));

test("ideas have one reversible vote per member and controlled ownership and completion", () => fixture(async (service) => {
  const topic = await service.createTopic(member, idea);
  await service.vote(member, topic.id, true); await service.vote(member, topic.id, true);
  assert.equal((await service.topic(member, topic.id)).topic.voteCount, 1);
  assert.equal("votes" in (await service.topic(member, topic.id)).topic, false);
  await service.vote(member, topic.id, false);
  assert.equal((await service.topic(member, topic.id)).topic.voteCount, 0);
  await assert.rejects(service.progressIdea(member, topic.id, { state: "in-progress", note: "I will build it", linkedAgentId: "" }, topic.revision), /assigned creator/);
  const assigned = await service.progressIdea(creator, topic.id, { state: "in-progress", note: "I will build it", linkedAgentId: "" }, topic.revision);
  await assert.rejects(service.progressIdea(actor("other", "publisher"), topic.id, { state: "in-progress", note: "Another claim", linkedAgentId: "" }, assigned.revision), /assigned creator/);
  await assert.rejects(service.progressIdea(creator, topic.id, { state: "available", note: "It is ready", linkedAgentId: "" }, assigned.revision), /published agent/);
  const record = await publishedAgent(service);
  const completed = await service.progressIdea(creator, topic.id, { state: "available", note: "Published and reviewed", linkedAgentId: record.id }, assigned.revision);
  assert.equal(completed.state, "available"); assert.equal(completed.linkedAgentId, record.id);
}));

test("team membership is voluntary and does not grant marketplace roles", () => fixture(async (service) => {
  let team = await service.saveTeam(creator, { name: "Copilot makers", description: "Creators exchanging practical experience.", skills: ["Agent Builder"], audience: "members" });
  await assert.rejects(service.joinTeam(guest, team.id, true), /Guest participation/);
  team = await service.joinTeam(member, team.id, true);
  assert.equal(team.members.length, 2);
  assert.equal((await service.repository.read(member.tenantId)).assignments.length, 0);
  await assert.rejects(service.joinTeam(creator, team.id, false), /Transfer/);
  team = await service.manageTeam(creator, team.id, team.revision, member.id, false);
  const edited = await service.saveTeam(member, { name: "Copilot makers", description: "A community team with a new responsible owner.", skills: [], audience: "members" }, team.id, team.revision);
  assert.equal(edited.ownerId, member.id);
  await service.joinTeam(creator, team.id, false);
  await assert.rejects(service.saveTeam(member, { name: "Copilot makers", description: "Public team description", skills: [], audience: "all" }, team.id, edited.revision + 1), /audience/);
}));

test("reported content is hidden by moderators, never by readers, with audit and reversible decisions", () => fixture(async (service) => {
  const topic = await service.createTopic(creator, idea);
  const report = await service.report(member, "topic", topic.id, "This needs an internal confidentiality review.");
  await assert.rejects(service.report(member, "topic", topic.id, "The same unresolved concern again."), /already reported/);
  await assert.rejects(service.reports(member), /Moderator/);
  await assert.rejects(service.moderate(member, report.id, 1, "hide", "Hide this pending review."), /Moderator/);
  const resolved = await service.moderate(reviewer, report.id, 1, "hide", "Contains material requiring review.");
  assert.equal((await service.topics(member)).length, 0);
  await assert.rejects(service.reply(member, topic.id, { body: "Can I respond?" }), /not found/);
  assert.equal((await service.inbox(creator)).items[0].event, "content-moderated");
  await service.moderate(reviewer, report.id, resolved.revision, "restore", "The owner provided permission to share.");
  assert.equal((await service.topics(member)).length, 1);
  assert.ok((await service.repository.read(member.tenantId)).audit.some(entry => entry.action === "community-moderation-hide"));
}));

test("subscriptions produce private notifications and revoking visibility removes stale inbox links", () => fixture(async (service) => {
  const topic = await service.createTopic(member, idea);
  await service.follow(creator, { kind: "topic", id: topic.id }, true);
  await service.reply(creator, topic.id, { body: "I can help build this." });
  const inbox = await service.inbox(member); assert.equal(inbox.unread, 1);
  await service.readNotifications(creator, inbox.items.map(entry => entry.id));
  assert.equal((await service.inbox(member)).unread, 1);
  await service.readNotifications(member, inbox.items.map(entry => entry.id));
  assert.equal((await service.inbox(member)).unread, 0);
  await service.follow(member, { kind: "topic", id: topic.id }, false);
  await service.reply(creator, topic.id, { body: "Another update after unsubscribing." });
  assert.equal((await service.inbox(member)).items.length, 1);
  const current = await service.topic(member, topic.id); await service.removeTopic(member, topic.id, current.topic.revision);
  assert.equal((await service.inbox(member)).items.length, 0);
}));

test("notification outbox records provider failures and prevents duplicate concurrent dispatch", () => fixture(async (service) => {
  const topic = await service.createTopic(member, idea);
  await service.repository.update(member.tenantId, state => { state.community.preferences[member.id] = { email: true, teams: false }; });
  await service.reply(creator, topic.id, { body: "A queued update." });
  let calls = 0;
  const provider = async () => { calls++; throw new Error("Provider unavailable"); };
  await Promise.all([dispatchNotifications(member.tenantId, service.repository, provider), dispatchNotifications(member.tenantId, service.repository, provider)]);
  assert.equal(calls, 1);
  let state = await service.repository.read(member.tenantId);
  assert.equal(state.community.deliveries[0].state, "failed");
  await service.repository.update(member.tenantId, document => { document.community.deliveries[0].nextAttemptAt = ""; });
  const result = await dispatchNotifications(member.tenantId, service.repository, async () => { calls++; });
  assert.equal(result.sent, 1); state = await service.repository.read(member.tenantId);
  assert.equal(state.community.deliveries[0].attempts, 2);
  assert.equal(state.community.deliveries[0].state, "sent");
}));

test("queued notifications recheck audience, read state and channel opt-out before sending", () => fixture(async (service) => {
  const policy = await service.policy(admin); await service.savePolicy(admin, { ...policy.policy, allowGuestParticipation: true }, policy.revision);
  const topic = await service.createTopic(member, { ...idea, audience: "all" });
  await service.follow(guest, { kind: "topic", id: topic.id }, true);
  await service.repository.update(member.tenantId, state => {
    state.community.preferences[member.id] = { email: true, teams: false };
    state.community.preferences[guest.id] = { email: true, teams: false };
  });
  await service.reply(creator, topic.id, { body: "First update." });
  await service.reply(creator, topic.id, { body: "Second update." });
  const report = await service.report(creator, "topic", topic.id, "Contains internal-only documents.");
  await service.moderate(reviewer, report.id, 1, "hide", "Hidden pending a confidentiality review.");
  const calls = [];
  await dispatchNotifications(member.tenantId, service.repository, async message => calls.push(message));
  assert.equal(calls.some(message => message.email === guest.email), false);
  assert.equal(calls.length, 1);
  assert.equal((await service.repository.read(member.tenantId)).community.deliveries.filter(entry => entry.state === "cancelled").length, 4);
  const currentReport = (await service.reports(reviewer))[0];
  await service.moderate(reviewer, report.id, currentReport.revision, "restore", "Content is now approved for sharing.");
  await service.reply(creator, topic.id, { body: "Third update." });
  let delivered = 0;
  await dispatchNotifications(member.tenantId, service.repository, async () => {
    delivered++;
    await service.preferences(member, { email: false, teams: false });
    await service.preferences(guest, { email: false, teams: false });
  });
  assert.equal(delivered, 1);
}));

test("review notifications retain reviewer authorization during external delivery", () => fixture(async (service) => {
  const marketplace = new MarketplaceService(service.repository); await marketplace.state(reviewer);
  await service.repository.update(reviewer.tenantId, state => { state.community.preferences[reviewer.id] = { email: true, teams: false }; });
  const draft = newDraft(); Object.assign(draft, { name: "Review notification agent", summary: "Review queue notification", description: "Complete description", instructions: "Complete instructions", license: "Microsoft 365 Copilot" }); draft.distribution.launchUrl = "https://m365.cloud.microsoft/chat/agents/review";
  const record = await marketplace.save(creator, draft); await marketplace.submit(creator, record.id, record.revision);
  const sent = [];
  const result = await dispatchNotifications(reviewer.tenantId, service.repository, async message => sent.push(message));
  assert.equal(result.sent, 1); assert.equal(sent[0].email, reviewer.email);
}));