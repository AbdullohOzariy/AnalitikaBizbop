<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Nomlash konvensiyasi (glossariy)

Aralash til ATAYLAB — quyidagi qoidaga rioya qiling (mavjud kodni ommaviy rename QILMANG,
faqat yangi kod uchun):

- **DB modellari va kod identifikatorlari — inglizcha:** `Branch`, `Supplier`, `PurchaseOrder`,
  `Distribution`, `Category`, `Product`.
- **URL/route va domen atamalari — o'zbekcha (de-fakto):** `/chiqim`, `/sverka`, `/iyerarxiya`,
  `/taqsimot`, `/rejalar`.
- **Bir tushuncha = bitta kanonik so'z:** filial = `Branch`; ta'minotchi = `Supplier`;
  zakaz = `PurchaseOrder`; taqsimot = `Distribution`; ko'chirish = `BranchTransfer`.
- **Bizbop (spisaniya-bot) meros jadvallari — o'zbekcha, o'zgarmaydi:** `yozuvlar`, `vozvratlar`,
  `filialar`, `kategoriyalar` (raw SQL, `src/lib/spisaniya/`).

## Foydali markazlashgan modullar (yangi kod shulardan foydalansin)

- Sana/TZ: `src/lib/date.ts` (`isoDay`, `parseDateParam`, `nowTashkent`, `todayTashkentISO`).
- Formatlash: `src/lib/format.ts` (`formatUZS`, `formatDateTimeUZ`, `decimalToNumber`).
- Kesh teglari: `src/lib/cache-tags.ts` (literal yozmang).
- Rol predikatlari: `src/lib/roles.ts`. Xato→javob: `src/lib/action-error.ts` (`actionError`).
- Cron: `src/lib/cron.ts` (`runCron` — dedup+retry+alert).
