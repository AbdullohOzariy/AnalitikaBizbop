// Bo'sh forma fabrikasi. Alohida faylda, chunki Step2Forma.tsx faqat komponent
// eksport qilishi kerak (react-refresh/only-export-components).
import type { FormData } from '../components/Step2Forma'

// Xodim deyarli har doim BITTA filialda ishlaydi — har yozuvda uni qayta tanlash
// kunlik ortiqcha ish. Oxirgi tanlov eslab qolinadi va oldindan qo'yiladi.
// Tanlov baribir ko'rinib turadi va bitta bosishda o'zgartiriladi.
const OXIRGI_FILIAL_KALIT = 'spisaniya:oxirgi_filial'

function oxirgiFilial(): string {
  try {
    const v = localStorage.getItem(OXIRGI_FILIAL_KALIT)
    return typeof v === 'string' ? v : ''
  } catch {
    return ''
  }
}

export function oxirgiFilialSaqla(filial: string) {
  try {
    if (filial) localStorage.setItem(OXIRGI_FILIAL_KALIT, filial)
  } catch { /* kvota/o'chirilgan storage — qulaylik, majburiyat emas */ }
}

export function boshFormData(): FormData {
  return {
    photo: null, photoBase64: null, photoSize: 0,
    qrPhoto: null, qrPhotoBase64: null, qrPhotoSize: 0,
    tovarNomi: '', skuKod: null, miqdor: '', birlik: 'dona', summa: '',
    sababTanlov: '',
    filial: oxirgiFilial(), firmaNomi: '', kafeNomi: '',
    yonalish: 'asosiy_filial', taminotchi: '', taminotchiId: null,
    vozvratStatus: 'xabar_berildi', qaytarilmadiSabab: '',
  }
}
