export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) { super(message); this.name = "ApiError"; this.status = status; }
}

export async function api<Result>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal; timeoutMs?: number } = {}): Promise<Result> {
  const multipart = options.body instanceof FormData;
  const timeout = AbortSignal.timeout(options.timeoutMs ?? (multipart ? 120000 : 45000));
  const signal = options.signal ? AbortSignal.any([options.signal, timeout]) : timeout;
  const response = await fetch(`/api/marketplace/${path}`, {
    method: options.method ?? "GET", signal, cache: "no-store", credentials: "same-origin",
    headers: options.body && !multipart ? { "Content-Type": "application/json" } : undefined,
    body: options.body === undefined ? undefined : multipart ? options.body as FormData : JSON.stringify(options.body),
  });
  const payload: unknown = await response.json().catch(() => null);
  if (!payload || typeof payload !== "object") throw new ApiError("The server returned an unexpected response.", response.ok ? 502 : response.status);
  if (!response.ok) throw new ApiError("error" in payload && typeof payload.error === "string" ? payload.error : "The operation failed.", response.status);
  if (!("data" in payload)) throw new ApiError("The server returned an unexpected response.", 502);
  return payload.data as Result;
}

export function downloadBlob(content: Blob, name: string) {
  const url = URL.createObjectURL(content);
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = name;
  anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadFile(id: string, name: string) {
  const response = await fetch(`/api/marketplace/files/${encodeURIComponent(id)}`, { cache: "no-store", signal: AbortSignal.timeout(120000) });
  if (!response.ok) { const payload = await response.json(); throw new ApiError(payload.error ?? "Download failed.", response.status); }
  downloadBlob(await response.blob(), name);
}