import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { zipSync, strToU8 } from "fflate";
import sharp from "sharp";
import { newDraft, type AgentDraft, type AgentRecord, type AgentDetail } from "../../src/lib/contracts";

const origin = `http://localhost:${process.env.MARKETPLACE_E2E_PORT ?? "3107"}`;

async function identity(page: Page, id: string) {
  await page.goto("/");
  await expect(page.getByLabel("Local identity")).toBeVisible();
  if (await page.getByLabel("Local identity").inputValue() !== id) {
    await Promise.all([page.waitForEvent("domcontentloaded", { timeout: 60000 }), page.getByLabel("Local identity").selectOption(id)]);
  }
  await expect(page.getByLabel("Local identity")).toHaveValue(id);
  await expect(page.locator(".account-menu")).toContainText(id === "local-publisher" ? "LP" : id === "local-reader" ? "LR" : id === "local-reviewer" ? "LR" : id === "local-guest" ? "LB" : "LA");
}

async function language(page: Page, locale: "ro" | "en") {
  await page.context().addCookies([{ name: "marketplace-locale", value: locale, domain: "localhost", path: "/" }]);
  await page.reload({ waitUntil: "domcontentloaded", timeout: 120000 });
  await expect(page.locator("html")).toHaveAttribute("lang", locale, { timeout: 120000 });
}

async function command<Result>(context: BrowserContext, identityId: string, endpoint: string, method = "GET", body?: unknown): Promise<Result> {
  const response = await context.request.fetch(`/api/marketplace/${endpoint}`, { method, headers: { Origin: origin, Cookie: `marketplace-local-user=${identityId}` }, ...(body === undefined ? {} : { data: body }) });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).data as Result;
}

function completeDraft(platform: AgentDraft["platform"] = "agent-builder") {
  const draft = newDraft(platform);
  Object.assign(draft, { name: platform === "agent-builder" ? "Access workflow agent" : "Solution validation agent", summary: "An end-to-end test agent", description: "Original configuration description", instructions: "  Preserve these instructions.\nSecond line.\n", license: "Test license requirement", releaseNotes: "First approved version" });
  draft.distribution.launchUrl = "https://m365.cloud.microsoft/chat/agents/test-fixture";
  if (draft.platform === "copilot-studio") Object.assign(draft.studio, { environment: "Test environment", environmentId: "00000000-0000-0000-0000-000000000001" });
  return draft;
}

async function publishFixture(context: BrowserContext, draft = completeDraft()) {
  let record = await command<AgentRecord>(context, "local-publisher", "agents", "POST", { draft });
  record = await command<AgentRecord>(context, "local-publisher", `agents/${record.id}`, "PATCH", { action: "submit", revision: record.revision });
  return command<AgentRecord>(context, "local-reviewer", `agents/${record.id}`, "PATCH", { action: "approve", revision: record.revision, note: "Reviewed test fixture" });
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "marketplace-locale", value: "en", domain: "localhost", path: "/" }]);
});

