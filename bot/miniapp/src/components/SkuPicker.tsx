import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, ChevronRight, Search, X, Loader2, PackageSearch, PencilLine } from 'lucide-react'
import { cn } from '../lib/utils'
import { useTelegram } from '../hooks/useTelegram'

/**
 * SKU katalogi (to'liq ekranli sheet): iyerarxik navigatsiya (ota → sub → tovar)
 * + nom/kod bo'yicha qidiruv. Katalog xodimga biriktirilgan kategoriyalar bilan
 * cheklangan bo'lishi mumkin (server hal qiladi).
 */

export type SkuTanlov = { kod: number; nomi: string }

type Ota = { id: number; nomi: string; subs: { id: number; nomi: string }[] }
type Sub = { id: number; nomi: string }
type Tovar = { kod: number; nomi: string }
type QidiruvItem = { kod: number; nomi: string; sub: string }

interface Props {
  onPick: (t: SkuTanlov) => void
  onQolda: () => void
  onClose: () => void
}

async function skuFetch(initData: string, params: string) {
  const r = await fetch(`/api/sku${params}`, { headers: { 'x-telegram-init-data': initData } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.xato || `Server xatosi (${r.status})`)
  return j
}

export default function SkuPicker({ onPick, onQolda, onClose }: Props) {
  const { initData, haptic } = useTelegram()

  const [daraxt, setDaraxt] = useState<Ota[] | null>(null)
  const [daraxtXato, setDaraxtXato] = useState(false)
  const [yuklashKaliti, setYuklashKaliti] = useState(0) // qayta urinish uchun

  const [ota, setOta] = useState<Ota | null>(null)
  const [sub, setSub] = useState<Sub | null>(null)
  const [tovarlar, setTovarlar] = useState<Tovar[]>([])
  const [jami, setJami] = useState(0)
  const [sahifa, setSahifa] = useState(1)
  const [tovarYuklanmoqda, setTovarYuklanmoqda] = useState(false)

  const [q, setQ] = useState('')
  const [natija, setNatija] = useState<{ kalit: string; items: QidiruvItem[] } | null>(null)

  // Daraxtni bir marta yuklaymiz (yuklashKaliti — "qayta urinish" tugmasi uchun)
  useEffect(() => {
    let tirik = true
    skuFetch(initData, '')
      .then(j => { if (tirik) { setDaraxt(j.daraxt ?? []); setDaraxtXato(false) } })
      .catch(() => { if (tirik) setDaraxtXato(true) })
    return () => { tirik = false }
  }, [initData, yuklashKaliti])

  // Qidiruv — 300ms debounce; natija kalit (so'rov matni) bilan saqlanadi,
  // ko'rsatish renderda derive qilinadi (eski natija yangi so'rovga chiqmaydi).
  const s = q.trim()
  const qidiruvRejimi = s.length >= 2
  useEffect(() => {
    if (s.length < 2) return
    const t = setTimeout(() => {
      skuFetch(initData, `?q=${encodeURIComponent(s)}`)
        .then(j => setNatija({ kalit: s, items: j.natija ?? [] }))
        .catch(() => setNatija({ kalit: s, items: [] }))
    }, 300)
    return () => clearTimeout(t)
  }, [s, initData])
  const aktivNatija = qidiruvRejimi && natija?.kalit === s ? natija.items : null

  // Race himoyasi: sub tez almashtirilsa, eski so'rov javobi yangi ro'yxatni bosmasin
  const aktivSubRef = useRef<number | null>(null)

  async function tovarlarYukla(subId: number, keyingiSahifa: number, qoshib: boolean) {
    setTovarYuklanmoqda(true)
    try {
      const j = await skuFetch(initData, `?subId=${subId}&page=${keyingiSahifa}`)
      if (aktivSubRef.current !== subId) return
      setTovarlar(prev => (qoshib ? [...prev, ...(j.tovarlar ?? [])] : (j.tovarlar ?? [])))
      setJami(j.jami ?? 0)
      setSahifa(keyingiSahifa)
    } catch {
      if (!qoshib && aktivSubRef.current === subId) setTovarlar([])
    } finally {
      if (aktivSubRef.current === subId) setTovarYuklanmoqda(false)
    }
  }

  function subTanla(y: Sub) {
    haptic?.impactOccurred('light')
    aktivSubRef.current = y.id
    setSub(y)
    setTovarlar([])
    void tovarlarYukla(y.id, 1, false)
  }

  function tanla(t: SkuTanlov) {
    haptic?.impactOccurred('medium')
    onPick(t)
  }

  function orqaga() {
    haptic?.impactOccurred('light')
    if (sub) { aktivSubRef.current = null; setSub(null); setTovarlar([]) }
    else if (ota) setOta(null)
    else onClose()
  }

  const sarlavha = sub ? sub.nomi : ota ? ota.nomi : 'SKU katalogi'

  return (
    <motion.div
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring' as const, stiffness: 320, damping: 34 }}
      className="fixed inset-0 z-50 flex flex-col bg-tg-bg"
    >
      {/* Sarlavha */}
      <div className="flex-shrink-0 sticky top-0 z-10 bg-tg-bg border-b border-line">
        <div className="flex items-center gap-2 h-14 px-3">
          <button onClick={orqaga} aria-label="Orqaga"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-tg-text active:bg-black/[.05]">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="flex-1 min-w-0 truncate text-[15px] font-bold text-tg-text font-display">{sarlavha}</span>
          <button onClick={onClose} aria-label="Yopish"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-tg-hint active:bg-black/[.05]">
            <X className="w-5 h-5" />
          </button>
        </div>
        {/* Qidiruv */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-tg-hint" />
            <input
              type="text"
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Nomi yoki kodi bo'yicha qidiring..."
              className="w-full bg-tg-bg2 border border-line rounded-2xl pl-9 pr-9 py-2.5 text-[14px] text-tg-text placeholder:text-tg-hint/60 outline-none"
            />
            {q && (
              <button onClick={() => setQ('')} aria-label="Tozalash"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-tg-hint active:opacity-60">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tarkib */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {qidiruvRejimi ? (
          /* ─── Qidiruv natijalari ─── */
          aktivNatija === null ? (
            <Holat yuklanmoqda />
          ) : aktivNatija.length === 0 ? (
            <Holat matn="Hech narsa topilmadi" />
          ) : (
            <div className="bg-tg-bg2 rounded-2xl border border-line overflow-hidden">
              {aktivNatija.map((t, i) => (
                <button key={`${t.kod}-${i}`} onClick={() => tanla({ kod: t.kod, nomi: t.nomi })}
                  className={cn('w-full px-4 py-3 text-left flex items-center gap-3 active:bg-black/[.04]', i > 0 && 'border-t border-line')}>
                  <div className="flex-1 min-w-0">
                    <span className="block text-[14px] font-medium text-tg-text leading-snug">{t.nomi}</span>
                    {t.sub && <span className="block text-[11px] text-tg-hint mt-0.5">{t.sub}</span>}
                  </div>
                  <KodBadge kod={t.kod} />
                </button>
              ))}
            </div>
          )
        ) : sub ? (
          /* ─── Tovarlar ro'yxati ─── */
          tovarlar.length === 0 && tovarYuklanmoqda ? (
            <Holat yuklanmoqda />
          ) : tovarlar.length === 0 ? (
            <Holat matn="Bu bo'limda tovar yo'q" />
          ) : (
            <>
              <div className="bg-tg-bg2 rounded-2xl border border-line overflow-hidden">
                {tovarlar.map((t, i) => (
                  <button key={t.kod} onClick={() => tanla(t)}
                    className={cn('w-full px-4 py-3 text-left flex items-center gap-3 active:bg-black/[.04]', i > 0 && 'border-t border-line')}>
                    <span className="flex-1 min-w-0 text-[14px] font-medium text-tg-text leading-snug">{t.nomi}</span>
                    <KodBadge kod={t.kod} />
                  </button>
                ))}
              </div>
              {tovarlar.length < jami && (
                <button onClick={() => sub && void tovarlarYukla(sub.id, sahifa + 1, true)} disabled={tovarYuklanmoqda}
                  className="w-full mt-2.5 py-2.5 rounded-2xl border border-line bg-tg-bg2 text-[13px] font-semibold text-tg-btn active:opacity-70 flex items-center justify-center gap-2">
                  {tovarYuklanmoqda && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Yana yuklash ({tovarlar.length}/{jami})
                </button>
              )}
            </>
          )
        ) : ota ? (
          /* ─── Subkategoriyalar ─── */
          <div className="bg-tg-bg2 rounded-2xl border border-line overflow-hidden">
            {ota.subs.map((y, i) => (
              <button key={y.id} onClick={() => subTanla(y)}
                className={cn('w-full px-4 py-3 text-left flex items-center gap-2 active:bg-black/[.04]', i > 0 && 'border-t border-line')}>
                <span className="flex-1 min-w-0 text-[14px] font-medium text-tg-text">{y.nomi}</span>
                <ChevronRight className="w-4 h-4 text-tg-hint flex-shrink-0" />
              </button>
            ))}
          </div>
        ) : daraxtXato ? (
          <Holat matn="Katalog yuklanmadi">
            <button onClick={() => setYuklashKaliti(k => k + 1)}
              className="mt-2 px-4 py-2 rounded-xl bg-tg-bg2 border border-line text-[13px] font-semibold text-tg-btn active:opacity-70">
              Qayta urinish
            </button>
          </Holat>
        ) : daraxt === null ? (
          <Holat yuklanmoqda />
        ) : daraxt.length === 0 ? (
          <Holat matn="Katalog bo'sh" />
        ) : (
          /* ─── Ota kategoriyalar ─── */
          <div className="bg-tg-bg2 rounded-2xl border border-line overflow-hidden">
            {daraxt.map((o, i) => (
              <button key={o.id} onClick={() => { haptic?.impactOccurred('light'); setOta(o) }}
                className={cn('w-full px-4 py-3 text-left flex items-center gap-2 active:bg-black/[.04]', i > 0 && 'border-t border-line')}>
                <span className="flex-1 min-w-0 text-[14px] font-semibold text-tg-text">{o.nomi}</span>
                <span className="text-[11px] text-tg-hint flex-shrink-0">{o.subs.length}</span>
                <ChevronRight className="w-4 h-4 text-tg-hint flex-shrink-0" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Qo'lda kiritish */}
      <div className="flex-shrink-0 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-tg-bg border-t border-line">
        <button onClick={() => { haptic?.impactOccurred('light'); onQolda() }}
          className="w-full py-2.5 rounded-2xl text-[13px] font-semibold text-tg-hint active:opacity-70 flex items-center justify-center gap-1.5">
          <PencilLine className="w-3.5 h-3.5" />
          Ro'yxatda topilmadi — qo'lda kiritish
        </button>
      </div>
    </motion.div>
  )
}

function KodBadge({ kod }: { kod: number }) {
  return (
    <span className="flex-shrink-0 px-2 py-0.5 rounded-lg bg-tg-bg border border-line text-[11px] font-mono font-semibold text-tg-hint">
      {kod}
    </span>
  )
}

function Holat({ matn, yuklanmoqda, children }: { matn?: string; yuklanmoqda?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-tg-hint">
      {yuklanmoqda ? (
        <Loader2 className="w-6 h-6 animate-spin" />
      ) : (
        <>
          <PackageSearch className="w-7 h-7 mb-2 opacity-60" />
          <span className="text-[13px]">{matn}</span>
          {children}
        </>
      )}
    </div>
  )
}
