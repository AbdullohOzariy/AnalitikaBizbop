import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canSeeFinance, canManageFinanceRefs } from "@/lib/roles";
import { decimalToNumber } from "@/lib/format";
import { Users, HandCoins, Truck, UserCog } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import { KontragentlarClient } from "./kontragentlar-client";

export const dynamic = "force-dynamic";

export default async function MoliyaKontragentlarPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeFinance(session.user.roles)) redirect("/dashboard");

  const canEdit = canManageFinanceRefs(session.user.roles);

  const [rows, sums, suppliers] = await Promise.all([
    prisma.counterparty.findMany({
      orderBy: [{ kind: "asc" }, { name: "asc" }],
      select: {
        id: true,
        name: true,
        kind: true,
        phone: true,
        note: true,
        isActive: true,
        supplierId: true,
        supplier: { select: { name: true } },
        aliases: { select: { id: true, alias: true }, orderBy: { alias: "asc" } },
        _count: { select: { txns: true } },
      },
    }),
    // Kontragent kesimida berilgan/qaytgan summa — hisobdor shaxsning OCHIQ
    // qoldig'i shundan chiqadi (berilgan − qaytarilgan).
    prisma.cashTxn.groupBy({
      by: ["counterpartyId", "direction"],
      where: { counterpartyId: { not: null } },
      _sum: { amount: true },
    }),
    prisma.supplier.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);

  const berilgan = new Map<number, number>();
  const qaytgan = new Map<number, number>();
  for (const s of sums) {
    if (s.counterpartyId == null) continue;
    const m = s.direction === "OUT" ? berilgan : qaytgan;
    m.set(s.counterpartyId, (m.get(s.counterpartyId) ?? 0) + decimalToNumber(s._sum.amount));
  }

  const data = rows.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    phone: c.phone,
    note: c.note,
    isActive: c.isActive,
    supplierId: c.supplierId,
    supplierName: c.supplier?.name ?? null,
    aliases: c.aliases,
    txnCount: c._count.txns,
    berilgan: berilgan.get(c.id) ?? 0,
    qaytgan: qaytgan.get(c.id) ?? 0,
  }));

  const hisobdor = data.filter((c) => c.kind === "ACCOUNTABLE");
  const ochiqQoldiq = hisobdor.reduce((s, c) => s + (c.berilgan - c.qaytgan), 0);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Users}
        title="Kontragentlar"
        description="Kim pul oldi/berdi. Manba jadvalda bu erkin matn edi va bir odam 3-4 xil imloda yozilardi — bu yerda ular birlashtiriladi."
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Jami kontragent" value={String(data.length)} icon={Users} tone="blue" />
        <StatCard
          label="Ta'minotchi"
          value={String(data.filter((c) => c.kind === "SUPPLIER").length)}
          icon={Truck}
          tone="green"
          hint={`${data.filter((c) => c.supplierId).length} tasi bazaga ulangan`}
        />
        <StatCard
          label="Hisobdor shaxs"
          value={String(hisobdor.length)}
          icon={UserCog}
          tone="orange"
          hint="Podotchyot — pul olib, tarqatadi"
        />
        <StatCard
          label="Ochiq qoldiq"
          value={new Intl.NumberFormat("uz-UZ").format(Math.round(ochiqQoldiq))}
          icon={HandCoins}
          tone={ochiqQoldiq > 0 ? "red" : "green"}
          hint="Hisobdor shaxslarda: berilgan − qaytarilgan"
        />
      </div>

      <KontragentlarClient rows={data} suppliers={suppliers} canEdit={canEdit} />
    </div>
  );
}
