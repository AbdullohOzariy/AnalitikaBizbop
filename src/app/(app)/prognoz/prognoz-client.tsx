"use client";

import * as React from "react";
import Link from "next/link";
import { TrendingUp, ExternalLink } from "lucide-react";
import { DataTable, type Ustun } from "@/components/common/data-table";
import { cn } from "@/lib/utils";
import type { PrognozQator } from "@/lib/prognoz/oqish";

/**
 * SINF UI'ni belgilaydi, modelni EMAS. Siyrak talabda (INTERMITTENT/LUMPY) haftalik
 * raqam ma'nosiz — haftalarning ko'pi nol, shuning uchun faqat gorizont JAMISI
 * ko'rsatiladi va "nol ehtimoli" qo'shiladi.
 */
const SINF_META: Record<string, { nom: string; izoh: string; tone: string }> = {
  SMOOTH: { nom: "Barqaror", izoh: "Har hafta sotiladi, miqdor tekis", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  ERRATIC: { nom: "Notekis", izoh: "Har hafta sotiladi, miqdor keskin o'zgaradi", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  INTERMITTENT: { nom: "Siyrak", izoh: "Ba'zi haftalarda sotuv yo'q", tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
  LUMPY: { nom: "Siyrak+notekis", izoh: "Sotuv siyrak va miqdor keskin o'zgaradi", tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
  KAM: { nom: "Tarix kam", izoh: "Model qurish uchun tarix yetarli emas", tone: "bg-muted text-muted-foreground" },
};

const ISHONCH_META: Record<string, { nom: string; tone: string }> = {
  ISHONCHLI: { nom: "Ishonchli", tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  TAXMINIY: { nom: "Taxminiy", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  ISHONCHSIZ: { nom: "Ishonchsiz", tone: "bg-rose-500/10 text-rose-600 dark:text-rose-400" },
};

const son = (n: number, xona = 0) =>
  new Intl.NumberFormat("uz-UZ", { minimumFractionDigits: xona, maximumFractionDigits: xona }).format(n);

function Chip({ nom, tone, title }: { nom: string; tone: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", tone)}>
      {nom}
    </span>
  );
}

export function PrognozJadval({ rows, horizon }: { rows: PrognozQator[]; horizon: number }) {
  const ustunlar: Ustun<PrognozQator>[] = React.useMemo(
    () => [
      {
        key: "name",
        nom: "SKU",
        qiymat: (r) => r.name,
        render: (r) => (
          <div className="min-w-[220px]">
            <Link
              href={`/prognoz/${r.productId}?branchId=${r.branchId}`}
              className="font-medium hover:underline inline-flex items-center gap-1"
            >
              {r.name}
              <ExternalLink className="h-3 w-3 opacity-50" />
            </Link>
            <div className="text-[11px] text-muted-foreground">
              {r.code} · {r.subkat ?? "—"}
            </div>
          </div>
        ),
      },
      { key: "branch", nom: "Filial", qiymat: (r) => r.branch, filtrlanadi: true },
      { key: "abc", nom: "ABC", qiymat: (r) => r.abc ?? "—", filtrlanadi: true, ong: true },
      {
        key: "sinf",
        nom: "Sinf",
        qiymat: (r) => r.sinf,
        filtrlanadi: true,
        yorliq: (v) => SINF_META[v]?.nom ?? v,
        render: (r) => {
          const m = SINF_META[r.sinf] ?? SINF_META.KAM;
          return <Chip nom={m.nom} tone={m.tone} title={m.izoh} />;
        },
      },
      {
        key: "lastQty",
        nom: "O'tgan hafta",
        qiymat: (r) => r.lastQty,
        ong: true,
        render: (r) => <span className="tabular-nums text-muted-foreground">{son(r.lastQty, 1)}</span>,
      },
      {
        key: "p50",
        nom: `Prognoz (${horizon} hafta)`,
        qiymat: (r) => r.p50,
        ong: true,
        render: (r) => <span className="tabular-nums font-medium">{son(r.p50, 1)}</span>,
      },
      {
        key: "q90",
        nom: "Zaxira tavsiyasi",
        qiymat: (r) => r.q90,
        ong: true,
        render: (r) => (
          <span className="tabular-nums" title="Servis darajasi bo'yicha: shuncha zaxira bo'lsa, talab 90% holatda qoplanadi">
            {son(r.q90, 1)}
          </span>
        ),
      },
      {
        key: "zeroProb",
        nom: "Nol ehtimoli",
        qiymat: (r) => r.zeroProb ?? -1,
        ong: true,
        render: (r) =>
          r.zeroProb == null ? (
            <span className="text-muted-foreground">—</span>
          ) : (
            <span className={cn("tabular-nums", r.zeroProb >= 0.5 && "text-rose-600 dark:text-rose-400")}>
              {(r.zeroProb * 100).toFixed(0)}%
            </span>
          ),
      },
      {
        key: "ishonch",
        nom: "Ishonch",
        qiymat: (r) => r.ishonch ?? "—",
        filtrlanadi: true,
        yorliq: (v) => ISHONCH_META[v]?.nom ?? "Baholanmagan",
        render: (r) => {
          if (!r.ishonch) {
            return (
              <span className="text-[11px] text-muted-foreground" title="Bu seriya hali fakt bilan solishtirilmagan">
                baholanmagan
              </span>
            );
          }
          const m = ISHONCH_META[r.ishonch];
          return (
            <Chip
              nom={m.nom}
              tone={m.tone}
              title={r.wape != null ? `Oxirgi oynalar WAPE: ${(r.wape * 100).toFixed(0)}%` : undefined}
            />
          );
        },
      },
      {
        key: "som",
        nom: "So'mda",
        qiymat: (r) => r.som,
        ong: true,
        render: (r) => <span className="tabular-nums text-muted-foreground">{son(r.som)}</span>,
      },
    ],
    [horizon]
  );

  return (
    <DataTable
      rows={rows}
      ustunlar={ustunlar}
      kalit={(r) => `${r.productId}:${r.branchId}`}
      bosh="Prognoz yo'q"
      boshIcon={TrendingUp}
    />
  );
}
