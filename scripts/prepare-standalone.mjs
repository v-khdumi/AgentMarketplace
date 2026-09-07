import { access, cp, mkdir } from "node:fs/promises";
import path from "node:path";

const output = path.resolve(".next/standalone");
await access(path.join(output, "server.js"));
await mkdir(path.join(output, ".next"), { recursive: true });
await cp("public", path.join(output, "public"), { recursive: true, force: true });
await cp(".next/static", path.join(output, ".next/static"), { recursive: true, force: true });
console.log("Standalone application prepared at .next/standalone (node server.js).");