import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import { UserRole } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";

export const GOOGLE_DRIVE_SYSTEM_ACTOR_LOGIN_ID = "automation-google-drive";
export const GOOGLE_DRIVE_SYSTEM_ACTOR_DISPLAY_NAME = "Google Drive Automation";

type ActorDb = Pick<typeof prisma, "user">;

export async function getGoogleDriveSystemActor(db: ActorDb = prisma) {
  const actor = await db.user.findUnique({ where: { loginId: GOOGLE_DRIVE_SYSTEM_ACTOR_LOGIN_ID } });
  if (!actor) throw new Error("Google Drive system actor is not provisioned. Run npm run automation:provision-system-user.");
  if (actor.isActive || actor.role !== UserRole.VIEWER) throw new Error("Google Drive system actor must be an inactive VIEWER account.");
  return actor;
}

export async function provisionGoogleDriveSystemActor(db: ActorDb = prisma) {
  const existing = await db.user.findUnique({ where: { loginId: GOOGLE_DRIVE_SYSTEM_ACTOR_LOGIN_ID } });
  if (existing) {
    if (existing.isActive || existing.role !== UserRole.VIEWER) throw new Error("Existing Google Drive system actor has unsafe permissions; no changes were made.");
    return { actor: existing, created: false };
  }
  const passwordHash = await bcrypt.hash(randomBytes(32).toString("base64url"), 12);
  const actor = await db.user.create({
    data: {
      loginId: GOOGLE_DRIVE_SYSTEM_ACTOR_LOGIN_ID,
      displayName: GOOGLE_DRIVE_SYSTEM_ACTOR_DISPLAY_NAME,
      passwordHash,
      role: UserRole.VIEWER,
      isActive: false,
    },
  });
  return { actor, created: true };
}
