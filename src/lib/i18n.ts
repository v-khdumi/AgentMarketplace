import type { Agent } from "./types";

export type Locale = "ro" | "en";

export const ui = {
  ro: {
    catalog: "Catalog", myAgents: "Agenții mei", publishAgent: "Publică agent", admin: "Administrare",
    signIn: "Autentificare", signOut: "Deconectare", language: "English",
    heroBadge: "Inteligență creată de colegi, pentru colegi", heroTitle: "Descoperă următorul tău", heroAccent: "agent AI preferat.",
    heroText: "Explorează agenți Microsoft 365 Copilot și Copilot Studio verificați, construiți pentru modul în care lucrează organizația ta.",
    searchPlaceholder: "Caută agenți, capabilități sau categorii...", search: "Caută", agentsAvailable: "agenți disponibili", averageRating: "rating mediu", activeUsers: "utilizatori activi",
    catalogKicker: "CATALOG", recommended: "Agenți recomandați", recommendedText: "Soluții verificate și aprobate de organizația ta", agents: "agenți", all: "Toate", noAgents: "Niciun agent găsit", noAgentsText: "Încearcă alți termeni sau elimină un filtru.", filterType: "Filtrează după tip",
    workspace: "SPAȚIUL MEU", manageAgents: "Administrează agenții creați și pe cei salvați.", created: "Agenți creați", published: "Publicați", inReview: "În revizuire", createdByMe: "Creați de mine", saved: "Salvați", accessRequests: "Cereri de acces",
    about: "Despre acest agent", instructions: "Instrucțiuni", skills: "Competențe", knowledge: "Surse de cunoaștere", tryPrompts: "Încearcă aceste solicitări", information: "Informații", agentType: "Tip agent", category: "Categorie", access: "Acces", status: "Status", approved: "Aprobat", governance: "Guvernanță și securitate", governanceText: "Acest agent a fost verificat conform politicilor organizației.", usagePolicy: "Vezi politica de utilizare", by: "de", users: "utilizatori", updated: "Actualizat", version: "Versiunea", save: "Salvează", openCopilot: "Deschide în Copilot", requestAccess: "Solicită acces", downloadSolution: "Descarcă soluția", verified: "Verificat",
    loginBadge: "Acces securizat Microsoft Entra", welcome: "Bine ai revenit.", loginText: "Folosește identitatea organizației tale sau un cont B2B invitat. Politicile de acces și MFA sunt aplicate de Microsoft Entra ID.", continueMicrosoft: "Continuă cu Microsoft", internalAccount: "Cont intern al organizației", b2bAccount: "Cont invitat B2B", sso: "Single Sign-On și MFA", loginConsent: "Prin autentificare accepți politica de utilizare acceptabilă.", ideas: "Ideile echipei tale.", available: "Disponibile tuturor.", ideasText: "Descoperă soluții AI sigure și aprobate, într-un singur loc.",
    notFound: "Pagina nu a fost găsită", notFoundText: "Agentul sau pagina solicitată nu există.", backCatalog: "Înapoi la catalog"
  },
  en: {
    catalog: "Catalog", myAgents: "My agents", publishAgent: "Publish agent", admin: "Administration",
    signIn: "Sign in", signOut: "Sign out", language: "Română",
    heroBadge: "Intelligence built by colleagues, for colleagues", heroTitle: "Discover your next", heroAccent: "favorite AI agent.",
    heroText: "Explore verified Microsoft 365 Copilot and Copilot Studio agents, built for the way your organization works.",
    searchPlaceholder: "Search agents, capabilities, or categories...", search: "Search", agentsAvailable: "agents available", averageRating: "average rating", activeUsers: "active users",
    catalogKicker: "CATALOG", recommended: "Recommended agents", recommendedText: "Solutions verified and approved by your organization", agents: "agents", all: "All", noAgents: "No agents found", noAgentsText: "Try different terms or remove a filter.", filterType: "Filter by type",
    workspace: "MY WORKSPACE", manageAgents: "Manage the agents you created and saved.", created: "Agents created", published: "Published", inReview: "In review", createdByMe: "Created by me", saved: "Saved", accessRequests: "Access requests",
    about: "About this agent", instructions: "Instructions", skills: "Skills", knowledge: "Knowledge sources", tryPrompts: "Try these prompts", information: "Information", agentType: "Agent type", category: "Category", access: "Access", status: "Status", approved: "Approved", governance: "Governance and security", governanceText: "This agent has been verified according to your organization’s policies.", usagePolicy: "View usage policy", by: "by", users: "users", updated: "Updated", version: "Version", save: "Save", openCopilot: "Open in Copilot", requestAccess: "Request access", downloadSolution: "Download solution", verified: "Verified",
    loginBadge: "Secure Microsoft Entra access", welcome: "Welcome back.", loginText: "Use your organization identity or a B2B guest account. Access and MFA policies are enforced by Microsoft Entra ID.", continueMicrosoft: "Continue with Microsoft", internalAccount: "Internal organization account", b2bAccount: "B2B guest account", sso: "Single Sign-On and MFA", loginConsent: "By signing in, you accept the acceptable use policy.", ideas: "Your team’s ideas.", available: "Available to everyone.", ideasText: "Discover secure and approved AI solutions, all in one place.",
    notFound: "Page not found", notFoundText: "The requested agent or page does not exist.", backCatalog: "Back to catalog"
  }
} as const;