test("controlled editor persists canonical fields, validates steps and requires two reviewers", async ({ page, context }) => {
  await identity(page, "local-publisher");
  await page.getByRole("link", { name: "Publish an agent", exact: true }).first().click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Complete the required fields" })).toBeVisible();
  await expect(page.getByRole("button", { name: "5 Review" })).toBeDisabled();
  await page.getByRole("textbox", { name: /^Name/ }).fill("Governed workflow agent");
  await page.getByRole("textbox", { name: /^Marketplace summary/ }).fill("A controlled publication workflow");
  await page.getByRole("textbox", { name: /^Description/ }).fill("Canonical description with original wording");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  const instructions = "  Preserve these instructions.\nSecond line.\n";
  await page.getByRole("textbox", { name: /^Instructions/ }).fill(instructions);
  await page.getByLabel("Create documents, charts, and code").check();
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("textbox", { name: /^Name/ })).toHaveValue("Governed workflow agent");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page).toHaveURL(/submit\?id=/);
  const id = new URL(page.url()).searchParams.get("id")!;
  await page.reload();
  await expect(page.getByRole("textbox", { name: /^Description/ })).toHaveValue("Canonical description with original wording");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByRole("textbox", { name: /^Instructions/ })).toHaveValue(instructions);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Add source", exact: true }).click();
  await page.getByLabel("Type", { exact: false }).fill("SharePoint");
  await page.getByLabel("Name", { exact: false }).fill("Approved library");
  await page.getByLabel("Exact location / scope", { exact: false }).fill("https://example.sharepoint.com/sites/approved");
  await page.getByRole("button", { name: "Add prompt", exact: true }).click();
  await page.getByLabel("Title", { exact: false }).fill("Find a policy");
  await page.getByLabel("Message", { exact: false }).fill("  Find the original policy.\n");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Actual agent launch URL (HTTPS)").fill("https://m365.cloud.microsoft/chat/agents/test-fixture");
  await page.getByLabel("Licensing and usage requirements", { exact: false }).fill("Microsoft 365 Copilot license required");
  await page.getByLabel("Visible to authorized B2B guests").check();
  await page.getByLabel("Release notes").fill("First published revision");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("I confirm the configuration, licenses and source permissions have been reviewed.").check();
  await page.getByRole("button", { name: "Submit for review", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Submitted for review" })).toBeVisible();
  const record = (await command<AgentDetail>(context, "local-publisher", `agents/${id}?draft=true`)).record!;
  const selfReview = await context.request.patch(`/api/marketplace/agents/${id}`, { headers: { Origin: origin, Cookie: "marketplace-local-user=local-publisher" }, data: { action: "approve", revision: record.revision, note: "Self review" } });
  expect(selfReview.status()).toBe(403);
  await identity(page, "local-admin");
  await page.goto(`/agents/${id}?draft=true&tab=configuration`);
  await page.getByLabel("Risk level").selectOption("High");
  await page.getByRole("button", { name: "Update risk" }).click();
  await expect(page.locator(".review-strip")).toContainText("0 / 2");
  await page.getByLabel("Review notes").fill("First independent review completed");
  await page.getByRole("button", { name: "Approve revision", exact: true }).click();
  await expect(page.locator(".review-strip")).toContainText("1 / 2");
  await expect(page.getByRole("button", { name: "Approve revision", exact: true })).toBeDisabled();
  expect((await command<{ id: string }[]>(context, "local-reader", "agents")).some(agent => agent.id === id)).toBe(false);
  await identity(page, "local-reviewer");
  await page.goto(`/agents/${id}?draft=true&tab=configuration`);
  await page.getByLabel("Review notes").fill("Second independent review completed");
  await page.getByRole("button", { name: "Approve revision", exact: true }).click();
  await expect(page.locator(".info-notice").filter({ hasText: "Working draft" })).toContainText("Published");
  await identity(page, "local-reader");
  await page.getByLabel("Search agents").fill("Governed workflow");
  await page.getByRole("link", { name: "Governed workflow agent", exact: true }).click();
  await page.getByRole("tab", { name: "Configuration", exact: true }).click();
  expect(await page.locator(".readout").filter({ has: page.getByRole("heading", { name: "Instructions", exact: true }) }).locator("pre").textContent()).toBe(instructions);
  await expect(page).toHaveURL(/tab=configuration/);
  await language(page, "ro");
  await expect(page.getByRole("tab", { name: "Configurație", exact: true })).toHaveAttribute("aria-selected", "true");
  expect(await page.locator(".readout").filter({ has: page.getByRole("heading", { name: "Instructions", exact: true }) }).locator("pre").textContent()).toBe(instructions);
});

