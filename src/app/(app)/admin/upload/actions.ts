"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { timingSafeEqual } from "node:crypto";
import { isoDay, todayTashkentISO } from "@/lib/date";
import { after } from "next/server";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { FileType, AliasSource, UploadStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
import { requireAdminUser } from "@/lib/auth-helpers";
import { ANALYTICS_CACHE_TAG } from "@/lib/analytics";
import { warmAnalyticsCaches } from "@/lib/warm";
import { updateProductMatrixClasses } from "@/lib/abc-xyz";
import { actionError } from "@/lib/action-error";
import { sha256, parseAmount } from "@/lib/parsers/utils";
import { parseSalesWorkbook } from "@/lib/parsers/sales";
import { parseVisitsWorkbook } from "@/lib/parsers/visits";
import { matchCategoryNames, matchBranchAlias } from "@/lib/ai-matcher";

export type UploadResult =
  | { ok: true; fileId: number; summary: string; aiCorrections?: string[] }
  | { ok: false; error: string };

const labelSchema = z.string().trim().min(1, "Fayl uchun nom kiriting").max(120);

// Xom ProductSales necha oy saqlanadi (eskirog'i yuklashda tozalanadi). Tahlil
// tarixi CategorySales rollup'ida qoladi. Env bilan moslash mumkin.
const PRODUCTSALES_RETENTION_MONTHS = Number(process.env.PRODUCTSALES_RETENTION_MONTHS) || 24;

async function readBuffer(file: File): Promise<Buffer> {
  const bytes = await file.arrayBuffer();
  return Buffer.from(bytes);
}

async function ensureNotDuplicate(hash: string) {
  const existing = await prisma.uploadedFile.findUnique({
    where: { fileHash: hash },
    select: { id: true, label: true, createdAt: true, status: true },
  });
  if (!existing) return;
  // Chala qolgan (FAILED) yozuv qayta yuklashni bloklamasin — tozalaymiz va davom etamiz.
  if (existing.status === UploadStatus.FAILED) {
    await prisma.uploadedFile.delete({ where: { id: existing.id } }).catch(() => null);
    return;
  }
  throw new Error(
    `Bu fayl avval yuklangan ("${existing.label}", ${existing.createdAt.toLocaleDateString("uz-UZ")}). Yangi nusxa yuklash uchun fayl ichini o'zgartiring.`
  );
}

/**
 * Kirill/Lotin aralash harflardagi farqlarni yo'qotib normalizatsiya qiladi.
 * Masalan, Kirill 'О' (U+041E) == Lotin 'O' (U+004F) ko'rinishi bir xil lekin boshqa.
 */
function normalizeAlias(s: string): string {
  const cyToLat: Record<string, string> = {
    'А':'A','В':'B','С':'C','Е':'E','Н':'H','К':'K','М':'M',
    'О':'O','Р':'P','Т':'T','Х':'X','І':'I','Ї':'I',
    'а':'a','е':'e','о':'o','р':'p','с':'c','х':'x','у':'y','і':'i','ї':'i',
  };
  return [...s.trim()]
    .map(c => cyToLat[c] ?? c)
    .join('')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function resolveBranch(alias: string, source: AliasSource): Promise<number> {
  // 1. Case-insensitive DB lookup
  const a = await prisma.branchAlias.findFirst({
    where: { alias: { equals: alias.trim(), mode: "insensitive" }, source },
    select: { branchId: true },
  });
  if (a) return a.branchId;

  // 2. Homoglyph-normalized in-memory lookup (Kirill/Lotin aralash harflar uchun)
  const all = await prisma.branchAlias.findMany({
    where: { source },
    select: { branchId: true, alias: true },
  });
  const normIncoming = normalizeAlias(alias);
  const match = all.find(r => normalizeAlias(r.alias) === normIncoming);
  if (match) return match.branchId;

  throw new Error(`not_found:${alias}`);
}

/**
 * Avval DB'dan qidiradi. Topilmasa DeepSeek'ga so'raydi.
 * AI topsa — alias'ni DB'ga saqlaydi (keyingi yuklashlarda AI kerak bo'lmaydi).
 * @returns { branchId, aiUsed, branchName }
 */
async function resolveBranchWithAI(
  alias: string,
  source: AliasSource
): Promise<{ branchId: number; aiUsed: boolean; branchName: string }> {
  // 1. Aniq moslik
  try {
    const id = await resolveBranch(alias, source);
    const branch = await prisma.branch.findUnique({ where: { id }, select: { name: true } });
    return { branchId: id, aiUsed: false, branchName: branch?.name ?? "" };
  } catch (e) {
    if (!(e instanceof Error && e.message.startsWith("not_found:"))) throw e;
  }

  // 2. AI fallback
  if (!process.env.DEEPSEEK_API_KEY) {
    throw new Error(
      `Filial nomi tanilmadi: "${alias}" (${source}). Filiallar bo'limidan alias qo'shing.`
    );
  }

  const branches = await prisma.branch.findMany({
    include: { aliases: { where: { source }, select: { alias: true } } },
  });
  const branchesForAI = branches.map((b) => ({
    id: b.id,
    name: b.name,
    existingAliases: b.aliases.map((a) => a.alias),
  }));

  const match = await matchBranchAlias(alias, branchesForAI).catch(() => null);
  if (!match) {
    const charCodes = [...alias].map(c => `${c}(${c.codePointAt(0)?.toString(16)})`).join('');
    throw new Error(
      `Filial nomi tanilmadi: "${alias}" (${source}). AI ham aniqlay olmadi — alias qo'shing.\nDebug: ${charCodes}`
    );
  }

  // 3. AI topgan aliasni DB'ga saqlash (keyingi safar AI kerak bo'lmaydi)
  await prisma.branchAlias.create({
    data: { branchId: match.branchId, alias: alias.trim(), source },
  }).catch(() => null); // unique constraint xatosini e'tiborsiz qoldirish

  return { branchId: match.branchId, aiUsed: true, branchName: match.branchName };
}

async function getCategoryMap(): Promise<Map<string, number>> {
  const cats = await prisma.category.findMany({ select: { id: true, name: true } });
  return new Map(cats.map((c) => [c.name, c.id]));
}

// ============ SALES ============

const salesInputSchema = z.object({
  label: labelSchema,
  // Kunlik sotuv sanasi (qo'lda). Berilsa fayl sarlavhasi o'rniga ishlatiladi.
  period: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana YYYY-MM-DD").optional(),
});

/** "YYYY-MM-DD" → { start, end } (kunlik: start=end=o'sha kun). */
function periodFromInput(s: string | undefined): { start: Date; end: Date } | undefined {
  if (!s) return undefined;
  const [y, m, d] = s.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return Number.isNaN(dt.getTime()) ? undefined : { start: dt, end: dt };
}

export async function uploadSalesAction(formData: FormData): Promise<UploadResult> {
  try {
    const user = await requireAdminUser();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Fayl tanlanmagan." };
    }
    return await salesImportCore(
      file,
      String(formData.get("label") ?? ""),
      (formData.get("period") as string) || undefined,
      user,
    );
  } catch (err) {
    return actionError(err, "upload");
  }
}

/**
 * Sotuv importi YADROSI (auth'siz). `uploadSalesAction` (admin sessiyasi) va
 * `importSalesViaToken` (1C token) ikkalasi ham shuni chaqiradi. `user` faqat
 * uploadedById uchun kerak (Number(user.id)). Xato — throw (chaqiruvchi ushlaydi).
 */
async function salesImportCore(
  file: File,
  rawLabel: string,
  rawPeriod: string | undefined,
  user: { id: string | number },
): Promise<UploadResult> {
    const parsed = salesInputSchema.parse({
      label: rawLabel,
      period: rawPeriod,
    });
    const periodOverride = periodFromInput(parsed.period);

    const buf = await readBuffer(file);
    const hash = sha256(buf);
    await ensureNotDuplicate(hash);

    const cats = await getCategoryMap();
    const catNames = [...cats.keys()];
    const aiCorrections: string[] = [];

    // DB'dan Category.code to'plamini olish (v3 uchun iyerarxiya aniqlash)
    const categoryCodeRecords = await prisma.category.findMany({
      select: { id: true, code: true },
    });
    const groupCodeRecords = await prisma.categoryGroup.findMany({
      select: { code: true },
    });
    // Ierarxiya qatorlarini tanish uchun: guruh ∪ kategoriya ∪ subkategoriya kodlari.
    const categoryCodes = new Set<number>([
      ...categoryCodeRecords.flatMap((c) => (c.code != null ? [c.code] : [])),
      ...groupCodeRecords.flatMap((g) => (g.code != null ? [g.code] : [])),
    ]);
    const categoryCodeToId = new Map<number, number>(
      categoryCodeRecords.flatMap((c) =>
        c.code != null ? [[c.code, c.id]] : []
      )
    );

    // 1. Birinchi parse — aniq mosliklar bilan (v3 uchun categoryCodes ham uzatiladi)
    const firstParse = parseSalesWorkbook(buf, catNames, undefined, categoryCodes, periodOverride);

    if (firstParse.version === "v3") {
      // ── v3: mahsulot (SKU) darajasi ──────────────────────────────────────
      return await uploadV3(
        firstParse,
        buf,
        hash,
        file,
        parsed,
        user,
        categoryCodeToId,
        aiCorrections
      );
    }

    // ── v1/v2: kategoriya darajasi ────────────────────────────────────────
    // Bu yerda firstParse.version = "v1" | "v2" — TypeScript toraytirishi to'g'ri
    type LegacyResult = Extract<
      ReturnType<typeof parseSalesWorkbook>,
      { version: "v1" | "v2" }
    >;
    let legacyResult: LegacyResult = firstParse;

    // 2. AI: noma'lum kategoriyalarni moslashtirish
    if (legacyResult.skippedCategories.length > 0 && process.env.DEEPSEEK_API_KEY) {
      const categoryMapping = await matchCategoryNames(
        legacyResult.skippedCategories,
        catNames
      ).catch(() => new Map<string, string>());

      if (categoryMapping.size > 0) {
        const reParsed = parseSalesWorkbook(buf, catNames, categoryMapping, categoryCodes, periodOverride);
        if (reParsed.version !== "v3") {
          legacyResult = reParsed;
        }
        for (const [excel, db] of categoryMapping) {
          aiCorrections.push(`Kategoriya: "${excel}" → "${db}"`);
        }
      }
    }

    // 3. Filial aliaslarini yechish (AI fallback bilan)
    const uniqueAliases = [...new Set(legacyResult.rows.map((r) => r.branchAlias))];
    const aliasToBranchId = new Map<string, number>();
    for (const alias of uniqueAliases) {
      const resolved = await resolveBranchWithAI(alias, AliasSource.SALES);
      aliasToBranchId.set(alias, resolved.branchId);
      if (resolved.aiUsed) {
        aiCorrections.push(
          `Filial: "${alias}" → "${resolved.branchName}" (AI, alias saqlandi)`
        );
      }
    }

    // UploadedFile + CategorySales bitta tranzaksiyada — yarmi yozilib uzilsa,
    // SUCCESS-statusli "osilgan" yozuv qolib hash'ni band qilmasin.
    const fileRecord = await prisma.$transaction(
      async (tx) => {
        const rec = await tx.uploadedFile.create({
          data: {
            label: parsed.label,
            originalName: file.name,
            fileHash: hash,
            fileType: FileType.SALES,
            periodStart: legacyResult.periodStart,
            periodEnd: legacyResult.periodEnd,
            templateVersion: legacyResult.version,
            rowCount: legacyResult.rows.length,
            status: UploadStatus.SUCCESS,
            uploadedById: Number(user.id),
          },
        });
        const values = legacyResult.rows.map((row) => {
          const branchId = aliasToBranchId.get(row.branchAlias)!;
          const categoryId = cats.get(row.categoryName)!;
          const cost = row.costAmount != null ? new Prisma.Decimal(row.costAmount) : null;
          return Prisma.sql`(${rec.id}, ${branchId}, ${categoryId}, ${legacyResult.periodStart}::date, ${legacyResult.periodEnd}::date, ${new Prisma.Decimal(row.amount)}, ${cost})`;
        });
        await tx.$executeRaw`
          INSERT INTO "CategorySales" ("uploadedFileId", "branchId", "categoryId", "periodStart", "periodEnd", "amount", "costAmount")
          VALUES ${Prisma.join(values)}
          ON CONFLICT ("branchId", "categoryId", "periodStart", "periodEnd")
          DO UPDATE SET
            "uploadedFileId" = EXCLUDED."uploadedFileId",
            "amount"         = EXCLUDED."amount",
            "costAmount"     = EXCLUDED."costAmount"
        `;
        return rec;
      },
      { timeout: 30_000 }
    );

    revalidatePath("/admin/files");
    revalidatePath("/dashboard");
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    // Javob qaytgach fonda: SKU matritsa sinflari + kesh isitish
    after(async () => {
      await updateProductMatrixClasses();
      await warmAnalyticsCaches("upload");
    });

    const branchCount = uniqueAliases.length;
    return {
      ok: true,
      fileId: fileRecord.id,
      aiCorrections: aiCorrections.length > 0 ? aiCorrections : undefined,
      summary: `Saqlandi: ${legacyResult.rows.length} qator (${branchCount} filial), period ${isoDay(legacyResult.periodStart)} → ${isoDay(legacyResult.periodEnd)}.`,
    };
}

async function resolveImportUser(): Promise<{ id: number }> {
  const u = await prisma.user.findFirst({
    where: { OR: [{ role: "SYSTEM_ADMIN" }, { extraRoles: { has: "SYSTEM_ADMIN" } }] },
    orderBy: { id: "asc" },
    select: { id: true },
  });
  if (!u) throw new Error("Import uchun tizim foydalanuvchisi (SYSTEM_ADMIN) topilmadi.");
  return u;
}

/** Doimiy-vaqt token solishtirish (uzunlik farqi ochilib qolmasin). */
function timingSafeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * 1C avto sotuv importi — IMPORT_TOKEN bilan himoyalangan (sessiyasiz). HTTP route
 * /api/import/sales shu funksiyani chaqiradi. Fayl mavjud sotuv-import quvuridan
 * o'tadi (parse → uploadV3/v1v2 → ProductSales/CategorySales). Foydalanuvchi — eng
 * eski SYSTEM_ADMIN (uploadedById uchun). Dublikat fayl hash bo'yicha o'tkazib yuboriladi.
 */
export async function importSalesViaToken(input: {
  token: string;
  filename: string;
  label?: string;
  period?: string;
  bytes: ArrayBuffer;
}): Promise<UploadResult> {
  try {
    const expected = process.env.IMPORT_TOKEN ?? "";
    if (expected.length < 16) return { ok: false, error: "IMPORT_TOKEN sozlanmagan (server)." };
    if (!input.token || !timingSafeEq(input.token, expected)) return { ok: false, error: "Token noto'g'ri." };
    if (input.bytes.byteLength === 0) return { ok: false, error: "Bo'sh fayl." };
    const user = await resolveImportUser();
    const file = new File([input.bytes], input.filename || "1c-sales.xlsx");
    const label = input.label?.trim() || `1C avto ${todayTashkentISO()}`;
    return await salesImportCore(file, label, input.period, user);
  } catch (err) {
    return actionError(err, "import-api");
  }
}

// ─── 1C JSON kunlik import (/api/import/kunlik) ──────────────────────────────
// Kontrakt (1C "Сотув + Остатка" ko'rinishiga mos): { sana, sotuv: [{filial,
// skladKod?, kod, nom, artikul?, qoldiq?, soni?, narx?, tannarx?, summa?,
// tansumma?}], sklad?: [{kod, qoldiq}] }. Markaziy sklad qatorlari (skladKod
// "Markaziy" yoki filial nomida "марказий/markaziy") — WarehouseStock'ga; qolgan
// sotuv qatorlari mavjud v3 quvuriga (Product upsert → ProductSales →
// CategorySales derive → denorm → kesh).

// 1C raqamlarni string yuborishi mumkin ("58,000" / "34 990,0") — parseAmount tushunadi.
const jsonNum = (min: number, max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" ? parseAmount(v) : v),
    z.number().min(min).max(max).nullish()
  );

const jsonRowSchema = z.object({
  filial: z.string().trim().min(1).max(150),
  skladKod: z.string().trim().max(100).nullish(), // filial qisqa kodi (GoldMart, MEGA...) — moslashda ustuvor
  kod: z.coerce.number().int().positive(),
  nom: z.string().trim().min(1).max(300),
  artikul: z.string().trim().max(200).nullish(), // 1C artikul — hozircha saqlanmaydi (qabul qilinadi)
  qoldiq: jsonNum(-1_000_000_000, 1_000_000_000),
  soni: jsonNum(-1_000_000_000, 1_000_000_000),
  narx: jsonNum(0, 1_000_000_000_000),
  tannarx: jsonNum(0, 1_000_000_000_000),
  summa: jsonNum(-1e15, 1e15),
  tansumma: jsonNum(-1e15, 1e15),
});

const jsonImportSchema = z.object({
  sana: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "sana YYYY-MM-DD bo'lsin"),
  sotuv: z.array(jsonRowSchema).min(1, "sotuv bo'sh").max(100_000),
  sklad: z
    .array(z.object({ kod: z.coerce.number().int().positive(), qoldiq: jsonNum(-1e9, 1e9) }))
    .max(100_000)
    .optional(),
});

