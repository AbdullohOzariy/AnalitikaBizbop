import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { ArrowLeft, Search, X, Loader2, Building2, PencilLine } from 'lucide-react'
import { cn } from '../lib/utils'
import { useTelegram } from '../hooks/useTelegram'
import { useOrqaga } from '../hooks/useOrqaga'

/**
 * Ta'minotchi (Supplier) tanlash sheet'i — SkuPicker bilan bir xil naqsh (qidiruvli
 * to'liq ekranli ro'yxat, tanlangach {id, nomi} qaytadi). Ta'minotchida SKU'dagidek
 * iyerarxiya yo'q — shuning uchun SkuPicker'dan soddaroq: bitta tekis ro'yxat,
 * bo'sh qidiruvda ham server standart ro'yxatni qaytaradi (/api/taminotchilar).
 */

export type TaminotchiTanlov = { id: number; nomi: string }

interface Props {
  onPick: (t: TaminotchiTanlov) => void
  onQolda: () => void
  onClose: () => void
}

async function taminotchiFetch(initData: string, q: string) {
  const params = q ? `?q=${encodeURIComponent(q)}` : ''
  const r = await fetch(`/api/taminotchilar${params}`, { headers: { 'x-telegram-init-data': initData } })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j.xato || `Server xatosi (${r.status})`)
  return j
}

export default function SupplierPicker({ onPick, onQolda, onClose }: Props) {
  const { initData, haptic } = useTelegram()

  const [q, setQ] = useState('')
  const [natija, setNatija] = useState<{ kalit: string; items: TaminotchiTanlov[] } | null>(null)
  const [xato, setXato] = useState(false)
  const [yuklashKaliti, setYuklashKaliti] = useState(0) // qayta urinish tugmasi uchun

  // Bo'sh so'rov ham darhol yuboriladi (server standart ro'yxatni qaytaradi);
  // matn kiritilganda 300ms debounce — har harfda so'rov yubormaslik uchun.
  const s = q.trim()
  useEffect(() => {
    let tirik = true
    const t = setTimeout(() => {
      taminotchiFetch(initData, s)
        .then(j => { if (tirik) { setNatija({ kalit: s, items: j.taminotchilar ?? [] }); setXato(false) } })
        .catch(() => { if (tirik) { setNatija({ kalit: s, items: [] }); setXato(true) } })
    }, s ? 300 : 0)
    return () => { tirik = false; clearTimeout(t) }
  }, [s, initData, yuklashKaliti])

  // Eski natijani xiralashtirib qoldiramiz, spinnerga almashtirmaymiz (SkuPicker
  // bilan bir xil naqsh). `pointer-events-none` — race himoyasi: kalit mos
  // kelmaguncha eski qatorga bosib bo'lmaydi.
  const natijaTayyor = natija?.kalit === s
  const korsatiladigan = natija?.items ?? null
  const qidirilmoqda = !natijaTayyor

  function tanla(t: TaminotchiTanlov) {
    haptic?.impactOccurred('medium')
    onPick(t)
  }

  // Native BackButton — bitta pog'ona (yopish). Markazlashgan stek: lib/orqaga.ts
  useOrqaga(true, onClose)

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
          {/* Haptic SkuPicker:orqaga bilan bir xil bo'lishi uchun (yagona real nomuvofiqlik) */}
          <button onClick={() => { haptic?.impactOccurred('light'); onClose() }} aria-label="Orqaga"
            className="w-9 h-9 rounded-xl flex items-center justify-center text-tg-text active:bg-black/[.05]">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="flex-1 min-w-0 truncate text-[15px] font-bold text-tg-text font-display">Ta'minotchini tanlang</span>
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
              placeholder="Ta'minotchi nomi bo'yicha qidiring..."
              className={cn(
                'w-full bg-tg-bg2 border border-line rounded-2xl pl-9 py-2.5 text-[14px] text-tg-text placeholder:text-ink2 outline-none',
                // Bu yerda bo'sh so'rovda ham spinner chiqishi mumkin (dastlabki
                // yuklash) — shuning uchun shart `q` bilan CHEKLANMAYDI
                q || qidirilmoqda ? 'pr-14' : 'pr-4',
              )}
            />
            {qidirilmoqda && korsatiladigan !== null && (
              <Loader2 className="absolute right-9 top-1/2 w-4 h-4 -translate-y-1/2 animate-spin text-tg-hint" />
            )}
            {q && (
              /* WCAG 2.2 AA tegish nishoni — ilgari o'lchamsiz (16×16px) edi */
              <button onClick={() => setQ('')} aria-label="Tozalash"
                className="absolute right-1 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-tg-hint active:opacity-60">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tarkib */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {korsatiladigan === null || (korsatiladigan.length === 0 && qidirilmoqda) ? (
          <Holat yuklanmoqda />
        ) : xato && korsatiladigan.length === 0 ? (
          <Holat matn="Ro'yxat yuklanmadi">
            <button onClick={() => setYuklashKaliti(k => k + 1)}
              className="mt-2 px-4 py-2 rounded-xl bg-tg-bg2 border border-line text-[13px] font-semibold text-tg-btn active:opacity-70">
              Qayta urinish
            </button>
          </Holat>
        ) : korsatiladigan.length === 0 ? (
          <Holat matn="Hech narsa topilmadi" />
        ) : (
          <div className={cn(
            'bg-tg-bg2 rounded-2xl border border-line overflow-hidden transition-opacity duration-150',
            qidirilmoqda && 'opacity-50 pointer-events-none',
          )}>
            {korsatiladigan.map((t, i) => (
              <button key={t.id} onClick={() => tanla(t)}
                className={cn('w-full px-4 py-3 text-left flex items-center active:bg-black/[.04]', i > 0 && 'border-t border-line')}>
                <span className="flex-1 min-w-0 text-[14px] font-medium text-tg-text leading-snug">{t.nomi}</span>
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
          Ro'yxatda yo'q — qo'lda kiritish
        </button>
      </div>
    </motion.div>
  )
}

function Holat({ matn, yuklanmoqda, children }: { matn?: string; yuklanmoqda?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 text-tg-hint">
      {yuklanmoqda ? (
        <Loader2 className="w-6 h-6 animate-spin" />
      ) : (
        <>
          <Building2 className="w-7 h-7 mb-2 opacity-60" />
          <span className="text-[13px]">{matn}</span>
          {children}
        </>
      )}
    </div>
  )
}
