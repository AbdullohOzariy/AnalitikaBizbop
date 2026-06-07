import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Truck } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { TaminotchilarClient, type SupplierRow } from "./taminotchilar-client";

// Ta'minotchilar ro'yxati kam o'zgaradi (seed/import) — 5 daqiqa keshlaymiz.
const getSuppliers = unstable_cache(
  () => prisma.supplier.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { products: true } } },
  }),
  ["suppliers-with-counts"],
  { tags: ["suppliers", "iyerarxiya"], revalidate: 300 }
);

export default async function TaminotchilarPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/dashboard-v2");

  const suppliers = await getSuppliers();
  const data: SupplierRow[] = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    skuCount: s._count.products,
  }));

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Truck}
        title="Ta'minotchilar"
        description="Ta'minotchi → subkategoriya → SKU (mahsulot)"
      />
      <TaminotchilarClient suppliers={data} />
    </div>
  );
}
