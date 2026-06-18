import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminTier, isSystemAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { unstable_cache } from "next/cache";
import { Tag } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { IyerarxiyaClient, type HGroup } from "./iyerarxiya-client";
import { SkuList } from "./sku-list";
import { SkuAdd } from "./sku-add";

const getHierarchy = unstable_cache(
  () =>
    prisma.categoryGroup.findMany({
      orderBy: { sortOrder: "asc" },
      include: {
        categories: {
          where: { parentId: null },
          orderBy: { sortOrder: "asc" },
          include: {
            children: {
              orderBy: { sortOrder: "asc" },
              include: { _count: { select: { sales: true, products: true } } },
            },
            _count: { select: { sales: true } },
          },
        },
      },
    }),
  ["iyerarxiya-list"],
  { tags: ["iyerarxiya"], revalidate: 300 }
);

export default async function IyerarxiyaPage() {
  const session = await auth();
  if (!session?.user || !isAdminTier(session.user.role)) redirect("/dashboard-v2");
  const isAdmin = isSystemAdmin(session.user.role);
  const [groups, suppliers] = await Promise.all([
    getHierarchy(),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const data: HGroup[] = groups.map((g) => ({
    id: g.id,
    name: g.name,
    code: g.code,
    categories: g.categories.map((c) => ({
      id: c.id,
      name: c.name,
      code: c.code,
      salesCount: c._count.sales,
      children: c.children.map((s) => ({
        id: s.id,
        name: s.name,
        code: s.code,
        salesCount: s._count.sales,
        skuCount: s._count.products,
      })),
    })),
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Tag}
        title="Iyerarxiya"
        description="Bo'lim → kategoriya → subkategoriya → SKU · har biri 1C KOD bilan"
      />
      <Tabs defaultValue="tree" className="w-full">
        <TabsList>
          <TabsTrigger value="tree">Daraxt</TabsTrigger>
          <TabsTrigger value="list">Ro&apos;yxat (SKU)</TabsTrigger>
          {isAdmin && <TabsTrigger value="add">SKU qo&apos;shish</TabsTrigger>}
        </TabsList>
        <TabsContent value="tree" className="pt-3">
          <IyerarxiyaClient groups={data} isAdmin={isAdmin} />
        </TabsContent>
        <TabsContent value="list" className="pt-3">
          <SkuList groups={data} suppliers={suppliers} />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="add" className="pt-3">
            <SkuAdd groups={data} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
