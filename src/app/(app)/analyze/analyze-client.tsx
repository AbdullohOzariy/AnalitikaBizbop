"use client";

import { useMemo, useState } from "react";
import { Search, Store, ScanSearch } from "lucide-react";
import { EmptyState, Pill } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { formatNumber, formatPercent } from "@/lib/format";
import type { BranchPriceDiff, PriceMismatch } from "@/lib/analyze/price-quality";

// Narx — so'mda, 2 kasrgacha (yaxlitlash farqlari ko'rinishi uchun).
function fmtPrice(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("uz-UZ", { maximumFractionDigits: 2 });
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-xl border border-border bg-card pl-9 pr-3 text-sm outline-none transition-colors focus:border-primary sm:w-80"
      />
    </div>
  );
}

function matchesQuery(q: string, code: number, name: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  return String(code).includes(needle) || name.toLowerCase().includes(needle);
}

// ─── Tab 1: Filiallar narx farqi ────────────────────────────────────────────
export function BranchDiffTab({ rows }: { rows: BranchPriceDiff[] }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => rows.filter((r) => matchesQuery(q, r.code, r.name)), [rows, q]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Store}
        title="Narx farqi topilmadi"
        description="Eng oxirgi davrda hech bir SKU'da filiallar sotuv narxi farq qilmadi (yoki narxli fayl yuklanmagan)."
      />
    );
  }

  return (
    <div className="space-y-3">
      <SearchBox value={q} onChange={setQ} placeholder="Kod yoki nom bo'yicha qidirish…" />
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Kod</th>
              <th className="px-4 py-2.5 font-medium">Mahsulot</th>
              <th className="px-4 py-2.5 text-right font-medium">Min narx</th>
              <th className="px-4 py-2.5 text-right font-medium">Max narx</th>
              <th className="px-4 py-2.5 text-right font-medium">Farq</th>
              <th className="px-4 py-2.5 font-medium">Filiallar</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.productId} className="border-b border-border/40 last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{r.code}</td>
                <td className="px-4 py-2.5">
                  <div className="font-medium">{r.name}</div>
                  {r.categoryName && <div className="text-xs text-muted-foreground">{r.categoryName}</div>}
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtPrice(r.minPrice)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtPrice(r.maxPrice)}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className="font-semibold tabular-nums text-destructive">{fmtPrice(r.spread)}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">{formatPercent(r.spreadPct)}</div>
                </td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {r.branches.map((b) => {
                      const isMin = b.price === r.minPrice;
                      const isMax = b.price === r.maxPrice;
                      return (
                        <span
                          key={b.branchId}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-lg border px-2 py-0.5 text-xs",
                            isMax
                              ? "border-destructive/20 bg-destructive/10 text-destructive"
                              : isMin
                              ? "border-primary/20 bg-primary/10 text-primary"
                              : "border-border bg-muted text-muted-foreground"
                          )}
                          title={b.branchName}
                        >
                          <span className="font-medium">{b.branchName}</span>
                          <span className="tabular-nums font-semibold">{fmtPrice(b.price)}</span>
                        </span>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p className="px-1 text-sm text-muted-foreground">Qidiruv bo'yicha natija yo'q.</p>}
    </div>
  );
}

// ─── Tab 2/3: Summa÷soni ≠ Narx (sotuv yoki tannarx) ────────────────────────
function MismatchTab({ rows, kind }: { rows: PriceMismatch[]; kind: "sale" | "cost" }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => rows.filter((r) => matchesQuery(q, r.code, r.name)), [rows, q]);

  const sumLabel = kind === "sale" ? "Сумма÷Кол (sotuv)" : "Сумма÷Кол (tannarx)";
  const fileLabel = kind === "sale" ? "Цена (sotuv)" : "Цена (tannarx)";

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={ScanSearch}
        title="Nomuvofiqlik topilmadi"
        description={
          kind === "sale"
            ? "Eng oxirgi davrda Продажи Сумма÷Количество barcha qatorlarda Продажи Цена bilan mos keldi."
            : "Eng oxirgi davrda Себестоимость Сумма÷Количество barcha qatorlarda Себестоимость Цена bilan mos keldi."
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <SearchBox value={q} onChange={setQ} placeholder="Kod yoki nom bo'yicha qidirish…" />
      <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-card">
        <table className="w-full min-w-[840px] text-sm">
          <thead>
            <tr className="border-b border-border/60 text-left text-xs text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">Kod</th>
              <th className="px-4 py-2.5 font-medium">Mahsulot</th>
              <th className="px-4 py-2.5 font-medium">Filial</th>
              <th className="px-4 py-2.5 text-right font-medium">Soni</th>
              <th className="px-4 py-2.5 text-right font-medium">{sumLabel}</th>
              <th className="px-4 py-2.5 text-right font-medium">{fileLabel}</th>
              <th className="px-4 py-2.5 text-right font-medium">Farq</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={`${r.productId}-${r.branchId}`} className="border-b border-border/40 last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{r.code}</td>
                <td className="px-4 py-2.5">
                  <div className="font-medium">{r.name}</div>
                  {r.categoryName && <div className="text-xs text-muted-foreground">{r.categoryName}</div>}
                </td>
                <td className="px-4 py-2.5">
                  <Pill tone="muted">{r.branchName}</Pill>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatNumber(r.soldQty)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmtPrice(r.derivedPrice)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtPrice(r.filePrice)}</td>
                <td className="px-4 py-2.5 text-right">
                  <div className={cn("font-semibold tabular-nums", r.diff > 0 ? "text-destructive" : "text-amber-600 dark:text-amber-400")}>
                    {r.diff > 0 ? "+" : ""}
                    {fmtPrice(r.diff)}
                  </div>
                  <div className="text-xs text-muted-foreground tabular-nums">{formatPercent(r.diffPct)}</div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && <p className="px-1 text-sm text-muted-foreground">Qidiruv bo'yicha natija yo'q.</p>}
    </div>
  );
}

export function SaleMismatchTab({ rows }: { rows: PriceMismatch[] }) {
  return <MismatchTab rows={rows} kind="sale" />;
}

export function CostMismatchTab({ rows }: { rows: PriceMismatch[] }) {
  return <MismatchTab rows={rows} kind="cost" />;
}
