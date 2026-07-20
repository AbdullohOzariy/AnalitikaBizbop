import { useState, useEffect } from 'react'
import { useTelegram } from './useTelegram'

/**
 * Spisaniya sabablari (chip tugmalar) — /chiqim/sabablar tabida boshqariladigan
 * ro'yxat. useFilialar kabi initData bilan so'raladi (server HMAC tekshiradi).
 */
export function useSabablar() {
  const [sabablar, setSabablar] = useState<string[]>([])
  const { initData } = useTelegram()

  useEffect(() => {
    if (!initData) return
    fetch('/api/sabablar', { headers: { 'x-telegram-init-data': initData } })
      .then(r => r.json())
      .then(data => setSabablar(Array.isArray(data) ? data : []))
      .catch(() => setSabablar([]))
  }, [initData])

  return sabablar
}
