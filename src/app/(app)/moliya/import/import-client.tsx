"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Upload, Loader2, CircleCheck, CircleAlert, Trash2, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pill, EmptyState } from "@/components/common/page";
import { formatUZS, formatDateTimeUZ } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { tarixImportAction, partiyaBekorAction, type ImportNatija } from "./actions";

type Batch = {
  id: number;
  fileName: string;
  status: string;
  sourceSumIn: number | null;
  sourceSumOut: number | null;
  parsedSumIn: number;
  parsedSumOut: number;
  rowsTotal: number;
  rowsImported: number;
  rowsSkipped: number;
  rowsUnmatched: number;
  error: string | null;
  createdAt: string;
  createdBy: string | null;
};

export function ImportClient({ batches, canEdit }: { batches: Batch[]; canEdit: boolean }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [natija, setNatija] = useState<ImportNatija | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const yukla = (file: File) => {
    const fd = new FormData();
    fd.set("file", file);
    start(async () => {
      const res = await tarixImportAction(fd);
      if (res.ok && res.natija) {
        setNatija(res.natija);
        toast.success(`${res.natija.imported} ta yozuv ko'chirildi.`);
        router.refresh();
      } else {
        setNatija(null);
        toast.error(res.ok ? "Xato." : res.error, { duration: 10_000 });
      }
      if (inputRef.current) inputRef.current.value = "";
    });
  };

  return (
    <div className="space-y-4">
      {canEdit && (
        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls"
                disabled={isPending}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) yukla(f);
                }}
                className="hidden"
              />
              <Button
                disabled={isPending}
                onClick={() => inputRef.current?.click()}
                className="gap-1.5"
              >
                {isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                {isPending ? "O'qilmoqda…" : "Fayl tanlash (.xlsx)"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Google Sheets → Файл → Скачать → Microsoft Excel (.xlsx)
              </p>
            </div>

            <div className="rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
              <b className="text-foreground">Nima bo&apos;ladi:</b> «Касса» varag&apos;i o&apos;qiladi ·
              manba jami bilan <b>checksum</b> solishtiriladi (farq bo&apos;lsa hech narsa yozilmaydi) ·
              «Остатка» qatorlari davr boshi qoldig&apos;iga ketadi (aylanma shishmasin) ·
              tanilmagan kassa/modda <b>yo&apos;qotilmaydi</b>, moslanmaganlar ro&apos;yxatiga tushadi ·
              takroriy yuklash dubl yaratmaydi.
            </div>
          </CardContent>
        </Card>
      )}

      {natija && (
        <Card className={cn(natija.unmatched > 0 ? "border-amber-500/40" : "border-primary/40")}>
          <CardContent className="space-y-2 py-4">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <CircleCheck className="h-4 w-4 text-primary" />
              Import tugadi — partiya #{natija.batchId}
            </div>
            <div className="grid gap-x-6 gap-y-1 text-xs sm:grid-cols-2 lg:grid-cols-3">
              <Qator label="Faylda qator" value={natija.rowsTotal} />
              <Qator label="Yozuvga aylandi" value={natija.imported} tone="ok" />
              <Qator label="Dublikat (o'tkazildi)" value={natija.duplicates} />
              <Qator label="Davr boshi qoldig'i" value={natija.openings} />
              <Qator label="Moslanmagan" value={natija.unmatched} tone={natija.unmatched ? "warn" : undefined} />
              <Qator label="Bo'sh qator" value={natija.skipped} />
            </div>
            <div className="rounded-lg bg-muted/40 p-2.5 text-[11px]">
              <b>Checksum:</b> manba {formatUZS(natija.sourceSumIn ?? 0)} /{" "}
              {formatUZS(natija.sourceSumOut ?? 0)} · o&apos;qilgan {formatUZS(natija.parsedSumIn)} /{" "}
              {formatUZS(natija.parsedSumOut)} ✓
              {natija.balanceBreaks > 0 && (
                <div className="mt-1 text-amber-600 dark:text-amber-400">
                  ⚠️ {natija.balanceBreaks} qatorda manbadagi «Қолдиқ» izchil emas — manba faylning
                  o&apos;zida xato bor. Import buzilmadi (qoldiq baribir qayta hisoblanadi).
                </div>
              )}
            </div>
            {natija.unmatched > 0 && (
              <Link
                href="/moliya/moslanmagan"
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-input px-3 text-xs font-medium transition-colors hover:bg-secondary"
              >
                <CircleAlert className="h-3.5 w-3.5" />
                {natija.unmatched} ta moslanmagan qatorni hal qilish
              </Link>
            )}
          </CardContent>
        </Card>
      )}

      {batches.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Hali hech narsa yuklanmagan"
          description="Kassa kitobini .xlsx qilib yuklang."
        />
      ) : (
        <Card>
          <CardContent className="space-y-1.5 py-3">
            <div className="px-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              Yuklash tarixi
            </div>
            {batches.map((b) => (
              <div
                key={b.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-border px-3 py-2",
                  b.status === "FAILED" && "border-destructive/40 bg-destructive/5"
                )}
              >
                <div className="min-w-[180px] flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{b.fileName}</span>
                    <Pill
                      className={
                        b.status === "FAILED"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-primary/10 text-primary"
                      }
                    >
                      {b.status === "FAILED" ? "rad etilgan" : "ok"}
                    </Pill>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {formatDateTimeUZ(b.createdAt)}
                    {b.createdBy ? ` · ${b.createdBy}` : ""}
                  </div>
                </div>

                {b.status === "FAILED" ? (
                  <div className="w-full text-xs text-destructive">{b.error}</div>
                ) : (
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
                    <span>
                      qator <b className="text-foreground">{b.rowsTotal}</b>
                    </span>
                    <span>
                      yozuv <b className="text-primary">{b.rowsImported}</b>
                    </span>
                    {b.rowsUnmatched > 0 && (
                      <span>
                        moslanmagan <b className="text-amber-600 dark:text-amber-400">{b.rowsUnmatched}</b>
                      </span>
                    )}
                  </div>
                )}

                {canEdit && (
                  <button
                    type="button"
                    disabled={isPending}
                    onClick={() =>
                      start(async () => {
                        const res = await partiyaBekorAction(b.id);
                        if (res.ok) {
                          toast.success(`Bekor qilindi — ${res.ochirilgan ?? 0} yozuv o'chdi.`);
                          router.refresh();
                        } else toast.error(res.error);
                      })
                    }
                    className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                    aria-label="Partiyani bekor qilish"
                    title="Bu yuklashda kelgan hamma yozuvni o'chirish"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function Qator({ label, value, tone }: { label: string; value: number; tone?: "ok" | "warn" }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <b
        className={cn(
          "tabular-nums",
          tone === "ok" && "text-primary",
          tone === "warn" && "text-amber-600 dark:text-amber-400"
        )}
      >
        {value.toLocaleString("uz-UZ")}
      </b>
    </div>
  );
}
