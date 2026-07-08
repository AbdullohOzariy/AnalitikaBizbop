import { toast } from "sonner";

/**
 * Faylni fetch bilan yuklab olish (client util) — server xato qaytarsa (masalan
 * DB/sessiya uzilishi) brauzer "design.txt" saqlab qo'ymasin, aniq toast chiqsin.
 * loadingMsg berilsa jarayon davomida toast ko'rsatiladi (og'ir ZIP'lar uchun).
 */
export async function downloadFile(url: string, fallbackName: string, loadingMsg?: string) {
  const t = loadingMsg ? toast.loading(loadingMsg) : undefined;
  try {
    const res = await fetch(url);
    if (!res.ok) {
      const msg = (await res.text().catch(() => "")).slice(0, 200);
      toast.error(msg || `Yuklab olishda xato (${res.status}) — qayta urinib ko'ring.`);
      return;
    }
    const blob = await res.blob();
    const m = /filename="?([^";]+)"?/.exec(res.headers.get("Content-Disposition") ?? "");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = m?.[1] ?? fallbackName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch {
    toast.error("Tarmoq xatosi — internetni tekshirib qayta urinib ko'ring.");
  } finally {
    if (t !== undefined) toast.dismiss(t);
  }
}
