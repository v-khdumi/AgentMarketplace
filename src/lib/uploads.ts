import { createHash, randomUUID } from "node:crypto";
import { fromBuffer, type Entry, type ZipFile } from "yauzl";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import sharp from "sharp";
import type { StoredFile } from "./contracts";
import { WorkflowError } from "./workflow";

export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function boundedBody(request: Request, maximum = 8 * 1024 * 1024) {
  if (Number(request.headers.get("content-length")) > maximum) throw new WorkflowError("The uploaded content is too large.", 413);
  if (!request.body) throw new WorkflowError("Request body is required.", 400);
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    bytes += value.byteLength;
    if (bytes > maximum) { await reader.cancel(); throw new WorkflowError("The uploaded content is too large.", 413); }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

export function validateSolution(content: Buffer): Promise<NonNullable<StoredFile["solution"]>> {
  if (content.length > MAX_UPLOAD_BYTES) return Promise.reject(new WorkflowError("Solution packages must be smaller than 50 MB.", 413));
  return new Promise((resolve, reject) => {
    let archive: ZipFile | undefined;
    let finished = false;
    const fail = (message: string) => { if (!finished) { finished = true; archive?.close(); reject(new WorkflowError(message, 422)); } };
    fromBuffer(content, { lazyEntries: true, validateEntrySizes: true, strictFileNames: true, autoClose: false }, (error, zip) => {
      if (error || !zip) { fail("Upload a valid Power Platform solution ZIP."); return; }
      archive = zip;
      if (zip.entryCount > 10000) { fail("The ZIP contains too many entries."); return; }
      const names = new Set<string>();
      let total = 0;
      let manifest = "";
      zip.on("error", () => fail("The ZIP is damaged or unsupported."));
      zip.on("entry", (entry: Entry) => {
        if (finished) return;
        const name = entry.fileName.toLowerCase();
        total += entry.uncompressedSize;
        if (name.startsWith("/") || name.split("/").includes("..") || name.includes(":") || names.has(name) || (entry.generalPurposeBitFlag & 1) !== 0) { fail("Unsafe, duplicate or encrypted ZIP entries are not accepted."); return; }
        if (total > 256 * 1024 * 1024 || entry.uncompressedSize > 128 * 1024 * 1024) { fail("The uncompressed solution exceeds the safety limit."); return; }
        names.add(name);
        if (name !== "solution.xml") { zip.readEntry(); return; }
        if (entry.uncompressedSize > 2 * 1024 * 1024) { fail("The solution manifest exceeds the safety limit."); return; }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) { fail("The solution manifest cannot be read."); return; }
          const chunks: Buffer[] = []; let bytes = 0;
          stream.on("data", (chunk: Buffer) => { bytes += chunk.length; if (bytes > 2 * 1024 * 1024) { stream.destroy(); fail("The solution manifest exceeds the safety limit."); } else chunks.push(chunk); });
          stream.on("error", () => fail("The solution manifest is damaged."));
          stream.on("end", () => { if (!finished) { manifest = Buffer.concat(chunks).toString("utf8"); zip.readEntry(); } });
        });
      });
      zip.on("end", () => {
        if (finished) return;
        try {
          if (!names.has("solution.xml") || !names.has("customizations.xml") || !names.has("[content_types].xml")) throw new Error("This ZIP is not a Power Platform solution. A Teams or Agent Builder app package is different.");
          if (/<!DOCTYPE|<!ENTITY/i.test(manifest) || XMLValidator.validate(manifest) !== true) throw new Error("The solution manifest contains invalid XML.");
          const parsed = new XMLParser({ ignoreAttributes: false, parseTagValue: false, processEntities: false, removeNSPrefix: true }).parse(manifest);
          const solution = parsed?.ImportExportXml?.SolutionManifest;
          const uniqueName = solution?.UniqueName;
          const version = solution?.Version;
          const managed = solution?.Managed;
          if (typeof uniqueName !== "string" || !/^[A-Za-z][A-Za-z0-9_]{0,99}$/.test(uniqueName) || typeof version !== "string" || !/^\d+\.\d+\.\d+\.\d+$/.test(version) || version.split(".").some((part) => Number(part) > 65535) || !["0", "1"].includes(managed)) throw new Error("The solution name, version or managed flag is invalid.");
          finished = true; zip.close(); resolve({ uniqueName, version, managed: managed === "1", entries: names.size });
        } catch (validationError) { fail(validationError instanceof Error ? validationError.message : "Invalid solution manifest."); }
      });
      zip.readEntry();
    });
  });
}

export async function inspectUpload(content: Buffer, name: string, kind: StoredFile["kind"], ownerId: string): Promise<StoredFile> {
  const base: StoredFile = { id: randomUUID(), ownerId, kind, name: name.replace(/[\u0000-\u001f\\/"<>|:]/g, "_").slice(0, 180) || "upload", mime: "application/zip", bytes: content.length, sha256: createHash("sha256").update(content).digest("hex"), createdAt: new Date().toISOString() };
  if (kind === "solution") {
    if (!name.toLowerCase().endsWith(".zip")) throw new WorkflowError("Select a solution ZIP file.", 422);
    return { ...base, solution: await validateSolution(content) };
  }
  if (content.length > (kind === "icon" ? 1 : 2) * 1024 * 1024) throw new WorkflowError("Icons may be 1 MB; branding images may be 2 MB.", 413);
  try {
    const image = sharp(content, { limitInputPixels: 4_194_304, failOn: "warning" });
    const metadata = await image.metadata();
    if (!metadata.width || !metadata.height || !["png", "jpeg", "webp"].includes(metadata.format ?? "") || (metadata.pages ?? 1) > 1 || (kind === "icon" && metadata.format !== "png")) throw new Error("Unsupported image");
    await image.stats();
    return { ...base, mime: `image/${metadata.format}`, width: metadata.width, height: metadata.height };
  } catch { throw new WorkflowError("Use a valid PNG icon, or a PNG, JPEG or WEBP logo. Animated images and SVG are not supported.", 422); }
}