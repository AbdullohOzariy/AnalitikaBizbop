import { ImageIcon, RefreshCw, Loader2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { compressImage, fileSizeLabel } from '../lib/utils'

interface Props {
  base64: string | null
  fileSize: number
  loading: boolean
  onFile: (file: File, base64: string) => void
  onClear: () => void
}

export default function PhotoUpload({ base64, fileSize, loading, onFile, onClear }: Props) {
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.files?.[0]
    if (!raw) return
    e.target.value = ''
    const { file, base64 } = await compressImage(raw)
    onFile(file, base64)
  }

  return (
    <AnimatePresence mode="wait">
      {loading ? (
        <motion.div
          key="loading"
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="h-[120px] rounded-2xl bg-tg-bg2 border border-black/[.05] flex items-center justify-center gap-3 text-tg-hint"
        >
          <Loader2 className="animate-spin w-5 h-5" />
          <span className="text-[14px] font-medium">Rasm tayyorlanmoqda...</span>
        </motion.div>
      ) : base64 ? (
        <motion.div
          key="preview"
          initial={{ opacity: 0, scale: .97 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}
          className="relative rounded-2xl overflow-hidden border border-black/[.05]"
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
          className="rounded-2xl border-2 border-dashed border-black/[.10] bg-tg-bg2 flex flex-col items-center gap-3 py-7"
        >
          <div className="w-12 h-12 rounded-2xl bg-tg-btn/10 flex items-center justify-center">
            <ImageIcon className="w-5 h-5 text-tg-btn" />
          </div>
          <div className="text-center">
            <p className="text-[14px] font-semibold text-tg-text">Tovar rasmini qo'shing</p>
            <p className="text-[12px] text-tg-hint mt-0.5">Galereyadan tanlang</p>
          </div>
          <label className="flex items-center gap-1.5 bg-tg-btn text-tg-btn-txt text-[13px] font-semibold px-5 py-2 rounded-xl cursor-pointer active:opacity-80 transition-opacity">
            <ImageIcon className="w-3.5 h-3.5" />
            Rasm tanlash
            <input type="file" accept="image/*" onChange={handleFile} className="hidden" />
          </label>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
