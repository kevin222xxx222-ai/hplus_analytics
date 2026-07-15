"use server";

import { compare } from "bcryptjs";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSession, destroySession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type LoginState = { error?: string };

const loginSchema = z.object({
  identifier: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function loginAction(_state: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    identifier: formData.get("identifier"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "ログインIDまたはパスワードを入力してください。" };

  const identifier = parsed.data.identifier.toLowerCase();
  const user = await prisma.user.findFirst({
    where: {
      isActive: true,
      OR: [{ loginId: parsed.data.identifier }, { email: { equals: identifier, mode: "insensitive" } }],
    },
  });

  const valid = user ? await compare(parsed.data.password, user.passwordHash) : false;
  if (!user || !valid) return { error: "ログインIDまたはパスワードが正しくありません。" };

  await createSession(user.id);
  redirect("/");
}

export async function logoutAction() {
  await destroySession();
  redirect("/login");
}
