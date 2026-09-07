import { rm } from "node:fs/promises";
import path from "node:path";

export default async function teardown() {
  const directory = process.env.MARKETPLACE_E2E_DATA_DIR;
  if (directory && path.basename(directory).startsWith("marketplace-e2e-")) await rm(directory, { recursive: true, force: true });
}