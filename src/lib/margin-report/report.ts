/**
 * Marjasi MINUS hisoboti: oxirgi yuklangan davr bo'yicha filial × subkategoriya
 * kesmida marjasi manfiy (tannarx > sotuv) bo'lgan kataklar Excel'i — sozlangan
 * bot orqali guruh topigiga yuboriladi.
 * Marja = (sotuv − tannarx) / sotuv. Manba: CategorySales (tannarxi bor kataklar).
 */
import * as XLSX from "xlsx";
import { Telegram } from "telegraf";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { getMarginReportConfig } from "./sozlama";

type Row = { branch: string; grp: string | null; cat: string | null; sub: string; sales: number; cost: number };
type SubRow = { cid: number; grp: string | null; cat: string | null; sub: string; sales: number; cost: number | null };

/** Oxirgi yuklangan davr (periodStart, periodEnd) + yorlig'i. null — ma'lumot yo'q. */
async function latestPeriod(): Promise<{ start: Date; end: Date; label: string; tag: string } | null> {
  const latest = await prisma.categorySales.findFirst({
    orderBy: [{ periodEnd: "desc" }, { periodStart: "desc" }],
    select: { periodStart: true, periodEnd: true },
  });
  if (!latest) return null;
  const ps = latest.periodStart.toISOString().slice(0, 10);
  const pe = latest.periodEnd.toISOString().slice(0, 10);
  return { start: latest.periodStart, end: latest.periodEnd, label: ps === pe ? ps : `${ps} — ${pe}`, tag: pe };
}

/** Oxirgi davr bo'yicha marjasi minus kataklar Excel buferi. null — sotuv ma'lumoti yo'q. */
export async function buildMarginReport(): Promise<
  { buffer: Buffer; count: number; periodLabel: string; fileTag: string } | null
> {
  const period = await latestPeriod();
  if (!period) return null;
  const { start, end, label: periodLabel, tag: fileTag } = period;

  // Aynan shu davr kataklari (bir davr → har filial×subkat bittadan qator).
  // Tannarxi bor, sotuvi > 0, va sotuv − tannarx < 0 (marja minus) bo'lganlar.
  const rows = await prisma.$queryRaw<Row[]>(Prisma.sql`
    SELECT b.name AS branch, g.name AS grp, par.name AS cat, sub.name AS sub,
           cs.amount::float8 AS sales, cs."costAmount"::float8 AS cost
    FROM "CategorySales" cs
    JOIN "Branch" b ON b.id = cs."branchId"
    JOIN "Category" sub ON sub.id = cs."categoryId"
    LEFT JOIN "Category" par ON par.id = sub."parentId"
    LEFT JOIN "CategoryGroup" g ON g.id = COALESCE(par."groupId", sub."groupId")
    WHERE cs."periodStart" = ${start}
      AND cs."periodEnd" = ${end}
      AND cs."costAmount" IS NOT NULL
      AND cs.amount > 0
      AND cs.amount - cs."costAmount" < 0
    ORDER BY g."sortOrder" NULLS LAST, par."sortOrder" NULLS LAST, sub."sortOrder", b."sortOrder"
  `);

  const header = ["Filial", "Bo'lim", "Kategoriya", "Subkategoriya", "Sotuv", "Tannarx", "Zarar", "Marja %"];
  const data = rows.map((r) => {
    const loss = r.cost - r.sales; // musbat = zarar (qancha minusda)
    const marja = r.sales > 0 ? ((r.sales - r.cost) / r.sales) * 100 : 0;
    return [
      r.branch, r.grp ?? "", r.cat ?? "", r.sub,
      Math.round(r.sales), Math.round(r.cost), Math.round(loss), Math.round(marja * 10) / 10,
    ];
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...data]), "Marja minus");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return { buffer, count: rows.length, periodLabel, fileTag };
}

/**
 * Subkat o'rtacha marja vs reja (oxirgi davr, barcha filiallar yig'indisi).
 * Har subkat: o'rtacha marja % = (sotuv − tannarx)/sotuv; reja % = filiallar
 * MarginPlan o'rtachasi; farq = marja − reja. Sotuvi bor barcha subkat.
 */
export async function buildSubcatMarginReport(): Promise<
  { buffer: Buffer; count: number; periodLabel: string; fileTag: string } | null
