"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Lock, LockOpen, Loader2, CalendarDays, AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Pill } from "@/components/common/page";
import { formatUZS, formatDateTimeUZ } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { kunYopAction, yopishBekorAction } from "./actions";

type Close = {
  id: number;
  expected: number;
  counted: number;
  diff: number;
  note: string | null;
  closedBy: string | null;
  closedAt: string;
};

type Row = {
  id: number;
  name: string;
  kind: string;
  expected: number;
  openingMissing: boolean;
  close: Close | null;
  lastClosed: string | null;
  kechikish: number | null;
};

export function YopishClient({
  rows,
  onDate,
  canEdit,
}: {
  rows: Row[];
  onDate: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, start] = useTransition();
  const [yop, setYop] = useState<Row | null>(null);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string, done?: () => void) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(okMsg);
        done?.();
        router.refresh();
      } else toast.error(res.error ?? "Xato.");
    });

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Yopiladigan kun
          </div>
          <Input
            type="date"
            defaultValue={onDate}
            onChange={(e) => router.push(`${pathname}?sana=${e.target.value}`)}
            className="h-8 w-[160px] text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Kun yopilgach o&apos;sha sanaga yozuv kiritib/o&apos;chirib bo&apos;lmaydi
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1.5 py-3">
          {rows.map((r) => {
            const c = r.close;
            const kechikkan = (r.kechikish ?? 0) > 0;
            return (
              <div
                key={r.id}
                className={cn(
                  "flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl border border-border px-3 py-2.5",
                  c && c.diff === 0 && "border-primary/30 bg-primary/5",
                  c && c.diff !== 0 && "border-destructive/40 bg-destructive/5"
                )}
              >
                <div className="min-w-[160px] flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-medium">{r.name}</span>
                    {c ? (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-primary" />
                    ) : (
                      <LockOpen className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {c
                      ? `${c.closedBy ?? "—"} · ${formatDateTimeUZ(c.closedAt)}`
                      : r.lastClosed
                      ? `oxirgi yopilgan: ${r.lastClosed}${kechikkan ? ` (${r.kechikish} kun kechikish)` : ""}`
                      : "hech qachon yopilmagan"}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Kutilgan</div>
                  <div className="text-xs tabular-nums">{formatUZS(c ? c.expected : r.expected)}</div>
                </div>

                {c && (
                  <>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Sanalgan</div>
                      <div className="text-xs tabular-nums">{formatUZS(c.counted)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Farq</div>
                      <div
                        className={cn(
                          "text-xs font-bold tabular-nums",
                          c.diff === 0
                            ? "text-primary"
                            : c.diff < 0
                            ? "text-destructive"
                            : "text-amber-600 dark:text-amber-400"
                        )}
                      >
                        {c.diff === 0 ? "0" : formatUZS(c.diff)}
                      </div>
                    </div>
                  </>
                )}

                {r.openingMissing && !c && (
                  <Pill className="bg-amber-400/15 text-amber-700 dark:text-amber-400">
                    davr boshi yo&apos;q
                  </Pill>
                )}

                {canEdit && (
                  <div className="ml-auto">
                    {c ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => run(() => yopishBekorAction(c.id), "Yopish bekor qilindi.")}
                        className="h-7 gap-1 px-2 text-xs"
                      >
                        <LockOpen className="h-3 w-3" />
                        Ochish
                      </Button>
                    ) : (
                      <Button size="sm" onClick={() => setYop(r)} className="h-7 gap-1 px-2 text-xs">
                        <Check className="h-3 w-3" />
                        Yopish
                      </Button>
                    )}
                  </div>
                )}

                {c?.note && (
                  <div className="w-full rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                    {c.note}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {yop && (
        <YopDialog
          row={yop}
          onDate={onDate}
          isPending={isPending}
          onClose={() => setYop(null)}
          onSubmit={(v, done) => run(() => kunYopAction(v), "Kun yopildi.", done)}
        />
      )}
    </div>
  );
}

function YopDialog({
  row,
  onDate,
  isPending,
  onClose,
  onSubmit,
}: {
  row: Row;
  onDate: string;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (
    v: { accountId: number; onDate: string; counted: number; note?: string },
    done: () => void
  ) => void;
}) {
  const [counted, setCounted] = useState("");
  const [note, setNote] = useState("");

  const c = Number(counted.replace(/\s/g, ""));
  const diff = counted && Number.isFinite(c) ? c - row.expected : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            Kunni yopish — {row.name}, {onDate}
          </DialogTitle>
          <DialogDescription>
            Kassadagi naqdni sanang va shu yerga kiriting. Yopilgandan keyin bu sanaga
            yozuv kiritib bo&apos;lmaydi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-lg bg-muted/50 p-3 text-sm">
            Tizim hisobi bo&apos;yicha bo&apos;lishi kerak:{" "}
            <b className="tabular-nums">{formatUZS(row.expected)}</b>
            {row.openingMissing && (
              <div className="mt-1 flex gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                Davr boshi kiritilmagan — bu raqam ishonchsiz. Avval «Qoldiqlar»da fizik
                sanashni kiriting.
              </div>
            )}
          </div>

          <div>
            <Label className="text-xs">Sanalgan naqd</Label>
            <Input
              inputMode="numeric"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              placeholder="0"
              className="h-9 tabular-nums"
              autoFocus
            />
          </div>

          {diff !== null && (
            <div
              className={cn(
                "rounded-lg p-2.5 text-sm",
                diff === 0 ? "bg-primary/10" : diff < 0 ? "bg-destructive/10" : "bg-amber-400/10"
              )}
            >
              Farq: <b className="tabular-nums">{diff === 0 ? "0" : formatUZS(diff)}</b>{" "}
              {diff === 0 ? "✓ mos keldi" : diff < 0 ? "— kamomad" : "— ortiqcha"}
            </div>
          )}

          <div>
            <Label className="text-xs">
              Izoh {diff !== null && diff !== 0 && <span className="text-destructive">— majburiy</span>}
            </Label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-9"
              placeholder={diff !== null && diff !== 0 ? "Farq sababi, kim javobgar" : "ixtiyoriy"}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Bekor
          </Button>
          <Button
            disabled={isPending || !counted}
            onClick={() => {
              if (!Number.isFinite(c) || c < 0) return toast.error("Summani to'g'ri kiriting.");
              if (c - row.expected !== 0 && !note.trim())
                return toast.error("Farq bor — izoh yozing.");
              onSubmit(
                { accountId: row.id, onDate, counted: c, note: note.trim() || undefined },
                onClose
              );
            }}
          >
            {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Yopish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
