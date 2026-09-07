import { mkdir, readFile, rename, rm, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient, type ContainerClient } from "@azure/storage-blob";
import { emptyStore, type StoreDocument } from "./contracts";
import { WorkflowError } from "./workflow";
export { isPublicDemoMode } from "./runtime-mode";

const shared = globalThis as typeof globalThis & { marketplaceLocks?: Map<string, Promise<void>> };
const locks = shared.marketplaceLocks ??= new Map();
const safeKey = (value: string) => {
  if (!/^[a-zA-Z0-9-]{1,100}$/.test(value)) throw new WorkflowError("Invalid resource identifier.", 400);
  return value;
};
const statusOf = (error: unknown) => (error as { statusCode?: number }).statusCode;

export class MarketplaceRepository {
  private readonly directory: string;
  private readonly container?: ContainerClient;
  private initialization?: Promise<unknown>;

  constructor(options: { directory?: string; account?: string; container?: string }) {
    this.directory = path.resolve(options.directory ?? ".marketplace-data");
    if (options.account) {
      if (!/^[a-z0-9]{3,24}$/.test(options.account)) throw new Error("Invalid Azure Storage account name.");
      this.container = new BlobServiceClient(`https://${options.account}.blob.core.windows.net`, new DefaultAzureCredential()).getContainerClient(options.container ?? "marketplace");
    }
  }

  get kind() { return this.container ? "azure-blob" : "local"; }

  private async initialize() {
    this.initialization ??= this.container ? this.container.createIfNotExists() : mkdir(this.directory, { recursive: true });
    try { await this.initialization; } catch (error) { this.initialization = undefined; throw error; }
  }

  private async load(tenantId: string): Promise<{ state: StoreDocument; etag?: string }> {
    safeKey(tenantId);
    await this.initialize();
    let content: string;
    let etag: string | undefined;
    try {
      if (this.container) {
        const response = await this.container.getBlobClient(`${tenantId}/state.json`).download();
        if ((response.contentLength ?? 0) > 64 * 1024 * 1024) throw new Error("Marketplace metadata exceeded the configured size limit.");
        const chunks: Buffer[] = [];
        let bytes = 0;
        for await (const chunk of response.readableStreamBody ?? []) {
          const buffer = Buffer.from(chunk); bytes += buffer.length;
          if (bytes > 64 * 1024 * 1024) throw new Error("Marketplace metadata exceeded the configured size limit.");
          chunks.push(buffer);
        }
        content = Buffer.concat(chunks).toString("utf8"); etag = response.etag;
      } else content = await readFile(path.join(this.directory, `${tenantId}.json`), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || statusOf(error) === 404) return { state: emptyStore() };
      throw error;
    }
    const state = JSON.parse(content) as StoreDocument;
    if (state.schemaVersion !== 1 || !Array.isArray(state.agents) || !Array.isArray(state.audit) || !state.settings) throw new Error("Unsupported or damaged marketplace data. Restore a backup; data was not reset.");
    return { state, etag };
  }

  async read(tenantId: string) { return (await this.load(tenantId)).state; }

  async update<Result>(tenantId: string, mutate: (state: StoreDocument) => Result): Promise<Result> {
    safeKey(tenantId);
    if (this.container) {
      for (let attempt = 0; attempt < 8; attempt++) {
        const { state, etag } = await this.load(tenantId);
        const result = mutate(state); state.revision++;
        const content = Buffer.from(JSON.stringify(state));
        if (content.length > 64 * 1024 * 1024) throw new WorkflowError("Metadata capacity reached. Archive older records before retrying.", 507);
        try {
          await this.container.getBlockBlobClient(`${tenantId}/state.json`).uploadData(content, {
            conditions: etag ? { ifMatch: etag } : { ifNoneMatch: "*" },
            blobHTTPHeaders: { blobContentType: "application/json" },
          });
          return result;
        } catch (error) {
          if (![409, 412].includes(statusOf(error) ?? 0)) throw error;
          await delay(15 * 2 ** attempt);
        }
      }
      throw new WorkflowError("Another user is updating the marketplace. Retry your change.");
    }
    const lockKey = `${this.directory}/${tenantId}`;
    const previous = locks.get(lockKey) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    locks.set(lockKey, current);
    await previous;
    const temporary = path.join(this.directory, `${tenantId}.${randomUUID()}.tmp`);
    try {
      const { state } = await this.load(tenantId);
      const result = mutate(state); state.revision++;
      await writeFile(temporary, JSON.stringify(state), { flag: "wx", mode: 0o600 });
      await rename(temporary, path.join(this.directory, `${tenantId}.json`));
      return result;
    } finally {
      await rm(temporary, { force: true });
      release();
      if (locks.get(lockKey) === current) locks.delete(lockKey);
    }
  }

  async putFile(tenantId: string, id: string, content: Buffer, mime: string) {
    safeKey(tenantId); safeKey(id); await this.initialize();
    if (this.container) {
      await this.container.getBlockBlobClient(`${tenantId}/files/${id}`).uploadData(content, { conditions: { ifNoneMatch: "*" }, blobHTTPHeaders: { blobContentType: mime } });
    } else {
      const folder = path.join(this.directory, tenantId, "files");
      await mkdir(folder, { recursive: true });
      await writeFile(path.join(folder, id), content, { flag: "wx", mode: 0o600 });
    }
  }

  async getFile(tenantId: string, id: string): Promise<Buffer> {
    safeKey(tenantId); safeKey(id); await this.initialize();
    return this.container ? this.container.getBlobClient(`${tenantId}/files/${id}`).downloadToBuffer() : readFile(path.join(this.directory, tenantId, "files", id));
  }

  async scanStatus(tenantId: string, id: string): Promise<"clean" | "blocked" | "pending" | "not-configured"> {
    safeKey(tenantId); safeKey(id);
    if (!this.container) return "not-configured";
    const result = (await this.container.getBlobClient(`${tenantId}/files/${id}`).getTags()).tags["Malware scanning scan result"];
    if (result === "No threats found") return "clean";
    if (result?.toLowerCase().includes("malicious")) return "blocked";
    return "pending";
  }

  async check(write = false) {
    await this.initialize();
    if (this.container) await this.container.getProperties(); else await stat(this.directory);
    if (write) {
      const id = randomUUID();
      await this.putFile("health-check", id, Buffer.from("marketplace-storage-probe"), "text/plain");
      if (this.container) await this.container.getBlobClient(`health-check/files/${id}`).delete();
      else await rm(path.join(this.directory, "health-check", "files", id));
    }
    return this.kind;
  }
}

export function isLocalMode() { return process.env.NODE_ENV !== "production" && process.env.DEMO_MODE === "true"; }
export function getRepository() {
  const account = process.env.AZURE_STORAGE_ACCOUNT;
  if (!account && !isLocalMode()) throw new WorkflowError("Configure Azure Storage before using the marketplace.", 503);
  return new MarketplaceRepository({ account, container: process.env.AZURE_STORAGE_CONTAINER, directory: process.env.MARKETPLACE_DATA_DIR });
}