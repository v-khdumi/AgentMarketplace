import type { AgentSummary } from "./contracts";
import type { Locale } from "./i18n";

export const categoryNames: Record<string, [string, string]> = { productivity: ["Productivitate", "Productivity"], hr: ["Resurse umane", "Human resources"], sales: ["Vânzări", "Sales"], it: ["IT și suport", "IT and support"], legal: ["Juridic", "Legal"], sustainability: ["Sustenabilitate", "Sustainability"], finance: ["Finanțe", "Finance"], other: ["Altele", "Other"] };
export const stateNames: Record<string, [string, string]> = {
  draft: ["Ciornă", "Draft"], "in-review": ["În revizuire", "In review"], "changes-requested": ["Modificări solicitate", "Changes requested"], published: ["Publicat", "Published"], archived: ["Arhivat", "Archived"],
  pending: ["În așteptare", "Pending"], approved: ["Aprobat, partajare în așteptare", "Approved, sharing pending"], fulfilled: ["Partajare confirmată", "Sharing confirmed"], rejected: ["Respins", "Rejected"], cancelled: ["Anulat", "Cancelled"], revoked: ["Acces retras", "Revoked"],
  available: ["Disponibil", "Available"], "request-required": ["Necesită aprobare", "Approval required"], blocked: ["Blocat", "Blocked"], unknown: ["Neconfirmat", "Unconfirmed"],
  Low: ["Scăzut", "Low"], Medium: ["Mediu", "Medium"], High: ["Ridicat", "High"], Critical: ["Critic", "Critical"],
  reader: ["Cititor", "Reader"], publisher: ["Creator", "Publisher"], reviewer: ["Evaluator", "Reviewer"], admin: ["Administrator", "Administrator"],
};
export function categoryName(value: string, locale: Locale) { return categoryNames[value]?.[locale === "ro" ? 0 : 1] ?? value; }
export function stateName(value: string, locale: Locale) { return stateNames[value]?.[locale === "ro" ? 0 : 1] ?? value; }
export function formatDate(value: string, locale: Locale, time = false) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? "" : new Intl.DateTimeFormat(locale === "ro" ? "ro-RO" : "en-GB", { dateStyle: "medium", ...(time ? { timeStyle: "short" as const } : {}) }).format(date);
}
const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
export interface CatalogFilters { query: string; category: string; platform: string; access: string; saved: boolean; sort: string }
export function filterCatalog(agents: AgentSummary[], filters: CatalogFilters) {
  const terms = normalize(filters.query).split(/\s+/).filter(Boolean);
  return agents.filter((agent) => {
    const platform = agent.platform === "agent-builder" ? "Microsoft 365 Copilot M365 Agent Builder" : "Copilot Studio";
    const haystack = normalize(`${agent.name} ${agent.summary} ${agent.ownerName} ${platform} ${(categoryNames[agent.category] ?? []).join(" ")} ${agent.tags.join(" ")}`);
    return terms.every((term) => haystack.includes(term)) && (!filters.category || agent.category === filters.category) && (!filters.platform || agent.platform === filters.platform) && (!filters.saved || agent.saved) && (filters.access === "all" || (filters.access === "download" && agent.downloadable) || (filters.access === "request" && agent.requestAccess) || (filters.access === "direct" && agent.hasLaunchUrl && !agent.requestAccess));
  }).sort((first, second) => filters.sort === "name" ? first.name.localeCompare(second.name) : second.updatedAt.localeCompare(first.updatedAt) || first.name.localeCompare(second.name));
}

const errors: Record<string, string> = {
  "Required": "Obligatoriu", "Check the required fields.": "Verifică toate câmpurile obligatorii.",
  "Sign in to continue.": "Autentifică-te pentru a continua.",
  "This record changed. Reload it before saving.": "Înregistrarea a fost modificată. Reîncarcă înainte de salvare.",
  "Authors cannot review their own submissions.": "Autorii nu își pot evalua propriile solicitări.",
  "A different reviewer must provide the next approval.": "Următoarea aprobare trebuie acordată de un alt evaluator.",
  "Explain which changes are required.": "Precizează modificările necesare.",
  "Provide a business justification of at least 10 characters.": "Introdu o justificare de cel puțin 10 caractere.",
  "An active request already exists.": "Există deja o cerere activă.",
  "A decision note is required.": "Motivul deciziei este obligatoriu.",
  "Guest access is disabled by the administrator.": "Accesul invitaților a fost dezactivat de administrator.",
  "Solution downloads are disabled by policy.": "Descărcarea soluțiilor este dezactivată prin politică.",
  "Malware scanning has not returned a clean result yet. Retry later.": "Scanarea antimalware nu a confirmat încă fișierul. Reîncearcă mai târziu.",
  "This file was blocked by malware scanning.": "Fișierul a fost blocat de scanarea antimalware.",
  "Agent Builder icons must be 192 x 192 PNG images.": "Iconurile Agent Builder trebuie să fie PNG de 192 x 192 pixeli.",
  "Solution metadata does not match the uploaded ZIP.": "Metadatele soluției nu corespund arhivei încărcate.",
  "The operation could not be completed. Check the service configuration and retry.": "Operația nu a putut fi finalizată. Verifică starea serviciilor și reîncearcă.",
  "You do not have permission for this action.": "Nu ai permisiunea necesară pentru această acțiune.",
  "Publisher permission is required.": "Este necesar rolul de creator.",
  "Reviewer permission is required.": "Este necesar rolul de evaluator.",
  "Administrator permission is required.": "Este necesar rolul de administrator.",
  "Only the publisher can edit this agent.": "Doar creatorul poate edita acest agent.",
  "Agent not found.": "Agentul nu a fost găsit.",
  "Configure Microsoft Graph credentials in Azure App Service or the local environment.": "Configurează identitatea Microsoft Graph în Azure App Service sau în mediul local.",
  "Complete the Entra configuration in the deployment environment.": "Completează configurația Entra în mediul de deployment.",
  "Microsoft credential acquisition failed. Check the managed identity or app registration.": "Autentificarea serviciului Microsoft nu a reușit. Verifică Managed Identity sau App Registration.",
  "Provide the actual agent launch URL or an importable solution.": "Introdu linkul real al agentului sau o soluție importabilă.",
  "Upload a Power Platform solution ZIP.": "Încarcă o soluție Power Platform ZIP.",
  "Each source needs its type, name and exact location or scope.": "Fiecare sursă necesită tipul, numele și locația sau domeniul exact.",
  "Complete or remove empty prompts.": "Completează sau elimină solicitările goale.",
  "Source environment and environment ID are required.": "Mediul sursă și ID-ul mediului sunt obligatorii.",
  "Each component needs its name and configuration or required binding.": "Fiecare componentă necesită numele și configurația sau asocierea necesară.",
  "Use Microsoft Entra to change your own administrator role.": "Modifică propriul rol de administrator din Microsoft Entra.",
};
export function errorText(error: unknown, locale: Locale) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (locale === "en") return message;
  if (errors[message]) return errors[message];
  if (/^Maximum \d+ characters$/.test(message)) return message.replace("Maximum", "Maximum").replace("characters", "de caractere");
  if (message.startsWith("Microsoft Graph returned HTTP")) return message.replace("Microsoft Graph returned HTTP", "Microsoft Graph a răspuns cu HTTP").replace("Check application permissions, admin consent and, for the registry, the Agent 365 license.", "Verifică permisiunile aplicației, acordul administratorului și licența Agent 365 pentru registru.");
  return message;
}