import { Suspense } from "react";
import { TAG_IYERARXIYA, TAG_SUPPLIERS } from "@/lib/cache-tags";
import { redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import { auth } from "@/auth";
import { canSeeSuppliers, canEditSuppliers } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Truck } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { Skeleton } from "@/components/ui/skeleton";
import { isoDay } from "@/lib/date";
import { computeSupplierAbc, supplierAbcMap, abcDefaultStart } from "@/lib/supplier-abc";
import { TaminotchilarClient, type SupplierRow } from "./taminotchilar-client";

// Yetkazib beruvchilar ro'yxati kam o'zgaradi (seed/import) — 5 daqiqa keshlaymiz.
const getSuppliers = unstable_cache(
  () => prisma.supplier.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { products: true } } },
  }),
  ["suppliers-with-counts"],
  { tags: [TAG_SUPPLIERS, TAG_IYERARXIYA], revalidate: 300 }
);

export default async function TaminotchilarPage() {
  const session = await auth();
  if (!session?.user || !canSeeSuppliers(session.user.roles)) redirect("/dashboard-v2");
  const canEdit = canEditSuppliers(session.user.roles);

  return (
    <div className="space-y-4">
      <PageHeader
        icon={Truck}
        title="Yetkazib beruvchilar"
        description="Yetkazib beruvchi → subkategoriya → SKU (mahsulot)"
      />
      {/* Ro'yxat + ABC×XYZ tahlili birga hisoblanadi (og'ir qism — sovuq yuklashda
          ~3s bo'lishi mumkin), shuning uchun Suspense'da — sarlavha darhol ko'rinadi. */}
      <Suspense fallback={<TaminotchilarSkeleton />}>
        <TaminotchilarData canEdit={canEdit} />
      </Suspense>
    </div>
  );
}

function TaminotchilarSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-[88px] w-full rounded-2xl" />)}
      </div>
      <Skeleton className="h-9 w-full rounded-xl" />
      <div className="space-y-1.5">
        {[...Array(8)].map((_, i) => <Skeleton key={i} className="h-11 w-full rounded-xl" />)}
      </div>
    </div>
  );
}

async function TaminotchilarData({ canEdit }: { canEdit: boolean }) {
  const end = new Date();
  const startStr = isoDay(abcDefaultStart(end));
  const endStr = isoDay(end);

  const [suppliers, abcResult] = await Promise.all([
    getSuppliers(),
    computeSupplierAbc(startStr, endStr),
  ]);
  const abcById = supplierAbcMap(abcResult);

  const data: SupplierRow[] = suppliers.map((s) => {
    const abc = abcById.get(s.id);
    return {
      id: s.id,
      name: s.name,
      skuCount: s._count.products,
      abc: abc?.abc ?? null,
      xyz: abc?.xyz ?? null,
      share: abc?.share ?? null,
    };
  });

  return <TaminotchilarClient suppliers={data} canEdit={canEdit} />;
}
