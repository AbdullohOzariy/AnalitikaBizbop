import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { OrderDetail, type OrderData } from "./order-detail";
import { ordersScopedToOwn } from "@/lib/roles";

export const dynamic = "force-dynamic";

export default async function ZakazDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login"); // barcha rollar kuzatadi (CAT_MANAGER — faqat o'ziniki)
  const roles = session.user.roles;
  const userId = Number(session.user.id);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const [order, branchList] = await Promise.all([
    prisma.purchaseOrder.findUnique({
      where: { id },
      select: {
        id: true, status: true, note: true, createdAt: true, sentAt: true, receivedAt: true,
        createdById: true, rating: true, ratingNote: true,
        supplier: { select: { name: true } },
        agent: { select: { name: true, phone: true, contactName: true } },
        createdBy: { select: { name: true } },
        items: {
          select: {
            productId: true, quantity: true, price: true, packCount: true, packSize: true, factQty: true,
            branchQtys: { select: { branchId: true, quantity: true } },
            product: { select: { code: true, name: true, leadTimeDays: true, category: { select: { name: true } } } },
          },
          orderBy: { product: { name: "asc" } },
        },
      },
    }),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!order) notFound();
  if (ordersScopedToOwn(roles) && order.createdById !== userId) redirect("/sotuv/sotib-olish");

  // Zakazda filial taqsimoti bormi — bo'lsa per-filial ko'rinish, aks holda eski (jami) ko'rinish.
  const hasBranchData = order.items.some((i) => i.branchQtys.length > 0);

  const data: OrderData = {
    id: order.id,
    status: order.status,
    note: order.note ?? "",
    supplier: order.supplier.name,
    agent: order.agent ? { name: order.agent.name, phone: order.agent.phone, contactName: order.agent.contactName } : null,
    createdBy: order.createdBy.name,
    createdAt: order.createdAt.toISOString(),
    sentAt: order.sentAt?.toISOString() ?? null,
    receivedAt: order.receivedAt?.toISOString() ?? null,
    rating: order.rating,
    ratingNote: order.ratingNote,
    branches: hasBranchData ? branchList.map((b) => ({ id: b.id, name: b.name })) : [],
    items: order.items.map((i) => ({
      productId: i.productId,
      code: i.product.code,
      name: i.product.name,
      sub: i.product.category?.name ?? null,
      quantity: Number(i.quantity),
      price: Number(i.price),
      packCount: i.packCount != null ? Number(i.packCount) : null,
      packSize: i.packSize != null ? Number(i.packSize) : null,
      lead: i.product.leadTimeDays,
      factQty: i.factQty != null ? Number(i.factQty) : null,
      branches: i.branchQtys.map((bq) => ({ branchId: bq.branchId, quantity: Number(bq.quantity) })),
    })),
  };

  return (
    <div className="space-y-5">
      <PageHeader icon={ShoppingCart} title={`Zakaz #${order.id}`} description={order.agent ? `${order.supplier.name} · ${order.agent.name}` : order.supplier.name} />
      <OrderDetail order={data} roles={roles} isOwner={order.createdById === userId} />
    </div>
  );
}
