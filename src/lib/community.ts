import { randomUUID } from "node:crypto";
import type { Actor, StoreDocument } from "./contracts";
import { z } from "zod";
import { communityPolicySchema, profileSchema, topicSchema, replySchema, teamSchema, ideaStates, type Audience, type CommunityProfile, type CommunityTopic, type CommunityReply, type CommunityTeam, type CommunityTarget, type CommunityReport, type CommunityNotification, type TopicView, type TopicDetail, type NotificationInbox, type NotificationView } from "./community-contracts";
import { communityState, followers, notify, rememberRecipient, subscribe } from "./community-events";
import { notificationChannels } from "./notification-config";
import { getRepository, isPublicDemoMode, type MarketplaceRepository } from "./repository";
import { assertRevision, WorkflowError } from "./workflow";

export const communityModerator = (actor: Actor) => !actor.guest && ["admin", "reviewer"].includes(actor.role);
export const audienceAllows = (audience: Audience, actor: Actor) => !actor.guest || audience === "all";
const now = () => new Date().toISOString();
const audit = (state: StoreDocument, actor: Actor, action: string, subjectId: string, detail = "") => state.audit.push({ id: randomUUID(), at: now(), actorId: actor.id, actorName: actor.name, action, subjectId, detail });

export class CommunityService {
  constructor(readonly repository: MarketplaceRepository = getRepository()) {}

  private allow(state: StoreDocument, actor: Actor, write = false) {
    if (actor.guest && !state.settings.allowGuests) throw new WorkflowError("Guest access is disabled by the administrator.", 403);
    const community = communityState(state);
    if (!community.policy.enabled && !communityModerator(actor)) throw new WorkflowError("The community is currently closed.", 403);
    if (write && actor.guest && !community.policy.allowGuestParticipation) throw new WorkflowError("Guest participation is disabled. You can read shared community content.", 403);
    return community;
  }

  async policy(actor: Actor) {
    const state = await this.repository.read(actor.tenantId);
    const community = this.allow(state, actor);
    return { policy: community.policy, revision: community.policyRevision, canModerate: !isPublicDemoMode() && communityModerator(actor), canParticipate: !isPublicDemoMode() && community.policy.enabled && (!actor.guest || community.policy.allowGuestParticipation) };
  }

  async savePolicy(actor: Actor, input: unknown, expected: number) {
    if (actor.guest || actor.role !== "admin") throw new WorkflowError("Administrator permission is required.", 403);
    const policy = communityPolicySchema.parse(input);
    return this.repository.update(actor.tenantId, (state) => {
      const community = communityState(state);
      assertRevision(community.policyRevision, expected);
      community.policy = policy; community.policyRevision++;
      audit(state, actor, "community-policy-updated", "community");
      return { policy, revision: community.policyRevision };
    });
  }

  async profiles(actor: Actor) {
    const state = await this.repository.read(actor.tenantId);
    return this.allow(state, actor).profiles.filter(profile => profile.published && !profile.hidden && audienceAllows(profile.audience, actor));
  }

  async profile(actor: Actor, id: string) {
    const state = await this.repository.read(actor.tenantId);
    const profile = this.allow(state, actor).profiles.find(entry => entry.id === id);
    if (!profile && id === actor.id) return { id, name: actor.name, guest: actor.guest, headline: "", bio: "", skills: [], audience: "members" as const, published: false, hidden: false, revision: 0, updatedAt: "" };
    if (!profile || (profile.id !== actor.id && (!profile.published || profile.hidden || !audienceAllows(profile.audience, actor)))) throw new WorkflowError("Community profile not found.", 404);
    return profile;
  }

  async saveProfile(actor: Actor, input: unknown, expected: number) {
    const values = profileSchema.parse(input);
    return this.repository.update(actor.tenantId, (state) => {
      const community = this.allow(state, actor, true);
      const previous = community.profiles.find(profile => profile.id === actor.id);
      assertRevision(previous?.revision ?? 0, expected);
      const profile: CommunityProfile = { ...values, id: actor.id, name: actor.name, guest: actor.guest, revision: (previous?.revision ?? 0) + 1, updatedAt: now(), hidden: previous?.hidden ?? false };
      community.profiles = [...community.profiles.filter(entry => entry.id !== actor.id), profile];
      rememberRecipient(state, actor);
      audit(state, actor, "community-profile-updated", actor.id);
      return profile;
    });
  }

