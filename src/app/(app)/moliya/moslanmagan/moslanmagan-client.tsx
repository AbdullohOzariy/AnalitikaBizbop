"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, EyeOff, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Pill } from "@/components/common/page";
import { formatUZS } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { qatorHalAction, qatorEtiborsizAction } from "./actions";

type Row = {
  id: number;
  reason: string;
  rowNo: number;
  rawDesk: string | null;
  rawArticle: string | null;
  rawDate: string | null;
  rawPerson: string | null;
  rawNote: string | null;
  amountIn: number | null;
  amountOut: number | null;
  accountId: number | null;
};

type Article = { id: number; name: string; groupName: string; section: string };

const SABAB: Record<string, { label: string; hint: string; tone: string }> = {
  desk: { label: "Kassa tanilmadi", hint: "Bu nom hisoblar ro'yxatida yo'q", tone: "bg-destructive/10 text-destructive" },
  article: { label: "Modda tanilmadi", hint: "Bu nom ma'lumotnomada yo'q", tone: "bg-amber-400/15 text-amber-700 dark:text-amber-400" },
  both_directions: {
    label: "Kirim va chiqim birga",
    hint: "Ikkala yozuv ham yaratilgan — faqat tasdiqlang",
    tone: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  },
  date: { label: "Sana o'qilmadi", hint: "Sana formati tanilmadi", tone: "bg-destructive/10 text-destructive" },
};

const SECTION_LABEL: Record<string, string> = {
  OPERATING: "Operatsion",
  INVESTING: "Investitsion",
  FINANCING: "Moliyaviy",
  TECHNICAL: "Texnik",
};

