import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Truck } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { TaminotchilarClient, type SupplierRow } from "./taminotchilar-client";

export const dynamic = "force-dynamic";

export default async function TaminotchilarPage() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") redirect("/dashboard-v2");

  const suppliers = await prisma.supplier.findMany({
    orderBy: { name: "asc" },
    select: { id: true, name: true, _count: { select: { products: true } } },
  });
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
