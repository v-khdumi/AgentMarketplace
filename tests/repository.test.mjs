import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { MarketplaceRepository } from "../src/lib/repository.ts";

test("server data survives reopening and concurrent mutations do not lose writes", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "marketplace-test-"));
  try {
    const repository = new MarketplaceRepository({ directory });
    await Promise.all(Array.from({ length: 20 }, (_, index) => repository.update("tenant-a", state => {
      state.favorites[`user-${index}`] = [`agent-${index}`];
    })));
    const reopened = new MarketplaceRepository({ directory });
    const state = await reopened.read("tenant-a");
    assert.equal(state.revision, 20);
    assert.equal(Object.keys(state.favorites).length, 20);
    assert.deepEqual((await reopened.read("tenant-b")).favorites, {});
    await assert.rejects(repository.read("../tenant-a"), /identifier/);
    await repository.putFile("tenant-a", "file-1", Buffer.from("original bytes"), "application/octet-stream");
    assert.equal((await reopened.getFile("tenant-a", "file-1")).toString(), "original bytes");
    await assert.rejects(repository.getFile("tenant-b", "file-1"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test("failed mutations and malformed storage never overwrite prior data", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "marketplace-test-"));
  try {
    const repository = new MarketplaceRepository({ directory });
    await repository.update("tenant", state => { state.settings.name = "Original"; });
    await assert.rejects(repository.update("tenant", state => { state.settings.name = "Wrong"; throw new Error("stop"); }));
    assert.equal((await repository.read("tenant")).settings.name, "Original");
    await writeFile(path.join(directory, "tenant.json"), "not-json");
    await assert.rejects(repository.read("tenant"));
  } finally { await rm(directory, { recursive: true, force: true }); }
});