"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { AlertCircle, Bot, Check, Copy, LoaderCircle, RefreshCw, SearchX, Workflow, X } from "lucide-react";
import { useLanguage } from "./LanguageProvider";
import { errorText, stateName } from "@/lib/presentation";

export function useText() { const { locale } = useLanguage(); return useCallback((ro: string, en: string) => locale === "ro" ? ro : en, [locale]); }
export function Badge({ value }: { value: string }) { const { locale } = useLanguage(); return <span className="status-badge" data-state={value}>{stateName(value, locale)}</span>; }
export function AgentArtwork({ iconId, platform, large = false }: { iconId?: string; platform: string; large?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [iconId]);
  return <span className={`agent-artwork ${large ? "large" : ""}`} data-platform={platform}>{iconId && !failed ? <Image src={`/api/marketplace/files/${encodeURIComponent(iconId)}`} alt="" width={large ? 72 : 44} height={large ? 72 : 44} unoptimized onError={() => setFailed(true)}/> : platform === "agent-builder" ? <Bot size={large ? 36 : 25}/> : <Workflow size={large ? 36 : 25}/>}</span>;
}
export function PlatformLabel({ platform }: { platform: string }) { return <span className="platform-label" data-platform={platform}>{platform === "agent-builder" ? "M365 Copilot · Agent Builder" : "Copilot Studio"}</span>; }
export function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const { locale } = useLanguage(); const tr = useText();
  return <div className="error-notice" role="alert"><AlertCircle size={19}/><span>{errorText(error, locale)}</span>{retry && <button className="button quiet" onClick={retry}><RefreshCw size={15}/>{tr("Reîncearcă", "Retry")}</button>}</div>;
}
export function Loading({ rows = 3 }: { rows?: number }) { const tr = useText(); return <div className="loading-list" role="status"><span className="sr-only">{tr("Se încarcă…", "Loading…")}</span>{Array.from({ length: rows }, (_, index) => <div className="skeleton" key={index}/>)}</div>; }
export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) { return <div className="empty-state"><SearchX size={30}/><h2>{title}</h2>{children}</div>; }
export function BusyIcon() { return <LoaderCircle className="spin" size={16}/>; }
export function Field({ label, children, hint, required = false, error }: { label: string; children: React.ReactNode; hint?: string; required?: boolean; error?: string }) {
  return <label className="field"><span className="field-label">{label}{required && <span aria-hidden="true"> *</span>}</span>{children}{hint && <small>{hint}</small>}{error && <small className="field-error">{error}</small>}</label>;
}
export function Toggle({ label, checked, onChange, disabled = false }: { label: string; checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) { return <label className="toggle-row"><input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} disabled={disabled}/><span>{label}</span></label>; }
export function Modal({ title, close, children }: { title: string; close: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null); const titleId = useId(); const tr = useText();
  useEffect(() => { const dialog = ref.current!; dialog.showModal(); return () => dialog.close(); }, []);
  return <dialog ref={ref} className="app-dialog" aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); close(); }} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) close(); }}><div className="dialog-heading"><h2 id={titleId}>{title}</h2><button className="icon-button" type="button" title={tr("Închide", "Close")} aria-label={tr("Închide", "Close")} onClick={close}><X size={19}/></button></div>{children}</dialog>;
}
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false); const [error, setError] = useState(false); const tr = useText();
  return <button className="icon-button" type="button" title={error ? tr("Copierea a eșuat", "Copy failed") : copied ? tr("Copiat", "Copied") : label} aria-label={label} onClick={async () => { try { await navigator.clipboard.writeText(value); setCopied(true); setError(false); } catch { setError(true); } }}>{error ? <AlertCircle size={16}/> : copied ? <Check size={16}/> : <Copy size={16}/>}</button>;
}