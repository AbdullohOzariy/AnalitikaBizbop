"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Pill, EmptyState } from "@/components/common/page";
import { Pencil, Trash2, Loader2, Recycle } from "lucide-react";
import { ImageThumb } from "@/components/common/image-thumb";
import { formatUZS } from "@/lib/format";
import {
  VOZVRAT_HOLATLAR as HOLATLAR,
  VOZVRAT_HOLAT_LABEL as HOLAT_LABEL,
  VOZVRAT_YONALISH_LABEL as YONALISH_LABEL,
} from "@/lib/spisaniya/labels";
import { vozvratYangilaAction, vozvratOchirAction } from "./actions";
import type { VozvratCardData } from "./vozvrat-card";

const HOLAT_TONE: Record<string, "blue" | "violet" | "orange" | "green" | "red" | "muted"> = {
  xabar_berildi: "blue",
  saqlash_xonasida: "violet",
  yuborildi: "orange",
  qaytarildi: "green",
  qaytarilmadi: "red",
};

function fmtDateTime(s: string) {
  return s.slice(0, 16).replace("T", " ");
}

type EditState = {
  id: number;
  tovar: string;
  miqdor: string;
  birlik: string;
  summa: string;
  filial: string;
  yonalish: string;
  taminotchi: string;
  sabab: string;
  status: string;
  qaytarilmadiSabab: string;
};

