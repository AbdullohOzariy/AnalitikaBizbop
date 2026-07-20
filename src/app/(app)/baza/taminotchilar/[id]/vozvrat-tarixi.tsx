"use client";

import { Recycle, WifiOff, AlertTriangle, PackageSearch, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Pill } from "@/components/common/page";
import { formatUZS, formatPercent } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SupplierVozvratlar, VozvratQator } from "../actions";

/**
 * `vaqt` — bizbop bazasidan naive vaqt ("2026-01-05T10:23:11"), ALLAQACHON Toshkent
 * devoriy vaqti. `formatDateTimeUZ` ISHLATILMAYDI — u qo'shimcha +5s offset qo'shadi
 * va vaqtni buzadi. Shu sabab `vozvrat-card.tsx` dagi `fmtDateTime` naqshiga ergashib
 * oddiy satr kesish qilinadi (namuna: src/app/(app)/chiqim/vozvratlar/vozvrat-card.tsx).
 */
function fmtVaqt(s: string): string {
  return s.slice(0, 16).replace("T", " ");
}

function ConfidenceBadge({ c }: { c: VozvratQator["confidence"] }) {
  if (c === "aniq") {
    return (
      <span title="Aniq moslik — SKU kodi yoki ID orqali bevosita bog'langan.">
        <Pill tone="green" className="px-1.5 py-0 text-[10px]">aniq</Pill>
      </span>
    );
  }
  if (c === "taxminiy") {
    return (
      <span title="Taxminiy moslik — ta'minotchi nomi erkin matn bo'yicha taxminan bog'langan (imlo farqlari bo'lishi mumkin). Bu raqamga to'liq ishonmang.">
        <Pill tone="amber" className="gap-1 px-1.5 py-0 text-[10px]">
          <AlertTriangle className="h-2.5 w-2.5" /> taxminiy
        </Pill>
      </span>
    );
  }
  return (
    <span title="Moslik aniqlanmagan.">
      <Pill tone="muted" className="px-1.5 py-0 text-[10px]">aniqlanmagan</Pill>
    </span>
  );
}

