import test from "node:test";
import assert from "node:assert/strict";
import { draftSchema, newDraft, submissionIssues } from "../src/lib/contracts.ts";

test("empty drafts can be saved but not published", () => {
  const draft = newDraft();
  assert.equal(draftSchema.safeParse(draft).success, true);
  assert.ok(submissionIssues(draft).some(issue => issue.field === "name"));
  assert.ok(submissionIssues(draft).some(issue => issue.field === "distribution"));
});

test("canonical configuration whitespace is preserved and executable links are rejected", () => {
  const draft = newDraft();
  draft.instructions = "  Original instructions\n\nKeep this spacing.  ";
  assert.equal(draftSchema.parse(draft).instructions, draft.instructions);
  draft.distribution.launchUrl = "javascript:alert(1)";
  assert.equal(draftSchema.safeParse(draft).success, false);
});

test("Agent Builder cannot masquerade as a Power Platform solution", () => {
  const draft = newDraft();
  draft.distribution.packageId = "file-id";
  draft.distribution.downloadEnabled = true;
  assert.ok(submissionIssues(draft).some(issue => issue.message.includes("Copilot Studio")));
  draft.name = "a".repeat(31);
  assert.ok(submissionIssues(draft).some(issue => issue.field === "name"));
});

test("platform-specific configuration cannot be interchanged", () => {
  const builder = newDraft();
  const studio = newDraft("copilot-studio");
  assert.equal(draftSchema.safeParse({ ...builder, studio: studio.studio }).success, false);
  assert.equal(draftSchema.safeParse({ ...studio, builder: builder.builder }).success, false);
});