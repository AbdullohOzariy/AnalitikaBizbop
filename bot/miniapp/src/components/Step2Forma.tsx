import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Package, Hash, DollarSign, MapPin, Building2, ChevronDown, ChevronRight, AlignLeft, X } from 'lucide-react'
import { cn, formatSum } from '../lib/utils'
import { useFilialar } from '../hooks/useFilialar'
import { useSabablar } from '../hooks/useSabablar'
import { useOrqaga } from '../hooks/useOrqaga'
import PhotoUpload from './PhotoUpload'
import StepHeader from './StepHeader'
import SkuPicker, { type SkuTanlov } from './SkuPicker'
import SupplierPicker, { type TaminotchiTanlov } from './SupplierPicker'
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
  // SKU katalogdan tanlangan bo'lsa — Product.code (1C kod); qo'lda kiritilsa null
  skuKod: number | null
  miqdor: string
  birlik: 'kg' | 'dona' | 'litr'
  summa: string
  // Sabab — faqat ro'yxatdan tanlanadi (erkin matn yo'q)
  sababTanlov: string
  filial: string
  firmaNomi: string
  kafeNomi: string
  yonalish: Yonalish
  taminotchi: string
  // Ta'minotchi picker'dan tanlangan bo'lsa — Prisma Supplier.id; qo'lda kiritilsa null
  taminotchiId: number | null
  vozvratStatus: VozvratHolat
  qaytarilmadiSabab: string
}

// Forma holatining egasi — App (Step3 → "Orqaga" da bu komponent unmount bo'ladi, holat
// esa qolishi kerak). Bo'sh forma fabrikasi: lib/forma.ts (react-refresh talabi).

// Sabablar endi hardcode emas — /api/sabablar orqali `sabablar` jadvalidan keladi
// (admin /chiqim/sabablar tabida boshqaradi). Qarang: hooks/useSabablar.ts

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
        {/* text-ink2 (text-tg-hint EMAS): 11px uppercase yorliq --tg-hint bilan
            3.44:1 — WCAG AA (4.5:1) dan past. Ikonka hint rangida qolaveradi. */}
        <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-ink2">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </span>
      </div>
      {children}
    </motion.div>
  )
}

/** Maydon ostidagi xato matni — `aria-describedby` orqali inputga bog'lanadi. */
function MaydonXato({ id, matn }: { id: string; matn: string | null }) {
  if (!matn) return null
  return (
    <p id={id} className="mt-1.5 text-[12px] font-medium text-red-500">
      {matn}
    </p>
  )
}

interface Props {
  tur: Tur
  // Forma holati App'da yashaydi — komponent to'liq controlled
  form: FormData
  setForm: React.Dispatch<React.SetStateAction<FormData>>
  onBack: () => void
  onNext: () => void
}