function MiniStat({
  label, value, hint, tone,
}: { label: string; value: string; hint?: string; tone?: "amber" }) {
  return (
    <div className={cn("rounded-xl border border-border bg-card p-3", tone === "amber" && "border-amber-500/40 bg-amber-500/5")}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums">{value}</p>
      {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

/** Postavshik profilidagi vozvrat tarixi — KPI, top SKU'lar va to'liq ro'yxat.
 *  `data === null` — bot bazasi ulanmagan yoki xato (aniq `error` matni ko'rsatiladi). */
export function VozvratTarixiSection({
  data,
  error,
}: {
  data: SupplierVozvratlar | null;
  error?: string | null;
}) {
  const qamrovPct = data && data.qamrov.jami > 0
    ? Math.round((data.qamrov.biriktirilgan / data.qamrov.jami) * 100)
    : null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-1.5 text-base">
            <Recycle className="h-4 w-4 text-muted-foreground" /> Vozvrat tarixi
            {data && <span className="text-xs font-normal text-muted-foreground">· {data.jamiSoni.toLocaleString("uz-UZ")} ta</span>}
          </CardTitle>
          {qamrovPct != null && (
            <span
              title={`Bu ko'rsatkich BUTUN bazadagi barcha vozvratlar bo'yicha global qamrov (${data!.qamrov.biriktirilgan.toLocaleString("uz-UZ")} / ${data!.qamrov.jami.toLocaleString("uz-UZ")} ta biriktirilgan) — faqat shu ta'minotchiga tegishli emas.`}
            >
              <Pill tone="blue" className="gap-1">
                <Info className="h-3 w-3" /> {qamrovPct}% biriktirilgan (global)
              </Pill>
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Vozvratlar ta&apos;minotchi nomi bo&apos;yicha taxminan biriktiriladi (erkin matn, imlo farqlari bo&apos;lishi mumkin) —
          miniappga qo&apos;shilgan ta&apos;minotchi pikeri tufayli yangi yozuvlar aniq bog&apos;lanadi.
        </p>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border px-6 py-8 text-center">
            <WifiOff className="h-5 w-5 text-muted-foreground" />
            <p className="text-xs text-muted-foreground">{error}</p>
          </div>
        ) : !data || data.jamiSoni === 0 ? (
          <p className="py-4 text-center text-xs italic text-muted-foreground">Vozvrat tarixi topilmadi.</p>
        ) : (
          <div className="space-y-4">
            {/* KPI */}
            <div className="grid gap-3 sm:grid-cols-3">
              <MiniStat label="Vozvrat soni" value={data.jamiSoni.toLocaleString("uz-UZ")} />
              <MiniStat label="Vozvrat summasi" value={formatUZS(data.jamiSumma, { compact: true })} />
              <MiniStat
                label="Vozvrat ulushi"
                value={data.vozvratUlushi != null ? formatPercent(data.vozvratUlushi * 100) : "—"}
                hint={data.davr ? `${data.davr.start} – ${data.davr.end} davri uchun` : "savdo ma'lumoti yo'q"}
                tone={data.vozvratUlushi != null && data.vozvratUlushi > 0.05 ? "amber" : undefined}
              />
            </div>

            {/* Top SKU */}
            {data.topSkular.length > 0 && (
              <div>
                <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <PackageSearch className="h-3.5 w-3.5" /> Eng ko&apos;p qaytadigan SKU&apos;lar
                </p>
                <div className="overflow-hidden rounded-xl border border-border">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                        <th className="px-3 py-1.5 font-semibold">Tovar</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Soni</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Summa</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.topSkular.map((s, i) => (
                        <tr key={`${s.tovar}-${i}`} className="border-b border-border/40 last:border-0">
                          <td className="max-w-[280px] truncate px-3 py-1.5" title={s.tovar}>
                            {s.skuKod != null && (
                              <span className="mr-1.5 rounded bg-background px-1 font-mono text-[10px] text-muted-foreground">{s.skuKod}</span>
                            )}
                            {s.tovar}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{s.soni.toLocaleString("uz-UZ")}</td>
                          <td className="px-2 py-1.5 text-right font-medium tabular-nums">{formatUZS(s.summa, { compact: true })}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* To'liq tarix */}
            <div>
              <p className="mb-1.5 text-xs font-semibold text-muted-foreground">Barcha vozvratlar</p>

              {/* Desktop — jadval (md+), balandligi cheklangan (yuzlab qator sahifani cho'zib yubormasin) */}
              <div className="hidden max-h-[480px] overflow-y-auto rounded-xl border border-border md:block">
                <table className="w-full min-w-[760px] text-left text-xs">
                  <thead className="sticky top-0 z-10 bg-card">
                    <tr className="border-b border-border bg-muted/40 text-muted-foreground">
                      <th className="px-3 py-1.5 font-semibold">Sana</th>
                      <th className="px-2 py-1.5 font-semibold">Tovar</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Miqdor</th>
                      <th className="px-2 py-1.5 text-right font-semibold">Summa</th>
                      <th className="px-2 py-1.5 font-semibold">Sabab</th>
                      <th className="px-2 py-1.5 font-semibold">Filial</th>
                      <th className="px-2 py-1.5 font-semibold">Holat</th>
                      <th className="px-2 py-1.5 font-semibold">Moslik</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/20">
                        <td className="px-3 py-1.5 whitespace-nowrap tabular-nums text-muted-foreground">{fmtVaqt(r.vaqt)}</td>
                        <td className="max-w-[220px] truncate px-2 py-1.5" title={r.tovar}>{r.tovar}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap tabular-nums">
                          {r.miqdor.toLocaleString("uz-UZ", { maximumFractionDigits: 2 })} {r.birlik}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium tabular-nums">{formatUZS(r.summa)}</td>
                        <td className="max-w-[160px] truncate px-2 py-1.5 text-muted-foreground" title={r.sabab ?? undefined}>{r.sabab ?? "—"}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.filial}</td>
                        <td className="px-2 py-1.5 text-muted-foreground">{r.status}</td>
                        <td className="px-2 py-1.5"><ConfidenceBadge c={r.confidence} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobil — kartalar (<md) */}
              <div className="max-h-[480px] space-y-2 overflow-y-auto md:hidden">
                {data.rows.map((r) => (
                  <div key={r.id} className="rounded-xl border border-border p-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="min-w-0 flex-1 truncate text-xs font-medium">{r.tovar}</span>
                      <ConfidenceBadge c={r.confidence} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{fmtVaqt(r.vaqt)}</span>
                      <span className="font-semibold tabular-nums">{formatUZS(r.summa)}</span>
                    </div>
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      {r.miqdor.toLocaleString("uz-UZ", { maximumFractionDigits: 2 })} {r.birlik} · {r.filial} · {r.status}
                      {r.sabab && <> · {r.sabab}</>}
                    </div>
                  </div>
                ))}
              </div>

              {data.jamiSoni > data.rows.length && (
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Ko&apos;rsatilgan {data.rows.length.toLocaleString("uz-UZ")} / jami {data.jamiSoni.toLocaleString("uz-UZ")}
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
