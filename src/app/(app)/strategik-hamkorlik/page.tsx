import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { canSeeAnalytics, isSupplyChain, isSystemAdmin } from "@/lib/roles";
import { getDefaultRange } from "@/lib/analytics";
import { parseDateParam, isoDay } from "@/lib/date";
import { getPartnershipScorecard } from "@/lib/partnership";
import { formatUZS } from "@/lib/format";
import { Handshake, TrendingUp, Layers, Percent } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import { PeriodPicker } from "./period-picker";
import { ScorecardTable } from "./scorecard-table";

export const dynamic = "force-dynamic";

export default async function StrategikHamkorlikPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeAnalytics(session.user.roles)) redirect("/dashboard");
  const canEdit = isSupplyChain(session.user.roles) || isSystemAdmin(session.user.roles);

  const sp = await searchParams;
  const def = await getDefaultRange();
  // Default davr — YTD (yil boshidan oxirgi ma'lumotli kunigacha). Rasmdagi "9 oy"
  // tabiiy ravishda shundan chiqadi (ma'lumot sentabrda tugasa Yanvar–Sentabr).
  const ytdStart = new Date(Date.UTC(def.end.getUTCFullYear(), 0, 1));
  const startDate = parseDateParam(sp.start) ?? ytdStart;
  const endDate = parseDateParam(sp.end) ?? def.end;
  const startStr = isoDay(startDate);
  const endStr = isoDay(endDate);

  const data = await getPartnershipScorecard(startStr, endStr);
  const avgGross =
    data.totalTurnover > 0 ? (data.totalMargin / data.totalTurnover) * 100 : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Strategik hamkorlik"
        description="Ta'minotchi skorkarti — gross-marja tuzilishi (front + orqa-marja)"
        icon={Handshake}
      />

      <PeriodPicker start={startStr} end={endStr} anchorEnd={isoDay(def.end)} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Jami oborot"
          value={formatUZS(data.totalTurnover, { compact: true })}
          icon={TrendingUp}
          tone="green"
          hint={`${data.rows.length} ta ta'minotchi`}
        />
        <StatCard
          label="Jami front-marja"
          value={formatUZS(data.totalMargin, { compact: true })}
          icon={Layers}
          tone="blue"
        />
        <StatCard
          label="O'rtacha front %"
          value={`${avgGross.toFixed(1)}%`}
          icon={Percent}
          tone="violet"
        />
        <StatCard
          label="Kapital stavka"
          value={`${data.capitalRatePct}%`}
          icon={Percent}
          tone="default"
          hint="rassrochka avto-bahosi"
        />
      </div>

      <ScorecardTable data={data} canEdit={canEdit} periodStart={startStr} periodEnd={endStr} />
    </div>
  );
}
