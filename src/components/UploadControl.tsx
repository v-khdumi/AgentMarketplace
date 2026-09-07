"use client";

import { useState } from "react";
import { Check, FileArchive, ImagePlus } from "lucide-react";
import type { StoredFile } from "@/lib/contracts";
import { api } from "@/lib/client";
import { BusyIcon, ErrorBox, useText } from "./ui";

export function UploadControl({ kind, file, onUploaded, onBusy, disabled = false }: { kind: StoredFile["kind"]; file?: Pick<StoredFile, "id" | "name" | "bytes"> | null; onUploaded: (file: StoredFile) => void; onBusy?: (value: boolean) => void; disabled?: boolean }) {
  const tr = useText(); const [busy, setBusy] = useState(false); const [error, setError] = useState<unknown>(null);
  const label = kind === "solution" ? tr("Soluție Power Platform ZIP", "Power Platform solution ZIP") : kind === "logo" ? tr("Logo organizație", "Organization logo") : tr("Icon agent", "Agent icon");
  return <div className="form-stack upload-control"><label className="file-picker">{busy ? <BusyIcon/> : kind === "solution" ? <FileArchive size={23}/> : <ImagePlus size={23}/>}<strong>{label}</strong><input aria-label={label} type="file" accept={kind === "solution" ? ".zip" : kind === "icon" ? "image/png" : "image/png,image/jpeg,image/webp"} disabled={disabled || busy} onChange={async (event) => {
    const input = event.currentTarget; const selected = input.files?.[0]; if (!selected) return;
    setError(null); setBusy(true); onBusy?.(true);
    try {
      const maximum = kind === "solution" ? 50 : kind === "logo" ? 2 : 1;
      if (selected.size > maximum * 1024 * 1024) throw new Error(tr(`Fișierul depășește limita de ${maximum} MB.`, `The file exceeds the ${maximum} MB limit.`));
      const body = new FormData(); body.set("file", selected);
      onUploaded(await api<StoredFile>(`files?kind=${kind}`, { method: "POST", body }));
    } catch (failure) { setError(failure); } finally { setBusy(false); onBusy?.(false); input.value = ""; }
  }}/><span className="file-info">{kind === "solution" ? ".zip · 50 MB" : kind === "icon" ? "PNG · 1 MB" : "PNG / JPEG / WebP · 2 MB"}</span></label>{file && <div className="file-info"><Check size={15}/> {file.name} · {(file.bytes / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} KB</div>}{Boolean(error) && <ErrorBox error={error}/>}</div>;
}