import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Package, Hash, DollarSign, MapPin, Building2, ChevronDown, AlignLeft } from 'lucide-react'
import { cn, formatSum } from '../lib/utils'
import { useFilialar } from '../hooks/useFilialar'
import PhotoUpload from './PhotoUpload'
import StepHeader from './StepHeader'
import { Button } from './ui/Button'

type Tur = 'vozvrat' | 'kafe' | 'ovqatlanish' | 'spisaniya' | 'ichki_sotuv' | 'qaytarish'
type Yonalish = 'asosiy_filial' | 'taminotchi'
type VozvratHolat = 'xabar_berildi' | 'saqlash_xonasida' | 'yuborildi' | 'qaytarildi' | 'qaytarilmadi'

export interface FormData {
  photo: File | null
  photoBase64: string | null
  photoSize: number
  // QR kod rasmi — IXTIYORIY (QR kodli tovar bo'lsa xodim joylaydi)
  qrPhoto: File | null
  qrPhotoBase64: string | null
  qrPhotoSize: number
  tovarNomi: string
  miqdor: string
  birlik: 'kg' | 'dona' | 'litr'
  summa: string
  sabab: string
  filial: string
  firmaNomi: string
  kafeNomi: string
  yonalish: Yonalish
  taminotchi: string
  vozvratStatus: VozvratHolat
  qaytarilmadiSabab: string
}

const VOZVRAT_HOLAT: { value: VozvratHolat; label: string }[] = [
  { value: 'xabar_berildi',    label: 'Xabar berildi' },
  { value: 'saqlash_xonasida', label: 'Saqlash xonasida' },
  { value: 'yuborildi',        label: 'Yuborildi' },
  { value: 'qaytarildi',       label: 'Qabul qilindi: qaytarildi' },
  { value: 'qaytarilmadi',     label: 'Qabul qilindi: qaytarilmadi' },
]

interface FieldProps {
  label: string
  icon: React.ReactNode
  delay: number
  required?: boolean
  children: React.ReactNode
}

function Field({ label, icon, delay, required, children }: FieldProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring' as const, stiffness: 340, damping: 30 }}
      className="bg-tg-bg2 rounded-2xl border border-line shadow-sm px-4 pt-3 pb-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="text-tg-hint">{icon}</span>
        <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-tg-hint">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
      </div>
      {children}
    </motion.div>
  )
}

interface Props {
  tur: Tur
  onBack: () => void
  onNext: (data: FormData) => void
}

