/**
 * Analyze — narx sifati (data quality) bo'limi. 3 tab:
 *   (1) Filiallar narxi — bir SKU uchun filiallar sotuv narxi farq qiladi (eng oxirgi davr).
 *   (2) Sotuv narxi — Продажи Сумма÷Количество ≠ Продажи Цена.
 *   (3) Tannarx narxi — Себестоимость Сумма÷Количество ≠ Себестоимость Цена.
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { ScanSearch } from "lucide-react";
import { PageHeader } from "@/components/common/page";
import { canSeeAnalyze } from "@/lib/roles";
import { cn } from "@/lib/utils";
import { getPriceQuality } from "@/lib/analyze/price-quality";
import { formatDateUZ } from "@/lib/format";
import { BranchDiffTab, SaleMismatchTab, CostMismatchTab } from "./analyze-client";

export const dynamic = "force-dynamic";

type Tab = "filiallar" | "sotuv" | "tannarx";

export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  const role = session?.user?.role;
  if (!session?.user || !canSeeAnalyze(role)) redirect("/dashboard");

  const sp = await searchParams;
  const tab: Tab = sp.tab === "sotuv" ? "sotuv" : sp.tab === "tannarx" ? "tannarx" : "filiallar";

  const data = await getPriceQuality();

  const tabs: { v: Tab; l: string; count: number }[] = [
    { v: "filiallar", l: "Filiallar narxi", count: data.branchPriceDiffs.length },
    { v: "sotuv", l: "Sotuv narx farqi", count: data.salePriceMismatch.length },
    { v: "tannarx", l: "Tannarx narx farqi", count: data.costPriceMismatch.length },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        icon={ScanSearch}
        title="Analyze — narx sifati"
        description={
          data.periodEnd
            ? `Eng oxirgi davr: ${formatDateUZ(data.periodEnd)} — fayldagi tayyor narxlar bo'yicha nomuvofiqliklar`
            : "Narxli sotuv fayli hali yuklanmagan"
        }
      />

      <div role="tablist" className="flex flex-wrap gap-2">
        {tabs.map((t) => (
          <Link
            key={t.v}
            href={`/analyze?tab=${t.v}`}
            scroll={false}
            aria-current={tab === t.v ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center gap-2 rounded-xl border px-4 text-sm font-medium transition-colors",
              tab === t.v
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}
          >
            {t.l}
            {t.count > 0 && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[10px] font-bold tabular-nums",
                  tab === t.v ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"
                )}
              >
                {t.count}
                {data.truncated ? "+" : ""}
              </span>
            )}
          </Link>
        ))}
      </div>

      {tab === "sotuv" ? (
        <SaleMismatchTab rows={data.salePriceMismatch} />
      ) : tab === "tannarx" ? (
        <CostMismatchTab rows={data.costPriceMismatch} />
      ) : (
        <BranchDiffTab rows={data.branchPriceDiffs} />
      )}
    </div>
  );
}
