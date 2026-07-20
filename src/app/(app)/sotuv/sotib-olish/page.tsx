/**
 * Sotib olish — zakazlar KANBAN doskasi. Workflow: menejer yaratadi (Qoralama →
 * Tasdiqda) → supplychain tasdiqlaydi/yuboradi → zakaz qabul qilindi → yetib
 * keldi (fakt solishtiriladi). Barcha rollar kuzatadi; o'tishlar rolga mos.
 * CAT_MANAGER faqat o'z zakazlarini ko'radi.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ShoppingCart, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { formatDateUZ } from "@/lib/format";
import { parseDateParam, TASHKENT_OFFSET_MS } from "@/lib/date";
import { canManageOrders, ordersScopedToOwn } from "@/lib/roles";
import { KanbanBoard, type KanbanCard } from "./kanban-board";
import { KanbanFilter } from "./kanban-filter";
import type { OrderStatusT } from "./order-status";
import type { Prisma } from "@/generated/prisma/client";

export const dynamic = "force-dynamic";

export default async function SotibOlishPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const roles = session.user.roles;
  const userId = Number(session.user.id);

  const sp = await searchParams;
  const startDay = parseDateParam(sp.start);
  const endDay = parseDateParam(sp.end);
  const supplierId = Number(sp.supplierId);

  const where: Prisma.PurchaseOrderWhereInput = {};
  if (ordersScopedToOwn(roles)) where.createdById = userId;
  if (Number.isInteger(supplierId) && supplierId > 0) where.supplierId = supplierId;

  // Toshkent kalendar kunini real UTC instantga o'giramiz (Toshkent yarim tuni =
  // UTC 19:00, kecha). Tugash kuni INKLYUZIV — shuning uchun keyingi kun boshigacha.
  if (startDay || endDay) {
    where.createdAt = {
      ...(startDay ? { gte: new Date(startDay.getTime() - TASHKENT_OFFSET_MS) } : {}),
      ...(endDay
        ? { lt: new Date(endDay.getTime() + 86_400_000 - TASHKENT_OFFSET_MS) }
        : {}),
    };
  }

  const [orders, suppliers] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where,
      select: {
        id: true, status: true, createdAt: true, createdById: true,
        supplier: { select: { name: true } },
        agent: { select: { name: true } },
        createdBy: { select: { name: true } },
        items: { select: { quantity: true, price: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 400,
    }),
    prisma.supplier.findMany({ select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
  ]);

  const cards: KanbanCard[] = orders.map((o) => ({
    id: o.id,
    status: o.status as OrderStatusT,
    supplier: o.supplier.name,
    agent: o.agent?.name ?? null,
    total: o.items.reduce((s, i) => s + Number(i.quantity) * Number(i.price), 0),
    count: o.items.length,
    createdBy: o.createdBy.name,
    date: formatDateUZ(o.createdAt),
    mine: o.createdById === userId,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ShoppingCart}
        title="Sotib olish"
        description="Zakazlar doskasi — yaratishdan yetib kelgungacha barcha bosqichlar"
      >
        {canManageOrders(roles) && (
          <Link href="/sotuv/sotib-olish/yangi"
            className="inline-flex h-9 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90">
            <Plus className="h-4 w-4" /> Yangi zakaz
          </Link>
        )}
      </PageHeader>

      <KanbanFilter
        defaultStart={sp.start ?? ""}
        defaultEnd={sp.end ?? ""}
        defaultSupplierId={sp.supplierId ?? ""}
        suppliers={suppliers}
      />

      <KanbanBoard cards={cards} roles={roles} />
    </div>
  );
}
