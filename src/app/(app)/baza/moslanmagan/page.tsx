import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { PackageSearch } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { MoslanmaganClient, type UnmatchedProduct, type SubOption } from "./moslanmagan-client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 200;

export default async function MoslanmaganPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/dashboard-v2");

  const sp = await searchParams;
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);

  const [total, rows, subRows] = await Promise.all([
    prisma.product.count({ where: { categoryId: null } }),
    prisma.product.findMany({
      where: { categoryId: null },
      select: { id: true, code: true, name: true, supplier: { select: { name: true } } },
      orderBy: { code: "asc" },
      take: PAGE_SIZE,
      skip: (page - 1) * PAGE_SIZE,
    }),
    prisma.category.findMany({
      where: { parentId: { not: null } },
      select: {
        id: true,
        name: true,
        parent: { select: { name: true } },
        group: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
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

  return (
    <div className="space-y-4">
      <PageHeader
        icon={PackageSearch}
        title="Moslanmagan"
        description="Iyerarxiyaga joylashtirilmagan (kategoriyasiz) SKU — subkategoriya tayinlang"
      />
      <MoslanmaganClient
        products={products}
        subs={subs}
        total={total}
        page={page}
        pageSize={PAGE_SIZE}
      />
    </div>
  );
}
