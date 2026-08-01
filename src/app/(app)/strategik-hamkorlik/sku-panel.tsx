"use client";

import { useEffect, useState } from "react";
import { Download, Loader2, Package } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUZS } from "@/lib/format";
import type { SkuNatija } from "@/lib/partnership-sku";
import { skuBreakdownAction } from "./actions";

/** O'sish rangi: musbat yashil, manfiy qizil, o'lchanmagan — xira. */
function delta(pct: number | null): { matn: string; klass: string } {
  if (pct == null) return { matn: "—", klass: "text-muted-foreground/60" };
  const yaxshi = pct >= 0;
  return {
    matn: `${yaxshi ? "+" : ""}${pct.toFixed(1)}%`,
    klass: yaxshi ? "text-primary" : "text-destructive",
  };
}

const oyNomi = (oy: string) => {
  const [y, m] = oy.split("-");
  return `${m}.${y.slice(2)}`;
};

/**
 * Ta'minotchi (yoki brend) ichidagi SKU kesimi. Ma'lumot qator YOYILGANDA so'raladi —
 * barcha ta'minotchinikini oldindan yuklash o'n minglab qator bo'lardi.
 */
export function SkuPanel({
  supplierId,
  agentId,
  periodStart,
  periodEnd,
  colSpan,
}: {
  supplierId: number;
  agentId: number | null;
  periodStart: string;
  periodEnd: string;
  colSpan: number;
}) {
  // Natija SO'ROV KALITI bilan birga saqlanadi va "yuklanmoqda" holati RENDER'da
  // derive qilinadi. Effekt ichida to'g'ridan-to'g'ri `setState` chaqirish shu repoda
  // taqiqlangan (react-hooks/set-state-in-effect = error) — davr yoki qator o'zgarganda
  // eski natijani "tozalash" uchun setState kerak bo'lardi, kalit taqqoslash esa
  // o'sha ehtiyojni umuman yo'q qiladi.
  const kalit = `${supplierId}:${agentId ?? "s"}:${periodStart}:${periodEnd}`;
  const [holat, setHolat] = useState<{ kalit: string; data?: SkuNatija; xato?: string } | null>(null);

  useEffect(() => {
    let tirik = true;
    skuBreakdownAction({ supplierId, agentId, periodStart, periodEnd }).then((r) => {
      if (!tirik) return;
      setHolat(r.ok ? { kalit, data: r.data } : { kalit, xato: r.error });
    });
    return () => {
      tirik = false;
    };
  }, [kalit, supplierId, agentId, periodStart, periodEnd]);

  // Kalit mos kelmasa — bu eski so'rovning natijasi, ko'rsatilmaydi
  const joriy = holat?.kalit === kalit ? holat : null;
  const data = joriy?.data ?? null;
  const xato = joriy?.xato ?? null;

  const eksportUrl =
    `/api/strategik-hamkorlik/sku?supplierId=${supplierId}` +
    `&agentId=${agentId ?? "null"}&start=${periodStart}&end=${periodEnd}`;

  return (
    <tr className="border-b border-border/60 bg-muted/10">
      <td colSpan={colSpan} className="px-3 py-3">
        {xato ? (
          <p className="text-xs text-destructive">{xato}</p>
        ) : !data ? (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> SKU kesimi yuklanmoqda…
          </p>
        ) : data.rows.length === 0 ? (
          <p className="text-xs text-muted-foreground">Bu davrda sotuv bo'lmagan.</p>
        ) : (
          <div className="space-y-2">
            {/* TA'MINOTCHI (yoki brend) DINAMIKASI — SKU jadvalidan OLDIN.
                Bu qatorlar yig'indisi emas: jadval eng katta 500 SKU bilan
                cheklangan, bu yerdagi raqamlar esa BARCHA SKU'dan. */}
            <div className="rounded-lg border border-border/60 bg-background/60 p-2.5">
              <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                <span className="text-xs font-semibold">Oylik dinamika</span>
                <span className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">o&apos;tgan oyga:</span>
                  <span className={cn("font-semibold tabular-nums", delta(data.jami.momPct).klass)}>
                    {delta(data.jami.momPct).matn}
                  </span>
                </span>
                <span className="flex items-center gap-1 text-xs">
                  <span className="text-muted-foreground">o&apos;tgan yilga:</span>
                  <span className={cn("font-semibold tabular-nums", delta(data.jami.yoyPct).klass)}>
                    {delta(data.jami.yoyPct).matn}
                  </span>
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {data.jami.oylar.map((o) => {
                  const eng = Math.max(...data.jami.oylar.map((x) => x.savdo), 1);
                  const oxirgimi = o.oy === data.jami.oxirgiOy;
                  return (
                    <div
                      key={o.oy}
                      className={cn(
                        "min-w-[76px] flex-1 rounded-md border px-2 py-1.5",
                        oxirgimi ? "border-primary/40 bg-primary/[0.06]" : "border-border/50"
                      )}
                      title={`${o.oy}: ${formatUZS(o.savdo)}`}
                    >
                      <div className="text-[10px] text-muted-foreground">{oyNomi(o.oy)}</div>
                      <div className="text-xs font-semibold tabular-nums">
                        {formatUZS(o.savdo, { compact: true })}
                      </div>
                      {/* Ustunlar nisbati — raqamlarni solishtirmasdan tendensiya ko'rinsin */}
                      <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
                        <div
                          className={cn("h-full rounded-full", oxirgimi ? "bg-primary" : "bg-muted-foreground/40")}
                          style={{ width: `${Math.max(2, (o.savdo / eng) * 100)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold">
                <Package className="h-3.5 w-3.5" />
                SKU kesimi ({data.rows.length})
              </span>
              <a
                href={eksportUrl}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2 py-1 text-xs hover:bg-muted"
              >
                <Download className="h-3.5 w-3.5" />
                Excel
              </a>
            </div>

            <div className="overflow-x-auto rounded-lg border border-border/60">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border/60 bg-muted/40 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    <th className="px-2 py-1.5 text-left">SKU</th>
                    <th className="px-2 py-1.5 text-right">Savdo (davr)</th>
                    <th className="px-2 py-1.5 text-right">Ulush</th>
                    <th className="px-2 py-1.5 text-right">Marja</th>
                    {data.oylar.map((o) => (
                      <th key={o} className="px-2 py-1.5 text-right font-medium" title={o}>
                        {oyNomi(o)}
                      </th>
                    ))}
                    <th className="px-2 py-1.5 text-right" title="Oxirgi oy o'tgan oyga nisbatan">
                      O&apos;tgan oy
                    </th>
                    <th className="px-2 py-1.5 text-right" title="Oxirgi oy o'tgan yilning ayni oyiga nisbatan">
                      O&apos;tgan yil
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((r) => {
                    const mom = delta(r.momPct);
                    const yoy = delta(r.yoyPct);
                    return (
                      <tr key={r.productId} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                        <td className="px-2 py-1.5">
                          <div className="max-w-[280px] truncate" title={r.name}>
                            {r.name}
                          </div>
                          <div className="font-mono text-[10px] text-muted-foreground">
                            {r.code}
                            {r.brandName && agentId == null && ` · ${r.brandName}`}
                          </div>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums" title={formatUZS(r.savdo)}>
                          {formatUZS(r.savdo, { compact: true })}
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                          {r.ulushPct.toFixed(1)}%
                        </td>
                        <td className="px-2 py-1.5 text-right tabular-nums">
                          {r.marjaPct != null ? `${r.marjaPct.toFixed(1)}%` : "—"}
                        </td>
                        {r.oylar.map((o) => (
                          <td
                            key={o.oy}
                            className={cn(
                              "px-2 py-1.5 text-right tabular-nums",
                              o.savdo === 0 && "text-muted-foreground/40"
                            )}
                            title={formatUZS(o.savdo)}
                          >
                            {o.savdo === 0 ? "—" : formatUZS(o.savdo, { compact: true })}
                          </td>
                        ))}
                        <td className={cn("px-2 py-1.5 text-right tabular-nums font-medium", mom.klass)}>
                          {mom.matn}
                        </td>
                        <td className={cn("px-2 py-1.5 text-right tabular-nums font-medium", yoy.klass)}>
                          {yoy.matn}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!data.yoyBor && (
              <p className="text-[11px] text-muted-foreground">
                &quot;O&apos;tgan yil&quot; ustuni bo&apos;sh: sotuv tarixi 2026-yanvardan boshlanadi, ya&apos;ni bir yil
                oldingi ma&apos;lumot hali yo&apos;q. Ustun 2027-yanvardan o&apos;zi to&apos;ladi.
              </p>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}
