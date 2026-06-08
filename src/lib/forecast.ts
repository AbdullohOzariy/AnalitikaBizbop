/**
 * AI sotuv prognozi — Claude tarixiy savdodan kunlik taqsimot "shaklini" (og'irliklarni)
 * chiqaradi; kunlik prognoz = bo'lim oylik rejasi × og'irlik.
 *
 * MUHIM: og'irliklar oy bo'yicha yig'indisi = 1 ga normallashtiriladi, shu sabab
 * kunlik prognoz yig'indisi HAR DOIM kiritilgan rejaga aniq teng bo'ladi (chegara).
 *
 * Shakl darajasi: bo'lim (CategoryGroup) — har filial uchun 3 ta egri chiziq.
 */

import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { unstable_cache } from "next/cache";
import { ANALYTICS_CACHE_TAG, type DateRange } from "@/lib/analytics";

const FORECAST_MODEL = process.env.FORECAST_MODEL ?? "claude-sonnet-4-6";
const LOOKBACK_DAYS = 90;
const WEEKDAYS_UZ = ["Yakshanba", "Dushanba", "Seshanba", "Chorshanba", "Payshanba", "Juma", "Shanba"];

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export type GroupForecastResult = {
  groupId: number;
  groupName: string;
  model: string;
  rationale: string;
  hadHistory: boolean;
};

// ─── Tarixiy kunlik bo'lim savdosi (proratsiya bilan) ──────────────────────────
async function fetchGroupDailyHistory(
  branchId: number,
  groupId: number,
  start: Date,
  end: Date
): Promise<{ date: string; amount: number }[]> {
  return prisma.$queryRaw<{ date: string; amount: number }[]>`
    SELECT g.s::text AS date,
      COALESCE(SUM(
        cs.amount::numeric * (
          (LEAST(cs."periodEnd", ${end}::date) - GREATEST(cs."periodStart", g.s::date) + 1)::float8
          / NULLIF((cs."periodEnd" - cs."periodStart" + 1)::float8, 0)
        )
      ), 0)::float8 AS amount
    FROM generate_series(${start}::date, ${end}::date, '1 day'::interval) AS g(s)
    LEFT JOIN "CategorySales" cs
      ON cs."branchId" = ${branchId}
      AND cs."periodStart" <= g.s::date
      AND cs."periodEnd"   >= g.s::date
      AND cs."categoryId" IN (
        SELECT id FROM "Category"
        WHERE "groupId" = ${groupId} AND "parentId" IS NULL AND "sortOrder" > 0
      )
    GROUP BY g.s
    ORDER BY g.s
  `;
}

// ─── Hafta kuni o'rtachalari (faqat ma'lumotli kunlardan) ──────────────────────
function weekdayAverages(history: { date: string; amount: number }[]): number[] {
  const sum = new Array(7).fill(0);
  const cnt = new Array(7).fill(0);
  for (const h of history) {
    if (h.amount <= 0) continue;
    const wd = new Date(h.date + "T00:00:00.000Z").getUTCDay();
    sum[wd] += h.amount;
    cnt[wd] += 1;
  }
  const overall = (() => {
    const pos = history.filter((h) => h.amount > 0);
    return pos.length ? pos.reduce((s, h) => s + h.amount, 0) / pos.length : 0;
  })();
  return sum.map((s, i) => (cnt[i] > 0 ? s / cnt[i] : overall));
}

// ─── Deterministik fallback og'irliklar (AI yo'q bo'lsa) ───────────────────────
function fallbackWeights(year: number, month: number, wdAvg: number[]): number[] {
  const n = daysInMonth(year, month);
  const raw: number[] = [];
  for (let d = 1; d <= n; d++) {
    const wd = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    raw.push(wdAvg[wd] > 0 ? wdAvg[wd] : 1);
  }
  return normalize(raw);
}

function normalize(weights: number[]): number[] {
  const total = weights.reduce((s, w) => s + (w > 0 ? w : 0), 0);
  if (total <= 0) return weights.map(() => 1 / weights.length);
  return weights.map((w) => (w > 0 ? w / total : 0));
}

