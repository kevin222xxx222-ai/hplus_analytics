import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
  } catch {
    return Response.json({ status: "error", database: "unavailable", timestamp: new Date().toISOString() }, { status: 503 });
  }
}
