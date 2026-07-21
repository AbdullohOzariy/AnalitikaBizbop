// Native BackButton uchun markazlashgan "orqaga" steki.
//
// NEGA STEK, har komponentda `BackButton.show()/hide()` EMAS: Telegram'da BackButton
// bitta global obyekt. Har sheet o'zi boshqarsa, ochilish/yopilish tartibiga qarab
// ular bir-birining `hide()` va `onClick` ini bosib ketadi — masalan SkuPicker
// yopilganda `hide()` chaqirib, hali 2-qadamda turgan sehrgarning tugmasini ham
// o'chirib qo'yardi. Shuning uchun YAGONA egasi — App.tsx dagi effekt; sheet'lar
// faqat o'z ishlovchisini shu stekka qo'yadi.
//
// Stek LIFO: eng oxirgi ochilgan qatlam birinchi yopiladi.

type Ishlovchi = () => void

let stek: { id: number; fn: Ishlovchi }[] = []
let keyingiId = 1
const kuzatuvchilar = new Set<() => void>()

function xabarQil() {
  for (const k of kuzatuvchilar) k()
}

/** Stek o'zgarganda xabar beradi (App shu orqali BackButton'ni ko'rsatadi/yashiradi). */
export function orqagaObuna(fn: () => void): () => void {
  kuzatuvchilar.add(fn)
  return () => { kuzatuvchilar.delete(fn) }
}

export function orqagaChuqurlik(): number {
  return stek.length
}

/** Eng ustki qatlamning ishlovchisi (yo'q bo'lsa null — sehrgar qadami ishlaydi). */
export function orqagaTepasi(): Ishlovchi | null {
  return stek.length > 0 ? stek[stek.length - 1].fn : null
}

export function orqagaQosh(fn: Ishlovchi): number {
  const id = keyingiId++
  stek.push({ id, fn })
  xabarQil()
  return id
}

export function orqagaOlib(id: number): void {
  const oldin = stek.length
  stek = stek.filter((s) => s.id !== id)
  if (stek.length !== oldin) xabarQil()
}
