import test from "node:test";
import assert from "node:assert/strict";
import { assertRevision, reviewSubmission } from "../src/lib/workflow.ts";

const submission = () => ({ ownerId: "author", state: "in-review", risk: "High", reviewers: [], reviewNote: "" });

test("high risk requires two different reviewers and cannot be self-approved", () => {
  const original = submission();
  assert.throws(() => reviewSubmission(original, { id: "author", role: "admin" }, "approve", "", true), /own submissions/);
  assert.throws(() => reviewSubmission(original, { id: "reader", role: "reader" }, "approve", "", true), /permission/);
  const first = reviewSubmission(original, { id: "first", role: "reviewer" }, "approve", "Checked", true);
  assert.equal(first.state, "in-review");
  assert.deepEqual(original.reviewers, []);
  assert.throws(() => reviewSubmission(first, { id: "first", role: "reviewer" }, "approve", "", true), /different reviewer/);
  const approved = reviewSubmission(first, { id: "second", role: "admin" }, "approve", "Checked", true);
  assert.equal(approved.state, "published");
  assert.deepEqual(approved.reviewers, ["first", "second"]);
});

test("changes require a reason and reset approvals", () => {
  const record = { ...submission(), reviewers: ["first"] };
  assert.throws(() => reviewSubmission(record, { id: "reviewer", role: "reviewer" }, "request-changes", "  ", true), /Explain/);
  const returned = reviewSubmission(record, { id: "reviewer", role: "reviewer" }, "request-changes", "Add the source URL", true);
  assert.equal(returned.state, "changes-requested");
  assert.equal(returned.reviewNote, "Add the source URL");
  assert.deepEqual(returned.reviewers, []);
});

test("drafts cannot bypass submission and stale writes are rejected", () => {
  assert.throws(() => reviewSubmission({ ...submission(), state: "draft" }, { id: "reviewer", role: "admin" }, "approve", "", false), /submitted/);
  assert.throws(() => assertRevision(3, 2), /changed/);
  assert.doesNotThrow(() => assertRevision(3, 3));
});