  private agentVisible(state: StoreDocument, actor: Actor, id: string) {
    return state.agents.some(agent => agent.id === id && agent.state !== "archived" && agent.versions.length > 0 && (!actor.guest || agent.versions.at(-1)!.draft.distribution.guestVisible));
  }

  private topicVisible(state: StoreDocument, actor: Actor, topic: CommunityTopic, includeOwnHidden = false) {
    return !topic.deleted && audienceAllows(topic.audience, actor) && (!topic.agentId || this.agentVisible(state, actor, topic.agentId)) && (!topic.hidden || (includeOwnHidden && (topic.authorId === actor.id || communityModerator(actor))));
  }

  private findTopic(state: StoreDocument, actor: Actor, id: string, includeOwnHidden = false) {
    const topic = communityState(state).topics.find(entry => entry.id === id);
    if (!topic || !this.topicVisible(state, actor, topic, includeOwnHidden)) throw new WorkflowError("Discussion not found.", 404);
    return topic;
  }

  private viewTopic(state: StoreDocument, actor: Actor, topic: CommunityTopic): TopicView {
    const { votes, ...content } = topic;
    const community = communityState(state);
    return { ...content, voteCount: votes.length, voted: votes.includes(actor.id), replyCount: community.replies.filter(reply => reply.topicId === topic.id && !reply.hidden && !reply.deleted).length, following: followers(state, { kind: "topic", id: topic.id }).includes(actor.id), canEdit: topic.authorId === actor.id && !topic.hidden && !topic.deleted, canAccept: topic.kind === "discussion" && (topic.authorId === actor.id || state.agents.some(agent => agent.id === topic.agentId && agent.ownerId === actor.id) || communityModerator(actor)), canManage: topic.kind === "idea" && !actor.guest && (communityModerator(actor) || (actor.role !== "reader" && (!topic.assigneeId || topic.assigneeId === actor.id))) };
  }

  async topics(actor: Actor, options: { kind?: "discussion" | "idea"; agentId?: string; mine?: boolean } = {}) {
    const state = await this.repository.read(actor.tenantId); const community = this.allow(state, actor);
    return community.topics.filter(topic => this.topicVisible(state, actor, topic, options.mine) && (!options.kind || topic.kind === options.kind) && (!options.agentId || topic.agentId === options.agentId) && (!options.mine || topic.authorId === actor.id)).map(topic => this.viewTopic(state, actor, topic)).sort((first, second) => second.updatedAt.localeCompare(first.updatedAt));
  }

  async topic(actor: Actor, id: string): Promise<TopicDetail> {
    const state = await this.repository.read(actor.tenantId); const community = this.allow(state, actor); const topic = this.findTopic(state, actor, id, true);
    return { topic: this.viewTopic(state, actor, topic), replies: community.replies.filter(reply => reply.topicId === id && !reply.deleted && (!reply.hidden || reply.authorId === actor.id || communityModerator(actor))).map(reply => ({ ...reply, canEdit: reply.authorId === actor.id && !reply.hidden && !topic.hidden })) };
  }

  async createTopic(actor: Actor, input: unknown) {
    const values = topicSchema.parse(input);
    return this.repository.update(actor.tenantId, (state) => {
      const community = this.allow(state, actor, true);
      if (values.kind === "discussion" && (!values.agentId || !this.agentVisible(state, actor, values.agentId))) throw new WorkflowError("Select a published agent you can access.", 422);
      if (values.kind === "idea" && values.agentId) throw new WorkflowError("Ideas cannot impersonate published agents.", 422);
      if (values.agentId && values.audience === "all" && !state.agents.find(agent => agent.id === values.agentId)!.versions.at(-1)!.draft.distribution.guestVisible) throw new WorkflowError("This agent is available to internal members only.", 422);
      if (actor.guest && values.audience !== "all") throw new WorkflowError("Guests can contribute only to content shared with guests.", 403);
      const timestamp = now();
      const topic: CommunityTopic = { ...values, id: randomUUID(), authorId: actor.id, authorName: actor.name, revision: 1, createdAt: timestamp, updatedAt: timestamp, hidden: false, deleted: false, acceptedReplyId: "", votes: [], state: "proposed", assigneeId: "", assigneeName: "", linkedAgentId: "", decisionNote: "" };
      community.topics.push(topic); rememberRecipient(state, actor);
      subscribe(state, actor.id, { kind: "topic", id: topic.id }, true);
      notify(state, actor, [...followers(state, { kind: "profile", id: actor.id }), ...(topic.agentId ? followers(state, { kind: "agent", id: topic.agentId }) : [])], "topic-created", { kind: "topic", id: topic.id });
      audit(state, actor, "community-topic-created", topic.id, topic.kind);
      return this.viewTopic(state, actor, topic);
    });
  }

