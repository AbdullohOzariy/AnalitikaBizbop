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

/** Oxirgi davr bo'yicha marjasi minus kataklar Excel buferi. null — sotuv ma'lumoti yo'q. */
export async function buildMarginReport(): Promise<
  { buffer: Buffer; count: number; periodLabel: string; fileTag: string } | null
> {
  // Oxirgi yuklangan davr (eng so'nggi periodEnd, keyin periodStart)
  const latest = await prisma.categorySales.findFirst({
    orderBy: [{ periodEnd: "desc" }, { periodStart: "desc" }],
    select: { periodStart: true, periodEnd: true },
  });
  if (!latest) return null;
  const ps = latest.periodStart.toISOString().slice(0, 10);
  const pe = latest.periodEnd.toISOString().slice(0, 10);
  const periodLabel = ps === pe ? ps : `${ps} — ${pe}`;

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
    WHERE cs."periodStart" = ${latest.periodStart}
      AND cs."periodEnd" = ${latest.periodEnd}
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
  return { buffer, count: rows.length, periodLabel, fileTag: pe };
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

    const built = await buildMarginReport();
    if (!built) {
      await tg.sendMessage(cfg.chatId, "ℹ️ <b>Marja hisoboti</b>\nSotuv ma'lumoti topilmadi.", { parse_mode: "HTML", ...thread });
      return { ok: true, count: 0 };
    }
    const { buffer, count, periodLabel, fileTag } = built;
    if (count === 0) {
      await tg.sendMessage(
        cfg.chatId,
        `✅ <b>Marja</b> · ${periodLabel}\nMarjasi minus filial×subkat topilmadi.`,
        { parse_mode: "HTML", ...thread }
      );
      return { ok: true, count: 0 };
    }
    const caption =
      `📉 <b>Marjasi MINUS</b> — filial×subkat (tannarx > sotuv)\n` +
      `🗓 ${periodLabel} · <b>${count}</b> ta katak`;
    await tg.sendDocument(
      cfg.chatId,
      { source: buffer, filename: `marja-minus-${fileTag}.xlsx` },
      { caption, parse_mode: "HTML", ...thread }
    );
    return { ok: true, count };
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Yuborishda xato.";
    console.error("[margin-report] sendMarginReport:", msg);
    return { ok: false, error: `Yuborilmadi: ${msg}` };
  }
}
