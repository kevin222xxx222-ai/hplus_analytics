import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

type Gate = { name: string; command: string; args: string[]; required: boolean };
type Result = Gate & { status: "PASS" | "FAIL" | "BLOCKED"; output: string };

const gates: Gate[] = [
  { name: "lint", command: "npm", args: ["run", "lint"], required: true },
  { name: "typecheck", command: "npx", args: ["tsc", "--noEmit", "--incremental", "false"], required: true },
  { name: "unit-and-integration", command: "npm", args: ["test", "--", "--run"], required: true },
  { name: "production-build", command: "npx", args: ["next", "build", "--webpack"], required: true },
  { name: "playwright", command: "npx", args: ["playwright", "test"], required: true },
];

mkdirSync("qa-artifacts", { recursive: true });
const results: Result[] = [];
for (const gate of gates) {
  try {
    const output = execFileSync(gate.command, gate.args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], env: process.env });
    results.push({ ...gate, status: "PASS", output });
  } catch (error) {
    const output = error && typeof error === "object" && "stdout" in error ? String(error.stdout) : String(error);
    results.push({ ...gate, status: process.env.QA_ALLOW_BLOCKED === "1" ? "BLOCKED" : "FAIL", output });
  }
}

const verdict = results.some((result) => result.status === "FAIL") ? "FAIL" : results.some((result) => result.status === "BLOCKED") ? "BLOCKED" : "PASS";
const report = { generatedAt: new Date().toISOString(), verdict, results };
writeFileSync("qa-artifacts/release-gate.json", JSON.stringify(report, null, 2));
const rows = results.map((result) => `| ${result.name} | ${result.status} |`).join("\n");
const markdown = [
  "# QA Report",
  "",
  `Generated: ${report.generatedAt}`,
  "",
  "## Release verdict",
  "",
  `**${verdict}**`,
  "",
  "| Gate | Status |",
  "| --- | --- |",
  rows,
  "",
  "Detailed machine-readable output: qa-artifacts/release-gate.json.",
  "",
].join("\n");
writeFileSync("docs/QA_REPORT.md", markdown);
if (verdict !== "PASS") process.exitCode = 1;
