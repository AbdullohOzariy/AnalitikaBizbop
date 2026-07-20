"use client";

/**
 * Haydovchilar ma'lumotnomasi.
 *
 * Haydovchi ERP'ga KIRMAYDI — parol/email yo'q. U faqat Telegram miniappda
 * ishlaydi va `tgUserId` orqali taniladi, shuning uchun ID to'g'ri kiritilishi
 * kritik: noto'g'ri ID = haydovchi miniappga kira olmaydi.
 *
 * tgUserId serverda BigInt, lekin bu yerda BOSHDAN-OXIR string — BigInt client
 * komponentga props sifatida serializatsiya qilinmaydi.
 */

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Loader2, Trash2, Pencil, Search, X, Users, Save,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Pill, EmptyState } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { haydovchiSaqlaAction, haydovchiOchirAction } from "./actions";

export type HaydovchiRow = {
  id: number;
  name: string;
  /** BigInt string ko'rinishida — hech qachon Number/BigInt'ga o'girilmaydi. */
  tgUserId: string;
  phone: string | null;
  isActive: boolean;
  tripCount: number;
};

/** Server schema bilan bir xil: faqat raqam, 5–15 xona. */
const TG_ID_RE = /^\d{5,15}$/;

type FormState = {
  id: number | null;
  name: string;
  tgUserId: string;
  phone: string;
  isActive: boolean;
};

const BOSH_FORMA: FormState = {
  id: null, name: "", tgUserId: "", phone: "", isActive: true,
};

