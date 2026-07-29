/**
 * Community tahlili — orkestratsiya: oyna qurish → Gemini → VALIDATSIYA → saqlash.
 *
 * ASOSIY PRINSIP: strukturali chiqish faqat JSON SHAKLINI kafolatlaydi, MAZMUNNI emas.
 * Model mavjud bo'lmagan messageId "o'ylab topishi", javobni noto'g'ri so'rovga bog'lashi,
 * javobda bo'lmagan narxni yozishi mumkin. Shuning uchun saqlashdan oldin har bir qiymat
 * transkriptga solishtirib tekshiriladi — bu bosqich BEPUL va aniqlikni eng ko'p oshiradi.
 */
import { prisma } from "@/lib/prisma";
import { callGemini, MODEL_SMART } from "./gemini";
import { PROMPT_VERSION, SYSTEM, RESPONSE_SCHEMA, type AiResult, type AiRequest } from "./prompt";
import { buildWindows, normalize, operatorMi, type Msg, type Window, type Operatorlar } from "./transcript";
import { getCommunityConfig } from "./sozlama";
import { redactError } from "@/lib/tg-redact";
import { canonKey } from "./kanon-kalit";

const KIND = new Set(["PRODUCT", "PRICE", "PROMO", "COMPLAINT", "RETURN", "SERVICE", "OTHER"]);
const STATUS = new Set(["YES", "NO", "UNANSWERED", "UNCLEAR"]);
const SCOPE = new Set(["SAME", "OTHER_BRANCH", "LINK", "UNKNOWN"]);
const LANG = new Set(["UZ", "RU", "MIX"]);

export interface AnalizNatija {
  dayKey: string;
  windows: number;
  skipped: number;
  requests: number;
  errors: number;
  inTokens: number;
  outTokens: number;
}

/** Filial nomini matndan aniqlash: "megada" → Mega Center. AI emas, SERVER hal qiladi. */
async function filialXaritasi(): Promise<{ id: number; kalitlar: string[] }[]> {
  const [branches, aliases] = await Promise.all([
    prisma.branch.findMany({ select: { id: true, name: true } }),
    prisma.branchAlias.findMany({ select: { branchId: true, alias: true } }),
  ]);
  const m = new Map<number, string[]>();
  for (const b of branches) {
    // "Mega Center" → ["mega center", "mega"] — mijoz odatda birinchi so'zni yozadi
    const nom = b.name.toLowerCase();
    const arr = [nom];
    const birinchi = nom.split(/\s+/)[0];
    if (birinchi && birinchi.length >= 4) arr.push(birinchi);
    m.set(b.id, arr);
  }
  for (const a of aliases) {
    const arr = m.get(a.branchId);
    if (arr) arr.push(a.alias.toLowerCase());
  }
  return [...m.entries()].map(([id, kalitlar]) => ({ id, kalitlar }));
}

function branchTop(
  text: string,
  xarita: { id: number; kalitlar: string[] }[]
): number | null {
  const t = text.trim().toLowerCase();
  if (!t) return null;
  for (const b of xarita) {
    if (b.kalitlar.some((k) => t.includes(k) || k.includes(t))) return b.id;
  }
  return null;
}

/** Matndagi raqamlar (narx tasdiqlash uchun): "3990so'm/kg" → [3990]. */
function raqamlar(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/\d[\d\s.,]*/g)) {
    const n = Number(m[0].replace(/[\s.,]/g, ""));
    if (Number.isFinite(n) && n > 0) out.push(n);
  }
  return out;
}

interface Tayyor {
  messageId: number;
  normKey: string | null;
  itemIndex: number;
  askedAt: Date;
  kind: string;
  status: string;
  answerScope: string | null;
  lang: string;
  asksPrice: boolean;
  asksPhoto: boolean;
  productText: string | null;
  productNorm: string | null;
  searchTerms: string[];
  brand: string | null;
  branchId: number | null;
  priceQuoted: number | null;
  priceUnit: string | null;
  firstAnswerAt: Date | null;
  answerMinutes: number | null;
  answerIds: number[];
  confidence: number;
  note: string | null;
}

/**
 * AI yozuvlarini transkriptga solishtirib tekshiradi. Qaytadi: saqlashga yaroqli yozuvlar.
 * Yaroqsizlari JIMGINA tashlanadi (yolg'on statistikadan ko'ra kam ma'lumot yaxshiroq).
 */
