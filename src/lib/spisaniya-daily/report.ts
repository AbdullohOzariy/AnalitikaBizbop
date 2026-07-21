import { Telegram } from "telegraf";
import { getSpisaniyaDailyConfig } from "./sozlama";
import { chiqimByBranch, chiqimTopTovarlar, type ChiqimRange } from "@/lib/spisaniya/db";
import { isoDay, todayTashkentISO } from "@/lib/date";
import { redactError } from "@/lib/tg-redact";

/** HTML parse_mode uchun maxsus belgilarni eskeyplash (kategoriya/filial nomlari xom keladi). */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const NF = new Intl.NumberFormat("uz-UZ");
const money = (n: number) => NF.format(Math.round(n));

/** Kechagi kun (Toshkent UTC+5) — bir kunlik davr + ko'rinadigan sana yorlig'i. */
function yesterdayRange(): { range: ChiqimRange; label: string } {
  const todayStr = todayTashkentISO();
  const today = new Date(todayStr + "T00:00:00.000Z");
  const y = new Date(today.getTime() - 86_400_000);
  const [yy, mm, dd] = isoDay(y).split("-");
  return { range: { start: y, end: y }, label: `${dd}.${mm}.${yy}` };
}

/**
 * Kechagi kun bo'yicha indikatorli matn — jami + eng xavfli 3 ta SKU (tovar) va
 * eng xavfli filial (summa bo'yicha tartib, chiqim soni indikator sifatida).
 * Ma'lumot bo'lmasa null.
 */
export async function buildSpisaniyaDailyText(): Promise<{ text: string; total: number; label: string } | null> {
  const { range, label } = yesterdayRange();
  const [byBranch, topTovarlar] = await Promise.all([
    chiqimByBranch(range),        // ORDER BY summa DESC → [0] eng xavfli filial
    chiqimTopTovarlar(range, 3),  // summa bo'yicha top 3 tovar (SKU)
  ]);
  const total = byBranch.reduce((s, r) => s + r.summa, 0);
  const totalCount = byBranch.reduce((s, r) => s + r.count, 0);
  if (total === 0 && totalCount === 0) return null;

  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const topBranch = byBranch[0];

  const lines: string[] = [
    "📉 <b>Spisaniya — kunlik hisobot</b>",
    `🗓 ${label}`,
    "",
    `Jami chiqim: <b>${money(total)}</b> so'm · ${totalCount} ta yozuv`,
    "",
  ];
  if (topTovarlar.length > 0) {
    lines.push("🔴 <b>Eng xavfli 3 ta SKU</b>");
    topTovarlar.forEach((t, i) => {
      const kod = t.sku_kod ? ` <code>#${t.sku_kod}</code>` : "";
      lines.push(
        `   ${i + 1}. ${esc(t.tovar)}${kod} — <b>${money(t.summa)}</b> so'm · ${t.count} ta (jami ${pct(t.summa)}%)`
      );
    });
    lines.push("");
  }
  if (topBranch) {
    lines.push(
      "🏢 <b>Eng xavfli filial</b>",
      `   ${esc(topBranch.filial)} — <b>${money(topBranch.summa)}</b> so'm · ${topBranch.count} ta (jami ${pct(topBranch.summa)}%)`
    );
  }
  return { text: lines.join("\n"), total, label };
}

/**
 * Kunlik indikator hisobotini sozlangan guruh (topic) ga yuboradi.
 * Sozlanmagan bo'lsa — xato (avto-yuborishda jim o'tkaziladi).
 */
export async function sendSpisaniyaDailyReport(): Promise<{ ok: true; total: number } | { ok: false; error: string }> {
  try {
    const cfg = await getSpisaniyaDailyConfig();
    if (!cfg.token) return { ok: false, error: "Bot token sozlanmagan." };
    if (!cfg.chatId) return { ok: false, error: "Guruh chat ID sozlanmagan." };

    const tg = new Telegram(cfg.token);
    const thread = cfg.topicId ? { message_thread_id: cfg.topicId } : {};
    const built = await buildSpisaniyaDailyText();
    if (!built) {
      await tg.sendMessage(cfg.chatId, "📉 <b>Spisaniya — kunlik hisobot</b>\nKecha hisobdan chiqarish bo'lmadi.", { parse_mode: "HTML", ...thread });
      return { ok: true, total: 0 };
    }
    await tg.sendMessage(cfg.chatId, built.text, { parse_mode: "HTML", ...thread });
    return { ok: true, total: built.total };
  } catch (err) {
    const msg = err instanceof Error ? redactError(err) : "Yuborishda xato.";
    console.error("[spisaniya-daily] send:", msg);
    return { ok: false, error: `Yuborilmadi: ${msg}` };
  }
}
