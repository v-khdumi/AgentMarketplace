import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import sharp from "sharp";
import { newDraft, type AgentRecord } from "../../src/lib/contracts";
import type { CommunityTeam, TopicView } from "../../src/lib/community-contracts";

test.describe.configure({ timeout: 300000 });
const origin = `http://localhost:${process.env.MARKETPLACE_E2E_PORT ?? "3107"}`;

async function command<Result>(context: BrowserContext, actor: string, path: string, method = "GET", body?: unknown): Promise<Result> {
  const response = await context.request.fetch(`/api/marketplace/${path}`, { method, headers: { Origin: origin, Cookie: `marketplace-local-user=${actor}` }, ...(body === undefined ? {} : { data: body }) });
  expect(response.ok(), await response.text()).toBeTruthy();
  return (await response.json()).data as Result;
}

async function identity(page: Page, actor: string, path: string) {
  await page.context().addCookies([{ name: "marketplace-local-user", value: actor, domain: "localhost", path: "/" }]);
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 120000 });
  await expect(page.getByLabel("Local identity")).toHaveValue(actor, { timeout: 120000 });
}

async function publish(context: BrowserContext) {
  const draft = newDraft(); Object.assign(draft, { name: "Community acceptance agent", summary: "A reviewed community fixture", description: "Original description", instructions: "Use approved sources only.", license: "Microsoft 365 Copilot" });
  draft.distribution.launchUrl = "https://m365.cloud.microsoft/chat/agents/community-acceptance";
  let record = await command<AgentRecord>(context, "local-publisher", "agents", "POST", { draft });
  record = await command<AgentRecord>(context, "local-publisher", `agents/${record.id}`, "PATCH", { action: "submit", revision: record.revision });
  return command<AgentRecord>(context, "local-reviewer", `agents/${record.id}`, "PATCH", { action: "approve", revision: record.revision, note: "Approved community fixture" });
}

test.beforeEach(async ({ context }) => {
  await context.addCookies([{ name: "marketplace-locale", value: "en", domain: "localhost", path: "/" }]);
});

test("agent questions, author edits, accepted answers and private inbox work together", async ({ page, context }) => {
  const agent = await publish(context);
  await identity(page, "local-reader", `/agents/${agent.id}?tab=community`);
  await page.getByRole("button", { name: "Ask a question", exact: true }).click();
  await page.getByLabel("Title", { exact: false }).fill("Which library contains the approved policies?");
  await page.getByLabel("Question and context").fill("We need the reviewed policies for the current reporting period.");
  await page.getByLabel("This content follows the community rules").check();
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 120000 }).toMatch(/\/community\/topics\//);
  const path = new URL(page.url()).pathname; const id = path.split("/").at(-1)!;
  await expect(page.getByRole("heading", { name: "Which library contains the approved policies?" })).toBeVisible();
  await identity(page, "local-publisher", path);
  await page.getByLabel("Your reply").fill("Use the approved SharePoint policy library.");
  await page.getByRole("button", { name: "Post reply", exact: true }).click();
  await expect(page.locator(".community-reply")).toContainText("Use the approved SharePoint policy library.");
  await page.getByRole("button", { name: "Edit reply", exact: true }).click();
  await page.getByRole("textbox", { name: "Reply", exact: true }).fill("Use the approved SharePoint library, current-year policies.");
  await page.getByRole("dialog").getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".community-reply")).toContainText("current-year policies.");
  await identity(page, "local-reader", path);
  await page.getByRole("button", { name: "Accept answer", exact: true }).click();
  await expect(page.locator(".community-reply[data-accepted=true]")).toContainText("Accepted answer");
  await page.reload();
  await expect(page.locator(".community-reply[data-accepted=true]")).toContainText("current-year policies.");
  const guest = await context.request.get(`/api/marketplace/community/topics/${id}`, { headers: { Cookie: "marketplace-local-user=local-guest" } });
  expect(guest.status()).toBe(404);
  await page.goto("/community?tab=notifications");
  const notification = page.locator(".notification-row").filter({ hasText: "New reply" }).filter({ hasText: "Which library" });
  await expect(notification).toHaveAttribute("data-unread", "true");
  await notification.getByRole("button", { name: "Mark as read", exact: true }).click();
  await expect(notification).toHaveAttribute("data-unread", "false");
  await expect(page.getByLabel("Personal email", { exact: true })).toBeDisabled();
  await expect(page.getByLabel("Teams · community channel", { exact: true })).toBeDisabled();
});

