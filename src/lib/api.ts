import { NextResponse, type NextRequest } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { defaultSettings, riskIds, roleIds, type Bootstrap, type MarketplaceSettings } from "./contracts";
import { getActor, requireActor, localIdentities } from "./identity";
import { entraConfigured } from "./auth";
import { getRepository, isLocalMode, isPublicDemoMode } from "./repository";
import { MarketplaceService } from "./marketplace";
import { WorkflowError } from "./workflow";
import { boundedBody, inspectUpload, MAX_UPLOAD_BYTES } from "./uploads";
import { directoryObject, directorySearch, graphConfigured, integrationConfiguration, packageAvailableTo, registryPackage, registryPackages, testIntegration } from "./integrations";
import { isLoopbackRequest } from "./local-access";
import { communityApi } from "./community-api";

const revision = z.number().int().nonnegative();
const note = z.string().max(4000);
const commandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("save"), revision, draft: z.unknown() }).strict(),
  z.object({ action: z.literal("submit"), revision }).strict(),
  z.object({ action: z.enum(["approve", "request-changes"]), revision, note }).strict(),
  z.object({ action: z.enum(["withdraw", "archive", "restore"]), revision }).strict(),
  z.object({ action: z.literal("risk"), revision, risk: z.enum(riskIds) }).strict(),
]);
const rateWindows = new Map<string, { start: number; count: number }>();

export function assertOrigin(request: Request) {
  const expected = new URL(process.env.NEXTAUTH_URL ?? request.url).origin;
  if (request.headers.get("origin") !== expected) throw new WorkflowError("Cross-origin changes are not permitted.", 403);
}

