import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { provisionGoogleDriveSystemActor, GOOGLE_DRIVE_SYSTEM_ACTOR_LOGIN_ID } from "../src/lib/import-automation/system-actor";

async function main() {
  const result = await provisionGoogleDriveSystemActor();
  console.log(`System actor: ${result.created ? "CREATED" : "UNCHANGED"}`);
  console.log(`Login ID: ${GOOGLE_DRIVE_SYSTEM_ACTOR_LOGIN_ID}`);
  console.log("Login enabled: false");
}

main().catch((error: unknown) => {
  console.error(`System actor provisioning failed: ${error instanceof Error ? error.message : "unknown error"}`);
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
