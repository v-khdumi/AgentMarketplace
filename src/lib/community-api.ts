import type { NextRequest } from "next/server";
import { z } from "zod";
import type { Actor } from "./contracts";
import { CommunityService } from "./community";
import { MarketplaceService } from "./marketplace";
import { WorkflowError } from "./workflow";
import { boundedBody } from "./uploads";
import { dispatchNotifications } from "./notification-delivery";

const revision = z.number().int().nonnegative();
const targetSchema = z.object({ kind: z.enum(["agent", "topic", "profile", "team"]), id: z.string().min(1).max(100) }).strict();
async function input(request: Request) {
  try { return JSON.parse((await boundedBody(request, 64000)).toString("utf8")) as unknown; }
  catch (error) { if (error instanceof WorkflowError) throw error; throw new WorkflowError("Send a valid JSON request.", 400); }
}

export async function communityApi(request: NextRequest, actor: Actor, segments: string[]) {
  const [resource, id, action, ...extra] = segments; const method = request.method; const service = new CommunityService();
  if (extra.length) throw new WorkflowError("Resource not found.", 404);
  if (resource === "policy" && !id) {
    if (method === "GET") return service.policy(actor);
    if (method === "PUT") { const data = z.object({ policy: z.unknown(), revision }).strict().parse(await input(request)); return service.savePolicy(actor, data.policy, data.revision); }
  }
  if (resource === "profiles") {
    if (method === "GET" && !id) return service.profiles(actor);
    if (method === "GET" && id) {
      const profile = await service.profile(actor, id === "me" ? actor.id : id);
      if (action === "agents") {
        const state = await service.repository.read(actor.tenantId); const owned = new Set(state.agents.filter(agent => agent.ownerId === profile.id).map(agent => agent.id));
        return (await new MarketplaceService(service.repository).list(actor)).filter(agent => owned.has(agent.id));
      }
      if (!action) return profile;
    }
    if (method === "PUT" && id === "me" && !action) { const data = z.object({ profile: z.unknown(), revision }).strict().parse(await input(request)); return service.saveProfile(actor, data.profile, data.revision); }
  }
  if (resource === "topics") {
    if (method === "GET" && !id) return service.topics(actor, { kind: z.enum(["discussion", "idea"]).optional().parse(request.nextUrl.searchParams.get("kind") ?? undefined), agentId: request.nextUrl.searchParams.get("agentId") ?? undefined, mine: request.nextUrl.searchParams.get("mine") === "true" });
    if (method === "GET" && id && !action) return service.topic(actor, id);
    if (method === "POST" && !id) return service.createTopic(actor, await input(request));
    if (method === "POST" && id && action === "replies") return service.reply(actor, id, await input(request));
    if (method === "PUT" && id && action === "vote") { const data = z.object({ voted: z.boolean() }).strict().parse(await input(request)); return service.vote(actor, id, data.voted); }
    if (method === "PATCH" && id && !action) {
      const data = z.discriminatedUnion("action", [
        z.object({ action: z.literal("edit"), revision, title: z.string(), body: z.string() }).strict(),
        z.object({ action: z.literal("remove"), revision }).strict(),
        z.object({ action: z.literal("accept"), revision, replyId: z.string().max(100) }).strict(),
        z.object({ action: z.literal("progress"), revision, state: z.string(), note: z.string(), linkedAgentId: z.string() }).strict(),
      ]).parse(await input(request));
      if (data.action === "edit") return service.editTopic(actor, id, { title: data.title, body: data.body }, data.revision);
      if (data.action === "remove") return service.removeTopic(actor, id, data.revision);
      if (data.action === "accept") return service.acceptReply(actor, id, data.replyId, data.revision);
      return service.progressIdea(actor, id, { state: data.state, note: data.note, linkedAgentId: data.linkedAgentId }, data.revision);
    }
  }
  if (resource === "replies" && id && !action && method === "PATCH") {
    const data = z.discriminatedUnion("action", [z.object({ action: z.literal("edit"), revision, body: z.string() }).strict(), z.object({ action: z.literal("remove"), revision }).strict()]).parse(await input(request));
    return service.editReply(actor, id, data.revision, data.action === "edit" ? { body: data.body } : null, data.action === "remove");
  }
  if (resource === "follow" && !id) {
    if (method === "GET") return service.following(actor, targetSchema.parse({ kind: request.nextUrl.searchParams.get("kind"), id: request.nextUrl.searchParams.get("id") }));
    if (method === "PUT") { const data = z.object({ target: targetSchema, following: z.boolean() }).strict().parse(await input(request)); return service.follow(actor, data.target, data.following); }
  }
  if (resource === "teams") {
    if (method === "GET" && !id) return service.teams(actor);
    if (method === "GET" && id && !action) return service.team(actor, id);
    if (method === "POST" && !id) return service.saveTeam(actor, await input(request));
    if (method === "PUT" && id && action === "membership") { const data = z.object({ joined: z.boolean() }).strict().parse(await input(request)); return service.joinTeam(actor, id, data.joined); }
    if (method === "PATCH" && id && !action) {
      const data = z.discriminatedUnion("action", [z.object({ action: z.literal("edit"), revision, team: z.unknown() }).strict(), z.object({ action: z.literal("transfer"), revision, ownerId: z.string().max(100) }).strict(), z.object({ action: z.literal("archive"), revision }).strict()]).parse(await input(request));
      if (data.action === "edit") return service.saveTeam(actor, data.team, id, data.revision);
      return service.manageTeam(actor, id, data.revision, data.action === "transfer" ? data.ownerId : "", data.action === "archive");
    }
  }
  if (resource === "reports") {
    if (method === "GET" && !id) return service.reports(actor);
    if (method === "POST" && !id) { const data = z.object({ kind: z.enum(["topic", "reply", "profile", "team"]), id: z.string().max(100), reason: z.string() }).strict().parse(await input(request)); return service.report(actor, data.kind, data.id, data.reason); }
    if (method === "PATCH" && id && !action) { const data = z.object({ action: z.enum(["hide", "restore", "dismiss"]), revision, note: z.string() }).strict().parse(await input(request)); return service.moderate(actor, id, data.revision, data.action, data.note); }
  }
  if (resource === "notifications" && !id) {
    if (method === "GET") return service.inbox(actor);
    if (method === "PATCH") { const data = z.object({ ids: z.array(z.string()).max(200) }).strict().parse(await input(request)); return service.readNotifications(actor, data.ids); }
    if (method === "PUT") return service.preferences(actor, await input(request));
  }
  if (resource === "delivery" && !id && method === "POST") {
    if (actor.guest || actor.role !== "admin") throw new WorkflowError("Administrator permission is required.", 403);
    return dispatchNotifications(actor.tenantId, service.repository);
  }
  throw new WorkflowError("Resource not found.", 404);
}