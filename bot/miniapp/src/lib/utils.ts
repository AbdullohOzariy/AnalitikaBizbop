import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSum(val: number): string {
  return val.toLocaleString('uz-UZ') + ' so\'m'
}

/**
 * Rasmni 1200px ga siqadi (JPEG 0.85).
 *
 * DIQQAT — `reject` yo'lini OLIB TASHLAMANG. Ilgari Promise faqat `resolve` bilan
 * qurilgan edi: buzuq fayl, HEIC dekod xatosi yoki to'lgan xotira `img.onerror` ni
 * ishga tushirardi, hech qanday callback chaqirilmasdi va `await compressImage(...)`
 * ABADIY osilib qolardi — spinner qotib, xodim uchun ilova "o'lardi".
 * Har bir asinxron shox (reader / img / toBlob / getContext) settle bo'lishi SHART.
 */
export function compressImage(file: File): Promise<{ file: File; base64: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Faylni o\'qib bo\'lmadi'))
    reader.onload = (e) => {
      const manba = e.target?.result
      if (typeof manba !== 'string') {
        reject(new Error('Faylni o\'qib bo\'lmadi'))
        return
      }
      const img = new Image()
      img.onerror = () => reject(new Error('Rasm formati qo\'llab-quvvatlanmaydi'))
      img.onload = () => {
        try {
          const MAX = 1200
          let { width, height } = img
          if (width > MAX || height > MAX) {
            if (width > height) { height = Math.round(height * MAX / width); width = MAX }
            else                { width  = Math.round(width  * MAX / height); height = MAX }
          }
          const canvas = document.createElement('canvas')
          canvas.width = width; canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) {
            reject(new Error('Rasmni tayyorlab bo\'lmadi'))
            return
          }
          ctx.drawImage(img, 0, 0, width, height)
          canvas.toBlob((blob) => {
            if (!blob) {
              reject(new Error('Rasmni siqib bo\'lmadi'))
              return
            }
            const compressed = new File([blob], file.name, { type: 'image/jpeg' })
            resolve({ file: compressed, base64: canvas.toDataURL('image/jpeg', 0.85) })
          }, 'image/jpeg', 0.85)
        } catch {
          reject(new Error('Rasmni tayyorlab bo\'lmadi'))
        }
      }
      img.src = manba
    }
    reader.readAsDataURL(file)
  })
}

export function fileSizeLabel(bytes: number): string {
  const kb = Math.round(bytes / 1024)
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`
}
