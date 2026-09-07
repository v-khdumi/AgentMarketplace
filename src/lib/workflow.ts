export type PublicationState = "draft" | "in-review" | "changes-requested" | "published" | "archived";
export type MarketplaceRole = "reader" | "publisher" | "reviewer" | "admin";
export type RiskLevel = "Low" | "Medium" | "High" | "Critical";

export class WorkflowError extends Error {
  readonly status: number;
  constructor(message: string, status = 409) {
    super(message);
    this.name = "WorkflowError";
    this.status = status;
  }
}

export interface Reviewable {
  ownerId: string;
  state: PublicationState;
  risk: RiskLevel;
  reviewers: string[];
  reviewNote: string;
}

export function assertRevision(actual: number, expected: number) {
  if (!Number.isInteger(expected) || actual !== expected) {
    throw new WorkflowError("This record changed. Reload it before saving.");
  }
}

export function reviewSubmission<RecordType extends Reviewable>(
  record: RecordType,
  actor: { id: string; role: MarketplaceRole },
  decision: "approve" | "request-changes",
  note: string,
  secondReviewer: boolean,
): RecordType {
  if (actor.role !== "admin" && actor.role !== "reviewer") {
    throw new WorkflowError("Reviewer permission is required.", 403);
  }
  if (record.ownerId === actor.id) {
    throw new WorkflowError("Authors cannot review their own submissions.", 403);
  }
  if (record.state !== "in-review") {
    throw new WorkflowError("Only submitted revisions can be reviewed.");
  }
  if (decision === "request-changes") {
    if (!note.trim()) throw new WorkflowError("Explain which changes are required.", 422);
    return { ...record, state: "changes-requested", reviewers: [], reviewNote: note.trim() };
  }
  if (record.reviewers.includes(actor.id)) {
    throw new WorkflowError("A different reviewer must provide the next approval.");
  }
  const reviewers = [...record.reviewers, actor.id];
  const required = secondReviewer && ["High", "Critical"].includes(record.risk) ? 2 : 1;
  return { ...record, reviewers, reviewNote: note.trim(), state: reviewers.length >= required ? "published" : "in-review" };
}