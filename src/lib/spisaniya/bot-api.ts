/**
 * Spisaniya-bot HTTP API'siga server-server chaqiruvlar (yozish uchun).
 * Bot DB'ga TO'G'RIDAN-TO'G'RI yozmaymiz — bot o'zi yozadi va Telegram'ga xabar yuboradi.
 * BOT_API_URL + INTERNAL_API_TOKEN env sozlanmagan bo'lsa — aniq xato qaytaradi.
 */
const BOT_API_URL = process.env.BOT_API_URL;
const TOKEN = process.env.INTERNAL_API_TOKEN;

export function botApiConfigured(): boolean {
  return !!(BOT_API_URL && TOKEN);
}

type Result = { ok: true } | { ok: false; error: string };

/** Vozvrat nazorati statusini yangilash (bot API orqali). */
export async function patchVozvratStatus(
  yozuvId: number,
  status: string,
  firmaJavob: string | null,
  userName: string
): Promise<Result> {
  if (!BOT_API_URL || !TOKEN) {
    return { ok: false, error: "Bot API sozlanmagan (BOT_API_URL / INTERNAL_API_TOKEN)." };
  }
  try {
    const res = await fetch(`${BOT_API_URL.replace(/\/$/, "")}/api/vozvrat/${yozuvId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "x-internal-token": TOKEN,
        "x-internal-user": userName,
      },
      body: JSON.stringify({ status, firma_javob: firmaJavob }),
      // server-server — keshlanmasin
      cache: "no-store",
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return { ok: false, error: `Bot API xatosi ${res.status}: ${t.slice(0, 120)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Bot API'ga ulanib bo'lmadi." };
  }
}
