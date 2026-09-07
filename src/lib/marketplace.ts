import { createHash, randomUUID } from "node:crypto";
import { draftSchema, settingsSchema, submissionIssues, type Actor, type AgentRecord, type AgentDraft, type AgentSummary, type AgentDetail, type StoreDocument, type AccessRequest, type AccessResolution, type StoredFile, type RoleAssignment } from "./contracts";
import { MarketplaceRepository, getRepository, isPublicDemoMode } from "./repository";
import { assertRevision, reviewSubmission, WorkflowError, type RiskLevel } from "./workflow";
import { exampleAgents, exampleCommunity, exampleMetrics } from "./seed";
import { communityState, followers, notify, rememberRecipient } from "./community-events";

const timestamp = () => new Date().toISOString();
const staff = (actor: Actor) => actor.role === "admin" || actor.role === "reviewer";
const publisher = (actor: Actor) => actor.role !== "reader";
const latest = (record: AgentRecord) => record.versions.at(-1);
const deployment = (draft: AgentDraft) => createHash("sha256").update(JSON.stringify([draft.distribution.launchUrl, draft.distribution.sourceAgentId, draft.distribution.registryPackageId])).digest("hex");
const owns = (record: AgentRecord, actor: Actor) => record.ownerId === actor.id;
const active = (record: AgentRecord) => record.state !== "archived" && Boolean(latest(record));
const visible = (record: AgentRecord, actor: Actor) => active(record) && (!actor.guest || Boolean(latest(record)?.draft.distribution.guestVisible));
const canConfigure = (record: AgentRecord, actor: Actor) => owns(record, actor) || staff(actor) || (visible(record, actor) && (!actor.guest || latest(record)?.draft.distribution.configurationAudience === "all"));
const audit = (state: StoreDocument, actor: Actor, action: string, subjectId: string, detail = "") => state.audit.push({ id: randomUUID(), at: timestamp(), actorId: actor.id, actorName: actor.name, action, subjectId, detail });

export class MarketplaceService {
  readonly repository: MarketplaceRepository;
  constructor(repository = getRepository()) { this.repository = repository; }

  private allow(state: StoreDocument, actor: Actor) {
    if (actor.guest && !state.settings.allowGuests) throw new WorkflowError("Guest access is disabled by the administrator.", 403);
  }

  async state(actor: Actor) {
    let state = await this.repository.read(actor.tenantId);
    if ((actor.local || isPublicDemoMode()) && process.env.SEED_EXAMPLES !== "false" && state.revision === 0) {
      await this.repository.update(actor.tenantId, (document) => { if (document.revision === 0) { document.agents = exampleAgents(); if (isPublicDemoMode()) { document.community = exampleCommunity(); document.settings = { ...document.settings, name: "BT Agent Hub", organization: "Banca Transilvania", accentColor: "#005eb8", supportEmail: "" }; } } });
      state = await this.repository.read(actor.tenantId);
    }
    this.allow(state, actor);
    const contact = state.community?.recipients[actor.id];
    if (!contact || contact.email !== actor.email || contact.role !== actor.role || contact.guest !== actor.guest) {
      await this.repository.update(actor.tenantId, document => rememberRecipient(document, actor));
      state = await this.repository.read(actor.tenantId);
    }
    return state;
  }

  private record(state: StoreDocument, id: string) {
    const record = state.agents.find((entry) => entry.id === id);
    if (!record) throw new WorkflowError("Agent not found.", 404);
    return record;
  }

  private edit(record: AgentRecord, actor: Actor) {
    if (!publisher(actor) || !owns(record, actor)) throw new WorkflowError("Only the publisher can edit this agent.", 403);
  }

  summary(record: AgentRecord, actor: Actor, state: StoreDocument, working = false): AgentSummary {
    const version = latest(record);
    const draft = working ? record.draft : version?.draft ?? record.draft;
    return { id: record.id, name: draft.name || "Untitled agent", summary: draft.summary, platform: draft.platform, category: draft.category, ownerName: record.ownerName, iconId: draft.iconId, state: working ? record.state : "published", risk: record.risk, version: version?.number ?? 0, updatedAt: working ? record.updatedAt : version?.publishedAt ?? record.updatedAt, requestAccess: !isPublicDemoMode() && !record.example && draft.distribution.requestAccess, downloadable: !isPublicDemoMode() && !record.example && state.settings.downloadsEnabled && draft.distribution.downloadEnabled && Boolean(draft.distribution.packageId) && canConfigure(record, actor), hasLaunchUrl: Boolean(draft.distribution.launchUrl), saved: (state.favorites[actor.id] ?? []).includes(record.id), example: record.example, tags: draft.tags, ...(record.example ? exampleMetrics(record.id) : {}) };
  }

