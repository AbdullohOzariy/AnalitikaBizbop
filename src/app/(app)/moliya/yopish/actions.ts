"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AuthorizationError } from "@/lib/auth-helpers";
import { actionError, BusinessError, type ActionResult } from "@/lib/action-error";
import { canEnterCash } from "@/lib/roles";
import { parseDateParam, isoDay, nowTashkent } from "@/lib/date";
import { decimalToNumber } from "@/lib/format";
import { pickOpenings, hisobla } from "@/lib/moliya/qoldiq";

const PATH = "/moliya/yopish";

async function requireCash() {
  const session = await auth();
  if (!session?.user || !canEnterCash(session.user.roles)) throw new AuthorizationError();
  const id = Number(session.user.id);
  const user = Number.isInteger(id) ? await prisma.user.findUnique({ where: { id } }) : null;
  if (!user) throw new AuthorizationError("Sessiyangiz eskirgan. Tizimdan chiqib, qaytadan kiring.");
  return user;
}

/** Serverda qoldiqni QAYTA hisoblaydi — mijoz yuborgan raqamga ishonilmaydi. */
async function kutilganQoldiq(accountId: number, onDate: Date): Promise<number> {
  const openings = await prisma.cashAccountOpening.findMany({
    where: { accountId },
    select: { accountId: true, onDate: true, amount: true },
  });
  const picked = pickOpenings(
    openings.map((o) => ({ accountId: o.accountId, onDate: o.onDate, amount: decimalToNumber(o.amount) })),
    onDate
  );
  const from = picked.get(accountId)?.onDate;
  const rows = await prisma.cashTxn.groupBy({
    by: ["direction"],
    where: { accountId, businessDate: { ...(from ? { gte: from } : {}), lte: onDate } },
    _sum: { amount: true },
  });
  const [q] = hisobla(
    [accountId],
    picked,
    rows.map((r) => ({ accountId, direction: r.direction as string, amount: decimalToNumber(r._sum.amount) }))
  );
  return q.qoldiq;
}

const yopSchema = z.object({
  accountId: z.coerce.number().int().positive(),
  onDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Sana noto'g'ri."),
  counted: z.coerce.number().min(0, "Sanalgan summa manfiy bo'lmaydi.").max(1e15),
  note: z.string().trim().max(300).optional(),
});

export async function kunYopAction(input: {
  accountId: number;
  onDate: string;
  counted: number;
  note?: string;
}): Promise<ActionResult> {
  try {
    const user = await requireCash();
    const d = yopSchema.parse(input);
    const onDate = parseDateParam(d.onDate);
    if (!onDate) return { ok: false, error: "Sana noto'g'ri." };

    // Kelajakdagi kunni yopib bo'lmaydi — yozuvlar hali kiritilmagan.
    const bugun = new Date(isoDay(nowTashkent()) + "T00:00:00.000Z");
    if (onDate > bugun) throw new BusinessError("Kelajakdagi kunni yopib bo'lmaydi.");

    const mavjud = await prisma.cashDayClose.findUnique({
      where: { accountId_onDate: { accountId: d.accountId, onDate } },
      select: { id: true },
    });
    if (mavjud) throw new BusinessError("Bu kun allaqachon yopilgan. Avval yopishni bekor qiling.");

    const expected = await kutilganQoldiq(d.accountId, onDate);
    const diff = d.counted - expected;

    // Farq bo'lsa izoh MAJBURIY: "qayerdan chiqdi?" savoli keyin javobsiz qolmasin.
    if (diff !== 0 && !d.note?.trim()) {
      throw new BusinessError(
        `Farq ${diff.toLocaleString("uz-UZ")} so'm — izoh yozilishi shart (sabab yoki kim javobgar).`
      );
    }

    await prisma.cashDayClose.create({
      data: {
        accountId: d.accountId,
        onDate,
        expected,
        counted: d.counted,
        diff,
        note: d.note?.trim() || null,
        closedById: user.id,
      },
    });

    revalidatePath(PATH);
    revalidatePath("/moliya/qoldiq");
    revalidatePath("/moliya/kassa");
    return { ok: true };
  } catch (err) {
    return actionError(err, "moliya:kun-yop");
  }
}

/** Yopishni bekor qilish — faqat SYSTEM_ADMIN darajasidagi tuzatish uchun. */
export async function yopishBekorAction(id: number): Promise<ActionResult> {
  try {
    await requireCash();
    await prisma.cashDayClose.delete({
      where: { id: z.coerce.number().int().positive().parse(id) },
    });
    revalidatePath(PATH);
    revalidatePath("/moliya/kassa");
    return { ok: true };
  } catch (err) {
    return actionError(err, "moliya:yopish-bekor");
  }
}
