import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";

test("deployment uses the same standalone artifact that passed validation", async () => {
  const workflow = yaml.load(await readFile(new URL("../.github/workflows/azure-deploy.yml", import.meta.url), "utf8"));
  const validation = workflow.jobs.validate.steps;
  const packaging = validation.find(step => step.name === "Package validated application");
  const upload = validation.find(step => step.with?.name === "marketplace-standalone");
  const archive = /^zip -qr (\S+) \.$/.exec(packaging.run)?.[1];
  assert.ok(archive);
  assert.equal(path.resolve(packaging["working-directory"], archive), path.resolve(upload.with.path));
  for (const gate of ["npm run lint", "npm test", "npm run typecheck", "npm run test:e2e", "npm run build", "npm run package"]) assert.equal(validation.filter(step => step.run === gate).length, 1, gate);
  assert.equal(workflow.jobs.deploy.needs, "validate");
  assert.equal(workflow.jobs.deploy.steps.some(step => step.run === "npm run build"), false);
  const deployment = workflow.jobs.deploy.steps.find(step => step.uses === "azure/webapps-deploy@v3");
  assert.equal(deployment.with.package, path.basename(upload.with.path));
});

test("Azure Developer CLI packages the standalone directory and selects the subscription wrapper", async () => {
  const config = yaml.load(await readFile(new URL("../azure.yaml", import.meta.url), "utf8"));
  assert.equal(config.services.web.dist, ".next/standalone");
  assert.equal(config.infra.module, "azd");
  const parameters = JSON.parse(await readFile(new URL("../infra/azd.parameters.json", import.meta.url), "utf8"));
  assert.equal(parameters.parameters.nextAuthSecret.value, "${NEXTAUTH_SECRET}");
  assert.equal(parameters.parameters.notificationsJobToken.value, "${NOTIFICATIONS_JOB_TOKEN}");
});

test("notification delivery is scheduled through the protected production worker", async () => {
  const workflow = yaml.load(await readFile(new URL("../.github/workflows/notification-delivery.yml", import.meta.url), "utf8"));
  assert.equal(workflow.on.schedule[0].cron, "*/10 * * * *");
  const dispatch = workflow.jobs.deliver.steps.find(step => step.name === "Dispatch pending notifications");
  assert.equal(dispatch.env.JOB_TOKEN, "${{ secrets.NOTIFICATIONS_JOB_TOKEN }}");
  assert.match(dispatch.run, /Authorization: Bearer \$JOB_TOKEN/);
  assert.match(dispatch.run, /--max-time 90/);
});

test("public demo template is login-free, read-only and deploys from the public repository", async () => {
  const template = JSON.parse(await readFile(new URL("../infra/azuredeploy-demo.json", import.meta.url), "utf8"));
  const resources = JSON.stringify(template.resources);
  assert.match(resources, /PUBLIC_DEMO_MODE/);
  assert.match(template.parameters.packageUri.defaultValue, /raw\.githubusercontent\.com\/v-khdumi\/AgentMarketplace\/main\/release\/agent-marketplace-linux\.zip/);
  assert.match(resources, /onedeploy/);
  assert.doesNotMatch(resources, /ENTRA_CLIENT_SECRET/);
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /aka\.ms\/deploytoazurebutton/);
  assert.match(readme, /azuredeploy-demo\.json/);
});