  async list(actor: Actor, scope: "catalog" | "mine" | "review" = "catalog") {
    const state = await this.state(actor);
    if (scope === "review" && !staff(actor)) throw new WorkflowError("Reviewer permission is required.", 403);
    return state.agents.filter((record) => scope === "mine" ? owns(record, actor) : scope === "review" ? record.state === "in-review" : visible(record, actor)).map((record) => this.summary(record, actor, state, scope !== "catalog"));
  }

  access(record: AgentRecord, actor: Actor, state: StoreDocument): AccessResolution {
    const draft = latest(record)?.draft ?? record.draft;
    const request = state.requests.findLast((entry) => entry.agentId === record.id && entry.requesterId === actor.id && entry.deployment === deployment(draft));
    const base = { checkedAt: "", launchUrl: "", request };
    if (!active(record) || record.example) return { ...base, state: "unknown", source: "none", message: record.example ? "Example configuration; no deployed agent is linked." : "This agent is not published." };
    const entry = state.registry.packages.find((item) => item.id === draft.distribution.registryPackageId);
    if (entry?.isBlocked) return { ...base, state: "blocked", source: "microsoft-catalog", checkedAt: state.registry.syncedAt, message: "Blocked in the Microsoft catalog." };
    if (request?.state === "fulfilled") return { ...base, state: "available", source: "owner-confirmation", checkedAt: request.updatedAt, launchUrl: draft.distribution.launchUrl, message: "Sharing confirmed by the agent owner. Microsoft licenses and data permissions still apply." };
    if (request?.state === "pending" || request?.state === "approved") return { ...base, state: request.state, source: "none", message: request.state === "approved" ? "Approved. The owner still needs to complete sharing in Microsoft." : "Awaiting the agent owner's decision." };
    if (entry?.availableTo === "all" && Date.now() - Date.parse(state.registry.syncedAt) < 15 * 60 * 1000) return { ...base, state: "available", source: "microsoft-catalog", checkedAt: state.registry.syncedAt, launchUrl: draft.distribution.launchUrl, message: "Available in the Microsoft catalog. Runtime, licensing and source permissions remain controlled by Microsoft." };
    if (!draft.distribution.requestAccess || owns(record, actor)) return { ...base, state: draft.distribution.launchUrl ? "available" : "unknown", source: "publisher", launchUrl: draft.distribution.launchUrl, message: "Launch link supplied by the publisher; Microsoft checks runtime access." };
    return { ...base, state: "request-required", source: "none", message: "Request access from the agent owner." };
  }

  async detail(actor: Actor, id: string, options: { draft?: boolean; version?: number } = {}): Promise<AgentDetail> {
    const state = await this.state(actor);
    const record = this.record(state, id);
    const privileged = owns(record, actor) || staff(actor);
    if (!visible(record, actor) && !privileged) throw new WorkflowError("Agent not found.", 404);
    if (options.draft && !privileged) throw new WorkflowError("Configuration access is required.", 403);
    const version = options.version ? record.versions.find((item) => item.number === options.version) : latest(record);
    if (options.version && !version) throw new WorkflowError("Version not found.", 404);
    const draft = options.draft || !version ? record.draft : version.draft;
    const configuration = canConfigure(record, actor) ? structuredClone(draft) : null;
    const summary = this.summary(options.version && version ? { ...record, versions: [version] } : record, actor, state, options.draft || !version);
    const profile = state.community?.profiles.find(entry => entry.id === record.ownerId && entry.published && !entry.hidden && (!actor.guest || entry.audience === "all"));
    const community = { enabled: active(record) && (state.community?.policy.enabled ?? true), guestVisible: Boolean(latest(record)?.draft.distribution.guestVisible), ownerProfileId: state.community?.policy.enabled ? profile?.id : undefined };
    return { summary, community, overview: draft.overview, license: draft.license, limitations: draft.limitations, language: draft.language, configuration, access: this.access(record, actor, state), file: configuration ? state.files.find((file) => file.id === draft.distribution.packageId) ?? null : null, versions: record.versions.map((item) => ({ number: item.number, publishedAt: item.publishedAt, releaseNotes: item.draft.releaseNotes })), canEdit: publisher(actor) && owns(record, actor), canReview: staff(actor) && !owns(record, actor) && record.state === "in-review", ...(privileged ? { record: structuredClone(record) } : {}) };
  }

