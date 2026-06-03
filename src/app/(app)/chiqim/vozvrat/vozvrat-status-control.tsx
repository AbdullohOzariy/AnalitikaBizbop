"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pill } from "@/components/common/page";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { updateVozvratStatusAction } from "./actions";

const LABEL: Record<string, string> = {
  kutilmoqda: "Kutilmoqda",
  jarayonda: "Jarayonda",
  bajarildi: "Bajarildi",
  rad_etildi: "Rad etildi",
};
const TONE: Record<string, "amber" | "blue" | "green" | "red" | "muted"> = {
  kutilmoqda: "amber",
  jarayonda: "blue",
  bajarildi: "green",
  rad_etildi: "red",
};
const STATUSES = ["kutilmoqda", "jarayonda", "bajarildi", "rad_etildi"];

export function VozvratStatusControl({
  id,
  currentStatus,
  currentFirmaJavob,
}: {
  id: number;
  currentStatus: string | null;
  currentFirmaJavob: string | null;
}) {
  const cur = currentStatus ?? "kutilmoqda";
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState(cur);
  const [firmaJavob, setFirmaJavob] = useState(currentFirmaJavob ?? "");
  const [isPending, start] = useTransition();

  const onSave = () => {
    start(async () => {
      const res = await updateVozvratStatusAction({ id, status, firmaJavob: firmaJavob.trim() || undefined });
      if (res.ok) {
        toast.success("Vozvrat holati yangilandi.");
        setOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <>
      <button
        onClick={() => { setStatus(cur); setFirmaJavob(currentFirmaJavob ?? ""); setOpen(true); }}
        className="transition-opacity hover:opacity-80"
        title="Holatni o'zgartirish"
      >
        <Pill tone={TONE[cur] ?? "muted"}>{LABEL[cur] ?? cur}</Pill>
      </button>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Qayta ishlash holati</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Holatni yangilang — bot Telegram guruhiga xabar yuboradi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-1">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Holat</Label>
              <Select value={status} onValueChange={(v) => setStatus(v ?? cur)} disabled={isPending}>
                <SelectTrigger className="h-10 rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>{LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`fj-${id}`} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Firma javobi (ixtiyoriy)
              </Label>
              <Input
                id={`fj-${id}`}
                value={firmaJavob}
                onChange={(e) => setFirmaJavob(e.target.value)}
                placeholder="Izoh / firma javobi"
                disabled={isPending}
                className="h-10 rounded-xl"
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending} className="rounded-xl">
              Bekor
            </Button>
            <Button onClick={onSave} disabled={isPending} className="rounded-xl">
              {isPending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Saqlanmoqda...</> : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
