import { useState, useEffect } from 'react'
import { useTelegram } from './useTelegram'

export function useFilialar() {
  const [filialar, setFilialar] = useState<string[]>([])
  const { initData } = useTelegram()

  useEffect(() => {
    if (!initData) return
    // Boshqa endpointlar kabi initData bilan — server HMAC tekshiradi (auth talab qilinadi)
    fetch('/api/filialar', { headers: { 'x-telegram-init-data': initData } })
      .then(r => r.json())
      .then(data => setFilialar(Array.isArray(data) ? data : []))
      .catch(() => setFilialar([]))
  }, [initData])

  return filialar
}