test("ideas can be voted, claimed, completed with an agent and moderated with a reason", async ({ page, context }) => {
  const agent = await publish(context);
  await identity(page, "local-reader", "/community?tab=ideas");
  await page.getByRole("button", { name: "Propose an agent", exact: true }).click();
  await page.getByLabel("Title", { exact: false }).fill("Build a policy renewal assistant");
  await page.getByLabel("Need and desired outcome").fill("Track policy review dates and notify the responsible policy owners.");
  await page.getByLabel("This content follows the community rules").check();
  await page.getByRole("button", { name: "Post", exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 120000 }).toMatch(/\/community\/topics\//);
  const path = new URL(page.url()).pathname;
  await page.getByRole("button", { name: /^Vote/ }).click();
  await expect(page.getByRole("button", { name: /^Remove vote/ })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: /^Remove vote/ }).click();
  await expect(page.getByRole("button", { name: /^Vote/ })).toHaveAttribute("aria-pressed", "false");
  await identity(page, "local-publisher", path);
  await page.getByLabel("Idea status").selectOption("in-progress");
  await page.getByLabel("Progress note").fill("Taking ownership of the implementation.");
  await page.getByRole("button", { name: "Update progress", exact: true }).click();
  await expect(page.getByRole("heading", { name: "In progress", exact: true })).toBeVisible();
  await page.getByLabel("Idea status").selectOption("available");
  await page.getByLabel("Published agent", { exact: false }).selectOption(agent.id);
  await page.getByLabel("Progress note").fill("The reviewed implementation is now published.");
  await page.getByRole("button", { name: "Update progress", exact: true }).click();
  await expect(page.getByRole("link", { name: "Open published agent", exact: true })).toHaveAttribute("href", `/agents/${agent.id}`);
  await identity(page, "local-reader", path);
  await page.getByRole("button", { name: "Report content", exact: true }).click();
  await page.getByLabel("Report reason").fill("Please confirm that the source references are approved for sharing.");
  await page.getByRole("button", { name: "Submit report", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Report submitted" })).toBeVisible();
  await identity(page, "local-reviewer", "/community?tab=moderation");
  const report = page.locator(".moderation-report").filter({ hasText: "Build a policy renewal assistant" });
  await report.getByRole("button", { name: "Hide", exact: true }).click();
  await page.getByLabel("Decision reason").fill("Hidden while the source permissions are checked.");
  await page.getByRole("button", { name: "Confirm decision", exact: true }).click();
  await expect(report).toHaveCount(0);
  await page.getByLabel("Report status").selectOption("resolved");
  await expect(report).toContainText("Hidden");
  await report.getByRole("button", { name: "Restore", exact: true }).click();
  await page.getByLabel("Decision reason").fill("The source permissions were confirmed by the owner.");
  await page.getByRole("button", { name: "Confirm decision", exact: true }).click();
  await expect(report).toContainText("Visible");
  await identity(page, "local-reader", path);
  await expect(page.getByRole("heading", { name: "Build a policy renewal assistant", exact: true })).toBeVisible();
});

test("creator profiles and voluntary teams persist and transfer without assigning marketplace roles", async ({ page, context }) => {
  await identity(page, "local-publisher", "/community/people/me");
  await page.getByRole("button", { name: "Edit profile", exact: true }).click();
  await page.getByLabel("Professional headline", { exact: true }).fill("Copilot community creator");
  await page.getByLabel("About me", { exact: true }).fill("I help teams publish governed agents and share original configurations.");
  await page.getByLabel("Skills, comma separated").fill("Copilot Studio, Agent Builder");
  await page.getByLabel("Profile published to the community").check();
  await page.getByRole("button", { name: "Save profile", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile saved" })).toBeVisible();
  await page.reload();
  await expect(page.locator(".profile-heading")).toContainText("Copilot community creator");
  const guestProfile = await context.request.get("/api/marketplace/community/profiles/local-publisher", { headers: { Cookie: "marketplace-local-user=local-guest" } }); expect(guestProfile.status()).toBe(404);
  await page.goto("/community?tab=teams");
  await page.getByRole("button", { name: "Create team", exact: true }).click();
  await page.getByLabel("Team name").fill("Policy makers community");
  await page.getByLabel("About the team").fill("Colleagues building and maintaining approved policy agents.");
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 120000 }).toMatch(/\/community\/teams\//);
  const path = new URL(page.url()).pathname; const id = path.split("/").at(-1)!;
  await identity(page, "local-reader", path);
  await page.getByRole("button", { name: "Join team", exact: true }).click();
  await expect(page.getByRole("button", { name: "Leave team", exact: true })).toBeVisible();
  const unauthorized = await context.request.get("/api/marketplace/agents?scope=review", { headers: { Cookie: "marketplace-local-user=local-reader" } }); expect(unauthorized.status()).toBe(403);
  await identity(page, "local-publisher", path);
  await page.getByRole("button", { name: "Transfer ownership", exact: true }).click();
  await page.getByLabel("New owner").selectOption("local-reader");
  await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.getByRole("button", { name: "Transfer ownership", exact: true })).toHaveCount(0);
  await identity(page, "local-reader", path);
  await page.getByRole("button", { name: "Edit team", exact: true }).click();
  await page.getByLabel("About the team").fill("A voluntary team with transferred community ownership.");
  await page.getByRole("button", { name: "Save team", exact: true }).click();
  await expect(page.locator(".community-detail")).toContainText("transferred community ownership.");
  const saved = await command<CommunityTeam>(context, "local-reader", `community/teams/${id}`); expect(saved.ownerId).toBe("local-reader");
  await page.getByRole("button", { name: "Archive team", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page).toHaveURL(/tab=teams/);
  await expect(page.getByRole("link", { name: "Policy makers community", exact: true })).toHaveCount(0);
});

test("community views render without mobile overflow and preserve original content across languages", async ({ page, context }, testInfo) => {
  const topic = await command<TopicView>(context, "local-reader", "community/topics", "POST", { kind: "idea", agentId: "", title: "Community accessibility and multilingual acceptance", body: "Original contribution text must remain unchanged when the interface language changes.", category: "productivity", audience: "members" });
  const views = ["/community?tab=ideas", "/community?tab=people", "/community?tab=notifications", "/community?tab=moderation", `/community/topics/${topic.id}`, "/community/people/me"];
  const failures: string[] = []; page.on("pageerror", error => failures.push(error.message));
  await identity(page, "local-admin", views[0]);
  for (const viewport of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const [index, view] of views.entries()) {
      await page.goto(view);
      await expect(page.locator("main h1")).toBeVisible();
      await expect(page.locator("main .skeleton")).toHaveCount(0, { timeout: 120000 });
      await expect(page.locator("main [role=alert]")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      const screenshot = await page.screenshot({ path: testInfo.outputPath(`community-${viewport.width}-${index}.png`), fullPage: true });
      const stats = await sharp(screenshot).stats(); expect(stats.channels.some(channel => channel.stdev > 10)).toBe(true);
    }
  }
  await page.goto(`/community/topics/${topic.id}`);
  await Promise.all([page.waitForEvent("domcontentloaded"), page.getByRole("button", { name: "Schimbă în limba română" }).click()]);
  await expect(page.locator("html")).toHaveAttribute("lang", "ro");
  await expect(page.locator(".community-original")).toContainText(topic.body);
  await expect(page.getByRole("button", { name: /^Votează/ })).toBeVisible();
  expect(failures).toEqual([]);
});