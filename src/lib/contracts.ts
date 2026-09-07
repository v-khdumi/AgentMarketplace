import { z } from "zod";
import type { MarketplaceRole, PublicationState, RiskLevel } from "./workflow";
import type { CommunityState } from "./community-contracts";

export const categoryIds = ["productivity", "hr", "sales", "it", "legal", "sustainability", "finance", "other"] as const;
export const roleIds = ["reader", "publisher", "reviewer", "admin"] as const;
export const riskIds = ["Low", "Medium", "High", "Critical"] as const;
const text = (maximum: number) => z.string().max(maximum);
const httpsUrl = text(2000).refine((value) => {
  if (!value) return true;
  try { const url = new URL(value); return url.protocol === "https:" && !url.username && !url.password; } catch { return false; }
}, "Use an HTTPS URL without embedded credentials.");

export const sourceSchema = z.object({ type: text(100), name: text(200), location: text(2000), settings: text(8000) }).strict();
export const componentSchema = z.object({ name: text(200), configuration: text(32000) }).strict();
export const promptSchema = z.object({ title: text(100), message: text(2000) }).strict();
const commonDraft = {
  name: text(100), summary: text(240), overview: text(8000), category: z.enum(categoryIds), tags: z.array(text(60)).max(20),
  description: text(4000), instructions: text(32000), language: text(40), license: text(1000), limitations: text(4000),
  iconId: text(100), releaseNotes: text(4000), prompts: z.array(promptSchema).max(12),
  distribution: z.object({
    launchUrl: httpsUrl, requestAccess: z.boolean(), downloadEnabled: z.boolean(), packageId: text(100),
    sourceAgentId: text(200), registryPackageId: text(200), guestVisible: z.boolean(),
    configurationAudience: z.enum(["members", "all"]),
  }).strict(),
};
export const draftSchema = z.discriminatedUnion("platform", [
  z.object({ ...commonDraft, platform: z.literal("agent-builder"), builder: z.object({
    model: z.enum(["Auto", "Quick response", "Think deeper"]),
    knowledge: z.array(sourceSchema).max(20), onlyUseKnowledge: z.boolean(),
    codeInterpreter: z.boolean(), imageGenerator: z.boolean(),
  }).strict() }).strict(),
  z.object({ ...commonDraft, platform: z.literal("copilot-studio"), studio: z.object({
    environment: text(200), environmentId: text(200), solutionName: text(200), solutionVersion: text(80),
    solutionType: z.enum(["Managed", "Unmanaged"]), harness: text(100),
    orchestration: z.enum(["Generative", "Classic"]), authentication: text(2000),
    channels: z.array(text(200)).max(30), knowledge: z.array(sourceSchema).max(100),
    topics: z.array(componentSchema).max(100), tools: z.array(componentSchema).max(100),
    connectionReferences: z.array(componentSchema).max(100), environmentVariables: z.array(componentSchema).max(100),
    dependencies: z.array(text(500)).max(100),
  }).strict() }).strict(),
]);

export type AgentDraft = z.infer<typeof draftSchema>;
export type KnowledgeSource = z.infer<typeof sourceSchema>;
export type ComponentDefinition = z.infer<typeof componentSchema>;

export function newDraft(platform: AgentDraft["platform"] = "agent-builder"): AgentDraft {
  const common = {
    name: "", summary: "", overview: "", category: "productivity" as const, tags: [], description: "", instructions: "", language: "ro",
    license: "", limitations: "", iconId: "", releaseNotes: "", prompts: [],
    distribution: { launchUrl: "", requestAccess: true, downloadEnabled: false, packageId: "", sourceAgentId: "", registryPackageId: "", guestVisible: false, configurationAudience: "members" as const },
  };
  return platform === "agent-builder" ? {
    ...common, platform, builder: { model: "Auto", knowledge: [], onlyUseKnowledge: false, codeInterpreter: false, imageGenerator: false },
  } : {
    ...common, platform, studio: { environment: "", environmentId: "", solutionName: "", solutionVersion: "1.0.0.0", solutionType: "Managed", harness: "Standard", orchestration: "Generative", authentication: "Authenticate with Microsoft", channels: [], knowledge: [], topics: [], tools: [], connectionReferences: [], environmentVariables: [], dependencies: [] },
  };
}