export type Dictionary = typeof ui.ro;
export function getDictionary(locale: Locale): Dictionary { return ui[locale] as Dictionary; }

const categoryEn: Record<string, string> = { "Toate": "All", "Resurse umane": "Human Resources", "Vânzări": "Sales", "Productivitate": "Productivity", "Juridic": "Legal", "Sustenabilitate": "Sustainability" };
const accessEn: Record<string, Agent["access"]> = { "Instant": "Instant", "Cerere acces": "Cerere acces", "Descărcare": "Descărcare" };
const agentEn: Record<string, Partial<Agent>> = {
  "hr-companion": { shortDescription: "Quick answers about HR policies, benefits, and processes.", description: "A single access point for human resources information. It helps employees find policies, benefits, leave information, and forms using approved sources only.", instructions: "Provide concise, empathetic answers about internal policies. Always cite the source and recommend contacting HR for personal situations.", skills: ["Policy summaries", "Process guidance", "Benefits search"], knowledge: ["HR SharePoint", "Work content", "Web search disabled"], suggestedPrompts: [{ title: "Leave", message: "How do I request annual leave?" }, { title: "Benefits", message: "What medical benefits are available?" }] },
  "sales-proposal": { shortDescription: "Builds personalized sales proposals from CRM data.", description: "Generates proposal drafts, summarizes opportunities, and recommends next steps based on Dynamics 365 data and approved templates.", instructions: "Use a professional tone and never invent commercial values. Clearly flag missing information.", skills: ["Document generation", "Opportunity analysis", "CRM actions"], suggestedPrompts: [{ title: "New proposal", message: "Create a proposal for the current opportunity." }, { title: "Summary", message: "Summarize this customer’s history." }] },
  "it-helpdesk": { shortDescription: "Guided diagnostics and IT requests without wasted time.", description: "Resolves common incidents, searches the knowledge base, and creates tickets with all required information.", instructions: "Start with risk-free diagnostic steps. Never request passwords or perform destructive actions.", skills: ["Diagnostics", "Ticket creation", "Status check"], suggestedPrompts: [{ title: "Slow laptop", message: "My laptop is running slowly." }, { title: "Ticket status", message: "What is the status of my ticket?" }] },
  "meeting-insights": { shortDescription: "Turns meetings into clear decisions and actions.", description: "Finds relevant conversations in Teams and Outlook, prepares meetings, and consolidates assigned actions.", instructions: "Separate confirmed decisions from suggestions. Include an owner and due date only when stated.", skills: ["Meeting prep", "Action tracking", "Follow-up"], suggestedPrompts: [{ title: "Preparation", message: "Prepare me for my next meeting." }, { title: "Actions", message: "What actions do I have from this week’s meetings?" }] },
  "legal-review": { shortDescription: "Quickly identifies common contractual clauses and risks.", description: "A pre-assessment assistant for legal documents, based on the internal playbook. It does not replace legal approval.", instructions: "Flag deviations from the playbook and add a legal disclaimer. Do not provide legal advice.", skills: ["Clause comparison", "Risk flags", "Summary"], suggestedPrompts: [{ title: "Review", message: "Compare this contract with our playbook." }] },
  "sustainability": { shortDescription: "Recommendations and reporting for ESG initiatives.", description: "Helps teams find ESG targets, prepare reports, and discover relevant initiatives.", instructions: "Use verified figures only and state the reporting period.", skills: ["ESG reporting", "KPI lookup"], suggestedPrompts: [{ title: "Targets", message: "What are the ESG targets for the current year?" }] }
};

export function localizeAgent(agent: Agent, locale: Locale): Agent {
  if (locale === "ro") return agent;
  return { ...agent, ...agentEn[agent.id], category: categoryEn[agent.category] ?? agent.category, access: accessEn[agent.access] ?? agent.access };
}
export function localizeCategory(category: string, locale: Locale) { return locale === "en" ? categoryEn[category] ?? category : category; }
