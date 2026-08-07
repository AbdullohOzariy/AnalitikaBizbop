"use client";

import { useTransition, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Banknote,
  CreditCard,
  ArrowLeftRight,
  CircleHelp,
  Loader2,
  AlertTriangle,
  Plus,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { tolovTuriBelgilaAction, tolovTuriOchirAction } from "./actions";

type Kind = "CASH" | "CARD" | "TRANSFER" | "OTHER";

export type TolovTuriRow = {
  id: number;
  name: string;
  kind: Kind;
  isConfirmed: boolean;
  /** Shu nom bilan nechta to'lov yozuvi bor — tasdiqlash muhimligini ko'rsatadi. */
  soni: number;
  summa: number;
};

const KINDS: { v: Kind; l: string; icon: typeof Banknote; tone: string }[] = [
  {
    v: "CASH",
    l: "Naqd",
    icon: Banknote,
    tone: "data-[on=true]:bg-primary data-[on=true]:text-primary-foreground",
  },
  {
    v: "CARD",
    l: "Plastik",
    icon: CreditCard,
    tone: "data-[on=true]:bg-blue-600 data-[on=true]:text-white",
  },
  {
    v: "TRANSFER",
    l: "O'tkazma",
    icon: ArrowLeftRight,
    tone: "data-[on=true]:bg-violet-600 data-[on=true]:text-white",
  },
  {
    v: "OTHER",
    l: "Boshqa",
    icon: CircleHelp,
    tone: "data-[on=true]:bg-muted-foreground data-[on=true]:text-background",
  },
];

const uz = (n: number) => new Intl.NumberFormat("uz-UZ").format(Math.round(n));

/**
 * 1C bergan to'lov nomi → bizdagi tur.
 *
 * Yangi nom uchraganda avtomatik qo'shiladi va TAXMINIY tur qo'yiladi, lekin
 * "tekshirilmagan" bo'lib turadi — chunki noto'g'ri taxmin tushumni naqd va
 * plastikka noto'g'ri bo'lib yuboradi.
 */
export function TolovTuriEditor({ rows }: { rows: TolovTuriRow[] }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [savingName, setSavingName] = useState<string | null>(null);
  const [yangiNom, setYangiNom] = useState("");
  const [yangiKind, setYangiKind] = useState<Kind>("CARD");

  const belgila = (r: TolovTuriRow, kind: Kind) => {
    if (r.kind === kind && r.isConfirmed) return;
    setSavingName(r.name);
    start(async () => {
      const res = await tolovTuriBelgilaAction({ name: r.name, kind });
      setSavingName(null);
      if (res.ok) {
        toast.success(`«${r.name}» → ${KINDS.find((k) => k.v === kind)?.l}`);
        router.refresh();
      } else toast.error(res.error ?? "Xato.");
    });
  };

  /** Qo'lda o'chirish — faqat hech qayerda ishlatilmaganini (server ham tekshiradi). */
  const ochir = (r: TolovTuriRow) => {
    setSavingName(r.name);
    start(async () => {
      const res = await tolovTuriOchirAction(r.name);
      setSavingName(null);
      if (res.ok) {
        toast.success(`«${r.name}» o'chirildi.`);
        router.refresh();
      } else toast.error(res.error ?? "Xato.");
    });
  };

  /** Oldindan qo'shish — 1C birinchi marta yuborgunicha turini belgilab qo'yish. */
  const qosh = () => {
    const nom = yangiNom.trim();
    if (!nom) return;
    if (rows.some((r) => r.name === nom)) {
      toast.error(`«${nom}» allaqachon ro'yxatda.`);
      return;
    }
    setSavingName(nom);
    start(async () => {
      const res = await tolovTuriBelgilaAction({ name: nom, kind: yangiKind });
      setSavingName(null);
      if (res.ok) {
        toast.success(`«${nom}» qo'shildi.`);
        setYangiNom("");
        router.refresh();
      } else toast.error(res.error ?? "Xato.");
    });
  };

  const tekshirilmagan = rows.filter((r) => !r.isConfirmed).length;

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        1C chekdagi to&apos;lov nomini o&apos;zi yuboradi. Har yangi nom
        avtomatik qo&apos;shiladi va <b>taxminiy</b> tur oladi — uni shu yerda
        tasdiqlaysiz. Tasdiqlangach
        <b> allaqachon saqlangan cheklar ham</b> qayta belgilanadi.
      </p>

      {/* ── Qo'lda qo'shish: 1C yuborishini kutmasdan turini belgilash ── */}
      <div className="rounded-lg border border-dashed border-border p-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[180px] flex-1">
            <label className="mb-1 block text-[11px] text-muted-foreground">
              Yangi to&apos;lov nomi
            </label>
            <Input
              value={yangiNom}
              onChange={(e) => setYangiNom(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && qosh()}
              placeholder="masalan: Click"
              disabled={isPending}
              className="h-9 font-mono text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] text-muted-foreground">
              Turi
            </label>
            <select
              value={yangiKind}
              onChange={(e) => setYangiKind(e.target.value as Kind)}
              disabled={isPending}
              className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            >
              {KINDS.map((k) => (
                <option key={k.v} value={k.v}>
                  {k.l}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            onClick={qosh}
            disabled={isPending || !yangiNom.trim()}
            className="h-9 gap-1.5"
          >
            {isPending && savingName === yangiNom.trim() ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            Qo&apos;shish
          </Button>
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          Nom 1C yuboradigan nom bilan <b>aynan bir xil</b> bo&apos;lishi kerak
          — katta-kichik harf va bo&apos;shliqgacha. Aks holda moslik ishlamaydi
          va 1C o&apos;z nomini alohida qo&apos;shib qo&apos;yadi.
        </p>
      </div>

      {rows.length === 0 && (
        <p className="py-4 text-center text-sm text-muted-foreground">
          Hali to&apos;lov turi kelmagan — 1C dan birinchi chek tushgach shu
          yerda paydo bo&apos;ladi.
        </p>
      )}

      {tekshirilmagan > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/[0.09] px-3 py-2 text-xs">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-600" />
          <span>
            <b>{tekshirilmagan} ta</b> nom tekshirilmagan — turi taxmin bilan
            qo&apos;yilgan.
          </span>
        </div>
      )}

      <div className="divide-y divide-border/60">
        {rows.map((r) => (
          <div
            key={r.id}
            className="flex flex-wrap items-center justify-between gap-3 py-2.5"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{r.name}</span>
                {!r.isConfirmed && (
                  <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700 dark:text-amber-400">
                    taxmin
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground">
                {r.soni.toLocaleString("uz-UZ")} to&apos;lov · {uz(r.summa)}{" "}
                so&apos;m
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1">
              {KINDS.map((k) => {
                const Icon = k.icon;
                const on = r.kind === k.v;
                return (
                  <Button
                    key={k.v}
                    size="sm"
                    variant="outline"
                    data-on={on}
                    disabled={isPending}
                    onClick={() => belgila(r, k.v)}
                    className={cn(
                      "h-8 gap-1 px-2 text-xs",
                      k.tone,
                      on && "border-transparent",
                    )}
                  >
                    <Icon className="h-3 w-3" />
                    {k.l}
                  </Button>
                );
              })}
              {/* O'chirish faqat ISHLATILMAGANIDA — chekda uchragan nomni
                  o'chirish tushum taqsimotini buzardi (server ham tekshiradi). */}
              {r.soni === 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={isPending}
                  onClick={() => ochir(r)}
                  title="O'chirish (hech qayerda ishlatilmagan)"
                  className="h-8 px-2 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              )}
              {savingName === r.name && (
                <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
