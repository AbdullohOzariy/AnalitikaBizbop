import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { canManageWarehouse } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Send, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { TaqsimotDetail, type DetailData } from "./taqsimot-detail";

export const dynamic = "force-dynamic";

export default async function TaqsimotDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !canManageWarehouse(session.user.role)) redirect("/logistika");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const d = await prisma.distribution.findUnique({
    where: { id },
    select: {
      id: true, status: true, targetDays: true, note: true, createdAt: true, confirmedAt: true,
      branch: { select: { name: true } },
      createdBy: { select: { name: true } },
      items: {
        select: {
          productId: true, qty: true,
          product: { select: { code: true, name: true, category: { select: { name: true } }, warehouseStock: { select: { qty: true } } } },
        },
        orderBy: { product: { name: "asc" } },
      },
    },
  });
  if (!d) notFound();

  const data: DetailData = {
    id: d.id, status: d.status, targetDays: d.targetDays, note: d.note ?? "",
    branch: d.branch.name, createdBy: d.createdBy.name,
    createdAt: d.createdAt.toISOString(), confirmedAt: d.confirmedAt?.toISOString() ?? null,
    items: d.items.map((i) => ({
      productId: i.productId, code: i.product.code, name: i.product.name,
      sub: i.product.category?.name ?? null, qty: Number(i.qty),
      warehouseQty: i.product.warehouseStock ? Number(i.product.warehouseStock.qty) : 0,
    })),
  };

  return (
    <div className="space-y-5">
      <PageHeader icon={Send} title={`Taqsimot #${d.id}`} description={`${d.branch.name} · ${d.targetDays} kunlik qoplash`}>
        <Link href="/logistika?tab=taqsimot"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary">
          <ArrowLeft className="h-4 w-4" /> Ro&apos;yxatga
        </Link>
      </PageHeader>
      <TaqsimotDetail data={data} />
    </div>
  );
}