  async save(actor: Actor, input: unknown, id?: string, expected?: number) {
    const draft = draftSchema.parse(input);
    if (!publisher(actor)) throw new WorkflowError("Publisher permission is required.", 403);
    return this.repository.update(actor.tenantId, (state) => {
      this.allow(state, actor);
      const now = timestamp();
      const record: AgentRecord = id ? this.record(state, id) : { id: randomUUID(), ownerId: actor.id, ownerName: actor.name, ownerEmail: actor.email, state: "draft", risk: state.settings.defaultRisk, revision: 0, draft, reviewers: [], reviewNote: "", createdAt: now, updatedAt: now, versions: [], example: false };
      this.edit(record, actor);
      if (id) assertRevision(record.revision, expected ?? -1);
      if (record.state === "in-review" || record.state === "archived") throw new WorkflowError("Withdraw the submission or restore the agent before editing.");
      this.validateFiles(state, record, draft, actor);
      rememberRecipient(state, actor);
      record.draft = draft; record.state = "draft"; record.reviewers = []; record.revision++; record.updatedAt = now;
      if (!id) state.agents.push(record);
      audit(state, actor, id ? "draft-updated" : "draft-created", record.id);
      return structuredClone(record);
    });
  }

  private validateFiles(state: StoreDocument, record: AgentRecord, draft: AgentDraft, actor: Actor) {
    for (const [id, kind] of [[draft.iconId, "icon"], [draft.distribution.packageId, "solution"]] as const) {
      if (!id) continue;
      const file = state.files.find((entry) => entry.id === id && entry.kind === kind);
      if (!file || (file.ownerId !== actor.id && !record.versions.some((version) => version.draft.iconId === id || version.draft.distribution.packageId === id))) throw new WorkflowError("Upload your own file before attaching it.", 403);
      if (kind === "icon" && draft.platform === "agent-builder" && (file.width !== 192 || file.height !== 192)) throw new WorkflowError("Agent Builder icons must be 192 x 192 PNG images.", 422);
      if (kind === "solution" && draft.platform === "copilot-studio" && file.solution) {
        if (draft.studio.solutionName !== file.solution.uniqueName || draft.studio.solutionVersion !== file.solution.version || (draft.studio.solutionType === "Managed") !== file.solution.managed) throw new WorkflowError("Solution metadata does not match the uploaded ZIP.", 422);
      }
    }
  }

  private publish(state: StoreDocument, record: AgentRecord, actor: Actor) {
    const currentDeployment = deployment(record.draft);
    for (const request of state.requests) {
      if (request.agentId === record.id && ["pending", "approved", "fulfilled"].includes(request.state) && request.deployment !== currentDeployment) {
        request.state = "revoked"; request.note = "The published deployment changed. Submit a new access request."; request.updatedAt = timestamp(); request.updatedBy = actor.name; request.revision++;
      }
    }
    record.versions.push({ number: record.versions.length + 1, publishedAt: timestamp(), publishedBy: actor.name, reviewers: [...record.reviewers], draft: structuredClone(record.draft) });
    record.state = "published"; record.example = false;
    audit(state, actor, "agent-published", record.id, `Version ${record.versions.length}`);
    notify(state, actor, [record.ownerId, ...followers(state, { kind: "agent", id: record.id }), ...followers(state, { kind: "profile", id: record.ownerId })], "agent-published", { kind: "agent", id: record.id });
  }

  async submit(actor: Actor, id: string, expected: number) {
    return this.repository.update(actor.tenantId, (state) => {
      this.allow(state, actor);
      const record = this.record(state, id); this.edit(record, actor); assertRevision(record.revision, expected);
      if (!["draft", "changes-requested"].includes(record.state)) throw new WorkflowError("Only drafts can be submitted.");
      const issues = submissionIssues(record.draft);
      if (issues.length) throw new WorkflowError(issues.map((issue) => `${issue.field}: ${issue.message}`).join("\n"), 422);
      this.validateFiles(state, record, record.draft, actor);
      if (record.draft.distribution.downloadEnabled && !state.settings.downloadsEnabled) throw new WorkflowError("Solution downloads are disabled by policy.", 403);
      record.reviewers = []; record.reviewNote = ""; record.state = "in-review"; record.updatedAt = timestamp(); record.revision++;
      audit(state, actor, "agent-submitted", id);
      const reviewers = Object.entries(communityState(state).recipients).filter(([, contact]) => !contact.guest && ["admin", "reviewer"].includes(contact.role ?? "")).map(([userId]) => userId);
      notify(state, actor, reviewers, "agent-submitted", { kind: "agent", id });
      if (!state.settings.approvalRequired && !["High", "Critical"].includes(record.risk)) this.publish(state, record, actor);
      return structuredClone(record);
    });
  }

