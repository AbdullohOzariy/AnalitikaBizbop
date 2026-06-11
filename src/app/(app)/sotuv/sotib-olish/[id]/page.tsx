import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ShoppingCart } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { OrderDetail, type OrderData } from "./order-detail";

export const dynamic = "force-dynamic";

export default async function ZakazDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user) redirect("/login"); // barcha rollar kuzatadi (CAT_MANAGER — faqat o'ziniki)
  const userId = Number(session.user.id);
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();

  const order = await prisma.purchaseOrder.findUnique({
    where: { id },
    select: {
      id: true, status: true, note: true, createdAt: true, sentAt: true, receivedAt: true,
      createdById: true,
      supplier: { select: { name: true } },
      createdBy: { select: { name: true } },
      items: {
        select: { productId: true, quantity: true, price: true, packCount: true, packSize: true, factQty: true, product: { select: { code: true, name: true, category: { select: { name: true } } } } },
        orderBy: { product: { name: "asc" } },
      },
    },
  });
  if (!order) notFound();
  if (role === "CAT_MANAGER" && order.createdById !== userId) redirect("/sotuv/sotib-olish");

  const data: OrderData = {
    id: order.id,
    status: order.status,
    note: order.note ?? "",
    supplier: order.supplier.name,
    createdBy: order.createdBy.name,
    createdAt: order.createdAt.toISOString(),
    sentAt: order.sentAt?.toISOString() ?? null,
    receivedAt: order.receivedAt?.toISOString() ?? null,
    items: order.items.map((i) => ({
      productId: i.productId,
      code: i.product.code,
      name: i.product.name,
      sub: i.product.category?.name ?? null,
      quantity: Number(i.quantity),
      price: Number(i.price),
      packCount: i.packCount,
      packSize: i.packSize,
      factQty: i.factQty != null ? Number(i.factQty) : null,
    })),
  };

  return (
    <div className="space-y-5">
      <PageHeader icon={ShoppingCart} title={`Zakaz #${order.id}`} description={order.supplier.name} />
      <OrderDetail order={data} role={role ?? ""} isOwner={order.createdById === userId} />
    </div>
  );
}
