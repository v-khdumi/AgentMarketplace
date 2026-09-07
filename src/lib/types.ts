export type AgentType = "M365 Copilot" | "Copilot Studio";
export type AgentStatus = "Publicat" | "În revizuire" | "Respins" | "Draft";
export type AccessMode = "Instant" | "Cerere acces" | "Descărcare";

export interface SuggestedPrompt {
  title: string;
  message: string;
}

export interface M365AgentBuilderConfig {
  model: "Auto" | "Quick response" | "Think deeper";
  icon: { fileType: "PNG"; resolution: "192x192"; maxSize: "1 MB" };
  knowledgeSources: { type: "SharePoint" | "Work content" | "Public website" | "Copilot connector"; name: string; location?: string }[];
  capabilities: { codeInterpreter: boolean; imageGenerator: boolean };
  limits: { name: 30; description: 1000; instructions: 8000; knowledgeSources: 20 };
}

export interface CopilotStudioConfig {
  environment: string;
  environmentId: string;
  solutionName: string;
  solutionVersion: string;
  solutionType: "Unmanaged" | "Managed";
  harness: "Standard" | "Copilot chat" | "GitHub Copilot";
  orchestration: "Generative" | "Classic";
  authentication: string;
  channels: string[];
  topics: string[];
  tools: string[];
  knowledgeSources: { name: string; type: string }[];
  dependencies: string[];
  connectionReferences: string[];
  environmentVariables: string[];
  packageFile: string;
}

export interface Agent {
  id: string;
  name: string;
  shortDescription: string;
  description: string;
  type: AgentType;
  category: string;
  author: string;
  authorInitials: string;
  color: string;
  status: AgentStatus;
  access: AccessMode;
  rating: number;
  users: number;
  updated: string;
  featured?: boolean;
  instructions: string;
  skills: string[];
  knowledge: string[];
  suggestedPrompts: SuggestedPrompt[];
  version: string;
  sourceAgentId?: string;
  agentRegistryId?: string;
  accessState: "Available" | "Request required" | "Owned";
  m365Config?: M365AgentBuilderConfig;
  studioConfig?: CopilotStudioConfig;
}

export interface MarketplaceUser {
  id: string;
  name: string;
  email: string;
  type: "Membru" | "Invitat B2B" | "Grup Entra";
  role: "Utilizator" | "Publisher" | "Administrator";
  status: "Activ" | "Invitat" | "Blocat";
}
