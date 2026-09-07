import { ClientSecretCredential, ManagedIdentityCredential, type TokenCredential } from "@azure/identity";
import { z } from "zod";
import { entraConfigured } from "./auth";
import { getRepository } from "./repository";
import { WorkflowError } from "./workflow";
import type { Actor, RegistryPackage } from "./contracts";

export const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
export const CATALOG_PATH = "/copilot/admin/catalog/packages";
let credential: TokenCredential | undefined;

export function graphConfigured() {
  return process.env.GRAPH_AUTH_MODE === "managed-identity" || (process.env.GRAPH_AUTH_MODE === "client-secret" && Boolean(process.env.ENTRA_TENANT_ID && process.env.GRAPH_CLIENT_ID && process.env.GRAPH_CLIENT_SECRET));
}

export async function graphToken() {
  if (!graphConfigured()) throw new WorkflowError("Configure Microsoft Graph credentials in Azure App Service or the local environment.", 503);
  credential ??= process.env.GRAPH_AUTH_MODE === "client-secret"
    ? new ClientSecretCredential(process.env.ENTRA_TENANT_ID!, process.env.GRAPH_CLIENT_ID!, process.env.GRAPH_CLIENT_SECRET!)
    : new ManagedIdentityCredential(process.env.AZURE_CLIENT_ID ? { clientId: process.env.AZURE_CLIENT_ID } : {});
  try {
    const token = await credential.getToken("https://graph.microsoft.com/.default", { abortSignal: AbortSignal.timeout(15000) });
    if (!token) throw new Error("No token");
    return token.token;
  } catch { throw new WorkflowError("Microsoft credential acquisition failed. Check the managed identity or app registration.", 503); }
}

