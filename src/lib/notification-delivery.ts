import { randomUUID } from "node:crypto";
import { z } from "zod";
import { communityState } from "./community-events";
import { getRepository, type MarketplaceRepository } from "./repository";
import { graphToken } from "./integrations";
import { notificationChannels } from "./notification-config";
import { WorkflowError } from "./workflow";
import type { NotificationDelivery } from "./community-contracts";
import type { Actor, StoreDocument } from "./contracts";
import { CommunityService } from "./community";
import type { MarketplaceRole } from "./workflow";

export interface DeliveryMessage { channel: "email" | "teams"; email: string; id: string }
export async function sendNotification(message: DeliveryMessage) {
  const base = new URL(process.env.NEXTAUTH_URL ?? "");
  if (base.protocol !== "https:") throw new WorkflowError("External notifications require an HTTPS application URL.", 503);
  const inbox = new URL("/community?tab=notifications", base).href;
  const title = "Agent Marketplace";
  const text = `You have new marketplace updates. Sign in to view notifications: ${inbox}`;
  let response: Response;
  if (message.channel === "email") {
    if (!process.env.GRAPH_MAIL_SENDER || !z.email().safeParse(message.email).success) throw new WorkflowError("Configure a verified mail sender and recipient.", 503);
    response = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(process.env.GRAPH_MAIL_SENDER)}/sendMail`, {
      method: "POST", headers: { Authorization: `Bearer ${await graphToken()}`, "Content-Type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(20000),
      body: JSON.stringify({ message: { subject: title, body: { contentType: "Text", content: text }, toRecipients: [{ emailAddress: { address: message.email } }] }, saveToSentItems: true }),
    });
  } else {
    const webhook = new URL(process.env.TEAMS_NOTIFICATION_WEBHOOK ?? "");
    if (webhook.protocol !== "https:" || webhook.username || webhook.password || !/\.(logic\.azure\.com|api\.powerplatform\.com)$/i.test(webhook.hostname)) throw new WorkflowError("Configure an HTTPS Teams Workflows webhook.", 503);
    response = await fetch(webhook, { method: "POST", headers: { "Content-Type": "application/json" }, redirect: "error", signal: AbortSignal.timeout(20000), body: JSON.stringify({ type: "message", attachments: [{ contentType: "application/vnd.microsoft.card.adaptive", content: { type: "AdaptiveCard", version: "1.2", body: [{ type: "TextBlock", text: title, weight: "Bolder", wrap: true }, { type: "TextBlock", text: "New marketplace updates are available.", wrap: true }], actions: [{ type: "Action.OpenUrl", title: "Open notifications", url: inbox }] } }] }) });
  }
  if (!response.ok) throw new WorkflowError(`Notification provider returned HTTP ${response.status}.`, 502);
}

export async function dispatchNotifications(tenantId: string, repository: MarketplaceRepository = getRepository(), send: (message: DeliveryMessage) => Promise<void> = sendNotification) {
  const worker = randomUUID(); const timestamp = new Date().toISOString(); const limit = 5; const service = new CommunityService(repository);
  const recipientFor = (state: StoreDocument, delivery: NotificationDelivery) => {
    const community = communityState(state); const recipient = community.recipients[delivery.recipientId];
    const notification = community.notifications.find(entry => entry.id === delivery.notificationId && entry.recipientId === delivery.recipientId);
    if (!recipient || recipient.local || !notification || notification.readAt || !community.preferences[delivery.recipientId]?.[delivery.channel]) return null;
    const role: MarketplaceRole = ["reader", "publisher", "reviewer", "admin"].includes(recipient.role ?? "") ? recipient.role as MarketplaceRole : "reader";
    const actor: Actor = { id: delivery.recipientId, name: "", email: recipient.email, tenantId, guest: recipient.guest, local: false, role, groups: [] };
    return service.notificationVisible(state, actor, notification) ? recipient : null;
  };
  const batch = await repository.update(tenantId, (state) => {
    const community = communityState(state); const claimed: NotificationDelivery[] = [];
    for (const delivery of community.deliveries) {
      if (claimed.length >= limit) break;
      const due = ["pending", "failed"].includes(delivery.state) ? delivery.nextAttemptAt <= timestamp : delivery.state === "processing" && delivery.leaseUntil < timestamp;
      if (!due) continue;
      if (delivery.attempts >= 5) { if (delivery.state === "processing") { delivery.state = "failed"; delivery.error = "Delivery lease expired after the final attempt."; } continue; }
      if (!recipientFor(state, delivery)) { delivery.state = "cancelled"; continue; }
      delivery.state = "processing"; delivery.claimedBy = worker; delivery.attempts++; delivery.leaseUntil = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      claimed.push(structuredClone(delivery));
    }
    return claimed;
  });
  let sent = 0; let failed = 0; let cancelled = 0; let teamsSent = false;
  for (const delivery of batch) {
    const recipient = await repository.update(tenantId, state => {
      const entry = communityState(state).deliveries.find(item => item.id === delivery.id && item.claimedBy === worker && item.state === "processing");
      if (!entry) return null;
      const current = recipientFor(state, entry);
      if (!current) { entry.state = "cancelled"; entry.leaseUntil = ""; }
      return current;
    });
    if (!recipient) { cancelled++; continue; }
    let error = "";
    try {
      if (delivery.channel !== "teams" || !teamsSent) await send({ channel: delivery.channel, email: recipient.email, id: delivery.id });
      if (delivery.channel === "teams") teamsSent = true;
      sent++;
    } catch (failure) { error = failure instanceof WorkflowError ? failure.message : "Notification delivery failed. Check provider configuration and retry."; failed++; }
    await repository.update(tenantId, (state) => {
      const entry = communityState(state).deliveries.find(item => item.id === delivery.id && item.claimedBy === worker);
      if (!entry) return;
      entry.state = error ? "failed" : "sent"; entry.error = error; entry.sentAt = error ? "" : new Date().toISOString(); entry.leaseUntil = "";
      entry.nextAttemptAt = new Date(Date.now() + 60000 * 2 ** entry.attempts).toISOString();
    });
  }
  return { processed: batch.length, sent, failed, cancelled, channels: notificationChannels() };
}