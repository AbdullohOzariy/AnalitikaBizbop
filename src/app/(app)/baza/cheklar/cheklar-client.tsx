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
import { vaqtMatn } from "./chek-analitika";
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
  closeAt: string | null;
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

export type Filtrlar = {
  from: string;
  to: string;
  branch: number | null;
  kassa: string | null;
  kassir: number | null;
  kind: string | null;
  soatDan: number | null;
  soatGacha: number | null;
  q: string;
  storno: boolean;
  skuYoq: boolean;
};

export function CheklarClient({
  rows,
  branches,
  kassirlar,
  kassalar,
  filters,
  jami: jamiChek,
  korsatilgan,
  bogliqsiz,
  taqsimot,
  kinds,
}: {
  rows: Row[];
  branches: { id: number; name: string }[];
  kassirlar: { id: number; nom: string }[];
  kassalar: { kalit: string; nom: string }[];
  filters: Filtrlar;
  jami: number;
  korsatilgan: number;
  bogliqsiz: number;
  taqsimot: TaqsimotQator[];
  kinds: KindOpt[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [tanlangan, setTanlangan] = useState<Row | null>(null);
  const [q, setQ] = useState(filters.q);

  // Bitta filtr o'zgarganda QOLGANLARI SAQLANADI — aks holda kassirni
  // tanlagach sana yoki soat oralig'i tushib qolardi.
  const apply = (patch: Partial<Filtrlar>) => {
    const n = { ...filters, ...patch };
    const p = new URLSearchParams();
    p.set("from", n.from);
    p.set("to", n.to);
    if (n.branch) p.set("branch", String(n.branch));
    if (n.kassa) p.set("kassa", n.kassa);
    if (n.kassir != null) p.set("kassir", String(n.kassir));
    if (n.kind) p.set("kind", n.kind);
    if (n.soatDan != null) p.set("soatDan", String(n.soatDan));
    if (n.soatGacha != null) p.set("soatGacha", String(n.soatGacha));
    if (n.q) p.set("q", n.q);
    if (n.storno) p.set("storno", "1");
    if (n.skuYoq) p.set("skuYoq", "1");
    router.push(`${pathname}?${p}`);
  };

  const faolFiltr =
    filters.branch != null || filters.kassa != null || filters.kassir != null ||
    filters.kind != null || filters.soatDan != null || filters.soatGacha != null ||
    !!filters.q || filters.storno || filters.skuYoq;

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
        <CardContent className="space-y-3 py-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex h-8 items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              Filtr
            </div>
            <Maydon l="Dan">
              <Input type="date" value={filters.from}
                onChange={(e) => apply({ from: e.target.value })}
                className="h-8 w-[145px] text-xs" />
            </Maydon>
            <Maydon l="Gacha">
              <Input type="date" value={filters.to}
                onChange={(e) => apply({ to: e.target.value })}
                className="h-8 w-[145px] text-xs" />
            </Maydon>
            <Maydon l="Filial">
              <Tanlov value={filters.branch} onChange={(v) => apply({ branch: v })}
                opts={branches.map((b) => ({ v: b.id, l: b.name }))} w="w-[150px]" />
            </Maydon>
            <Maydon l="Kassa">
              <select
                value={filters.kassa ?? ""}
                onChange={(e) => apply({ kassa: e.target.value || null })}
                className="h-8 w-[170px] rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Barchasi</option>
                {kassalar.map((k) => (
                  <option key={k.kalit} value={k.kalit}>{k.nom}</option>
                ))}
              </select>
            </Maydon>
            <Maydon l="Kassir">
              <Tanlov value={filters.kassir} onChange={(v) => apply({ kassir: v })}
                opts={kassirlar.map((k) => ({ v: k.id, l: k.nom }))} w="w-[170px]" />
            </Maydon>
            <Maydon l="To'lov">
              <select
                value={filters.kind ?? ""}
                onChange={(e) => apply({ kind: e.target.value || null })}
                className="h-8 w-[120px] rounded-md border border-input bg-background px-2 text-xs"
              >
                <option value="">Barchasi</option>
                {kinds.map((k) => (
                  <option key={k.code} value={k.code}>{k.name}</option>
                ))}
              </select>
            </Maydon>
            <Maydon l="Soat">
              <div className="flex items-center gap-1">
                <Tanlov value={filters.soatDan} onChange={(v) => apply({ soatDan: v })}
                  opts={SOATLAR} w="w-[72px]" bosh="dan" />
                <span className="text-xs text-muted-foreground">–</span>
                <Tanlov value={filters.soatGacha} onChange={(v) => apply({ soatGacha: v })}
                  opts={SOATLAR} w="w-[72px]" bosh="gacha" />
              </div>
            </Maydon>
            <div className="relative min-w-[190px] flex-1">
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
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Belgi on={filters.storno} onClick={() => apply({ storno: !filters.storno })}>
              <Undo2 className="h-3 w-3" />
              Bekor qilingan qatori bor
            </Belgi>
            <Belgi on={filters.skuYoq} onClick={() => apply({ skuYoq: !filters.skuYoq })}>
              <AlertTriangle className="h-3 w-3" />
              SKU topilmagan
            </Belgi>
            {faolFiltr && (
              <Button
                variant="ghost" size="sm"
                onClick={() => { setQ(""); router.push(`${pathname}?from=${filters.from}&to=${filters.to}`); }}
                className="h-7 text-xs text-muted-foreground"
              >
                Tozalash
              </Button>
            )}
            <span className="ml-auto text-xs text-muted-foreground">
              <b className="text-foreground">{jamiChek.toLocaleString("uz-UZ")}</b> chek topildi
            </span>
          </div>
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
                    {r.closeAt && (
                      <span className="ml-2 tabular-nums opacity-70">
                        {vaqtMatn(
                          (new Date(r.closeAt).getTime() - new Date(r.openAt).getTime()) / 1000
                        )}
                      </span>
                    )}
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
            {korsatilgan < jamiChek && (
              <p className="pt-2 text-center text-[11px] text-muted-foreground">
                {jamiChek.toLocaleString("uz-UZ")} chekdan oxirgi{" "}
                {korsatilgan.toLocaleString("uz-UZ")} tasi ko&apos;rsatilmoqda — davrni
                toraytiring yoki filtrlardan foydalaning
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

const SOATLAR = Array.from({ length: 24 }, (_, i) => ({
  v: i,
  l: `${String(i).padStart(2, "0")}:00`,
}));

function Maydon({ l, children }: { l: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="text-[11px] text-muted-foreground">{l}</Label>
      {children}
    </div>
  );
}

function Tanlov({
  value, onChange, opts, w, bosh = "Barchasi",
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  opts: { v: number; l: string }[];
  w: string;
  bosh?: string;
}) {
  return (
    <select
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
      className={cn("h-8 rounded-md border border-input bg-background px-2 text-xs", w)}
    >
      <option value="">{bosh}</option>
      {opts.map((o) => (
        <option key={o.v} value={o.v}>{o.l}</option>
      ))}
    </select>
  );
}

function Belgi({
  on, onClick, children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition-colors",
        on
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}
