"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";
import { ArrowUpRight, Bookmark, Check, Download, LayoutGrid, List, LockKeyhole, MessageSquare, Plus, Search, Star, Users, X } from "lucide-react";
import { useMarketplace, useResource } from "./MarketplaceProvider";
import { useLanguage } from "./LanguageProvider";
import { AgentArtwork, EmptyState, ErrorBox, Loading, PlatformLabel, useText } from "./ui";
import { api } from "@/lib/client";
import type { AgentSummary } from "@/lib/contracts";
import { categoryIds } from "@/lib/contracts";
import { categoryName, filterCatalog, formatDate, type CatalogFilters } from "@/lib/presentation";

export function AgentTile({ agent, onSaved }: { agent: AgentSummary; onSaved?: (id: string, saved: boolean) => void }) {
  const { locale } = useLanguage(); const tr = useText();
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  return <article className="agent-tile">
    <div className="tile-top"><AgentArtwork iconId={agent.iconId} platform={agent.platform}/><button type="button" className="icon-button favorite-button" aria-label={agent.saved ? tr("Elimină din salvate", "Remove from saved") : tr("Salvează agentul", "Save agent")} title={agent.saved ? tr("Elimină din salvate", "Remove from saved") : tr("Salvează agentul", "Save agent")} aria-pressed={agent.saved} disabled={busy} onClick={async () => { setBusy(true); setError(null); try { await api(`agents/${agent.id}/favorite`, { method: "PUT", body: { saved: !agent.saved } }); onSaved?.(agent.id, !agent.saved); } catch (failure) { setError(failure); } finally { setBusy(false); } }}><Bookmark size={18} fill={agent.saved ? "currentColor" : "none"}/></button></div>
    <div className="tile-copy"><PlatformLabel platform={agent.platform}/><h2><Link href={`/agents/${agent.id}`}>{agent.name || tr("Agent fără titlu", "Untitled agent")}</Link></h2><p>{agent.summary}</p></div>
    <div className="tile-tags"><span>{categoryName(agent.category, locale)}</span>{agent.example && <span className="example-label">{tr("Exemplu", "Example")}</span>}</div>
    {(agent.usageCount !== undefined || agent.feedbackScore !== undefined) && <div className="tile-signals">{agent.usageCount !== undefined && <span title={tr("Utilizatori activi declarați", "Reported active users")}><Users size={14}/>{agent.usageCount.toLocaleString(locale)}</span>}{agent.feedbackScore !== undefined && <span title={tr("Feedback mediu", "Average feedback")}><Star size={14} fill="currentColor"/>{agent.feedbackScore.toLocaleString(locale)}</span>}</div>}
    <div className="tile-meta"><span>{agent.ownerName}</span><span>{agent.version ? `v${agent.version}` : ""}</span></div>
    <footer className="tile-footer"><span>{agent.example ? tr("Fără deployment", "No deployment") : agent.downloadable ? <><Download size={14}/>{tr("Soluție ZIP", "Solution ZIP")}</> : agent.requestAccess ? <><LockKeyhole size={14}/>{tr("Cerere de acces", "Request access")}</> : <><ArrowUpRight size={14}/>{tr("Link disponibil", "Link available")}</>}</span><time dateTime={agent.updatedAt}>{formatDate(agent.updatedAt, locale)}</time></footer>
    {Boolean(error) && <ErrorBox error={error}/>}
  </article>;
}