// ─── Claude chaqiruvi: kunlik og'irliklar + izoh ───────────────────────────────
async function askClaudeForWeights(params: {
  groupName: string;
  branchName: string;
  year: number;
  month: number;
  wdAvg: number[];
}): Promise<{ weights: number[]; rationale: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const { groupName, branchName, year, month, wdAvg } = params;
  const n = daysInMonth(year, month);
  const dateLines: string[] = [];
  for (let d = 1; d <= n; d++) {
    const wd = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    dateLines.push(`${d}-kun: ${WEEKDAYS_UZ[wd]}`);
  }
  const avgTotal = wdAvg.reduce((s, v) => s + v, 0) || 1;
  const wdShare = WEEKDAYS_UZ.map(
    (name, i) => `${name}: ${((wdAvg[i] / avgTotal) * 100).toFixed(1)}%`
  ).join(", ");

  const client = new Anthropic({ apiKey });
  try {
    const msg = await client.messages.create({
      model: FORECAST_MODEL,
      max_tokens: 1600,
      temperature: 0.2,
      system:
        "Sen supermarket sotuv prognozchisisan. Tarixiy hafta-kuni shakliga qarab " +
        "kelgusi oyning HAR KUNI uchun nisbiy og'irlik (vaznlar) chiqarasan. " +
        "Vaznlar yig'indisi 1 ga teng bo'lishi shart emas — biz keyin normallashtiramiz. " +
        "Dam olish/ish kunlari farqini, oy oxiri (oylik) ko'tarilishini, bayramlarni hisobga ol. " +
        "Javobni FAQAT JSON ber.",
      messages: [
        {
          role: "user",
          content:
            `Filial: ${branchName}\nBo'lim: ${groupName}\n` +
            `Maqsad oy: ${year}-${String(month).padStart(2, "0")} (${n} kun)\n\n` +
            `Tarixiy hafta-kuni ulushlari (o'rtacha kunlik savdoga nisbatan):\n${wdShare}\n\n` +
            `Maqsad oy kunlari (hafta kuni bilan):\n${dateLines.join("\n")}\n\n` +
            `Har kun uchun nisbiy og'irlik massiv (uzunligi ${n}) va qisqa izoh (1-2 jumla, o'zbekcha) qaytar.\n` +
            `Format: {"weights":[${n} ta son], "rationale":"..."}`,
        },
      ],
    });
    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    const jsonStr = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
    const parsed = JSON.parse(jsonStr) as { weights: unknown; rationale?: unknown };
    if (
      !Array.isArray(parsed.weights) ||
      parsed.weights.length !== n ||
      !parsed.weights.every((w) => typeof w === "number" && isFinite(w) && w >= 0)
    ) {
      return null;
    }
    const sum = (parsed.weights as number[]).reduce((s, w) => s + w, 0);
    if (sum <= 0) return null;
    return {
      weights: parsed.weights as number[],
      rationale: typeof parsed.rationale === "string" ? parsed.rationale.slice(0, 500) : "",
    };
  } catch {
    return null;
  }
}

