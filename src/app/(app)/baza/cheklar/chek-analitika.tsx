"use client";

import { useState } from "react";
import { Clock, Users, Monitor, AlertTriangle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";

export type SoatQator = {
  soat: number;
  cheklar: number;
  tushum: number;
  ortVaqt: number | null;
};
export type KesimQator = {
  id: number | null;
  nom: string;
  cheklar: number;
  tushum: number;
  ortChek: number;
  ortTur: number;
  ortVaqt: number | null;
  stornoUlush: number;
};

type Tab = "soat" | "kassir" | "kassa";

/** Sekundni odam o'qiydigan ko'rinishga. */
export function vaqtMatn(s: number | null): string {
  if (s == null) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.floor(s / 60)}m ${String(Math.round(s % 60)).padStart(2, "0")}s`;
}

/**
 * Cheklar bo'limining o'z analitikasi.
 *
 * ⚠️ Faqat shu sahifa uchun: 1C ma'lumoti sinov bosqichida, boshqa hisobotlarga
 * ulanmagan.
 *
 * XIZMAT VAQTI — chek ochilishidan fiskallashtirilgunicha o'tgan payt.
 * Yopilish vaqti 1C dan kelmaydi, fiskal havoladan olinadi (`chek.ts:fiskalVaqt`),
 * shuning uchun qamrov 100% bo'lmasligi mumkin — pastda ochiq ko'rsatiladi.
 */
export function ChekAnalitika({
  soatlar,
  kassirlar,
  kassalar,
  stornoCheklar,
  jamiCheklar,
  vaqtQamrovi,
}: {
  soatlar: SoatQator[];
  kassirlar: KesimQator[];
  kassalar: KesimQator[];
  stornoCheklar: number;
  jamiCheklar: number;
  vaqtQamrovi: number;
}) {
  const [tab, setTab] = useState<Tab>("soat");

  if (jamiCheklar === 0) return null;

  const maxChek = Math.max(1, ...soatlar.map((s) => s.cheklar));
  const pikSoat = soatlar.reduce<SoatQator | null>(
    (a, b) => (a && a.cheklar >= b.cheklar ? a : b),
    null,
  );

  const TABS: { v: Tab; l: string; icon: typeof Clock }[] = [
    { v: "soat", l: "Soatlik oqim", icon: Clock },
    { v: "kassir", l: `Kassirlar (${kassirlar.length})`, icon: Users },
    { v: "kassa", l: `Kassalar (${kassalar.length})`, icon: Monitor },
  ];

  return (
    <Card>
      <CardContent className="space-y-4 py-4">
        <div className="flex flex-wrap items-center gap-2">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.v}
                type="button"
                onClick={() => setTab(t.v)}
                className={cn(
                  "inline-flex h-8 items-center gap-1.5 rounded-lg border px-3 text-xs font-medium transition-colors",
                  tab === t.v
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.l}
              </button>
            );
          })}

          <div className="ml-auto flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
            {pikSoat && (
              <span>
                Pik: <b className="text-foreground">{pikSoat.soat}:00</b> —{" "}
                {pikSoat.cheklar.toLocaleString("uz-UZ")} chek
              </span>
            )}
            {stornoCheklar > 0 && (
              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3 w-3" />
                {stornoCheklar.toLocaleString("uz-UZ")} chekda bekor qilingan
                qator ({((stornoCheklar / jamiCheklar) * 100).toFixed(1)}%)
              </span>
            )}
          </div>
        </div>

        {tab === "soat" && (
          <div className="space-y-1">
            {soatlar.length === 0 ? (
              <Bosh />
            ) : (
              soatlar.map((s) => (
                <div key={s.soat} className="flex items-center gap-2 text-xs">
                  <span className="w-12 shrink-0 tabular-nums text-muted-foreground">
                    {String(s.soat).padStart(2, "0")}:00
                  </span>
                  <div className="h-5 min-w-0 flex-1 overflow-hidden rounded bg-muted">
                    <div
                      className="flex h-full items-center rounded bg-primary/70 px-2"
                      style={{
                        width: `${Math.max(4, (s.cheklar / maxChek) * 100)}%`,
                      }}
                    >
                      <span className="truncate text-[10px] font-semibold text-primary-foreground">
                        {s.cheklar}
                      </span>
                    </div>
                  </div>
                  <span className="w-24 shrink-0 text-right tabular-nums">
                    {formatUZS(s.tushum, { compact: true })}
                  </span>
                  <span className="hidden w-16 shrink-0 text-right tabular-nums text-muted-foreground sm:block">
                    {vaqtMatn(s.ortVaqt)}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {(tab === "kassir" || tab === "kassa") && (
          <Jadval rows={tab === "kassir" ? kassirlar : kassalar} />
        )}

        <p className="text-[11px] text-muted-foreground">
          Xizmat vaqti — chek ochilishidan fiskallashtirilgunicha.{" "}
          {vaqtQamrovi >= 0.999
            ? "Barcha cheklarda o'lchangan."
            : `Cheklarning ${(vaqtQamrovi * 100).toFixed(0)}% ida o'lchangan (qolganida fiskal havola yo'q).`}
        </p>
      </CardContent>
    </Card>
  );
}

function Jadval({ rows }: { rows: KesimQator[] }) {
  if (rows.length === 0) return <Bosh />;
  const maxTushum = Math.max(1, ...rows.map((r) => r.tushum));

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-xs">
        <thead>
          <tr className="border-b border-border text-[11px] uppercase tracking-wide text-muted-foreground">
            <th className="px-2 py-2 text-left font-medium">Nom</th>
            <th className="px-2 py-2 text-right font-medium">Cheklar</th>
            <th className="px-2 py-2 text-right font-medium">Tushum</th>
            <th className="px-2 py-2 text-right font-medium">
              O&apos;rt. chek
            </th>
            <th className="px-2 py-2 text-right font-medium">Tovar/chek</th>
            <th className="px-2 py-2 text-right font-medium">Xizmat</th>
            <th className="px-2 py-2 text-right font-medium">Storno</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border/60">
          {rows.map((r) => (
            <tr key={`${r.id ?? "yoq"}-${r.nom}`} className="hover:bg-muted/40">
              <td className="max-w-[220px] px-2 py-2">
                <div className="truncate font-medium">{r.nom}</div>
                <div className="mt-1 h-1 w-full overflow-hidden rounded bg-muted">
                  <div
                    className="h-full rounded bg-primary/60"
                    style={{ width: `${(r.tushum / maxTushum) * 100}%` }}
                  />
                </div>
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {r.cheklar.toLocaleString("uz-UZ")}
              </td>
              <td className="px-2 py-2 text-right font-medium tabular-nums">
                {formatUZS(r.tushum, { compact: true })}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {formatUZS(r.ortChek, { compact: true })}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {r.ortTur.toFixed(1)}
              </td>
              <td className="px-2 py-2 text-right tabular-nums">
                {vaqtMatn(r.ortVaqt)}
              </td>
              <td
                className={cn(
                  "px-2 py-2 text-right tabular-nums",
                  r.stornoUlush >= 0.15 &&
                    "font-semibold text-amber-600 dark:text-amber-400",
                )}
              >
                {(r.stornoUlush * 100).toFixed(1)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const Bosh = () => (
  <p className="py-6 text-center text-sm text-muted-foreground">
    Tanlangan davr va filtrlar bo&apos;yicha ma&apos;lumot yo&apos;q.
  </p>
);
