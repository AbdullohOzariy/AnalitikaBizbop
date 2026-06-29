import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { canManageWarehouse } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { ArrowLeftRight, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { KochirishDetail, type DetailData } from "./kochirish-detail";

export const dynamic = "force-dynamic";

export default async function KochirishDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || !canManageWarehouse(session.user.roles)) redirect("/logistika");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const t = await prisma.branchTransfer.findUnique({
    where: { id },
    select: {
      id: true, status: true, targetDays: true, note: true, createdAt: true, confirmedAt: true,
      fromBranch: { select: { name: true } },
      toBranch: { select: { name: true } },
      createdBy: { select: { name: true } },
      items: {
        select: {
          productId: true, qty: true,
          product: { select: { code: true, name: true, category: { select: { name: true } } } },
        },
        orderBy: { product: { name: "asc" } },
      },
    },
  });
  if (!t) notFound();

  const data: DetailData = {
    id: t.id, status: t.status, targetDays: t.targetDays, note: t.note ?? "",
    fromBranch: t.fromBranch.name, toBranch: t.toBranch.name, createdBy: t.createdBy.name,
    createdAt: t.createdAt.toISOString(), confirmedAt: t.confirmedAt?.toISOString() ?? null,
    items: t.items.map((i) => ({
      productId: i.productId, code: i.product.code, name: i.product.name,
      sub: i.product.category?.name ?? null, qty: Number(i.qty),
    })),
  };

  return (
    <div className="space-y-5">
      <PageHeader icon={ArrowLeftRight} title={`Ko'chirish #${t.id}`} description={`${t.fromBranch.name} → ${t.toBranch.name} · ${t.targetDays} kunlik qoplash`}>
        <Link href="/logistika?tab=kochirish"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary">
          <ArrowLeft className="h-4 w-4" /> Ro&apos;yxatga
        </Link>
      </PageHeader>
      <KochirishDetail data={data} />
    </div>
  );
}
