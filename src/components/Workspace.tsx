"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ArrowUpRight, Bookmark, FilePenLine, Inbox, Plus, Send } from "lucide-react";
import type { AgentSummary } from "@/lib/contracts";
import { formatDate } from "@/lib/presentation";
import { useMarketplace, useResource } from "./MarketplaceProvider";
import { useLanguage } from "./LanguageProvider";
import { AgentTile } from "./Catalog";
import { AgentArtwork, Badge, EmptyState, ErrorBox, Loading, PlatformLabel, useText } from "./ui";
import { Requests } from "./Requests";

export function AgentTable({ agents, review = false }: { agents: AgentSummary[]; review?: boolean }) {
  const tr = useText(); const { locale } = useLanguage();
  return <div className="table-scroll"><table className="agent-table"><thead><tr><th>{tr("Agent", "Agent")}</th><th>{tr("Stare", "Status")}</th><th>{tr("Risc", "Risk")}</th><th>{tr("Versiune", "Version")}</th><th>{tr("Actualizat", "Updated")}</th><th><span className="sr-only">{tr("Acțiuni", "Actions")}</span></th></tr></thead><tbody>{[...agents].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)).map((agent) => <tr key={agent.id}><td><div className="table-agent"><AgentArtwork iconId={agent.iconId} platform={agent.platform}/><div><Link href={`/agents/${agent.id}?draft=true`}>{agent.name}</Link><PlatformLabel platform={agent.platform}/><small>{agent.ownerName}</small></div></div></td><td><Badge value={agent.state}/></td><td><Badge value={agent.risk}/></td><td>{agent.version ? `v${agent.version}` : "-"}</td><td><time dateTime={agent.updatedAt}>{formatDate(agent.updatedAt, locale)}</time></td><td><Link className="button small" href={review ? `/agents/${agent.id}?draft=true&tab=configuration` : `/submit?id=${agent.id}`}>{review ? <ArrowUpRight size={15}/> : <FilePenLine size={15}/>} {review ? tr("Revizuiește", "Review") : tr("Editează", "Edit")}</Link></td></tr>)}</tbody></table></div>;
}

function OwnedAgents() {
  const resource = useResource<AgentSummary[]>("agents?scope=mine"); const tr = useText();
  return resource.loading ? <Loading/> : resource.error ? <ErrorBox error={resource.error} retry={resource.reload}/> : !resource.data?.length ? <EmptyState title={tr("Niciun agent creat", "No agents created")}><Link className="button primary" href="/submit"><Plus size={16}/>{tr("Agent nou", "New agent")}</Link></EmptyState> : <AgentTable agents={resource.data}/>;
}

function SavedAgents() {
  const resource = useResource<AgentSummary[]>("agents"); const tr = useText();
  const agents = resource.data?.filter((agent) => agent.saved);
  return resource.loading ? <Loading/> : resource.error ? <ErrorBox error={resource.error} retry={resource.reload}/> : !agents?.length ? <EmptyState title={tr("Niciun agent salvat", "No saved agents")}><Link className="button" href="/">{tr("Deschide catalogul", "Open catalog")}</Link></EmptyState> : <div className="agent-grid">{agents.map((agent) => <AgentTile key={agent.id} agent={agent} onSaved={(id, saved) => resource.setData((current) => current?.map((item) => item.id === id ? { ...item, saved } : item) ?? null)}/>)}</div>;
}

export function Workspace() {
  const { data: bootstrap } = useMarketplace(); const tr = useText(); const params = useSearchParams();
  const canPublish = Boolean(bootstrap?.actor && bootstrap.actor.role !== "reader");
  const [selected, setSelected] = useState(params.get("tab") ?? "");
  const tabs = [...(canPublish ? [{ key: "mine", label: tr("Agenții mei", "My agents"), icon: FilePenLine }] : []), { key: "saved", label: tr("Salvați", "Saved"), icon: Bookmark }, { key: "requests", label: tr("Cererile mele", "My requests"), icon: Send }, ...(canPublish ? [{ key: "managed", label: tr("Cereri primite", "Incoming requests"), icon: Inbox }] : [])];
  const tab = tabs.some((entry) => entry.key === selected) ? selected : canPublish ? "mine" : "saved";
  return <div className="page-width page-content"><div className="page-heading"><div><span className="eyebrow">{bootstrap?.actor?.name}</span><h1>{tr("Spațiul meu", "My workspace")}</h1></div>{canPublish && <Link className="button primary" href="/submit"><Plus size={17}/>{tr("Agent nou", "New agent")}</Link>}</div><div className="tabs" role="tablist" aria-label={tr("Spațiul meu", "My workspace")}>{tabs.map(({ key, label, icon: TabIcon }) => <button key={key} role="tab" aria-selected={tab === key} aria-controls="workspace-panel" onClick={() => { setSelected(key); window.history.replaceState(null, "", `/dashboard?tab=${key}`); }}><TabIcon size={16}/>{label}{key === "managed" && Boolean(bootstrap?.counts.requests) && <span className="nav-count">{bootstrap!.counts.requests}</span>}</button>)}</div><div id="workspace-panel" role="tabpanel">{tab === "mine" && <OwnedAgents/>}{tab === "saved" && <SavedAgents/>}{tab === "requests" && <Requests/>}{tab === "managed" && <Requests managed/>}</div></div>;
}