"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { Blocks, ChevronDown, CircleHelp, LayoutGrid, LogOut, Plus, ShieldCheck, UserRound, Users } from "lucide-react";
import { LanguageSwitch, useLanguage } from "./LanguageProvider";
import { useMarketplace } from "./MarketplaceProvider";
import { ErrorBox, useText } from "./ui";
import { api } from "@/lib/client";
import { defaultSettings } from "@/lib/contracts";
import { stateName } from "@/lib/presentation";
import { NotificationBell } from "./community/Notifications";

export function Header() {
  const { locale } = useLanguage(); const tr = useText();
  const { data, error: bootstrapError, reload } = useMarketplace();
  const [error, setError] = useState<unknown>(null);
  const [switching, setSwitching] = useState(false);
  const pathname = usePathname();
  const branding = data?.settings ?? defaultSettings; const actor = data?.actor;
  const canPublish = actor && !data?.blocked && !data?.demo && actor.role !== "reader";
  const canReview = actor && !data?.blocked && !data?.demo && ["admin", "reviewer"].includes(actor.role);
  const links = [
    { href: "/", label: tr("Catalog", "Catalog"), icon: LayoutGrid, count: 0 },
    ...(actor && !data?.blocked ? [{ href: "/community", label: tr("Comunitate", "Community"), icon: Users, count: 0 }] : []),
    ...(actor && !data?.blocked ? [{ href: "/dashboard", label: tr("Spațiul meu", "My workspace"), icon: UserRound, count: data?.counts.requests ?? 0 }] : []),
    ...(canPublish ? [{ href: "/submit", label: tr("Publică un agent", "Publish an agent"), icon: Plus, count: 0 }] : []),
    ...(canReview ? [{ href: "/admin", label: "Admin Center", icon: ShieldCheck, count: data?.counts.approvals ?? 0 }] : []),
  ];
  return <>
    <header className="app-header">
      <div className="header-main page-width">
        <Link href="/" className="brand" aria-label={branding.name}>
          {branding.logoId ? <Image src={`/api/marketplace/branding/logo?v=${encodeURIComponent(branding.logoId)}`} alt="" width={32} height={32} unoptimized/> : <span className="brand-symbol"><Blocks size={22}/></span>}
          <span><strong>{branding.name}</strong><small>{branding.organization}</small></span>
        </Link>
        <div className="header-tools">
          <Link href="/resources" className="icon-button" title={tr("Resurse și suport", "Resources and support")} aria-label={tr("Resurse și suport", "Resources and support")}><CircleHelp size={20}/></Link>
          <NotificationBell/>
          <LanguageSwitch />
          {actor ? <details className="account-menu"><summary><span className="avatar">{actor.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><span className="account-label">{actor.name}</span><ChevronDown size={14}/></summary><div className="account-popover"><strong>{actor.name}</strong>{!data?.demo && <small>{actor.email}</small>}<span>{data?.demo ? tr("Identitate demo partajată", "Shared demo identity") : stateName(actor.role, locale)}{actor.guest ? " · B2B" : ""}</span>{!actor.local && !data?.demo && <button className="button quiet" onClick={() => void signOut({ callbackUrl: "/login" })}><LogOut size={16}/>{tr("Deconectare", "Sign out")}</button>}</div></details> : data && pathname !== "/login" ? <Link className="button" href="/login">{tr("Autentificare", "Sign in")}</Link> : null}
        </div>
      </div>
      <div className="page-width nav-row">
        <nav className="main-nav" aria-label={tr("Navigare principală", "Main navigation")}>
          {links.map(({ href, label, icon: NavIcon, count }) => <Link key={href} href={href} aria-current={pathname === href || (href === "/community" && pathname.startsWith("/community/")) ? "page" : undefined}><NavIcon size={17}/>{label}{count > 0 && <span className="nav-count">{count}</span>}</Link>)}
        </nav>
        <span className="private-label"><ShieldCheck size={14}/>{tr("Marketplace privat", "Private marketplace")}</span>
      </div>
    </header>
    {data?.local && <div className="local-bar"><div className="page-width"><span>{tr("Mediu local · date de exemplu", "Local environment · example data")}</span><label>{tr("Identitate", "Identity")}<select aria-label={tr("Identitate locală", "Local identity")} value={actor?.id ?? ""} disabled={switching} onChange={async (event) => { setSwitching(true); setError(null); try { await api("dev/actor", { method: "POST", body: { id: event.target.value } }); window.location.reload(); } catch (failure) { setError(failure); setSwitching(false); } }}>{data.identities.map((identity) => <option value={identity.id} key={identity.id}>{identity.name} · {stateName(identity.role, locale)}</option>)}</select></label></div></div>}
    {data?.demo && <div className="local-bar demo-bar"><div className="page-width"><span>{tr("DEMO public · date partajate și resetabile · nu introduce informații confidențiale", "Public demo · shared, resettable data · do not enter confidential information")}</span></div></div>}
    {Boolean(error) && <div className="page-width"><ErrorBox error={error}/></div>}
    {bootstrapError && <div className="page-width"><ErrorBox error={bootstrapError} retry={() => void reload()}/></div>}
  </>;
}
