import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
for (const path of ["services", "contracts", "docs/agent-db", "scripts/deploy-server.ps1", ".github/workflows/deploy-agent-gateway.yml"]) {
  if (existsSync(resolve(root, path))) throw new Error(`Server-owned path in frontend repository: ${path}`);
}
const form = readFileSync(resolve(root, "src/pages/personal/components/ApiConfigCard.tsx"), "utf8");
if (/agentAiConfigService|\/gateway/.test(form)) throw new Error("Personal settings must use the legacy service independently");
const directory = resolve(root, "dist/assets");
if (!existsSync(directory)) throw new Error("Build the default-disabled frontend first");
if (readdirSync(directory).some((name) => /AgentSessionPanel|AgentApiConfigCard/.test(name))) throw new Error("Disabled build emitted an Agent UI chunk");
console.log("Frontend boundary OK: no server tree, no Agent UI chunks in disabled build, personal config independent");
