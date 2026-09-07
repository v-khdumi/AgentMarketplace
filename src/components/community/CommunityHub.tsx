"use client";

import { useSearchParams } from "next/navigation";
import { Bell, Lightbulb, MessageSquare, ShieldCheck, UserRound, Users } from "lucide-react";
import { useResource } from "../MarketplaceProvider";
import { ErrorBox, Loading, useText } from "../ui";
import { TopicList } from "./Discussion";
import { PeopleList, TeamsList } from "./Profiles";
import { CommunityInbox } from "./Notifications";
import { CommunityModeration } from "./Moderation";
import type { CommunityAccess } from "./shared";

export function CommunityHub() {
  const tr = useText(); const params = useSearchParams(); const policy = useResource<CommunityAccess>("community/policy");
  const tabs = [
    { id: "discussions", label: tr("Discuții", "Discussions"), icon: MessageSquare }, { id: "ideas", label: tr("Idei", "Ideas"), icon: Lightbulb },
    { id: "people", label: tr("Membri", "People"), icon: UserRound }, { id: "teams", label: tr("Echipe", "Teams"), icon: Users },
    { id: "notifications", label: tr("Notificări", "Notifications"), icon: Bell },
    ...(policy.data?.canModerate ? [{ id: "moderation", label: tr("Moderare", "Moderation"), icon: ShieldCheck }] : []),
  ];
  const requested = params.get("tab") ?? "discussions"; const tab = tabs.some(item => item.id === requested) ? requested : "discussions";
  return <div className="page-width page-content community-page"><div className="page-heading"><h1>{tr("Comunitate", "Community")}</h1></div>
    {policy.loading ? <Loading/> : policy.error || !policy.data ? <ErrorBox error={policy.error} retry={policy.reload}/> : <><div className="tabs community-tabs" role="tablist" aria-label={tr("Comunitate", "Community")}>{tabs.map(({ id, label, icon: TabIcon }) => <button key={id} role="tab" id={`community-tab-${id}`} aria-selected={tab === id} aria-controls="community-panel" onClick={() => { const url = new URL(window.location.href); url.searchParams.set("tab", id); window.history.replaceState(null, "", url); }}><TabIcon size={16}/>{label}</button>)}</div><div className="community-panel" id="community-panel" role="tabpanel" aria-labelledby={`community-tab-${tab}`}>
      {!policy.data.policy.enabled && <div className="info-notice">{tr("La acest moment, comunitatea este închisă membrilor.", "The community is currently closed to members.")}</div>}
      {tab === "discussions" && <TopicList kind="discussion"/>}{tab === "ideas" && <TopicList kind="idea"/>}{tab === "people" && <PeopleList/>}{tab === "teams" && <TeamsList/>}{tab === "notifications" && <CommunityInbox/>}{tab === "moderation" && <CommunityModeration access={policy.data} refreshPolicy={policy.reload}/>}
    </div></>}
  </div>;
}