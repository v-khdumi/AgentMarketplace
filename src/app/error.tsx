"use client";

import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { useText } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const tr = useText();
  return <div className="page-width page-content"><div className="empty-state"><h1>{tr("Serviciul nu este disponibil", "Service unavailable")}</h1><p>{tr("Verifică autentificarea și configurația serviciilor de stocare.", "Check authentication and storage service configuration.")}</p><button className="button" onClick={reset}><RefreshCw size={16}/>{tr("Reîncearcă", "Retry")}</button><Link href="/login">{tr("Autentificare", "Sign in")}</Link></div></div>;
}