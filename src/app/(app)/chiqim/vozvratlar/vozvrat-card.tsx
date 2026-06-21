"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2, PackageMinus, Image as ImageIcon } from "lucide-react";
import { ImageThumb } from "@/components/common/image-thumb";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatUZS } from "@/lib/format";
import {
  VOZVRAT_HOLAT_LABEL as HOLAT_LABEL,
  VOZVRAT_YONALISH_LABEL as YONALISH_LABEL,
  CHIQIM_OTKAZ_TURLAR as CHIQIM_TURLAR,
} from "@/lib/spisaniya/labels";
import { vozvratOtkazAction } from "./actions";

export type VozvratCardData = {
  id: number;
  tovar: string;
  miqdor: number;
  birlik: string;
  summa: number;
  sabab: string | null;
  filial: string;
  yonalish: string;
  taminotchi: string | null;
  rasm_file_id: string | null;
  xodim_ism: string | null;
  status: string;
  qaytarilmadi_sabab: string | null;
  vaqt: string;
};

function fmtDateTime(s: string) {
  return s.slice(0, 16).replace("T", " ");
}

// Ixcham: "2026-06-18T14:30" → "18.06 14:30"
function fmtShort(s: string) {
  const [date, time = ""] = s.slice(0, 16).split("T");
  const [, m, d] = date.split("-");
  return d && m ? `${d}.${m}${time ? " " + time : ""}` : s.slice(0, 16).replace("T", " ");
}

export function VozvratCard({ v, canEdit = true }: { v: VozvratCardData; canEdit?: boolean }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [detailOpen, setDetailOpen] = useState(false);
  const [otkazOpen, setOtkazOpen] = useState(false);
  const [tur, setTur] = useState("spisaniya");
  const [otkazSabab, setOtkazSabab] = useState("");

  const miqdorStr = `${v.miqdor.toLocaleString("uz-UZ", { maximumFractionDigits: 2 })} ${v.birlik}`;

  const onOtkaz = () =>
    start(async () => {
      const res = await vozvratOtkazAction({ id: v.id, tur, sabab: otkazSabab.trim() || undefined });
      if (res.ok) { toast.success("Hisobdan chiqarishga o'tkazildi."); setOtkazOpen(false); setDetailOpen(false); router.refresh(); }
      else toast.error(res.error ?? "Xato.");
    });

  return (
    <>
      {/* Ixcham bir qatorlik karta — bosilsa to'liq ma'lumot chiqadi */}
      <div
        role="button"
        tabIndex={0}
        onClick={() => setDetailOpen(true)}
        onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setDetailOpen(true); } }}
        title={v.tovar}
        className="block w-full rounded-lg border border-border bg-card px-2.5 py-1.5 text-left shadow-sm transition-colors hover:bg-muted/50"
      >
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate text-xs font-medium">{v.tovar}</span>
          <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">{miqdorStr}</span>
          <span className="shrink-0 text-xs font-semibold tabular-nums">{formatUZS(v.summa, { compact: true })}</span>
          {v.rasm_file_id && <ImageIcon className="h-3 w-3 shrink-0 text-primary" />}
        </div>
        <div className="mt-0.5 text-[10px] tabular-nums text-muted-foreground">🕒 {fmtShort(v.vaqt)}</div>
      </div>

      {/* To'liq ma'lumot */}
      <Dialog open={detailOpen} onOpenChange={(o) => !o && setDetailOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="pr-6 leading-snug">{v.tovar}</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              {fmtDateTime(v.vaqt)}{v.xodim_ism ? ` · ${v.xodim_ism}` : ""}
            </DialogDescription>
          </DialogHeader>
          <dl className="grid grid-cols-3 gap-x-3 gap-y-2 py-1 text-sm">
            <Row label="Miqdor" value={miqdorStr} />
            <Row label="Summa" value={formatUZS(v.summa)} strong />
            <Row label="Holat" value={HOLAT_LABEL[v.status] ?? v.status} />
            <Row label="Filial" value={v.filial} />
            <Row label="Yo'nalish" value={`${YONALISH_LABEL[v.yonalish] ?? v.yonalish}${v.taminotchi ? ` (${v.taminotchi})` : ""}`} />
            {v.sabab && <Row label="Sabab" value={v.sabab} />}
          </dl>
          {v.rasm_file_id && (
            <div className="flex items-center gap-2">
              <ImageThumb fileId={v.rasm_file_id} caption={v.tovar} className="h-12 w-12" />
              <span className="text-xs text-muted-foreground">Rasmni kattalashtirish uchun bosing</span>
            </div>
          )}
          {canEdit && (
            <DialogFooter className="gap-2 sm:justify-between">
              <Button variant="outline" size="sm" className="rounded-xl" disabled={isPending}
                onClick={() => { setTur("spisaniya"); setOtkazSabab(""); setOtkazOpen(true); }}>
                <PackageMinus className="mr-1.5 h-4 w-4" /> Chiqimga o&apos;tkazish
              </Button>
              <Button variant="ghost" size="sm" className="rounded-xl" onClick={() => setDetailOpen(false)}>Yopish</Button>
            </DialogFooter>
          )}
        </DialogContent>
      </Dialog>

      {/* Hisobdan chiqarishga o'tkazish */}
      <Dialog open={otkazOpen} onOpenChange={(o) => !o && setOtkazOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Hisobdan chiqarishga o&apos;tkazish</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              <strong>{v.tovar}</strong> tanlangan turda chiqim yozuviga aylanadi va Vozvratlardan chiqadi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Hisobdan chiqarish turi</Label>
              <Select value={tur} onValueChange={(x) => setTur(x ?? "spisaniya")} disabled={isPending}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CHIQIM_TURLAR.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sabab (ixtiyoriy)</Label>
              <Input value={otkazSabab} onChange={(e) => setOtkazSabab(e.target.value)} disabled={isPending}
                className="h-10 rounded-xl" placeholder="Bo'sh bo'lsa vozvrat sababidan olinadi" />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={() => setOtkazOpen(false)}>Bekor</Button>
            <Button className="rounded-xl" disabled={isPending} onClick={onOtkaz}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "O'tkazish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <>
      <dt className="col-span-1 text-xs text-muted-foreground">{label}</dt>
      <dd className={cn("col-span-2 break-words", strong && "font-semibold tabular-nums")}>{value}</dd>
    </>
  );
}
