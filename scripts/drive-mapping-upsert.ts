import "dotenv/config";
import { DriveFolderMappingPriority, ImportDataType } from "../src/generated/prisma/client";
import { upsertDriveFolderMapping } from "../src/lib/import-automation/google-drive/mapping-service";
import { prisma } from "../src/lib/prisma";

function args() {
  const result: Record<string, string> = {};
  for (const value of process.argv.slice(2)) {
    const match = value.match(/^--([^=]+)=(.*)$/);
    if (match) result[match[1]] = match[2];
  }
  return result;
}

async function main() {
  const input = args();
  const required = ["folder-id", "display-name", "import-source-id", "data-type"];
  const missing = required.filter((key) => !input[key]?.trim());
  if (missing.length) throw new Error(`Missing arguments: ${missing.map((key) => `--${key}=...`).join(", ")}`);
  if (!Object.values(ImportDataType).includes(input["data-type"] as ImportDataType)) throw new Error("Invalid --data-type.");
  const priority = (input.priority || "REQUIRED") as DriveFolderMappingPriority;
  if (!Object.values(DriveFolderMappingPriority).includes(priority)) throw new Error("Invalid --priority.");
  const mapping = await upsertDriveFolderMapping({
    driveFolderId: input["folder-id"], displayName: input["display-name"], importSourceId: input["import-source-id"],
    storeId: input["store-id"] || null, importDataType: input["data-type"] as ImportDataType,
    metricHint: input["metric-hint"] || null, priority, isActive: input.active !== "false", isFuture: priority === DriveFolderMappingPriority.FUTURE,
  });
  console.log(`Drive Folder mapping: OK (${mapping.id})`);
  console.log(`Folder: ${mapping.displayName}`);
  console.log(`ImportSource: ${mapping.importSource.name}`);
  console.log(`DataType: ${mapping.importDataType}`);
  console.log(`Active: ${mapping.isActive} / Future: ${mapping.isFuture}`);
}

main().catch((error: unknown) => { console.error(`Drive Folder mapping: FAILED — ${error instanceof Error ? error.message : "unknown error"}`); process.exitCode = 1; }).finally(() => prisma.$disconnect());