export function validatsiya(
  items: AiRequest[],
  w: Window,
  ops: Operatorlar,
  xarita: { id: number; kalitlar: string[] }[]
): Tayyor[] {
  const byId = new Map(w.all.map((m) => [m.messageId, m]));
  const out: Tayyor[] = [];
  const korilgan = new Set<string>();

  for (const it of items) {
    // (1) messageId CORE ichida bo'lishi SHART — model ID o'ylab topgan bo'lishi mumkin
    if (!w.coreIds.has(it.messageId)) continue;
    const savol = byId.get(it.messageId);
    if (!savol) continue;
    // Operatorning o'z xabari so'rov bo'la olmaydi
    if (operatorMi(savol, ops)) continue;

    const kalit = `${it.messageId}:${it.itemIndex ?? 0}`;
    if (korilgan.has(kalit)) continue; // model dublikat qaytargan
    korilgan.add(kalit);

    // (2) javob ID'lari: oyna ichida + OPERATOR yuborgan + savoldan KEYIN
    const answerIds = (it.answerMessageIds ?? []).filter((id) => {
      const a = byId.get(id);
      return !!a && operatorMi(a, ops) && a.sentAt.getTime() >= savol.sentAt.getTime();
    });

    // (3) YES/NO da kamida bitta TASDIQLANGAN javob bo'lishi shart
    let status = STATUS.has(it.status) ? it.status : "UNCLEAR";
    if ((status === "YES" || status === "NO") && answerIds.length === 0) status = "UNCLEAR";
    if (status === "UNANSWERED" && answerIds.length > 0) status = "UNCLEAR";

    const javoblar = answerIds
      .map((id) => byId.get(id)!)
      .sort((a, b) => a.sentAt.getTime() - b.sentAt.getTime());
    const firstAnswerAt = javoblar[0]?.sentAt ?? null;

    // (4) narx: javob matnida RAQAM sifatida uchramasa — ishonmaymiz
    let priceQuoted: number | null = null;
    if (typeof it.priceQuoted === "number" && it.priceQuoted > 0) {
      const bor = javoblar.some((a) => raqamlar(normalize(a.text)).includes(it.priceQuoted!));
      if (bor) priceQuoted = it.priceQuoted;
    }

    // (5) filialni SERVER aniqlaydi
    const branchId = branchTop(it.branchText ?? "", xarita);

    // (6) javob vaqti SERVERDA hisoblanadi — modelga daqiqa sanatilmaydi
    const answerMinutes = firstAnswerAt
      ? Math.max(0, Math.round((firstAnswerAt.getTime() - savol.sentAt.getTime()) / 60_000))
      : null;

    const norm = (it.productNorm ?? "").trim().slice(0, 120);
    out.push({
      messageId: it.messageId,
      itemIndex: Math.max(0, Math.min(9, it.itemIndex ?? 0)),
      askedAt: savol.sentAt,
      kind: KIND.has(it.kind) ? it.kind : "OTHER",
      status,
      answerScope: it.answerScope && SCOPE.has(it.answerScope) ? it.answerScope : null,
      lang: it.lang && LANG.has(it.lang) ? it.lang : "MIX",
      asksPrice: !!it.asksPrice,
      asksPhoto: !!it.asksPhoto,
      productText: (it.productText ?? "").trim().slice(0, 120) || null,
      productNorm: norm || null,
      // canonKey — kanon reyestriga bog'lash va "shu nomdagi hammasiga qo'llash" kaliti
      normKey: canonKey(norm) || null,
      searchTerms: (it.searchTerms ?? []).map((s) => s.trim()).filter(Boolean).slice(0, 4),
      brand: (it.brand ?? "").trim().slice(0, 60) || null,
      branchId,
      priceQuoted,
      priceUnit: it.priceUnit === "KG" || it.priceUnit === "DONA" ? it.priceUnit : null,
      firstAnswerAt,
      answerMinutes,
      answerIds,
      confidence: Math.max(0, Math.min(1, Number(it.confidence) || 0)),
      note: status === "UNCLEAR" ? (it.note ?? "").trim().slice(0, 160) || null : null,
    });
  }
  return out;
}

/**
 * Bir kunni tahlil qiladi. `force` bo'lmasa, `inputHash` + `promptVersion` + `model`
 * o'zgarmagan oynalar QAYTA TAHLIL QILINMAYDI (Gemini chaqirilmaydi).
 */
