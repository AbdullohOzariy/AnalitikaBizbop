"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Pencil, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { ChiqimRecord } from "@/lib/spisaniya/db";
import {
  chiqimYozuvYangilaAction,
  chiqimYozuvOchirAction,
} from "./actions";

// server-only TUR_LABEL ni bu yerda takrorlaymiz (client component — pg pool import qilib bo'lmaydi)
const TURS: [string, string][] = [
  ["spisaniya",   "Spisaniya"],
  ["vozvrat",     "Qayta ishlash"],
  ["kafe",        "Kafe"],
  ["ovqatlanish", "Ovqatlanish"],
  ["ichki_sotuv", "Ichki sotuv"],
];

export function ChiqimRowActions({
  record,
  filials,
  kategoriyalar,
}: {
  record: ChiqimRecord;
  filials: string[];
  kategoriyalar: string[];
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // --- Tahrirlash holati ---
  const [editOpen, setEditOpen] = useState(false);
  const [tur, setTur] = useState(record.tur ?? "");
  const [tovar, setTovar] = useState(record.tovar ?? "");
  const [miqdor, setMiqdor] = useState(record.miqdor?.toString() ?? "");
  const [birlik, setBirlik] = useState(record.birlik ?? "");
  const [summa, setSumma] = useState(record.summa?.toString() ?? "");
  const [filial, setFilial] = useState(record.filial ?? "");
  const [kategoriya, setKategoriya] = useState(record.kategoriya ?? "__none__");
  const [sabab, setSabab] = useState(record.sabab ?? "");

  // --- O'chirish holati ---
  const [ochirOpen, setOchirOpen] = useState(false);

  const openEdit = () => {
    // Boshlang'ich qiymatlarni record dan qayta tiklash
    setTur(record.tur ?? "");
    setTovar(record.tovar ?? "");
    setMiqdor(record.miqdor?.toString() ?? "");
    setBirlik(record.birlik ?? "");
    setSumma(record.summa?.toString() ?? "");
    setFilial(record.filial ?? "");
    setKategoriya(record.kategoriya ?? "__none__");
    setSabab(record.sabab ?? "");
    setEditOpen(true);
  };

  const onSaqlash = () => {
    // Faqat o'zgargan maydonlarni yuborish
    const input: Parameters<typeof chiqimYozuvYangilaAction>[0] = { id: record.id };

    if (tur !== (record.tur ?? ""))               input.tur       = tur || undefined;
    if (tovar !== (record.tovar ?? ""))           input.tovar     = tovar || undefined;
    const miqdorNum = miqdor !== "" ? parseFloat(miqdor) : undefined;
    if (miqdorNum !== record.miqdor)              input.miqdor    = miqdorNum;
    if (birlik !== (record.birlik ?? ""))         input.birlik    = birlik || undefined;
    const summaNum = summa !== "" ? parseFloat(summa) : undefined;
    if (summaNum !== record.summa)                input.summa     = summaNum;
    if (filial !== (record.filial ?? ""))         input.filial    = filial || undefined;
    const katValue = kategoriya === "__none__" ? null : kategoriya;
    if (katValue !== (record.kategoriya ?? null)) input.kategoriya = katValue ?? undefined;
    if (sabab !== (record.sabab ?? ""))           input.sabab     = sabab || undefined;

    startTransition(async () => {
      const res = await chiqimYozuvYangilaAction(input);
      if (res.ok) {
        toast.success("Yozuv yangilandi.");
        setEditOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  const onOchirish = () => {
    startTransition(async () => {
      const res = await chiqimYozuvOchirAction(record.id);
      if (res.ok) {
        toast.success("Yozuv o'chirildi.");
        setOchirOpen(false);
        router.refresh();
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <div className="flex items-center gap-1">
      {/* Tahrirlash tugmasi */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-lg"
        disabled={isPending}
        onClick={openEdit}
        aria-label="Yozuvni tahrirlash"
        title="Tahrirlash"
      >
        <Pencil className="h-3.5 w-3.5" />
      </Button>

      {/* O'chirish tugmasi */}
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 rounded-lg text-destructive hover:text-destructive"
        disabled={isPending}
        onClick={() => setOchirOpen(true)}
        aria-label="Yozuvni o'chirish"
        title="O'chirish"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </Button>

      {/* ── Tahrirlash dialogi ── */}
      <Dialog open={editOpen} onOpenChange={(o) => !o && setEditOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Yozuvni tahrirlash</DialogTitle>
            <DialogDescription>
              Maydonlarni o&apos;zgartiring va saqlang.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-1">
            {/* Tur */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tur
              </Label>
              <Select
                value={tur}
                onValueChange={(v: string | null) => setTur(v ?? "")}
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="Turni tanlang" />
                </SelectTrigger>
                <SelectContent>
                  {TURS.map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Tovar */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Tovar
              </Label>
              <Input
                value={tovar}
                onChange={(e) => setTovar(e.target.value)}
                disabled={isPending}
                className="h-10 rounded-xl"
                placeholder="Tovar nomi"
              />
            </div>

            {/* Miqdor + Birlik */}
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Miqdor
                </Label>
                <Input
                  type="number"
                  value={miqdor}
                  onChange={(e) => setMiqdor(e.target.value)}
                  disabled={isPending}
                  className="h-10 rounded-xl"
                  placeholder="0"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Birlik
                </Label>
                <Input
                  value={birlik}
                  onChange={(e) => setBirlik(e.target.value)}
                  disabled={isPending}
                  className="h-10 rounded-xl"
                  placeholder="kg / dona"
                />
              </div>
            </div>

            {/* Summa */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Summa (so&apos;m)
              </Label>
              <Input
                type="number"
                value={summa}
                onChange={(e) => setSumma(e.target.value)}
                disabled={isPending}
                className="h-10 rounded-xl"
                placeholder="0"
              />
            </div>

            {/* Filial */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Filial
              </Label>
              <Select
                value={filial || "__none_filial__"}
                onValueChange={(v: string | null) =>
                  setFilial(v === "__none_filial__" ? "" : (v ?? ""))
                }
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="Filialni tanlang" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none_filial__">— (yo&apos;q)</SelectItem>
                  {filials.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Kategoriya */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Kategoriya
              </Label>
              <Select
                value={kategoriya}
                onValueChange={(v: string | null) =>
                  setKategoriya(v ?? "__none__")
                }
              >
                <SelectTrigger className="h-10 w-full rounded-xl">
                  <SelectValue placeholder="Kategoriya tanlang" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— (yo&apos;q)</SelectItem>
                  {kategoriyalar.map((k) => (
                    <SelectItem key={k} value={k}>
                      {k}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Sabab */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Sabab
              </Label>
              <Input
                value={sabab}
                onChange={(e) => setSabab(e.target.value)}
                disabled={isPending}
                className="h-10 rounded-xl"
                placeholder="Chiqarilish sababi"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={isPending}
              onClick={() => setEditOpen(false)}
            >
              Bekor
            </Button>
            <Button
              className="rounded-xl"
              disabled={isPending}
              onClick={onSaqlash}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Saqlash"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── O'chirish tasdiqlash dialogi ── */}
      <Dialog open={ochirOpen} onOpenChange={(o) => !o && setOchirOpen(false)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Yozuvni o&apos;chirish</DialogTitle>
            <DialogDescription>
              <strong>{record.tovar || "Bu yozuv"}</strong> o&apos;chiriladi. Bu amalni ortga qaytarib bo&apos;lmaydi.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              className="rounded-xl"
              disabled={isPending}
              onClick={() => setOchirOpen(false)}
            >
              Bekor
            </Button>
            <Button
              variant="destructive"
              className="rounded-xl"
              disabled={isPending}
              onClick={onOchirish}
            >
              {isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "O'chirish"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
