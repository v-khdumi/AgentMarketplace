"use client";

import { Download } from "lucide-react";
import type { AgentDraft, ComponentDefinition } from "@/lib/contracts";
import { downloadBlob } from "@/lib/client";
import { CopyButton, useText } from "./ui";

function Value({ label, value }: { label: string; value: string }) {
  const tr = useText();
  return <div className="readout"><div className="readout-header"><h3>{label}</h3>{value && <CopyButton value={value} label={`${tr("Copiază", "Copy")} ${label}`}/>}</div>{value ? <pre>{value}</pre> : <span className="muted small-text">{tr("Nespecificat", "Not provided")}</span>}</div>;
}

export function ConfigurationView({ draft, exportable = true }: { draft: AgentDraft; exportable?: boolean }) {
  const tr = useText(); const yesNo = (value: boolean) => value ? tr("Activat", "Enabled") : tr("Dezactivat", "Disabled");
  const knowledge = draft.platform === "agent-builder" ? draft.builder.knowledge : draft.studio.knowledge;
  const components = (label: string, entries: ComponentDefinition[]) => <section className="section-block"><h3>{label} <span className="muted">({entries.length})</span></h3>{entries.length ? <div className="form-stack">{entries.map((entry, index) => <Value label={entry.name} value={entry.configuration} key={index}/>)}</div> : <span className="muted small-text">{tr("Niciuna", "None")}</span>}</section>;
  return <div className="configuration-view">
    {exportable && <div className="configuration-toolbar"><span className="muted small-text">{tr("Configurație originală", "Original configuration")}</span><button className="button small" onClick={() => downloadBlob(new Blob([JSON.stringify(draft, null, 2)], { type: "application/json" }), `${draft.name.replace(/[^a-z0-9_-]/gi, "-") || "agent"}-configuration.json`)}><Download size={15}/>{tr("Export configurație JSON", "Export configuration JSON")}</button></div>}
    <section className="section-block"><div className="form-stack"><Value label="Name" value={draft.name}/><Value label="Description" value={draft.description}/><Value label="Instructions" value={draft.instructions}/></div></section>
    {draft.platform === "agent-builder" ? <section className="section-block"><h3>Agent Builder · Configure</h3><dl className="definition-list"><dt>Model</dt><dd>{draft.builder.model}</dd><dt>Only use specified knowledge</dt><dd>{yesNo(draft.builder.onlyUseKnowledge)}</dd><dt>Create documents, charts, and code</dt><dd>{yesNo(draft.builder.codeInterpreter)}</dd><dt>Create images</dt><dd>{yesNo(draft.builder.imageGenerator)}</dd></dl></section> : <section className="section-block"><h3>Copilot Studio · Settings</h3><dl className="definition-list"><dt>Environment</dt><dd>{draft.studio.environment || "-"}</dd><dt>Environment ID</dt><dd><code>{draft.studio.environmentId || "-"}</code></dd><dt>Harness</dt><dd>{draft.studio.harness}</dd><dt>Orchestration</dt><dd>{draft.studio.orchestration}</dd><dt>Authentication</dt><dd className="prose">{draft.studio.authentication}</dd><dt>Channels</dt><dd>{draft.studio.channels.join(", ") || "-"}</dd></dl></section>}
    <section className="section-block"><h3>Knowledge <span className="muted">({knowledge.length})</span></h3>{knowledge.length ? <div className="form-stack">{knowledge.map((source, index) => <div className="knowledge-readout" key={index}><h4>{source.name} <span>{source.type}</span></h4><Value label={tr("Locație / domeniu exact", "Exact location / scope")} value={source.location}/>{source.settings && <Value label={tr("Setări", "Settings")} value={source.settings}/>}</div>)}</div> : <span className="muted small-text">{tr("Nicio sursă declarată", "No sources declared")}</span>}</section>
    {draft.platform === "copilot-studio" && <>{components("Topics", draft.studio.topics)}{components("Tools / actions / flows", draft.studio.tools)}{components("Connection references", draft.studio.connectionReferences)}{components("Environment variables", draft.studio.environmentVariables)}<section className="section-block"><h3>{tr("Dependențe", "Dependencies")}</h3><ul className="plain-list">{draft.studio.dependencies.map((dependency, index) => <li key={index}>{dependency}</li>)}</ul>{!draft.studio.dependencies.length && <span className="muted small-text">{tr("Niciuna declarată", "None declared")}</span>}</section></>}
    <section className="section-block"><h3>Starter prompts <span className="muted">({draft.prompts.length})</span></h3>{draft.prompts.length ? <div className="form-stack">{draft.prompts.map((prompt, index) => <Value label={prompt.title} value={prompt.message} key={index}/>)}</div> : <span className="muted small-text">{tr("Niciun prompt declarat", "No prompts declared")}</span>}</section>
  </div>;
}