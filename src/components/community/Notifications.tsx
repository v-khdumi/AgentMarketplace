"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Bell, Check, CheckCheck, RefreshCw } from "lucide-react";
import { api } from "@/lib/client";
import type { NotificationEvent, NotificationInbox } from "@/lib/community-contracts";
import { formatDate } from "@/lib/presentation";
import { useLanguage } from "../LanguageProvider";
import { useMarketplace, useResource } from "../MarketplaceProvider";
import { BusyIcon, EmptyState, ErrorBox, Loading, Toggle, useText } from "../ui";
import { useCommunityAction } from "./shared";

function notificationLabel(event: NotificationEvent, tr: (ro: string, en: string) => string) {
  const labels: Record<NotificationEvent, string> = {
    "topic-created": tr("Contribuție nouă", "New contribution"), "reply-created": tr("Răspuns nou", "New reply"),
    "answer-accepted": tr("Răspuns acceptat", "Answer accepted"), "idea-updated": tr("Progres actualizat", "Progress updated"),
    "team-joined": tr("Membru nou în echipă", "New team member"), "team-updated": tr("Echipă actualizată", "Team updated"),
    "agent-published": tr("Agent publicat", "Agent published"), "agent-submitted": tr("Agent trimis la aprobare", "Agent submitted for review"),
    "review-completed": tr("Decizie de revizuire", "Review decision"), "access-requested": tr("Cerere nouă de acces", "New access request"),
    "access-updated": tr("Cerere de acces actualizată", "Access request updated"), "content-moderated": tr("Decizie de moderare", "Moderation decision"),
  };
  return labels[event];
}

export function NotificationBell() {
  const tr = useText(); const { data } = useMarketplace(); const pathname = usePathname();
  const resource = useResource<NotificationInbox>(data?.actor && !data.blocked ? "community/notifications" : null);
  const reload = resource.reload;
  useEffect(() => {
    const refresh = () => { if (document.visibilityState === "visible") reload(); };
    window.addEventListener("focus", refresh); window.addEventListener("community-notifications-changed", refresh);
    const interval = window.setInterval(refresh, 60000);
    return () => { window.clearInterval(interval); window.removeEventListener("focus", refresh); window.removeEventListener("community-notifications-changed", refresh); };
  }, [reload]);
  useEffect(() => { reload(); }, [pathname, reload]);
  if (!data?.actor || data.blocked) return null;
  const unread = resource.data?.unread ?? 0;
  const label = `${tr("Notificări", "Notifications")}${unread ? ` (${unread})` : ""}`;
  return <Link href="/community?tab=notifications" className="icon-button notification-bell" aria-label={label} title={label}><Bell size={20}/>{unread > 0 && <span className="notification-count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}</Link>;
}

export function CommunityInbox() {
  const tr = useText(); const { locale } = useLanguage(); const resource = useResource<NotificationInbox>("community/notifications"); const action = useCommunityAction();
  const refresh = () => { resource.reload(); window.dispatchEvent(new Event("community-notifications-changed")); };
  const mark = (ids: string[]) => action.run(async () => { await api("community/notifications", { method: "PATCH", body: { ids } }); refresh(); });
  if (resource.loading) return <Loading/>;
  if (resource.error || !resource.data) return <ErrorBox error={resource.error} retry={resource.reload}/>;
  const inbox = resource.data;
  return <><div className="section-heading"><h2>{tr("Notificări", "Notifications")} <span className="muted">{inbox.unread}</span></h2><div className="row-actions"><button className="icon-button" title={tr("Actualizează notificările", "Refresh notifications")} aria-label={tr("Actualizează notificările", "Refresh notifications")} onClick={refresh}><RefreshCw size={17}/></button><button className="button small" disabled={action.busy || !inbox.items.some(item => !item.readAt)} onClick={() => void mark(inbox.items.filter(item => !item.readAt).map(item => item.id))}><CheckCheck size={16}/>{tr("Marchează afișatele ca citite", "Mark displayed as read")}</button></div></div>
    {Boolean(action.error) && <ErrorBox error={action.error}/>}
    {inbox.items.length ? <div className="community-list">{inbox.items.map(item => <article className="community-row notification-row" data-unread={!item.readAt} key={item.id}><span className="community-row-icon"><Bell size={19}/></span><div className="community-row-body"><small>{notificationLabel(item.event, tr)}</small><h3><Link href={item.href} onClick={() => { if (!item.readAt) void mark([item.id]); }}>{item.title}</Link></h3><div className="community-meta"><span>{item.actorName}</span><time dateTime={item.createdAt}>{formatDate(item.createdAt, locale, true)}</time></div></div>{!item.readAt && <button className="icon-button" disabled={action.busy} title={tr("Marchează ca citită", "Mark as read")} aria-label={tr("Marchează ca citită", "Mark as read")} onClick={() => void mark([item.id])}><Check size={17}/></button>}</article>)}</div> : <EmptyState title={tr("Nu ai notificări", "No notifications")}/>}
    <section className="section-block"><h2>{tr("Canale de notificare", "Notification channels")}</h2><div className="notification-preferences">{(["email", "teams"] as const).map(channel => <div className="notification-preference" key={channel}><Toggle label={channel === "email" ? tr("Email personal", "Personal email") : tr("Teams · canal comunitar", "Teams · community channel")} checked={inbox.preferences[channel]} disabled={action.busy || (!inbox.channels[channel] && !inbox.preferences[channel])} onChange={enabled => void action.run(async () => { await api("community/notifications", { method: "PUT", body: { ...inbox.preferences, [channel]: enabled } }); refresh(); })}/>{action.busy ? <BusyIcon/> : <span className="small-text muted">{inbox.channels[channel] ? tr("Configurat", "Configured") : tr("Neconfigurat", "Not configured")}</span>}</div>)}</div></section>
    {inbox.deliveries.length > 0 && <section className="section-block"><h2>{tr("Livrări recente", "Recent deliveries")}</h2><div className="table-scroll"><table><thead><tr><th>{tr("Canal", "Channel")}</th><th>{tr("Stare", "Status")}</th><th>{tr("Dată", "Date")}</th><th>{tr("Detalii", "Details")}</th></tr></thead><tbody>{inbox.deliveries.map(delivery => <tr key={delivery.id}><td>{delivery.channel === "teams" ? "Teams" : "Email"}</td><td>{({ pending: tr("În așteptare", "Pending"), processing: tr("În curs", "Processing"), sent: tr("Acceptat de furnizor", "Accepted by provider"), failed: tr("Eșuat", "Failed"), cancelled: tr("Anulat", "Cancelled") })[delivery.state]}</td><td>{formatDate(delivery.sentAt || delivery.createdAt, locale, true)}</td><td>{delivery.error || "-"}</td></tr>)}</tbody></table></div></section>}
  </>;
}