// ─── Asosiy: filial × oy uchun barcha bo'lim egri chiziqlarini yaratish ─────────
export async function generateForecast(
  branchId: number,
  year: number,
  month: number
): Promise<GroupForecastResult[]> {
  const [branch, groups] = await Promise.all([
    prisma.branch.findUnique({ where: { id: branchId }, select: { name: true } }),
    prisma.categoryGroup.findMany({ orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
  ]);
  if (!branch) throw new Error("Filial topilmadi");

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const lookbackEnd = new Date(monthStart.getTime() - 86_400_000);
  const lookbackStart = new Date(monthStart.getTime() - LOOKBACK_DAYS * 86_400_000);

  const results: GroupForecastResult[] = [];

  for (const group of groups) {
    const history = await fetchGroupDailyHistory(branchId, group.id, lookbackStart, lookbackEnd);
    const hadHistory = history.some((h) => h.amount > 0);
    const wdAvg = weekdayAverages(history);

    let weights: number[];
    let rationale: string;
    let usedModel: string;

    const ai = hadHistory
      ? await askClaudeForWeights({ groupName: group.name, branchName: branch.name, year, month, wdAvg })
      : null;

    if (ai) {
      weights = normalize(ai.weights);
      rationale = ai.rationale || "AI hafta-kuni shakliga ko'ra taqsimladi.";
      usedModel = FORECAST_MODEL;
    } else {
      weights = fallbackWeights(year, month, wdAvg);
      rationale = hadHistory
        ? "AI mavjud emas — tarixiy hafta-kuni o'rtachasiga ko'ra taqsimlandi."
        : "Tarix yetarli emas — kunlar teng taqsimlandi.";
      usedModel = "fallback";
    }

    // Saqlash: eski egri chiziqni almashtirish + run jurnali
    const curveRows = weights.map((w, i) => ({
      branchId,
      groupId: group.id,
      year,
      month,
      date: new Date(Date.UTC(year, month - 1, i + 1)),
      weight: new Prisma.Decimal(w.toFixed(8)),
    }));

    await prisma.$transaction([
      prisma.forecastCurve.deleteMany({ where: { branchId, groupId: group.id, year, month } }),
      prisma.forecastCurve.createMany({ data: curveRows }),
      prisma.forecastRun.upsert({
        where: { branchId_groupId_year_month: { branchId, groupId: group.id, year, month } },
        create: { branchId, groupId: group.id, year, month, model: usedModel, rationale },
        update: { model: usedModel, rationale, createdAt: new Date() },
      }),
    ]);

    results.push({
      groupId: group.id,
      groupName: group.name,
      model: usedModel,
      rationale,
      hadHistory,
    });
  }

  return results;
}

// ─── Prognoz holati (UI uchun) ─────────────────────────────────────────────────
export type ForecastStatus = {
  generated: boolean;
  lastGeneratedAt: string | null;
  groups: { groupId: number; groupName: string; model: string; rationale: string; createdAt: string }[];
};

export async function getForecastStatus(
  branchId: number,
  year: number,
  month: number
): Promise<ForecastStatus> {
  const runs = await prisma.forecastRun.findMany({
    where: { branchId, year, month },
    include: { group: { select: { name: true, sortOrder: true } } },
    orderBy: { group: { sortOrder: "asc" } },
  });
  return {
    generated: runs.length > 0,
    lastGeneratedAt: runs.length
      ? new Date(Math.max(...runs.map((r) => r.createdAt.getTime()))).toISOString()
      : null,
    groups: runs.map((r) => ({
      groupId: r.groupId,
      groupName: r.group.name,
      model: r.model,
      rationale: r.rationale,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

// ─── Kunlik prognoz qatori (dashboard overlay) ─────────────────────────────────
// forecast[kun] = Σ_bo'lim ( bo'lim oylik rejasi × og'irlik[kun] )
async function _dailyForecastSeries(
  range: DateRange,
  branchId?: number
): Promise<{ date: string; value: number }[]> {
  const branchSql = branchId ? Prisma.sql`AND fc."branchId" = ${branchId}` : Prisma.empty;
  const rows = await prisma.$queryRaw<{ date: string; value: number }[]>`
    SELECT fc."date"::text AS date,
      COALESCE(SUM(fc.weight::numeric * sp.amt), 0)::float8 AS value
    FROM "ForecastCurve" fc
    JOIN (
      SELECT sp."branchId",
             COALESCE(par."groupId", sub."groupId") AS "groupId",
             sp.year, sp.month, SUM(sp.amount)::numeric AS amt
      FROM "SalesPlan" sp
      JOIN "Category" sub ON sub.id = sp."categoryId"
      LEFT JOIN "Category" par ON par.id = sub."parentId"
      WHERE COALESCE(par."groupId", sub."groupId") IS NOT NULL
      GROUP BY sp."branchId", COALESCE(par."groupId", sub."groupId"), sp.year, sp.month
    ) sp
      ON sp."branchId" = fc."branchId"
      AND sp."groupId" = fc."groupId"
      AND sp.year = fc.year
      AND sp.month = fc.month
    WHERE fc."date" BETWEEN ${range.start}::date AND ${range.end}::date
      ${branchSql}
    GROUP BY fc."date"
    ORDER BY fc."date"
  `;
  return rows.map((r) => ({ date: isoDay(new Date(r.date)), value: Number(r.value) }));
}

export const dailyForecastSeries = (range: DateRange, branchId?: number) =>
  unstable_cache(
    () => _dailyForecastSeries(range, branchId),
    ["dailyForecastSeries", isoDay(range.start), isoDay(range.end), branchId ? String(branchId) : "all"],
    { tags: [ANALYTICS_CACHE_TAG], revalidate: 60 }
  )();
