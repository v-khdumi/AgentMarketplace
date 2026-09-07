export function isLoopbackHost(host: string | null) {
  return host !== null && /^(localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host);
}

export function isLoopbackRequest(headers: Pick<Headers, "get">) {
  const forwarded = headers.get("x-forwarded-host");
  return isLoopbackHost(headers.get("host")) && (forwarded === null || isLoopbackHost(forwarded));
}