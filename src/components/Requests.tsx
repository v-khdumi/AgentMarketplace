"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, CheckCheck, ShieldX, X } from "lucide-react";
import type { AccessRequest } from "@/lib/contracts";
import { api } from "@/lib/client";
import { formatDate } from "@/lib/presentation";
import { useLanguage } from "./LanguageProvider";
import { useMarketplace, useResource } from "./MarketplaceProvider";
import { Badge, BusyIcon, EmptyState, ErrorBox, Field, Loading, Modal, Toggle, useText } from "./ui";

export type RequestRow = AccessRequest & { agentName: string };
type Decision = "approve" | "fulfill" | "reject" | "cancel" | "revoke";

export function Requests({ managed = false }: { managed?: boolean }) {
  const resource = useResource<RequestRow[]>(`requests${managed ? "?managed=true" : ""}`);
  const { data: bootstrap, reload } = useMarketplace(); const tr = useText(); const { locale } = useLanguage();
  const [decision, setDecision] = useState<{ request: RequestRow; action: Decision } | null>(null);
  const [note, setNote] = useState(""); const [confirmed, setConfirmed] = useState(false); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const labels: Record<Decision, string> = { approve: tr("Aprobă cererea", "Approve request"), fulfill: tr("Confirmă partajarea", "Confirm sharing"), reject: tr("Respinge", "Reject"), cancel: tr("Anulează cererea", "Cancel request"), revoke: tr("Confirmă retragerea accesului", "Confirm access removal") };
  const open = (request: RequestRow, action: Decision) => { setDecision({ request, action }); setNote(""); setConfirmed(false); setError(null); };
  const decide = async () => {
    if (!decision) return; setBusy(true); setError(null);
    try { await api(`requests/${decision.request.id}`, { method: "PATCH", body: { action: decision.action, revision: decision.request.revision, note } }); setDecision(null); resource.reload(); await reload(); }
    catch (failure) { setError(failure); } finally { setBusy(false); }
  };
  if (resource.loading) return <Loading/>;
  if (resource.error) return <ErrorBox error={resource.error} retry={resource.reload}/>;
  return <>{!resource.data?.length ? <EmptyState title={managed ? tr("Nicio cerere de gestionat", "No requests to manage") : tr("Nicio cerere de acces", "No access requests")}/> : <div className="request-list">{[...resource.data].sort((first, second) => second.updatedAt.localeCompare(first.updatedAt)).map((request) => <article className="request-row" key={request.id}><div className="request-heading"><div><Link href={`/agents/${request.agentId}`}>{request.agentName}</Link>{managed && <small>{request.requesterName} · {request.requesterEmail}</small>}</div><Badge value={request.state}/></div><p className="prose request-justification">{request.justification}</p>{request.note && <div className="decision-note"><strong>{request.updatedBy}</strong><p className="prose">{request.note}</p></div>}<div className="request-footer"><time dateTime={request.updatedAt}>{formatDate(request.updatedAt, locale, true)}</time><div className="row-actions">{managed && request.requesterId !== bootstrap?.actor?.id ? <>{request.state === "pending" && <button className="button small" onClick={() => open(request, "approve")}><Check size={15}/>{labels.approve}</button>}{request.state === "approved" && <button className="button primary small" onClick={() => open(request, "fulfill")}><CheckCheck size={15}/>{labels.fulfill}</button>}{["pending", "approved"].includes(request.state) && <button className="button quiet small" onClick={() => open(request, "reject")}><X size={15}/>{labels.reject}</button>}{request.state === "fulfilled" && <button className="button danger small" onClick={() => open(request, "revoke")}><ShieldX size={15}/>{labels.revoke}</button>}</> : ["pending", "approved"].includes(request.state) && <button className="button quiet small" onClick={() => open(request, "cancel")}><X size={15}/>{labels.cancel}</button>}</div></div></article>)}</div>}
    {decision && <Modal title={labels[decision.action]} close={() => { if (!busy) setDecision(null); }}><h3>{decision.request.agentName}</h3><p className="muted">{decision.request.requesterEmail}</p>{["fulfill", "revoke"].includes(decision.action) && <div className="info-notice">{decision.action === "fulfill" ? tr("Confirmarea înregistrează partajarea făcută în Microsoft. Marketplace nu acordă permisiuni în Copilot sau în sursele de date.", "This records sharing completed in Microsoft. Marketplace does not grant Copilot or source-data permissions.") : tr("Retragerea trebuie realizată în Microsoft. Această confirmare actualizează evidența din Marketplace.", "Access must be removed in Microsoft. This confirmation updates the Marketplace record.")}</div>}{Boolean(error) && <ErrorBox error={error}/>}<Field label={tr("Notă de decizie", "Decision note")} required={["fulfill", "reject", "revoke"].includes(decision.action)}><textarea rows={4} maxLength={4000} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy}/></Field>{["fulfill", "revoke"].includes(decision.action) && <Toggle label={decision.action === "fulfill" ? tr("Partajarea a fost finalizată în Microsoft pentru acest utilizator.", "Sharing has been completed in Microsoft for this user.") : tr("Accesul a fost retras în Microsoft pentru acest utilizator.", "Access has been removed in Microsoft for this user.")} checked={confirmed} onChange={setConfirmed} disabled={busy}/>}<div className="row-actions"><button className="button" onClick={() => setDecision(null)} disabled={busy}>{tr("Renunță", "Dismiss")}</button><button className="button primary" disabled={busy || (["fulfill", "reject", "revoke"].includes(decision.action) && !note.trim()) || (["fulfill", "revoke"].includes(decision.action) && !confirmed)} onClick={() => void decide()}>{busy ? <BusyIcon/> : <Check size={16}/>} {labels[decision.action]}</button></div></Modal>}
  </>;
}