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
import { Loader2, ArrowRightLeft, PackageMinus, Image as ImageIcon, Building2 } from "lucide-react";
import { toast } from "sonner";
import { formatUZS } from "@/lib/format";
import { vozvratHolatAction, vozvratOtkazAction } from "./actions";

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

const HOLATLAR = ["xabar_berildi", "yuborildi", "qaytarildi", "qaytarilmadi"] as const;
const HOLAT_LABEL: Record<string, string> = {
  xabar_berildi: "Xabar berildi",
  yuborildi: "Yuborildi",
  qaytarildi: "Qabul qilindi: qaytarildi",
  qaytarilmadi: "Qabul qilindi: qaytarilmadi",
};
const YONALISH_LABEL: Record<string, string> = {
  asosiy_filial: "Asosiy filialga",
  taminotchi: "Ta'minotchiga",
};
const CHIQIM_TURLAR: { value: string; label: string }[] = [
  { value: "spisaniya", label: "Spisaniya" },
  { value: "kafe", label: "Kafe" },
  { value: "ovqatlanish", label: "Ovqatlanish" },
  { value: "ichki_sotuv", label: "Ichki sotuv" },
];

function fmtDateTime(s: string) {
  return s.slice(0, 16).replace("T", " ");
}

export function VozvratCard({ v }: { v: VozvratCardData }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [holatOpen, setHolatOpen] = useState(false);
  const [otkazOpen, setOtkazOpen] = useState(false);
  const [status, setStatus] = useState(v.status);
  const [sabab, setSabab] = useState(v.qaytarilmadi_sabab ?? "");
  const [tur, setTur] = useState("spisaniya");
  const [otkazSabab, setOtkazSabab] = useState("");

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, done?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) { toast.success(ok); done?.(); router.refresh(); }
      else toast.error(res.error ?? "Xato.");
    });

  const onHolatSave = () => {
    if (status === "qaytarilmadi" && !sabab.trim()) { toast.error("Qaytarilmadi sababi kerak."); return; }
    run(
      () => vozvratHolatAction({ id: v.id, status, qaytarilmadiSabab: sabab.trim() || undefined }),
      "Holat yangilandi.",
      () => setHolatOpen(false)
    );
  };

  const onOtkaz = () =>
    run(
      () => vozvratOtkazAction({ id: v.id, tur, sabab: otkazSabab.trim() || undefined }),
      "Hisobdan chiqarishga o'tkazildi.",
      () => setOtkazOpen(false)
    );

  return (
    <div className="rounded-xl border border-border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold" title={v.tovar}>{v.tovar}</div>
          <div className="text-xs text-muted-foreground">
            {v.miqdor.toLocaleString("uz-UZ", { maximumFractionDigits: 2 })} {v.birlik}
          </div>
        </div>
        <div className="shrink-0 text-right text-sm font-bold tabular-nums">{formatUZS(v.summa)}</div>
      </div>

      <div className="mt-2 space-y-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Building2 className="h-3 w-3 shrink-0" />
          <span className="truncate">{v.filial}</span>
          <span className="opacity-50">·</span>
          <span className="truncate">{YONALISH_LABEL[v.yonalish] ?? v.yonalish}{v.taminotchi ? ` (${v.taminotchi})` : ""}</span>
        </div>
        {v.sabab && <div className="truncate" title={v.sabab}>📝 {v.sabab}</div>}
        {v.status === "qaytarilmadi" && v.qaytarilmadi_sabab && (
          <div className="truncate text-amber-600 dark:text-amber-400" title={v.qaytarilmadi_sabab}>
            ❗ {v.qaytarilmadi_sabab}
          </div>
        )}
        <div className="flex items-center gap-2 pt-0.5">
          <span className="font-mono">{fmtDateTime(v.vaqt)}</span>
          {v.xodim_ism && <><span className="opacity-50">·</span><span className="truncate">{v.xodim_ism}</span></>}
          {v.rasm_file_id && (
            <a href={`/api/rasm-preview/${v.rasm_file_id}`} target="_blank" rel="noreferrer"
               className="ml-auto inline-flex items-center gap-1 text-primary hover:underline">
              <ImageIcon className="h-3 w-3" /> rasm
            </a>
          )}
        </div>
      </div>

      <div className="mt-2.5 flex gap-1.5">
        <Button variant="outline" size="sm" className="h-8 flex-1 rounded-lg text-xs" disabled={isPending}
          onClick={() => { setStatus(v.status); setSabab(v.qaytarilmadi_sabab ?? ""); setHolatOpen(true); }}>
          <ArrowRightLeft className="mr-1 h-3 w-3" /> Holat
        </Button>
        {v.status === "qaytarilmadi" && (
          <Button size="sm" className="h-8 flex-1 rounded-lg text-xs" disabled={isPending}
            onClick={() => { setTur("spisaniya"); setOtkazSabab(""); setOtkazOpen(true); }}>
            <PackageMinus className="mr-1 h-3 w-3" /> Chiqimga
          </Button>
        )}
      </div>

      {/* Holatni o'zgartirish */}
      <Dialog open={holatOpen} onOpenChange={(o) => !o && setHolatOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Vozvrat holati</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Holat o&apos;zgarsa, filial guruhiga xabar yuboriladi.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Holat</Label>
              <Select value={status} onValueChange={(x) => setStatus(x ?? v.status)} disabled={isPending}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {HOLATLAR.map((s) => <SelectItem key={s} value={s}>{HOLAT_LABEL[s]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {status === "qaytarilmadi" && (
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Qaytarilmadi sababi *
                </Label>
                <Input value={sabab} onChange={(e) => setSabab(e.target.value)} disabled={isPending}
                  className="h-10 rounded-xl" placeholder="Nega qaytarilmadi?" />
              </div>
            )}
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={() => setHolatOpen(false)}>Bekor</Button>
            <Button className="rounded-xl" disabled={isPending} onClick={onHolatSave}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Saqlash"}
            </Button>
          </DialogFooter>
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
    </div>
  );
}