  async editTopic(actor: Actor, id: string, input: unknown, expected: number) {
    const values = z.object({ title: z.string().trim().min(4).max(160), body: z.string().trim().min(10).max(8000) }).strict().parse(input);
    return this.repository.update(actor.tenantId, (state) => {
      this.allow(state, actor, true); const topic = this.findTopic(state, actor, id);
      if (topic.authorId !== actor.id) throw new WorkflowError("Only the author can edit this contribution.", 403);
      assertRevision(topic.revision, expected); Object.assign(topic, values); topic.revision++; topic.updatedAt = now();
      audit(state, actor, "community-topic-edited", id); return this.viewTopic(state, actor, topic);
    });
  }

  async removeTopic(actor: Actor, id: string, expected: number) {
    return this.repository.update(actor.tenantId, (state) => {
      this.allow(state, actor, true); const topic = this.findTopic(state, actor, id, true);
      if (topic.authorId !== actor.id) throw new WorkflowError("Only the author can remove this contribution.", 403);
      assertRevision(topic.revision, expected); topic.deleted = true; topic.revision++; topic.updatedAt = now();
      audit(state, actor, "community-topic-removed", id); return { removed: true };
    });
  }

  async reply(actor: Actor, id: string, input: unknown) {
    const { body } = replySchema.parse(input);
    return this.repository.update(actor.tenantId, (state) => {
      const community = this.allow(state, actor, true); const topic = this.findTopic(state, actor, id);
      const timestamp = now();
      const reply: CommunityReply = { id: randomUUID(), topicId: id, authorId: actor.id, authorName: actor.name, body, revision: 1, createdAt: timestamp, updatedAt: timestamp, hidden: false, deleted: false };
      community.replies.push(reply); topic.updatedAt = timestamp; topic.revision++; rememberRecipient(state, actor);
      notify(state, actor, followers(state, { kind: "topic", id }), "reply-created", { kind: "topic", id });
      subscribe(state, actor.id, { kind: "topic", id }, true);
      audit(state, actor, "community-reply-created", reply.id, id); return reply;
    });
  }

  async editReply(actor: Actor, id: string, expected: number, input: unknown, remove = false) {
    const values = remove ? null : replySchema.parse(input);
    return this.repository.update(actor.tenantId, (state) => {
      const community = this.allow(state, actor, true); const reply = community.replies.find(entry => entry.id === id && !entry.deleted);
      if (!reply || reply.authorId !== actor.id) throw new WorkflowError("Only the author can change this reply.", 403);
      const topic = this.findTopic(state, actor, reply.topicId, remove);
      if (reply.hidden && !remove) throw new WorkflowError("This reply is hidden by a moderator.", 403);
      assertRevision(reply.revision, expected); if (values) reply.body = values.body; reply.deleted = remove; reply.revision++; reply.updatedAt = now();
      if (topic.acceptedReplyId === id) topic.acceptedReplyId = "";
      topic.revision++; topic.updatedAt = now(); audit(state, actor, remove ? "community-reply-removed" : "community-reply-edited", id); return reply;
    });
  }

