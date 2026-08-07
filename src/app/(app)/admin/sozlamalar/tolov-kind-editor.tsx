"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Loader2, Check, X, Pencil, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  tolovKindQoshAction,
  tolovKindTahrirAction,
  tolovKindOchirAction,
} from "./actions";

export type KindRow = {
  code: string;
  name: string;
  isCash: boolean;
  tone: string;
  isSystem: boolean;
  /** Nechta to'lovda ishlatilgan — o'chirish mumkinligini ko'rsatadi. */
  ishlatilgan: number;
};

/** `lib/integratsiya/tolov-turlari.ts` dagi TONES bilan mos bo'lishi shart. */
const TONE_UI: Record<string, { nom: string; dot: string }> = {
  green: { nom: "Yashil", dot: "bg-primary" },
  blue: { nom: "Ko'k", dot: "bg-blue-500" },
  violet: { nom: "Binafsha", dot: "bg-violet-500" },
  amber: { nom: "Sariq", dot: "bg-amber-500" },
  rose: { nom: "Pushti", dot: "bg-rose-500" },
  cyan: { nom: "Moviy", dot: "bg-cyan-500" },
  slate: { nom: "Kulrang", dot: "bg-muted-foreground/50" },
};
const TONE_CODES = Object.keys(TONE_UI);

/**
 * To'lov turlari ro'yxati — Naqd / Plastik / O'tkazma / Boshqa va foydalanuvchi
 * qo'shganlari (Payme, Click...).
 *
 * «Naqdmi» belgisi shunchaki rang emas: Moliya sverkasi shunga tayanadi —
 * kassir sanaydigan pulda faqat naqd turlar bo'ladi.
 */
export function TolovKindEditor({ rows }: { rows: KindRow[] }) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [tahrir, setTahrir] = useState<string | null>(null);
  const [yangi, setYangi] = useState(false);
  const [form, setForm] = useState({
    code: "",
    name: "",
    isCash: false,
    tone: "blue",
  });

  const yangila = () => router.refresh();

  const boshla = (r?: KindRow) => {
    if (r) {
      setTahrir(r.code);
      setYangi(false);
      setForm({ code: r.code, name: r.name, isCash: r.isCash, tone: r.tone });
    } else {
      setYangi(true);
      setTahrir(null);
      setForm({ code: "", name: "", isCash: false, tone: "blue" });
    }
  };

  const bekor = () => {
    setTahrir(null);
    setYangi(false);
  };

  const saqla = () =>
    start(async () => {
      const res = yangi
        ? await tolovKindQoshAction(form)
        : await tolovKindTahrirAction(form);
      if (res.ok) {
        toast.success(yangi ? "Tur qo'shildi." : "Saqlandi.");
        bekor();
        yangila();
      } else toast.error(res.error);
    });

  const ochir = (r: KindRow) =>
    start(async () => {
      const res = await tolovKindOchirAction(r.code);
      if (res.ok) {
        toast.success(`«${r.name}» o'chirildi.`);
        yangila();
      } else toast.error(res.error);
    });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Chekdagi to&apos;lov shu turlardan biriga tegishli bo&apos;ladi. Yangi
        usul chiqsa (Payme, Click, sertifikat) shu yerda qo&apos;shasiz —{" "}
        <b>dasturchiga murojaat qilish shart emas</b>.
      </p>

      <div className="divide-y divide-border/60">
        {rows.map((r) => {
          const tahrirda = tahrir === r.code;
          return (
            <div key={r.code} className="py-2.5">
              {tahrirda ? (
                <Forma
                  form={form}
                  setForm={setForm}
                  kodO2gartirilmaydi
                  isPending={isPending}
                  onSaqla={saqla}
                  onBekor={bekor}
                />
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={cn(
                        "h-3 w-3 shrink-0 rounded-full",
                        TONE_UI[r.tone]?.dot ?? TONE_UI.slate.dot,
                      )}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-medium">
                          {r.name}
                        </span>
                        {r.isCash && (
                          <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                            naqd
                          </span>
                        )}
                        {r.isSystem && (
                          <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {r.code} · {r.ishlatilgan.toLocaleString("uz-UZ")}{" "}
                        to&apos;lov
                      </div>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => boshla(r)}
                      className="h-8 gap-1 px-2 text-xs"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                      Tahrir
                    </Button>
                    {!r.isSystem && r.ishlatilgan === 0 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={isPending}
                        onClick={() => ochir(r)}
                        className="h-8 px-2 text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {yangi ? (
        <div className="rounded-lg border border-dashed border-border p-3">
          <Forma
            form={form}
            setForm={setForm}
            isPending={isPending}
            onSaqla={saqla}
            onBekor={bekor}
          />
        </div>
      ) : (
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => boshla()}
          className="h-9 w-full gap-1.5"
        >
          <Plus className="h-4 w-4" />
          Yangi tur
        </Button>
      )}
    </div>
  );
}

function Forma({
  form,
  setForm,
  kodO2gartirilmaydi,
  isPending,
  onSaqla,
  onBekor,
}: {
  form: { code: string; name: string; isCash: boolean; tone: string };
  setForm: (f: {
    code: string;
    name: string;
    isCash: boolean;
    tone: string;
  }) => void;
  kodO2gartirilmaydi?: boolean;
  isPending: boolean;
  onSaqla: () => void;
  onBekor: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[130px]">
          <label className="mb-1 block text-[11px] text-muted-foreground">
            Kod
          </label>
          <Input
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
            placeholder="PAYME"
            disabled={isPending || kodO2gartirilmaydi}
            className="h-9 font-mono text-sm uppercase"
          />
        </div>
        <div className="min-w-[140px] flex-1">
          <label className="mb-1 block text-[11px] text-muted-foreground">
            Nomi
          </label>
          <Input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && onSaqla()}
            placeholder="Payme"
            disabled={isPending}
            className="h-9 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-[11px] text-muted-foreground">
            Rang
          </label>
          <select
            value={form.tone}
            onChange={(e) => setForm({ ...form, tone: e.target.value })}
            disabled={isPending}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
          >
            {TONE_CODES.map((t) => (
              <option key={t} value={t}>
                {TONE_UI[t].nom}
              </option>
            ))}
          </select>
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.isCash}
          onChange={(e) => setForm({ ...form, isCash: e.target.checked })}
          disabled={isPending}
          className="h-4 w-4 rounded border-border accent-primary"
        />
        Kassaga <b>naqd</b> tushadi
        <span className="text-xs text-muted-foreground">
          — Moliya sverkasi shu belgiga qaraydi
        </span>
      </label>

      <div className="flex gap-2">
        <Button
          size="sm"
          disabled={isPending || !form.name.trim()}
          onClick={onSaqla}
          className="h-8 gap-1.5"
        >
          {isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Check className="h-3.5 w-3.5" />
          )}
          Saqlash
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={isPending}
          onClick={onBekor}
          className="h-8 gap-1.5"
        >
          <X className="h-3.5 w-3.5" />
          Bekor
        </Button>
      </div>
    </div>
  );
}
