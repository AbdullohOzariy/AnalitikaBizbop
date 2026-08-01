/**
 * AKSIYA SIGNALI — bugun BOSHLANADIGAN va bugun TUGAYDIGAN aksiyalar guruh topigiga.
 *
 * Nega aynan shu ikkisi: har ikkalasi ham do'konda QO'L MEHNATI talab qiladi — narx
 * yorlig'ini almashtirish va aksiya tugagach asl narxga qaytarish. Promo hisobotida
 * "narx aksiyada qolib ketdi" (`stuck`) degan alohida tekshiruv bor, ya'ni bu xato
 * amalda uchraydi. Signal aynan o'sha xatoni oldini olish uchun.
 *
 * Aksiya davom etayotgani haqida xabar YUBORILMAYDI: har kuni takrorlanadigan
 * ro'yxat e'tibordan qolib, boshlanish/tugash xabarini ham ko'mib yuborardi.
 */
import { Telegram } from "telegraf";
import { prisma } from "@/lib/prisma";
import { todayTashkentISO } from "@/lib/date";
import { redactError } from "@/lib/tg-redact";
import { getPromoAlertConfig } from "./sozlama";

const MAX_ITEMS = 12; // aksiya ichidagi SKU'lardan nechtasi ko'rsatiladi
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const NF = new Intl.NumberFormat("uz-UZ");

const TUR_NOM: Record<string, string> = {
  KUN_TAKLIFI: "Kun taklifi",
  HAFTA_CHEGIRMA: "Hafta chegirmasi",
  BIZBOP_NARX: "Bizbop narx",
  AAARZON: "A-a-arzon narx!",
  FLASH: "Flash",
};

type Aksiya = {
  id: number;
  title: string;
  type: string;
  branchName: string | null;
  endDate: Date | null;
  items: { name: string; code: number; regularPrice: unknown; promoPrice: unknown; buyQty: number | null; freeQty: number | null }[];
};

function blok(a: Aksiya, boshlanish: boolean): string {
  const tur = TUR_NOM[a.type] ?? a.type;
  const filial = a.branchName ? ` · ${esc(a.branchName)}` : " · barcha filial";
  const muddat =
    boshlanish && a.endDate ? ` · ${a.endDate.toISOString().slice(0, 10)} gacha` : "";
  const bosh = `<b>${esc(a.title)}</b> (${tur})${filial}${muddat}\n`;

  const qatorlar = a.items.slice(0, MAX_ITEMS).map((i) => {
    // N+M da dona narxi tushmaydi — chegirma o'rniga mexanika ko'rsatiladi
    if (i.buyQty != null && i.freeQty != null) {
      return `   • ${esc(i.name)} — <b>${i.buyQty}+${i.freeQty} tekin</b>`;
    }
    const reg = Number(i.regularPrice) || 0;
    const pro = Number(i.promoPrice) || 0;
    const chegirma = reg > 0 && pro > 0 ? Math.round((1 - pro / reg) * 100) : null;
    return (
      `   • ${esc(i.name)} — <s>${NF.format(Math.round(reg))}</s> → <b>${NF.format(Math.round(pro))}</b>` +
      (chegirma != null && chegirma > 0 ? ` (−${chegirma}%)` : "")
    );
  });
  const yana = a.items.length > MAX_ITEMS ? `\n   … va yana ${a.items.length - MAX_ITEMS} ta SKU` : "";
  return bosh + qatorlar.join("\n") + yana;
}

/**
 * Bugungi aksiya signalini yuboradi.
 * @param skipIfEmpty — bugun boshlanadigan/tugaydigan aksiya bo'lmasa jim chiqadi (cron uchun).
 */
export async function sendPromoAlert(
  opts?: { skipIfEmpty?: boolean }
): Promise<{ ok: true; count: number; skipped?: boolean } | { ok: false; error: string }> {
  try {
    const cfg = await getPromoAlertConfig();
    if (!cfg.token) return { ok: false, error: "Bot token sozlanmagan." };
    if (!cfg.chatId) return { ok: false, error: "Guruh chat ID sozlanmagan." };

    const sana = todayTashkentISO();
    const bugun = new Date(`${sana}T00:00:00.000Z`);
    const tanla = {
      id: true, title: true, type: true, endDate: true,
      branch: { select: { name: true } },
      items: {
        select: { productId: true, regularPrice: true, promoPrice: true, buyQty: true, freeQty: true,
          product: { select: { name: true, code: true } } },
      },
    } as const;

    // DRAFT va CANCELLED chiqarib tashlanadi: ular do'konga tegishli emas.
    const [boshlanadi, tugaydi] = await Promise.all([
      prisma.promoCampaign.findMany({
        where: { startDate: bugun, status: { in: ["ACTIVE", "DRAFT"] } },
        select: tanla,
        orderBy: { id: "asc" },
      }),
      prisma.promoCampaign.findMany({
        where: { endDate: bugun, status: { in: ["ACTIVE", "ENDED"] } },
        select: tanla,
        orderBy: { id: "asc" },
      }),
    ]);

    const map = (rows: typeof boshlanadi): Aksiya[] =>
      rows.map((c) => ({
        id: c.id, title: c.title, type: c.type, endDate: c.endDate,
        branchName: c.branch?.name ?? null,
        items: c.items.map((i) => ({
          name: i.product.name, code: i.product.code,
          regularPrice: i.regularPrice, promoPrice: i.promoPrice,
          buyQty: i.buyQty, freeQty: i.freeQty,
        })),
      }));

    const b = map(boshlanadi);
    const t = map(tugaydi);
    const jami = b.length + t.length;

    const tg = new Telegram(cfg.token);
    const thread = cfg.topicId ? { message_thread_id: cfg.topicId } : {};

    if (jami === 0) {
      if (opts?.skipIfEmpty) return { ok: true, count: 0, skipped: true };
      await tg.sendMessage(
        cfg.chatId,
        `📣 <b>Aksiyalar</b> · ${sana}\nBugun boshlanadigan yoki tugaydigan aksiya yo'q.`,
        { parse_mode: "HTML", ...thread }
      );
      return { ok: true, count: 0 };
    }

    const qismlar: string[] = [`📣 <b>Aksiyalar</b> · ${sana}`];
    if (b.length > 0) {
      qismlar.push(`\n🟢 <b>BUGUN BOSHLANADI</b> (${b.length})\nNarx yorlig'ini almashtiring:\n`);
      qismlar.push(b.map((a) => blok(a, true)).join("\n\n"));
    }
    if (t.length > 0) {
      qismlar.push(`\n🔴 <b>BUGUN TUGAYDI</b> (${t.length})\nErtaga asl narxga qaytaring:\n`);
      qismlar.push(t.map((a) => blok(a, false)).join("\n\n"));
    }

    await tg.sendMessage(cfg.chatId, qismlar.join("\n"), { parse_mode: "HTML", ...thread });
    return { ok: true, count: jami };
  } catch (err) {
    const msg = err instanceof Error ? redactError(err) : "Yuborishda xato.";
    console.error("[promo-alert] sendPromoAlert:", msg);
    return { ok: false, error: `Yuborilmadi: ${msg}` };
  }
}
