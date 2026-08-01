"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Loader2, Search, Check, Merge, X, BookMarked, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { DataTable, type Ustun } from "@/components/common/data-table";
import { Button } from "@/components/ui/button";
import type { KanonQator, ReyestrNatija } from "@/lib/community/kanon";
import {
  kanonReyestrAction,
  kanonTahrirlaAction,
  kanonlarniBirlashtirAction,
  dublikatlarAction,
  type KategoriyaOpt,
} from "./actions";

type Dublikat = { aId: number; aName: string; bId: number; bName: string; sim: number };

/**
 * KANON REYESTRI — "Shaftoli / шафтоли / Persik" kabi yozilishlar bitta nom ostida
 * turadi. Birlashtirish server tomonida ilgaridan bor edi, lekin ko'rish/tahrirlash
 * sahifasi yo'q edi: AI yaratgan kanonni tekshirib bo'lmasdi va noto'g'ri ajralib
 * ketgan ikki nomni faqat DB'dan qo'lda birlashtirish mumkin edi.
 */
export function KanonReyestr({
  canEdit,
  kategoriyalar,
}: {
  canEdit: boolean;
  kategoriyalar: KategoriyaOpt[];
}) {
  const [q, setQ] = useState("");
  const [faqatYangi, setFaqatYangi] = useState(false);
  const [yuklash, setYuklash] = useState(0); // qayta o'qish uchun hisoblagich
  const [holat, setHolat] = useState<{ kalit: string; data?: ReyestrNatija; xato?: string } | null>(null);
  const [dubl, setDubl] = useState<Dublikat[] | null>(null);
  const [pending, startTransition] = useTransition();
  const [tahrir, setTahrir] = useState<number | null>(null);
  const [nomDraft, setNomDraft] = useState("");
  const [katDraft, setKatDraft] = useState<string>("");
  const [birlashManba, setBirlashManba] = useState<KanonQator | null>(null);

  // So'rov kaliti bilan saqlanadi — "yuklanmoqda" RENDER'da derive qilinadi
  // (effekt ichida to'g'ridan-to'g'ri setState shu repoda taqiqlangan).
  const kalit = `${q.trim()}|${faqatYangi}|${yuklash}`;
  useEffect(() => {
    let tirik = true;
    kanonReyestrAction({ q: q.trim() || undefined, faqatYangi }).then((r) => {
      if (!tirik) return;
      setHolat(r.ok ? { kalit, data: r.data } : { kalit, xato: r.error });
    });
    return () => {
      tirik = false;
    };
  }, [kalit, q, faqatYangi]);

  const joriy = holat?.kalit === kalit ? holat : null;
  const data = joriy?.data ?? null;

  const qayta = () => setYuklash((n) => n + 1);

  const saqla = (id: number, patch: { name?: string; categoryId?: number | null; korildi?: boolean }) =>
    startTransition(async () => {
      const r = await kanonTahrirlaAction({ id, ...patch });
      if (r.ok) {
        toast.success("Saqlandi");
        setTahrir(null);
        qayta();
      } else toast.error(r.error);
    });

  const birlashtir = (targetId: number) => {
    if (!birlashManba) return;
    if (birlashManba.id === targetId) {
      toast.error("Kanonni o'ziga birlashtirib bo'lmaydi");
      return;
    }
    startTransition(async () => {
      const r = await kanonlarniBirlashtirAction({ sourceId: birlashManba.id, targetId });
      if (r.ok) {
        toast.success("Birlashtirildi");
        setBirlashManba(null);
        qayta();
      } else toast.error(r.error);
    });
  };

  const dublikatlarniOch = () =>
    startTransition(async () => {
      // `dublikatlarAction` massiv qaytaradi (ok/error o'ramisiz) — server tomonda
      // xato bo'lsa u tashlanadi, shuning uchun bu yerda try/catch.
      try {
        setDubl(await dublikatlarAction());
      } catch {
        toast.error("Dublikatlarni hisoblab bo'lmadi.");
      }
    });

  const ustunlar: Ustun<KanonQator>[] = [
    {
      key: "name",
      nom: "Kanonik nom",
      qiymat: (r) => r.name,
      render: (r) =>
        tahrir === r.id ? (
          <input
            autoFocus
            value={nomDraft}
            onChange={(e) => setNomDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") saqla(r.id, { name: nomDraft.trim() });
              if (e.key === "Escape") setTahrir(null);
            }}
            className="h-7 w-48 rounded border border-border bg-background px-1.5 text-sm outline-none focus:border-primary"
          />
        ) : (
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => {
              setTahrir(r.id);
              setNomDraft(r.name);
            }}
            className={cn("text-left font-medium", canEdit && "hover:underline")}
          >
            {r.name}
            {r.reviewedAt == null && (
              <span className="ml-1.5 rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
                yangi
              </span>
            )}
          </button>
        ),
    },
    {
      key: "synonyms",
      nom: "Yozilishlari",
      qiymat: (r) => r.synonyms.join(", "),
      render: (r) =>
        r.synonyms.length === 0 ? (
          <span className="text-muted-foreground/50">—</span>
        ) : (
          <span className="text-xs text-muted-foreground" title={r.synonyms.join(" · ")}>
            {r.synonyms.slice(0, 3).join(" · ")}
            {r.synonyms.length > 3 && ` +${r.synonyms.length - 3}`}
          </span>
        ),
    },
    {
      key: "kat",
      nom: "Subkategoriya",
      qiymat: (r) => r.categoryName ?? "—",
      filtrlanadi: true,
      render: (r) =>
        tahrir === -r.id ? (
          <select
            autoFocus
            value={katDraft}
            onChange={(e) => saqla(r.id, { categoryId: e.target.value ? Number(e.target.value) : null })}
            onBlur={() => setTahrir(null)}
            className="h-7 max-w-[200px] rounded border border-border bg-background px-1 text-xs"
          >
            <option value="">— yo&apos;q —</option>
            {kategoriyalar.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        ) : (
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => {
              setTahrir(-r.id);
              setKatDraft(r.categoryId ? String(r.categoryId) : "");
            }}
            className={cn("text-xs", canEdit && "hover:underline", !r.categoryName && "text-muted-foreground/50")}
          >
            {r.categoryName ?? "biriktirilmagan"}
          </button>
        ),
    },
    { key: "sorovlar", nom: "So'rovlar", qiymat: (r) => r.sorovlar, ong: true },
    { key: "source", nom: "Manba", qiymat: (r) => r.source, filtrlanadi: true },
    {
      key: "amal",
      nom: "",
      qiymat: () => "",
      saralanmaydi: true,
      render: (r) =>
        !canEdit ? null : birlashManba ? (
          birlashManba.id === r.id ? (
            <span className="text-[11px] text-muted-foreground">manba…</span>
          ) : (
            <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]" onClick={() => birlashtir(r.id)}>
              bunga qo&apos;shish
            </Button>
          )
        ) : (
          <div className="flex items-center gap-1">
            {r.reviewedAt == null && (
              <button
                type="button"
                title="Ko'rib chiqildi deb belgilash"
                onClick={() => saqla(r.id, { korildi: true })}
                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-emerald-600"
              >
                <Check className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              type="button"
              title="Boshqa kanonga birlashtirish"
              onClick={() => setBirlashManba(r)}
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Merge className="h-3.5 w-3.5" />
            </button>
          </div>
        ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nom yoki yozilish…"
            className="h-8 w-56 rounded-lg border border-border bg-background pl-7 pr-2 text-xs outline-none focus:border-primary"
          />
        </div>
        <button
          type="button"
          onClick={() => setFaqatYangi((v) => !v)}
          className={cn(
            "h-8 rounded-lg border px-2.5 text-xs",
            faqatYangi ? "border-primary bg-primary/10 font-medium" : "border-border hover:bg-muted"
          )}
        >
          Faqat yangilar{data ? ` (${data.yangi})` : ""}
        </button>
        <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={dublikatlarniOch} disabled={pending}>
          <AlertTriangle className="h-3.5 w-3.5" /> Ehtimoliy dublikatlar
        </Button>
        {pending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        {data && (
          <span className="ml-auto text-xs text-muted-foreground">
            {data.rows.length} / {data.jami} kanon
          </span>
        )}
      </div>

      {birlashManba && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-primary/40 bg-primary/[0.06] px-3 py-2 text-sm">
          <Merge className="h-4 w-4 text-primary" />
          <span>
            <b>{birlashManba.name}</b> qaysi kanonga qo&apos;shilsin? Ro&apos;yxatdan maqsadni tanlang.
          </span>
          <span className="text-xs text-muted-foreground">
            Manba nomi sinonim bo&apos;lib qoladi — kelajakda o&apos;sha yozilish topiladi.
          </span>
          <button
            type="button"
            onClick={() => setBirlashManba(null)}
            className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {dubl && (
        <div className="rounded-xl border border-border">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold">Ehtimoliy dublikatlar ({dubl.length})</span>
            <button type="button" onClick={() => setDubl(null)} className="rounded p-1 text-muted-foreground hover:bg-muted">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {dubl.length === 0 ? (
            <p className="px-3 py-3 text-xs text-muted-foreground">Yaqin nomli kanon topilmadi.</p>
          ) : (
            <ul className="divide-y divide-border/60">
              {dubl.map((d) => (
                <li key={`${d.aId}:${d.bId}`} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
                  <span className="font-medium">{d.aName}</span>
                  <span className="text-muted-foreground">↔</span>
                  <span className="font-medium">{d.bName}</span>
                  <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
                    {(d.sim * 100).toFixed(0)}% o&apos;xshash
                  </span>
                  {canEdit && (
                    <span className="ml-auto flex gap-1">
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]"
                        onClick={() => startTransition(async () => {
                          const r = await kanonlarniBirlashtirAction({ sourceId: d.bId, targetId: d.aId });
                          if (r.ok) { toast.success("Birlashtirildi"); setDubl((p) => p?.filter((x) => x !== d) ?? null); qayta(); }
                          else toast.error(r.error);
                        })}>
                        ← {d.aName} ga
                      </Button>
                      <Button size="sm" variant="outline" className="h-6 px-2 text-[11px]"
                        onClick={() => startTransition(async () => {
                          const r = await kanonlarniBirlashtirAction({ sourceId: d.aId, targetId: d.bId });
                          if (r.ok) { toast.success("Birlashtirildi"); setDubl((p) => p?.filter((x) => x !== d) ?? null); qayta(); }
                          else toast.error(r.error);
                        })}>
                        {d.bName} ga →
                      </Button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {joriy?.xato ? (
        <p className="py-6 text-center text-sm text-destructive">{joriy.xato}</p>
      ) : !data ? (
        <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Reyestr yuklanmoqda…
        </p>
      ) : (
        <DataTable
          rows={data.rows}
          ustunlar={ustunlar}
          kalit={(r) => r.id}
          bosh="Kanon topilmadi"
          boshIcon={BookMarked}
        />
      )}
    </div>
  );
}
