import { useState, useEffect } from 'react'

export function useFilialar() {
  const [filialar, setFilialar] = useState<string[]>([])

  useEffect(() => {
    fetch('/api/filialar')
      .then(r => r.json())
      .then(data => setFilialar(Array.isArray(data) ? data : []))
      .catch(() => setFilialar([]))
  }, [])

  return filialar
}
