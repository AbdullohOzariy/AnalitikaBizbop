import { useEffect, useRef } from 'react'
import { orqagaOlib, orqagaQosh } from '../lib/orqaga'

/**
 * Ushbu qatlamni (sheet/modal) native "orqaga" stekiga qo'shadi.
 *
 * Ishlovchi `ref` orqali chaqiriladi: `fn` har renderda yangi funksiya bo'ladi,
 * lekin stekka faqat bir marta (mount'da) yoziladi — aks holda har render
 * stek qayta qurilib, App'dagi effekt cheksiz ishlab ketardi.
 */
export function useOrqaga(faol: boolean, fn: () => void) {
  const ref = useRef(fn)

  useEffect(() => {
    ref.current = fn
  })

  useEffect(() => {
    if (!faol) return
    const id = orqagaQosh(() => ref.current())
    return () => orqagaOlib(id)
  }, [faol])
}
