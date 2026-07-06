import { TAG_IYERARXIYA } from "@/lib/cache-tags";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { auth } from "@/auth";
import { isAdminTier } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { PackageSearch } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { MoslanmaganClient, type UnmatchedProduct, type SubOption, type NameMismatch } from "./moslanmagan-client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;

// 118 subkategoriya (assign Select uchun) kam o'zgaradi — keshlaymiz; qolgani dinamik.
const getSubcats = unstable_cache(
  () => prisma.category.findMany({
    where: { parentId: { not: null } },
    select: { id: true, name: true, parent: { select: { name: true } }, group: { select: { name: true } } },
    orderBy: { name: "asc" },
  }),
  ["moslanmagan-subcats"],
  { tags: [TAG_IYERARXIYA], revalidate: 300 }
);

export default async function MoslanmaganPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user || !isAdminTier(session.user.roles)) redirect("/dashboard-v2");

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);

  const [total, rows, subRows, nameRows, nameTotal] = await Promise.all([
    prisma.product.count({ where: { categoryId: null } }),
    prisma.product.findMany({
      where: { categoryId: null },
      select: { id: true, code: true, name: true, supplier: { select: { name: true } } },
      orderBy: { code: "asc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    getSubcats(),
    prisma.productNameMismatch.findMany({
      select: { fileName: true, product: { select: { id: true, code: true, name: true } } },
      orderBy: { createdAt: "desc" },
      take: 500,
    }),
    prisma.productNameMismatch.count(),
  ]);

  const products: UnmatchedProduct[] = rows.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    supplier: p.supplier?.name ?? null,
  }));
  const subs: SubOption[] = subRows.map((s) => ({
    id: s.id,
    name: s.name,
    cat: s.parent?.name ?? "—",
    group: s.group?.name ?? null,
  }));
  const mismatches: NameMismatch[] = nameRows.map((m) => ({
    productId: m.product.id,
    code: m.product.code,
    masterName: m.product.name,
    fileName: m.fileName,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        icon={PackageSearch}
        title="Moslanmagan"
        description="Kategoriyasiz SKU va nom farqlarini ko'rib chiqib tuzating"
      />
      <MoslanmaganClient
        products={products}
        subs={subs}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
        mismatches={mismatches}
        nameTotal={nameTotal}
      />
    </div>
  );
}