export async function analizQil(opts: {
  chatId: bigint;
  dayKey: string;
  force?: boolean;
  onProgress?: (m: string) => void;
}): Promise<AnalizNatija> {
  const cfg = await getCommunityConfig();
  const model = cfg.model || MODEL_SMART;
  const ops: Operatorlar = { ids: new Set(cfg.operatorIds), names: new Set(cfg.operatorNames) };
  const log = opts.onProgress ?? (() => {});

  const rows = await prisma.tgGroupMessage.findMany({
    where: { chatId: opts.chatId, dayKey: opts.dayKey },
    orderBy: [{ sentAt: "asc" }, { messageId: "asc" }],
    select: {
      messageId: true,
      sentAt: true,
      fromId: true,
      fromName: true,
      fromBot: true,
      text: true,
      mediaKind: true,
      replyToId: true,
      editedAt: true,
    },
  });

  const natija: AnalizNatija = {
    dayKey: opts.dayKey,
    windows: 0,
    skipped: 0,
    requests: 0,
    errors: 0,
    inTokens: 0,
    outTokens: 0,
  };
  if (rows.length === 0) return natija;

  const windows = buildWindows(rows as Msg[], ops);
  natija.windows = windows.length;
  if (windows.length === 0) return natija;

  const xarita = await filialXaritasi();

  const mavjud = await prisma.tgAnalysisWindow.findMany({
    where: { chatId: opts.chatId, dayKey: opts.dayKey },
  });
  const mavjudMap = new Map(mavjud.map((x) => [x.seq, x]));

  for (const w of windows) {
    const eski = mavjudMap.get(w.seq);
    const ozgarmagan =
      eski &&
      eski.status === "OK" &&
      eski.inputHash === w.inputHash &&
      eski.promptVersion === PROMPT_VERSION &&
      eski.model === model;
    if (ozgarmagan && !opts.force) {
      natija.skipped++;
      continue;
    }

    try {
      log(`oyna #${w.seq} (${w.msgCount} xabar) → ${model}`);
      const out = await callGemini({
        model,
        system: SYSTEM,
        input: w.text,
        schema: RESPONSE_SCHEMA as unknown as Record<string, unknown>,
        apiKey: cfg.apiKey ?? undefined,
      });
      natija.inTokens += out.inTokens;
      natija.outTokens += out.outTokens;

      const parsed = JSON.parse(out.text) as AiResult;
      const tayyor = validatsiya(parsed.requests ?? [], w, ops, xarita);

      await prisma.$transaction(async (tx) => {
        const win = await tx.tgAnalysisWindow.upsert({
          where: { chatId_dayKey_seq: { chatId: opts.chatId, dayKey: opts.dayKey, seq: w.seq } },
          create: {
            chatId: opts.chatId,
            dayKey: opts.dayKey,
            seq: w.seq,
            firstMessageId: w.firstMessageId,
            lastMessageId: w.lastMessageId,
            msgCount: w.msgCount,
            inputHash: w.inputHash,
            promptVersion: PROMPT_VERSION,
            model,
            status: "OK",
            inTokens: out.inTokens,
            outTokens: out.outTokens,
          },
          update: {
            firstMessageId: w.firstMessageId,
            lastMessageId: w.lastMessageId,
            msgCount: w.msgCount,
            inputHash: w.inputHash,
            promptVersion: PROMPT_VERSION,
            model,
            status: "OK",
            error: null,
            inTokens: out.inTokens,
            outTokens: out.outTokens,
            analyzedAt: new Date(),
          },
        });

        // Qayta tahlilda eski yozuvlar to'liq almashadi — qo'lda tuzatilgan
        // moslik (TgProductAlias) alohida jadvalda, shuning uchun yo'qolmaydi.
        await tx.tgRequest.deleteMany({ where: { windowId: win.id } });
        if (tayyor.length > 0) {
          await tx.tgRequest.createMany({
            data: tayyor.map((t) => ({
              windowId: win.id,
              chatId: opts.chatId,
              dayKey: opts.dayKey,
              ...t,
            })),
            skipDuplicates: true,
          });
        }
        natija.requests += tayyor.length;
      });
      log(`  → ${tayyor.length} so'rov`);
    } catch (err) {
      natija.errors++;
      const xato = redactError(err).slice(0, 300);
      log(`  ✗ ${xato}`);
      await prisma.tgAnalysisWindow.upsert({
        where: { chatId_dayKey_seq: { chatId: opts.chatId, dayKey: opts.dayKey, seq: w.seq } },
        create: {
          chatId: opts.chatId,
          dayKey: opts.dayKey,
          seq: w.seq,
          firstMessageId: w.firstMessageId,
          lastMessageId: w.lastMessageId,
          msgCount: w.msgCount,
          inputHash: w.inputHash,
          promptVersion: PROMPT_VERSION,
          model,
          status: "ERROR",
          error: xato,
        },
        update: { status: "ERROR", error: xato, analyzedAt: new Date() },
      });
      // Bitta oyna xatosi qolganlarini to'xtatmaydi
    }
  }

  return natija;
}
