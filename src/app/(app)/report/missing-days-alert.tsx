import { AlertTriangle } from "lucide-react";

function formatDays(days: string[]): string {
  return days.map((d) => {
    const [, m, day] = d.split("-");
    return `${day}.${m}`;
  }).join(", ");
}

function Banner({
  title,
  days,
  totalDays,
}: {
  title: string;
  days: string[];
  totalDays: number;
}) {
  if (days.length === 0) return null;
  const allMissing = days.length === totalDays;

  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900/50 px-5 py-4 flex gap-3 items-start">
      <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
      <div className="space-y-1 min-w-0">
        <p className="text-[14px] font-semibold text-amber-900 dark:text-amber-200">
          {title} <span className="font-normal text-amber-700 dark:text-amber-300/80">
            ({days.length} / {totalDays} kun)
          </span>
        </p>
        <p className="text-[13px] text-amber-800 dark:text-amber-300/90 break-words">
          {allMissing
            ? "Tanlangan davr ichida bu turdagi ma'lumot umuman yuklanmagan."
            : <>Bo'sh kunlar: <span className="font-medium">{formatDays(days)}</span></>
          }
        </p>
      </div>
    </div>
  );
}

export function MissingDaysAlert({
  salesDays,
  visitsDays,
  totalDays,
}: {
  salesDays: string[];
  visitsDays: string[];
  totalDays: number;
}) {
  if (salesDays.length === 0 && visitsDays.length === 0) return null;
  return (
    <div className="space-y-2">
      <Banner
        title="Sotuv ma'lumotlari yo'q kunlar"
        days={salesDays}
        totalDays={totalDays}
      />
      <Banner
        title="Tashriflar ma'lumoti yo'q kunlar"
        days={visitsDays}
        totalDays={totalDays}
      />
    </div>
  );
}
