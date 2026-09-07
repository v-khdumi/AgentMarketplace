"use client";

import Link from "next/link";
import { signIn } from "next-auth/react";
import { useState } from "react";
import { ArrowRight, KeyRound, ShieldCheck } from "lucide-react";
import { useMarketplace } from "@/components/MarketplaceProvider";
import { BusyIcon, ErrorBox, Loading, useText } from "@/components/ui";

export default function LoginPage() {
  const { data, error, reload } = useMarketplace(); const tr = useText();
  const [busy, setBusy] = useState(false); const [failure, setFailure] = useState<unknown>(null);
  return <div className="page-width login-page"><section className="login-content"><ShieldCheck size={36} className="accent-text"/><span className="eyebrow">{data?.settings.organization}</span><h1>{data?.settings.name ?? "Agent Marketplace"}</h1>{!data ? error ? <ErrorBox error={error} retry={reload}/> : <Loading rows={2}/> : data.blocked ? <ErrorBox error={data.blocked}/> : data.actor ? <Link className="button primary" href="/">{tr("Deschide catalogul", "Open catalog")}<ArrowRight size={17}/></Link> : data.authConfigured ? <><p>{tr("Cont organizațional sau invitat B2B în Microsoft Entra.", "Organization account or Microsoft Entra B2B guest.")}</p><button className="button primary" disabled={busy} onClick={async () => { setBusy(true); setFailure(null); const callback = new URLSearchParams(window.location.search).get("callbackUrl"); const callbackUrl = callback?.startsWith("/") && !callback.startsWith("//") ? callback : "/"; try { await signIn("azure-ad", { callbackUrl }); } catch (problem) { setFailure(problem); setBusy(false); } }}>{busy ? <BusyIcon/> : <KeyRound size={18}/>} {tr("Continuă cu Microsoft", "Continue with Microsoft")}</button></> : <><h2>{tr("Autentificarea nu este configurată", "Authentication is not configured")}</h2><p>{tr("Administratorul trebuie să configureze aplicația Microsoft Entra și stocarea în mediul de deployment.", "An administrator must configure Microsoft Entra and storage in the deployment environment.")}</p><Link className="button" href="/resources#deployment">{tr("Cerințe de deployment", "Deployment requirements")}<ArrowRight size={16}/></Link></>}{Boolean(failure) && <ErrorBox error={failure}/>}<Link className="subtle-link" href="/resources#support">{tr("Contact și suport", "Contact and support")}</Link></section></div>;
}
