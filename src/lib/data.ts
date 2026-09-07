import type { Agent, MarketplaceUser } from "./types";

const m365Config = (site: string): NonNullable<Agent["m365Config"]> => ({
  model: "Auto",
  icon: { fileType: "PNG", resolution: "192x192", maxSize: "1 MB" },
  knowledgeSources: [{ type: "SharePoint", name: site, location: `https://contoso.sharepoint.com/sites/${site.replaceAll(" ", "")}` }, { type: "Work content", name: "Outlook and Teams" }],
  capabilities: { codeInterpreter: false, imageGenerator: false },
  limits: { name: 30, description: 1000, instructions: 8000, knowledgeSources: 20 },
});
const studioConfig = (name: string): NonNullable<Agent["studioConfig"]> => ({
  environment: "Contoso Production", environmentId: "Default-11111111-2222-3333-4444-555555555555", solutionName: name.replaceAll(" ", ""), solutionVersion: "1.0.0.0", solutionType: "Managed", harness: "Standard", orchestration: "Generative", authentication: "Authenticate with Microsoft", channels: ["Microsoft Teams", "Microsoft 365 Copilot"], topics: ["Conversation start", "Escalate", "Fallback"], tools: ["Power Automate cloud flow"], knowledgeSources: [{ name: "Approved SharePoint knowledge", type: "SharePoint" }], dependencies: ["Microsoft Copilot Studio base solution"], connectionReferences: ["shared_commondataserviceforapps"], environmentVariables: ["Contoso_BaseUrl"], packageFile: `${name.replaceAll(" ", "")}_1_0_0_0_managed.zip`,
});

