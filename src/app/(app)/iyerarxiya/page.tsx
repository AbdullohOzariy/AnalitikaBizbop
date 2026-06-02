import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { Tag } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { IyerarxiyaClient, type HGroup } from "./iyerarxiya-client";

const getHierarchy = unstable_cache(
  () =>
    prisma.categoryGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          where: { parentId: null },
          orderBy: { sortOrder: "asc" },
          include: {
            aliases: { orderBy: { alias: "asc" } },
            children: {
              orderBy: { sortOrder: "asc" },
              include: { _count: { select: { sales: true } } },
            },
            _count: { select: { sales: true, plans: true, dailyPlans: true } },
          },
        },
      },
    }),
  ["iyerarxiya-list"],
  { tags: ["iyerarxiya"], revalidate: 300 }
);

export default async function IyerarxiyaPage() {
  const session = await auth();
  const isAdmin = session?.user.role === "ADMIN";
  const groups = await getHierarchy();

  const data: HGroup[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    code: g.code,
    categories: g.categories.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      salesCount: c._count.sales,
      aliases: c.aliases.map((a) => ({ id: a.id, alias: a.alias })),
      children: c.children.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        salesCount: s._count.sales,
      })),
    })),
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Tag}
        title="Iyerarxiya"
        description="Bo'lim → kategoriya → subkategoriya · har biri 1C KOD bilan"
      />
      <IyerarxiyaClient groups={data} isAdmin={isAdmin} />
    </div>
  );
}
