import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

// This resolves Vite even if it's hoisted to the repo root
const vitePath = require.resolve("vite/bin/vite.js");

process.argv = ["node", vitePath, "build"];
await import(vitePath);
