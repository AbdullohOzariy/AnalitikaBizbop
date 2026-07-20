/**
 * Logistika — reys holatini guruhga bitta xabar bilan ko'rsatish.
 *
 * TAMOYIL: har reysga BITTA xabar. Har hodisada (jo'nash/yetib borish/yakun) matn
 * DB'dan TO'LIQ qayta quriladi va editMessageText bilan ustiga yoziladi. Shu sabab
 * ikki hodisa deyarli bir vaqtda kelsa ham oxirgi tahrir to'g'ri holatni yozadi —
 * inkremental "qator qo'shish" naqshi bunga qodir emas edi.
 *
 * Ikkala eksport ham HECH QACHON throw qilmaydi: Telegram yiqilsa reys baribir
 * bazaga yozilgan bo'ladi, xabar — ikkilamchi.
 */
import { prisma } from "@/lib/prisma";
import { TASHKENT_OFFSET_MS } from "@/lib/date";
import { getLogistikaGroup } from "./sozlama";

/** parse_mode:"HTML" uchun eskeyplash — nuqta/mashina nomlaridagi `<`/`&` xabarni buzmasin. */
function esc(s: string | null | undefined): string {
  return (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const LOAD_LABEL: Record<string, string> = {
  EMPTY: "bo'sh",
  QUARTER: "¼",
  HALF: "½",
  FULL: "to'la",
};

const STATUS_EMOJI: Record<string, string> = {
  OPEN: "🚚",
  DONE: "✅",
  DONE_LATE: "✅",
  FORCE_CLOSED: "🔒",
  STALE: "⚠️",
  CANCELLED: "❌",
};

const STATUS_SUFFIX: Record<string, string> = {
  DONE: "yakunlandi",
  DONE_LATE: "yakunlandi (kech)",
  FORCE_CLOSED: "majburan yopildi",
  STALE: "javobsiz qoldi",
  CANCELLED: "bekor qilindi",
};

/** Toshkent devoriy vaqti bo'yicha "HH:MM". */
function soat(d: Date): string {
  const t = new Date(d.getTime() + TASHKENT_OFFSET_MS);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

/** Millisekund -> "1s 15d" / "40d". Manfiy yoki bema'ni qiymat -> null. */
function davomiylik(ms: number): string | null {
  if (!Number.isFinite(ms) || ms < 0) return null;
  const jami = Math.round(ms / 60_000);
  const s = Math.floor(jami / 60);
  const d = jami % 60;
  return s > 0 ? `${s}s ${d}d` : `${d}d`;
}

type TripFull = NonNullable<Awaited<ReturnType<typeof reysOqi>>>;

async function reysOqi(tripId: number) {
  return prisma.trip.findUnique({
    where: { id: tripId },
    select: {
      id: true,
      status: true,
      startedAt: true,
      endedAt: true,
      endReason: true,
      tgChatId: true,
      tgMessageId: true,
      actorKind: true,
      actorName: true,
      impersonationReason: true,
      driver: { select: { name: true } },
      vehicle: { select: { plateNumber: true, brand: true, model: true } },
      legs: {
        orderBy: { seq: "asc" },
        select: {
          seq: true,
          departedAt: true,
          arrivedAt: true,
          load: true,
          loadEstimated: true,
          lateReport: true,
          note: true,
          fromPoint: { select: { name: true } },
          toPoint: { select: { name: true } },
        },
      },
    },
  });
}

/** Reys xabari matni — HAR SAFAR noldan quriladi (qisman yangilash yo'q). */
function matnQur(t: TripFull): string {
  const emoji = STATUS_EMOJI[t.status] ?? "🚚";
  const suffix = STATUS_SUFFIX[t.status];

  const yopilgan = t.endedAt ?? t.legs.filter((l) => l.arrivedAt).at(-1)?.arrivedAt ?? null;
  const jamiVaqt = yopilgan ? davomiylik(yopilgan.getTime() - t.startedAt.getTime()) : null;

  const sarlavha = suffix ? `${emoji} <b>Reys #${t.id} ${suffix}</b>` : `${emoji} <b>Reys #${t.id}</b>`;
  const mashina = `<b>${esc(t.vehicle.plateNumber)}</b>${t.vehicle.brand ? ` (${esc(t.vehicle.brand)})` : ""}`;

  const bosh = [sarlavha, esc(t.driver.name), mashina];
  if (suffix) {
    bosh.push(`${t.legs.length} plecho`);
    if (jamiVaqt) bosh.push(jamiVaqt);
  }
  const qatorlar: string[] = [bosh.join(" · ")];

  for (const l of t.legs) {
    const yol = `${esc(l.fromPoint.name)} → ${esc(l.toPoint.name)}`;
    const yuk = `${LOAD_LABEL[l.load] ?? l.load}${l.loadEstimated ? " (taxmin)" : ""}`;
    if (l.arrivedAt) {
      const dur = davomiylik(l.arrivedAt.getTime() - l.departedAt.getTime());
      const vaqt = `${soat(l.departedAt)}–${soat(l.arrivedAt)}${dur ? ` (${dur})` : ""}`;
      qatorlar.push(`✅ ${yol} · ${vaqt} · ${yuk}${l.lateReport ? " · kech kiritildi" : ""}`);
    } else {
      qatorlar.push(`🔵 ${yol} · ${soat(l.departedAt)} · yo'lda · ${yuk}`);
    }
    if (l.note) qatorlar.push(`   💬 ${esc(l.note)}`);
  }

  if (t.actorKind === "CONTROLLER") {
    const sabab = t.impersonationReason ? ` (${esc(t.impersonationReason)})` : "";
    qatorlar.push(`✍️ Kiritdi: ${esc(t.actorName)} — ${esc(t.driver.name)} nomidan${sabab}`);
  } else if (t.actorKind === "SYSTEM") {
    qatorlar.push(`⚙️ Tizim kiritdi: ${esc(t.actorName)}`);
  }

  if (t.endReason) qatorlar.push(`🏁 ${esc(t.endReason)}`);

  return qatorlar.join("\n");
}

// ─── Telegram HTTP qatlami ───────────────────────────────────────────────────

type TgJavob = {
  ok: boolean;
  description?: string;
  error_code?: number;
  parameters?: { retry_after?: number };
  result?: { message_id?: number };
};

async function tgApi(metod: string, body: Record<string, unknown>): Promise<TgJavob | null> {
  const token = process.env.BOT_TOKEN;
  if (!token) return null;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/${metod}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
    return (await res.json()) as TgJavob;
  } catch (err) {
    console.error(`[logistika-notify] ${metod} tarmoq xatosi:`, err instanceof Error ? err.message : err);
    return null;
  }
}

/** 429 bo'lsa retry_after kutish (maks 10s — undan uzoq kutish so'rovni ushlab turadi). */
function retryAfterMs(j: TgJavob | null): number | null {
  if (!j || j.ok || j.error_code !== 429) return null;
  const sek = j.parameters?.retry_after ?? 1;
  return Math.min(Math.max(sek, 1), 10) * 1000;
}

function kut(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function xabarYubor(chatId: string, topicId: number | null, matn: string): Promise<number | null> {
  const body = {
    chat_id: chatId,
    text: matn,
    parse_mode: "HTML",
    disable_web_page_preview: true,
    ...(topicId ? { message_thread_id: topicId } : {}),
  };
  let j = await tgApi("sendMessage", body);
  const kutish = retryAfterMs(j);
  if (kutish) {
    await kut(kutish);
    j = await tgApi("sendMessage", body);
  }
  if (!j) return null;
  if (!j.ok) {
    console.error(`[logistika-notify] sendMessage rad etildi: ${j.description ?? "?"}`);
    return null;
  }
  return j.result?.message_id ?? null;
}

// ─── Eksportlar ──────────────────────────────────────────────────────────────

/**
 * Yangi reys uchun guruhga xabar yuboradi va message_id'ni SHARTLI yozadi.
 *
 * AWAIT qilinishi shart (fire-and-forget emas): serverless/edge muhitida javob
 * qaytgach jarayon to'xtaydi va yuborilmagan so'rov jimgina yo'qoladi.
 */
export async function reysXabarYubor(tripId: number): Promise<void> {
  try {
    const t = await reysOqi(tripId);
    if (!t) return;
    if (t.tgMessageId) {
      // Allaqachon yuborilgan — takroriy xabar o'rniga tahrir.
      await reysXabarYangila(tripId);
      return;
    }
    const { chatId, topicId } = await getLogistikaGroup();
    if (!chatId) {
      console.error("[logistika-notify] LOGISTIKA_GROUP_CHAT_ID sozlanmagan — xabar yuborilmadi");
      return;
    }
    const messageId = await xabarYubor(chatId, topicId, matnQur(t));
    if (!messageId) return;
    // SHARTLI: parallel yuborishda faqat birinchisi yozadi, ikkinchisi ustiga chiqmaydi.
    await prisma.trip.updateMany({
      where: { id: tripId, tgMessageId: null },
      data: { tgMessageId: messageId, tgChatId: chatId },
    });
  } catch (err) {
    console.error(`[logistika-notify] yubor #${tripId}:`, err instanceof Error ? err.message : err);
  }
}

/**
 * Reys holati o'zgarganda mavjud xabarni tahrirlaydi.
 * Xabar hali yuborilmagan bo'lsa — JIM chiqadi (yangi xabar yubormaydi).
 */
export async function reysXabarYangila(tripId: number): Promise<void> {
  try {
    const t = await reysOqi(tripId);
    if (!t || !t.tgMessageId) return;

    const guruh = await getLogistikaGroup();
    const chatId = t.tgChatId || guruh.chatId;
    if (!chatId) return;

    const matn = matnQur(t);
    const body = {
      chat_id: chatId,
      message_id: t.tgMessageId,
      text: matn,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    };

    let j = await tgApi("editMessageText", body);

    // 429 — bir marta kutib qayta urinamiz (yangi xabar YUBORMAYMIZ).
    const kutish = retryAfterMs(j);
    if (kutish) {
      await kut(kutish);
      j = await tgApi("editMessageText", body);
    }
    if (!j || j.ok) return;

    const d = (j.description ?? "").toLowerCase();

    // Matn o'zgarmagan — bu XATO EMAS (bir xil holat ikki marta yangilandi).
    if (d.includes("message is not modified")) return;

    // Xabar o'chirilgan — yangisini yuborib ID'ni almashtiramiz.
    if (d.includes("message to edit not found") || d.includes("message can't be edited")) {
      const yangiId = await xabarYubor(chatId, guruh.topicId, matn);
      if (yangiId) {
        await prisma.trip.update({
          where: { id: tripId },
          data: { tgMessageId: yangiId, tgChatId: chatId },
        });
      }
      return;
    }

    console.error(`[logistika-notify] edit rad etildi #${tripId}: ${j.description ?? "?"}`);
  } catch (err) {
    console.error(`[logistika-notify] yangila #${tripId}:`, err instanceof Error ? err.message : err);
  }
}
