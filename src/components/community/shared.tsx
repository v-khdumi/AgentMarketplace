"use client";

import Link from "next/link";
import { useState } from "react";
import { Bell, BellOff, Check, Flag, Send } from "lucide-react";
import { api } from "@/lib/client";
import { categoryIds } from "@/lib/contracts";
import type { Audience, CommunityPolicy, CommunityTarget, TopicView } from "@/lib/community-contracts";
import { categoryName, formatDate } from "@/lib/presentation";
import { useLanguage } from "../LanguageProvider";
import { useMarketplace, useResource } from "../MarketplaceProvider";
import { BusyIcon, ErrorBox, Field, Modal, useText } from "../ui";

export interface CommunityAccess { policy: CommunityPolicy; revision: number; canModerate: boolean; canParticipate: boolean }
export function useCommunityAction() {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const run = async (operation: () => Promise<unknown>) => {
    setBusy(true); setError(null);
    try { await operation(); return true; }
    catch (failure) { setError(failure); return false; }
    finally { setBusy(false); }
  };
  return { busy, error, run };
}
export function Contributor({ id, name }: { id: string; name: string }) {
  return <Link href={`/community/people/${encodeURIComponent(id)}`}>{name}</Link>;
}
export function CommunityMeta({ authorId, authorName, date, audience }: { authorId: string; authorName: string; date: string; audience: Audience }) {
  const tr = useText(); const { locale } = useLanguage();
  return <div className="community-meta"><Contributor id={authorId} name={authorName}/><time dateTime={date}>{formatDate(date, locale, true)}</time><span>{audience === "all" ? tr("Membri și invitați B2B", "Members and B2B guests") : tr("Membri interni", "Internal members")}</span></div>;
}
export function AudienceField({ value, onChange, disabled = false, allowGuests = true }: { value: Audience; onChange: (value: Audience) => void; disabled?: boolean; allowGuests?: boolean }) {
  const tr = useText();
  return <Field label={tr("Audiență", "Audience")}><select value={value} disabled={disabled} onChange={event => onChange(event.target.value as Audience)}><option value="members">{tr("Membri interni", "Internal members")}</option>{allowGuests && <option value="all">{tr("Membri și invitați B2B", "Members and B2B guests")}</option>}</select></Field>;
}
export function CommunityRules({ access }: { access: CommunityAccess | null }) {
  const tr = useText();
  return access ? <details className="community-rules"><summary>{tr("Regulile comunității", "Community rules")}</summary><p className="prose">{access.policy.rules}</p>{!access.canParticipate && <p>{tr("Participarea nu este activată pentru contul tău.", "Participation is not enabled for your account.")}</p>}</details> : null;
}
export function FollowButton({ target }: { target: CommunityTarget }) {
  const tr = useText(); const action = useCommunityAction(); const { data: bootstrap } = useMarketplace();
  const resource = useResource<{ following: boolean }>(`community/follow?kind=${target.kind}&id=${encodeURIComponent(target.id)}`);
  if (bootstrap?.demo) return null;
  return <div className="follow-control"><button className="button small" disabled={action.busy || resource.loading || Boolean(resource.error)} aria-pressed={resource.data?.following ?? false} onClick={() => void action.run(async () => { await api("community/follow", { method: "PUT", body: { target, following: !resource.data?.following } }); resource.reload(); })}>{action.busy ? <BusyIcon/> : resource.data?.following ? <BellOff size={16}/> : <Bell size={16}/>} {resource.data?.following ? tr("Nu mai urmări", "Unfollow") : tr("Urmărește", "Follow")}</button>{Boolean(action.error || resource.error) && <ErrorBox error={action.error || resource.error} retry={resource.reload}/>}</div>;
}
export function ReportButton({ kind, id }: { kind: "topic" | "reply" | "profile" | "team"; id: string }) {
  const tr = useText(); const action = useCommunityAction(); const { data: bootstrap } = useMarketplace(); const [open, setOpen] = useState(false); const [reason, setReason] = useState(""); const [reported, setReported] = useState(false);
  if (bootstrap?.demo) return null;
  return <><button className="icon-button" title={tr("Raportează conținutul", "Report content")} aria-label={tr("Raportează conținutul", "Report content")} onClick={() => setOpen(true)}><Flag size={16}/></button>{reported && <span role="status" className="small-text">{tr("Raport trimis", "Report submitted")}</span>}{open && <Modal title={tr("Raportează conținutul", "Report content")} close={() => { if (!action.busy) setOpen(false); }}><form onSubmit={event => { event.preventDefault(); void action.run(async () => { await api("community/reports", { method: "POST", body: { kind, id, reason } }); setOpen(false); setReported(true); }); }}>{Boolean(action.error) && <ErrorBox error={action.error}/>}<Field label={tr("Motivul raportării", "Report reason")} required><textarea autoFocus required minLength={10} maxLength={2000} rows={5} value={reason} onChange={event => setReason(event.target.value)}/></Field><div className="row-actions end"><button className="button primary" disabled={action.busy || reason.trim().length < 10}>{action.busy ? <BusyIcon/> : <Flag size={16}/>} {tr("Trimite raportul", "Submit report")}</button></div></form></Modal>}</>;
}
export function TopicComposer({ kind, agentId = "", allowGuests = true, guest = false, topic, close, saved }: { kind: "discussion" | "idea"; agentId?: string; allowGuests?: boolean; guest?: boolean; topic?: TopicView; close: () => void; saved: (topic: TopicView) => void }) {
  const tr = useText(); const { locale } = useLanguage(); const action = useCommunityAction();
  const [title, setTitle] = useState(topic?.title ?? ""); const [body, setBody] = useState(topic?.body ?? "");
  const [category, setCategory] = useState(topic?.category ?? "productivity"); const [audience, setAudience] = useState<Audience>(topic?.audience ?? (guest ? "all" : "members")); const [confirmed, setConfirmed] = useState(false);
  return <Modal title={topic ? tr("Editează contribuția", "Edit contribution") : kind === "idea" ? tr("Propune un agent", "Propose an agent") : tr("Adresează o întrebare", "Ask a question")} close={() => { if (!action.busy) close(); }}><form onSubmit={event => { event.preventDefault(); void action.run(async () => {
    const result = await api<TopicView>(topic ? `community/topics/${topic.id}` : "community/topics", { method: topic ? "PATCH" : "POST", body: topic ? { action: "edit", revision: topic.revision, title, body } : { kind, agentId, title, body, category, audience } }); saved(result);
  }); }}><fieldset className="editor-fields form-stack" disabled={action.busy}>
    {Boolean(action.error) && <ErrorBox error={action.error}/>}
    <Field label={tr("Titlu", "Title")} required><input autoFocus required minLength={4} maxLength={160} value={title} onChange={event => setTitle(event.target.value)}/></Field>
    <Field label={kind === "idea" ? tr("Nevoia și rezultatul dorit", "Need and desired outcome") : tr("Întrebarea și contextul", "Question and context")} required><textarea required minLength={10} maxLength={8000} rows={7} value={body} onChange={event => setBody(event.target.value)}/></Field>
    {!topic && <div className="form-grid"><Field label={tr("Categorie", "Category")}><select value={category} onChange={event => setCategory(event.target.value as typeof category)}>{categoryIds.map(id => <option key={id} value={id}>{categoryName(id, locale)}</option>)}</select></Field><AudienceField value={audience} onChange={setAudience} allowGuests={allowGuests} disabled={guest}/></div>}
    <label className="toggle-row"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} required/><span>{tr("Conținutul respectă regulile comunității și poate fi partajat cu audiența selectată.", "This content follows the community rules and can be shared with the selected audience.")}</span></label>
    <div className="row-actions end"><button type="button" className="button" onClick={close}>{tr("Renunță", "Cancel")}</button><button className="button primary" disabled={!confirmed || title.trim().length < 4 || body.trim().length < 10}>{action.busy ? <BusyIcon/> : topic ? <Check size={16}/> : <Send size={16}/>} {topic ? tr("Salvează", "Save") : tr("Publică", "Post")}</button></div>
  </fieldset></form></Modal>;
}