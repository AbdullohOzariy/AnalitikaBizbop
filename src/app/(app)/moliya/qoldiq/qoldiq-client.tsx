"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname } from "next/navigation";
import {
  ChevronDown,
  Loader2,
  ShieldCheck,
  ShieldAlert,
  Calculator,
  Trash2,
  CalendarDays,
} from "lucide-react";
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
import { formatUZS, formatDateUZ } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { davrBoshiSaqlaAction, davrBoshiOchirAction } from "./actions";

type Row = {
  id: number;
  name: string;
  kind: string;
  branchName: string | null;
  trustedFrom: string | null;
  openingDate: string | null;
  opening: number;
  kirim: number;
  chiqim: number;
  qoldiq: number;
  openingMissing: boolean;
  trusted: boolean;
  history: { id: number; onDate: string; amount: number; note: string | null }[];
};

const KIND_LABEL: Record<string, string> = { CASH: "naqd", BANK: "bank", CARD: "plastik" };

export function QoldiqClient({
  rows,
  asOf,
  canEdit,
}: {
  rows: Row[];
  asOf: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, start] = useTransition();
  const [openId, setOpenId] = useState<number | null>(null);
  const [sanash, setSanash] = useState<Row | null>(null);

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
        <CardContent className="flex flex-wrap items-end gap-3 py-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Holat sanasi
          </div>
          <Input
            type="date"
            defaultValue={asOf}
            onChange={(e) => router.push(`${pathname}?sana=${e.target.value}`)}
            className="h-8 w-[160px] text-xs"
          />
          <p className="text-xs text-muted-foreground">
            Qoldiq = davr boshi (fizik sanash) + shu sanagacha bo&apos;lgan kirim − chiqim
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-1 py-3">
          {/* Ustun sarlavhalari */}
          <div className="flex items-center gap-2 px-3 pb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <span className="flex-1">Hisob</span>
            <span className="hidden w-32 text-right sm:inline">Davr boshi</span>
            <span className="hidden w-32 text-right sm:inline">Kirim</span>
            <span className="hidden w-32 text-right sm:inline">Chiqim</span>
            <span className="w-36 text-right">Qoldiq</span>
            <span className="w-4" />
          </div>

          {rows.map((r) => {
            const open = openId === r.id;
            return (
              <div
                key={r.id}
                className={cn(
                  "rounded-xl border border-border bg-card/50 transition-colors",
                  open && "border-primary/40 bg-card",
                  r.qoldiq < 0 && "border-destructive/40"
                )}
              >
                <button
                  type="button"
                  onClick={() => setOpenId(open ? null : r.id)}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{r.name}</span>
                      <Pill>{KIND_LABEL[r.kind] ?? r.kind}</Pill>
                      {r.trusted ? (
                        <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
                      ) : (
                        <ShieldAlert
                          className="h-3.5 w-3.5 shrink-0 text-amber-500"
                          aria-label="Tasdiqlanmagan"
                        />
                      )}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {r.openingMissing
                        ? "davr boshi kiritilmagan — qoldiq ishonchsiz"
                        : `davr boshi: ${formatDateUZ(r.openingDate!)}`}
                      {r.branchName ? ` · ${r.branchName}` : ""}
                    </span>
                  </span>

                  <span className="hidden w-32 text-right text-xs tabular-nums text-muted-foreground sm:inline">
                    {r.openingMissing ? "—" : formatUZS(r.opening)}
                  </span>
                  <span className="hidden w-32 text-right text-xs tabular-nums text-primary sm:inline">
                    {formatUZS(r.kirim)}
                  </span>
                  <span className="hidden w-32 text-right text-xs tabular-nums text-destructive sm:inline">
                    {formatUZS(r.chiqim)}
                  </span>
                  <span
                    className={cn(
                      "w-36 text-right text-sm font-bold tabular-nums",
                      r.qoldiq < 0 ? "text-destructive" : "text-foreground"
                    )}
                  >
                    {formatUZS(r.qoldiq)}
                  </span>
                  <ChevronDown
                    className={cn(
                      "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                      open && "rotate-180"
                    )}
                  />
                </button>

                {open && (
                  <div className="space-y-3 border-t border-border px-3 py-3">
                    {r.qoldiq < 0 && (
                      <div className="flex gap-2 rounded-lg bg-destructive/5 p-2.5 text-xs">
                        <ShieldAlert className="h-4 w-4 shrink-0 text-destructive" />
                        <span>
                          <b>Naqd qoldiq manfiy bo&apos;lishi mumkin emas.</b> Sabablari:{" "}
                          {r.openingMissing
                            ? "davr boshi kiritilmagan (eng ehtimolli)"
                            : "yetishmayotgan kirim yozuvi yoki juftlanmagan ko'chirish"}
                          .
                        </span>
                      </div>
                    )}

                    {/* Mobil uchun raqamlar */}
                    <div className="grid grid-cols-3 gap-2 text-xs sm:hidden">
                      <div>
                        <div className="text-muted-foreground">Davr boshi</div>
                        <div className="tabular-nums">{r.openingMissing ? "—" : formatUZS(r.opening)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Kirim</div>
                        <div className="tabular-nums text-primary">{formatUZS(r.kirim)}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">Chiqim</div>
                        <div className="tabular-nums text-destructive">{formatUZS(r.chiqim)}</div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">Ishonchli sana:</span>
                      <span>{r.trustedFrom ? formatDateUZ(r.trustedFrom) : "belgilanmagan"}</span>
                      {canEdit && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setSanash(r)}
                          className="ml-auto h-7 gap-1 px-2 text-xs"
                        >
                          <Calculator className="h-3 w-3" />
                          Fizik sanash kiritish
                        </Button>
                      )}
                    </div>

                    {r.history.length > 0 && (
                      <div>
                        <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                          Sanash tarixi
                        </div>
                        <div className="space-y-1">
                          {r.history.map((h) => (
                            <div
                              key={h.id}
                              className="flex items-center gap-2 rounded-lg bg-muted/40 px-2.5 py-1.5 text-xs"
                            >
                              <span className="w-24 shrink-0">{formatDateUZ(h.onDate)}</span>
                              <span className="w-32 shrink-0 text-right tabular-nums font-medium">
                                {formatUZS(h.amount)}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                                {h.note ?? ""}
                              </span>
                              {canEdit && (
                                <button
                                  type="button"
                                  disabled={isPending}
                                  onClick={() =>
                                    run(() => davrBoshiOchirAction(h.id), "Sanash o'chirildi.")
                                  }
                                  className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                                  aria-label="O'chirish"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {sanash && (
        <SanashDialog
          row={sanash}
          asOf={asOf}
          isPending={isPending}
          onClose={() => setSanash(null)}
          onSubmit={(v, done) => run(() => davrBoshiSaqlaAction(v), "Davr boshi saqlandi.", done)}
        />
      )}
    </div>
  );
}

function SanashDialog({
  row,
  asOf,
  isPending,
  onClose,
  onSubmit,
}: {
  row: Row;
  asOf: string;
  isPending: boolean;
  onClose: () => void;
  onSubmit: (
    v: { accountId: number; onDate: string; amount: number; note?: string; trust?: boolean },
    done: () => void
  ) => void;
}) {
  const [onDate, setOnDate] = useState(asOf);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [trust, setTrust] = useState(true);

  const amt = Number(amount.replace(/\s/g, ""));
  const farq = Number.isFinite(amt) && amount ? amt - row.qoldiq : null;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fizik sanash — {row.name}</DialogTitle>
          <DialogDescription>
            Sanalgan naqd shu kun BOSHIGA qoldiq deb yoziladi. O&apos;sha kunning yozuvlari
            ustiga qo&apos;shiladi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Sana</Label>
              <Input type="date" value={onDate} onChange={(e) => setOnDate(e.target.value)} className="h-9" />
            </div>
            <div>
              <Label className="text-xs">Sanalgan summa</Label>
              <Input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                className="h-9 tabular-nums"
              />
            </div>
          </div>

          {farq !== null && farq !== 0 && (
            <div
              className={cn(
                "rounded-lg p-2.5 text-xs",
                Math.abs(farq) > 0 ? "bg-amber-400/10" : "bg-muted/50"
              )}
            >
              Hozirgi hisoblangan qoldiq: <b>{formatUZS(row.qoldiq)}</b>
              <br />
              Farq: <b className={farq < 0 ? "text-destructive" : "text-primary"}>{formatUZS(farq)}</b>{" "}
              {farq < 0 ? "(kamomad)" : "(ortiqcha)"}
            </div>
          )}

          <div>
            <Label className="text-xs">Izoh</Label>
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-9" placeholder="masalan: oylik inventarizatsiya" />
          </div>

          <label className="flex items-start gap-2 rounded-lg bg-muted/40 p-2.5 text-xs">
            <input
              type="checkbox"
              checked={trust}
              onChange={(e) => setTrust(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <b>Shu sanadan boshlab qoldiq ishonchli deb belgilansin.</b> Undan oldingi davr
              hisobotda &laquo;tasdiqlanmagan&raquo; bo&apos;lib qoladi — meros ma&apos;lumot
              o&apos;chirilmaydi, ajratiladi.
            </span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Bekor
          </Button>
          <Button
            disabled={isPending || !amount}
            onClick={() => {
              if (!Number.isFinite(amt) || amt < 0) return toast.error("Summani to'g'ri kiriting.");
              onSubmit(
                { accountId: row.id, onDate, amount: amt, note: note.trim() || undefined, trust },
                onClose
              );
            }}
          >
            {isPending && <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
