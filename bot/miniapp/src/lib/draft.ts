// Tugallanmagan yozuv qoralamasi.
//
// Nega localStorage (sessionStorage EMAS): Telegram sheet yopilganda WebView butunlay
// yo'q qilinadi — sessionStorage aynan kerakli ssenariyda bo'sh keladi.
//
// Rasm SAQLANMAYDI: siqilgan JPEG ham 300-800KB, 5MB kvota bir necha qoralamada to'ladi.
// Faqat "rasm bor edi" belgisi saqlanadi, tiklanganda xodim rasmni qayta qo'shadi.

import type { FormData } from '../components/Step2Forma'

// Yagona manba TURLAR massivi (pastda) — ro'yxat va tip bir-biridan uzilib qolmasin
type Tur = (typeof TURLAR)[number]

const KALIT = 'spisaniya:qoralama'
const TTL_MS = 6 * 60 * 60 * 1000 // 6 soat — bir ish smenasidan uzoq emas

// Ruxsat etilgan qiymatlar — localStorage foydalanuvchi nazoratidagi joy, undan
// kelgan hech narsaga ishonmaymiz (buzuq yozuv har ochilishda oq ekran berardi).
const TURLAR = ['vozvrat', 'kafe', 'ovqatlanish', 'spisaniya', 'ichki_sotuv', 'qaytarish'] as const
const BIRLIKLAR = ['kg', 'dona', 'litr'] as const
const YONALISHLAR = ['asosiy_filial', 'taminotchi'] as const
const VOZVRAT_HOLATLAR = ['xabar_berildi', 'saqlash_xonasida', 'yuborildi', 'qaytarildi', 'qaytarilmadi'] as const

function matn(v: unknown): v is string {
  return typeof v === 'string'
}

function sonYokiNull(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && Number.isFinite(v))
}

function birida<T extends string>(ruyxat: readonly T[], v: unknown): v is T {
  return typeof v === 'string' && (ruyxat as readonly string[]).includes(v)
}

/**
 * Xom obyektni FormaQoralama shakliga qat'iy tekshiradi.
 * Bitta maydon ham mos kelmasa — null (yarim-to'g'ri yozuvni tiklashdan ko'ra tashlagan afzal).
 */
function shaklniTekshir(x: unknown): FormaQoralama | null {
  if (typeof x !== 'object' || x === null || Array.isArray(x)) return null
  const {
    tovarNomi, skuKod, miqdor, birlik, summa, sababTanlov, filial, firmaNomi,
    kafeNomi, yonalish, taminotchi, taminotchiId, vozvratStatus, qaytarilmadiSabab,
  } = x as Record<string, unknown>

  if (!matn(tovarNomi) || !matn(miqdor) || !matn(summa) || !matn(sababTanlov)) return null
  if (!matn(filial) || !matn(firmaNomi) || !matn(kafeNomi)) return null
  if (!matn(taminotchi) || !matn(qaytarilmadiSabab)) return null
  if (!sonYokiNull(skuKod) || !sonYokiNull(taminotchiId)) return null
  if (!birida(BIRLIKLAR, birlik)) return null
  if (!birida(YONALISHLAR, yonalish)) return null
  if (!birida(VOZVRAT_HOLATLAR, vozvratStatus)) return null

  return {
    tovarNomi, skuKod, miqdor, birlik, summa, sababTanlov, filial, firmaNomi,
    kafeNomi, yonalish, taminotchi, taminotchiId, vozvratStatus, qaytarilmadiSabab,
  }
}

/** Faqat serializatsiyalanadigan maydonlar (File/base64 tashqarida). */
export type FormaQoralama = Omit<
  FormData,
  'photo' | 'photoBase64' | 'photoSize' | 'qrPhoto' | 'qrPhotoBase64' | 'qrPhotoSize'
>

export interface Qoralama {
  ts: number
  tur: Tur
  photoBor: boolean
  form: FormaQoralama
}

/**
 * Qoralama saqlashga arziydimi — bo'sh formani banner bilan tiklash bezovta qiladi.
 * Rasm hisobga OLINMAYDI: u saqlanmaydi, ya'ni yolg'iz rasm tiklanganda bo'sh forma beradi.
 *
 * `filial` ham hisobga OLINMAYDI (lib/forma.ts uni oxirgi tanlovdan oldindan
 * to'ldiradi): u endi xodim kiritgan signal emas. Aks holda BUTUNLAY bo'sh forma
 * ham "arziydi" bo'lib qolardi — natijada (a) har ochilishda soxta "Tugallanmagan
 * yozuv bor — Nomsiz tovar" banneri, (b) 1-qadamda tur almashtirilganda forma
 * tozalanadi va o'sha bo'sh qoralama HAQIQIY qoralamaning ustidan yozilardi.
 */
export function qoralamaArziydi(form: FormData): boolean {
  return Boolean(
    form.tovarNomi.trim() ||
    form.miqdor.trim() ||
    form.summa.trim() ||
    form.sababTanlov,
  )
}

export function qoralamaSaqla(tur: Tur, form: FormData) {
  const qolgani: FormaQoralama = {
    tovarNomi: form.tovarNomi,
    skuKod: form.skuKod,
    miqdor: form.miqdor,
    birlik: form.birlik,
    summa: form.summa,
    sababTanlov: form.sababTanlov,
    filial: form.filial,
    firmaNomi: form.firmaNomi,
    kafeNomi: form.kafeNomi,
    yonalish: form.yonalish,
    taminotchi: form.taminotchi,
    taminotchiId: form.taminotchiId,
    vozvratStatus: form.vozvratStatus,
    qaytarilmadiSabab: form.qaytarilmadiSabab,
  }
  const q: Qoralama = { ts: Date.now(), tur, photoBor: Boolean(form.photoBase64), form: qolgani }
  try {
    localStorage.setItem(KALIT, JSON.stringify(q))
  } catch { /* kvota to'lgan yoki storage o'chirilgan — qoralama ixtiyoriy imkoniyat */ }
}

export function qoralamaTozala() {
  try {
    localStorage.removeItem(KALIT)
  } catch { /* jim */ }
}

/** Yaroqli (TTL ichidagi) qoralamani qaytaradi; eskisi/buzuqi o'chiriladi. */
export function qoralamaOqi(): Qoralama | null {
  let xom: string | null
  try {
    xom = localStorage.getItem(KALIT)
  } catch { return null }
  if (!xom) return null

  let xomObj: unknown
  try {
    xomObj = JSON.parse(xom)
  } catch {
    qoralamaTozala()
    return null
  }

  if (typeof xomObj !== 'object' || xomObj === null || Array.isArray(xomObj)) {
    qoralamaTozala()
    return null
  }
  const { ts, tur, photoBor, form } = xomObj as Record<string, unknown>

  if (typeof ts !== 'number' || !Number.isFinite(ts) || Date.now() - ts > TTL_MS) {
    qoralamaTozala()
    return null
  }
  if (!birida(TURLAR, tur)) {
    qoralamaTozala()
    return null
  }
  const shakl = shaklniTekshir(form)
  if (!shakl) {
    qoralamaTozala()
    return null
  }

  return { ts, tur, photoBor: photoBor === true, form: shakl }
}
