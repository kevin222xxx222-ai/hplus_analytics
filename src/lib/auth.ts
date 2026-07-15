import { createHash, randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";

export const SESSION_COOKIE = "hplus_analytics_session";
const DEFAULT_SESSION_DURATION_DAYS = 7;

function getSessionDurationDays() {
  const configured = process.env.SESSION_DURATION_DAYS;
  if (!configured) return DEFAULT_SESSION_DURATION_DAYS;

  const days = Number(configured);
  if (!Number.isInteger(days) || days < 1 || days > 30) {
    throw new Error("SESSION_DURATION_DAYS must be an integer between 1 and 30");
  }
  return days;
}

export type CurrentUser = {
  id: string;
  loginId: string;
  email: string | null;
  displayName: string;
  role: "ADMIN" | "VIEWER";
};

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + getSessionDurationDays() * 24 * 60 * 60 * 1000);
  const requestHeaders = await headers();

  await prisma.session.create({
    data: {
      tokenHash: tokenHash(token),
      userId,
      expiresAt,
      ipAddress: requestHeaders.get("x-forwarded-for")?.split(",")[0]?.trim().slice(0, 64),
      userAgent: requestHeaders.get("user-agent")?.slice(0, 512),
    },
  });

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
    priority: "high",
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    await prisma.session.deleteMany({ where: { tokenHash: tokenHash(token) } });
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const session = await prisma.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    select: {
      expiresAt: true,
      user: {
        select: { id: true, loginId: true, email: true, displayName: true, role: true, isActive: true },
      },
    },
  });

  if (!session || session.expiresAt <= new Date() || !session.user.isActive) return null;
  return {
    id: session.user.id,
    loginId: session.user.loginId,
    email: session.user.email,
    displayName: session.user.displayName,
    role: session.user.role,
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") redirect("/?error=forbidden");
  return user;
}