  async acceptReply(actor: Actor, id: string, replyId: string, expected: number) {
    return this.repository.update(actor.tenantId, (state) => {
      const community = this.allow(state, actor, true); const topic = this.findTopic(state, actor, id);
      if (!this.viewTopic(state, actor, topic).canAccept) throw new WorkflowError("The question author, agent owner or moderator must accept the answer.", 403);
      assertRevision(topic.revision, expected);
      if (replyId && !community.replies.some(reply => reply.id === replyId && reply.topicId === id && !reply.hidden && !reply.deleted)) throw new WorkflowError("Reply not found.", 404);
      topic.acceptedReplyId = replyId; topic.revision++; topic.updatedAt = now();
      if (replyId) notify(state, actor, followers(state, { kind: "topic", id }), "answer-accepted", { kind: "topic", id });
      audit(state, actor, "community-answer-accepted", id, replyId); return this.viewTopic(state, actor, topic);
    });
  }

  async vote(actor: Actor, id: string, voted: boolean) {
    return this.repository.update(actor.tenantId, (state) => {
      this.allow(state, actor, true); const topic = this.findTopic(state, actor, id);
      if (topic.kind !== "idea") throw new WorkflowError("Only ideas accept votes.", 422);
      const votes = new Set(topic.votes); if (voted) votes.add(actor.id); else votes.delete(actor.id); topic.votes = [...votes];
      return { voted, voteCount: votes.size };
    });
  }

  async progressIdea(actor: Actor, id: string, input: unknown, expected: number) {
    const values = z.object({ state: z.enum(ideaStates), note: z.string().trim().min(5).max(2000), linkedAgentId: z.string().max(100) }).strict().parse(input);
    return this.repository.update(actor.tenantId, (state) => {
      this.allow(state, actor, true); const topic = this.findTopic(state, actor, id);
      if (!this.viewTopic(state, actor, topic).canManage) throw new WorkflowError("Only the assigned creator or a moderator can update this idea.", 403);
      assertRevision(topic.revision, expected);
      if (values.state === "declined" && !communityModerator(actor)) throw new WorkflowError("A moderator must decide not to pursue an idea.", 403);
      if (values.state === "available" && (!values.linkedAgentId || !this.agentVisible(state, actor, values.linkedAgentId))) throw new WorkflowError("Link a published agent before marking the idea available.", 422);
      if (values.linkedAgentId && (!this.agentVisible(state, actor, values.linkedAgentId) || (topic.audience === "all" && !state.agents.find(agent => agent.id === values.linkedAgentId)!.versions.at(-1)!.draft.distribution.guestVisible))) throw new WorkflowError("The linked agent must match the idea audience.", 422);
      topic.state = values.state; topic.decisionNote = values.note; topic.linkedAgentId = values.state === "available" ? values.linkedAgentId : "";
      if (values.state === "proposed") { topic.assigneeId = ""; topic.assigneeName = ""; }
      else if (!topic.assigneeId) { topic.assigneeId = actor.id; topic.assigneeName = actor.name; }
      topic.revision++; topic.updatedAt = now();
      notify(state, actor, followers(state, { kind: "topic", id }), "idea-updated", { kind: "topic", id });
      audit(state, actor, "community-idea-updated", id, `${values.state}: ${values.note}`); return this.viewTopic(state, actor, topic);
    });
  }

  private targetVisible(state: StoreDocument, actor: Actor, target: CommunityTarget) {
    const community = communityState(state);
    if (target.kind === "agent") return this.agentVisible(state, actor, target.id);
    if (target.kind === "topic") return community.topics.some(topic => topic.id === target.id && this.topicVisible(state, actor, topic));
    if (target.kind === "profile") return community.profiles.some(profile => profile.id === target.id && profile.published && !profile.hidden && audienceAllows(profile.audience, actor));
    return community.teams.some(team => team.id === target.id && !team.hidden && !team.archived && audienceAllows(team.audience, actor));
  }

  async follow(actor: Actor, target: CommunityTarget, following: boolean) {
    return this.repository.update(actor.tenantId, (state) => {
      this.allow(state, actor);
      if (following && !this.targetVisible(state, actor, target)) throw new WorkflowError("Community content not found.", 404);
      rememberRecipient(state, actor); subscribe(state, actor.id, target, following); return { following };
    });
  }