/** Markaziy sklad qatorimi — skladKod "Markaziy" yoki filial nomida "марказий склад". */
function isMarkaziySklad(r: { filial: string; skladKod?: string | null }): boolean {
  const kod = (r.skladKod ?? "").trim().toLowerCase();
  if (kod === "markaziy" || kod === "марказий") return true;
  const f = r.filial.toLowerCase();
  return f.includes("марказий") || f.includes("markaziy");
}

/**
 * 1C kunlik JSON importi — IMPORT_TOKEN bilan (sessiyasiz). Route: /api/import/kunlik.
 * Bir xil body ikki marta kelsa hash bo'yicha dublikat deb o'tkazib yuboriladi.
 */
export async function importSalesJsonViaToken(input: {
  token: string;
  body: unknown;
}): Promise<UploadResult & { sklad?: { updated: number; unknownCodes: number[] } }> {
  try {
    const expected = process.env.IMPORT_TOKEN ?? "";
    if (expected.length < 16) return { ok: false, error: "IMPORT_TOKEN sozlanmagan (server)." };
    if (!input.token || !timingSafeEq(input.token, expected)) return { ok: false, error: "Token noto'g'ri." };

    const parsed = jsonImportSchema.safeParse(input.body);
    if (!parsed.success) {
      const i = parsed.error.issues[0];
      return { ok: false, error: `Body noto'g'ri: ${i?.path.join(".")} — ${i?.message}` };
    }
    const p = parsed.data;
    const user = await resolveImportUser();

    const day = new Date(p.sana + "T00:00:00.000Z");
    if (Number.isNaN(day.getTime())) return { ok: false, error: "sana noto'g'ri." };

    // Markaziy sklad qatorlari (skladKod "Markaziy" / nomida "марказий") filial sotuviga
    // kirmaydi — WarehouseStock'ga boradi. Qolganlari — filial kesimidagi sotuv/qoldiq.
    const filialRows = p.sotuv.filter((r) => !isMarkaziySklad(r));
    const markaziyRows = p.sotuv.filter(isMarkaziySklad);

    // JSON qatorlari → v3 parse natijasi shakli (mavjud quvur bilan bir xil semantika).
    const productRows = filialRows.map((r) => {
      const soni = r.soni ?? null;
      const narx = r.narx ?? null;
      const tannarx = r.tannarx ?? null;
      const amount = r.summa ?? (soni != null && narx != null ? soni * narx : 0);
      const costAmount = r.tansumma ?? (soni != null && tannarx != null ? soni * tannarx : null);
      return {
        // Moslashda skladKod (qisqa, barqaror) ustuvor; bo'lmasa to'liq nom
        branchAlias: r.skladKod?.trim() || r.filial,
        productCode: r.kod,
        productName: r.nom,
        parentCategoryCode: null, // kategoriya master (iyerarxiya) dan olinadi
        stockQty: r.qoldiq ?? null,
        soldQty: soni,
        amount,
        costAmount,
        salePrice: narx,
        costPrice: tannarx,
      };
    });

    const buf = Buffer.from(JSON.stringify(input.body));
    const hash = sha256(buf);
    await ensureNotDuplicate(hash);

    let upload: UploadResult = {
      ok: true,
      fileId: 0,
      summary: "Filial sotuv qatorlari yo'q (faqat markaziy sklad).",
    };
    if (productRows.length > 0) {
      const result = {
        version: "v3" as const,
        periodStart: day,
        periodEnd: day,
        productRows,
        categoryRowCount: 0,
      };
      const file = new File([new Uint8Array(buf)], `1c-kunlik-${p.sana}.json`);
      const label = `1C JSON ${p.sana}`;
      upload = await uploadV3(result, buf, hash, file, { label }, user, new Map(), []);
      if (!upload.ok) return upload;
    }

    // Markaziy sklad qoldig'i — WarehouseStock upsert (kod → productId topilganlar).
    // Manba: sotuv ichidagi markaziy qatorlar + (ixtiyoriy) alohida sklad[] massivi.
    const skladInput = [
      ...markaziyRows.map((r) => ({ kod: r.kod, qoldiq: r.qoldiq ?? null })),
      ...(p.sklad ?? []),
    ].filter((s): s is { kod: number; qoldiq: number } => s.qoldiq != null);
    let sklad: { updated: number; unknownCodes: number[] } | undefined;
    if (skladInput.length > 0) {
      const byCode = new Map<number, number>(); // oxirgisi g'olib
      for (const s of skladInput) byCode.set(s.kod, s.qoldiq);
      const skladRows = [...byCode.entries()].map(([kod, qoldiq]) => ({ kod, qoldiq }));
      const codes = skladRows.map((s) => s.kod);
      const prods = await prisma.product.findMany({
        where: { code: { in: codes } },
        select: { id: true, code: true },
      });
      const idByCode = new Map(prods.map((x) => [x.code, x.id]));
      const rows = skladRows.filter((s) => idByCode.has(s.kod));
      const BATCH = 1000;
      for (let i = 0; i < rows.length; i += BATCH) {
        const chunk = rows.slice(i, i + BATCH);
        const vals = chunk.map(
          (s) => Prisma.sql`(${idByCode.get(s.kod)!}::int, ${new Prisma.Decimal(s.qoldiq)}::numeric)`
        );
        await prisma.$executeRaw`
          INSERT INTO "WarehouseStock" ("productId", "qty", "updatedAt")
          SELECT v.pid, v.q, now() FROM (VALUES ${Prisma.join(vals)}) AS v(pid, q)
          ON CONFLICT ("productId") DO UPDATE SET "qty" = EXCLUDED."qty", "updatedAt" = now()
        `;
      }
      sklad = {
        updated: rows.length,
        unknownCodes: codes.filter((c) => !idByCode.has(c)).slice(0, 20),
      };
    }

    return { ...upload, sklad };
  } catch (err) {
    return actionError(err, "import-json");
  }
}

