import { useState } from 'react'
import { motion } from 'framer-motion'
import { Send, Loader2, ImageIcon, Package, Hash, DollarSign, MapPin, Building2, AlignLeft, Tag, Barcode } from 'lucide-react'
import { formatSum } from '../lib/utils'
import { useTelegram } from '../hooks/useTelegram'
import StepHeader from './StepHeader'
import { Button } from './ui/Button'
import type { FormData } from './Step2Forma'

type Tur = 'vozvrat' | 'kafe' | 'ovqatlanish' | 'spisaniya' | 'ichki_sotuv' | 'qaytarish'

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
  qaytarish:   'Vozvrat',
}

const YONALISH_LABEL: Record<string, string> = {
  asosiy_filial: 'Asosiy filialga',
  taminotchi:    'Ta\'minotchiga',
}
const VOZVRAT_HOLAT_LABEL: Record<string, string> = {
  xabar_berildi:    'Xabar berildi',
  saqlash_xonasida: 'Saqlash xonasida',
  yuborildi:        'Yuborildi',
  qaytarildi:       'Qabul qilindi: qaytarildi',
  qaytarilmadi:     'Qabul qilindi: qaytarilmadi',
}

const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 340, damping: 30 } },
}

export default function Step3Tasdiq({ tur, form, onBack, onDone }: Props) {
  const { tg, haptic, initData } = useTelegram()
  const [loading, setLoading] = useState(false)
  const [xato, setXato] = useState<string | null>(null)

  // Yakuniy sabab matni — tanlov o'zi yoki "Boshqa: <matn>"
  const sabab = form.sababTanlov === 'Boshqa'
    ? `Boshqa: ${form.sababMatn.trim()}`
    : form.sababTanlov

  async function handleYuborish() {
    haptic?.impactOccurred('medium')
    setLoading(true)
    setXato(null)
    try {
      let fileId: string | null = null
      if (form.photo) {
        const fd = new FormData()
        fd.append('rasm', form.photo)
        const res = await fetch('/api/rasm-yukla', {
          method: 'POST',
          headers: { 'x-telegram-init-data': initData },
          body: fd,
        })
        const json = await res.json().catch(() => ({}))
        if (!res.ok || !json.file_id) {
          throw new Error(json.xato || 'Rasm yuklanmadi. Qaytadan urinib ko\'ring.')
        }
        fileId = json.file_id
      }

      // QR kod rasmi — ixtiyoriy; yuklanmasa ham yozuv ketaveradi
      let qrFileId: string | null = null
      if (tur !== 'qaytarish' && form.qrPhoto) {
        try {
          const fd = new FormData()
          fd.append('rasm', form.qrPhoto)
          const res = await fetch('/api/rasm-yukla', {
            method: 'POST',
            headers: { 'x-telegram-init-data': initData },
            body: fd,
          })
          const json = await res.json().catch(() => ({}))
          if (res.ok && json.file_id) qrFileId = json.file_id
        } catch { /* ixtiyoriy — jim */ }
      }

      const tgUser = tg?.initDataUnsafe?.user
      const miqdor = Number(form.miqdor.replace(',', '.')) || 1
      const summa = Number(form.summa) || 0

      let endpoint = '/api/yozuv'
      let payload: Record<string, unknown>

      if (tur === 'qaytarish') {
        // Yangi Vozvrat jarayoni — alohida endpoint/jadval.
        endpoint = '/api/vozvrat'
        payload = {
          tovar: form.tovarNomi,
          sku_kod: form.skuKod ?? undefined,
          miqdor,
          birlik: form.birlik,
          summa,
          sabab,
          filial: form.filial,
          yonalish: form.yonalish,
          taminotchi: form.yonalish === 'taminotchi' ? (form.taminotchi || null) : null,
          status: form.vozvratStatus,
          qaytarilmadi_sabab: form.vozvratStatus === 'qaytarilmadi' ? form.qaytarilmadiSabab : null,
          rasm_file_id: fileId,
        }
      } else {
        payload = {
          tur,
          tovar: form.tovarNomi,
          sku_kod: form.skuKod ?? undefined,
          miqdor,
          birlik: form.birlik,
          summa,
          sabab,
          filial: form.filial,
          rasm_file_id: fileId,
          qr_file_id: qrFileId,
          xodim_id: tgUser?.id ?? 0,
          xodim_ism: tgUser ? `${tgUser.first_name}${tgUser.last_name ? ' ' + tgUser.last_name : ''}` : 'Nomalum',
          xodim_username: tgUser?.username ?? null,
        }
        if (tur === 'vozvrat') payload.firma = form.firmaNomi
      }

      const r = await fetch(endpoint, {
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
    ...(form.skuKod !== null
      ? [{ icon: <Barcode className="w-3.5 h-3.5" />, label: 'Kod', value: String(form.skuKod) }]
      : []),
    { icon: <Hash className="w-3.5 h-3.5" />,       label: 'Miqdor', value: `${form.miqdor} ${form.birlik}` },
    { icon: <DollarSign className="w-3.5 h-3.5" />, label: 'Summa',  value: form.summa ? formatSum(Number(form.summa)) : '—' },
    { icon: <AlignLeft className="w-3.5 h-3.5" />,  label: 'Sabab',  value: sabab },
    { icon: <MapPin className="w-3.5 h-3.5" />,     label: 'Filial', value: form.filial },
    ...(form.qrPhotoBase64
      ? [{ icon: <ImageIcon className="w-3.5 h-3.5" />, label: 'QR kod', value: '✓ biriktirildi' }]
      : []),
    ...(tur === 'vozvrat' && form.firmaNomi
      ? [{ icon: <Building2 className="w-3.5 h-3.5" />, label: 'Firma', value: form.firmaNomi }]
      : []),
    ...(tur === 'qaytarish'
      ? [
          { icon: <Building2 className="w-3.5 h-3.5" />, label: 'Qayerga', value: YONALISH_LABEL[form.yonalish] + (form.yonalish === 'taminotchi' && form.taminotchi ? ` (${form.taminotchi})` : '') },
          { icon: <Tag className="w-3.5 h-3.5" />, label: 'Holat', value: VOZVRAT_HOLAT_LABEL[form.vozvratStatus] },
          ...(form.vozvratStatus === 'qaytarilmadi' && form.qaytarilmadiSabab
            ? [{ icon: <AlignLeft className="w-3.5 h-3.5" />, label: 'Qaytarilmadi', value: form.qaytarilmadiSabab }]
            : []),
        ]
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
            className="rounded-2xl overflow-hidden border border-line"
          >
            <img src={form.photoBase64} alt="Tovar rasmi" className="w-full max-h-[200px] object-cover block" />
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="rounded-2xl bg-tg-bg2 border border-line h-[72px] flex items-center justify-center gap-2 text-tg-hint"
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
          className="bg-tg-bg2 rounded-2xl border border-line overflow-hidden"
        >
          {rows.map((row, i) => (
            <motion.div
              key={i}
              variants={item}
              className={[
                'flex items-center gap-3 px-4 py-3',
                i > 0 ? 'border-t border-line' : '',
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
      <div className="flex-shrink-0 px-4 pt-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-tg-bg border-t border-line space-y-2">
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
