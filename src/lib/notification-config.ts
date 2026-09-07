export function notificationChannels(local = false) {
  const graph = process.env.GRAPH_AUTH_MODE === "managed-identity" || (process.env.GRAPH_AUTH_MODE === "client-secret" && Boolean(process.env.ENTRA_TENANT_ID && process.env.GRAPH_CLIENT_ID && process.env.GRAPH_CLIENT_SECRET));
  let secureBase = false; let secureWebhook = false;
  try { secureBase = new URL(process.env.NEXTAUTH_URL ?? "").protocol === "https:"; } catch {}
  try {
    const webhook = new URL(process.env.TEAMS_NOTIFICATION_WEBHOOK ?? "");
    secureWebhook = webhook.protocol === "https:" && !webhook.username && !webhook.password && /\.(logic\.azure\.com|api\.powerplatform\.com)$/i.test(webhook.hostname);
  } catch {}
  return {
    email: !local && secureBase && graph && Boolean(process.env.GRAPH_MAIL_SENDER),
    teams: !local && secureBase && secureWebhook,
  };
}