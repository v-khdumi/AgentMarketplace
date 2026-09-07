import { agents } from "./data";
import { newDraft, type AgentRecord, type AgentDraft } from "./contracts";
import { emptyCommunity, type CommunityState } from "./community-contracts";

const categories: Record<string, AgentDraft["category"]> = { "Resurse umane": "hr", "Vânzări": "sales", "IT & Support": "it", "Productivitate": "productivity", "Juridic": "legal", "Sustenabilitate": "sustainability" };

export function exampleAgents(): AgentRecord[] {
  return agents.map((agent) => {
    const draft = newDraft(agent.type === "M365 Copilot" ? "agent-builder" : "copilot-studio");
    Object.assign(draft, { name: agent.name, summary: agent.shortDescription, overview: agent.description, description: agent.description, instructions: agent.instructions, category: categories[agent.category] ?? "other", prompts: agent.suggestedPrompts, tags: [...agent.skills, ...agent.knowledge].slice(0, 20), license: "Confirm the required Microsoft licenses with your tenant administrator.", limitations: "Example configuration. Supply your own knowledge locations and deployed agent before publishing." });
    if (draft.platform === "agent-builder" && agent.m365Config) {
      draft.builder = { model: agent.m365Config.model, onlyUseKnowledge: false, codeInterpreter: agent.m365Config.capabilities.codeInterpreter, imageGenerator: agent.m365Config.capabilities.imageGenerator, knowledge: agent.m365Config.knowledgeSources.map((source) => ({ ...source, location: source.location ?? source.name, settings: "" })) };
    }
    if (draft.platform === "copilot-studio" && agent.studioConfig) {
      const config = agent.studioConfig;
      draft.studio = { environment: config.environment, environmentId: config.environmentId, solutionName: config.solutionName, solutionVersion: config.solutionVersion, solutionType: config.solutionType, harness: config.harness, orchestration: config.orchestration, authentication: config.authentication, channels: config.channels, knowledge: config.knowledgeSources.map((source) => ({ ...source, location: "", settings: "" })), topics: config.topics.map((name) => ({ name, configuration: "" })), tools: config.tools.map((name) => ({ name, configuration: "" })), connectionReferences: config.connectionReferences.map((name) => ({ name, configuration: "" })), environmentVariables: config.environmentVariables.map((name) => ({ name, configuration: "" })), dependencies: config.dependencies };
    }
    const timestamp = "2026-09-01T08:00:00.000Z";
    return { id: agent.id, ownerId: "local-publisher", ownerName: agent.author, ownerEmail: "", state: "published", risk: "Medium", revision: 1, draft, reviewers: [], reviewNote: "", createdAt: timestamp, updatedAt: timestamp, versions: [{ number: 1, publishedAt: timestamp, publishedBy: "local-publisher", reviewers: [], draft: structuredClone(draft) }], example: true };
  });
}

export function exampleCommunity(): CommunityState {
  const community = emptyCommunity();
  community.policy.rules = "This is a read-only public demo. Explore profiles, discussions, ideas, and teams. Do not enter confidential information.";
  community.profiles = [
    { id: "local-publisher", name: "Modern Work", guest: false, headline: "Microsoft 365 Copilot makers", bio: "We build governed agents that turn everyday work into repeatable outcomes.", skills: ["Agent Builder", "Copilot Studio", "Governance"], audience: "all", published: true, revision: 1, hidden: false, updatedAt: "2026-09-01T09:00:00.000Z" },
    { id: "people-culture", name: "People & Culture", guest: false, headline: "Employee experience creators", bio: "A cross-functional team improving access to trusted HR knowledge.", skills: ["HR", "Knowledge management"], audience: "all", published: true, revision: 1, hidden: false, updatedAt: "2026-09-02T09:00:00.000Z" },
  ];
  community.topics = [
    { id: "demo-discussion", kind: "discussion", agentId: "hr-companion", title: "How are policy answers kept current?", body: "Which review process keeps the HR knowledge sources and starter prompts aligned with approved policy changes?", category: "hr", audience: "all", authorId: "people-culture", authorName: "People & Culture", revision: 2, createdAt: "2026-09-02T10:00:00.000Z", updatedAt: "2026-09-03T11:00:00.000Z", hidden: false, deleted: false, acceptedReplyId: "demo-reply", votes: [], state: "proposed", assigneeId: "", assigneeName: "", linkedAgentId: "", decisionNote: "" },
    { id: "demo-idea", kind: "idea", agentId: "", title: "Agent for policy renewal reminders", body: "Notify content owners before policies expire and provide a governed checklist for review and republication.", category: "productivity", audience: "all", authorId: "people-culture", authorName: "People & Culture", revision: 2, createdAt: "2026-09-03T10:00:00.000Z", updatedAt: "2026-09-04T12:00:00.000Z", hidden: false, deleted: false, acceptedReplyId: "", votes: ["demo-voter-1", "demo-voter-2", "demo-voter-3"], state: "in-progress", assigneeId: "local-publisher", assigneeName: "Modern Work", linkedAgentId: "", decisionNote: "Prototype and source-permission review are in progress." },
  ];
  community.replies = [{ id: "demo-reply", topicId: "demo-discussion", authorId: "local-publisher", authorName: "Modern Work", body: "Owners review sources quarterly and submit every configuration change through an independent marketplace approval.", revision: 1, createdAt: "2026-09-03T11:00:00.000Z", updatedAt: "2026-09-03T11:00:00.000Z", hidden: false, deleted: false }];
  community.teams = [{ id: "demo-team", name: "Copilot Makers Guild", description: "Creators, reviewers, and knowledge owners sharing practical patterns for governed internal agents.", skills: ["Agent Builder", "Copilot Studio", "Responsible AI"], audience: "all", ownerId: "local-publisher", ownerName: "Modern Work", members: [{ id: "local-publisher", name: "Modern Work" }, { id: "people-culture", name: "People & Culture" }], revision: 1, createdAt: "2026-09-01T08:00:00.000Z", updatedAt: "2026-09-04T08:00:00.000Z", hidden: false, archived: false }];
  return community;
}