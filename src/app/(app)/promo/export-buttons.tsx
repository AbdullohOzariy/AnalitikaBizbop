"use client";

import { FileSpreadsheet, FileText, ImageIcon, LayoutGrid } from "lucide-react";
import { downloadFile } from "./download";

/**
 * Aksiya ro'yxatini yuklab olish tugmalari (Excel + PDF + Dizaynlar ZIP + Katalog).
 * fetch orqali — server xato qaytarsa toast (fayl emas). Bo'sh aksiya (0 SKU) uchun ko'rsatilmaydi.
 * Dizaynlar — barcha rasm yuklangan dizayn bannerlari (A4 + Instagram) bitta ZIP'da;
 * rasm yuklanmagan bo'lsa server aniq xabar qaytaradi (toast'da ko'rinadi).
 * Katalog — butun aksiya bitta A3 rasmda; faqat Hafta chegirmasida (`showCatalog`).
 */
export function PromoExportButtons({
  campaignId, itemsCount, showCatalog = false,
}: { campaignId: number; itemsCount: number; showCatalog?: boolean }) {
  if (itemsCount === 0) return null;
  const base = `/api/promo/${campaignId}/export`;
  const cls =
    "inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground md:h-7 md:px-2";
  return (
    <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={() => downloadFile(`${base}?format=excel`, `aksiya-${campaignId}.xlsx`)} className={cls} title="Excel (.xlsx) yuklab olish">
        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
        Excel
      </button>
      <button type="button" onClick={() => downloadFile(`${base}?format=pdf`, `aksiya-${campaignId}.pdf`)} className={cls} title="PDF yuklab olish">
        <FileText className="h-3.5 w-3.5 text-red-600" />
        PDF
      </button>
      <button
        type="button"
        onClick={() => downloadFile(`/api/promo/${campaignId}/designs`, `aksiya-${campaignId}-dizaynlar.zip`, "Dizaynlar tayyorlanmoqda…")}
        className={cls}
        title="Barcha tayyor dizayn bannerlarini (A4 + Instagram) bitta ZIP qilib yuklash"
      >
        <ImageIcon className="h-3.5 w-3.5 text-blue-600" />
        Dizaynlar
      </button>
      {showCatalog && (
        <button
          type="button"
          onClick={() => downloadFile(`/api/promo/${campaignId}/catalog`, `aksiya-${campaignId}-katalog.png`, "Katalog rasmi tayyorlanmoqda…")}
          className={cls}
          title="Butun aksiya bitta rasmda — A3 portret (chop uchun)"
        >
          <LayoutGrid className="h-3.5 w-3.5 text-orange-600" />
          Katalog
        </button>
      )}
    </span>
  );
}
