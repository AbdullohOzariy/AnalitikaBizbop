import { ImageIcon, RefreshCw, Loader2, AlertTriangle } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { compressImage, fileSizeLabel } from '../lib/utils'

interface Props {
  base64: string | null
  fileSize: number
  loading: boolean
  onFile: (file: File, base64: string) => void
  onClear: () => void
  // Fayl tanlangan zahoti — spinner ko'rsatish uchun. Busiz `loading` hech qachon
  // `true` bo'lmasdi va spinner o'lik kod edi (siqish 1-3 soniya davom etadi).
  onStart?: () => void
  // Siqish xatosi — `compressImage` endi reject qiladi (qarang lib/utils.ts)
  onXato?: (xabar: string) => void
  xato?: string | null
  title?: string
  hint?: string
  required?: boolean
}

export default function PhotoUpload({
  base64, fileSize, loading, onFile, onClear, onStart, onXato, xato,
  title = "Tovar rasmini qo'shing",
  hint = 'Galereya yoki kameradan',
  required = false,
}: Props) {
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0]
    if (!raw) return
    e.target.value = ''
    onStart?.()
    try {
      const { file, base64 } = await compressImage(raw)
      onFile(file, base64)
    } catch (err: unknown) {
      onXato?.(err instanceof Error ? err.message : 'Rasmni tayyorlab bo\'lmadi')
    }
  }

  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <motion.div
          key="loading"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="h-[120px] rounded-2xl bg-tg-bg2 border border-line flex items-center justify-center gap-3 text-tg-hint"
        >
          <Loader2 className="animate-spin w-5 h-5" />
          <span className="text-[14px] font-medium">Rasm tayyorlanmoqda...</span>
        </motion.div>
      ) : base64 ? (
        <motion.div
          key="preview"
          initial={{ opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          className="relative rounded-2xl overflow-hidden border border-line"
        >
          <img src={base64} alt="Tovar rasmi" className="w-full max-h-[220px] object-cover block" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/60 to-transparent pointer-events-none" />
          <div className="absolute bottom-0 inset-x-0 flex items-center justify-between px-3 pb-2.5">
            <span className="text-[11px] font-semibold text-white/70">{fileSizeLabel(fileSize)}</span>
            <button
              onClick={onClear}
              className="flex items-center gap-1.5 text-[12px] font-semibold text-white bg-black/40 rounded-xl px-3 py-1.5 backdrop-blur-sm active:opacity-70 transition-opacity"
            >
              <RefreshCw className="w-3 h-3" />
              Almashtirish
            </button>
          </div>
        </motion.div>
      ) : (
        <motion.div
          key="empty"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line bg-tg-bg2 py-7"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand/12">
            <ImageIcon className="h-5 w-5 text-brand" />
          </div>
          <div className="text-center">
            {/* Majburiy/ixtiyoriy farqi KO'RINSIN: yonma-yon turgan ikkita bir xil
                ko'rinishdagi dashed karta bor va biri (QR) ixtiyoriy — belgisiz
                xodim qaysi biri CTA'ni bloklayotganini bilolmasdi. */}
            <p className="text-[14px] font-semibold text-tg-text">
              {title}
              {required && <span className="text-red-500 ml-0.5">*</span>}
            </p>
            <p className="mt-0.5 text-[12px] text-ink2">{hint}</p>
          </div>
          <label className="flex cursor-pointer items-center gap-1.5 rounded-xl bg-gradient-to-b from-brand-400 to-brand-600 px-5 py-2 text-[13px] font-semibold text-white shadow-brand transition-transform active:scale-95">
            <ImageIcon className="w-3.5 h-3.5" />
            Rasm tanlash
            <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
          </label>
          {xato && (
            <p className="flex items-center gap-1.5 px-4 text-center text-[12px] font-medium text-red-500">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              {xato}
            </p>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