  async review(actor: Actor, id: string, expected: number, decision: "approve" | "request-changes", note: string) {
    return this.repository.update(actor.tenantId, (state) => {
      this.allow(state, actor);
      const record = this.record(state, id); assertRevision(record.revision, expected);
      Object.assign(record, reviewSubmission(record, actor, decision, note, state.settings.secondReviewer));
      record.revision++; record.updatedAt = timestamp();
      audit(state, actor, decision === "approve" ? "revision-approved" : "changes-requested", id, note);
      notify(state, actor, [record.ownerId], "review-completed", { kind: "agent", id });
      if (record.state === "published") this.publish(state, record, actor);
      return structuredClone(record);
    });
  }

  async changeState(actor: Actor, id: string, expected: number, action: "withdraw" | "archive" | "restore") {
    return this.repository.update(actor.tenantId, (state) => {
      this.allow(state, actor); const record = this.record(state, id); assertRevision(record.revision, expected);
      if ((!owns(record, actor) || !publisher(actor)) && actor.role !== "admin") throw new WorkflowError("You cannot manage this agent.", 403);
      if (action === "withdraw" && record.state !== "in-review") throw new WorkflowError("This agent is not in review.");
      if (action === "restore" && record.state !== "archived") throw new WorkflowError("This agent is not archived.");
      record.state = action === "archive" ? "archived" : "draft"; record.reviewers = []; record.updatedAt = timestamp(); record.revision++;
      audit(state, actor, `agent-${action}`, id);
      return structuredClone(record);
    });
  }

  async risk(actor: Actor, id: string, expected: number, risk: RiskLevel) {
    if (actor.role !== "admin") throw new WorkflowError("Administrator permission is required.", 403);
    return this.repository.update(actor.tenantId, (state) => {
      this.allow(state, actor); const record = this.record(state, id); assertRevision(record.revision, expected);
      if (record.risk !== risk) record.reviewers = [];
      record.risk = risk; record.revision++; record.updatedAt = timestamp();
      audit(state, actor, "risk-changed", id, risk); return structuredClone(record);
    });
  }

  async favorite(actor: Actor, id: string, saved: boolean) {
    return this.repository.update(actor.tenantId, (state) => {
      this.allow(state, actor);
      if (!visible(this.record(state, id), actor)) throw new WorkflowError("Agent not found.", 404);
      const ids = new Set(state.favorites[actor.id] ?? []); if (saved) ids.add(id); else ids.delete(id);
      state.favorites[actor.id] = [...ids]; return { saved };
    });
  }

  async requestAccess(actor: Actor, id: string, justification: string) {
    if (justification.trim().length < 10) throw new WorkflowError("Provide a business justification of at least 10 characters.", 422);
    return this.repository.update(actor.tenantId, (state) => {
      this.allow(state, actor); const record = this.record(state, id);
      if (!visible(record, actor) || record.example) throw new WorkflowError("This agent is not available for access requests.", 404);
      const draft = latest(record)!.draft;
      if (!draft.distribution.requestAccess) throw new WorkflowError("This agent does not require an access request.");
      const key = deployment(draft);
      if (state.requests.some((request) => request.agentId === id && request.requesterId === actor.id && request.deployment === key && ["pending", "approved", "fulfilled"].includes(request.state))) throw new WorkflowError("An active request already exists.");
      const now = timestamp();
      const request: AccessRequest = { id: randomUUID(), agentId: id, requesterId: actor.id, requesterName: actor.name, requesterEmail: actor.email, justification: justification.trim(), state: "pending", note: "", updatedBy: "", createdAt: now, updatedAt: now, revision: 1, deployment: key };
      state.requests.push(request); rememberRecipient(state, actor);
      notify(state, actor, [record.ownerId], "access-requested", { kind: "agent", id });
      audit(state, actor, "access-requested", id, request.id); return request;
    });
  }

