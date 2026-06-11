import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { canSeeSuppliers, canEditSuppliers } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Truck, ArrowLeft, Layers, Clock, FileText, ShoppingCart } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import type { ContractRow } from "../actions";
import { ProfilHeader, OrderDaysCalendar, LeadTimeEditor, ContractsSection, type ProfilSku } from "./profil-client";

export const dynamic = "force-dynamic";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null);

export default async function SupplierProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || !canSeeSuppliers(session.user.role)) redirect("/dashboard-v2");
  const canEdit = canEditSuppliers(session.user.role);

  const { id } = await params;
  const supplierId = Number(id);
  if (!Number.isFinite(supplierId)) notFound();

  const [supplier, products, orderCount] = await Promise.all([
    prisma.supplier.findUnique({
      where: { id: supplierId },
      include: {
        contracts: { orderBy: [{ signedAt: "desc" }, { id: "desc" }] },
        orderDays: {
          // Server komponent: har so'rovda bir marta (purity qoidasi client uchun)
          // eslint-disable-next-line react-hooks/purity
          where: { sana: { gte: new Date(Date.now() - 60 * 86_400_000) } },
          orderBy: { sana: "asc" },
          select: { sana: true },
        },
      },
    }),
    prisma.product.findMany({
      where: { supplierId },
      select: {
        id: true, code: true, name: true, leadTimeDays: true, packSize: true, purchasePrice: true,
        abcClass: true, xyzClass: true, currentSold: true, archivedAt: true,
        category: { select: { id: true, name: true } },
      },
      // Avval ko'p sotiladiganlar — lead time'ni muhimlaridan kiritish tabiiy
      orderBy: [{ currentSold: { sort: "desc", nulls: "last" } }, { name: "asc" }],
    }),
    prisma.purchaseOrder.count({ where: { supplierId } }),
  ]);
  if (!supplier) notFound();

  const skus: ProfilSku[] = products.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    sub: p.category?.name ?? null,
    subId: p.category?.id ?? -1,
    abc: p.abcClass,
    xyz: p.xyzClass,
    leadTimeDays: p.leadTimeDays,
    packSize: p.packSize,
    purchasePrice: p.purchasePrice != null ? Number(p.purchasePrice) : null,
    arxiv: p.archivedAt != null,
  }));

  const contracts: ContractRow[] = supplier.contracts.map((c) => ({
    id: c.id,
    title: c.title,
    number: c.number,
    signedAt: iso(c.signedAt),
    endDate: iso(c.endDate),
    amount: c.amount != null ? Number(c.amount) : null,
    url: c.url,
    note: c.note,
  }));

  const withLead = skus.filter((s) => s.leadTimeDays != null);
  const avgLead = withLead.length
    ? withLead.reduce((s, x) => s + (x.leadTimeDays ?? 0), 0) / withLead.length
    : null;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Truck}
        title={supplier.name}
        description="Yetkazib beruvchi profili — SKU'lar, lead time, zakaz kunlari, shartnomalar"
      >
        <Link
          href="/baza/taminotchilar"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
        >
          <ArrowLeft className="h-4 w-4" /> Ro&apos;yxatga
        </Link>
      </PageHeader>

      {/* KPI */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="SKU soni" value={skus.length.toLocaleString("uz-UZ")} icon={Layers}
          hint="shu yetkazib beruvchiga biriktirilgan" />
        <StatCard label="Lead time" value={avgLead != null ? `≈ ${avgLead.toFixed(1)} kun` : "—"} icon={Clock}
          tone={withLead.length === 0 ? "orange" : "default"}
          hint={`kiritilgan: ${withLead.length}/${skus.length}`} />
        <StatCard label="Shartnomalar" value={contracts.length.toLocaleString("uz-UZ")} icon={FileText}
          hint={contracts.length === 0 ? "kiritilmagan" : undefined} />
        <StatCard label="Zakazlar" value={orderCount.toLocaleString("uz-UZ")} icon={ShoppingCart}
          hint="shu yetkazib beruvchiga berilgan" />
      </div>

      {/* Baho + kontakt */}
      <ProfilHeader
        canEdit={canEdit}
        supplierId={supplier.id}
        name={supplier.name}
        rating={supplier.rating}
        ratingNote={supplier.ratingNote}
        phone={supplier.phone}
        contactName={supplier.contactName}
      />

      <div className="grid gap-5 lg:grid-cols-[minmax(340px,420px)_1fr]">
        {/* Chap: zakaz kunlari + shartnomalar */}
        <div className="space-y-5">
          <OrderDaysCalendar supplierId={supplier.id} orderDates={supplier.orderDays.map((d) => d.sana.toISOString().slice(0, 10))} canEdit={canEdit} />
          <ContractsSection supplierId={supplier.id} contracts={contracts} canEdit={canEdit} />
        </div>

        {/* O'ng: SKU + lead time */}
        <LeadTimeEditor supplierId={supplier.id} skus={skus} canEdit={canEdit} />
      </div>
    </div>
  );
}