export function submissionIssues(draft: AgentDraft): { field: string; message: string }[] {
  const issues: { field: string; message: string }[] = [];
  const requireValue = (field: keyof AgentDraft, value: string) => { if (!value.trim()) issues.push({ field, message: "Required" }); };
  requireValue("name", draft.name); requireValue("summary", draft.summary); requireValue("description", draft.description);
  requireValue("instructions", draft.instructions); requireValue("license", draft.license);
  if (draft.platform === "agent-builder") {
    for (const [field, maximum] of [["name", 30], ["description", 1000], ["instructions", 8000]] as const) {
      if (draft[field].length > maximum) issues.push({ field, message: `Maximum ${maximum} characters` });
    }
    if (draft.distribution.downloadEnabled || draft.distribution.packageId) issues.push({ field: "distribution", message: "Power Platform solutions are only supported for Copilot Studio." });
  }
  const knowledge = draft.platform === "agent-builder" ? draft.builder.knowledge : draft.studio.knowledge;
  if (knowledge.some((source) => !source.type.trim() || !source.name.trim() || !source.location.trim())) issues.push({ field: "knowledge", message: "Each source needs its type, name and exact location or scope." });
  if (draft.prompts.some((prompt) => !prompt.title.trim() || !prompt.message.trim())) issues.push({ field: "prompts", message: "Complete or remove empty prompts." });
  if (!draft.distribution.launchUrl && !draft.distribution.downloadEnabled) issues.push({ field: "distribution", message: "Provide the actual agent launch URL or an importable solution." });
  if (draft.distribution.downloadEnabled && !draft.distribution.packageId) issues.push({ field: "package", message: "Upload a Power Platform solution ZIP." });
  if (draft.platform === "copilot-studio") {
    if (!draft.studio.environment.trim() || !draft.studio.environmentId.trim()) issues.push({ field: "environment", message: "Source environment and environment ID are required." });
    if (!draft.studio.authentication.trim()) issues.push({ field: "authentication", message: "Authentication settings are required." });
    if (draft.distribution.downloadEnabled && (!draft.studio.solutionName.trim() || !draft.studio.solutionVersion.trim())) issues.push({ field: "solution", message: "Solution metadata is required." });
    for (const field of ["topics", "tools", "connectionReferences", "environmentVariables"] as const) {
      if (draft.studio[field].some((entry) => !entry.name.trim() || !entry.configuration.trim())) issues.push({ field, message: "Each component needs its name and configuration or required binding." });
    }
  }
  return issues;
}

