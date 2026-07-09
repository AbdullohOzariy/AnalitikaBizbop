"use client";

/**
 * Bot xodimiga Iyerarxiya kategoriyalarini biriktirish dialogi.
 * OTA kategoriya belgilansa — barcha sublari kiradi (sublari avtomatik, o'chirilgan
 * holda ko'rinadi); SUB alohida belgilansa — faqat o'zi. Hech narsa tanlanmasa —
 * cheklovsiz (to'liq katalog).
 */
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { ChevronRight, Search, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import type { AdminKatGroup } from "@/lib/spisaniya/sku-scope";
import { botUserKategoriyaSaqlaAction } from "./actions";

export function KategoriyaBiriktirishDialog({
  telegramId, ism, daraxt, boshlangich, onClose,
}: {
  telegramId: string;
  ism: string | null;
  daraxt: AdminKatGroup[];
  boshlangich: number[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [tanlangan, setTanlangan] = useState<Set<number>>(() => new Set(boshlangich));
  const [q, setQ] = useState("");
  const [ochiq, setOchiq] = useState<Set<number>>(new Set());

  const Q = q.trim().toUpperCase();
  const korinadigan = useMemo(() => {
    if (!Q) return daraxt;
    return daraxt
      .map((g) => ({
        ...g,
        otalar: g.otalar
          .map((o) => {
            const otaMos = o.nomi.toUpperCase().includes(Q);
            return { ...o, subs: otaMos ? o.subs : o.subs.filter((s) => s.nomi.toUpperCase().includes(Q)) };
          })
          .filter((o) => o.nomi.toUpperCase().includes(Q) || o.subs.length > 0),
      }))
      .filter((g) => g.otalar.length > 0);
  }, [daraxt, Q]);

  const toggleOta = (ota: AdminKatGroup["otalar"][number]) =>
    setTanlangan((prev) => {
      const n = new Set(prev);
      if (n.has(ota.id)) n.delete(ota.id);
      else {
        n.add(ota.id);
        for (const s of ota.subs) n.delete(s.id); // ota qamrab oladi — sub takror saqlanmasin
      }
      return n;
    });

  const toggleSub = (subId: number) =>
    setTanlangan((prev) => {
      const n = new Set(prev);
      if (n.has(subId)) n.delete(subId); else n.add(subId);
      return n;
    });

  const toggleOchiq = (id: number) =>
    setOchiq((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

  const saqla = () =>
    start(async () => {
      const res = await botUserKategoriyaSaqlaAction(telegramId, [...tanlangan]);
      if (res.ok) { toast.success("Kategoriyalar saqlandi."); router.refresh(); onClose(); }
      else toast.error(res.error ?? "Xato.");
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kategoriya biriktirish</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            <strong>{ism || telegramId}</strong> miniapp&apos;da faqat tanlangan kategoriyalar
            mahsulotlarini ko&apos;radi. Hech narsa tanlanmasa — to&apos;liq katalog.
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Kategoriya qidirish..." className="h-9 pl-8 pr-8" />
          {q && (
            <button onClick={() => setQ("")} aria-label="Tozalash"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        <div className="max-h-[50vh] overflow-y-auto rounded-lg border border-border/60">
          {korinadigan.length === 0 ? (
            <p className="p-4 text-center text-xs text-muted-foreground">Topilmadi.</p>
          ) : (
            <div className="divide-y divide-border/40">
              {korinadigan.map((g) => (
                <div key={g.id}>
                  <div className="px-3 pb-1 pt-2.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {g.nomi}
                  </div>
                  {g.otalar.map((o) => {
                    const otaBelgili = tanlangan.has(o.id);
                    const oOchiq = Q ? true : ochiq.has(o.id);
                    const tanlanganSubSoni = o.subs.filter((s) => tanlangan.has(s.id)).length;
                    return (
                      <div key={o.id}>
                        <div className="flex w-full items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted/40">
                          <input type="checkbox" className="h-4 w-4 shrink-0" checked={otaBelgili}
                            disabled={isPending} onChange={() => toggleOta(o)}
                            aria-label={`${o.nomi} — butun kategoriya`} />
                          <button onClick={() => toggleOchiq(o.id)} aria-expanded={oOchiq}
                            className="flex min-w-0 flex-1 items-center gap-1.5 text-left font-medium">
                            <span className="truncate">{o.nomi}</span>
                            <span className="ml-auto shrink-0 text-[11px] font-normal text-muted-foreground">
                              {otaBelgili ? "hammasi" : tanlanganSubSoni ? `${tanlanganSubSoni}/${o.subs.length}` : o.subs.length}
                            </span>
                            <ChevronRight className={`h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${oOchiq ? "rotate-90" : ""}`} />
                          </button>
                        </div>
                        {oOchiq && (
                          <div className="space-y-0.5 pb-1.5 pl-9 pr-3">
                            {o.subs.map((s) => (
                              <label key={s.id}
                                className={`flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-xs hover:bg-muted/60 ${otaBelgili ? "opacity-60" : ""}`}>
                                <input type="checkbox" className="h-3.5 w-3.5 shrink-0"
                                  checked={otaBelgili || tanlangan.has(s.id)}
                                  disabled={isPending || otaBelgili} onChange={() => toggleSub(s.id)} />
                                <span className="truncate">{s.nomi}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>

        <DialogFooter className="items-center gap-2 sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">
              {tanlangan.size ? `${tanlangan.size} ta tanlangan` : "Cheklovsiz (to'liq katalog)"}
            </span>
            {tanlangan.size > 0 && (
              <button className="text-xs text-muted-foreground underline hover:text-foreground"
                disabled={isPending} onClick={() => setTanlangan(new Set())}>
                Tozalash
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={onClose}>Bekor</Button>
            <Button className="rounded-xl" disabled={isPending} onClick={saqla}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Saqlash"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
