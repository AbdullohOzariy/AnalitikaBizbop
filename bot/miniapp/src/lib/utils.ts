import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatSum(val: number): string {
  return val.toLocaleString('uz-UZ') + ' so\'m'
}

export function compressImage(file: File): Promise<{ file: File; base64: string }> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const img = new Image()
      img.onload = () => {
        const MAX = 1200
        let { width, height } = img
        if (width > MAX || height > MAX) {
          if (width > height) { height = Math.round(height * MAX / width); width = MAX }
          else                { width  = Math.round(width  * MAX / height); height = MAX }
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        canvas.getContext('2d')!.drawImage(img, 0, 0, width, height)
        canvas.toBlob((blob) => {
          const compressed = new File([blob!], file.name, { type: 'image/jpeg' })
          resolve({ file: compressed, base64: canvas.toDataURL('image/jpeg', 0.85) })
        }, 'image/jpeg', 0.85)
      }
      img.src = e.target!.result as string
    }
    reader.readAsDataURL(file)
  })
}

export function fileSizeLabel(bytes: number): string {
  const kb = Math.round(bytes / 1024)
  return kb > 1024 ? `${(kb / 1024).toFixed(1)} MB` : `${kb} KB`
}