> {
  const period = await latestPeriod();
  if (!period) return null;
  const { start, end, label: periodLabel, tag: fileTag } = period;

  const rows = await prisma.$queryRaw<SubRow[]>(Prisma.sql`
    SELECT cs."categoryId" AS cid, g.name AS grp, par.name AS cat, sub.name AS sub,
           SUM(cs.amount)::float8 AS sales,
           SUM(cs."costAmount")::float8 AS cost
    FROM "CategorySales" cs
    JOIN "Category" sub ON sub.id = cs."categoryId"
    LEFT JOIN "Category" par ON par.id = sub."parentId"
    LEFT JOIN "CategoryGroup" g ON g.id = COALESCE(par."groupId", sub."groupId")
    WHERE cs."periodStart" = ${start} AND cs."periodEnd" = ${end}
    GROUP BY cs."categoryId", g.name, par.name, sub.name, g."sortOrder", par."sortOrder", sub."sortOrder"
    HAVING SUM(cs.amount) > 0
    ORDER BY g."sortOrder" NULLS LAST, par."sortOrder" NULLS LAST, sub."sortOrder"
  `);

  // Reja marjasi — subkat bo'yicha filiallar o'rtachasi
  const planRows = await prisma.marginPlan.groupBy({ by: ["categoryId"], _avg: { marginPct: true } });
  const planBy = new Map<number, number>();
  for (const r of planRows) if (r._avg.marginPct != null) planBy.set(r.categoryId, Number(r._avg.marginPct));

  const r1 = (n: number) => Math.round(n * 10) / 10;
  const header = ["Bo'lim", "Kategoriya", "Subkategoriya", "Sotuv", "Tannarx", "Marja %", "Reja %", "Farq"];
  const data = rows.map((r) => {
    const marja = r.cost != null && r.sales > 0 ? ((r.sales - r.cost) / r.sales) * 100 : null;
    const plan = planBy.get(r.cid) ?? null;
    const farq = marja != null && plan != null ? marja - plan : null;
    return [
      r.grp ?? "", r.cat ?? "", r.sub,
      Math.round(r.sales), r.cost != null ? Math.round(r.cost) : "",
      marja != null ? r1(marja) : "", plan != null ? r1(plan) : "", farq != null ? r1(farq) : "",
    ];
  });

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([header, ...data]), "Subkat marja");
  const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  return { buffer, count: rows.length, periodLabel, fileTag };
}

/**
 * Hisobotni sozlangan guruhga (topic) yuboradi. Minus katak bo'lmasa — qisqa matn.
 * Sozlanmagan (token/chat yo'q) bo'lsa — xato qaytaradi (cron jim o'tkazadi).
 */
export async function sendMarginReport(): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  try {
    const cfg = await getMarginReportConfig();
    if (!cfg.token) return { ok: false, error: "Bot token sozlanmagan." };
    if (!cfg.chatId) return { ok: false, error: "Guruh chat ID sozlanmagan." };

    const tg = new Telegram(cfg.token);
    const thread = cfg.topicId ? { message_thread_id: cfg.topicId } : {};

    // 1) Marjasi MINUS (filial×subkat, tannarx > sotuv)
    const built = await buildMarginReport();
    if (!built) {
      await tg.sendMessage(cfg.chatId, "ℹ️ <b>Marja hisoboti</b>\nSotuv ma'lumoti topilmadi.", { parse_mode: "HTML", ...thread });
      return { ok: true, count: 0 };
    }
    if (built.count === 0) {
      await tg.sendMessage(
        cfg.chatId,
        `✅ <b>Marja</b> · ${built.periodLabel}\nMarjasi minus filial×subkat topilmadi.`,
        { parse_mode: "HTML", ...thread }
      );
    } else {
      const caption =
        `📉 <b>Marjasi MINUS</b> — filial×subkat (tannarx > sotuv)\n` +
        `🗓 ${built.periodLabel} · <b>${built.count}</b> ta katak`;
      await tg.sendDocument(
        cfg.chatId,
        { source: built.buffer, filename: `marja-minus-${built.fileTag}.xlsx` },
        { caption, parse_mode: "HTML", ...thread }
      );
    }

    // 2) Subkat o'rtacha marja vs reja (barcha sotuvi bor subkat)
    const sub = await buildSubcatMarginReport();
    if (sub && sub.count > 0) {
      const caption =
        `📊 <b>Subkat o'rtacha marja vs reja</b> (Farq = marja − reja)\n` +
        `🗓 ${sub.periodLabel} · <b>${sub.count}</b> ta subkat`;
      await tg.sendDocument(
        cfg.chatId,
        { source: sub.buffer, filename: `subkat-marja-${sub.fileTag}.xlsx` },
        { caption, parse_mode: "HTML", ...thread }
      );
    }

    return { ok: true, count: built.count };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Yuborishda xato.";
    console.error("[margin-report] sendMarginReport:", msg);
    return { ok: false, error: `Yuborilmadi: ${msg}` };
  }
}
