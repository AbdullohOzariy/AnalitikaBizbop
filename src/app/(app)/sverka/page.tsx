/**
 * Sverka — Telegram Mini App orqali kiritilgan solishtirish yozuvlari.
 * Filtri: davr + firma/kontragent qidiruv. O'chirish — SA va SUPPLYCHAIN.
 */
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { isSystemAdmin, isSupplyChain, canSeeSverka } from "@/lib/roles";
import { FileCheck2, Wallet, ListChecks, CalendarDays } from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import { formatUZS, formatDateTimeUZ } from "@/lib/format";
import { nowTashkent, isoDay } from "@/lib/date";
import { BazaFilter } from "../baza/baza-filter";
import { SverkaJadval, SverkaXodimlar, type SverkaRow, type XodimRow } from "./sverka-client";

export const dynamic = "force-dynamic";

export default async function SverkaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  const roles = session?.user?.roles;
  if (!session?.user || !canSeeSverka(roles)) {
    redirect("/dashboard-v2");
  }
  const canDelete = isSystemAdmin(roles) || isSupplyChain(roles);

  const sp = await searchParams;
  // Standart davr: joriy oy (server komponent)
  const now = nowTashkent();
  const defStart = `${now.toISOString().slice(0, 7)}-01`;
  const defEnd = isoDay(now);
  const startStr = /^\d{4}-\d{2}-\d{2}$/.test(sp.start ?? "") ? sp.start! : defStart;
  const endStr = /^\d{4}-\d{2}-\d{2}$/.test(sp.end ?? "") ? sp.end! : defEnd;
  const q = (sp.q ?? "").trim().slice(0, 80);

  const where: Prisma.SverkaRecordWhereInput = {
    sana: { gte: new Date(startStr + "T00:00:00.000Z"), lte: new Date(endStr + "T00:00:00.000Z") },
    ...(q
      ? {
          OR: [
            { firmaNomi: { contains: q, mode: "insensitive" } },
            { qabulQildi: { contains: q, mode: "insensitive" } },
            { dagavor: { contains: q, mode: "insensitive" } },
            { sklad: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [records, agg, xodimlar] = await Promise.all([
    prisma.sverkaRecord.findMany({ where, orderBy: [{ sana: "desc" }, { id: "desc" }], take: 300 }),
    prisma.sverkaRecord.aggregate({ where, _sum: { summa: true }, _count: { _all: true } }),
    canDelete
      ? prisma.sverkaXodim.findMany({ orderBy: { createdAt: "desc" } })
      : Promise.resolve([]),
  ]);

  const rows: SverkaRow[] = records.map((r) => ({
    id: r.id,
    sana: isoDay(r.sana),
    firmaNomi: r.firmaNomi,
    supplierId: r.supplierId,
    sklad: r.sklad,
    qabulQildi: r.qabulQildi,
    dagavor: r.dagavor,
    summa: Number(r.summa),
    rasmFileId: r.rasmFileId,
    kiritdi: r.tgUserName ?? `TG:${r.tgUserId}`,
    createdAt: formatDateTimeUZ(r.createdAt),
  }));

  const total = Number(agg._sum.summa ?? 0);
  const days = Math.max(1, Math.round((new Date(endStr).getTime() - new Date(startStr).getTime()) / 86_400_000) + 1);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={FileCheck2}
        title="Sverka"
        description="Telegram Mini App orqali kiritilgan solishtirish yozuvlari (nakladnoy bilan)"
      >
        <BazaFilter
          basePath="/sverka"
          branches={[]}
          defaultStart={startStr}
          defaultEnd={endStr}
          defaultSearch={q}
          showSearch
        />
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Yozuvlar" value={agg._count._all.toLocaleString("uz-UZ")} icon={ListChecks}
          hint={q ? `"${q}" filtri bilan` : "tanlangan davrda"} />
        <StatCard label="Jami summa" value={formatUZS(total, { compact: true })} icon={Wallet}
          hint={`${formatUZS(total)} so'm`} />
        <StatCard label="Davr" value={`${days} kun`} icon={CalendarDays} hint={`${startStr} – ${endStr}`} />
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {rows.length === 0 ? (
            <EmptyState
              icon={FileCheck2}
              title="Yozuv yo'q"
              description="Bu davrda sverka kiritilmagan. Bot orqali (📑 Sverka kiritish) qo'shiladi."
            />
          ) : (
            <div className="overflow-x-auto">
              <SverkaJadval rows={rows} canDelete={canDelete} />
            </div>
          )}
        </CardContent>
      </Card>
      {records.length === 300 && (
        <p className="text-xs italic text-muted-foreground">Birinchi 300 ta ko&apos;rsatildi — davrni qisqartiring yoki qidiruv ishlating.</p>
      )}

      {/* Xodimlar (sverka roli) — faqat SA/SUPPLYCHAIN boshqaradi */}
      {canDelete && (
        <SverkaXodimlar
          xodimlar={xodimlar.map((x): XodimRow => ({
            id: x.id,
            tgUserId: String(x.tgUserId),
            ism: x.ism,
            createdAt: isoDay(x.createdAt),
          }))}
        />
      )}
    </div>
  );
}
