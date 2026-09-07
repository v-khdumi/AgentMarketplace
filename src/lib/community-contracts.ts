import { z } from "zod";
import { categoryIds } from "./contracts";

const shortText = (maximum: number) => z.string().trim().max(maximum);
export const audienceSchema = z.enum(["members", "all"]);
export const profileSchema = z.object({
  headline: shortText(120), bio: shortText(2000), skills: z.array(shortText(40).min(1)).max(12),
  audience: audienceSchema, published: z.boolean(),
}).strict();
export const communityPolicySchema = z.object({
  enabled: z.boolean(), allowGuestParticipation: z.boolean(), rules: shortText(8000).min(20),
}).strict();
export type ProfileInput = z.infer<typeof profileSchema>;
export type CommunityPolicy = z.infer<typeof communityPolicySchema>;
export type Audience = z.infer<typeof audienceSchema>;
export const topicSchema = z.object({
  kind: z.enum(["discussion", "idea"]), agentId: shortText(100), title: shortText(160).min(4),
  body: shortText(8000).min(10), category: z.enum(categoryIds), audience: audienceSchema,
}).strict();
export const teamSchema = z.object({ name: shortText(80).min(2), description: shortText(4000).min(10), skills: z.array(shortText(40).min(1)).max(12), audience: audienceSchema }).strict();
export const replySchema = z.object({ body: shortText(8000).min(2) }).strict();
export const ideaStates = ["proposed", "in-progress", "available", "declined"] as const;
export type IdeaState = typeof ideaStates[number];
export type TargetKind = "agent" | "topic" | "profile" | "team";
export interface CommunityTarget { kind: TargetKind; id: string }
export interface CommunityTopic extends z.infer<typeof topicSchema> {
  id: string; authorId: string; authorName: string; revision: number; createdAt: string; updatedAt: string;
  hidden: boolean; deleted: boolean; acceptedReplyId: string; votes: string[]; state: IdeaState;
  assigneeId: string; assigneeName: string; linkedAgentId: string; decisionNote: string;
}
export interface CommunityReply {
  id: string; topicId: string; authorId: string; authorName: string; body: string;
  revision: number; createdAt: string; updatedAt: string; hidden: boolean; deleted: boolean;
}
export interface CommunityTeam extends z.infer<typeof teamSchema> {
  id: string; ownerId: string; ownerName: string; members: { id: string; name: string }[];
  revision: number; createdAt: string; updatedAt: string; hidden: boolean; archived: boolean;
}
export interface CommunityReport {
  id: string; targetKind: "topic" | "reply" | "profile" | "team"; targetId: string;
  reporterId: string; reporterName: string; reason: string; createdAt: string;
  state: "pending" | "resolved" | "dismissed"; revision: number; resolution: string; resolvedBy: string; resolvedAt: string;
}
export type NotificationEvent = "topic-created" | "reply-created" | "answer-accepted" | "idea-updated" | "team-joined" | "team-updated" | "agent-published" | "agent-submitted" | "review-completed" | "access-requested" | "access-updated" | "content-moderated";
export interface CommunityNotification {
  id: string; recipientId: string; event: NotificationEvent; target: CommunityTarget; actorName: string;
  createdAt: string; readAt: string;
}
export interface NotificationPreferences { email: boolean; teams: boolean }
export interface NotificationDelivery {
  id: string; recipientId: string; notificationId: string; channel: "email" | "teams";
  state: "pending" | "processing" | "sent" | "failed" | "cancelled"; attempts: number;
  createdAt: string; nextAttemptAt: string; leaseUntil: string; claimedBy: string; sentAt: string; error: string;
}
export interface CommunityProfile extends ProfileInput {
  id: string; name: string; guest: boolean; revision: number; hidden: boolean; updatedAt: string;
}
export interface CommunityState {
  policy: CommunityPolicy;
  policyRevision: number;
  profiles: CommunityProfile[];
  topics: CommunityTopic[];
  replies: CommunityReply[];
  teams: CommunityTeam[];
  reports: CommunityReport[];
  subscriptions: { userId: string; kind: TargetKind; targetId: string }[];
  notifications: CommunityNotification[];
  preferences: Record<string, NotificationPreferences>;
  recipients: Record<string, { email: string; guest: boolean; local: boolean; role?: string }>;
  deliveries: NotificationDelivery[];
}
export const defaultCommunityPolicy: CommunityPolicy = {
  enabled: true, allowGuestParticipation: false,
  rules: "Respect your colleagues. Do not post secrets, personal data or confidential source content. Share only material you are authorized to disclose. Report inappropriate content to the moderators.",
};
export function emptyCommunity(): CommunityState {
  return { policy: { ...defaultCommunityPolicy }, policyRevision: 0, profiles: [], topics: [], replies: [], teams: [], reports: [], subscriptions: [], notifications: [], preferences: {}, recipients: {}, deliveries: [] };
}

export interface TopicView extends Omit<CommunityTopic, "votes"> {
  voteCount: number; voted: boolean; replyCount: number; following: boolean; canEdit: boolean; canAccept: boolean; canManage: boolean;
}
export interface TopicDetail { topic: TopicView; replies: (CommunityReply & { canEdit: boolean })[] }
export interface NotificationView extends CommunityNotification { title: string; href: string }
export interface NotificationInbox { items: NotificationView[]; unread: number; preferences: NotificationPreferences; channels: { email: boolean; teams: boolean }; deliveries: Pick<NotificationDelivery, "id" | "channel" | "state" | "sentAt" | "error" | "createdAt">[] }