  async following(actor: Actor, target: CommunityTarget) {
    const state = await this.repository.read(actor.tenantId); this.allow(state, actor);
    if (!this.targetVisible(state, actor, target)) throw new WorkflowError("Community content not found.", 404);
    return { following: followers(state, target).includes(actor.id) };
  }

  async teams(actor: Actor) {
    const state = await this.repository.read(actor.tenantId);
    return this.allow(state, actor).teams.filter(team => !team.hidden && !team.archived && audienceAllows(team.audience, actor));
  }

  async team(actor: Actor, id: string) {
    const state = await this.repository.read(actor.tenantId);
    const team = this.allow(state, actor).teams.find(entry => entry.id === id && !entry.archived && audienceAllows(entry.audience, actor) && (!entry.hidden || entry.ownerId === actor.id || communityModerator(actor)));
    if (!team) throw new WorkflowError("Community team not found.", 404);
    return team;
  }

  async saveTeam(actor: Actor, input: unknown, id?: string, expected = 0) {
    const values = teamSchema.parse(input);
    if (actor.guest || (!id && actor.role === "reader")) throw new WorkflowError("An internal creator must create the team.", 403);
    return this.repository.update(actor.tenantId, (state) => {
      const community = this.allow(state, actor, true); const previous = id ? community.teams.find(team => team.id === id && !team.archived) : undefined;
      if (id && (!previous || (previous.ownerId !== actor.id && actor.role !== "admin"))) throw new WorkflowError("Only the team owner or an administrator can manage this team.", 403);
      assertRevision(previous?.revision ?? 0, expected);
      if (previous && previous.audience !== values.audience) throw new WorkflowError("Create a new team to change its audience. Existing membership must not be disclosed to a new audience.", 422);
      const timestamp = now();
      const team: CommunityTeam = { ...values, id: id ?? randomUUID(), ownerId: previous?.ownerId ?? actor.id, ownerName: previous?.ownerName ?? actor.name, members: previous?.members ?? [{ id: actor.id, name: actor.name }], createdAt: previous?.createdAt ?? timestamp, updatedAt: timestamp, revision: (previous?.revision ?? 0) + 1, hidden: previous?.hidden ?? false, archived: false };
      community.teams = [...community.teams.filter(entry => entry.id !== team.id), team]; rememberRecipient(state, actor);
      if (!previous) subscribe(state, actor.id, { kind: "team", id: team.id }, true);
      else notify(state, actor, followers(state, { kind: "team", id: team.id }), "team-updated", { kind: "team", id: team.id });
      audit(state, actor, previous ? "community-team-updated" : "community-team-created", team.id); return team;
    });
  }

  async joinTeam(actor: Actor, id: string, joined: boolean) {
    return this.repository.update(actor.tenantId, (state) => {
      const community = this.allow(state, actor, true); const team = community.teams.find(entry => entry.id === id);
      if (!team || !this.targetVisible(state, actor, { kind: "team", id })) throw new WorkflowError("Community team not found.", 404);
      if (!joined && team.ownerId === actor.id) throw new WorkflowError("Transfer team ownership before leaving.", 422);
      if (joined === team.members.some(member => member.id === actor.id)) return team;
      team.members = team.members.filter(member => member.id !== actor.id);
      if (joined) team.members.push({ id: actor.id, name: actor.name });
      team.revision++; team.updatedAt = now(); rememberRecipient(state, actor); subscribe(state, actor.id, { kind: "team", id }, joined);
      if (joined) notify(state, actor, [team.ownerId], "team-joined", { kind: "team", id });
      audit(state, actor, joined ? "community-team-joined" : "community-team-left", id); return team;
    });
  }

  async manageTeam(actor: Actor, id: string, expected: number, ownerId: string, archive: boolean) {
    return this.repository.update(actor.tenantId, (state) => {
      const community = this.allow(state, actor, true); const team = community.teams.find(entry => entry.id === id && !entry.archived);
      if (!team || actor.guest || (team.ownerId !== actor.id && actor.role !== "admin")) throw new WorkflowError("Only the team owner or an administrator can manage this team.", 403);
      assertRevision(team.revision, expected);
      if (!archive) {
        const owner = team.members.find(member => member.id === ownerId);
        if (!owner || community.recipients[ownerId]?.guest !== false) throw new WorkflowError("Select an internal team member as the new owner.", 422);
        team.ownerId = owner.id; team.ownerName = owner.name;
      }
      team.archived = archive; team.revision++; team.updatedAt = now(); audit(state, actor, archive ? "community-team-archived" : "community-team-transferred", id, ownerId); return team;
    });
  }

