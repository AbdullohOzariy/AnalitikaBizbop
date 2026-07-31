"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pill, EmptyState } from "@/components/common/page";
import { Loader2, BarChart2, TrendingUp, TrendingDown, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatUZS, formatDateUZ } from "@/lib/format";
import { toast } from "sonner";
import {
  listReportCampaignsAction, promoReportAction,
  type ReportCampaignOpt, type PromoReport, type ReportItem, type MarjaBloki,
} from "./actions";

const TYPE_LABEL: Record<string, string> = {
  KUN_TAKLIFI: "Kun taklifi", HAFTA_CHEGIRMA: "Hafta chegirmasi",
  BIZBOP_NARX: "Bizbop narx", AAARZON: "A-a-arzon", FLASH: "Flash",
};

function money(n: number) { return formatUZS(n, { compact: true }); }
function growthClass(p: number | null) {
  if (p == null) return "text-muted-foreground";
  return p > 0 ? "text-emerald-600 dark:text-emerald-400" : p < 0 ? "text-red-600 dark:text-red-400" : "text-muted-foreground";
}
function growthLabel(p: number | null) {
  if (p == null) return "—";
  return `${p > 0 ? "+" : ""}${p.toFixed(1)}%`;
}

export function HisobotClient() {
  const [campaigns, setCampaigns] = useState<ReportCampaignOpt[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [report, setReport] = useState<PromoReport | null>(null);
  const [loadingList, startList] = useTransition();
  const [loadingRep, startRep] = useTransition();
  const reqId = useRef(0);

  useEffect(() => {
    startList(async () => {
      const res = await listReportCampaignsAction();
      if (res.ok) setCampaigns(res.rows);
      else toast.error(res.error);
    });
  }, []);

  useEffect(() => {
    if (!selectedId) return; // bo'sh tanlovda render EmptyState ko'rsatadi (report e'tiborsiz)
    const my = ++reqId.current;
    startRep(async () => {
      const res = await promoReportAction({ campaignId: Number(selectedId) });
      if (my !== reqId.current) return;
      if (res.ok) setReport(res.report);
      else { toast.error(res.error); setReport(null); }
    });
  }, [selectedId]);

  const items: Record<string, string> = Object.fromEntries(
    campaigns.map((c) => [String(c.id), `${TYPE_LABEL[c.type] ?? c.type} · ${c.title}`])
  );

  return (
    <div className="space-y-5">
      {/* Aksiya tanlash */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="text-sm font-medium">Aksiya:</label>
        <Select items={items} value={selectedId} onValueChange={(v) => setSelectedId((v as string) ?? "")}
          disabled={loadingList || campaigns.length === 0}>
          <SelectTrigger className="h-10 w-[360px] max-w-full"><SelectValue placeholder={loadingList ? "Yuklanmoqda…" : "Aksiyani tanlang"} /></SelectTrigger>
          <SelectContent>
            {campaigns.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>{TYPE_LABEL[c.type] ?? c.type} · {c.title}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {loadingRep && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
      </div>

      {!selectedId ? (
        <EmptyState icon={BarChart2} title="Aksiyani tanlang"
          description="Aksiya samaradorligi — sotuv o'sishi (aksiyadan oldingi davrga nisbatan) va tugagach narx asliga qaytgani ko'rsatiladi." />
      ) : report ? (
        <ReportView report={report} />
      ) : loadingRep ? (
        <p className="py-8 text-center text-sm text-muted-foreground"><Loader2 className="mr-1.5 inline h-4 w-4 animate-spin" />Hisoblanmoqda…</p>
      ) : null}
    </div>
  );
}

function ReportView({ report }: { report: PromoReport }) {
  const t = report.totals;

  // Aksiyaning birorta kuni ham TO'LIQ import qilinmagan. Ilgari bunday holatda
  // hisobot barcha raqamlarni nol qilib ko'rsatib, "aksiya ishlamadi" degan yolg'on
  // taassurot berardi — endi ochiq aytiladi.
  if (report.days === 0) {
    return (
      <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/[0.07] px-4 py-3 text-sm">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="space-y-1">
          <p className="font-medium">Hisobot uchun ma'lumot hali yo'q</p>
          <p className="text-muted-foreground">
            Aksiya <b className="text-foreground">{formatDateUZ(report.periodStart)}</b> da boshlangan, sotuv
            ma'lumoti esa <b className="text-foreground">{formatDateUZ(report.dataThrough)}</b> gacha to'liq
            (keyingi kunlarda ba'zi filiallar importi kelmagan). Import yetib kelgach hisobot avtomatik to'ladi.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Davr konteksti + granularlik ogohlantirishi */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 rounded-xl border border-border/60 bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
        <span>Aksiya davri: <b className="text-foreground">{formatDateUZ(report.periodStart)} – {formatDateUZ(report.periodEnd)}</b>{!report.campaign.endDate && " (davom etmoqda)"}</span>
        <span>Taqqos davri: <b className="text-foreground">{formatDateUZ(report.baseStart)} – {formatDateUZ(report.baseEnd)}</b></span>
        <span>Taqqoslangan: <b className="text-foreground">{report.days} kun</b></span>
        <span>Filial: <b className="text-foreground">{report.campaign.branchName ?? "Barcha"}</b></span>
      </div>

      {/* Davr KESILGAN bo'lsa ochiq aytiladi: teng bo'lmagan oynalarni taqqoslash
          aksiya natijasini bir necha barobar buzib ko'rsatardi. */}
      {report.truncated && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/[0.07] px-3 py-2 text-xs">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="text-muted-foreground">
            {report.campaign.endDate && report.campaign.endDate > report.dataThrough ? (
              <>
                Aksiya <b className="text-foreground">{formatDateUZ(report.campaign.endDate)}</b> gacha rejalashtirilgan,
                lekin sotuv ma'lumoti <b className="text-foreground">{formatDateUZ(report.dataThrough)}</b> gacha mavjud.
              </>
            ) : (
              <>
                Sotuv ma'lumoti <b className="text-foreground">{formatDateUZ(report.dataThrough)}</b> gacha to'liq
                (keyingi kunlarda ba'zi filiallar importi hali kelmagan).
              </>
            )}{" "}
            Shu sabab hisobot <b className="text-foreground">{report.days} kunlik</b> aksiya davrini AYNI shuncha kunlik
            taqqos davri bilan solishtiryapti — natija to'liq davrniki emas, oraliq holat.
          </span>
        </div>
      )}

      {/* Umumiy kartalar */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatBox label="Aksiya davri sotuvi" value={money(t.promoAmount)} sub={`${money(t.promoQty)} dona`} />
        <StatBox label="Oldingi davr sotuvi" value={money(t.baseAmount)} sub={`${money(t.baseQty)} dona`} muted />
        <StatBox label="Sotuv o'sishi (summa)" value={growthLabel(t.growthAmountPct)}
          sub={t.growthQtyPct != null ? `dona: ${growthLabel(t.growthQtyPct)}` : "taqqoslab bo'lmaydi"}
          tone={t.growthAmountPct} />
      </div>

      {t.marja && <MarjaXulosa m={t.marja} />}

      <div className="flex items-start gap-2 rounded-lg bg-amber-500/[0.06] px-3 py-2 text-xs text-muted-foreground">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>Sotuv yozuvlari import davriga bog'liq (proratsiya bilan hisoblangan) — qisqa aksiyalarda raqamlar taxminiy bo'lishi mumkin.{report.hasAfter ? " Narx ustuni aksiyadan keyingi davr o'rtacha narxiga asoslangan." : " Aksiya hali tugamagani uchun \"narx qaytdimi\" tekshiruvi mavjud emas."}</span>
      </div>

      {/* SKU jadval */}
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-border bg-muted text-xs uppercase tracking-wider text-muted-foreground">
              <th className="px-3 py-2.5 text-left font-semibold">Nomi (SKU)</th>
              <th className="px-2 py-2.5 text-right font-semibold">Aksiya narxi</th>
              <th className="px-2 py-2.5 text-right font-semibold">Aksiya davri</th>
              <th className="px-2 py-2.5 text-right font-semibold">Oldingi davr</th>
              <th className="px-2 py-2.5 text-right font-semibold">O&apos;sish</th>
              <th className="px-2 py-2.5 text-right font-semibold">Marja %</th>
              <th className="px-2 py-2.5 text-right font-semibold">Yalpi foyda</th>
              {report.hasAfter && <th className="px-2 py-2.5 text-right font-semibold">Narx (keyin)</th>}
              {report.hasAfter && <th className="px-2 py-2.5 text-center font-semibold">Holat</th>}
            </tr>
          </thead>
          <tbody>
            {report.items.length === 0 ? (
              <tr><td colSpan={report.hasAfter ? 9 : 7} className="px-3 py-8 text-center text-sm text-muted-foreground">Aksiyada SKU yo&apos;q.</td></tr>
            ) : report.items.map((it) => <ItemRow key={it.productId} it={it} hasAfter={report.hasAfter} />)}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Aksiyaning ASOSIY savoliga javob: sotuv o'sgani marja yo'qotilishini qopladimi?
 * Chegirma marjani yeydi — foiz emas, SO'MDAGI yalpi foyda hal qiladi.
 */
function MarjaXulosa({ m }: { m: MarjaBloki }) {
  // `delta === null` — baza davrida tannarxli sotuv yo'q (butun aksiya yangi
  // assortimentdan iborat). Bunda "oqladi/oqlamadi" degan hukm chiqarib bo'lmaydi,
  // lekin aksiya davri foydasi o'lchangan va ko'rsatiladi.
  const taqqoslanadi = m.delta != null;
  const foyda = (m.delta ?? 0) >= 0;
  return (
    <div
      className={cn(
        "rounded-xl border p-4",
        !taqqoslanadi
          ? "border-border bg-muted/40"
          : foyda
            ? "border-primary/30 bg-primary/[0.04]"
            : "border-destructive/30 bg-destructive/[0.04]"
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        {taqqoslanadi &&
          (foyda ? (
            <TrendingUp className="h-4 w-4 text-primary" />
          ) : (
            <TrendingDown className="h-4 w-4 text-destructive" />
          ))}
        <h3 className="text-sm font-semibold">
          {!taqqoslanadi
            ? "Taqqoslash uchun baza yo'q — yangi assortiment"
            : foyda
              ? "Aksiya o'zini oqladi"
              : "Aksiya o'zini oqlamadi"}
        </h3>
        {taqqoslanadi ? (
          <span className={cn("text-sm font-bold tabular-nums", foyda ? "text-primary" : "text-destructive")}>
            {foyda ? "+" : ""}{money(m.delta ?? 0)} so'm
            {m.deltaPct != null && ` (${m.deltaPct >= 0 ? "+" : ""}${m.deltaPct.toFixed(1)}%)`}
          </span>
        ) : (
          <span className="text-sm font-bold tabular-nums">{money(m.promoProfit)} so'm yalpi foyda</span>
        )}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg bg-card p-2.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Marja %</div>
          <div className="mt-1 flex items-baseline gap-2 tabular-nums">
            <span className="text-muted-foreground">{m.basePct?.toFixed(2) ?? "—"}%</span>
            <span className="text-muted-foreground">→</span>
            <span className="text-lg font-bold">{m.promoPct?.toFixed(2) ?? "—"}%</span>
          </div>
        </div>
        <div className="rounded-lg bg-card p-2.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Yalpi foyda (oldingi davr)
          </div>
          <div className="mt-1 text-lg font-bold tabular-nums text-muted-foreground">
            {money(m.baseProfit)}
          </div>
        </div>
        <div className="rounded-lg bg-card p-2.5">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
            Yalpi foyda (aksiya davri)
          </div>
          <div className={cn("mt-1 text-lg font-bold tabular-nums", foyda ? "text-primary" : "text-destructive")}>
            {money(m.promoProfit)}
          </div>
        </div>
      </div>

      <p className="mt-3 text-xs text-muted-foreground">
        {foyda
          ? "Sotuv hajmining o'sishi chegirmadan yo'qotilgan marjani qopladi — kompaniya ko'proq sotdi va ko'proq foyda oldi."
          : "Sotuv hajmi oshgan bo'lsa-da, marja pasayishini qoplamadi — ko'proq mahsulot sotilib, kamroq yalpi foyda olindi."}
        {m.coverage < 0.95 && (
          <>
            {" "}
            <b className="text-amber-600 dark:text-amber-400">
              Diqqat: sotuvning {(m.coverage * 100).toFixed(0)}% qismidagina tannarx ma'lum —
              raqamlar shu qism bo'yicha.
            </b>
          </>
        )}
      </p>
    </div>
  );
}

function ItemRow({ it, hasAfter }: { it: ReportItem; hasAfter: boolean }) {
  return (
    <tr className="border-b border-border/40 last:border-0 hover:bg-muted/20">
      <td className="px-3 py-1.5">
        <div className="max-w-[240px] truncate" title={it.name}>{it.name}</div>
        <div className="font-mono text-[11px] text-muted-foreground">{it.code}</div>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {it.nPlusM ? (
          <span className="inline-block rounded-md bg-violet-500/10 px-1.5 py-0.5 text-xs font-bold text-violet-600 dark:text-violet-400">
            {it.nPlusM.buy}+{it.nPlusM.free} tekin
          </span>
        ) : (
          <>{money(it.promoPrice)}<div className="text-[11px] text-muted-foreground">asl: {money(it.regularPrice)}</div></>
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">{money(it.promoAmount)}<div className="text-[11px] text-muted-foreground">{money(it.promoQty)} dona</div></td>
      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{money(it.baseAmount)}<div className="text-[11px]">{money(it.baseQty)} dona</div></td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {it.marja?.promoPct != null ? (
          <>
            <span className="font-semibold">{it.marja.promoPct.toFixed(2)}%</span>
            <div className="text-[11px] text-muted-foreground">
              oldin: {it.marja.basePct?.toFixed(2) ?? "—"}%
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {it.marja == null ? (
          <span className="text-muted-foreground">—</span>
        ) : it.marja.delta == null ? (
          // Baza yo'q — taqqoslash mumkin emas, LEKIN foyda o'lchangan. "—" qo'yilsa
          // qator sotilmagandek o'qilardi (aynan shu xato aksiya 29 da topilgan).
          <>
            <span className="font-semibold">{money(it.marja.promoProfit)}</span>
            <div className="text-[11px] text-muted-foreground">yangi — baza yo'q</div>
          </>
        ) : (
          <>
            <span className={cn("font-semibold", it.marja.delta >= 0 ? "text-primary" : "text-destructive")}>
              {it.marja.delta >= 0 ? "+" : ""}
              {money(it.marja.delta)}
            </span>
            <div className="text-[11px] text-muted-foreground">
              {money(it.marja.baseProfit)} → {money(it.marja.promoProfit)}
            </div>
          </>
        )}
      </td>
      <td className={cn("px-2 py-1.5 text-right tabular-nums font-semibold", growthClass(it.growthAmountPct))}>
        <span className="inline-flex items-center justify-end gap-1">
          {it.growthAmountPct != null && it.growthAmountPct !== 0 && (it.growthAmountPct > 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />)}
          {it.growthAmountPct == null && it.promoQty > 0 ? (
            <span className="text-xs font-normal text-muted-foreground">yangi</span>
          ) : (
            growthLabel(it.growthAmountPct)
          )}
        </span>
      </td>
      {hasAfter && <td className="px-2 py-1.5 text-right tabular-nums">{it.afterAvgPrice != null ? money(it.afterAvgPrice) : "—"}</td>}
      {hasAfter && (
        <td className="px-2 py-1.5 text-center">
          {it.priceStatus === "returned" ? <Pill tone="green">Asliga qaytdi</Pill>
            : it.priceStatus === "stuck" ? <Pill tone="red">Aksiyada qoldi</Pill>
            : <span className="text-xs text-muted-foreground">—</span>}
        </td>
      )}
    </tr>
  );
}

function StatBox({ label, value, sub, tone, muted }: {
  label: string; value: string; sub?: string; tone?: number | null; muted?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums",
        tone !== undefined ? growthClass(tone ?? null) : muted ? "text-muted-foreground" : "text-foreground")}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}
