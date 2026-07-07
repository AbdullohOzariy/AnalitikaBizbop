/**
 * BizbopSotuv Mini App: joriy foydalanuvchi profili — ism, rollar, inventar
 * huquqi va filial qamrovi (UserBranch bo'sh = barcha filiallar).
 */
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canDoInventory } from "@/lib/roles";
import { authMiniapp } from "../auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const auth = await authMiniapp(req, "me");
  if ("fail" in auth) return auth.fail;
  const { user } = auth;

  const branches = await prisma.branch.findMany({
    where: user.branchIds ? { id: { in: user.branchIds } } : undefined,
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true },
  });

  return NextResponse.json({
    ok: true,
    user: {
      name: user.name,
      roles: user.roles,
      canInventory: canDoInventory(user.roles),
      branches,
    },
  });
}
