/**
 * /logistika — bo'lim ildizi. Bo'limning o'zi uchta sahifadan iborat:
 *   /logistika/hozir       — jonli holat (kim yo'lda, qaysi avto qayerda)
 *   /logistika/statistika  — hisobot
 *   /logistika/malumotlar  — Reyslar / Nuqtalar / Avtomobillar / Haydovchilar
 *
 * Eski logistika taxtasi (ta'minotchi scorecard, kalendar, ombor, taqsimot,
 * ko'chirish) ishlatilmaydi — sub-sahifalari kodda qolgan, lekin navigatsiyadan
 * chiqarilgan. Kerak bo'lsa /logistika/taqsimot/yangi to'g'ridan ochiladi.
 */
import { redirect } from "next/navigation";

export default function LogistikaPage() {
  redirect("/logistika/hozir");
}