export default function Step2Forma({ tur, onBack, onNext }: Props) {
  const filialar = useFilialar()
  const [photoLoading, setPhotoLoading] = useState(false)
  const [filialOpen, setFilialOpen] = useState(false)
  const [form, setForm] = useState<FormData>({
    photo: null, photoBase64: null, photoSize: 0,
    qrPhoto: null, qrPhotoBase64: null, qrPhotoSize: 0,
    tovarNomi: '', miqdor: '', birlik: 'dona', summa: '', sabab: '',
    filial: '', firmaNomi: '', kafeNomi: '',
    yonalish: 'asosiy_filial', taminotchi: '', vozvratStatus: 'xabar_berildi', qaytarilmadiSabab: '',
  })

  function set<K extends keyof FormData>(k: K, v: FormData[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function handleFile(file: File, base64: string) {
    setPhotoLoading(false)
    set('photo', file)
    set('photoBase64', base64)
    set('photoSize', file.size)
  }

  function handleQrFile(file: File, base64: string) {
    set('qrPhoto', file)
    set('qrPhotoBase64', base64)
    set('qrPhotoSize', file.size)
  }

  const vozvratOk =
    tur !== 'qaytarish' ||
    (form.vozvratStatus !== 'qaytarilmadi' || form.qaytarilmadiSabab.trim().length > 0)

  const isValid = Boolean(
    form.photoBase64 &&
    form.tovarNomi.trim() &&
    form.miqdor.trim() &&
    form.summa.trim() &&
    form.sabab.trim() &&
    form.filial &&
    vozvratOk
  )

  return (
    <div className="flex flex-col h-screen bg-tg-bg">
      <StepHeader onBack={onBack} step={2} tur={tur} />

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-2.5">

        {/* Photo */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0, type: 'spring' as const, stiffness: 340, damping: 30 }}
        >
          <PhotoUpload
            base64={form.photoBase64}
            fileSize={form.photoSize}
            loading={photoLoading}
            onFile={handleFile}
            onClear={() => { set('photo', null); set('photoBase64', null); set('photoSize', 0) }}
          />
        </motion.div>

        {/* QR kod rasmi — ixtiyoriy (faqat yozuv turlari; qaytarish alohida jadval) */}
        {tur !== 'qaytarish' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.03, type: 'spring' as const, stiffness: 340, damping: 30 }}
          >
            <PhotoUpload
              base64={form.qrPhotoBase64}
              fileSize={form.qrPhotoSize}
              loading={false}
              onFile={handleQrFile}
              onClear={() => { set('qrPhoto', null); set('qrPhotoBase64', null); set('qrPhotoSize', 0) }}
              title="QR kod rasmi (ixtiyoriy)"
              hint="QR kodli tovar bo'lsa joylang"
            />
          </motion.div>
        )}

        {/* Tovar nomi */}
        <Field label="Tovar nomi" icon={<Package className="w-3.5 h-3.5" />} delay={0.06} required>
          <input
            type="text"
            value={form.tovarNomi}
            onChange={e => set('tovarNomi', e.target.value)}
            placeholder="Masalan: Lipton choy 100g"
            className="w-full bg-transparent text-[15px] text-tg-text placeholder:text-tg-hint/60 outline-none"
          />
        </Field>

        {/* Miqdor + birlik */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.10, type: 'spring' as const, stiffness: 340, damping: 30 }}
          className="bg-tg-bg2 rounded-2xl border border-line shadow-sm px-4 pt-3 pb-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <Hash className="w-3.5 h-3.5 text-tg-hint" />
            <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-tg-hint">
              Miqdor<span className="text-red-500 ml-0.5">*</span>
            </span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="text" inputMode="decimal"
              value={form.miqdor}
              onChange={e => {
                const v = e.target.value.replace(',', '.').replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1')
                set('miqdor', v)
              }}
              placeholder="0"
              className="flex-1 bg-transparent text-[15px] text-tg-text placeholder:text-tg-hint/60 outline-none w-0"
            />
            <div className="flex gap-1">
              {(['dona', 'kg', 'litr'] as const).map(b => (
                <button
                  key={b}
                  onClick={() => set('birlik', b)}
                  className={cn(
                    'px-2.5 py-1 rounded-lg text-[12px] font-bold transition-all duration-150 active:scale-95',
                    form.birlik === b
                      ? 'bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-sm'
                      : 'bg-tg-bg text-tg-hint border border-line'
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Summa */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.14, type: 'spring' as const, stiffness: 340, damping: 30 }}
          className="bg-tg-bg2 rounded-2xl border border-line shadow-sm px-4 pt-3 pb-3"
        >
          <div className="flex items-center gap-2 mb-2">
            <DollarSign className="w-3.5 h-3.5 text-tg-hint" />
            <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-tg-hint">
              Summa<span className="text-red-500 ml-0.5">*</span>
            </span>
          </div>
          <input
            type="text" inputMode="numeric"
            value={form.summa}
            onChange={e => set('summa', e.target.value.replace(/[^0-9]/g, ''))}
            placeholder="0"
            className="w-full bg-transparent text-[15px] text-tg-text placeholder:text-tg-hint/60 outline-none"
          />
          {form.summa && Number(form.summa) > 0 && (
            <p className="text-[12px] text-tg-btn font-semibold mt-1.5">{formatSum(Number(form.summa))}</p>
          )}
        </motion.div>

        {/* Sabab */}
        <Field label="Sabab" icon={<AlignLeft className="w-3.5 h-3.5" />} delay={0.18} required>
          <input
            type="text"
            value={form.sabab}
            onChange={e => set('sabab', e.target.value)}
            placeholder="Masalan: Muddati o'tgan"
            className="w-full bg-transparent text-[15px] text-tg-text placeholder:text-tg-hint/60 outline-none"
          />
        </Field>

        {/* Filial dropdown */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, type: 'spring' as const, stiffness: 340, damping: 30 }}
          className="relative"
        >
          <div
            className="bg-tg-bg2 rounded-2xl border border-line shadow-sm px-4 pt-3 pb-3 cursor-pointer active:opacity-80 transition-opacity"
            onClick={() => setFilialOpen(v => !v)}
          >
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-3.5 h-3.5 text-tg-hint" />
              <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-tg-hint">
                Filial<span className="text-red-500 ml-0.5">*</span>
              </span>
            </div>
            <div className="flex items-center justify-between pointer-events-none">
              <span className={cn('text-[15px]', form.filial ? 'text-tg-text font-medium' : 'text-tg-hint/60')}>
                {form.filial || 'Filialni tanlang'}
              </span>
              <ChevronDown className={cn(
                'w-4 h-4 text-tg-hint transition-transform duration-200',
                filialOpen && 'rotate-180'
              )} />
            </div>
          </div>

          <AnimatePresence>
            {filialOpen && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6, scale: 0.98 }}
                transition={{ type: 'spring' as const, stiffness: 400, damping: 32 }}
                className="absolute left-0 right-0 top-full mt-1.5 bg-tg-bg2 rounded-2xl shadow-lg overflow-hidden z-20 border border-line"
              >
                {filialar.length === 0 ? (
                  <p className="px-4 py-3 text-[14px] text-tg-hint">Yuklanmoqda...</p>
                ) : filialar.map((f, i) => (
                  <button
                    key={f}
                    onClick={() => { set('filial', f); setFilialOpen(false) }}
                    className={cn(
                      'w-full px-4 py-3 text-left text-[15px] transition-colors active:bg-black/[.04] flex items-center justify-between',
                      i > 0 && 'border-t border-line',
                      form.filial === f ? 'text-tg-btn font-semibold' : 'text-tg-text'
                    )}
                  >
                    {f}
                    {form.filial === f && (
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2.5 7l3.5 3.5 5.5-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>

        {/* Qayta ishlash: firma nomi */}
        {tur === 'vozvrat' && (
          <Field label="Firma nomi (ixtiyoriy)" icon={<Building2 className="w-3.5 h-3.5" />} delay={0.26}>
            <input
              type="text"
              value={form.firmaNomi}
              onChange={e => set('firmaNomi', e.target.value)}
              placeholder="Masalan: Nestlé Uzbekistan"
              className="w-full bg-transparent text-[15px] text-tg-text placeholder:text-tg-hint/60 outline-none"
            />
          </Field>
        )}

        {/* Vozvrat: yo'nalish + holat */}
        {tur === 'qaytarish' && (
          <>
            <Field label="Qayerga" icon={<Building2 className="w-3.5 h-3.5" />} delay={0.26} required>
              <div className="flex gap-2">
                {([['asosiy_filial', 'Asosiy filialga'], ['taminotchi', 'Ta\'minotchiga']] as const).map(([val, lbl]) => (
                  <button
                    key={val}
                    onClick={() => set('yonalish', val)}
                    className={cn(
                      'flex-1 px-3 py-2 rounded-xl text-[13px] font-semibold transition-all active:scale-95',
                      form.yonalish === val ? 'bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-sm' : 'bg-tg-bg text-tg-hint border border-line'
                    )}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </Field>

            {form.yonalish === 'taminotchi' && (
              <Field label="Ta'minotchi nomi (ixtiyoriy)" icon={<Building2 className="w-3.5 h-3.5" />} delay={0.28}>
                <input
                  type="text"
                  value={form.taminotchi}
                  onChange={e => set('taminotchi', e.target.value)}
                  placeholder="Masalan: Nestlé Uzbekistan"
                  className="w-full bg-transparent text-[15px] text-tg-text placeholder:text-tg-hint/60 outline-none"
                />
              </Field>
            )}

            <Field label="Holat" icon={<AlignLeft className="w-3.5 h-3.5" />} delay={0.3} required>
              <div className="flex flex-col gap-1.5">
                {VOZVRAT_HOLAT.map(h => (
                  <button
                    key={h.value}
                    onClick={() => set('vozvratStatus', h.value)}
                    className={cn(
                      'w-full px-3 py-2 rounded-xl text-[13px] font-semibold text-left transition-all active:scale-[.98]',
                      form.vozvratStatus === h.value ? 'bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-sm' : 'bg-tg-bg text-tg-hint border border-line'
                    )}
                  >
                    {h.label}
                  </button>
                ))}
              </div>
            </Field>

            {form.vozvratStatus === 'qaytarilmadi' && (
              <Field label="Qaytarilmadi sababi" icon={<AlignLeft className="w-3.5 h-3.5" />} delay={0.32} required>
                <input
                  type="text"
                  value={form.qaytarilmadiSabab}
                  onChange={e => set('qaytarilmadiSabab', e.target.value)}
                  placeholder="Nega qaytarilmadi?"
                  className="w-full bg-transparent text-[15px] text-tg-text placeholder:text-tg-hint/60 outline-none"
                />
              </Field>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-tg-bg border-t border-line">
        <Button disabled={!isValid} onClick={() => isValid && onNext(form)}>
          Davom etish
        </Button>
      </div>
    </div>
  )
}
