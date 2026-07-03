import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canSeeChiqim, isSystemAdmin } from "@/lib/roles";
import {
  botConfigured,
  aktivFilialNomlari,
  vozvratKanban,
  vozvratSummary,
  chiqimDefaultRange,
} from "@/lib/spisaniya/db";
import { formatUZS } from "@/lib/format";
import { isoDay, parseDateParam } from "@/lib/date";
import { Recycle, WifiOff, CheckCircle2, Layers, Warehouse } from "lucide-react";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { ChiqimFilter } from "../chiqim-filter";
import { VozvratViews } from "./vozvrat-views";
import { VozvratImportButton } from "./vozvrat-import-button";

export default async function VozvratlarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  const roles = session.user.roles;
  if (!canSeeChiqim(roles)) redirect("/dashboard-v2");

  if (!botConfigured()) {
    return (
      <div className="space-y-5">
        <PageHeader icon={Recycle} title="Vozvratlar" description="Qaytarish jarayoni (kanban)" />
        <EmptyState icon={WifiOff} title="Bot bazasiga ulanmagan"
          description="BOT_DATABASE_URL muhit o'zgaruvchisi sozlanmagan." />
      </div>
    );
  }

  const sp = await searchParams;
  const def = chiqimDefaultRange();
  const startDate = parseDateParam(sp.start) ?? def.start;
  const endDate = parseDateParam(sp.end) ?? def.end;
  const range = { start: startDate, end: endDate };
  const filial = sp.filial || undefined;

  const [rows, summary, filials] = await Promise.all([
    vozvratKanban(range, filial),
    vozvratSummary(range, filial),
    aktivFilialNomlari(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader icon={Recycle} title="Vozvratlar" description="Qaytarish jarayoni — kanban yoki ro'yxat">
        <div className="flex flex-wrap items-end gap-2">
          <ChiqimFilter
            filials={filials}
            defaultStart={sp.start ?? isoDay(def.start)}
            defaultEnd={sp.end ?? isoDay(def.end)}
            defaultFilial={sp.filial}
            hideTur
            basePath="/chiqim/vozvratlar"
          />
          {isSystemAdmin(roles) && <VozvratImportButton />}
        </div>
      </PageHeader>

      {/* Yuqori summary */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Saqlash xonasida"
          value={formatUZS(summary.saqlashSumma, { compact: true })}
          hint="saqlash xonasidagi vozvratlar summasi"
          icon={Warehouse}
          tone="violet"
        />
        <StatCard
          label="Qaytarilgan"
          value={formatUZS(summary.qaytarildiSumma, { compact: true })}
          hint="qabul qilinib qaytarilgan summa"
          icon={CheckCircle2}
          tone="green"
        />
        <StatCard
          label="Jami vozvratlar"
          value={summary.jamiSoni.toLocaleString("uz-UZ")}
          hint="tanlangan davrda"
          icon={Layers}
          tone="default"
        />
      </div>

      {/* Kanban yoki Ro'yxat ko'rinishi — faqat admin tahrirlaydi */}
      <VozvratViews vozvratlar={rows} canEdit={isSystemAdmin(roles)} filials={filials} />
    </div>
  );
}
