"use client";

import { useMemo, useState } from "react";
import { Search, Store, ScanSearch, AlertTriangle, CheckCircle2, CircleDashed, Tag, Percent } from "lucide-react";
import { EmptyState, Pill, StatCard } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { formatNumber, formatPercent, formatDateUZ } from "@/lib/format";
import { PROMO_TYPE_META } from "@/lib/promo";
import type { BranchPriceDiff, PriceCoverage, PriceMismatch, PromoMark } from "@/lib/analyze/price-quality";

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

// ─── Qamrov (coverage) — taqqoslash qancha ma'lumotni qamradi ───────────────
// Narxsiz (Продажи/Цена bo'sh yoki 0) qatorlar taqqoslashga kirmaydi. Bu blok
// "farq topilmadi" ni "muammo yo'q" deb o'qishdan saqlaydi.
function CoveragePanel({ c }: { c: PriceCoverage }) {
  if (c.skuTotal === 0) return null;

  const totalRows = c.pricedRows + c.unpricedRows;

  // Hammasida narx bor — bezovta qilmaymiz, bitta xotirjam qator yetadi.
  if (c.unpricedRows === 0) {
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-primary/20 bg-primary/5 px-4 py-2.5">
        <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
        <span className="text-sm font-medium">Qamrov to'liq</span>
        <span className="text-sm text-muted-foreground">
          Oxirgi davrdagi {formatNumber(totalRows)} ta SKU×filial qatorining hammasida narx bor — taqqoslash barcha
          ma'lumot ustidan bajarildi.
        </span>
      </div>
    );
  }

  // Maxraj — jami qator; sanoq esa HAQIQATDAN taqqoslanganlar (narxli qatori 2 tadan
  // kam SKU HAVING bilan tushib qoladi). `pricedRows` bu yerda yaramaydi: u tushib
  // qolgan SKU'larning narxli qatorlarini ham sanaydi va foizni oshirib ko'rsatadi.
  const comparedPct = totalRows > 0 ? (c.comparedRows / totalRows) * 100 : 0;

  return (
    <div className="space-y-3">
      {/* ENG MUHIM: qisman qamrov — taqqoslash bajarildi, lekin to'liqmas to'plam ustidan. */}
      {c.skuPartial > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-start sm:gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
              {formatNumber(c.skuPartial)} ta SKU to'liqmas taqqoslandi
            </p>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Bu SKU'lar kamida ikki filialda narxli — ya'ni taqqoslandi, lekin ba'zi filiali narxsiz bo'lgani uchun
              faqat narxi bor filiallar ustidan. Agar SKU quyidagi ro'yxatda bo'lsa, ko'rsatilgan farq to'liq manzara
              emas; ro'yxatda bo'lmasa ham «farq yo'q» degani emas, chunki narxsiz filialda narx butunlay boshqa
              bo'lishi mumkin. Bu{" "}
              <span className="font-medium text-foreground">xato emas</span>, «tekshirib bo'lmadi» degani: fayldagi
              Продажи/Цена ustuni bo'sh yoki 0 bo'lsa, qator taqqoslashga umuman kirmaydi.
            </p>
          </div>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Taqqoslashga kirgan"
          value={formatNumber(c.comparedRows)}
          icon={Tag}
          tone="green"
          hint={`${formatNumber(totalRows)} qatordan — ${formatPercent(comparedPct)}`}
        />
        <StatCard
          label="Narxsiz qatorlar"
          value={formatNumber(c.unpricedRows)}
          icon={CircleDashed}
          tone="orange"
          hint="Продажи/Цена bo'sh yoki 0 — taqqoslashdan tushib qolgan"
        />
        <StatCard
          label="To'liqmas taqqoslangan SKU"
          value={formatNumber(c.skuPartial)}
          icon={AlertTriangle}
          tone={c.skuPartial > 0 ? "red" : "green"}
          hint={
            c.skuPartial > 0
              ? "Bir qism filiali narxsiz — natija ishonchsiz"
              : "Yo'q — taqqoslanganlarining hammasi to'liq"
          }
        />
        <StatCard
          label="Taqqoslab bo'lmagan SKU"
          value={formatNumber(c.skuNone)}
          icon={CircleDashed}
          tone={c.skuNone > 0 ? "orange" : "green"}
          hint={
            c.skuNone > 0
              ? `Narxli filiali 2 tadan kam — ${formatNumber(c.skuTotal)} SKU'dan`
              : "Yo'q — har bir SKU kamida 2 filialda narxli"
          }
        />
      </div>
    </div>
  );
}