export const settingsSchema = z.object({
  name: z.string().trim().min(1).max(40), organization: z.string().trim().min(1).max(60),
  accentColor: z.string().regex(/^#[0-9a-f]{6}$/i), logoId: text(100),
  approvalRequired: z.boolean(), allowGuests: z.boolean(), downloadsEnabled: z.boolean(),
  secondReviewer: z.boolean(), defaultRisk: z.enum(riskIds), supportEmail: z.union([z.literal(""), z.email()]),
}).strict();
export type MarketplaceSettings = z.infer<typeof settingsSchema>;
export const defaultSettings: MarketplaceSettings = { name: "Agent Marketplace", organization: "Organization", accentColor: "#0067b8", logoId: "", approvalRequired: true, allowGuests: true, downloadsEnabled: true, secondReviewer: true, defaultRisk: "Medium", supportEmail: "" };

export interface Actor { id: string; tenantId: string; name: string; email: string; role: MarketplaceRole; guest: boolean; groups: string[]; local: boolean }
export interface PublishedVersion { number: number; publishedAt: string; publishedBy: string; reviewers: string[]; draft: AgentDraft }
export interface AgentRecord {
  id: string; ownerId: string; ownerName: string; ownerEmail: string; state: PublicationState; risk: RiskLevel;
  revision: number; draft: AgentDraft; reviewers: string[]; reviewNote: string;
  createdAt: string; updatedAt: string; versions: PublishedVersion[]; example: boolean;
}
export interface StoredFile {
  id: string; ownerId: string; kind: "icon" | "logo" | "solution"; name: string; mime: string; bytes: number; sha256: string; createdAt: string;
  width?: number; height?: number;
  solution?: { uniqueName: string; version: string; managed: boolean; entries: number };
}
export interface AccessRequest {
  id: string; agentId: string; requesterId: string; requesterName: string; requesterEmail: string;
  justification: string; state: "pending" | "approved" | "fulfilled" | "rejected" | "cancelled" | "revoked";
  note: string; updatedBy: string; createdAt: string; updatedAt: string; revision: number; deployment: string;
}
export interface RoleAssignment { id: string; subjectType: "user" | "group"; name: string; role: MarketplaceRole; email: string }
export interface AuditEntry { id: string; at: string; actorId: string; actorName: string; action: string; subjectId: string; detail: string }
export interface RegistryPackage { id: string; displayName: string; platform: string; isBlocked: boolean; availableTo: string; deployedTo: string; sourceAgentId?: string; allowedUsersAndGroups?: { resourceId: string; resourceType: string }[] }
export interface StoreDocument {
  schemaVersion: 1; revision: number; settingsRevision: number; settings: MarketplaceSettings; agents: AgentRecord[];
  community?: CommunityState;
  memberships?: Record<string, { groups: string[]; updatedAt: number }>;
  files: StoredFile[]; requests: AccessRequest[]; assignments: RoleAssignment[]; audit: AuditEntry[];
  favorites: Record<string, string[]>;
  registry: { packages: RegistryPackage[]; syncedAt: string; error: string };
}
export function emptyStore(): StoreDocument {
  return { schemaVersion: 1, revision: 0, settingsRevision: 0, settings: { ...defaultSettings }, agents: [], files: [], requests: [], assignments: [], audit: [], favorites: {}, registry: { packages: [], syncedAt: "", error: "" } };
}

export interface AgentSummary {
  id: string; name: string; summary: string; platform: AgentDraft["platform"]; category: string; ownerName: string;
  iconId: string; state: PublicationState; risk: RiskLevel; version: number; updatedAt: string;
  requestAccess: boolean; downloadable: boolean; hasLaunchUrl: boolean; saved: boolean; example: boolean; tags: string[];
  usageCount?: number; feedbackScore?: number;
}
export interface AccessResolution {
  state: "available" | "request-required" | "pending" | "approved" | "blocked" | "unknown";
  source: "owner-confirmation" | "microsoft-catalog" | "publisher" | "none";
  checkedAt: string; message: string; launchUrl: string; request?: AccessRequest;
}
export interface AgentDetail {
  summary: AgentSummary; overview: string; license: string; limitations: string; language: string;
  configuration: AgentDraft | null; access: AccessResolution; file: StoredFile | null;
  versions: { number: number; publishedAt: string; releaseNotes: string }[];
  canEdit: boolean; canReview: boolean; record?: AgentRecord;
  community?: { enabled: boolean; guestVisible: boolean; ownerProfileId?: string };
}

export interface Bootstrap {
  actor: Actor | null; settings: MarketplaceSettings; settingsRevision: number;
  local: boolean; identities: Pick<Actor, "id" | "name" | "role" | "guest">[]; authConfigured: boolean;
  counts: { approvals: number; requests: number }; blocked?: string;
  demo?: boolean;
}