export function Catalog() {
  const { data: bootstrap } = useMarketplace(); const { locale } = useLanguage(); const tr = useText();
  const resource = useResource<AgentSummary[]>("agents"); const params = useSearchParams();
  const [filters, setFilters] = useState<CatalogFilters>({ query: params.get("q") ?? "", category: params.get("category") ?? "", platform: params.get("platform") ?? "", access: params.get("access") ?? "all", saved: params.get("saved") === "true", sort: params.get("sort") ?? "updated" });
  const [view, setView] = useState<"grid" | "list">("grid");
  const deferredQuery = useDeferredValue(filters.query);
  const filtered = filterCatalog(resource.data ?? [], { ...filters, query: deferredQuery });
  const totalUsage = (resource.data ?? []).reduce((sum, agent) => sum + (agent.usageCount ?? 0), 0);
  const feedback = (resource.data ?? []).filter(agent => agent.feedbackScore !== undefined);
  const averageFeedback = feedback.length ? feedback.reduce((sum, agent) => sum + (agent.feedbackScore ?? 0), 0) / feedback.length : 0;
  const setFilter = <Key extends keyof CatalogFilters>(key: Key, value: CatalogFilters[Key]) => setFilters((current) => ({ ...current, [key]: value }));
  useEffect(() => {
    const next = new URLSearchParams();
    if (filters.query) next.set("q", filters.query); if (filters.category) next.set("category", filters.category); if (filters.platform) next.set("platform", filters.platform); if (filters.saved) next.set("saved", "true"); if (filters.access !== "all") next.set("access", filters.access); if (filters.sort !== "updated") next.set("sort", filters.sort);
    window.history.replaceState(null, "", `/${next.size ? `?${next}` : ""}`);
  }, [filters]);
  const saved = (id: string, value: boolean) => resource.setData((current) => current?.map((agent) => agent.id === id ? { ...agent, saved: value } : agent) ?? null);
  const clear = () => setFilters({ query: "", category: "", platform: "", access: "all", saved: false, sort: "updated" });
  return <div className="page-content catalog-page">
    <section className="marketplace-hero"><div className="page-width marketplace-hero-inner"><span className="eyebrow">{bootstrap?.settings.organization} · Microsoft 365 Copilot</span><div className="marketplace-hero-heading"><div><h1>{bootstrap?.settings.name ?? "BT Agent Hub"}</h1><p>{tr("Sursa internă pentru agenți AI reutilizabili, instrucțiuni verificate și experiența comunității.", "Your internal source for reusable AI agents, verified instructions, and community experience.")}</p></div>{bootstrap?.actor && bootstrap.actor.role !== "reader" && <Link className="button primary" href="/submit"><Plus size={17}/>{tr("Publică un agent", "Publish an agent")}</Link>}</div>
    <div className="catalog-search marketplace-search"><Search size={22}/><input type="search" aria-label={tr("Caută agenți", "Search agents")} placeholder={tr("Caută după nevoie, agent, proprietar sau categorie", "Search by need, agent, owner, or category")} value={filters.query} onChange={(event) => setFilter("query", event.target.value)}/>{filters.query && <button className="icon-button" title={tr("Șterge căutarea", "Clear search")} aria-label={tr("Șterge căutarea", "Clear search")} onClick={() => setFilter("query", "")}><X size={17}/></button>}</div>
    <div className="marketplace-suggestions"><span>{tr("Începe cu", "Get started by")}</span><button onClick={() => setFilter("platform", "agent-builder")}>{tr("Agenți pentru Microsoft 365 Copilot", "Agents for Microsoft 365 Copilot")}</button><button onClick={() => setFilter("platform", "copilot-studio")}>Copilot Studio</button><button onClick={() => setFilter("category", "productivity")}>{tr("Crește productivitatea", "Improve productivity")}</button><Link href="/community?tab=ideas">{tr("Explorează ideile colegilor", "Explore colleague ideas")}</Link></div></div></section>
    <div className="page-width catalog-body">
    {bootstrap?.demo && <div className="ecosystem-summary" aria-label={tr("Rezumat ecosistem", "Ecosystem summary")}><div><strong>{resource.data?.length ?? 0}</strong><span>{tr("agenți indexați", "indexed agents")}</span></div><div><strong>2</strong><span>{tr("platforme Microsoft", "Microsoft platforms")}</span></div><div><strong>{totalUsage.toLocaleString(locale)}</strong><span>{tr("utilizatori declarați", "reported users")}</span></div><div><strong>{averageFeedback ? averageFeedback.toLocaleString(locale, { maximumFractionDigits: 1 }) : "-"}</strong><span>{tr("feedback mediu", "average feedback")}</span></div><Link href="/community"><MessageSquare size={17}/>{tr("Best practices și lecții învățate", "Best practices and lessons learned")}</Link></div>}
    {params.get("notice") === "forbidden" && <ErrorBox error={tr("Rolul tău nu permite accesul la pagina solicitată.", "Your role does not allow access to that page.")}/>}
    <div className="catalog-layout">
      <aside className="catalog-sidebar"><h2>{tr("Categorii", "Categories")}</h2><div className="category-list">{["", ...categoryIds].map((category) => <button key={category} aria-pressed={filters.category === category} onClick={() => setFilter("category", category)}><span>{category ? categoryName(category, locale) : tr("Toate categoriile", "All categories")}</span><span className="count">{(resource.data ?? []).filter((agent) => !category || agent.category === category).length}</span></button>)}</div><label className="toggle-row saved-filter"><input type="checkbox" checked={filters.saved} onChange={(event) => setFilter("saved", event.target.checked)}/><Bookmark size={16}/><span>{tr("Doar agenții salvați", "Saved agents only")}</span></label><Link className="subtle-link" href="/resources">{tr("Documentație Microsoft", "Microsoft documentation")}<ArrowUpRight size={14}/></Link></aside>
      <section className="catalog-results" aria-label={tr("Rezultatele catalogului", "Catalog results")}>
        <div className="filter-toolbar"><label><span className="sr-only">{tr("Platformă", "Platform")}</span><select value={filters.platform} onChange={(event) => setFilter("platform", event.target.value)}><option value="">{tr("Ambele platforme", "Both platforms")}</option><option value="agent-builder">M365 Copilot · Agent Builder</option><option value="copilot-studio">Copilot Studio</option></select></label><label><span className="sr-only">{tr("Distribuire", "Distribution")}</span><select value={filters.access} onChange={(event) => setFilter("access", event.target.value)}><option value="all">{tr("Orice distribuire", "Any distribution")}</option><option value="direct">{tr("Link direct", "Direct link")}</option><option value="request">{tr("Prin cerere de acces", "Access request")}</option><option value="download">{tr("Soluție descărcabilă", "Downloadable solution")}</option></select></label><label className="sort-select"><span className="sr-only">{tr("Sortare", "Sort order")}</span><select value={filters.sort} onChange={(event) => setFilter("sort", event.target.value)}><option value="updated">{tr("Actualizate recent", "Recently updated")}</option><option value="name">{tr("Nume A–Z", "Name A–Z")}</option></select></label></div>
        <div className="results-heading"><span role="status">{resource.loading ? tr("Se încarcă…", "Loading…") : `${filtered.length} ${tr("agenți", "agents")}`}</span><div className="row-actions">{(filters.query || filters.category || filters.platform || filters.saved || filters.access !== "all") && <button className="button quiet small" onClick={clear}><X size={14}/>{tr("Resetează", "Reset")}</button>}<div className="segmented"><button className="icon-button" aria-label={tr("Grilă", "Grid view")} title={tr("Grilă", "Grid view")} aria-pressed={view === "grid"} onClick={() => setView("grid")}><LayoutGrid size={17}/></button><button className="icon-button" aria-label={tr("Listă", "List view")} title={tr("Listă", "List view")} aria-pressed={view === "list"} onClick={() => setView("list")}><List size={18}/></button></div></div></div>
        {resource.loading ? <Loading rows={3}/> : resource.error ? <ErrorBox error={resource.error} retry={resource.reload}/> : filtered.length ? <div className={`agent-grid ${view === "list" ? "list-view" : ""}`}>{filtered.map((agent) => <AgentTile key={agent.id} agent={agent} onSaved={saved}/>)}</div> : <EmptyState title={tr("Niciun agent găsit", "No agents found")}><button className="button" onClick={clear}><X size={15}/>{tr("Resetează filtrele", "Reset filters")}</button></EmptyState>}
      </section>
    </div>
    <footer className="page-footer"><span><Check size={14}/>{tr("Microsoft 365 Copilot Agent Builder și Copilot Studio", "Microsoft 365 Copilot Agent Builder and Copilot Studio")}</span><Link href="/resources#privacy">{tr("Date și confidențialitate", "Data and privacy")}</Link></footer>
    </div>
  </div>;
}