export function VozvratList({
  vozvratlar,
  canEdit,
  filials,
}: {
  vozvratlar: VozvratCardData[];
  canEdit: boolean;
  filials: string[];
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [edit, setEdit] = useState<EditState | null>(null);
  const [ochir, setOchir] = useState<VozvratCardData | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string, done?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) { toast.success(ok); done?.(); router.refresh(); }
      else toast.error(res.error ?? "Xato.");
    });

  const openEdit = (v: VozvratCardData) =>
    setEdit({
      id: v.id,
      tovar: v.tovar,
      miqdor: String(v.miqdor ?? ""),
      birlik: v.birlik ?? "",
      summa: String(v.summa ?? ""),
      filial: v.filial,
      yonalish: v.yonalish,
      taminotchi: v.taminotchi ?? "",
      sabab: v.sabab ?? "",
      status: v.status,
      qaytarilmadiSabab: v.qaytarilmadi_sabab ?? "",
    });

  const onSave = () => {
    if (!edit) return;
    if (!edit.tovar.trim()) { toast.error("Tovar nomi kerak."); return; }
    if (edit.status === "qaytarilmadi" && !edit.qaytarilmadiSabab.trim()) {
      toast.error("Qaytarilmadi sababi kerak.");
      return;
    }
    run(
      () => vozvratYangilaAction({
        id: edit.id,
        tovar: edit.tovar.trim(),
        miqdor: Number(edit.miqdor) || 0,
        birlik: edit.birlik.trim() || undefined,
        summa: Number(edit.summa) || 0,
        filial: edit.filial,
        yonalish: edit.yonalish,
        taminotchi: edit.yonalish === "taminotchi" ? edit.taminotchi.trim() : undefined,
        sabab: edit.sabab.trim(),
        status: edit.status,
        qaytarilmadiSabab: edit.status === "qaytarilmadi" ? edit.qaytarilmadiSabab.trim() : undefined,
      }),
      "Vozvrat yangilandi.",
      () => setEdit(null)
    );
  };

  const set = <K extends keyof EditState>(k: K, val: EditState[K]) =>
    setEdit((s) => (s ? { ...s, [k]: val } : s));

  if (vozvratlar.length === 0) {
    return (
      <EmptyState
        icon={Recycle}
        title="Tanlangan davrda vozvrat yo'q"
        description="Boshqa davr yoki filtr tanlang."
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/40 hover:bg-muted/40">
              <TableHead className="w-[130px]">Vaqt</TableHead>
              <TableHead>Tovar</TableHead>
              <TableHead className="text-right w-[100px]">Miqdor</TableHead>
              <TableHead className="text-right w-[120px]">Summa</TableHead>
              <TableHead className="w-[120px]">Filial</TableHead>
              <TableHead className="w-[140px]">Yo&apos;nalish</TableHead>
              <TableHead className="w-[150px]">Holat</TableHead>
              <TableHead className="w-[110px]">Xodim</TableHead>
              {canEdit && <TableHead className="w-[80px] text-right">Amallar</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {vozvratlar.map((v) => (
              <TableRow key={v.id} className="text-sm">
                <TableCell className="font-mono text-xs text-muted-foreground whitespace-nowrap">
                  {fmtDateTime(v.vaqt)}
                </TableCell>
                <TableCell className="max-w-[200px]">
                  <div className="truncate text-xs font-medium" title={v.tovar}>{v.tovar}</div>
                  {v.sabab && (
                    <div className="truncate text-[11px] text-muted-foreground" title={v.sabab}>
                      {v.sabab}
                    </div>
                  )}
                  {v.status === "qaytarilmadi" && v.qaytarilmadi_sabab && (
                    <div className="truncate text-[11px] text-amber-600 dark:text-amber-400" title={v.qaytarilmadi_sabab}>
                      ❗ {v.qaytarilmadi_sabab}
                    </div>
                  )}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs whitespace-nowrap">
                  {v.miqdor.toLocaleString("uz-UZ", { maximumFractionDigits: 2 })} {v.birlik}
                </TableCell>
                <TableCell className="text-right tabular-nums text-xs font-medium whitespace-nowrap">
                  {formatUZS(v.summa)}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate" title={v.filial}>
                  {v.filial}
                </TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {YONALISH_LABEL[v.yonalish] ?? v.yonalish}
                  {v.taminotchi ? ` (${v.taminotchi})` : ""}
                </TableCell>
                <TableCell>
                  <Pill tone={HOLAT_TONE[v.status] ?? "muted"}>
                    {HOLAT_LABEL[v.status] ?? v.status}
                  </Pill>
                </TableCell>
                <TableCell className="text-xs max-w-[140px]">
                  <span className="inline-flex items-center gap-1.5">
                    {v.rasm_file_id && <ImageThumb fileId={v.rasm_file_id} caption={v.tovar} className="h-7 w-7" />}
                    <span className="truncate" title={v.xodim_ism ?? undefined}>{v.xodim_ism || "—"}</span>
                  </span>
                </TableCell>
                {canEdit && (
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg"
                        disabled={isPending} onClick={() => openEdit(v)}
                        aria-label="Tahrirlash" title="Tahrirlash">
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon"
                        className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                        disabled={isPending} onClick={() => setOchir(v)}
                        aria-label="O'chirish" title="O'chirish">
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Tahrirlash dialogi */}
      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Vozvratni tahrirlash</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Faqat ochiq (chiqimga o&apos;tkazilmagan) vozvratni tahrirlash mumkin.
            </DialogDescription>
          </DialogHeader>
          {edit && (
            <div className="space-y-3 py-1">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tovar</Label>
                <Input value={edit.tovar} disabled={isPending} className="h-10 rounded-xl"
                  onChange={(e) => set("tovar", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Miqdor</Label>
                  <Input type="number" value={edit.miqdor} disabled={isPending} className="h-10 rounded-xl"
                    onChange={(e) => set("miqdor", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Birlik</Label>
                  <Input value={edit.birlik} disabled={isPending} className="h-10 rounded-xl"
                    placeholder="dona" onChange={(e) => set("birlik", e.target.value)} />
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Summa</Label>
                <Input type="number" value={edit.summa} disabled={isPending} className="h-10 rounded-xl"
                  onChange={(e) => set("summa", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Filial</Label>
                <Select value={edit.filial} onValueChange={(x) => set("filial", x ?? edit.filial)} disabled={isPending}>
                  <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(filials.includes(edit.filial) ? filials : [edit.filial, ...filials]).map((f) => (
                      <SelectItem key={f} value={f}>{f}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Yo&apos;nalish</Label>
                <Select value={edit.yonalish} onValueChange={(x) => set("yonalish", x ?? edit.yonalish)} disabled={isPending}>
                  <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="asosiy_filial">{YONALISH_LABEL.asosiy_filial}</SelectItem>
                    <SelectItem value="taminotchi">{YONALISH_LABEL.taminotchi}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {edit.yonalish === "taminotchi" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Yetkazib beruvchi</Label>
                  <Input value={edit.taminotchi} disabled={isPending} className="h-10 rounded-xl"
                    onChange={(e) => set("taminotchi", e.target.value)} />
                </div>
              )}
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Sabab</Label>
                <Input value={edit.sabab} disabled={isPending} className="h-10 rounded-xl"
                  onChange={(e) => set("sabab", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Holat</Label>
                <Select value={edit.status} onValueChange={(x) => set("status", x ?? edit.status)} disabled={isPending}>
                  <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {HOLATLAR.map((s) => <SelectItem key={s} value={s}>{HOLAT_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {edit.status === "qaytarilmadi" && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Qaytarilmadi sababi *</Label>
                  <Input value={edit.qaytarilmadiSabab} disabled={isPending} className="h-10 rounded-xl"
                    placeholder="Nega qaytarilmadi?" onChange={(e) => set("qaytarilmadiSabab", e.target.value)} />
                </div>
              )}
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={() => setEdit(null)}>Bekor</Button>
            <Button className="rounded-xl" disabled={isPending} onClick={onSave}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* O'chirish tasdiqlash */}
      <Dialog open={!!ochir} onOpenChange={(o) => !o && setOchir(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Vozvratni o&apos;chirish</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              <strong>{ochir?.tovar}</strong> vozvrati o&apos;chiriladi. Bu amalni ortga qaytarib bo&apos;lmaydi.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={() => setOchir(null)}>Bekor</Button>
            <Button variant="destructive" className="rounded-xl" disabled={isPending}
              onClick={() => ochir && run(() => vozvratOchirAction(ochir.id), "Vozvrat o'chirildi.", () => setOchir(null))}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "O'chirish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
