import type { NextAuthOptions } from "next-auth";
import type { JWT } from "next-auth/jwt";
import AzureADProvider from "next-auth/providers/azure-ad";
import { getRepository } from "./repository";

export function entraConfigured() {
  return Boolean(process.env.ENTRA_CLIENT_ID && process.env.ENTRA_CLIENT_SECRET && /^[0-9a-f-]{36}$/i.test(process.env.ENTRA_TENANT_ID ?? "") && process.env.NEXTAUTH_SECRET);
}

async function graphIdentity(accessToken: string) {
  const headers = { Authorization: `Bearer ${accessToken}` };
  const response = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,mail,userPrincipalName,userType", { headers, signal: AbortSignal.timeout(10000), cache: "no-store" });
  if (!response.ok) throw new Error("Unable to verify the Microsoft account.");
  const profile = await response.json() as { id: string; userType: string; displayName?: string; mail?: string; userPrincipalName?: string };
  const groups: string[] = [];
  let next: string | undefined = "https://graph.microsoft.com/v1.0/me/transitiveMemberOf/microsoft.graph.group?$select=id&$top=999";
  for (let page = 0; next && page < 20; page++) {
    if (!next.startsWith("https://graph.microsoft.com/v1.0/")) throw new Error("Invalid Microsoft pagination URL.");
    const result = await fetch(next, { headers, signal: AbortSignal.timeout(10000), cache: "no-store" });
    if (!result.ok) throw new Error("Unable to verify group memberships.");
    const data = await result.json() as { value: { id: string }[]; "@odata.nextLink"?: string };
    groups.push(...data.value.map((group) => group.id)); next = data["@odata.nextLink"];
  }
  if (next) throw new Error("Group membership pagination limit reached.");
  return { ...profile, groups };
}

async function refresh(token: JWT): Promise<JWT> {
  try {
    const response = await fetch(`https://login.microsoftonline.com/${process.env.ENTRA_TENANT_ID}/oauth2/v2.0/token`, {
      method: "POST", signal: AbortSignal.timeout(10000), cache: "no-store",
      body: new URLSearchParams({ client_id: process.env.ENTRA_CLIENT_ID!, client_secret: process.env.ENTRA_CLIENT_SECRET!, grant_type: "refresh_token", refresh_token: token.refreshToken ?? "", scope: "openid profile email offline_access User.Read" }),
    });
    if (!response.ok) throw new Error("Token refresh failed");
    const account = await response.json() as { access_token: string; refresh_token?: string; expires_in: number };
    return { ...token, accessToken: account.access_token, refreshToken: account.refresh_token ?? token.refreshToken, accessTokenExpires: Date.now() + account.expires_in * 1000, error: undefined };
  } catch { return { ...token, error: "RefreshAccessTokenError" }; }
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: entraConfigured() ? [AzureADProvider({ clientId: process.env.ENTRA_CLIENT_ID!, clientSecret: process.env.ENTRA_CLIENT_SECRET!, tenantId: process.env.ENTRA_TENANT_ID!, authorization: { params: { scope: "openid profile email offline_access User.Read", prompt: "select_account" } } })] : [],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  callbacks: {
    async signIn({ profile }) { return (profile as { tid?: string } | undefined)?.tid === process.env.ENTRA_TENANT_ID; },
    async jwt({ token, profile, account }) {
      if (account?.access_token && profile) {
        const claims = profile as { tid?: string; oid?: string; roles?: string[] };
        token.tenantId = claims.tid; token.objectId = claims.oid;
        token.roles = claims.roles ?? []; token.accessToken = account.access_token;
        token.refreshToken = account.refresh_token; token.accessTokenExpires = (account.expires_at ?? 0) * 1000;
      } else if (Date.now() >= (token.accessTokenExpires ?? 0) - 60000) token = await refresh(token);
      if (token.error) return token;
      if (account || Date.now() >= (token.identityExpires ?? 0)) {
        try {
          const identity = await graphIdentity(token.accessToken!);
          if (token.objectId !== identity.id) throw new Error("Identity mismatch");
          token.objectId = identity.id; token.guest = identity.userType !== "Member";
          await getRepository().update(token.tenantId!, (state) => {
            state.memberships ??= {};
            for (const [id, membership] of Object.entries(state.memberships)) if (Date.now() - membership.updatedAt > 24 * 60 * 60 * 1000) delete state.memberships[id];
            state.memberships[identity.id] = { groups: identity.groups, updatedAt: Date.now() };
          });
          delete token.groups;
          token.name = identity.displayName ?? token.name; token.email = identity.mail ?? identity.userPrincipalName ?? token.email;
          token.identityExpires = Date.now() + 5 * 60 * 1000;
        } catch { token.error = "IdentityVerificationError"; }
      }
      return token;
    },
    async session({ session, token }) {
      session.error = token.error;
      if (session.user) {
        const adminGroups = (process.env.ADMIN_GROUP_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean);
        session.user.id = token.objectId; session.user.tenantId = token.tenantId;
        session.user.groups = token.groups ?? []; session.user.roles = token.roles ?? []; session.user.guest = token.guest ?? true;
        session.user.isAdmin = session.user.roles.includes("Marketplace.Admin") || session.user.groups.some((id) => adminGroups.includes(id));
      }
      return session;
    },
  },
  pages: { signIn: "/login", error: "/login" },
};