export function MoslanmaganClient({
  rows,
  accounts,
  articles,
  canEdit,
}: {
  rows: Row[];
  accounts: { id: number; name: string }[];
  articles: Article[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [isPending, start] = useTransition();
  const [sabab, setSabab] = useState("");
  const [tanlov, setTanlov] = useState<Record<number, { acc: number; art: number }>>({});

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, okMsg: string) =>
    start(async () => {
      const res = await fn();
      if (res.ok) {
        toast.success(okMsg);
        router.refresh();
      } else toast.error(res.error ?? "Xato.");
    });

  const grouped = useMemo(() => {
    const map = new Map<string, Article[]>();
    for (const a of articles) {
      const k = `${SECTION_LABEL[a.section] ?? a.section} · ${a.groupName}`;
      (map.get(k) ?? map.set(k, []).get(k)!).push(a);
    }
    return [...map];
  }, [articles]);

  const filtered = sabab ? rows.filter((r) => r.reason === sabab) : rows;
  const sabablar = [...new Set(rows.map((r) => r.reason))];

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Filter className="h-3.5 w-3.5" />
            Sabab
          </div>
          <Button
            size="sm"
            variant={sabab === "" ? "default" : "outline"}
            onClick={() => setSabab("")}
            className="h-7 px-2 text-xs"
          >
            Barchasi ({rows.length})
          </Button>
          {sabablar.map((s) => (
            <Button
              key={s}
              size="sm"
              variant={sabab === s ? "default" : "outline"}
              onClick={() => setSabab(s)}
              className="h-7 px-2 text-xs"
            >
              {SABAB[s]?.label ?? s} ({rows.filter((r) => r.reason === s).length})
            </Button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 py-3">
          {filtered.map((r) => {
            const meta = SABAB[r.reason] ?? { label: r.reason, hint: "", tone: "bg-muted" };
            const sel = tanlov[r.id] ?? { acc: r.accountId ?? 0, art: 0 };
            const faqatTasdiq = r.reason === "both_directions";
            const tayyor = faqatTasdiq ? sel.acc > 0 : sel.acc > 0 && sel.art > 0;
            return (
              <div key={r.id} className="space-y-2 rounded-xl border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill className={meta.tone}>{meta.label}</Pill>
                  <span className="text-[11px] text-muted-foreground">{meta.hint}</span>
                  <span className="ml-auto text-[11px] text-muted-foreground">
                    manba qatori #{r.rowNo}
                  </span>
                </div>

                {/* Xom qiymatlar — manbada nima yozilganini ko'rsatamiz */}
                <div className="grid gap-x-4 gap-y-0.5 rounded-lg bg-muted/40 p-2.5 text-[11px] sm:grid-cols-2 lg:grid-cols-3">
                  <Xom label="Sana" value={r.rawDate} />
                  <Xom label="Kassa" value={r.rawDesk} vurgu={r.reason === "desk"} />
                  <Xom label="Modda" value={r.rawArticle} vurgu={r.reason === "article"} />
                  <Xom label="Kim" value={r.rawPerson} />
                  <Xom label="Izoh" value={r.rawNote} />
                  <Xom
                    label="Summa"
                    value={
                      [
                        r.amountIn ? `kirim ${formatUZS(r.amountIn)}` : null,
                        r.amountOut ? `chiqim ${formatUZS(r.amountOut)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || null
                    }
                  />
                </div>

                {canEdit && (
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        Hisob
                      </div>
                      <select
                        value={sel.acc}
                        onChange={(e) =>
                          setTanlov({ ...tanlov, [r.id]: { ...sel, acc: Number(e.target.value) } })
                        }
                        className="h-8 min-w-[150px] rounded-md border border-input bg-background px-2 text-xs"
                      >
                        <option value={0}>— tanlang —</option>
                        {accounts.map((a) => (
                          <option key={a.id} value={a.id}>
                            {a.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    {!faqatTasdiq && (
                      <div>
                        <div className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                          Modda
                        </div>
                        <select
                          value={sel.art}
                          onChange={(e) =>
                            setTanlov({ ...tanlov, [r.id]: { ...sel, art: Number(e.target.value) } })
                          }
                          className="h-8 min-w-[220px] rounded-md border border-input bg-background px-2 text-xs"
                        >
                          <option value={0}>— tanlang —</option>
                          {grouped.map(([g, arts]) => (
                            <optgroup key={g} label={g}>
                              {arts.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </optgroup>
                          ))}
                        </select>
                      </div>
                    )}

                    <Button
                      size="sm"
                      disabled={!tayyor || isPending}
                      onClick={() =>
                        run(
                          () =>
                            qatorHalAction({
                              id: r.id,
                              accountId: sel.acc,
                              articleId: faqatTasdiq ? articles[0]?.id ?? 0 : sel.art,
                              saveAlias: true,
                            }),
                          faqatTasdiq ? "Tasdiqlandi." : "Yozuv yaratildi va alias saqlandi."
                        )
                      }
                      className="h-8 gap-1 px-2 text-xs"
                    >
                      {isPending ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Check className="h-3 w-3" />
                      )}
                      {faqatTasdiq ? "Tasdiqlash" : "Biriktirish"}
                    </Button>

                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={isPending}
                      onClick={() => run(() => qatorEtiborsizAction(r.id), "E'tiborsiz qoldirildi.")}
                      className="h-8 gap-1 px-2 text-xs text-muted-foreground"
                    >
                      <EyeOff className="h-3 w-3" />
                      E&apos;tiborsiz
                    </Button>
                  </div>
                )}
              </div>
            );
          })}

          {rows.length === 300 && (
            <p className="pt-1 text-center text-[11px] text-muted-foreground">
              Oxirgi 300 tasi ko&apos;rsatilmoqda — hal qilgan sari qolganlari chiqadi
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Xom({ label, value, vurgu }: { label: string; value: string | null; vurgu?: boolean }) {
  return (
    <div className="flex gap-1.5">
      <span className="shrink-0 text-muted-foreground">{label}:</span>
      <span className={cn("min-w-0 truncate", vurgu && "font-semibold text-destructive")}>
        {value || "—"}
      </span>
    </div>
  );
}