// ─── Tab 1: Filiallar narx farqi ────────────────────────────────────────────
export function BranchDiffTab({ rows, coverage }: { rows: BranchPriceDiff[]; coverage: PriceCoverage }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => rows.filter((r) => matchesQuery(q, r.code, r.name)), [rows, q]);

  // Qamrov ro'yxat bo'sh bo'lganda ham ko'rinishi SHART: "farq topilmadi" degani
  // "tekshirildi" degani emas.
  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        <CoveragePanel c={coverage} />
        <EmptyState
          icon={Store}
          title="Narx farqi topilmadi"
          description="Eng oxirgi davrda hech bir SKU'da filiallar sotuv narxi farq qilmadi (yoki narxli fayl yuklanmagan)."
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <CoveragePanel c={coverage} />
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

// ─── Aksiya belgisi ─────────────────────────────────────────────────────────
// Sotuv tabida "Сумма÷Кол" — davrdagi AMALDAGI o'rtacha narx, "Цена" esa ro'yxat
// narxi. Aksiya bo'lgan SKU'da ikkisi farq qilishi kutilgan — qator ro'yxatda
// qoladi, lekin xato emasligi ko'rinib tursin.
function promoTypeLabel(t: PromoMark["type"]): string {
  return t === "FLASH" ? "Flash" : PROMO_TYPE_META[t].label;
}

// Aksiya bitta qator matni. CANCELLED alohida ko'rsatiladi: u belgi BERADI (aksiya
// haqiqatan ishlagan bo'lishi mumkin — holat qo'lda "Bekor" ga o'tkaziladi), lekin
// bu zaifroq dalil, foydalanuvchi buni ko'rib qaror qilsin.
function promoLine(p: PromoMark): string {
  const period = p.endDate
    ? `${formatDateUZ(p.startDate)} — ${formatDateUZ(p.endDate)}`
    : `${formatDateUZ(p.startDate)} — doimiy`;
  const suffix = p.status === "CANCELLED" ? " — keyin bekor qilingan" : "";
  return `${promoTypeLabel(p.type)}: ${p.title} (${period})${suffix}`;
}

/**
 * `title` atributi YETARLI EMAS — sensorli qurilmada va klaviatura bilan hover yo'q,
 * ya'ni aksiya nomi/davri umuman yetib bormaydi. Shuning uchun chip — bosiladigan
 * disclosure: bosilganda tafsilot qatorlari ro'yida ochiladi (hover uchun `title`
 * ham qoldirilgan). `Pill` `title`/`onClick` propini qabul qilmaydi (umumiy komponent
 * — o'zgartirmaymiz), shuning uchun u tashqi `button` ichida.
 */