export function HaydovchilarTab({ rows }: { rows: HaydovchiRow[] }) {
  const router = useRouter();
  const [isPending, start] = useTransition();

  const [q, setQ] = useState("");
  const [forma, setForma] = useState<FormState | null>(null);
  const [ochir, setOchir] = useState<HaydovchiRow | null>(null);

  // Server manbaa: har muvaffaqiyatli amaldan keyin router.refresh() bilan qayta o'qiladi.
  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    okMsg: string,
    done?: () => void
  ) =>
    start(async () => {
      const res = await fn();
      if (res.ok) { toast.success(okMsg); done?.(); router.refresh(); }
      else toast.error(res.error ?? "Xato.");
    });

  const Q = q.trim().toLowerCase();
  const shown = useMemo(
    () =>
      rows.filter(
        (d) =>
          !Q ||
          d.name.toLowerCase().includes(Q) ||
          d.tgUserId.includes(Q) ||
          (d.phone ?? "").toLowerCase().includes(Q)
      ),
    [rows, Q]
  );

  const faolSoni = useMemo(() => rows.filter((d) => d.isActive).length, [rows]);

  const saqla = () => {
    if (!forma) return;
    const name = forma.name.trim();
    const tgUserId = forma.tgUserId.trim();
    const phone = forma.phone.trim();
    if (!name) { toast.error("Haydovchi ismini kiriting."); return; }
    if (!TG_ID_RE.test(tgUserId)) {
      toast.error("Telegram ID faqat raqamlardan, 5–15 xona bo'lishi kerak.");
      return;
    }
    run(
      () =>
        haydovchiSaqlaAction(forma.id, {
          name,
          tgUserId,
          phone: phone || null,
          isActive: forma.isActive,
        }),
      forma.id ? "Haydovchi yangilandi." : "Haydovchi qo'shildi.",
      () => setForma(null)
    );
  };

  // Holat almashtirish — schema to'liq obyekt kutadi, shuning uchun hamma maydon yuboriladi.
  const toggleFaol = (d: HaydovchiRow) =>
    run(
      () =>
        haydovchiSaqlaAction(d.id, {
          name: d.name,
          tgUserId: d.tgUserId,
          phone: d.phone,
          isActive: !d.isActive,
        }),
      d.isActive ? "Nofaol qilindi — miniappga kira olmaydi." : "Faollashtirildi."
    );

  return (
    <Card className="overflow-hidden">
      <CardContent className="space-y-4 p-4">
        {/* Qidiruv + qo'shish */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-52 flex-1">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Qidirish — ism, Telegram ID yoki telefon..."
              className="h-9 pl-8 pr-8"
            />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Tozalash"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Button
            className="h-9 gap-1.5 rounded-xl"
            disabled={isPending}
            onClick={() => setForma({ ...BOSH_FORMA })}
          >
            <Plus className="h-4 w-4" /> Haydovchi qo&apos;shish
          </Button>
        </div>

        {rows.length === 0 ? (
          <EmptyState
            icon={Users}
            title="Hali haydovchi qo'shilmagan"
            description="Haydovchi qo'shilmaguncha miniappga hech kim kira olmaydi."
          >
            <Button className="rounded-xl" onClick={() => setForma({ ...BOSH_FORMA })}>
              <Plus className="h-4 w-4" /> Birinchi haydovchini qo&apos;shish
            </Button>
          </EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto rounded-xl border border-border/60">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/40 hover:bg-muted/40">
                    <TableHead>Ism</TableHead>
                    <TableHead className="w-[150px]">Telegram ID</TableHead>
                    <TableHead className="w-[150px]">Telefon</TableHead>
                    <TableHead className="w-[100px] text-right">Reyslar</TableHead>
                    <TableHead className="w-[110px]">Holat</TableHead>
                    <TableHead className="w-[100px] text-right">Amallar</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                        Qidiruvga mos haydovchi yo&apos;q.
                      </TableCell>
                    </TableRow>
                  ) : (
                    shown.map((d) => (
                      <TableRow key={d.id} className={cn("text-sm", !d.isActive && "opacity-55")}>
                        <TableCell className="font-medium">{d.name}</TableCell>
                        <TableCell className="font-mono text-xs text-muted-foreground">
                          {d.tgUserId}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {d.phone || "—"}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {d.tripCount > 0 ? d.tripCount.toLocaleString("uz-UZ") : "—"}
                        </TableCell>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => toggleFaol(d)}
                            disabled={isPending}
                            aria-label={`${d.name}: holatni almashtirish`}
                            title="Holatni almashtirish"
                            className="disabled:pointer-events-none"
                          >
                            <Pill tone={d.isActive ? "green" : "muted"}>
                              {d.isActive ? "Faol" : "Nofaol"}
                            </Pill>
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 rounded-lg"
                              disabled={isPending}
                              onClick={() =>
                                setForma({
                                  id: d.id,
                                  name: d.name,
                                  tgUserId: d.tgUserId,
                                  phone: d.phone ?? "",
                                  isActive: d.isActive,
                                })
                              }
                              aria-label={`${d.name} ma'lumotini tahrirlash`}
                              title="Tahrirlash"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost" size="icon"
                              className="h-8 w-8 rounded-lg text-destructive hover:text-destructive"
                              disabled={isPending}
                              onClick={() => setOchir(d)}
                              aria-label={`${d.name} haydovchini o'chirish`}
                              title="O'chirish"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>

            <p className="text-[11px] text-muted-foreground tabular-nums">
              {shown.length.toLocaleString("uz-UZ")} ta haydovchi ko&apos;rsatilmoqda ·{" "}
              {faolSoni.toLocaleString("uz-UZ")} ta faol. Faqat <b>faol</b> haydovchi miniappga
              kira oladi.
            </p>
          </>
        )}
      </CardContent>

      {/* Qo'shish / tahrirlash formasi */}
      <Dialog open={!!forma} onOpenChange={(o) => !o && !isPending && setForma(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {forma?.id ? "Haydovchini tahrirlash" : "Yangi haydovchi"}
            </DialogTitle>
            <DialogDescription>
              Haydovchi ERP&apos;ga kirmaydi — parol yoki email kerak emas. U faqat Telegram
              miniappda ishlaydi va Telegram ID orqali taniladi.
            </DialogDescription>
          </DialogHeader>

          {forma && (
            <form
              className="space-y-3"
              onSubmit={(e) => { e.preventDefault(); saqla(); }}
            >
              <div className="space-y-1.5">
                <Label htmlFor="hd-name" className="text-xs text-muted-foreground">
                  Ism <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="hd-name"
                  value={forma.name}
                  disabled={isPending}
                  autoFocus
                  maxLength={120}
                  placeholder="Masalan: Alisher Karimov"
                  className="h-9"
                  onChange={(e) => setForma({ ...forma, name: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hd-tg" className="text-xs text-muted-foreground">
                  Telegram ID <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="hd-tg"
                  value={forma.tgUserId}
                  disabled={isPending}
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder="123456789"
                  className="h-9 font-mono"
                  // Faqat raqam qoldiriladi: nusxa-ko'chirishda bo'sh joy/harf tushib qolmasin.
                  onChange={(e) =>
                    setForma({ ...forma, tgUserId: e.target.value.replace(/\D/g, "").slice(0, 15) })
                  }
                />
                <p className="text-[11px] leading-relaxed text-muted-foreground">
                  Haydovchi botga <b>/start</b> bosgach ID si aniqlanadi. Telegramda{" "}
                  <b>@userinfobot</b> ga yozib ham bilish mumkin. ID — faqat raqam, 5–15 xona;
                  bu telefon raqami yoki @username emas.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="hd-phone" className="text-xs text-muted-foreground">
                  Telefon (ixtiyoriy)
                </Label>
                <Input
                  id="hd-phone"
                  value={forma.phone}
                  disabled={isPending}
                  type="tel"
                  maxLength={30}
                  placeholder="+998 90 123 45 67"
                  className="h-9"
                  onChange={(e) => setForma({ ...forma, phone: e.target.value })}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs text-muted-foreground">Holat</Label>
                <div className="flex gap-1">
                  {[
                    { v: true, l: "Faol" },
                    { v: false, l: "Nofaol" },
                  ].map((o) => (
                    <button
                      key={String(o.v)}
                      type="button"
                      disabled={isPending}
                      onClick={() => setForma({ ...forma, isActive: o.v })}
                      className={cn(
                        "inline-flex h-9 flex-1 items-center justify-center rounded-lg border text-xs font-medium transition-colors disabled:pointer-events-none disabled:opacity-50",
                        forma.isActive === o.v
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-secondary"
                      )}
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Nofaol haydovchi miniappga kira olmaydi, lekin eski reyslari saqlanib qoladi.
                </p>
              </div>

              <DialogFooter className="gap-2">
                <Button
                  type="button" variant="outline" className="rounded-xl"
                  disabled={isPending} onClick={() => setForma(null)}
                >
                  Bekor
                </Button>
                <Button type="submit" className="rounded-xl gap-1.5" disabled={isPending}>
                  {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  Saqlash
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* O'chirish tasdiq */}
      <Dialog open={!!ochir} onOpenChange={(o) => !o && !isPending && setOchir(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Haydovchini o&apos;chirish</DialogTitle>
            <DialogDescription>
              <strong>{ochir?.name}</strong> ma&apos;lumotnomadan o&apos;chiriladi va miniappga
              kira olmaydi.{" "}
              {ochir && ochir.tripCount > 0
                ? `Bu haydovchida ${ochir.tripCount} ta reys bor — o'chirib bo'lmaydi, o'rniga nofaol qilib qo'ying.`
                : "Reyslari yo'q, shuning uchun o'chirish mumkin."}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline" className="rounded-xl"
              disabled={isPending} onClick={() => setOchir(null)}
            >
              Bekor
            </Button>
            <Button
              variant="destructive" className="rounded-xl"
              disabled={isPending || (ochir?.tripCount ?? 0) > 0}
              onClick={() =>
                ochir &&
                run(() => haydovchiOchirAction(ochir.id), "Haydovchi o'chirildi.", () => setOchir(null))
              }
            >
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "O'chirish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
