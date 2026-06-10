"use client";

import { Fragment, useState, useRef, useEffect, useMemo, useTransition } from "react";
import { Loader2, Check, AlertCircle, CalendarDays } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { formatUZS } from "@/lib/format";
import { toast } from "sonner";
import {
  getReceiptMetricsAction,
  upsertReceiptMetricAction,
  type ReceiptMetricCell,
} from "./metrika-actions";

type Branch = { id: number; name: string };
type CellSt = "idle" | "saving" | "saved" | "error";
type Cell = { count: string; items: string; st: CellSt };

const WD = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sha"];
const MONTHS = ["Yanvar", "Fevral", "Mart", "Aprel", "May", "Iyun", "Iyul", "Avgust", "Sentabr", "Oktabr", "Noyabr", "Dekabr"];
const pad = (n: number) => String(n).padStart(2, "0");
const onlyDigits = (s: string) => s.replace(/[^\d]/g, "");

function StatusIcon({ st }: { st: CellSt }) {
  if (st === "saving") return <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />;
  if (st === "saved") return <Check className="h-3 w-3 text-emerald-500" />;
  if (st === "error") return <AlertCircle className="h-3 w-3 text-red-500" />;
  return <span className="inline-block h-3 w-3" />;
}

export function ReceiptMetricsEditor({
  branches,
  initialYear,
  initialMonth,
  initialData,
  initialSales,
  canEdit,
}: {
  branches: Branch[];
  initialYear: number;
  initialMonth: number;
  initialData: Record<string, ReceiptMetricCell>;
  initialSales: Record<string, number>;
  canEdit: boolean;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [cells, setCells] = useState<Record<string, Cell>>(() => buildCells(initialData));
  const [sales, setSales] = useState<Record<string, number>>(initialSales);
  const [loading, startLoad] = useTransition();
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const t = timers;
    return () => { Object.values(t.current).forEach(clearTimeout); };
  }, []);

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const days = useMemo(
    () => Array.from({ length: daysInMonth }, (_, i) => i + 1),
    [daysInMonth]
  );
  const dateStr = (d: number) => `${year}-${pad(month)}-${pad(d)}`;
  const ck = (branchId: number, d: number) => `${branchId}_${dateStr(d)}`;

  const reload = (y: number, m: number) => {
    startLoad(async () => {
      const res = await getReceiptMetricsAction(y, m);
      if (res.ok) { setCells(buildCells(res.data)); setSales(res.sales); }
      else toast.error(res.error);
    });
  };
  const onYear = (y: number) => { setYear(y); reload(y, month); };
  const onMonth = (m: number) => { setMonth(m); reload(year, m); };

  const save = (branchId: number, d: number, count: string, items: string) => {
    const key = ck(branchId, d);
    clearTimeout(timers.current[key]);
    setCells((p) => ({ ...p, [key]: { count, items, st: "saving" } }));
    timers.current[key] = setTimeout(async () => {
      const res = await upsertReceiptMetricAction({
        branchId,
        date: dateStr(d),
        receiptCount: count === "" ? 0 : Number(count),
        itemsPerReceipt: items === "" ? 0 : Number(items),
      });
      setCells((p) => ({ ...p, [key]: { ...(p[key] ?? { count, items, st: "idle" }), st: res.ok ? "saved" : "error" } }));
      if (!res.ok) toast.error(res.error);
    }, 650);
  };
  const onCount = (branchId: number, d: number, raw: string) => {
    const key = ck(branchId, d);
    const count = onlyDigits(raw);
    const items = cells[key]?.items ?? "";
    setCells((p) => ({ ...p, [key]: { count, items, st: "idle" } }));
    save(branchId, d, count, items);
  };
  const onItems = (branchId: number, d: number, raw: string) => {
    const key = ck(branchId, d);
    const items = onlyDigits(raw); // chekdagi tovar soni — butun son
    const count = cells[key]?.count ?? "";
    setCells((p) => ({ ...p, [key]: { count, items, st: "idle" } }));
    save(branchId, d, count, items);
  };

  // Filial bo'yicha jami chek + o'rtacha tovar (oy bo'yicha)
  const totals = useMemo(() => {
    const t: Record<number, { sumCount: number; sumItemsW: number; sumSales: number }> = {};
    for (const b of branches) {
      let sumCount = 0, sumItemsW = 0, sumSales = 0;
      for (const d of days) {
        const c = cells[ck(b.id, d)];
        const cnt = c && c.count !== "" ? Number(c.count) : 0;
        const itm = c && c.items !== "" ? Number(c.items) : 0;
        sumCount += cnt;
        sumItemsW += itm * cnt; // chek soniga vaznlangan o'rtacha
        if (cnt > 0) sumSales += sales[ck(b.id, d)] ?? 0; // faqat chek kiritilgan kunlar
      }
      t[b.id] = { sumCount, sumItemsW, sumSales };
    }
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cells, sales, branches, days, year, month]);

  const yearOpts = [year - 2, year - 1, year, year + 1];
  const NF = new Intl.NumberFormat("uz-UZ");

  return (
    <div className="space-y-3">
      {/* Filtr: oy + yil */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Oy</label>
          <Select items={Object.fromEntries(MONTHS.map((m, i) => [String(i + 1), m]))} value={String(month)} onValueChange={(v) => onMonth(Number(v))}>
            <SelectTrigger className="h-9 w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={m} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Yil</label>
          <Select items={Object.fromEntries(yearOpts.map((y) => [String(y), String(y)]))} value={String(year)} onValueChange={(v) => onYear(Number(v))}>
            <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{yearOpts.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {loading && <Loader2 className="mb-2 h-4 w-4 animate-spin text-muted-foreground" />}
        {!canEdit && <span className="mb-2 text-xs text-muted-foreground">(faqat ko&apos;rish — tahrir System Admin)</span>}
      </div>

      <div className="overflow-x-auto rounded-xl border border-border/60">
        <table className="w-max border-collapse text-sm">
          <thead>
            <tr className="bg-muted/40">
              <th rowSpan={2} className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left text-xs font-medium text-muted-foreground">Sana</th>
              {branches.map((b) => (
                <th key={b.id} colSpan={3} className="border-l border-border/60 px-2 py-1.5 text-center text-xs font-semibold">{b.name}</th>
              ))}
            </tr>
            <tr className="bg-muted/40">
              {branches.map((b) => (
                <Fragment key={b.id}>
                  <th className="w-16 border-l border-border/60 px-1.5 py-1 text-center text-[11px] font-medium text-muted-foreground">Chek</th>
                  <th className="w-16 px-1.5 py-1 text-center text-[11px] font-medium text-muted-foreground">Tovar</th>
                  <th className="w-20 px-1.5 py-1 text-center text-[11px] font-medium text-muted-foreground whitespace-nowrap">O&apos;rt</th>
                </Fragment>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((d) => {
              const wd = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
              const weekend = wd === 0 || wd === 6;
              return (
                <tr key={d} className={cn("border-t border-border/40", weekend && "bg-amber-500/[0.04]")}>
                  <td className="sticky left-0 z-10 bg-card px-3 py-1 text-xs tabular-nums text-muted-foreground whitespace-nowrap">
                    <span className="font-medium text-foreground/80">{d}</span> {WD[wd]}
                  </td>
                  {branches.map((b) => {
                    const c = cells[ck(b.id, d)] ?? { count: "", items: "", st: "idle" as CellSt };
                    const cnt = c.count === "" ? 0 : Number(c.count);
                    const daySales = sales[ck(b.id, d)] ?? 0;
                    const avg = cnt > 0 ? daySales / cnt : null; // o'rt. chek = sotuv / chek soni (avto)
                    const avgTxt = avg != null ? formatUZS(avg, { compact: true }) : "—";
                    return (
                      <Fragment key={b.id}>
                        <td className="border-l border-border/60 px-1.5 py-1">
                          {canEdit ? (
                            <input
                              type="text" inputMode="numeric"
                              aria-label={`${d}-kun — ${b.name} chek soni`}
                              value={c.count}
                              onChange={(e) => onCount(b.id, d, e.target.value)}
                              placeholder="0"
                              className="h-7 w-full rounded-md border border-input/60 bg-background px-1 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          ) : (
                            <span className="block text-right text-xs tabular-nums text-foreground/80">{c.count || "—"}</span>
                          )}
                        </td>
                        <td className="px-1.5 py-1">
                          {canEdit ? (
                            <input
                              type="text" inputMode="numeric"
                              aria-label={`${d}-kun — ${b.name} chekdagi tovar soni`}
                              value={c.items}
                              onChange={(e) => onItems(b.id, d, e.target.value)}
                              placeholder="0"
                              className="h-7 w-full rounded-md border border-input/60 bg-background px-1 text-right text-xs tabular-nums focus:outline-none focus:ring-1 focus:ring-ring"
                            />
                          ) : (
                            <span className="block text-right text-xs tabular-nums text-foreground/80">{c.items || "—"}</span>
                          )}
                        </td>
                        <td className="px-1.5 py-1">
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-right text-xs tabular-nums text-muted-foreground" title={avg != null ? `${Math.round(avg).toLocaleString()} so'm` : "Chek soni kiriting"}>{avgTxt}</span>
                            {canEdit && <StatusIcon st={c.st} />}
                          </div>
                        </td>
                      </Fragment>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-border bg-muted/30 font-semibold">
              <td className="sticky left-0 z-10 bg-muted/30 px-3 py-1.5 text-xs">Jami / o&apos;rtacha</td>
              {branches.map((b) => {
                const t = totals[b.id] ?? { sumCount: 0, sumItemsW: 0, sumSales: 0 };
                const avgItems = t.sumCount > 0 ? t.sumItemsW / t.sumCount : 0;
                const avgReceipt = t.sumCount > 0 ? t.sumSales / t.sumCount : 0;
                return (
                  <Fragment key={b.id}>
                    <td className="border-l border-border/60 px-1.5 py-1.5 text-right text-xs tabular-nums" title="Oylik jami chek">{t.sumCount > 0 ? NF.format(t.sumCount) : "—"}</td>
                    <td className="px-1.5 py-1.5 text-right text-xs tabular-nums text-muted-foreground" title="O'rtacha tovar (chekka vaznlangan)">{avgItems > 0 ? avgItems.toFixed(2) : "—"}</td>
                    <td className="px-1.5 py-1.5 text-right text-xs tabular-nums text-muted-foreground" title="O'rtacha chek (oylik sotuv / chek)">{avgReceipt > 0 ? formatUZS(avgReceipt, { compact: true }) : "—"}</td>
                  </Fragment>
                );
              })}
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CalendarDays className="h-3.5 w-3.5" />
        Chek soni va chekdagi tovar soni qo&apos;lda kiritiladi (avto-saqlash). O&apos;rt. chek = kunlik sotuv ÷ chek soni — avtomatik hisoblanadi. Hafta oxiri sariq fonda.
      </p>
    </div>
  );
}

function buildCells(data: Record<string, ReceiptMetricCell>): Record<string, Cell> {
  const out: Record<string, Cell> = {};
  for (const [k, v] of Object.entries(data)) {
    out[k] = {
      count: v.receiptCount ? String(v.receiptCount) : "",
      items: v.itemsPerReceipt ? String(v.itemsPerReceipt) : "",
      st: "idle",
    };
  }
  return out;
}