test("requests distinguish approval from sharing and enforce guest visibility", async ({ page, context }) => {
  const draft = completeDraft(); draft.distribution.guestVisible = true;
  const record = await publishFixture(context, draft);
  await identity(page, "local-reader"); await page.goto(`/agents/${record.id}`);
  await page.getByRole("button", { name: "Request access", exact: true }).click();
  await page.getByRole("textbox", { name: /^Business justification/ }).fill("Required for the monthly reporting workflow");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.locator(".access-panel")).toContainText("Pending");
  await identity(page, "local-publisher"); await page.goto("/dashboard?tab=managed");
  const request = page.locator(".request-row").filter({ hasText: draft.name });
  await request.getByRole("button", { name: "Approve request" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve request" }).click();
  await expect(request).toContainText("Approved, sharing pending");
  const approved = await command<AgentDetail>(context, "local-reader", `agents/${record.id}`);
  expect(approved.access.state).toBe("approved"); expect(approved.access.launchUrl).toBe("");
  await request.getByRole("button", { name: "Confirm sharing" }).click();
  await page.getByLabel("Decision note", { exact: false }).fill("Shared in Microsoft with the requesting identity");
  await page.getByLabel("Sharing has been completed in Microsoft for this user.").check();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm sharing" }).click();
  await expect(request).toContainText("Sharing confirmed");
  await identity(page, "local-reader"); await page.goto(`/agents/${record.id}`);
  await expect(page.getByRole("link", { name: "Open agent", exact: true })).toHaveAttribute("href", draft.distribution.launchUrl);
  const guestDetail = await command<AgentDetail>(context, "local-guest", `agents/${record.id}`);
  expect(guestDetail.configuration).toBeNull();
  const forbidden = await context.request.get(`/api/marketplace/agents/${record.id}?draft=true`, { headers: { Cookie: "marketplace-local-user=local-reader" } }); expect(forbidden.status()).toBe(403);
  await identity(page, "local-guest"); await page.goto(`/agents/${record.id}`);
  await page.getByRole("tab", { name: "Configuration", exact: true }).click();
  await expect(page.locator(".detail-main")).toContainText("authorized internal members only");
  await expect(page.getByRole("link", { name: "Admin Center", exact: true })).toHaveCount(0);
});

test("Studio upload validates the archive and downloads identical original bytes", async ({ page, context }) => {
  const bytes = Buffer.from(zipSync({ "solution.xml": strToU8('<ImportExportXml><SolutionManifest><UniqueName>MarketplaceTest</UniqueName><Version>1.2.3.4</Version><Managed>1</Managed></SolutionManifest></ImportExportXml>'), "customizations.xml": strToU8('<ImportExportXml/>'), "[Content_Types].xml": strToU8('<Types/>') }));
  const draft = completeDraft("copilot-studio");
  let record = await command<AgentRecord>(context, "local-publisher", "agents", "POST", { draft });
  await identity(page, "local-publisher"); await page.goto(`/submit?id=${record.id}`);
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await page.getByLabel("Solution ZIP available for import").check();
  await page.getByLabel("Power Platform solution ZIP", { exact: true }).setInputFiles({ name: "not-solution.zip", mimeType: "application/zip", buffer: Buffer.from('{"fake":"solution"}') });
  await expect(page.getByRole("alert")).toBeVisible();
  await page.getByLabel("Power Platform solution ZIP", { exact: true }).setInputFiles({ name: "MarketplaceTest_1_2_3_4_managed.zip", mimeType: "application/zip", buffer: bytes });
  await expect(page.getByLabel("Solution unique name", { exact: false })).toHaveValue("MarketplaceTest");
  await expect(page.getByLabel("Solution version", { exact: false })).toHaveValue("1.2.3.4");
  await page.getByRole("button", { name: "Save draft", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Draft saved" })).toBeVisible();
  record = (await command<AgentDetail>(context, "local-publisher", `agents/${record.id}?draft=true`)).record!;
  record = await command<AgentRecord>(context, "local-publisher", `agents/${record.id}`, "PATCH", { action: "submit", revision: record.revision });
  await command(context, "local-reviewer", `agents/${record.id}`, "PATCH", { action: "approve", revision: record.revision, note: "Archive structure reviewed; live Studio import not performed" });
  await identity(page, "local-reader"); await page.goto(`/agents/${record.id}`);
  await page.getByRole("tab", { name: "Access and import" }).click();
  const downloadEvent = page.waitForEvent("download"); await page.getByRole("button", { name: "Download solution ZIP" }).click();
  const download = await downloadEvent; const downloaded = await readFile((await download.path())!);
  expect(createHash("sha256").update(downloaded).digest("hex")).toBe(createHash("sha256").update(bytes).digest("hex"));
  expect(download.suggestedFilename()).toBe("MarketplaceTest_1_2_3_4_managed.zip");
});

test("branding, role assignments and integration failures persist without simulated success", async ({ page, context }) => {
  await identity(page, "local-admin"); await page.goto("/admin?tab=branding");
  await page.getByLabel("Marketplace name", { exact: false }).fill("Internal Agent Exchange");
  await page.getByRole("textbox", { name: "Organization", exact: true }).fill("Workplace Engineering");
  await page.getByLabel("Support email").fill("support@example.test");
  const logo = await sharp({ create: { width: 192, height: 192, channels: 4, background: "#0067b8" } }).png().toBuffer();
  await page.getByLabel("Organization logo", { exact: true }).setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: logo });
  await expect(page.getByText("Logo selected", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByRole("banner")).toContainText("Internal Agent Exchange");
  await page.goto("/admin?tab=roles"); await page.getByRole("button", { name: "Assign role", exact: true }).click();
  await page.getByLabel("Name starts with").fill("Local Reader"); await page.getByRole("button", { name: "Search directory" }).click();
  await page.getByRole("radio", { name: /Local Reader/ }).check(); const roleSelect = page.getByRole("dialog").locator("select").last(); await expect(roleSelect).toBeVisible({ timeout: 120000 }); await roleSelect.selectOption("publisher");
  await page.getByRole("button", { name: "Apply role" }).click(); await expect(page.locator("table")).toContainText("Local Reader");
  await identity(page, "local-reader"); await expect(page.getByRole("link", { name: "Publish an agent", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("banner")).toContainText("Internal Agent Exchange");
  await identity(page, "local-admin"); await page.goto("/admin?tab=roles");
  await page.getByRole("button", { name: "Remove assignment Local Reader" }).click(); await page.getByRole("dialog").getByRole("button", { name: "Remove", exact: true }).click();
  await page.goto("/admin?tab=integrations");
  const storage = page.locator(".integration-row").filter({ hasText: "Marketplace storage" });
  await storage.getByRole("button", { name: "Test connection" }).click(); await expect(storage).toContainText("Local server storage: read, write and delete verified. Azure is not configured.");
  const directory = page.locator(".integration-row").filter({ hasText: "Entra users and groups" });
  await directory.getByRole("button", { name: "Test connection" }).click(); await expect(directory.getByRole("alert")).toContainText("Configure Microsoft Graph credentials"); await expect(directory).not.toContainText("Verification succeeded");
  await page.goto("/admin?tab=policies"); await page.getByLabel("Allow B2B guests").uncheck(); await page.getByRole("button", { name: "Save changes" }).click(); await expect(page.getByRole("button", { name: "Save changes" })).toBeDisabled();
  const denied = await context.request.get("/api/marketplace/agents", { headers: { Cookie: "marketplace-local-user=local-guest" } }); expect(denied.status()).toBe(403);
  await page.getByLabel("Allow B2B guests").check(); await page.getByRole("button", { name: "Save changes" }).click();
});

test("catalog and operational views fit desktop and mobile in both languages", async ({ page }, testInfo) => {
  test.setTimeout(360000);
  await identity(page, "local-admin");
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const route of ["/", "/dashboard", "/admin?tab=integrations", "/submit", "/resources"]) {
      await page.goto(route); await expect(page.getByLabel("Local identity")).toHaveValue("local-admin");
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator(".loading-list")).toHaveCount(0);
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
      expect(dimensions.document, `${route} at ${viewport.width}px`).toBeLessThanOrEqual(dimensions.viewport);
      if (route === "/" || route.startsWith("/admin")) {
        const screenshot = await page.screenshot({ path: testInfo.outputPath(`${viewport.width}-${route === "/" ? "catalog" : "admin"}.png`), fullPage: true });
        const stats = await sharp(screenshot).stats(); expect(Math.max(...stats.channels.map((channel) => channel.stdev))).toBeGreaterThan(5);
      }
    }
    await language(page, "ro");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await language(page, "en");
  }
});