// ─── v3 upload oqimi: Product upsert → ProductSales upsert → CategorySales derive ─

async function uploadV3(
  result: Extract<import("@/lib/parsers/sales").ParsedSalesResult, { version: "v3" }>,
  _buf: Buffer,
  hash: string,
  file: File,
  parsed: { label: string },
  user: { id: string | number },
  categoryCodeToId: Map<number, number>,
  aiCorrections: string[]
): Promise<UploadResult> {
  // 1. Filial aliaslarini yechish
  const uniqueAliases = [
    ...new Set(result.productRows.map((r) => r.branchAlias)),
  ];
  // Fayldagi qator soni = noyob SKU soni (Excel'da har SKU bitta qator; filiallar ustun)
  const uniqueProdCount = new Set(result.productRows.map((r) => r.productCode)).size;
  const aliasToBranchId = new Map<string, number>();
  for (const alias of uniqueAliases) {
    const resolved = await resolveBranchWithAI(alias, AliasSource.SALES);
    aliasToBranchId.set(alias, resolved.branchId);
    if (resolved.aiUsed) {
      aiCorrections.push(
        `Filial: "${alias}" → "${resolved.branchName}" (AI, alias saqlandi)`
      );
    }
  }

  // 2. UploadedFile yozuvi — FAILED bilan boshlaymiz: ko'p bosqichli oqim o'rtasida
  // uzilsa, SUCCESS ko'rinishidagi chala yozuv qolmasin (hash'ni ham bloklamaydi —
  // ensureNotDuplicate FAILED'ni tozalab o'tkazadi). Oxirida SUCCESS'ga o'tadi.
  const fileRecord = await prisma.uploadedFile.create({
    data: {
      label: parsed.label,
      originalName: file.name,
      fileHash: hash,
      fileType: FileType.SALES,
      periodStart: result.periodStart,
      periodEnd: result.periodEnd,
      templateVersion: "v3",
      rowCount: uniqueProdCount,
      status: UploadStatus.FAILED,
      uploadedById: Number(user.id),
    },
  });

  // Master farqlari hisoboti (try ichida to'ldiriladi, keyin ishlatiladi)
  let newSkuCount = 0;
  let newSkuSample = "";
  let nameDiffCount = 0;
  let reactivated = 0; // arxivdan avtomatik qaytganlar (yana sotila boshlagan)

  try {
    // 3. Mahsulotlarni master bilan solishtirish.
    // MUHIM: master (iyerarxiya/sku.xlsx) ASOSIY — mavjud mahsulotning nomi/categoryId
    // QAYTA YOZILMAYDI. Faqat yangi kodlar qo'shiladi; nom farqlari HISOBOT qilinadi
    // (qaror — keyin interaktiv review'da yoki Iyerarxiya editor'da).
    const uniqueProducts = new Map<
      number,
      { code: number; name: string; categoryId: number | null }
    >();
    for (const row of result.productRows) {
      if (!uniqueProducts.has(row.productCode)) {
        const categoryId =
          row.parentCategoryCode != null
            ? (categoryCodeToId.get(row.parentCategoryCode) ?? null)
            : null;
        uniqueProducts.set(row.productCode, {
          code: row.productCode,
          name: row.productName,
          categoryId,
        });
      }
    }
    const fileProducts = [...uniqueProducts.values()];

    // Mavjud mahsulotlar (kod bo'yicha) — master holati
    const existingRows = await prisma.product.findMany({
      where: { code: { in: fileProducts.map((p) => p.code) } },
      select: { id: true, code: true, name: true },
    });
    const existingByCode = new Map(existingRows.map((p) => [p.code, p]));

    // Yangi (master'da yo'q) va nom-farqli (master saqlanadi) mahsulotlar.
    // Solishtirishda bo'shliqlar normallashtiriladi (ortiqcha/ketma-ket bo'shliq
    // farqi ahamiyatsiz — false "nom farqi" bermaslik uchun).
    const wsNorm = (s: string) => s.replace(/\s+/g, " ").trim();
    const newProducts = fileProducts.filter((p) => !existingByCode.has(p.code));
    const nameChanges = fileProducts.filter((p) => {
      const e = existingByCode.get(p.code);
      return e && wsNorm(e.name) !== wsNorm(p.name);
    });
    // Hisobot uchun (try'dan tashqarida ishlatiladi)
    newSkuCount = newProducts.length;
    newSkuSample = newProducts.slice(0, 5).map((p) => p.code).join(", ");
    nameDiffCount = nameChanges.length;

    // FAQAT yangi mahsulotlar qo'shiladi (mavjud master tegilmaydi).
    // Yangi SKU categoryId = NULL → "Moslanmagan" ro'yxatiga tushadi, admin keyin
    // to'g'ri subkategoriyani tayinlaydi (sotuv faylidagi taxminga ishonmaymiz).
    const BATCH = 500;
    for (let i = 0; i < newProducts.length; i += BATCH) {
      const chunk = newProducts.slice(i, i + BATCH);
      // updatedAt — @updatedAt DB default'siz (Prisma klient to'ldiradi); xom SQL'da
      // qo'lda now() beramiz, aks holda NOT NULL buzilishi (23502).
      const vals = chunk.map((p) =>
        Prisma.sql`(${p.code}, ${p.name}, ${null}, now(), now())`
      );
      await prisma.$executeRaw`
        INSERT INTO "Product" ("code", "name", "categoryId", "createdAt", "updatedAt")
        VALUES ${Prisma.join(vals)}
        ON CONFLICT ("code") DO NOTHING
      `;
    }

    // 3b. Nom farqlari → ProductNameMismatch (review uchun). Mos kelganlar tozalanadi.
    const mismatchData = nameChanges.map((p) => ({
      productId: existingByCode.get(p.code)!.id,
      fileName: p.name,
      uploadedFileId: fileRecord.id,
    }));
    const matchedPids = fileProducts
      .filter((p) => { const e = existingByCode.get(p.code); return !!e && wsNorm(e.name) === wsNorm(p.name); })
      .map((p) => existingByCode.get(p.code)!.id);
    const touchedPids = [...mismatchData.map((m) => m.productId), ...matchedPids];
    if (touchedPids.length > 0) {
      await prisma.productNameMismatch.deleteMany({ where: { productId: { in: touchedPids } } });
    }
    if (mismatchData.length > 0) {
      await prisma.productNameMismatch.createMany({ data: mismatchData });
    }

    // 4. Product code → DB id mapping (mavjud + yangi)
    const dbProducts = await prisma.product.findMany({
      where: { code: { in: fileProducts.map((p) => p.code) } },
      select: { id: true, code: true },
    });
    const productCodeToId = new Map<number, number>(
      dbProducts.map((p) => [p.code, p.id])
    );

    // 5. ProductSales upsert — bulk, 500 ta lik batch
    for (let i = 0; i < result.productRows.length; i += BATCH) {
      const chunk = result.productRows.slice(i, i + BATCH);
      const vals = chunk.flatMap((row) => {
        const productId = productCodeToId.get(row.productCode);
        const branchId = aliasToBranchId.get(row.branchAlias);
        if (!productId || !branchId) return [];
        const stockQty =
          row.stockQty != null ? new Prisma.Decimal(row.stockQty) : null;
        const soldQty =
          row.soldQty != null ? new Prisma.Decimal(row.soldQty) : null;
        const costAmount =
          row.costAmount != null ? new Prisma.Decimal(row.costAmount) : null;
        // Tayyor narxlar (yangi formatda; eski formatda null)
        const salePrice = row.salePrice != null ? new Prisma.Decimal(row.salePrice) : null;
        const costPrice = row.costPrice != null ? new Prisma.Decimal(row.costPrice) : null;
        return [
          Prisma.sql`(${fileRecord.id}, ${productId}, ${branchId}, ${result.periodStart}::date, ${result.periodEnd}::date, ${stockQty}, ${soldQty}, ${new Prisma.Decimal(row.amount)}, ${costAmount}, ${salePrice}, ${costPrice})`,
        ];
      });
      if (vals.length === 0) continue;
      await prisma.$executeRaw`
        INSERT INTO "ProductSales"
          ("uploadedFileId", "productId", "branchId", "periodStart", "periodEnd",
           "stockQty", "soldQty", "amount", "costAmount", "salePrice", "costPrice")
        VALUES ${Prisma.join(vals)}
        ON CONFLICT ("productId", "branchId", "periodStart", "periodEnd") DO UPDATE SET
          "uploadedFileId" = EXCLUDED."uploadedFileId",
          "stockQty"       = EXCLUDED."stockQty",
          "soldQty"        = EXCLUDED."soldQty",
          "amount"         = EXCLUDED."amount",
          "costAmount"     = EXCLUDED."costAmount",
          "salePrice"      = EXCLUDED."salePrice",
          "costPrice"      = EXCLUDED."costPrice"
      `;
    }

    // 6. CategorySales DERIVE: ProductSales dan SUM qilib CategorySales ga upsert
    // Faqat shu fayl/davr uchun tegishli kategoriyalar bo'yicha
    await deriveCategorySalesFromProducts(
      fileRecord.id,
      result.periodStart,
      result.periodEnd,
      aliasToBranchId
    );

    // 7. JORIY HOLAT denormalizatsiyasi: Product.currentStock/currentSold/lastSalePeriod
    // (OOS/zakaz so'rovi ProductSales tarixini skanlamasin). Filiallar yig'indisi,
    // faqat davr eski bo'lmasa yangilanadi (backfill joriyni bosmaydi).
    const perProduct = new Map<number, { stock: number; sold: number }>();
    for (const row of result.productRows) {
      const pid = productCodeToId.get(row.productCode);
      if (!pid) continue;
      const agg = perProduct.get(pid) ?? { stock: 0, sold: 0 };
      agg.stock += row.stockQty ?? 0;
      agg.sold += row.soldQty ?? 0;
      perProduct.set(pid, agg);
    }
    const ppEntries = [...perProduct.entries()];
    for (let i = 0; i < ppEntries.length; i += BATCH) {
      const chunk = ppEntries.slice(i, i + BATCH);
      // ${pid}::int MAJBURIY: FROM (VALUES ...) da kontekst yo'q — tipsiz parametr
      // text bo'lib, `p.id = v.pid` "operator does not exist: integer = text" beradi.
      const vals = chunk.map(([pid, a]) => Prisma.sql`(${pid}::int, ${a.stock}::numeric, ${a.sold}::numeric)`);
      await prisma.$executeRaw`
        UPDATE "Product" p SET
          "currentStock" = v.stock, "currentSold" = v.sold, "lastSalePeriod" = ${result.periodEnd}::date
        FROM (VALUES ${Prisma.join(vals)}) AS v(pid, stock, sold)
        WHERE p.id = v.pid AND (p."lastSalePeriod" IS NULL OR p."lastSalePeriod" <= ${result.periodEnd}::date)
      `;
    }

    // 7b. Arxivdagi SKU yana sotila boshlagan bo'lsa — avtomatik aktivga qaytadi
    // (arxiv "no-aktiv" degani; savdo qayta boshlangani aktivlikning o'zi).
    const soldPids = [
      ...new Set(
        result.productRows
          .filter((r) => (r.soldQty ?? 0) > 0 || r.amount > 0)
          .map((r) => productCodeToId.get(r.productCode))
          .filter((x): x is number => x != null)
      ),
    ];
    if (soldPids.length > 0) {
      reactivated = await prisma.$executeRaw`
        UPDATE "Product" SET "archivedAt" = NULL
        WHERE "archivedAt" IS NOT NULL AND id = ANY(${soldPids}::int[])
      `;
      if (reactivated > 0) {
        console.log(`[upload] ${reactivated} ta SKU arxivdan qaytdi (yana sotildi)`);
      }
    }

    // 8. Planlarni yangi tutamiz — kunlik bulk insert'dan keyin sekin plan oldini oladi.
    await prisma.$executeRawUnsafe('ANALYZE "ProductSales"').catch(() => {});
    await prisma.$executeRawUnsafe('ANALYZE "CategorySales"').catch(() => {});
    await prisma.$executeRawUnsafe('ANALYZE "Product"').catch(() => {});

    // 9. RETENTION: eski xom ProductSales qatorlarini tozalaymiz — jadval cheksiz
    // o'smasin. Tahlil tarixi CategorySales rollup'ida (kichik) saqlanib qoladi.
    const cutoff = new Date(result.periodEnd);
    cutoff.setUTCMonth(cutoff.getUTCMonth() - PRODUCTSALES_RETENTION_MONTHS);
    await prisma.productSales.deleteMany({ where: { periodEnd: { lt: cutoff } } }).catch(() => {});

    // Barcha bosqichlar muvaffaqiyatli — endi yozuvni rasman SUCCESS qilamiz.
    await prisma.uploadedFile.update({
      where: { id: fileRecord.id },
      data: { status: UploadStatus.SUCCESS },
    });
  } catch (err) {
    // MUHIM: bu yerda delete QILMAYMIZ. ProductSales/CategorySales'da uploadedFile
    // onDelete:Cascade — 5-bosqichdagi upsert ON CONFLICT bu davrning MAVJUD (avvalgi
    // muvaffaqiyatli yuklovga tegishli) qatorlarini ham yangi fileRecord'ga ko'chirgan
    // bo'ladi. delete kaskadi ularni ham o'chirib, butun davr faktini yo'qotardi.
    // FAILED belgilaymiz: hash bloklanmaydi (ensureNotDuplicate FAILED'ni o'tkazadi),
    // qatorlar joyida qoladi, xato sababi audit uchun saqlanadi.
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[upload:v3] import xatosi:", msg);
    await prisma.uploadedFile
      .update({
        where: { id: fileRecord.id },
        data: { status: UploadStatus.FAILED, errorMessage: msg.slice(0, 500) },
      })
      .catch(() => null);
    throw err;
  }

  revalidatePath("/admin/files");
  revalidatePath("/dashboard");
  revalidateTag(ANALYTICS_CACHE_TAG, "max");
    // Javob qaytgach fonda: SKU matritsa sinflari + kesh isitish
    after(async () => {
      await updateProductMatrixClasses();
      await warmAnalyticsCaches("upload");
    });

  // Master bilan farqlar — hisobot (master O'ZGARTIRILMADI)
  const review: string[] = [];
  if (newSkuCount > 0) {
    review.push(`🆕 Yangi SKU: ${newSkuCount} ta — kategoriyasiz qo'shildi (Moslanmagan ro'yxatida subkategoriya tayinlang). Kodlar: ${newSkuSample}${newSkuCount > 5 ? "…" : ""}`);
  }
  if (reactivated > 0) {
    review.push(`♻️ Arxivdan qaytdi: ${reactivated} ta SKU — yana sotila boshladi (avtomatik aktiv).`);
  }
  if (nameDiffCount > 0) {
    review.push(`✏️ Nom farqi: ${nameDiffCount} ta — master saqlandi. Moslanmagan → "Nom farqi" tabида ko'rib chiqing.`);
  }

  return {
    ok: true,
    fileId: fileRecord.id,
    aiCorrections: review.length > 0 ? [...aiCorrections, ...review] : (aiCorrections.length > 0 ? aiCorrections : undefined),
    summary: `Saqlandi (v3): ${uniqueProdCount} mahsulot × ${uniqueAliases.length} filial = ${result.productRows.length} qator, period ${isoDay(result.periodStart)} → ${isoDay(result.periodEnd)}. Master tegilmadi${newSkuCount ? `, ${newSkuCount} yangi SKU` : ""}${nameDiffCount ? `, ${nameDiffCount} nom farqi` : ""}.`,
  };
}