async function graphGet(url: string) {
  if (!url.startsWith(`${GRAPH_ROOT}/`)) throw new WorkflowError("Invalid Microsoft Graph URL.", 400);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${await graphToken()}`, ConsistencyLevel: "eventual" }, cache: "no-store", signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new WorkflowError(`Microsoft Graph returned HTTP ${response.status}. Check application permissions, admin consent and, for the registry, the Agent 365 license.`, response.status === 429 ? 429 : 502);
  return response.json();
}

const packageSchema = z.object({ id: z.string(), displayName: z.string().default("Unnamed agent"), platform: z.string().default(""), isBlocked: z.boolean().default(false), availableTo: z.string().default("unknown"), deployedTo: z.string().default("unknown"), manifestId: z.string().optional(), allowedUsersAndGroups: z.array(z.object({ resourceId: z.string(), resourceType: z.string() })).optional() });

export function normalizePackage(input: unknown): RegistryPackage | null {
  const result = packageSchema.safeParse(input);
  if (!result.success) return null;
  const entry = result.data;
  const platform = entry.platform.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!["copilotstudio", "microsoft365copilotagentbuilder", "m365copilotagentbuilder"].includes(platform)) return null;
  return { id: entry.id, displayName: entry.displayName, platform: platform === "copilotstudio" ? "Copilot Studio" : "Microsoft 365 Copilot Agent Builder", isBlocked: entry.isBlocked, availableTo: entry.availableTo.toLowerCase(), deployedTo: entry.deployedTo.toLowerCase(), sourceAgentId: entry.manifestId, allowedUsersAndGroups: entry.allowedUsersAndGroups };
}

export function packageAvailableTo(entry: RegistryPackage, actor: Pick<Actor, "id" | "groups">) {
  if (entry.isBlocked) return false;
  if (entry.availableTo === "all") return true;
  return entry.availableTo === "some" && Boolean(entry.allowedUsersAndGroups?.some((target) => target.resourceType.toLowerCase() === "user" ? target.resourceId === actor.id : target.resourceType.toLowerCase() === "group" && actor.groups.includes(target.resourceId)));
}

export async function registryPackages() {
  let next: string | undefined = `${GRAPH_ROOT}${CATALOG_PATH}?${new URLSearchParams({ "$filter": "platform eq 'Copilot Studio' or platform eq 'Microsoft 365 Copilot Agent Builder'" })}`;
  const result: RegistryPackage[] = [];
  for (let page = 0; next && page < 100; page++) {
    const data = await graphGet(next) as { value?: unknown[]; "@odata.nextLink"?: string };
    if (!Array.isArray(data.value)) throw new WorkflowError("Microsoft Graph returned an unexpected registry response.", 502);
    for (const raw of data.value) { const entry = normalizePackage(raw); if (entry) result.push(entry); }
    next = data["@odata.nextLink"];
  }
  if (next) throw new WorkflowError("Registry pagination limit reached; the inventory was not replaced.", 502);
  return result;
}

export async function registryPackage(id: string) {
  const entry = normalizePackage(await graphGet(`${GRAPH_ROOT}${CATALOG_PATH}/${encodeURIComponent(id)}`));
  if (!entry) throw new WorkflowError("This package is not an Agent Builder or Copilot Studio agent.", 422);
  return entry;
}

export async function directorySearch(query: string, type: "user" | "group") {
  const collection = type === "user" ? "users" : "groups";
  const params = new URLSearchParams({ "$select": type === "user" ? "id,displayName,mail,userPrincipalName,userType" : "id,displayName,mail", "$top": "30", "$filter": `startswith(displayName,'${query.replaceAll("'", "''")}')`, "$count": "true" });
  const response = await graphGet(`${GRAPH_ROOT}/${collection}?${params}`) as { value?: { id: string; displayName: string; mail?: string; userPrincipalName?: string; userType?: string }[] };
  return (response.value ?? []).map((entry) => ({ id: entry.id, name: entry.displayName, email: entry.mail ?? entry.userPrincipalName ?? "", subjectType: type, guest: entry.userType === "Guest" }));
}

export async function directoryObject(id: string, type: "user" | "group") {
  if (!z.uuid().safeParse(id).success) throw new WorkflowError("Select a valid Microsoft Entra identity.", 422);
  const entry = await graphGet(`${GRAPH_ROOT}/${type === "user" ? "users" : "groups"}/${encodeURIComponent(id)}?$select=id,displayName,mail`) as { id: string; displayName: string; mail?: string };
  return { id: entry.id, name: entry.displayName, email: entry.mail ?? "", subjectType: type };
}

export function integrationConfiguration() {
  return [
    { id: "entra", name: "Microsoft Entra ID", configured: entraConfigured(), variables: ["ENTRA_TENANT_ID", "ENTRA_CLIENT_ID", "ENTRA_CLIENT_SECRET", "NEXTAUTH_URL", "NEXTAUTH_SECRET"], permissions: "openid profile email offline_access User.Read", docs: "https://learn.microsoft.com/entra/identity-platform/quickstart-register-app" },
    { id: "storage", name: "Marketplace storage", configured: Boolean(process.env.AZURE_STORAGE_ACCOUNT), variables: ["AZURE_STORAGE_ACCOUNT", "AZURE_STORAGE_CONTAINER"], permissions: "Storage Blob Data Contributor", docs: "https://learn.microsoft.com/azure/storage/blobs/assign-azure-role-data-access" },
    { id: "directory", name: "Entra users and groups", configured: graphConfigured(), variables: ["GRAPH_AUTH_MODE"], permissions: "User.Read.All, Group.Read.All (application)", docs: "https://learn.microsoft.com/graph/permissions-reference" },
    { id: "registry", name: "Microsoft Agent 365", configured: graphConfigured(), variables: ["GRAPH_AUTH_MODE"], permissions: "CopilotPackages.Read.All (application); Agent 365 license", docs: "https://learn.microsoft.com/microsoft-365/copilot/extensibility/api/admin-settings/package/copilotpackages-list" },
  ];
}

export async function testIntegration(id: string, actor: Actor) {
  const checkedAt = new Date().toISOString();
  if (id === "storage") {
    const kind = await getRepository().check(true);
    return { id, checkedAt, status: "verified", message: kind === "local" ? "Local server storage: read, write and delete verified. Azure is not configured." : "Azure Blob Storage: read, write and delete verified." };
  }
  if (id === "entra") {
    if (!entraConfigured()) throw new WorkflowError("Complete the Entra configuration in the deployment environment.", 503);
    if (!actor.local) return { id, checkedAt, status: "verified", message: "The current Entra session, tenant and identity were verified." };
    const result = await fetch(`https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/v2.0/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!result.ok) throw new WorkflowError("The Entra authority could not be reached.", 502);
    return { id, checkedAt, status: "partial", message: "Authority metadata is reachable. A real sign-in is still required to verify the client and callback." };
  }
  if (id === "directory") { await directorySearch("A", "user"); await directorySearch("A", "group"); return { id, checkedAt, status: "verified", message: "Microsoft Graph accepted user and group queries." }; }
  if (id === "registry") { const entries = await registryPackages(); return { id, checkedAt, status: "verified", message: `Microsoft Graph returned ${entries.length} supported agents.` }; }
  throw new WorkflowError("Integration not found.", 404);
}