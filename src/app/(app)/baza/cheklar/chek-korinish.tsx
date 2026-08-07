"use client";

import { useState } from "react";
import { Table2, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";

export type ChekPayment = {
  id: number;
  name: string;
  kind: string;
  value: number;
};
export type ChekLine = {
  id: number;
  lineNo: number;
  itemCode: number | null;
  matched: boolean;
  name: string;
  barcode: string | null;
  qty: number;
  storno: number;
  sum: number;
  sumWD: number;
  totalSum: number;
};

export type ChekView = {
  id: number;
  shop: number;
  pos: number;
  number: string;
  session: number;
  openAt: string;
  businessDate: string;
  type: number;
  status: string;
  card: string | null;
  cashierName: string | null;
  qtyPositions: number;
  sum: number;
  sumWithDiscs: number;
  totalSum: number;
  branchName: string | null;
  payments: ChekPayment[];
  lines: ChekLine[];
};

/** Kod → ko'rinadigan nom (turlar boshqariladi — nomlar serverdan keladi). */
export type KindNom = (code: string) => string;

/** Toshkent vaqti — chekda ko'rsatiladigan ko'rinish. */
function vaqt(iso: string): { sana: string; soat: string } {
  const d = new Date(new Date(iso).getTime() + 5 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return {
    sana: `${p(d.getUTCDate())}.${p(d.getUTCMonth() + 1)}.${d.getUTCFullYear()}`,
    soat: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`,
  };
}

/** Dona narxi — manbada yo'q, summa ÷ miqdordan chiqariladi. */
const donaNarx = (sum: number, qty: number) => (qty > 0 ? sum / qty : 0);

export function ChekKorinish({
  chek,
  onClose,
  turNomi,
}: {
  chek: ChekView;
  onClose: () => void;
  turNomi: KindNom;
}) {
  const [texnik, setTexnik] = useState(false);
  const t = vaqt(chek.openAt);
  const chegirma = chek.sum - chek.sumWithDiscs;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ReceiptText className="h-4 w-4" />
            Chek №{chek.number}
          </DialogTitle>
        </DialogHeader>

        {/* ── Qog'oz chek ── */}
        <div className="rounded-lg border border-border bg-[#fffdf7] p-4 font-mono text-[12px] leading-[1.5] text-neutral-900 shadow-inner dark:bg-neutral-50">
          <div className="text-center">
            <div className="text-[13px] font-bold tracking-wide">BIZBOP</div>
            <div className="text-[12px]">
              {chek.branchName ?? `Do'kon ${chek.shop}`}
            </div>
          </div>

          <Chiziq />

          <Qator chap={`Chek №${chek.number}`} ong={t.sana} />
          <Qator
            chap={`Kassa ${chek.pos} · Smena ${chek.session}`}
            ong={t.soat}
          />
          {chek.cashierName && (
            <div className="truncate">Kassir: {chek.cashierName}</div>
          )}

          <Chiziq />

          {chek.lines.map((l) => {
            const narx = donaNarx(l.sum, l.qty);
            const qatorChegirma = l.sum - l.sumWD;
            return (
              <div
                key={l.id}
                className={cn(
                  "py-0.5",
                  l.storno !== 0 && "line-through opacity-60",
                )}
              >
                <div className="break-words">{l.name}</div>
                <Qator
                  chap={`  ${l.qty} × ${formatUZS(narx)}`}
                  ong={formatUZS(l.sum)}
                />
                {qatorChegirma !== 0 && (
                  <Qator
                    chap="  chegirma"
                    ong={`-${formatUZS(qatorChegirma)}`}
                  />
                )}
                {l.storno !== 0 && <div className="text-[11px]"> ↩ STORNO</div>}
              </div>
            );
          })}

          <Chiziq />

          <Qator chap="JAMI" ong={formatUZS(chek.sum)} qalin />
          {chegirma !== 0 && (
            <Qator chap="Chegirma" ong={`-${formatUZS(chegirma)}`} />
          )}
          <Qator chap="TO'LOV" ong={formatUZS(chek.totalSum)} qalin katta />

          <Chiziq />

          {chek.payments.map((p) => (
            <Qator
              key={p.id}
              chap={`  ${turNomi(p.kind)}`}
              ong={formatUZS(p.value)}
            />
          ))}

          <Chiziq />

          <div className="text-[11px]">
            {chek.card && <div>Karta: {chek.card}</div>}
            <div>Tovar turlari: {chek.qtyPositions}</div>
          </div>

          <div className="mt-2 text-center text-[11px]">
            Xaridingiz uchun rahmat!
          </div>
        </div>

        {/* ── Texnik ma'lumot ── */}
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTexnik((v) => !v)}
            className="h-8 w-full gap-1.5 text-xs"
          >
            <Table2 className="h-3.5 w-3.5" />
            {texnik ? "Texnik ma'lumotni yashirish" : "Texnik ma'lumot"}
          </Button>

          {texnik && (
            <div className="mt-2 space-y-2 rounded-lg bg-muted/40 p-3 text-[11px]">
              <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                <F l="shop / pos" v={`${chek.shop} / ${chek.pos}`} />
                <F l="session" v={String(chek.session)} />
                <F l="type / status" v={`${chek.type} · ${chek.status}`} />
                <F l="Hisobot kuni" v={chek.businessDate} />
                <F l="sum" v={formatUZS(chek.sum)} />
                <F l="sumWithDiscs" v={formatUZS(chek.sumWithDiscs)} />
              </div>

              <div>
                <div className="mb-1 font-medium text-muted-foreground">
                  To&apos;lovlar (xom nom)
                </div>
                {chek.payments.map((p) => (
                  <div key={p.id}>
                    «{p.name}» → {p.kind} · {formatUZS(p.value)}
                  </div>
                ))}
              </div>

              <div>
                <div className="mb-1 font-medium text-muted-foreground">
                  Qatorlar
                </div>
                {chek.lines.map((l) => (
                  <div
                    key={l.id}
                    className={cn(
                      !l.matched && "text-amber-600 dark:text-amber-500",
                    )}
                  >
                    {l.lineNo}. kod {l.itemCode ?? "—"} ·{" "}
                    {l.barcode ?? "b/kodsiz"}
                    {!l.matched && " · SKU topilmadi"}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Chiziq() {
  return <div className="my-1.5 border-t border-dashed border-neutral-400" />;
}

function Qator({
  chap,
  ong,
  qalin,
  katta,
}: {
  chap: string;
  ong: string;
  qalin?: boolean;
  katta?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-baseline justify-between gap-3",
        qalin && "font-bold",
      )}
    >
      <span className="min-w-0 break-words">{chap}</span>
      <span className={cn("shrink-0 tabular-nums", katta && "text-[14px]")}>
        {ong}
      </span>
    </div>
  );
}

function F({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex gap-1.5">
      <span className="shrink-0 text-muted-foreground">{l}:</span>
      <span className="min-w-0 truncate">{v}</span>
    </div>
  );
}
