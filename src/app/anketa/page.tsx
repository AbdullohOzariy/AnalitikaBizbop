/**
 * Ta'minotchi anketasi — PUBLIC sahifa (supplier.oilagroup.uz shu yerga rewrite
 * qilinadi). Maydonlar DB'dan (Tizim → Anketa'da tahrirlanadi).
 */
import Image from "next/image";
import { ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { AnketaForm, type AnketaSectionData } from "./anketa-form";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Yetkazib beruvchilar anketasi — BizBop",
  description: "Bizbop supermarketlari bilan hamkorlik uchun ta'minotchi anketasi",
};

export default async function AnketaPage() {
  const fields = await prisma.anketaField.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
    select: { id: true, section: true, label: true, type: true, required: true },
  });

  // Bo'limlar bo'yicha guruhlash (sortOrder tartibida)
  const sections: AnketaSectionData[] = [];
  for (const f of fields) {
    let sec = sections.find((s) => s.title === f.section);
    if (!sec) { sec = { title: f.section, fields: [] }; sections.push(sec); }
    sec.fields.push({ id: f.id, label: f.label, type: f.type, required: f.required });
  }

  return (
    <div className="min-h-dvh bg-gradient-to-b from-emerald-50 to-white dark:from-emerald-950/30 dark:to-background">
      {/* Brend sarlavha */}
      <div className="bg-gradient-to-br from-emerald-500 via-emerald-600 to-green-800 px-4 py-10 text-white">
        <div className="mx-auto max-w-3xl space-y-3 text-center">
          <div className="flex items-center justify-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <span className="text-xl font-bold tracking-tight">BizBop Supermarketlari</span>
          </div>
          <h1 className="text-2xl font-bold sm:text-3xl">Yetkazib beruvchilar uchun anketa</h1>
          <p className="mx-auto max-w-xl text-sm text-white/85">
            Hamkorlikni boshlash uchun quyidagi anketani to&apos;ldiring — jamoamiz ma&apos;lumotlaringizni
            ko&apos;rib chiqib, siz bilan bog&apos;lanadi.
          </p>
        </div>
      </div>

      {/* Forma */}
      <div className="mx-auto max-w-3xl px-4 py-8">
        <AnketaForm sections={sections} />
        <p className="mt-8 flex items-center justify-center gap-2 pb-6 text-center text-xs text-muted-foreground">
          <Image src="/logo.png" alt="BizBop" width={70} height={23} className="h-5 w-auto opacity-70" />
          · supplier.oilagroup.uz
        </p>
      </div>
    </div>
  );
}
