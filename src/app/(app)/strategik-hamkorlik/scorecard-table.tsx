"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronRight, ChevronDown, Loader2, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUZS } from "@/lib/format";
import type { ScorecardResult, ScorecardRow } from "@/lib/partnership";
import { savePartnershipOverride, type SavePartnershipInput } from "./actions";

/** Tahrirlanadigan yumshoq ustunlar → PartnershipScorecard maydoni. */
type EditField = "promoCompPct" | "rassrochkaPct" | "bonusPct" | "spisaniyePct" | "abcOverride";

const fmtPct = (n: number) => `${n.toFixed(2)}%`;

/** Gross marja rangi (foiz) — yaxshi/o'rta/past. */
function grossTone(g: number): string {
  if (g >= 15) return "text-primary";
  if (g >= 8) return "text-amber-600 dark:text-amber-400";
  return "text-destructive";
}

export function ScorecardTable({
  data,
  canEdit,
  periodStart,
  periodEnd,
}: {
  data: ScorecardResult;
  canEdit: boolean;
  periodStart: string;
  periodEnd: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  // Tahrir holati: bitta katak — `${supplierId}:${agentId ?? "s"}:${field}`.
  const [editKey, setEditKey] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  const toggle = (id: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const cellKey = (row: ScorecardRow, field: EditField) =>
    `${row.supplierId}:${row.agentId ?? "s"}:${field}`;

  const beginEdit = (row: ScorecardRow, field: EditField, current: number | string) => {
    if (!canEdit) return;
    setEditKey(cellKey(row, field));
    setDraft(field === "abcOverride" ? String(current) : String(current));
  };

  const save = (row: ScorecardRow, field: EditField) => {
    const raw = draft.trim();
    let value: number | string | null;
    if (field === "abcOverride") {
      value = raw || null;
    } else if (raw === "") {
      value = null; // bo'sh — override'ni tozalash (avtoga qaytadi)
    } else {
      const n = Number(raw.replace(",", "."));
      if (!Number.isFinite(n)) {
        toast.error("Raqam kiriting");
        return;
      }
      value = n;
    }
    const input: SavePartnershipInput = { supplierId: row.supplierId, agentId: row.agentId, periodStart, periodEnd };
    (input as Record<string, unknown>)[field] = value;
    startTransition(async () => {
      const res = await savePartnershipOverride(input);
      if (res.ok) {
        toast.success("Saqlandi");
        router.refresh();
      } else {
        toast.error(res.error);
      }
      setEditKey(null);
    });
  };

  /** Tahrirlanadigan foiz/ABC katagi. */
  const editable = (row: ScorecardRow, field: EditField, value: number | string, isOverride: boolean) => {
    const key = cellKey(row, field);
    const editing = editKey === key;
    if (editing) {
      return (
        <input
          autoFocus
          type={field === "abcOverride" ? "text" : "number"}
          step="0.01"
          maxLength={field === "abcOverride" ? 4 : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => save(row, field)}
          onKeyDown={(e) => {
            if (e.key === "Enter") save(row, field);
            else if (e.key === "Escape") setEditKey(null);
          }}
          className="w-16 rounded border border-primary bg-background px-1 py-0.5 text-right text-xs tabular-nums outline-none"
        />
      );
    }
    const display = field === "abcOverride" ? (value || "—") : fmtPct(Number(value));
    return (
      <button
        type="button"
        disabled={!canEdit}
        onClick={() => beginEdit(row, field, value)}
        title={canEdit ? "Tahrirlash — bo'sh qoldirsangiz avtoga qaytadi" : isOverride ? "Qo'lda kiritilgan" : "Avto-hisoblangan"}
        className={cn(
          "inline-flex items-center gap-1 rounded px-1 tabular-nums",
          canEdit && "hover:bg-muted",
          !isOverride && "text-muted-foreground"
        )}
      >
        {display}
        {isOverride && <span className="h-1.5 w-1.5 rounded-full bg-primary" title="Qo'lda kiritilgan" />}
      </button>
    );
  };

  const renderRow = (row: ScorecardRow, idx: number | null, isChild: boolean) => {
    const hasChildren = !isChild && (row.children?.length ?? 0) > 0;
    const isExp = expanded.has(row.supplierId);
    return (
      <tr
        key={`${row.supplierId}:${row.agentId ?? "s"}`}
        className={cn(
          "border-b border-border/60 last:border-0",
          isChild ? "bg-muted/30" : "hover:bg-muted/40"
        )}
      >
        <td className="px-2 py-1.5 text-right text-xs text-muted-foreground tabular-nums">
          {isChild ? "" : idx}
        </td>
        <td className="px-2 py-1.5">
          <div className={cn("flex items-center gap-1.5", isChild && "pl-6")}>
            {hasChildren ? (
              <button
                type="button"
                onClick={() => toggle(row.supplierId)}
                className="text-muted-foreground hover:text-foreground"
              >
                {isExp ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            ) : (
              !isChild && <span className="w-3.5" />
            )}
            <span className={cn("truncate", isChild ? "text-xs text-muted-foreground" : "font-medium")}>
              {isChild ? row.brandName : row.supplierName}
            </span>
          </div>
        </td>
        <td className="px-2 py-1.5 text-xs text-muted-foreground">
          {isChild ? "" : row.brandName ?? ""}
        </td>
        <td className="px-2 py-1.5 text-center text-xs">
          {editable(row, "abcOverride", row.abc, row.overrides.abc)}
        </td>
        <td className="px-2 py-1.5 text-right text-xs tabular-nums">{row.turnoverSharePct.toFixed(1)}%</td>
        <td className="px-2 py-1.5 text-right text-xs tabular-nums">{row.skuCount}</td>
        <td className="px-2 py-1.5 text-right tabular-nums" title={formatUZS(row.turnover)}>
          {formatUZS(row.turnover, { compact: true })}
        </td>
        <td className="px-2 py-1.5 text-right tabular-nums" title={formatUZS(row.margin)}>
          {formatUZS(row.margin, { compact: true })}
        </td>
        <td className="px-2 py-1.5 text-right text-xs tabular-nums font-medium">{fmtPct(row.frontPct)}</td>
        <td className="px-2 py-1.5 text-right">{editable(row, "promoCompPct", row.promoCompPct, row.overrides.promoComp)}</td>
        <td className="px-2 py-1.5 text-right">{editable(row, "rassrochkaPct", row.rassrochkaPct, row.overrides.rassrochka)}</td>
        <td className="px-2 py-1.5 text-right">{editable(row, "bonusPct", row.bonusPct, row.overrides.bonus)}</td>
        <td className="px-2 py-1.5 text-right">
          <span className="inline-flex items-center gap-1">
            {row.spisaniyeConfidence === "taxminiy" && (
              <Info className="h-3 w-3 text-amber-500" aria-label="taxminiy moslik" />
            )}
            {editable(row, "spisaniyePct", row.spisaniyePct, row.overrides.spisaniye)}
          </span>
        </td>
        <td className={cn("px-2 py-1.5 text-right text-sm font-bold tabular-nums", grossTone(row.grossPct))}>
          {fmtPct(row.grossPct)}
        </td>
      </tr>
    );
  };

  if (data.rows.length === 0) {
    return (
      <div className="shadow-card rounded-2xl border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Bu davrda ma'lumot topilmadi.
      </div>
    );
  }

  return (
    <div className="shadow-card overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-sm font-semibold">Ta'minotchilar ({data.rows.length})</span>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1100px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-muted/40 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              <th className="px-2 py-2 text-right">№</th>
              <th className="px-2 py-2 text-left">Ta'minotchi</th>
              <th className="px-2 py-2 text-left">Brend</th>
              <th className="px-2 py-2 text-center">ABC</th>
              <th className="px-2 py-2 text-right">Ulush</th>
              <th className="px-2 py-2 text-right">SKU</th>
              <th className="px-2 py-2 text-right">Oborot</th>
              <th className="px-2 py-2 text-right">Marja</th>
              <th className="px-2 py-2 text-right">Front</th>
              <th className="px-2 py-2 text-right">Promo</th>
              <th className="px-2 py-2 text-right">Rassrochka</th>
              <th className="px-2 py-2 text-right">Bonus</th>
              <th className="px-2 py-2 text-right">Списание</th>
              <th className="px-2 py-2 text-right">Гросс</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row, i) => (
              <Fragment key={row.supplierId}>
                {renderRow(row, i + 1, false)}
                {expanded.has(row.supplierId) &&
                  row.children?.map((c) => renderRow(c, null, true))}
              </Fragment>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/40 font-semibold">
              <td className="px-2 py-2" />
              <td className="px-2 py-2 text-xs uppercase text-muted-foreground">Jami</td>
              <td />
              <td />
              <td className="px-2 py-2 text-right text-xs tabular-nums">100%</td>
              <td />
              <td className="px-2 py-2 text-right tabular-nums" title={formatUZS(data.totalTurnover)}>
                {formatUZS(data.totalTurnover, { compact: true })}
              </td>
              <td className="px-2 py-2 text-right tabular-nums" title={formatUZS(data.totalMargin)}>
                {formatUZS(data.totalMargin, { compact: true })}
              </td>
              <td className="px-2 py-2 text-right text-xs tabular-nums">
                {data.totalTurnover > 0 ? fmtPct((data.totalMargin / data.totalTurnover) * 100) : "—"}
              </td>
              <td colSpan={4} />
              <td />
            </tr>
          </tfoot>
        </table>
      </div>
      {canEdit && (
        <div className="border-t border-border px-3 py-2 text-[11px] text-muted-foreground">
          Yumshoq ustunlar (Promo, Rassrochka, Bonus, Списание, ABC) tahrirlanadi — katakni bosing.
          Nuqta <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary align-middle" /> — qo'lda kiritilgan;
          xira qiymat — avto-hisoblangan. <Info className="inline h-3 w-3 text-amber-500 align-middle" /> — spisaniye taxminiy moslik.
        </div>
      )}
    </div>
  );
}
