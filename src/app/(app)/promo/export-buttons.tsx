"use client";

import { FileSpreadsheet, FileText } from "lucide-react";

/**
 * Aksiya ro'yxatini yuklab olish tugmalari (Excel + PDF).
 * Yuklab olish — to'g'ridan-to'g'ri /api/promo/{id}/export route'idan (browser download).
 * Bo'sh aksiya (0 SKU) uchun ko'rsatilmaydi.
 */
export function PromoExportButtons({ campaignId, itemsCount }: { campaignId: number; itemsCount: number }) {
  if (itemsCount === 0) return null;
  const base = `/api/promo/${campaignId}/export`;
  const cls =
    "inline-flex h-7 items-center gap-1 rounded-lg border border-border bg-card px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground";
  return (
    <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
      <a href={`${base}?format=excel`} download className={cls} title="Excel (.xlsx) yuklab olish">
        <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
        Excel
      </a>
      <a href={`${base}?format=pdf`} download className={cls} title="PDF yuklab olish">
        <FileText className="h-3.5 w-3.5 text-red-600" />
        PDF
      </a>
    </span>
  );
}
