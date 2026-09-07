# Agent Marketplace

Private, tenant-scoped marketplace for Microsoft 365 Copilot Agent Builder and Copilot Studio agents. It combines governed publication, original configuration sharing, Power Platform solution distribution, access workflows, and a moderated B2B community.

[![Deploy to Azure](https://aka.ms/deploytoazurebutton)](https://portal.azure.com/#create/Microsoft.Template/uri/https%3A%2F%2Fraw.githubusercontent.com%2Fv-khdumi%2FAgentMarketplace%2Fmain%2Finfra%2Fazuredeploy-demo.json)

The button deploys a public, login-free, read-only MVP with example agents and community content. It uses an App Service F1 plan and resets its immutable example state when the app restarts. F1 is intended only for demos and may sleep, throttle, or be unavailable in some subscriptions.

## What is implemented

- Single-resource-tenant Microsoft Entra sign-in with invited B2B guests and verified transitive groups.
- Reader, publisher, reviewer, and administrator roles with user/group assignments.
- Draft, submission, independent review, two-reviewer high-risk policy, stable published versions, archive and restore.
- Exact Agent Builder configuration reference and genuine Copilot Studio solution ZIP validation/download.
- Owner-approved access requests kept separate from Microsoft runtime sharing and licenses.
- Creator profiles, agent Q&A, accepted answers, ideas/voting/progress, voluntary teams, following, inbox, reports, moderation, and community policy.
- Persistent email/Teams notification outbox with leases, bounded retries, opt-out, and audience revalidation before delivery.
- Private Azure Blob Storage, Managed Identity, Key Vault references, Defender for Storage scan gating, and App Service health checks.

This application does not create Microsoft licenses, grant source permissions, import Studio solutions, share deployed agents, or prove runtime access. Those actions remain in Microsoft 365, Power Platform, and the tenant administration plane.

## Local development

Use Node.js 22. Copy `.env.example` to `.env.local`, keep `DEMO_MODE=true`, and set a development `NEXTAUTH_SECRET`. Local identity switching is accepted only on loopback hosts and is always disabled in production.

```powershell
npm install
npm run dev
```

Open `http://localhost:3000`. Local metadata is stored in `.marketplace-data`; do not use this mode for shared or production environments.

Validation commands:

```powershell
npm run lint
npm test
npm run typecheck
npm run test:e2e
npm run build
npm run package
```

## Microsoft Entra setup

Create a single-tenant web app registration in the resource tenant and add:

- Redirect URI: `https://<app>.azurewebsites.net/api/auth/callback/azure-ad`
- Delegated: `openid`, `profile`, `email`, `offline_access`, `User.Read`
- Application: `User.Read.All`, `Group.Read.All`, `CopilotPackages.Read.All`
- Optional notification sender: application `Mail.Send`, restricted to the chosen Exchange Online mailbox
- App roles: `Marketplace.Publisher`, `Marketplace.Reviewer`, `Marketplace.Admin`

Grant tenant-wide admin consent. Copilot package inventory also requires the applicable Agent 365 license. Invite external users into the resource tenant as B2B guests; this is not a generic multi-tenant sign-in.

Microsoft package API reference: <https://learn.microsoft.com/microsoft-365-copilot/extensibility/api/admin-settings/package/copilotpackages-list>

## Azure deployment

The Bicep template creates paid resources: Linux App Service, Storage, Key Vault, Log Analytics, and Defender for Storage. Review SKU, malware scan cap, retention, networking, and regional requirements before deployment.

```powershell
azd auth login
azd env new production
azd env set ENTRA_CLIENT_ID <guid>
azd env set ENTRA_TENANT_ID <guid>
azd env set ENTRA_CLIENT_SECRET <secret>
azd env set NEXTAUTH_SECRET <32-plus-random-characters>
azd env set ADMIN_GROUP_IDS <comma-separated-group-ids>
azd env set NOTIFICATIONS_JOB_TOKEN <32-plus-random-characters>
azd env set GRAPH_MAIL_SENDER <optional-mailbox>
azd env set TEAMS_NOTIFICATION_WEBHOOK <optional-workflows-webhook>
azd up
```

Build Linux deployment artifacts on Linux because native packages are platform-specific. The GitHub deployment workflow validates lint, unit tests, TypeScript, Playwright, Bicep, build, and standalone packaging before OIDC deployment. Configure repository secrets `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, and variable `AZURE_WEBAPP_NAME`.

### Public demo / MVP

Use the Deploy to Azure button above for a showcase that requires no Microsoft Entra registration and displays no login screen. The template:

- deploys App Service F1 and initializes the read-only showcase state in ephemeral application storage;
- installs a prebuilt Linux standalone package published with this repository, avoiding an in-portal build;
- sets `PUBLIC_DEMO_MODE=true` and initializes representative catalog, profile, discussion, idea, and team data;
- exposes all role-based screens through a shared demo administrator while blocking every non-GET marketplace API request;
- disables upload/download and external notification delivery paths for the public visitor.

The demo is not the enterprise deployment. Use `infra/main.bicep` and configure Entra, Key Vault, Defender, Graph, roles, and B2B access for a writable organizational instance.

## Community notifications

In-app notifications require no external provider. Optional channels are enabled only when their complete server configuration is valid:

- Email uses Microsoft Graph `sendMail`, `GRAPH_AUTH_MODE=managed-identity`, and `GRAPH_MAIL_SENDER`.
- Teams uses a server-controlled Teams Workflows webhook. Users cannot supply webhook URLs.
- `.github/workflows/notification-delivery.yml` calls the protected worker every ten minutes. Configure variable `NOTIFICATIONS_JOB_URL` as `https://<app>/api/jobs/notifications` and secret `NOTIFICATIONS_JOB_TOKEN` to match the App Service Key Vault value.

Provider acceptance means the request was accepted, not that a human read it. Failed deliveries use bounded exponential retry. Reading a notification, disabling a channel, community closure, or loss of audience access cancels pending delivery.

## Operational limits

- Metadata is one optimistic-concurrency JSON document per tenant, capped at 64 MB. Binaries are separate blobs. This is suitable for an organizational community, not an internet-scale social network.
- Local storage supports one application process only. Azure Blob is required for deployed instances.
- Solution uploads are capped at 50 MB and downloads can require a clean Defender result.
- Archive and moderation preserve audit/history. Define organizational retention and deletion procedures separately.
- Outbound worker processes five deliveries per invocation and retries at most five times.
- A successful health endpoint verifies configuration and storage reachability, not live user login, Graph consent, Microsoft licenses, Defender completion, Studio import, Teams delivery, or mailbox delivery.

Before production acceptance, test with real tenant identities, B2B users, Graph permissions, an Agent 365 license, Defender results, an exported Studio solution, the target Power Platform environment, and both notification providers.