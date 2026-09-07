import { getServerSession } from "next-auth";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authOptions } from "./auth";
import { getRepository, isLocalMode, isPublicDemoMode } from "./repository";
import type { Actor, RoleAssignment } from "./contracts";
import { WorkflowError, type MarketplaceRole } from "./workflow";
import { isLoopbackRequest } from "./local-access";

export const localIdentities: Actor[] = [
  { id: "local-admin", tenantId: "local-tenant", name: "Local Administrator", email: "admin@example.test", role: "admin", guest: false, groups: [], local: true },
  { id: "local-publisher", tenantId: "local-tenant", name: "Local Publisher", email: "publisher@example.test", role: "publisher", guest: false, groups: [], local: true },
  { id: "local-reviewer", tenantId: "local-tenant", name: "Local Reviewer", email: "reviewer@example.test", role: "reviewer", guest: false, groups: [], local: true },
  { id: "local-reviewer-2", tenantId: "local-tenant", name: "Second Reviewer", email: "reviewer2@example.test", role: "reviewer", guest: false, groups: [], local: true },
  { id: "local-reader", tenantId: "local-tenant", name: "Local Reader", email: "reader@example.test", role: "reader", guest: false, groups: [], local: true },
  { id: "local-guest", tenantId: "local-tenant", name: "Local B2B Guest", email: "guest@example.test", role: "reader", guest: true, groups: [], local: true },
];
export const publicDemoActor = (): Actor => ({ id: "demo-admin", tenantId: process.env.DEMO_TENANT_ID ?? "agent-marketplace-demo", name: "Demo Administrator", email: "demo@example.invalid", role: "admin", guest: false, groups: [], local: false });

export function effectiveRole(actor: Actor, assignments: RoleAssignment[]): MarketplaceRole {
  if (actor.role === "admin") return actor.role;
  const personal = assignments.find((assignment) => assignment.subjectType === "user" && assignment.id === actor.id);
  if (personal) return personal.role;
  const rank: MarketplaceRole[] = ["reader", "publisher", "reviewer", "admin"];
  return assignments.filter((assignment) => assignment.subjectType === "group" && actor.groups.includes(assignment.id)).reduce<MarketplaceRole>((role, assignment) => rank.indexOf(assignment.role) > rank.indexOf(role) ? assignment.role : role, actor.role);
}

export async function getActor(): Promise<Actor | null> {
  let actor: Actor;
  if (isPublicDemoMode()) {
    return publicDemoActor();
  } else if (isLocalMode()) {
    if (!isLoopbackRequest(await headers())) return null;
    const id = (await cookies()).get("marketplace-local-user")?.value;
    actor = { ...(localIdentities.find((identity) => identity.id === id) ?? localIdentities[0]) };
  } else {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id || session.error || session.user.tenantId !== process.env.ENTRA_TENANT_ID) return null;
    const user = session.user;
    const role = user.isAdmin ? "admin" : user.roles?.includes("Marketplace.Reviewer") ? "reviewer" : user.roles?.includes("Marketplace.Publisher") ? "publisher" : "reader";
    actor = { id: user.id!, tenantId: user.tenantId!, name: user.name ?? user.email ?? "User", email: user.email ?? "", role, guest: user.guest ?? true, groups: user.groups ?? [], local: false };
  }
  const state = await getRepository().read(actor.tenantId);
  if (!actor.local) {
    actor.groups = state.memberships?.[actor.id]?.groups ?? [];
    const adminGroups = (process.env.ADMIN_GROUP_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
    if (actor.groups.some((id) => adminGroups.includes(id))) actor.role = "admin";
  }
  actor.role = effectiveRole(actor, state.assignments);
  return actor;
}

export async function requireActor(roles?: MarketplaceRole[]) {
  const actor = await getActor();
  if (!actor) throw new WorkflowError("Sign in to continue.", 401);
  if (actor.guest && !(await getRepository().read(actor.tenantId)).settings.allowGuests) throw new WorkflowError("Guest access is disabled by the administrator.", 403);
  if (roles && !roles.includes(actor.role)) throw new WorkflowError("You do not have permission for this action.", 403);
  return actor;
}

export async function requirePageActor(roles?: MarketplaceRole[]) {
  const actor = await getActor();
  if (!actor) redirect("/login");
  if (actor.guest && !(await getRepository().read(actor.tenantId)).settings.allowGuests) redirect("/login?error=GuestDisabled");
  if (roles && !roles.includes(actor.role)) redirect("/?notice=forbidden");
  return actor;
}