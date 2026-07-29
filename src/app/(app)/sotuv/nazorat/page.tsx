import { redirect } from "next/navigation";
import { ShieldAlert } from "lucide-react";
import { auth } from "@/auth";
import { canSeeAnalytics, isSystemAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { PageHeader } from "@/components/common/page";
import { getStockdayLimits } from "@/lib/zakaz/stockday-limit";
import { NazoratClient } from "./nazorat-client";

export const metadata = { title: "Zakaz nazorati" };
export const dynamic = "force-dynamic";

export default async function ZakazNazoratPage() {
  const session = await auth();
  if (!session?.user || !canSeeAnalytics(session.user.roles)) redirect("/dashboard");
  const canEdit = isSystemAdmin(session.user.roles);

  const [limits, kategoriyalar] = await Promise.all([
    getStockdayLimits(),
    prisma.category.findMany({
      select: {
        id: true,
        name: true,
        parentId: true,
        parent: { select: { name: true } },
        group: { select: { name: true } },
        _count: { select: { products: true } },
      },
      orderBy: [{ parentId: "asc" }, { sortOrder: "asc" }],
    }),
  ]);

  const limitNotes = await prisma.stockdayLimit.findMany({
    select: { categoryId: true, note: true },
  });
  const noteMap = new Map(limitNotes.map((n) => [n.categoryId, n.note]));

  const rows = kategoriyalar.map((c) => ({
    id: c.id,
    nom: c.name,
    ota: c.parent?.name ?? null,
    bolim: c.group?.name ?? null,
    skuSoni: c._count.products,
    maxDays: limits.byCategory.get(c.id) ?? null,
    note: noteMap.get(c.id) ?? null,
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Zakaz nazorati"
        description="Maksimal zakaz chegarasi — kelgan tovar necha kunlik zaxira bo'lishiga ruxsat beriladi"
        icon={ShieldAlert}
      />
      <NazoratClient
        global={limits.global}
        rows={rows}
        canEdit={canEdit}
      />
    </div>
  );
}