  private reportTarget(state: StoreDocument, kind: CommunityReport["targetKind"], id: string) {
    const community = communityState(state);
    if (kind === "reply") {
      const reply = community.replies.find(entry => entry.id === id && !entry.deleted);
      if (reply) return { entity: reply, target: { kind: "topic" as const, id: reply.topicId }, ownerId: reply.authorId, text: reply.body };
    }
    if (kind === "topic") {
      const topic = community.topics.find(entry => entry.id === id && !entry.deleted);
      if (topic) return { entity: topic, target: { kind: "topic" as const, id }, ownerId: topic.authorId, text: `${topic.title}\n${topic.body}` };
    }
    if (kind === "profile") {
      const profile = community.profiles.find(entry => entry.id === id);
      if (profile) return { entity: profile, target: { kind: "profile" as const, id }, ownerId: id, text: `${profile.name}\n${profile.headline}\n${profile.bio}` };
    }
    if (kind === "team") {
      const team = community.teams.find(entry => entry.id === id && !entry.archived);
      if (team) return { entity: team, target: { kind: "team" as const, id }, ownerId: team.ownerId, text: `${team.name}\n${team.description}` };
    }
    return null;
  }

  async report(actor: Actor, kind: CommunityReport["targetKind"], id: string, reason: string) {
    const explanation = z.string().trim().min(10).max(2000).parse(reason);
    return this.repository.update(actor.tenantId, (state) => {
      const community = this.allow(state, actor); const target = this.reportTarget(state, kind, id);
      if (!target || target.entity.hidden || !this.targetVisible(state, actor, target.target)) throw new WorkflowError("Community content not found.", 404);
      if (community.reports.some(report => report.targetId === id && report.targetKind === kind && report.reporterId === actor.id && report.state === "pending")) throw new WorkflowError("You have already reported this content.", 409);
      const report: CommunityReport = { id: randomUUID(), targetKind: kind, targetId: id, reporterId: actor.id, reporterName: actor.name, reason: explanation, createdAt: now(), state: "pending", revision: 1, resolution: "", resolvedBy: "", resolvedAt: "" };
      community.reports.push(report); audit(state, actor, "community-content-reported", id, report.id); return { id: report.id };
    });
  }

  async reports(actor: Actor) {
    if (!communityModerator(actor)) throw new WorkflowError("Moderator permission is required.", 403);
    const state = await this.repository.read(actor.tenantId); const community = this.allow(state, actor);
    return community.reports.map(report => { const target = this.reportTarget(state, report.targetKind, report.targetId); return { ...report, content: target?.text ?? "Content removed by its author.", hidden: target?.entity.hidden ?? false, available: Boolean(target) }; }).reverse();
  }

  async moderate(actor: Actor, id: string, expected: number, action: "hide" | "restore" | "dismiss", note: string) {
    if (!communityModerator(actor)) throw new WorkflowError("Moderator permission is required.", 403);
    const reason = z.string().trim().min(10).max(2000).parse(note);
    return this.repository.update(actor.tenantId, (state) => {
      const community = this.allow(state, actor); const report = community.reports.find(entry => entry.id === id);
      if (!report) throw new WorkflowError("Report not found.", 404);
      assertRevision(report.revision, expected); const target = this.reportTarget(state, report.targetKind, report.targetId);
      if (action !== "dismiss") {
        if (!target) throw new WorkflowError("The author removed this content.", 409);
        target.entity.hidden = action === "hide"; target.entity.revision++; target.entity.updatedAt = now();
        if (report.targetKind === "reply" && action === "hide") {
          const topic = community.topics.find(entry => entry.acceptedReplyId === report.targetId);
          if (topic) { topic.acceptedReplyId = ""; topic.revision++; }
        }
        notify(state, actor, [target.ownerId], "content-moderated", target.target);
      }
      report.state = action === "dismiss" ? "dismissed" : "resolved"; report.resolution = reason; report.resolvedBy = actor.name; report.resolvedAt = now(); report.revision++;
      audit(state, actor, `community-moderation-${action}`, report.targetId, reason); return report;
    });
  }