/**
 * ProductSales dan CategorySales ni derive qiladi.
 * Shu davr va filiallar uchun har Category.id bo'yicha SUM(amount), SUM(costAmount) hisoblab,
 * CategorySales ga upsert qiladi.
 *
 * Bu mavjud dashboard'larning CategorySales dan ishlaydigan grafiklari uchun zarur.
 */
async function deriveCategorySalesFromProducts(
  fileId: number,
  periodStart: Date,
  periodEnd: Date,
  aliasToBranchId: Map<string, number>
): Promise<void> {
  const branchIds = [...aliasToBranchId.values()];
  if (branchIds.length === 0) return;

  // PostgreSQL'dan to'g'ridan-to'g'ri aggregate qilamiz — N+1 yo'q
  // Product.categoryId orqali guruhlash
  const aggregated = await prisma.$queryRaw<
    Array<{
      branchId: number;
      categoryId: number;
      totalAmount: string;
      totalCost: string | null;
    }>
  >`
    SELECT
      ps."branchId",
      p."categoryId",
      SUM(ps."amount")::text      AS "totalAmount",
      SUM(ps."costAmount")::text  AS "totalCost"
    FROM "ProductSales" ps
    JOIN "Product" p ON p.id = ps."productId"
    WHERE
      ps."periodStart" = ${periodStart}::date
      AND ps."periodEnd"  = ${periodEnd}::date
      AND ps."branchId"   = ANY(${branchIds}::int[])
      AND p."categoryId"  IS NOT NULL
    GROUP BY ps."branchId", p."categoryId"
  `;

  if (aggregated.length === 0) return;

  const BATCH = 500;
  for (let i = 0; i < aggregated.length; i += BATCH) {
    const chunk = aggregated.slice(i, i + BATCH);
    const vals = chunk.map((row) => {
      const cost = row.totalCost != null ? new Prisma.Decimal(row.totalCost) : null;
      return Prisma.sql`(${fileId}, ${row.branchId}, ${row.categoryId}, ${periodStart}::date, ${periodEnd}::date, ${new Prisma.Decimal(row.totalAmount)}, ${cost})`;
    });
    await prisma.$executeRaw`
      INSERT INTO "CategorySales"
        ("uploadedFileId", "branchId", "categoryId", "periodStart", "periodEnd", "amount", "costAmount")
      VALUES ${Prisma.join(vals)}
      ON CONFLICT ("branchId", "categoryId", "periodStart", "periodEnd") DO UPDATE SET
        "uploadedFileId" = EXCLUDED."uploadedFileId",
        "amount"         = EXCLUDED."amount",
        "costAmount"     = EXCLUDED."costAmount"
    `;
  }
}

