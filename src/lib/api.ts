import { getCurrentUser } from "@/lib/auth";

export class ApiError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export async function requireAdminApi() {
  const user = await getCurrentUser();
  if (!user) throw new ApiError("ログインが必要です。", 401);
  if (user.role !== "ADMIN") throw new ApiError("ADMIN権限が必要です。", 403);
  return user;
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) return Response.json({ error: error.message }, { status: error.status });
  const message = error instanceof Error ? error.message : "処理に失敗しました。";
  return Response.json({ error: message }, { status: 400 });
}
