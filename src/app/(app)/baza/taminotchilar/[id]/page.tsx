import Link from "next/link";
import { isoDay } from "@/lib/date";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { canSeeSuppliers, canEditSuppliers } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { Truck, ArrowLeft, Layers, Clock, FileText, ShoppingCart, Users, Star } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import type { ContractRow, AgentRow, SupplierTerms, BranchProfileRow } from "../actions";
import { ProfilHeader, OrderDaysCalendar, LeadTimeEditor, ContractsSection, AgentsSection, AssignSkusSection, type ProfilSku } from "./profil-client";
import { SupplierTermsSection, BranchProfilesSection } from "./terms-client";
import { ZakazTarixiSection, type OrderHistoryRow } from "./zakaz-tarixi";
import { supplierOrderHistoryAction } from "@/app/(app)/sotuv/sotib-olish/actions";

export const dynamic = "force-dynamic";

const iso = (d: Date | null) => (d ? isoDay(d) : null);

export default async function SupplierProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await auth();
  if (!session?.user || !canSeeSuppliers(session.user.roles)) redirect("/dashboard-v2");
  const canEdit = canEditSuppliers(session.user.roles);

  const { id } = await params;
  const supplierId = Number(id);
  if (!Number.isFinite(supplierId)) notFound();

  const [supplier, products, orderCount, ratingAgg, branchList, orderHistoryRes] = await Promise.all([
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
        agents: {
          orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
          include: {
            orderDays: {
              // eslint-disable-next-line react-hooks/purity
              where: { sana: { gte: new Date(Date.now() - 60 * 86_400_000) } },
              orderBy: { sana: "asc" },
              select: { sana: true },
            },
          },
        },
        branchProfiles: true,
      },
    }),
    prisma.product.findMany({
      where: { supplierId },
      select: {
        id: true, code: true, name: true, leadTimeDays: true, packSize: true, purchasePrice: true,
        abcClass: true, xyzClass: true, currentSold: true, archivedAt: true, agentId: true,
        category: { select: { id: true, name: true } },
      },
      // Avval ko'p sotiladiganlar — lead time'ni muhimlaridan kiritish tabiiy
      orderBy: [{ currentSold: { sort: "desc", nulls: "last" } }, { name: "asc" }],
    }),
    prisma.purchaseOrder.count({ where: { supplierId } }),
    // Yetib kelgan zakazlar bahosi o'rtachasi (1..5)
    prisma.purchaseOrder.aggregate({
      where: { supplierId, rating: { not: null } },
      _avg: { rating: true },
      _count: { rating: true },
    }),
    prisma.branch.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
    supplierOrderHistoryAction(supplierId),
  ]);
  if (!supplier) notFound();
  const avgRating = ratingAgg._avg.rating;
  const ratingCount = ratingAgg._count.rating;

  const skus: ProfilSku[] = products.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    sub: p.category?.name ?? null,
    subId: p.category?.id ?? -1,
    abc: p.abcClass,
    xyz: p.xyzClass,
    leadTimeDays: p.leadTimeDays,
    packSize: p.packSize != null ? Number(p.packSize) : null,
    purchasePrice: p.purchasePrice != null ? Number(p.purchasePrice) : null,
    agentId: p.agentId,
    arxiv: p.archivedAt != null,
  }));

  // Agent bo'yicha SKU soni — allaqachon yuklangan products'dan (qo'shimcha so'rovsiz)
  const agentSkuCount = new Map<number, number>();
  for (const p of products) if (p.agentId != null) agentSkuCount.set(p.agentId, (agentSkuCount.get(p.agentId) ?? 0) + 1);
  const agents: AgentRow[] = supplier.agents.map((a) => ({
    id: a.id,
    name: a.name,
    phone: a.phone,
    contactName: a.contactName,
    sortOrder: a.sortOrder,
    skuCount: agentSkuCount.get(a.id) ?? 0,
    orderDates: a.orderDays.map((d) => isoDay(d.sana)),
    orderWeekdays: a.orderWeekdays,
  }));
  const agentOptions = agents.map((a) => ({ id: a.id, name: a.name }));

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

  // ── Shartlar (umumiy) + filial bo'yicha profil ──
  const dn = (d: { toString(): string } | null | undefined) => (d != null ? Number(d) : null);
  const terms: SupplierTerms = {
    paymentType: supplier.paymentType, ehfMatch: supplier.ehfMatch, otsrochkaDays: supplier.otsrochkaDays,
    debitorHas: supplier.debitorHas, debitorLimit: dn(supplier.debitorLimit), discountPct: dn(supplier.discountPct),
    marketingDiscount: supplier.marketingDiscount, retrobonusPct: dn(supplier.retrobonusPct), agentMerchNote: supplier.agentMerchNote,
    promoSystem: supplier.promoSystem, promoCalendar: supplier.promoCalendar,
    responsibleRole: supplier.responsibleRole, responsibleName: supplier.responsibleName, responsiblePhone: supplier.responsiblePhone,
    sverkaName: supplier.sverkaName, sverkaPhone: supplier.sverkaPhone,
    accountingName: supplier.accountingName, accountingPhone: supplier.accountingPhone,
    logisticsName: supplier.logisticsName, logisticsPhone: supplier.logisticsPhone,
  };
  const profByBranch = new Map(supplier.branchProfiles.map((bp) => [bp.branchId, bp]));
  const branchProfiles: BranchProfileRow[] = branchList.map((b) => {
    const bp = profByBranch.get(b.id);
    return {
      branchId: b.id, branchName: b.name,
      shelfLengthCm: bp?.shelfLengthCm ?? null, faceCount: bp?.faceCount ?? null, skuCount: bp?.skuCount ?? null,
      orderDay: bp?.orderDay ?? null, deliveryDays: bp?.deliveryDays ?? null, deliveryWeekday: bp?.deliveryWeekday ?? null,
      deliveryTime: bp?.deliveryTime ?? null, dpPaymentTerms: bp?.dpPaymentTerms ?? null,
      forecastYearly: dn(bp?.forecastYearly), forecastMonthly: dn(bp?.forecastMonthly),
    };
  });

  const orderHistory: OrderHistoryRow[] = orderHistoryRes.ok
    ? orderHistoryRes.orders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt.toISOString(),
        status: o.status,
        agentName: o.agentName,
        itemCount: o.itemCount,
        totalSum: o.totalSum,
        createdByName: o.createdByName,
      }))
    : [];
  const orderHistoryError = orderHistoryRes.ok ? null : orderHistoryRes.error;

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
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard label="O'rtacha baho" value={avgRating != null ? `${avgRating.toFixed(1)} ★` : "—"} icon={Star}
          tone={avgRating != null ? (avgRating >= 4 ? "default" : "orange") : "default"}
          hint={ratingCount > 0 ? `${ratingCount} ta zakaz baholangan` : "hali baholanmagan"} />
        <StatCard label="SKU soni" value={skus.length.toLocaleString("uz-UZ")} icon={Layers}
          hint="shu yetkazib beruvchiga biriktirilgan" />
        <StatCard label="Agentlar (brend)" value={agents.length.toLocaleString("uz-UZ")} icon={Users}
          hint={agents.length === 0 ? "kiritilmagan" : undefined} />
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

      <SupplierTermsSection supplierId={supplier.id} terms={terms} canEdit={canEdit} />
      <BranchProfilesSection supplierId={supplier.id} profiles={branchProfiles} canEdit={canEdit} />

      <div className="grid gap-5 lg:grid-cols-[minmax(340px,420px)_1fr]">
        {/* Chap: agentlar + zakaz kunlari + shartnomalar */}
        <div className="space-y-5">
          <AgentsSection supplierId={supplier.id} agents={agents} canEdit={canEdit} />
          <OrderDaysCalendar
            supplierId={supplier.id}
            orderDates={supplier.orderDays.map((d) => isoDay(d.sana))}
            orderWeekdays={supplier.orderWeekdays}
            canEdit={canEdit}
            title={agents.length > 0 ? "Zakaz kunlari — agentsiz SKU" : "Zakaz qabul kunlari"}
          />
          <ContractsSection supplierId={supplier.id} contracts={contracts} canEdit={canEdit} />
        </div>

        {/* O'ng: SKU + agent + lead time */}
        <AssignSkusSection supplierId={supplier.id} canEdit={canEdit} />
        <LeadTimeEditor supplierId={supplier.id} skus={skus} agents={agentOptions} canEdit={canEdit} />
      </div>

      <ZakazTarixiSection orders={orderHistory} error={orderHistoryError} />
    </div>
  );
}