// ============ VISITS ============

const visitsInputSchema = z.object({
  label: labelSchema,
  year: z.coerce.number().int().min(2000).max(2100),
});

export async function uploadVisitsAction(formData: FormData): Promise<UploadResult> {
  try {
    const user = await requireAdminUser();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) {
      return { ok: false, error: "Fayl tanlanmagan." };
    }
    const parsed = visitsInputSchema.parse({
      label: formData.get("label"),
      year: formData.get("year"),
    });

    const buf = await readBuffer(file);
    const hash = sha256(buf);
    await ensureNotDuplicate(hash);

    const result = parseVisitsWorkbook(buf, parsed.year);

    const uniqueAliases = [...new Set(result.rows.map((r) => r.branchAlias))];
    const aliasToBranchId = new Map<string, number>();
    const aiCorrections: string[] = [];
    for (const alias of uniqueAliases) {
      const resolved = await resolveBranchWithAI(alias, AliasSource.VISITS);
      aliasToBranchId.set(alias, resolved.branchId);
      if (resolved.aiUsed) {
        aiCorrections.push(`Filial: "${alias}" → "${resolved.branchName}" (AI, alias saqlandi)`);
      }
    }

    const dates = result.rows.map((r) => r.date.getTime());
    const periodStart = new Date(Math.min(...dates));
    const periodEnd = new Date(Math.max(...dates));

    // UploadedFile + DailyVisits bitta tranzaksiyada — chala holat qolmasin.
    const fileRecord = await prisma.$transaction(
      async (tx) => {
        const rec = await tx.uploadedFile.create({
          data: {
            label: parsed.label,
            originalName: file.name,
            fileHash: hash,
            fileType: FileType.VISITS,
            periodStart,
            periodEnd,
            yearOverride: parsed.year,
            rowCount: result.rows.length,
            status: UploadStatus.SUCCESS,
            uploadedById: Number(user.id),
          },
        });
        const values = result.rows.map((row) => {
          const branchId = aliasToBranchId.get(row.branchAlias)!;
          return Prisma.sql`(${rec.id}, ${branchId}, ${row.date}::date, ${row.count})`;
        });
        await tx.$executeRaw`
          INSERT INTO "DailyVisits" ("uploadedFileId", "branchId", "date", "visitCount")
          VALUES ${Prisma.join(values)}
          ON CONFLICT ("branchId", "date")
          DO UPDATE SET
            "uploadedFileId" = EXCLUDED."uploadedFileId",
            "visitCount"     = EXCLUDED."visitCount"
        `;
        return rec;
      },
      { timeout: 30_000 }
    );

    revalidatePath("/admin/files");
    revalidatePath("/dashboard");
    revalidateTag(ANALYTICS_CACHE_TAG, "max");
    // Javob qaytgach fonda: SKU matritsa sinflari + kesh isitish
    after(async () => {
      await updateProductMatrixClasses();
      await warmAnalyticsCaches("upload");
    });

    return {
      ok: true,
      fileId: fileRecord.id,
      aiCorrections: aiCorrections.length > 0 ? aiCorrections : undefined,
      summary: `Saqlandi: ${result.rows.length} qator (${uniqueAliases.length} filial × kunlar).`,
    };
  } catch (err) {
    return actionError(err, "upload");
  }
}
