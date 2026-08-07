"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import {
  Filter,
  Search,
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
import { ChekKorinish } from "./chek-korinish";
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

/** Turlar BOSHQARILADI (PaymentKindDef) — nom va rang serverdan keladi. */
type KindOpt = { code: string; name: string; pill: string };
type TaqsimotQator = KindOpt & { bar: string; summa: number };

export function CheklarClient({
  rows,
  branches,
  filters,
  toliqmi,
  bogliqsiz,
  taqsimot,
  kinds,
}: {
  rows: Row[];
  branches: { id: number; name: string }[];
  filters: { from: string; to: string; branch: number | null; kind: string | null; q: string };
  toliqmi: boolean;
  bogliqsiz: number;
  taqsimot: TaqsimotQator[];
  kinds: KindOpt[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tanlangan, setTanlangan] = useState<Row | null>(null);
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

  const jami = taqsimot.reduce((s, t) => s + t.summa, 0);
  // Ro'yxatda yo'q kod (turi o'chirilgan eski chek) — kodning o'zi ko'rsatiladi.
  const turlar = new Map(kinds.map((k) => [k.code, k]));
  const turOl = (code: string): KindOpt =>
    turlar.get(code) ?? { code, name: code, pill: "bg-muted text-muted-foreground" };

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
              {taqsimot.map((t) =>
                t.summa > 0 ? (
                  <div
                    key={t.code}
                    className={t.bar}
                    style={{ width: `${(t.summa / jami) * 100}%` }}
                    title={`${t.name}: ${formatUZS(t.summa)}`}
                  />
                ) : null
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {taqsimot.map((t) =>
                t.summa > 0 ? (
                  <span key={t.code} className="tabular-nums">
                    <span className="text-muted-foreground">{t.name}:</span>{" "}
                    <b>{formatUZS(t.summa)}</b>{" "}
                    <span className="text-muted-foreground">
                      ({((t.summa / jami) * 100).toFixed(1)}%)
                    </span>
                  </span>
                ) : null
              )}
            </div>
            {(taqsimot.find((t) => t.code === "OTHER")?.summa ?? 0) > 0 && (
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
              {kinds.map((k) => (
                <option key={k.code} value={k.code}>
                  {k.name}
                </option>
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
              const stornoBor = r.lines.some((l) => l.storno !== 0);
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setTanlangan(r)}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl border border-border bg-card/50 px-3 py-2 text-left transition-colors hover:border-primary/40 hover:bg-card",
                    stornoBor && "border-destructive/30"
                  )}
                >
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
                      const t = turOl(p.kind);
                      return (
                        <Pill key={p.id} className={t.pill}>
                          {t.name}
                        </Pill>
                      );
                    })}
                    {r.lines.some((l) => !l.matched) && (
                      <Pill className="gap-1 bg-amber-500/15 text-amber-700 dark:text-amber-400">
                        SKU
                      </Pill>
                    )}
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
                </button>
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

      {tanlangan && (
        <ChekKorinish
          chek={tanlangan}
          onClose={() => setTanlangan(null)}
          turNomi={(code: string) => turOl(code).name}
        />
      )}
    </div>
  );
}
