// Yuborish seansi — BITTA yozuvni yuborishga urinishlar davomida saqlanadigan holat.
//
// NEGA App'da (Step3Tasdiq ichida EMAS): Step3 shartli render qilinadi va
// `AnimatePresence mode="wait"` bilan "Orqaga" bosilganda UNMOUNT bo'ladi. Aynan
// himoyalanishi kerak bo'lgan ssenariy shunday kechadi:
//   server COMMIT qildi → javob yetmadi (502/504, WebView fonga tushdi, redeploy)
//   → xodim "Orqaga" bosib formani ko'zdan kechiradi → qayta yuboradi.
// Kalit Step3 mount'iga bog'langanida shu yo'lda YANGI kalit tug'ilar va server
// dedupi dublikatni tanimasdi. Xuddi shu sababdan yuklangan rasm `file_id` lari
// ham yo'qolib, og'ir rasm Telegram'ga ikkinchi marta yuklanardi (chang fayl).
//
// Yangi yozuv boshlangan har bir joyda (tur tanlash, "yana qo'shish", reset,
// qoralamadan tiklash, muvaffaqiyatli yuborish) seans YANGILANADI — aks holda
// keyingi yozuv oldingisining kaliti bilan ketib, server uni dublikat deb tashlardi.

// Rasm keshi ochiq maydon EMAS, balki closure ichida: seans Step3'ga PROP sifatida
// tushadi, `react-hooks/immutability` qoidasi esa prop maydoniga yozishni taqiqlaydi
// (to'g'ri qiladi — bunday yozuv render'ni xabardor qilmaydi). Metodlar orqali
// o'zgartirish ayni maqsadni ochiq-oydin bildiradi.
export interface YuborishSeans {
  /** Takroriy yuborishni serverda ajratish uchun kalit — seans davomida O'ZGARMAS */
  readonly kalit: string
  /** Muvaffaqiyatli yuklangan asosiy rasm — qayta urinishda qayta yuklanmasin */
  rasmOl(): string | null
  rasmSaqla(fileId: string): void
  /** Xuddi shunday, ixtiyoriy QR rasmi uchun */
  qrOl(): string | null
  qrSaqla(fileId: string): void
}

/** Kalit uchun UUID (crypto eski WebView'da yo'q — zaxira: vaqt + tasodif). */
function yangiKalit(): string {
  const c = globalThis.crypto
  if (typeof c?.randomUUID === 'function') return c.randomUUID()
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
}

export function yangiSeans(): YuborishSeans {
  let rasm: string | null = null
  let qr: string | null = null
  return {
    kalit: yangiKalit(),
    rasmOl: () => rasm,
    rasmSaqla: (fileId) => { rasm = fileId },
    qrOl: () => qr,
    qrSaqla: (fileId) => { qr = fileId },
  }
}