  async decideAccess(actor: Actor, id: string, expected: number, action: "approve" | "fulfill" | "reject" | "cancel" | "revoke", note: string) {
    return this.repository.update(actor.tenantId, (state) => {
      this.allow(state, actor); const request = state.requests.find((entry) => entry.id === id);
      if (!request) throw new WorkflowError("Request not found.", 404);
      assertRevision(request.revision, expected);
      const record = this.record(state, request.agentId);
      if (action === "cancel") {
        if (request.requesterId !== actor.id || !["pending", "approved"].includes(request.state)) throw new WorkflowError("This request cannot be cancelled.", 403);
      } else if ((actor.role !== "admin" && (!publisher(actor) || !owns(record, actor))) || request.requesterId === actor.id) throw new WorkflowError("The owner or an administrator must decide this request.", 403);
      const required: Record<typeof action, AccessRequest["state"][]> = { approve: ["pending"], fulfill: ["approved"], reject: ["pending", "approved"], cancel: ["pending", "approved"], revoke: ["fulfilled"] };
      if (!required[action].includes(request.state)) throw new WorkflowError("This request changed. Reload it before deciding.");
      if (["fulfill", "reject", "revoke"].includes(action) && !note.trim()) throw new WorkflowError("A decision note is required.", 422);
      if (action === "fulfill" && (!active(record) || request.deployment !== deployment(latest(record)!.draft) || !latest(record)!.draft.distribution.launchUrl)) throw new WorkflowError("The agent deployment is no longer available.");
      const next = { approve: "approved", fulfill: "fulfilled", reject: "rejected", cancel: "cancelled", revoke: "revoked" } as const;
      request.state = next[action]; request.note = note.trim(); request.updatedBy = actor.name; request.updatedAt = timestamp(); request.revision++;
      notify(state, actor, action === "cancel" ? [record.ownerId] : [request.requesterId], "access-updated", { kind: "agent", id: record.id });
      audit(state, actor, `access-${action}`, record.id, `${request.id}: ${note}`); return structuredClone(request);
    });
  }

  async requests(actor: Actor, managed = false) {
    const state = await this.state(actor);
    return state.requests.filter((request) => managed ? actor.role === "admin" || state.agents.some((record) => record.id === request.agentId && owns(record, actor)) : request.requesterId === actor.id).map((request) => ({ ...request, agentName: state.agents.find((record) => record.id === request.agentId)?.draft.name ?? "Archived agent" }));
  }

  async settings(actor: Actor, input: unknown, expected: number) {
    if (actor.role !== "admin") throw new WorkflowError("Administrator permission is required.", 403);
    const settings = settingsSchema.parse(input);
    return this.repository.update(actor.tenantId, (state) => {
      assertRevision(state.settingsRevision, expected);
      if (settings.logoId && settings.logoId !== state.settings.logoId && !state.files.some((file) => file.id === settings.logoId && file.kind === "logo" && file.ownerId === actor.id)) throw new WorkflowError("Upload a logo before saving branding.", 422);
      state.settings = settings; state.settingsRevision++; audit(state, actor, "settings-updated", "settings");
      return { settings, revision: state.settingsRevision };
    });
  }

  async assignRole(actor: Actor, assignment: RoleAssignment | null, id: string) {
    if (actor.role !== "admin") throw new WorkflowError("Administrator permission is required.", 403);
    if (actor.id === id) throw new WorkflowError("Use Microsoft Entra to change your own administrator role.", 403);
    return this.repository.update(actor.tenantId, (state) => {
      state.assignments = state.assignments.filter((entry) => entry.id !== id);
      if (assignment) state.assignments.push(assignment);
      audit(state, actor, "role-assigned", id, assignment?.role ?? "Entra default"); return state.assignments;
    });
  }

  async registerFile(actor: Actor, file: StoredFile) {
    if (!publisher(actor) || (file.kind === "logo" && actor.role !== "admin")) throw new WorkflowError("Upload permission is required.", 403);
    return this.repository.update(actor.tenantId, (state) => { this.allow(state, actor); state.files.push(file); audit(state, actor, "file-uploaded", file.id, file.name); return file; });
  }

  async artifact(actor: Actor, id: string) {
    const state = await this.state(actor); const file = state.files.find((entry) => entry.id === id);
    if (!file) throw new WorkflowError("File not found.", 404);
    if (file.kind === "solution" && !state.settings.downloadsEnabled) throw new WorkflowError("Solution downloads are disabled by policy.", 403);
    const allowed = file.ownerId === actor.id || state.settings.logoId === id || state.agents.some((record) => {
      if (staff(actor) && (record.draft.iconId === id || record.draft.distribution.packageId === id)) return true;
      if (!visible(record, actor)) return false;
      return record.versions.some((version) => file.kind === "icon" ? version.draft.iconId === id : file.kind === "solution" && canConfigure(record, actor) && version.draft.distribution.downloadEnabled && version.draft.distribution.packageId === id);
    });
    if (!allowed) throw new WorkflowError("File access is not permitted.", 403);
    return file;
  }
}