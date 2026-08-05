"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  ChevronDown,
  Filter,
  Search,
  Banknote,
  CreditCard,
  ArrowLeftRight,
  CircleHelp,
  AlertTriangle,
  Undo2,
  ReceiptText,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pill, EmptyState } from "@/components/common/page";
import { formatUZS, formatDateTimeUZ } from "@/lib/format";
import { cn } from "@/lib/utils";

type Payment = { id: number; name: string; kind: string; value: number };
type Line = {
  id: number;
  lineNo: number;
  itemCode: number | null;
  matched: boolean;
  name: string;
  barcode: string | null;
  qty: number;
  storno: number;
  sum: number;
  sumWD: number;
  totalSum: number;
};

type Row = {
  id: number;
  shop: number;
  pos: number;
  number: string;
  session: number;
  openAt: string;
  businessDate: string;
  type: number;
  status: string;
  card: string | null;
  cashierName: string | null;
  qtyPositions: number;
  sum: number;
  sumWithDiscs: number;
  totalSum: number;
  branchName: string | null;
  payments: Payment[];
  lines: Line[];
};

const KIND_META: Record<string, { l: string; icon: typeof Banknote; tone: string }> = {
  CASH: { l: "naqd", icon: Banknote, tone: "bg-primary/10 text-primary" },
  CARD: { l: "plastik", icon: CreditCard, tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  TRANSFER: { l: "o'tkazma", icon: ArrowLeftRight, tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400" },
  OTHER: { l: "boshqa", icon: CircleHelp, tone: "bg-muted text-muted-foreground" },
};

export function CheklarClient({
  rows,
  branches,
  filters,
  toliqmi,
  bogliqsiz,
  tolovlar,
}: {
  rows: Row[];
  branches: { id: number; name: string }[];
  filters: { from: string; to: string; branch: number | null; kind: string | null; q: string };
  toliqmi: boolean;
  bogliqsiz: number;
  tolovlar: { naqd: number; plastik: number; otkazma: number; boshqa: number };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [openId, setOpenId] = useState<number | null>(null);
  const [q, setQ] = useState(filters.q);

  const apply = (patch: Partial<typeof filters>) => {
    const p = new URLSearchParams();
    p.set("from", patch.from ?? filters.from);
    p.set("to", patch.to ?? filters.to);
    const b = patch.branch !== undefined ? patch.branch : filters.branch;
    const k = patch.kind !== undefined ? patch.kind : filters.kind;
    const s = patch.q !== undefined ? patch.q : filters.q;
    if (b) p.set("branch", String(b));
    if (k) p.set("kind", k);
    if (s) p.set("q", s);
    router.push(`${pathname}?${p}`);
  };

  const jami = tolovlar.naqd + tolovlar.plastik + tolovlar.otkazma + tolovlar.boshqa;

  return (
    <div className="space-y-4">
      {/* ── To'lov taqsimoti ── */}
      {jami > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="mb-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              To&apos;lov taqsimoti
            </div>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-muted">
              {(
                [
                  ["CASH", tolovlar.naqd, "bg-primary"],
                  ["CARD", tolovlar.plastik, "bg-blue-500"],
                  ["TRANSFER", tolovlar.otkazma, "bg-violet-500"],
                  ["OTHER", tolovlar.boshqa, "bg-muted-foreground/50"],
                ] as const
              ).map(([k, v, cls]) =>
                v > 0 ? (
                  <div
                    key={k}
                    className={cls}
                    style={{ width: `${(v / jami) * 100}%` }}
                    title={`${KIND_META[k].l}: ${formatUZS(v)}`}
                  />
                ) : null
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {(
                [
                  ["CASH", tolovlar.naqd],
                  ["CARD", tolovlar.plastik],
                  ["TRANSFER", tolovlar.otkazma],
                  ["OTHER", tolovlar.boshqa],
                ] as const
              ).map(([k, v]) =>
                v > 0 ? (
                  <span key={k} className="tabular-nums">
                    <span className="text-muted-foreground">{KIND_META[k].l}:</span>{" "}
                    <b>{formatUZS(v)}</b>{" "}
                    <span className="text-muted-foreground">({((v / jami) * 100).toFixed(1)}%)</span>
                  </span>
                ) : null
              )}
            </div>
            {tolovlar.boshqa > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                «boshqa» — turi tasdiqlanmagan to&apos;lovlar.{" "}
                <Link href="/admin/sozlamalar" className="underline">
                  Sozlamalarda belgilang
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Filtrlar ── */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Filtr
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Dan</Label>
            <Input type="date" defaultValue={filters.from} onChange={(e) => apply({ from: e.target.value })} className="h-8 w-[150px] text-xs" />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Gacha</Label>
            <Input type="date" defaultValue={filters.to} onChange={(e) => apply({ to: e.target.value })} className="h-8 w-[150px] text-xs" />
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Filial</Label>
            <select
              defaultValue={filters.branch ? String(filters.branch) : ""}
              onChange={(e) => apply({ branch: e.target.value ? Number(e.target.value) : null })}
              className="h-8 w-[160px] rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">Barchasi</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">To&apos;lov</Label>
            <select
              defaultValue={filters.kind ?? ""}
              onChange={(e) => apply({ kind: e.target.value || null })}
              className="h-8 w-[130px] rounded-md border border-input bg-background px-2 text-xs"
            >
              <option value="">Barchasi</option>
              {Object.entries(KIND_META).map(([k, v]) => (
                <option key={k} value={k}>{v.l}</option>
              ))}
            </select>
          </div>
          <div className="relative min-w-[200px] flex-1">
            <Label className="text-[11px] text-muted-foreground">Qidiruv</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && apply({ q })}
                placeholder="chek №, karta, kassir, tovar, shtrix-kod"
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
          {(filters.q || filters.branch || filters.kind) && (
            <Button variant="ghost" size="sm" onClick={() => { setQ(""); router.push(`${pathname}?from=${filters.from}&to=${filters.to}`); }} className="h-8 text-xs">
              Tozalash
            </Button>
          )}
        </CardContent>
      </Card>

      {bogliqsiz > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2.5 text-xs">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            <b>{bogliqsiz.toLocaleString("uz-UZ")} ta</b> chek filialga biriktirilmagan —
            1C do&apos;kon raqami noma&apos;lum.{" "}
            <Link href="/admin/sozlamalar" className="underline">Sozlamalarda biriktiring</Link>
          </span>
        </div>
      )}

      {/* ── Ro'yxat ── */}
      {rows.length === 0 ? (
        <EmptyState icon={ReceiptText} title="Chek yo'q" description="Tanlangan davr va filtrlar bo'yicha chek topilmadi." />
      ) : (
        <Card>
          <CardContent className="space-y-1 py-3">
            {rows.map((r) => {
              const open = openId === r.id;
              const stornoBor = r.lines.some((l) => l.storno !== 0);
              return (
                <div
                  key={r.id}
                  className={cn(
                    "rounded-xl border border-border bg-card/50 transition-colors",
                    open && "border-primary/40 bg-card",
                    stornoBor && "border-destructive/30"
                  )}
                >
                  <button type="button" onClick={() => setOpenId(open ? null : r.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
                    <span className="w-[120px] shrink-0 text-xs text-muted-foreground">
                      {formatDateTimeUZ(r.openAt)}
                    </span>
                    <span className="w-[70px] shrink-0 text-sm font-medium">№{r.number}</span>
                    <span className="hidden w-[120px] shrink-0 truncate text-xs sm:block">
                      {r.branchName ?? <span className="text-amber-600">shop {r.shop}</span>}
                    </span>
                    <span className="hidden flex-1 truncate text-xs text-muted-foreground md:block">
                      {r.cashierName ?? "—"}
                    </span>
                    <span className="flex shrink-0 gap-1">
                      {r.payments.map((p) => {
                        const m = KIND_META[p.kind] ?? KIND_META.OTHER;
                        const Icon = m.icon;
                        return (
                          <Pill key={p.id} className={cn("gap-1", m.tone)}>
                            <Icon className="h-3 w-3" />
                            {m.l}
                          </Pill>
                        );
                      })}
                      {stornoBor && (
                        <Pill className="gap-1 bg-destructive/10 text-destructive">
                          <Undo2 className="h-3 w-3" />
                          storno
                        </Pill>
                      )}
                    </span>
                    <span className="w-[110px] shrink-0 text-right text-sm font-bold tabular-nums">
                      {formatUZS(r.totalSum)}
                    </span>
                    <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
                  </button>

                  {open && (
                    <div className="space-y-3 border-t border-border px-3 py-3">
                      <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                        <F l="Do'kon / kassa" v={`shop ${r.shop} · pos ${r.pos} · smena ${r.session}`} />
                        <F l="Hisobot kuni" v={r.businessDate} />
                        <F l="Holat" v={`${r.status} · tur ${r.type}`} />
                        <F l="Karta" v={r.card ?? "—"} />
                        <F l="Qatorlar" v={String(r.qtyPositions)} />
                        <F l="Chegirmagacha" v={formatUZS(r.sum)} />
                      </div>

                      <div>
                        <div className="mb-1 text-[11px] font-medium text-muted-foreground">To&apos;lovlar</div>
                        <div className="flex flex-wrap gap-2">
                          {r.payments.map((p) => (
                            <span key={p.id} className="rounded-lg bg-muted/50 px-2.5 py-1 text-xs">
                              «{p.name}» → <b>{KIND_META[p.kind]?.l ?? p.kind}</b> · {formatUZS(p.value)}
                            </span>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                          Qatorlar — SKU topilmagan qatorlar sariq bilan
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full min-w-[520px] text-xs">
                            <thead className="text-[10px] uppercase tracking-wide text-muted-foreground">
                              <tr>
                                <th className="w-6 pb-1 text-left">#</th>
                                <th className="pb-1 text-left">Tovar</th>
                                <th className="w-20 pb-1 text-right">Miqdor</th>
                                <th className="w-24 pb-1 text-right">Summa</th>
                                <th className="w-24 pb-1 text-right">Chegirma b/n</th>
                              </tr>
                            </thead>
                            <tbody>
                              {r.lines.map((l) => (
                                <tr key={l.id} className={cn("border-t border-border/50", !l.matched && "bg-amber-500/[0.07]")}>
                                  <td className="py-1 text-muted-foreground">{l.lineNo}</td>
                                  <td className="py-1">
                                    <div className="truncate">{l.name}</div>
                                    <div className="text-[10px] text-muted-foreground">
                                      kod {l.itemCode ?? "—"} · {l.barcode ?? "shtrix-kodsiz"}
                                      {!l.matched && <span className="ml-1 text-amber-600">SKU topilmadi</span>}
                                      {l.storno !== 0 && <span className="ml-1 text-destructive">storno</span>}
                                    </div>
                                  </td>
                                  <td className="py-1 text-right tabular-nums">{l.qty}</td>
                                  <td className="py-1 text-right tabular-nums">{formatUZS(l.sum)}</td>
                                  <td className="py-1 text-right tabular-nums font-medium">{formatUZS(l.sumWD)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {!toliqmi && (
              <p className="pt-2 text-center text-[11px] text-muted-foreground">
                Oxirgi 100 ta ko&apos;rsatilmoqda — davrni toraytiring yoki qidiruvdan foydalaning
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function F({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 text-muted-foreground">{l}:</span>
      <span className="min-w-0 truncate">{v}</span>
    </div>
  );
}