export default function Step2Forma({ tur, form, setForm, onBack, onNext }: Props) {
  const filialar = useFilialar()
  const SABABLAR = useSabablar()
  const [photoLoading, setPhotoLoading] = useState(false)
  const [photoXato, setPhotoXato] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [qrXato, setQrXato] = useState<string | null>(null)
  // Xato matnlari faqat maydonga TEGILGANDAN keyin — bo'sh formani darhol
  // qizil qilib ko'rsatish xodimni ayblayotgandek tuyuladi.
  const [teginilgan, setTeginilgan] = useState<{ miqdor?: boolean; summa?: boolean }>({})
  const [filialOpen, setFilialOpen] = useState(false)
  const [pickerOchiq, setPickerOchiq] = useState(false)
  // Qo'lda kiritish rejimlari — lokal UI holati, lekin qaytib kelganda (Step3 → Orqaga,
  // yoki qoralamadan tiklanganda) qo'lda kiritilgan matn ko'rinmay qolmasligi uchun
  // mavjud formadan derive qilinadi.
  const [qolda, setQolda] = useState(() => form.skuKod === null && form.tovarNomi.trim().length > 0)
  const [taminotchiPickerOchiq, setTaminotchiPickerOchiq] = useState(false)
  const [taminotchiQolda, setTaminotchiQolda] = useState(
    () => form.taminotchiId === null && form.taminotchi.trim().length > 0,
  )

  function set<K extends keyof FormData>(k: K, v: FormData[K]) {
    setForm(f => ({ ...f, [k]: v }))
  }

  function skuTanlandi(t: SkuTanlov) {
    setForm(f => ({ ...f, tovarNomi: t.nomi, skuKod: t.kod }))
    setPickerOchiq(false)
    setQolda(false)
  }

  function skuTozala() {
    setForm(f => ({ ...f, tovarNomi: '', skuKod: null }))
  }

  function taminotchiTanlandi(t: TaminotchiTanlov) {
    setForm(f => ({ ...f, taminotchi: t.nomi, taminotchiId: t.id }))
    setTaminotchiPickerOchiq(false)
    setTaminotchiQolda(false)
  }

  function taminotchiTozala() {
    setForm(f => ({ ...f, taminotchi: '', taminotchiId: null }))
  }

  function handleFile(file: File, base64: string) {
    setPhotoLoading(false)
    setPhotoXato(null)
    setForm(f => ({ ...f, photo: file, photoBase64: base64, photoSize: file.size }))
  }

  function handleQrFile(file: File, base64: string) {
    setQrLoading(false)
    setQrXato(null)
    setForm(f => ({ ...f, qrPhoto: file, qrPhotoBase64: base64, qrPhotoSize: file.size }))
  }

  const vozvratOk =
    tur !== 'qaytarish' ||
    (form.vozvratStatus !== 'qaytarilmadi' || form.qaytarilmadiSabab.trim().length > 0)

  const sababOk = Boolean(form.sababTanlov)

  // Miqdor MUSBAT bo'lishi shart. Ilgari `form.miqdor.trim()` yetarli edi va
  // "0" ham o'tib ketardi — Step3 esa uni jimgina `|| 1` bilan almashtirib,
  // tasdiq ekranida "0 dona" ko'rsatib bazaga 1 yozardi (ma'lumot soxtalashishi).
  const miqdorSoni = Number(form.miqdor.replace(',', '.'))
  const miqdorOk = form.miqdor.trim().length > 0 && Number.isFinite(miqdorSoni) && miqdorSoni > 0
  const summaOk = form.summa.trim().length > 0

  const miqdorXato = !teginilgan.miqdor || miqdorOk
    ? null
    : form.miqdor.trim().length === 0
      ? 'Miqdorni kiriting'
      : 'Miqdor 0 dan katta bo\'lishi kerak'
  const summaXato = !teginilgan.summa || summaOk ? null : 'Summani kiriting'

  const isValid = Boolean(
    form.photoBase64 &&
    form.tovarNomi.trim() &&
    miqdorOk &&
    summaOk &&
    sababOk &&
    form.filial &&
    vozvratOk
  )

  // Disabled CTA sababini AYTADI — xodim aks holda qaysi maydon qolganini
  // topolmay ekranni yuqoriga-pastga aylantirishga majbur edi.
  const yetishmayapti: string[] = []
  if (!form.photoBase64) yetishmayapti.push('Rasm')
  if (!form.tovarNomi.trim()) yetishmayapti.push('Tovar')
  if (!miqdorOk) yetishmayapti.push('Miqdor')
  if (!summaOk) yetishmayapti.push('Summa')
  if (!sababOk) yetishmayapti.push('Sabab')
  if (!form.filial) yetishmayapti.push('Filial')
  if (!vozvratOk) yetishmayapti.push('Qaytarilmadi sababi')

  // Filial varag'i ochiq bo'lsa native "orqaga" uni yopadi (qadamdan chiqmaydi)
  useOrqaga(filialOpen, () => setFilialOpen(false))

  return (
    /* h-screen EMAS: 6 ta input bor va hujjat scroll'i yopiq — klaviatura ochilganda
       100vh o'zgarmagani uchun "Davom etish" ekran ostida qolardi. --app-h ni
       App.tsx `viewportChanged` orqali yangilaydi (qarang index.css). */
    <div className="flex flex-col h-[var(--app-h)] bg-tg-bg">
      <StepHeader onBack={onBack} step={2} tur={tur} />

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-4 space-y-2.5">

        {/* Photo */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0, type: 'spring' as const, stiffness: 340, damping: 30 }}
        >
          <PhotoUpload
            required
            base64={form.photoBase64}
            fileSize={form.photoSize}
            loading={photoLoading}
            xato={photoXato}
            onStart={() => { setPhotoLoading(true); setPhotoXato(null) }}
            onXato={(m) => { setPhotoLoading(false); setPhotoXato(m) }}
            onFile={handleFile}
            onClear={() => {
              setPhotoXato(null)
              setForm(f => ({ ...f, photo: null, photoBase64: null, photoSize: 0 }))
            }}
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
              loading={qrLoading}
              xato={qrXato}
              onStart={() => { setQrLoading(true); setQrXato(null) }}
              onXato={(m) => { setQrLoading(false); setQrXato(m) }}
              onFile={handleQrFile}
              onClear={() => {
                setQrXato(null)
                setForm(f => ({ ...f, qrPhoto: null, qrPhotoBase64: null, qrPhotoSize: 0 }))
              }}
              title="QR kod rasmi (ixtiyoriy)"
              hint="QR kodli tovar bo'lsa joylang"
            />
          </motion.div>
        )}

        {/* Tovar — SKU katalogdan tanlanadi (fallback: qo'lda kiritish) */}
        <Field label="Tovar" icon={<Package className="w-3.5 h-3.5" />} delay={0.06} required>
          {form.skuKod !== null ? (
            <div className="flex items-center gap-2">
              <span className="flex-1 min-w-0 text-[15px] font-medium text-tg-text leading-snug">
                {form.tovarNomi}
              </span>
              <span className="flex-shrink-0 px-2 py-0.5 rounded-lg bg-tg-bg border border-line text-[11px] font-mono font-semibold text-tg-hint">
                {form.skuKod}
              </span>
              <button onClick={skuTozala} aria-label="Tovarni tozalash"
                className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-tg-hint active:bg-black/[.05]">
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : qolda ? (
            <>
              <input
                type="text"
                value={form.tovarNomi}
                onChange={e => set('tovarNomi', e.target.value)}
                placeholder="Masalan: Lipton choy 100g"
                className="w-full bg-transparent text-[15px] text-tg-text placeholder:text-ink2 outline-none"
              />
              <button onClick={() => { setQolda(false); setPickerOchiq(true) }}
                className="mt-2 text-[12px] font-semibold text-tg-btn active:opacity-70">
                Katalogdan tanlash
              </button>
            </>
          ) : (
            <button onClick={() => setPickerOchiq(true)}
              className="w-full flex items-center justify-between text-left active:opacity-70">
              {/* text-ink2, hint rangining 60% alpha varianti EMAS (klass nomini
                  izohda to'liq yozmang — skaner uni build'ga qo'shib yuboradi):
                  u oq kartada ~1.9:1 beradi, bu esa bo'sh MAJBURIY maydonning
                  yagona ko'rinadigan matni. */}
              <span className="text-[15px] text-ink2">Katalogdan tanlang</span>
              <ChevronRight className="w-4 h-4 text-tg-hint" />
            </button>
          )}
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
            <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-ink2">
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
              onBlur={() => setTeginilgan(t => ({ ...t, miqdor: true }))}
              aria-invalid={miqdorXato !== null}
              aria-describedby={miqdorXato ? 'miqdor-xato' : undefined}
              placeholder="0"
              className="flex-1 bg-transparent text-[15px] text-tg-text placeholder:text-ink2 outline-none w-0"
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
                      : 'bg-tg-bg text-ink2 border border-line'
                  )}
                >
                  {b}
                </button>
              ))}
            </div>
          </div>
          <MaydonXato id="miqdor-xato" matn={miqdorXato} />
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
            <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-ink2">
              Summa<span className="text-red-500 ml-0.5">*</span>
            </span>
          </div>
          <input
            type="text" inputMode="numeric"
            value={form.summa}
            onChange={e => set('summa', e.target.value.replace(/[^0-9]/g, ''))}
            onBlur={() => setTeginilgan(t => ({ ...t, summa: true }))}
            aria-invalid={summaXato !== null}
            aria-describedby={summaXato ? 'summa-xato' : undefined}
            placeholder="0"
            className="w-full bg-transparent text-[15px] text-tg-text placeholder:text-ink2 outline-none"
          />
          {form.summa && Number(form.summa) > 0 && (
            <p className="text-[12px] text-tg-btn font-semibold mt-1.5">{formatSum(Number(form.summa))}</p>
          )}
          <MaydonXato id="summa-xato" matn={summaXato} />
        </motion.div>

        {/* Sabab — ro'yxatdan tanlanadi */}
        <Field label="Sabab" icon={<AlignLeft className="w-3.5 h-3.5" />} delay={0.18} required>
          <div className="flex flex-wrap gap-1.5">
            {SABABLAR.map(sb => (
              <button
                key={sb}
                onClick={() => set('sababTanlov', form.sababTanlov === sb ? '' : sb)}
                className={cn(
                  'px-3 py-1.5 rounded-xl text-[12px] font-semibold transition-all duration-150 active:scale-95',
                  form.sababTanlov === sb
                    ? 'bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-sm'
                    : 'bg-tg-bg text-ink2 border border-line'
                )}
              >
                {sb}
              </button>
            ))}
          </div>
        </Field>

        {/* Filial — bottom sheet (absolute dropdown EMAS).
            Eski variant: (a) ro'yxat "fold" ostiga tushib ko'rinmasdi, (b) tashqariga
            bosib yopib bo'lmasdi, (c) `div + onClick` — klaviatura/skrinrider uchun
            tugma emas edi. Sheet uchalasini bir yo'la yopadi. Ro'yxat serverda
            cheklanmagan — shuning uchun `max-h-[50vh] overflow-y-auto`. */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22, type: 'spring' as const, stiffness: 340, damping: 30 }}
        >
          <button
            type="button"
            aria-haspopup="listbox"
            aria-expanded={filialOpen}
            onClick={() => setFilialOpen(true)}
            className="w-full text-left bg-tg-bg2 rounded-2xl border border-line shadow-sm px-4 pt-3 pb-3 active:opacity-80 transition-opacity"
          >
            <div className="flex items-center gap-2 mb-2">
              <MapPin className="w-3.5 h-3.5 text-tg-hint" />
              <span className="text-[11px] font-bold uppercase tracking-[0.5px] text-ink2">
                Filial<span className="text-red-500 ml-0.5">*</span>
              </span>
            </div>
            {/* pointer-events-none — ATAYLAB (bosish tashqi tugmaga o'tsin) */}
            <div className="flex items-center justify-between pointer-events-none">
              <span className={cn('text-[15px]', form.filial ? 'text-tg-text font-medium' : 'text-ink2')}>
                {form.filial || 'Filialni tanlang'}
              </span>
              <ChevronDown className="w-4 h-4 text-tg-hint" />
            </div>
          </button>
        </motion.div>

        {/* Qayta ishlash: firma nomi */}
        {tur === 'vozvrat' && (
          <Field label="Firma nomi (ixtiyoriy)" icon={<Building2 className="w-3.5 h-3.5" />} delay={0.26}>
            <input
              type="text"
              value={form.firmaNomi}
              onChange={e => set('firmaNomi', e.target.value)}
              placeholder="Masalan: Nestlé Uzbekistan"
              className="w-full bg-transparent text-[15px] text-tg-text placeholder:text-ink2 outline-none"
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
                      form.yonalish === val ? 'bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-sm' : 'bg-tg-bg text-ink2 border border-line'
                    )}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
            </Field>

            {form.yonalish === 'taminotchi' && (
              <Field label="Ta'minotchi nomi (ixtiyoriy)" icon={<Building2 className="w-3.5 h-3.5" />} delay={0.28}>
                {form.taminotchiId !== null ? (
                  <div className="flex items-center gap-2">
                    <span className="flex-1 min-w-0 text-[15px] font-medium text-tg-text leading-snug">
                      {form.taminotchi}
                    </span>
                    <button onClick={taminotchiTozala} aria-label="Ta'minotchini tozalash"
                      className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center text-tg-hint active:bg-black/[.05]">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : taminotchiQolda ? (
                  <>
                    <input
                      type="text"
                      value={form.taminotchi}
                      onChange={e => set('taminotchi', e.target.value)}
                      placeholder="Masalan: Nestlé Uzbekistan"
                      className="w-full bg-transparent text-[15px] text-tg-text placeholder:text-ink2 outline-none"
                    />
                    <button onClick={() => { setTaminotchiQolda(false); setTaminotchiPickerOchiq(true) }}
                      className="mt-2 text-[12px] font-semibold text-tg-btn active:opacity-70">
                      Ro'yxatdan tanlash
                    </button>
                  </>
                ) : (
                  <button onClick={() => setTaminotchiPickerOchiq(true)}
                    className="w-full flex items-center justify-between text-left active:opacity-70">
                    <span className="text-[15px] text-ink2">Ro'yxatdan tanlang</span>
                    <ChevronRight className="w-4 h-4 text-tg-hint" />
                  </button>
                )}
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
                      form.vozvratStatus === h.value ? 'bg-gradient-to-b from-brand-400 to-brand-600 text-white shadow-sm' : 'bg-tg-bg text-ink2 border border-line'
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
                  className="w-full bg-transparent text-[15px] text-tg-text placeholder:text-ink2 outline-none"
                />
              </Field>
            )}
          </>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] bg-tg-bg border-t border-line">
        {yetishmayapti.length > 0 && (
          <p className="mb-2 text-center text-[12px] font-medium text-ink2">
            Yana {yetishmayapti.length} ta: {yetishmayapti.join(', ')}
          </p>
        )}
        <Button disabled={!isValid} onClick={() => isValid && onNext()}>
          Davom etish
        </Button>
      </div>

      {/* Filial varag'i */}
      <AnimatePresence>
        {filialOpen && (
          <>
            <motion.div
              key="filial-fon"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setFilialOpen(false)}
              className="fixed inset-0 z-40 bg-black/40"
            />
            <motion.div
              key="filial-sheet"
              role="dialog"
              aria-modal="true"
              aria-label="Filialni tanlang"
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring' as const, stiffness: 340, damping: 34 }}
              className="fixed inset-x-0 bottom-0 z-50 rounded-t-3xl border-t border-line bg-tg-bg pb-[max(12px,env(safe-area-inset-bottom))]"
            >
              <div className="flex h-12 items-center justify-between px-4">
                <span className="font-display text-[15px] font-bold text-tg-text">Filialni tanlang</span>
                <button
                  onClick={() => setFilialOpen(false)}
                  aria-label="Yopish"
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-tg-hint active:opacity-60"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="max-h-[50vh] overflow-y-auto px-4 pb-2">
                <div role="listbox" aria-label="Filial" className="overflow-hidden rounded-2xl border border-line bg-tg-bg2">
                  {filialar.length === 0 ? (
                    <p className="px-4 py-3 text-[14px] text-tg-hint">Yuklanmoqda...</p>
                  ) : filialar.map((f, i) => (
                    <button
                      key={f}
                      role="option"
                      aria-selected={form.filial === f}
                      onClick={() => { set('filial', f); setFilialOpen(false) }}
                      className={cn(
                        'w-full px-4 py-3 text-left text-[15px] flex items-center justify-between active:bg-black/[.04]',
                        i > 0 && 'border-t border-line',
                        form.filial === f ? 'text-tg-btn font-semibold' : 'text-tg-text',
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
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* SKU katalogi sheet */}
      <AnimatePresence>
        {pickerOchiq && (
          <SkuPicker
            onPick={skuTanlandi}
            onQolda={() => { setPickerOchiq(false); setQolda(true) }}
            onClose={() => setPickerOchiq(false)}
          />
        )}
      </AnimatePresence>

      {/* Ta'minotchi picker sheet */}
      <AnimatePresence>
        {taminotchiPickerOchiq && (
          <SupplierPicker
            onPick={taminotchiTanlandi}
            onQolda={() => { setTaminotchiPickerOchiq(false); setTaminotchiQolda(true) }}
            onClose={() => setTaminotchiPickerOchiq(false)}
          />
        )}
      </AnimatePresence>
    </div>
  )
}
