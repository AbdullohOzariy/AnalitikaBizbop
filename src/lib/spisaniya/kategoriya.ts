/**
 * AI mahsulot kategoriyalash (Claude) — bizbop yozuvlari uchun.
 * Yangi yozuv saqlangandan keyin FONDA chaqiriladi: xato bo'lsa faqat log qiladi.
 *
 * MUHIM: AI yangi kategoriya YARATMAYDI — har mahsulotni mavjud Iyerarxiya
 * SUBKATEGORIYALARIDAN biriga biriktiradi (yoki mos kelmasa — qoldiradi).
 */
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/prisma";
import { yozuvKategoriyaSet, kategoriyasizYozuvlar } from "./db";

const MODEL = "claude-haiku-4-5";

let _client: Anthropic | null | undefined;
function getClient(): Anthropic | null {
  if (_client === undefined) {
    _client = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
  }
  return _client;
}

// ─── Subkat ro'yxati (dublikat nom → ota-kategoriya bilan farqlanadi) ──────────
type SubOpt = { id: number; label: string; group: string; cat: string; name: string };
let _subCache: { at: number; data: SubOpt[] } | null = null;

async function loadSubcats(): Promise<SubOpt[]> {
  if (_subCache && Date.now() - _subCache.at < 5 * 60_000) return _subCache.data;
  const rows = await prisma.category.findMany({
    where: { parentId: { not: null } },
    select: {
      id: true,
      name: true,
      parent: { select: { name: true, group: { select: { name: true } } } },
    },
  });
  const cnt = new Map<string, number>();
  for (const r of rows) cnt.set(r.name, (cnt.get(r.name) ?? 0) + 1);
  const data: SubOpt[] = rows.map((r) => {
    const cat = r.parent?.name ?? "-";
    const dup = (cnt.get(r.name) ?? 0) > 1;
    return {
      id: r.id,
      name: r.name,
      cat,
      group: r.parent?.group?.name ?? "-",
      label: (dup ? `${r.name} (${cat})` : r.name).slice(0, 100),
    };
  });
  _subCache = { at: Date.now(), data };
  return data;
}

function buildSystem(subs: SubOpt[]): string {
  const list = subs.map((s) => `${s.id}. ${s.group} › ${s.cat} › ${s.name}`).join("\n");
  return (
    "Sen do'kon chiqim (hisobdan chiqarilgan) mahsulotlarini mavjud SUBKATEGORIYALARGA " +
    "biriktiruvchisisan. Mahsulot nomiga eng mos subkategoriya id'sini tanla. " +
    "YANGI kategoriya YARATMA — faqat ro'yxatdagi id. Mos kelmasa id=null. Faqat JSON.\n\n" +
    "Subkategoriyalar:\n" + list
  );
}

async function aiAssign(client: Anthropic, tovar: string, subs: SubOpt[]): Promise<number | null> {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 60,
    system: [{ type: "text", text: buildSystem(subs), cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: `Mahsulot: "${tovar}"\n\nJSON: {"id": subkat_id_yoki_null}` }],
  } as unknown as Anthropic.MessageCreateParamsNonStreaming);
  const block = msg.content.find((b) => b.type === "text");
  const text = block && "text" in block ? block.text : "{}";
  const json = text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  const id = JSON.parse(json).id;
  return typeof id === "number" && subs.some((s) => s.id === id) ? id : null;
}

/** Bitta yozuvni mavjud subkatga biriktiradi. Xato bo'lsa faqat log. */
export async function kategoriyalashtirish(yozuvId: number, tovar: string): Promise<void> {
  const client = getClient();
  if (!client) {
    console.warn("[kategoriya] ANTHROPIC_API_KEY yo'q — o'tkazib yuborildi");
    return;
  }
  try {
    const subs = await loadSubcats();
    if (subs.length === 0) return;
    const id = await aiAssign(client, tovar, subs);
    if (id == null) {
      console.log(`[kategoriya] Yozuv #${yozuvId} "${tovar}" → mos subkat topilmadi`);
      return;
    }
    const label = subs.find((s) => s.id === id)!.label;
    await yozuvKategoriyaSet(yozuvId, label);
    console.log(`[kategoriya] Yozuv #${yozuvId} "${tovar}" → "${label}"`);
  } catch (err) {
    console.error(`[kategoriya] Yozuv #${yozuvId} xato:`, err instanceof Error ? err.message : err);
  }
}

/** Kategoriyasi yo'q eski yozuvlarni ketma-ket to'ldiradi. */
export async function backfill(limit = 200): Promise<{ ok: boolean; kategoriyalandi?: number; xato?: string }> {
  if (!getClient()) return { ok: false, xato: "ANTHROPIC_API_KEY yo'q" };
  const rows = await kategoriyasizYozuvlar(limit);
  let soni = 0;
  for (const r of rows) {
    await kategoriyalashtirish(r.id, r.tovar);
    soni++;
  }
  return { ok: true, kategoriyalandi: soni };
}