  notificationVisible(state: StoreDocument, actor: Actor, notification: CommunityNotification) {
    if (notification.recipientId !== actor.id || (actor.guest && !state.settings.allowGuests) || !communityState(state).policy.enabled) return false;
    const target = notification.target;
    if (target.kind === "agent") {
      const agent = state.agents.find(entry => entry.id === target.id && entry.state !== "archived");
      if (!agent) return false;
      const privileged = !actor.guest && (agent.ownerId === actor.id || communityModerator(actor));
      if (["agent-submitted", "review-completed"].includes(notification.event)) return privileged;
      return privileged || this.targetVisible(state, actor, target);
    }
    const content = this.reportTarget(state, target.kind, target.id);
    const ownModeration = notification.event === "content-moderated" && content?.ownerId === actor.id;
    return this.targetVisible(state, actor, target) || ownModeration;
  }

  async inbox(actor: Actor): Promise<NotificationInbox> {
    const state = await this.repository.read(actor.tenantId); const community = this.allow(state, actor);
    const items: NotificationView[] = [];
    for (const notification of community.notifications) {
      if (!this.notificationVisible(state, actor, notification)) continue;
      const target = notification.target;
      const agent = target.kind === "agent" ? state.agents.find(entry => entry.id === target.id) : undefined;
      let title = "Community update"; let href = "/community";
      if (target.kind === "agent" && agent) { title = agent.versions.at(-1)?.draft.name ?? agent.draft.name; href = notification.event === "access-requested" ? "/dashboard?tab=managed" : notification.event === "access-updated" ? "/dashboard?tab=requests" : `/agents/${encodeURIComponent(target.id)}${notification.event === "agent-submitted" || notification.event === "review-completed" ? "?draft=true" : ""}`; }
      if (target.kind === "topic") { title = community.topics.find(entry => entry.id === target.id)?.title ?? title; href = `/community/topics/${encodeURIComponent(target.id)}`; }
      if (target.kind === "profile") { title = community.profiles.find(entry => entry.id === target.id)?.name ?? title; href = `/community/people/${encodeURIComponent(target.id)}`; }
      if (target.kind === "team") { title = community.teams.find(entry => entry.id === target.id)?.name ?? title; href = `/community/teams/${encodeURIComponent(target.id)}`; }
      items.push({ ...notification, title, href });
    }
    return { items: items.reverse().slice(0, 200), unread: items.filter(entry => !entry.readAt).length, preferences: community.preferences[actor.id] ?? { email: false, teams: false }, channels: notificationChannels(actor.local), deliveries: community.deliveries.filter(entry => entry.recipientId === actor.id).slice(-30).reverse().map(({ id, channel, state: status, sentAt, error, createdAt }) => ({ id, channel, state: status, sentAt, error, createdAt })) };
  }

  async readNotifications(actor: Actor, ids: string[]) {
    z.array(z.string().max(100)).max(200).parse(ids);
    return this.repository.update(actor.tenantId, (state) => {
      const community = this.allow(state, actor); const timestamp = now();
      for (const entry of community.notifications) if (entry.recipientId === actor.id && ids.includes(entry.id)) entry.readAt = timestamp;
      return { updated: true };
    });
  }

  async preferences(actor: Actor, input: unknown) {
    const preferences = z.object({ email: z.boolean(), teams: z.boolean() }).strict().parse(input);
    const channels = notificationChannels(actor.local);
    if ((preferences.email && !channels.email) || (preferences.teams && !channels.teams)) throw new WorkflowError("Configure the notification channel before enabling delivery.", 422);
    return this.repository.update(actor.tenantId, (state) => {
      const community = this.allow(state, actor); rememberRecipient(state, actor);
      community.preferences[actor.id] = preferences;
      for (const delivery of community.deliveries) if (delivery.recipientId === actor.id && !preferences[delivery.channel] && ["pending", "failed", "processing"].includes(delivery.state)) delivery.state = "cancelled";
      return preferences;
    });
  }
}