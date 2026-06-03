import { useState } from 'react'
import { motion } from 'framer-motion'
import { Send, Loader2, ImageIcon, Package, Hash, DollarSign, MapPin, Building2, AlignLeft, Tag } from 'lucide-react'
import { formatSum } from '../lib/utils'
import { useTelegram } from '../hooks/useTelegram'
import StepHeader from './StepHeader'
import { Button } from './ui/Button'
import type { FormData } from './Step2Forma'

type Tur = 'vozvrat' | 'kafe' | 'ovqatlanish' | 'spisaniya' | 'ichki_sotuv'

interface Props {
  tur: Tur
  form: FormData
  onBack: () => void
  onDone: () => void
}

const TUR_LABELS: Record<Tur, string> = {
  vozvrat:     'Qayta ishlash',
  kafe:        'Kafe xarajati',
  ovqatlanish: 'Umumiy ovqatlanish',
  spisaniya:   'Spisaniya',
  ichki_sotuv: 'Ichki sotuv',
}

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 340, damping: 30 } },
}

export default function Step3Tasdiq({ tur, form, onBack, onDone }: Props) {
  const { tg, haptic, initData } = useTelegram()
  const [loading, setLoading] = useState(false)
  const [xato, setXato] = useState<string | null>(null)

  async function handleYuborish() {
    haptic?.impactOccurred('medium')
    setLoading(true)
    setXato(null)
    try {
      let fileId: string | null = null
      if (form.photo) {
        try {
          const fd = new FormData()
          fd.append('rasm', form.photo)
          const res = await fetch('/api/rasm-yukla', {
            method: 'POST',
            headers: { 'x-telegram-init-data': initData },
            body: fd,
          })
          const json = await res.json()
          fileId = json.file_id ?? null
        } catch {
          // rasm yuklanmasa ham davom etamiz
        }
      }

      const tgUser = tg?.initDataUnsafe?.user
      const payload: Record<string, unknown> = {
        tur,
        tovar: form.tovarNomi,
        miqdor: Number(form.miqdor.replace(',', '.')) || 1,
        birlik: form.birlik,
        summa: Number(form.summa) || 0,
        sabab: form.sabab,
        filial: form.filial,
        rasm_file_id: fileId,
        xodim_id: tgUser?.id ?? 0,
        xodim_ism: tgUser ? `${tgUser.first_name}${tgUser.last_name ? ' ' + tgUser.last_name : ''}` : 'Nomalum',
        xodim_username: tgUser?.username ?? null,
      }
      if (tur === 'vozvrat') payload.firma = form.firmaNomi

      const r = await fetch('/api/yozuv', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
        },
        body: JSON.stringify(payload),
      })
      if (!r.ok) {
        const err = await r.json().catch(() => ({}))
        throw new Error(err.xato || `Server xatosi (${r.status})`)
      }
      haptic?.notificationOccurred('success')
      onDone()
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Noma\'lum xato'
      setXato(msg)
      haptic?.notificationOccurred('error')
      setLoading(false)
    }
  }

  const rows: { icon: React.ReactNode; label: string; value: string }[] = [
    { icon: <Tag className="w-3.5 h-3.5" />,        label: 'Tur',    value: TUR_LABELS[tur] },
    { icon: <Package className="w-3.5 h-3.5" />,    label: 'Tovar',  value: form.tovarNomi },
    { icon: <Hash className="w-3.5 h-3.5" />,       label: 'Miqdor', value: `${form.miqdor} ${form.birlik}` },
    { icon: <DollarSign className="w-3.5 h-3.5" />, label: 'Summa',  value: form.summa ? formatSum(Number(form.summa)) : '—' },
    { icon: <AlignLeft className="w-3.5 h-3.5" />,  label: 'Sabab',  value: form.sabab },
    { icon: <MapPin className="w-3.5 h-3.5" />,     label: 'Filial', value: form.filial },
    ...(tur === 'vozvrat' && form.firmaNomi
      ? [{ icon: <Building2 className="w-3.5 h-3.5" />, label: 'Firma', value: form.firmaNomi }]
      : []),
  ]

  return (
    <div className="flex flex-col h-screen bg-tg-bg">
      <StepHeader onBack={onBack} step={3} tur="tasdiq" />

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-3">

        {/* Photo */}
        {form.photoBase64 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl overflow-hidden border border-black/[.05]"
          >
            <img src={form.photoBase64} alt="Tovar rasmi" className="w-full max-h-[200px] object-cover block" />
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl bg-tg-bg2 border border-black/[.05] h-[72px] flex items-center justify-center gap-2 text-tg-hint"
          >
            <ImageIcon className="w-4 h-4" />
            <span className="text-[13px]">Rasm yo'q</span>
          </motion.div>
        )}

        {/* Info rows */}
        <motion.div
          initial="hidden"
          animate="show"
          variants={{ show: { transition: { staggerChildren: 0.05 } } }}
          className="bg-tg-bg2 rounded-2xl border border-black/[.05] overflow-hidden"
        >
          {rows.map((row, i) => (
            <motion.div
              key={i}
              variants={item}
              className={[
                'flex items-center gap-3 px-4 py-3',
                i > 0 ? 'border-t border-black/[.04]' : '',
              ].join(' ')}
            >
              <span className="text-tg-hint flex-shrink-0">{row.icon}</span>
              <span className="text-[12px] text-tg-hint w-14 flex-shrink-0">{row.label}</span>
              <span className="text-[14px] font-semibold text-tg-text flex-1 text-right">{row.value}</span>
            </motion.div>
          ))}
        </motion.div>

        {/* Notice */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3 }}
          className="text-[12px] text-tg-hint text-center px-4"
        >
          Ma'lumotlar to'g'riligini tekshirib, «Yuborish» tugmasini bosing
        </motion.p>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-tg-bg border-t border-black/[.05] space-y-2">
        {xato && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-[13px] text-red-600 font-medium"
          >
            ⚠️ {xato}
          </motion.div>
        )}
        <Button variant="success" disabled={loading} onClick={handleYuborish}>
          {loading
            ? <><Loader2 className="w-4 h-4 animate-spin" /> Yuklanmoqda...</>
            : <><Send className="w-4 h-4" /> Yuborish</>
          }
        </Button>
      </div>
    </div>
  )
}
