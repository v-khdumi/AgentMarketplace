import test from "node:test";
import assert from "node:assert/strict";
import { zipSync, strToU8 } from "fflate";
import sharp from "sharp";
import { boundedBody, inspectUpload, validateSolution } from "../src/lib/uploads.ts";

function solution(extra = {}) {
  return Buffer.from(zipSync({ "solution.xml": strToU8('<ImportExportXml><SolutionManifest><UniqueName>TestAgent</UniqueName><Version>1.2.3.4</Version><Managed>1</Managed></SolutionManifest></ImportExportXml>'), "customizations.xml": strToU8('<ImportExportXml/>'), "[Content_Types].xml": strToU8('<Types/>'), ...extra }));
}

test("real solution metadata is extracted without modifying the original ZIP", async () => {
  const bytes = solution();
  const result = await inspectUpload(bytes, "TestAgent.zip", "solution", "owner");
  assert.equal(result.solution.uniqueName, "TestAgent");
  assert.equal(result.solution.version, "1.2.3.4");
  assert.equal(result.solution.managed, true);
  assert.equal(result.bytes, bytes.length);
  assert.equal(result.sha256.length, 64);
});

test("JSON manifests, app packages and unsafe archive paths are rejected", async () => {
  await assert.rejects(validateSolution(Buffer.from('{"name":"not a solution"}')));
  await assert.rejects(validateSolution(Buffer.from(zipSync({ "manifest.json": strToU8('{}') }))), /not a Power Platform solution/);
  await assert.rejects(validateSolution(solution({ "../escape.xml": strToU8('bad') })));
});

test("images are validated by content, not by filename or reported MIME type", async () => {
  const png = await sharp({ create: { width: 192, height: 192, channels: 4, background: '#0067b8' } }).png().toBuffer();
  const image = await inspectUpload(png, "icon.png", "icon", "owner");
  assert.equal(image.width, 192);
  assert.equal(image.mime, "image/png");
  await assert.rejects(inspectUpload(Buffer.from('<svg onload="alert(1)"/>'), "logo.png", "logo", "owner"), /valid PNG/);
});

test("streamed request limits apply even without Content-Length", async () => {
  await assert.rejects(boundedBody(new Request('http://localhost/upload', { method: 'POST', body: 'too much content' }), 4), /too large/);
});