function PromoChip({ promos }: { promos: PromoMark[] }) {
  const [open, setOpen] = useState(false);
  const lines = promos.map(promoLine);

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`Aksiya tafsilotlari: ${lines.join("; ")}`}
        title={lines.join("\n")}
        className="rounded-full outline-none transition-opacity hover:opacity-80 focus-visible:ring-2 focus-visible:ring-violet-500/60"
      >
        <Pill tone="violet">
          <Percent className="h-3 w-3" />
          Aksiya
          {promos.length > 1 && <span className="tabular-nums">×{promos.length}</span>}
        </Pill>
      </button>
      {open && (
        <ul className="mt-1 space-y-0.5 text-xs leading-relaxed text-muted-foreground">
          {promos.map((p, i) => (
            <li key={`${p.campaignId}-${i}`}>{lines[i]}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Aksiya farqni FAQAT BIR yo'nalishda izohlaydi: chegirma haqiqiy o'rtacha narxni
 * ro'yxat narxidan PASAYTIRADI, ya'ni `diff = Сумма÷Кол − Цена < 0`. Agar diff > 0
 * bo'lsa (ro'yxat narxidan QIMMAT sotilgan), chegirma buni izohlay olmaydi — bunday
 * qator "kutilgan" deb ko'rsatilmaydi, rangi xato rangida qoladi va banner sanog'iga
 * kirmaydi. Chip esa qoladi: "bu davrda aksiya bo'lgan" — bu fakt, yashirmaymiz.
 */
function isPromoExplained(r: PriceMismatch): boolean {
  return r.promos.length > 0 && r.diff < 0;
}

// ─── Tab 2/3: Summa÷soni ≠ Narx (sotuv yoki tannarx) ────────────────────────
function MismatchTab({ rows, kind, truncated }: { rows: PriceMismatch[]; kind: "sale" | "cost"; truncated: boolean }) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => rows.filter((r) => matchesQuery(q, r.code, r.name)), [rows, q]);
  // Sanoq `filtered` bo'yicha — jadval ham shuni chizadi. `rows` bo'yicha hisoblansa
  // qidiruvda banner "37 ta qator" deb turar, jadvalda esa 2 qator qolardi.
  // Aksiya faqat sotuv narxiga ta'sir qiladi — tannarx tabida `promos` doim bo'sh.
  const promoStats = useMemo(() => {
    let explained = 0; // diff < 0 — chegirma izohlaydi
    let opposite = 0; // diff >= 0 — aksiya bor, lekin farq teskari yo'nalishda
    for (const r of filtered) {
      if (r.promos.length === 0) continue;
      if (isPromoExplained(r)) explained += 1;
      else opposite += 1;
    }
    return { explained, opposite, total: explained + opposite };
  }, [filtered]);

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
      {promoStats.total > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-violet-500/30 bg-violet-500/10 p-4 sm:flex-row sm:items-start sm:gap-3">
          <Percent className="h-5 w-5 shrink-0 text-violet-600 dark:text-violet-400" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">
              {formatNumber(promoStats.total)} ta qator ({formatNumber(filtered.length)}
              {truncated ? "+" : ""} dan) aksiya davriga tushadi
            </p>
            {promoStats.explained > 0 && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Ulardan <span className="font-medium text-foreground">{formatNumber(promoStats.explained)} tasida</span>{" "}
                «Сумма÷Кол» «Цена» dan past — bu <span className="font-medium text-foreground">kutilgan</span>:
                «Сумма÷Кол» davrda haqiqatdan sotilgan o'rtacha narx (chegirmali), «Цена» esa fayldagi ro'yxat narxi.
                Chegirma bo'lgan SKU'da ular mos kelmasligi normal — ma'lumot xatosi emas.
              </p>
            )}
            {promoStats.opposite > 0 && (
              <p className="text-xs leading-relaxed text-muted-foreground">
                Qolgan <span className="font-medium text-foreground">{formatNumber(promoStats.opposite)} tasida</span>{" "}
                esa aksincha — o'rtacha narx ro'yxat narxidan{" "}
                <span className="font-medium text-foreground">yuqori</span>. Chegirma bunday farqni izohlay olmaydi,
                shuning uchun ular xato rangida qoldirildi va yuqoridagi «kutilgan» sanoqqa kirmaydi.
              </p>
            )}
            <p className="text-xs leading-relaxed text-muted-foreground">
              Qatorlar yashirilmadi, faqat «Aksiya» chipi bilan belgilandi — chipni bossangiz aksiya nomi va davri
              ochiladi.
              {truncated && " Ro'yxat chegaraga yetib qirqilgan, shuning uchun sanoqlar faqat ko'rinayotgan qatorlar bo'yicha."}
            </p>
          </div>
        </div>
      )}
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
              <tr key={r.rowKey} className="border-b border-border/40 last:border-b-0 hover:bg-muted/30">
                <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{r.code}</td>
                <td className="px-4 py-2.5">
                  <div className="font-medium">{r.name}</div>
                  {r.categoryName && <div className="text-xs text-muted-foreground">{r.categoryName}</div>}
                  {r.promos.length > 0 && <PromoChip promos={r.promos} />}
                </td>
                <td className="px-4 py-2.5">
                  <Pill tone="muted">{r.branchName}</Pill>
                </td>
                <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{formatNumber(r.soldQty)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums font-medium">{fmtPrice(r.derivedPrice)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums">{fmtPrice(r.filePrice)}</td>
                <td className="px-4 py-2.5 text-right">
                  {/* Violet — FAQAT aksiya izohlagan yo'nalish (diff < 0). Aksiya bor,
                      lekin farq teskari bo'lsa xato rangida qoladi. */}
                  <div
                    className={cn(
                      "font-semibold tabular-nums",
                      isPromoExplained(r)
                        ? "text-violet-600 dark:text-violet-400"
                        : r.diff > 0
                        ? "text-destructive"
                        : "text-amber-600 dark:text-amber-400"
                    )}
                  >
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

export function SaleMismatchTab({ rows, truncated }: { rows: PriceMismatch[]; truncated: boolean }) {
  return <MismatchTab rows={rows} kind="sale" truncated={truncated} />;
}

export function CostMismatchTab({ rows, truncated }: { rows: PriceMismatch[]; truncated: boolean }) {
  return <MismatchTab rows={rows} kind="cost" truncated={truncated} />;
}