async function body(request: Request) {
  try { return JSON.parse((await boundedBody(request)).toString("utf8")) as unknown; }
  catch (error) { if (error instanceof WorkflowError) throw error; throw new WorkflowError("Send a valid JSON request.", 400); }
}
const respond = (data: unknown, status = 200) => NextResponse.json({ data }, { status, headers: { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
const unavailable = () => { throw new WorkflowError("Resource not found.", 404); };

async function publicSettings(): Promise<MarketplaceSettings> {
  if (!isLocalMode() && !process.env.AZURE_STORAGE_ACCOUNT) return { ...defaultSettings };
  const tenant = isLocalMode() ? "local-tenant" : isPublicDemoMode() ? process.env.DEMO_TENANT_ID ?? "agent-marketplace-demo" : process.env.ENTRA_TENANT_ID;
  if (!tenant) return { ...defaultSettings };
  const state = await getRepository().read(tenant);
  return { ...defaultSettings, name: state.settings.name, organization: state.settings.organization, accentColor: state.settings.accentColor, logoId: state.settings.logoId };
}

export async function marketplaceApi(request: NextRequest, segments: string[]): Promise<Response> {
  try {
    const [resource, id, action] = segments;
    const method = request.method;
    if (isLocalMode() && !isLoopbackRequest(request.headers)) return unavailable();
    if (!["GET", "HEAD"].includes(method)) assertOrigin(request);
    if (resource === "bootstrap" && method === "GET") {
      const actor = await getActor();
      const service = actor ? new MarketplaceService() : undefined;
      const state = actor ? await getRepository().read(actor.tenantId) : undefined;
      const blocked = actor?.guest && !state?.settings.allowGuests ? "Guest access is disabled by the administrator." : undefined;
      if (actor && !blocked) await service!.state(actor);
      const result: Bootstrap = { actor, settings: actor && !blocked ? state!.settings : await publicSettings(), settingsRevision: state?.settingsRevision ?? 0, local: isLocalMode(), demo: isPublicDemoMode(), identities: isLocalMode() ? localIdentities.map(({ id: identityId, name, role, guest }) => ({ id: identityId, name, role, guest })) : [], authConfigured: entraConfigured(), counts: { approvals: actor && ["admin", "reviewer"].includes(actor.role) ? state?.agents.filter((agent) => agent.state === "in-review").length ?? 0 : 0, requests: actor ? state?.requests.filter((entry) => entry.state === "pending" && (actor.role === "admin" || state.agents.some((agent) => agent.id === entry.agentId && agent.ownerId === actor.id))).length ?? 0 : 0 }, blocked };
      return respond(result);
    }
    if (resource === "branding" && id === "logo" && method === "GET") {
      const tenant = isLocalMode() ? "local-tenant" : isPublicDemoMode() ? process.env.DEMO_TENANT_ID ?? "agent-marketplace-demo" : process.env.ENTRA_TENANT_ID;
      if (!tenant) return new Response(null, { status: 404 });
      const repository = getRepository(); const state = await repository.read(tenant);
      const file = state.files.find((entry) => entry.kind === "logo" && entry.id === state.settings.logoId);
      if (!file) return new Response(null, { status: 404 });
      return new Response(new Uint8Array(await repository.getFile(tenant, file.id)), { headers: { "Content-Type": file.mime, "Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff", ETag: `"${file.sha256}"` } });
    }
    if (resource === "dev" && id === "actor" && method === "POST") {
      if (!isLocalMode() || !["localhost", "127.0.0.1", "[::1]"].includes(request.nextUrl.hostname)) return unavailable();
      const input = z.object({ id: z.string() }).strict().parse(await body(request));
      if (!localIdentities.some((identity) => identity.id === input.id)) return unavailable();
      const response = respond({ changed: true });
      response.cookies.set("marketplace-local-user", input.id, { httpOnly: true, sameSite: "strict", path: "/", maxAge: 8 * 60 * 60 });
      return response;
    }
    if (isPublicDemoMode() && !["GET", "HEAD"].includes(method)) throw new WorkflowError("The public demo is read-only. Deploy your own instance to enable changes.", 403);
    const actor = await requireActor();
    const service = new MarketplaceService();
    if (method !== "GET") {
      const key = `${actor.tenantId}:${actor.id}`; const now = Date.now();
      for (const [entry, value] of rateWindows) if (now - value.start > 60000) rateWindows.delete(entry);
      const window = rateWindows.get(key) ?? { start: now, count: 0 }; window.count++; rateWindows.set(key, window);
      if (window.count > 120) throw new WorkflowError("Too many changes. Wait a minute before retrying.", 429);
    }
    if (resource === "community") return respond(await communityApi(request, actor, segments.slice(1)), method === "POST" ? 201 : 200);
    if (resource === "agents" && !id) {
      if (method === "GET") {
        const scope = z.enum(["catalog", "mine", "review"]).parse(request.nextUrl.searchParams.get("scope") ?? "catalog");
        let records = await service.list(actor, scope);
        const query = request.nextUrl.searchParams.get("q")?.toLocaleLowerCase() ?? "";
        const platform = request.nextUrl.searchParams.get("platform");
        if (query) records = records.filter((record) => `${record.name} ${record.summary} ${record.category} ${record.platform} ${record.ownerName} ${record.tags.join(" ")}`.toLocaleLowerCase().includes(query));
        if (platform) records = records.filter((record) => record.platform === platform);
        return respond(records);
      }
      if (method === "POST") return respond(await service.save(actor, z.object({ draft: z.unknown() }).strict().parse(await body(request)).draft), 201);
    }
    if (resource === "agents" && id && !action) {
      if (method === "GET") {
        const versionValue = request.nextUrl.searchParams.get("version");
        return respond(await service.detail(actor, id, { draft: request.nextUrl.searchParams.get("draft") === "true", version: versionValue ? z.coerce.number().int().positive().parse(versionValue) : undefined }));
      }
      if (method === "PATCH") {
        const command = commandSchema.parse(await body(request));
        if (command.action === "save") return respond(await service.save(actor, command.draft, id, command.revision));
        if (command.action === "submit") return respond(await service.submit(actor, id, command.revision));
        if (command.action === "risk") return respond(await service.risk(actor, id, command.revision, command.risk));
        if (command.action === "approve" || command.action === "request-changes") return respond(await service.review(actor, id, command.revision, command.action, command.note));
        return respond(await service.changeState(actor, id, command.revision, command.action));
      }
    }
    if (resource === "agents" && id && action === "favorite" && method === "PUT") return respond(await service.favorite(actor, id, z.object({ saved: z.boolean() }).strict().parse(await body(request)).saved));
    if (resource === "agents" && id && action === "requests" && method === "POST") return respond(await service.requestAccess(actor, id, z.object({ justification: z.string().min(10).max(4000) }).strict().parse(await body(request)).justification), 201);
    if (resource === "agents" && id && action === "access" && method === "GET") {
      const detail = await service.detail(actor, id);
      const state = await service.state(actor); const record = state.agents.find((entry) => entry.id === id)!;
      const version = record.versions.at(-1); const packageId = version?.draft.distribution.registryPackageId;
      if (!packageId || !graphConfigured()) return respond(detail.access);
      const entry = await registryPackage(packageId); const checkedAt = new Date().toISOString();
      if (entry.isBlocked) return respond({ ...detail.access, state: "blocked", source: "microsoft-catalog", launchUrl: "", checkedAt, message: "Blocked in the Microsoft catalog." });
      if (packageAvailableTo(entry, actor)) return respond({ ...detail.access, state: "available", source: "microsoft-catalog", launchUrl: version!.draft.distribution.launchUrl, checkedAt, message: "Available to your identity in the Microsoft catalog. Runtime, license and source permissions still apply." });
      return respond({ ...detail.access, checkedAt, source: "microsoft-catalog", message: "Microsoft catalog availability was checked. No applicable catalog assignment was confirmed." });
    }
    if (resource === "requests" && !id && method === "GET") return respond(await service.requests(actor, request.nextUrl.searchParams.get("managed") === "true"));
    if (resource === "requests" && id && method === "PATCH") {
      const input = z.object({ action: z.enum(["approve", "fulfill", "reject", "cancel", "revoke"]), revision, note }).strict().parse(await body(request));
      return respond(await service.decideAccess(actor, id, input.revision, input.action, input.note));
    }
    if (resource === "files" && !id && method === "POST") {
      if (actor.role === "reader") throw new WorkflowError("Upload permission is required.", 403);
      const kind = z.enum(["icon", "logo", "solution"]).parse(request.nextUrl.searchParams.get("kind"));
      if (kind === "logo" && actor.role !== "admin") throw new WorkflowError("Administrator permission is required.", 403);
      const content = await boundedBody(request, MAX_UPLOAD_BYTES + 128 * 1024);
      const form = await new Response(new Uint8Array(content), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
      const file = form.get("file");
      if (!file || typeof file === "string" || form.getAll("file").length !== 1) throw new WorkflowError("Select one file to upload.", 422);
      const bytes = Buffer.from(await file.arrayBuffer()); const metadata = await inspectUpload(bytes, file.name, kind, actor.id);
      await service.repository.putFile(actor.tenantId, metadata.id, bytes, metadata.mime);
      return respond(await service.registerFile(actor, metadata), 201);
    }
    if (resource === "files" && id && method === "GET") {
      const file = await service.artifact(actor, id);
      if (file.kind === "solution") {
        const scan = await service.repository.scanStatus(actor.tenantId, id);
        if (scan === "blocked") throw new WorkflowError("This file was blocked by malware scanning.", 403);
        if (!isLocalMode() && process.env.REQUIRE_MALWARE_SCAN !== "false" && scan !== "clean") throw new WorkflowError("Malware scanning has not returned a clean result yet. Retry later.", 423);
      }
      const content = await service.repository.getFile(actor.tenantId, id);
      if (createHash("sha256").update(content).digest("hex") !== file.sha256) throw new WorkflowError("File integrity verification failed.", 503);
      return new Response(new Uint8Array(content), { headers: { "Content-Type": file.mime, "Content-Length": String(content.length), "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Disposition": `${file.kind === "solution" ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(file.name)}`, ETag: `"${file.sha256}"` } });
    }
    if (resource === "admin" && method === "GET") {
      await requireActor(["admin", "reviewer"]); const state = await service.state(actor);
      return respond({ agents: state.agents.map((record) => service.summary(record, actor, state, true)), requests: actor.role === "admin" ? await service.requests(actor, true) : [], registry: state.registry, ...(actor.role === "admin" ? { assignments: state.assignments, audit: state.audit.slice(-200).reverse(), settings: state.settings, settingsRevision: state.settingsRevision } : {}) });
    }
    if (resource === "settings" && method === "PUT") {
      const input = z.object({ settings: z.unknown(), revision }).strict().parse(await body(request));
      return respond(await service.settings(actor, input.settings, input.revision));
    }
    if (resource === "roles") {
      await requireActor(["admin"]);
      if (method === "DELETE" && id) return respond(await service.assignRole(actor, null, id));
      if (method === "POST") {
        const input = z.object({ id: z.string().max(100), subjectType: z.enum(["user", "group"]), role: z.enum(roleIds) }).strict().parse(await body(request));
        const local = actor.local ? localIdentities.find((identity) => identity.id === input.id) : undefined;
        const subject = local ? { id: local.id, name: local.name, email: local.email, subjectType: "user" as const } : await directoryObject(input.id, input.subjectType);
        return respond(await service.assignRole(actor, { ...subject, role: input.role }, input.id));
      }
    }
    if (resource === "directory" && method === "GET") {
      await requireActor(["admin"]);
      const query = z.string().min(1).max(100).parse(request.nextUrl.searchParams.get("q") ?? "");
      const type = z.enum(["user", "group"]).parse(request.nextUrl.searchParams.get("type") ?? "user");
      if (actor.local && !graphConfigured()) return respond(type === "user" ? localIdentities.filter((identity) => `${identity.name} ${identity.email}`.toLowerCase().includes(query.toLowerCase())).map((identity) => ({ id: identity.id, name: identity.name, email: identity.email, subjectType: "user", guest: identity.guest })) : []);
      return respond(await directorySearch(query, type));
    }
    if (resource === "integrations") {
      await requireActor(["admin"]);
      if (method === "GET") return respond(integrationConfiguration());
      if (method === "POST" && id && action === "test") return respond(await testIntegration(id, actor));
    }
    if (resource === "registry" && id === "sync" && method === "POST") {
      await requireActor(["admin"]);
      try {
        const packages = await registryPackages();
        return respond(await service.repository.update(actor.tenantId, (state) => { state.registry = { packages, syncedAt: new Date().toISOString(), error: "" }; return state.registry; }));
      } catch (error) {
        await service.repository.update(actor.tenantId, (state) => { state.registry.error = error instanceof WorkflowError ? error.message : "Registry sync failed."; });
        throw error;
      }
    }
    return unavailable();
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Check the required fields.", issues: error.issues.map((issue) => ({ field: issue.path.join("."), message: issue.message })) }, { status: 422 });
    if (error instanceof WorkflowError) return NextResponse.json({ error: error.message }, { status: error.status, headers: { "Cache-Control": "no-store" } });
    console.error(JSON.stringify({ event: "marketplace-error", type: error instanceof Error ? error.name : "UnknownError" }));
    return NextResponse.json({ error: "The operation could not be completed. Check the service configuration and retry." }, { status: 503 });
  }
}