export const agents: Agent[] = [
  {
    id: "hr-companion", name: "HR Companion", shortDescription: "Răspunsuri rapide despre politici, beneficii și procese HR.",
    description: "Un punct unic de acces la informațiile de resurse umane. Ajută angajații să găsească politici, beneficii, zile libere și formulare, folosind exclusiv surse aprobate.",
    type: "M365 Copilot", category: "Resurse umane", author: "People & Culture", authorInitials: "HR", color: "#5b5fc7", status: "Publicat", access: "Instant", rating: 4.9, users: 1284, updated: "28 aug. 2026", featured: true, version: "1.8.0",
    instructions: "Oferă răspunsuri concise și empatice despre politicile interne. Citează întotdeauna sursa și recomandă contactarea HR pentru situații personale.",
    skills: ["Rezumat politici", "Ghidare procese", "Căutare beneficii"], knowledge: ["SharePoint HR", "Work content", "Web search dezactivat"],
    suggestedPrompts: [{ title: "Concediu", message: "Cum solicit concediu de odihnă?" }, { title: "Beneficii", message: "Ce beneficii medicale sunt disponibile?" }], sourceAgentId: "da-hr-companion", agentRegistryId: "a365-hr-001", accessState: "Available", m365Config: m365Config("HR Knowledge")
  },
  {
    id: "sales-proposal", name: "Sales Proposal Builder", shortDescription: "Construiește propuneri comerciale personalizate din date CRM.",
    description: "Generează drafturi de propuneri, rezumă oportunități și recomandă următorii pași pe baza datelor Dynamics 365 și a șabloanelor aprobate.",
    type: "Copilot Studio", category: "Vânzări", author: "Sales Excellence", authorInitials: "SE", color: "#0078d4", status: "Publicat", access: "Descărcare", rating: 4.8, users: 846, updated: "25 aug. 2026", featured: true, version: "2.3.1",
    instructions: "Folosește ton profesional și nu inventa valori comerciale. Marchează informațiile lipsă.", skills: ["Generare document", "Analiză oportunitate", "Acțiuni CRM"], knowledge: ["Dynamics 365 Sales", "SharePoint Templates", "Outlook"],
    suggestedPrompts: [{ title: "Propunere nouă", message: "Creează o propunere pentru oportunitatea curentă." }, { title: "Rezumat", message: "Rezumă istoricul acestui client." }], sourceAgentId: "cs-sales-proposal", agentRegistryId: "a365-sales-002", accessState: "Owned", studioConfig: studioConfig("Sales Proposal Builder")
  },
  {
    id: "it-helpdesk", name: "IT Helpdesk Assistant", shortDescription: "Diagnosticare ghidată și solicitări IT fără timp pierdut.",
    description: "Rezolvă incidente uzuale, caută în baza de cunoștințe și creează tichete cu toate informațiile necesare.", type: "Copilot Studio", category: "IT & Support", author: "Digital Workplace", authorInitials: "IT", color: "#008272", status: "Publicat", access: "Cerere acces", rating: 4.7, users: 2103, updated: "20 aug. 2026", version: "3.0.0",
    instructions: "Începe cu pași de diagnosticare fără risc. Nu solicita parole și nu efectua acțiuni distructive.", skills: ["Diagnosticare", "Creare tichet", "Verificare status"], knowledge: ["ServiceNow connector", "Knowledge Base", "Teams"],
    suggestedPrompts: [{ title: "Laptop lent", message: "Laptopul meu funcționează lent." }, { title: "Status tichet", message: "Care este statusul tichetului meu?" }], sourceAgentId: "cs-it-helpdesk", agentRegistryId: "a365-it-003", accessState: "Request required", studioConfig: { ...studioConfig("IT Helpdesk Assistant"), tools: ["Create ServiceNow ticket", "Get incident status"], connectionReferences: ["shared_service-now", "shared_office365users"] }
  },
  {
    id: "meeting-insights", name: "Meeting Insights", shortDescription: "Transformă întâlnirile în decizii și acțiuni clare.",
    description: "Găsește discuții relevante în Teams și Outlook, pregătește întâlniri și consolidează acțiunile asumate.", type: "M365 Copilot", category: "Productivitate", author: "Modern Work", authorInitials: "MW", color: "#c239b3", status: "Publicat", access: "Instant", rating: 4.6, users: 1572, updated: "18 aug. 2026", version: "1.4.2",
    instructions: "Separă deciziile confirmate de sugestii. Include responsabil și termen numai dacă sunt menționate.", skills: ["Meeting prep", "Action tracking", "Follow-up"], knowledge: ["Teams", "Outlook", "Work content"],
    suggestedPrompts: [{ title: "Pregătire", message: "Pregătește-mă pentru următoarea întâlnire." }, { title: "Acțiuni", message: "Ce acțiuni am din întâlnirile acestei săptămâni?" }], sourceAgentId: "da-meeting-insights", agentRegistryId: "a365-meeting-004", accessState: "Available", m365Config: { ...m365Config("Modern Work"), knowledgeSources: [{ type: "Work content", name: "Teams chats and meetings" }, { type: "Work content", name: "Outlook email and calendar" }] }
  },
  {
    id: "legal-review", name: "Contract Review Guide", shortDescription: "Identifică rapid clauze și riscuri contractuale uzuale.",
    description: "Asistent de pre-evaluare pentru documente juridice, bazat pe playbook-ul intern. Nu înlocuiește aprobarea juridică.", type: "M365 Copilot", category: "Juridic", author: "Legal Operations", authorInitials: "LO", color: "#ca5010", status: "Publicat", access: "Cerere acces", rating: 4.8, users: 391, updated: "12 aug. 2026", version: "1.2.0",
    instructions: "Semnalează abaterile de la playbook și adaugă disclaimer juridic. Nu acorda consultanță juridică.", skills: ["Comparare clauze", "Risk flags", "Rezumat"], knowledge: ["Legal Playbook", "SharePoint Legal"],
    suggestedPrompts: [{ title: "Revizuire", message: "Compară acest contract cu playbook-ul nostru." }], sourceAgentId: "da-contract-review", agentRegistryId: "a365-legal-005", accessState: "Request required", m365Config: m365Config("Legal Playbook")
  },
  {
    id: "sustainability", name: "Sustainability Advisor", shortDescription: "Recomandări și raportare pentru inițiative ESG.",
    description: "Ajută echipele să găsească țintele ESG, să pregătească rapoarte și să descopere inițiative relevante.", type: "Copilot Studio", category: "Sustenabilitate", author: "ESG Office", authorInitials: "ES", color: "#498205", status: "Publicat", access: "Descărcare", rating: 4.5, users: 218, updated: "5 aug. 2026", version: "1.0.3",
    instructions: "Folosește numai valori verificate și precizează perioada de raportare.", skills: ["ESG reporting", "KPI lookup"], knowledge: ["Dataverse", "Sustainability reports"],
    suggestedPrompts: [{ title: "Ținte", message: "Care sunt țintele ESG pentru anul curent?" }], sourceAgentId: "cs-sustainability", agentRegistryId: "a365-esg-006", accessState: "Owned", studioConfig: { ...studioConfig("Sustainability Advisor"), knowledgeSources: [{ name: "ESG Dataverse tables", type: "Dataverse" }] }
  }
];

export const users: MarketplaceUser[] = [
  { id: "1", name: "Ana Popescu", email: "ana.popescu@contoso.com", type: "Membru", role: "Administrator", status: "Activ" },
  { id: "2", name: "Mihai Ionescu", email: "mihai.ionescu@contoso.com", type: "Membru", role: "Publisher", status: "Activ" },
  { id: "3", name: "Sofia Marin", email: "sofia_marin#EXT#@contoso.onmicrosoft.com", type: "Invitat B2B", role: "Utilizator", status: "Activ" },
  { id: "4", name: "Agent Publishers", email: "agent-publishers@contoso.com", type: "Grup Entra", role: "Publisher", status: "Activ" },
  { id: "5", name: "Radu Ene", email: "radu.ene@fabrikam.com", type: "Invitat B2B", role: "Utilizator", status: "Invitat" }
];

export const categories = ["Toate", ...Array.from(new Set(agents.map((agent) => agent.category)))];

export function getAgent(id: string) { return agents.find((agent) => agent.id === id); }
