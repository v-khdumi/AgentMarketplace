import { randomUUID } from "node:crypto";
import type { Actor, StoreDocument } from "./contracts";
import { emptyCommunity, type CommunityTarget, type NotificationEvent } from "./community-contracts";

export const communityState = (state: StoreDocument) => state.community ??= emptyCommunity();
export function rememberRecipient(state: StoreDocument, actor: Pick<Actor, "id" | "email" | "guest" | "local"> & Partial<Pick<Actor, "role">>) {
  const previous = communityState(state).recipients[actor.id];
  communityState(state).recipients[actor.id] = { email: actor.email, guest: actor.guest, local: actor.local, role: actor.role ?? previous?.role };
}
export function followers(state: StoreDocument, target: CommunityTarget) {
  return communityState(state).subscriptions.filter(entry => entry.kind === target.kind && entry.targetId === target.id).map(entry => entry.userId);
}
export function subscribe(state: StoreDocument, userId: string, target: CommunityTarget, following: boolean) {
  const community = communityState(state);
  community.subscriptions = community.subscriptions.filter(entry => !(entry.userId === userId && entry.kind === target.kind && entry.targetId === target.id));
  if (following) community.subscriptions.push({ userId, kind: target.kind, targetId: target.id });
}
export function notify(state: StoreDocument, actor: Pick<Actor, "id" | "name">, recipients: string[], event: NotificationEvent, target: CommunityTarget) {
  const community = communityState(state);
  if (!community.policy.enabled) return;
  const createdAt = new Date().toISOString();
  for (const recipientId of new Set(recipients)) {
    if (recipientId === actor.id) continue;
    const id = randomUUID();
    community.notifications.push({ id, recipientId, event, target, actorName: actor.name, createdAt, readAt: "" });
    for (const channel of ["email", "teams"] as const) {
      if (!community.preferences[recipientId]?.[channel]) continue;
      community.deliveries.push({ id: randomUUID(), notificationId: id, recipientId, channel, state: "pending", attempts: 0, createdAt, nextAttemptAt: createdAt, leaseUntil: "", claimedBy: "", sentAt: "", error: "" });
    }
  }
}