// Bo'sh forma fabrikasi. Alohida faylda, chunki Step2Forma.tsx faqat komponent
// eksport qilishi kerak (react-refresh/only-export-components).
import type { FormData } from '../components/Step2Forma'

export function boshFormData(): FormData {
  return {
    photo: null, photoBase64: null, photoSize: 0,
    qrPhoto: null, qrPhotoBase64: null, qrPhotoSize: 0,
    tovarNomi: '', skuKod: null, miqdor: '', birlik: 'dona', summa: '',
    sababTanlov: '',
    filial: '', firmaNomi: '', kafeNomi: '',
    yonalish: 'asosiy_filial', taminotchi: '', taminotchiId: null,
    vozvratStatus: 'xabar_berildi', qaytarilmadiSabab: '',
  }
}
