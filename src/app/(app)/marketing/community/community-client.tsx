"use client";

import { useState, useTransition } from "react";
import {
  MessagesSquare,
  Check,
  X,
  HelpCircle,
  Clock,
  Search,
  RefreshCw,
  Trash2,
  Pencil,
} from "lucide-react";
import { SectionCard, EmptyState, Pill } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { formatDateTimeUZ } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { KategoriyaQator, MahsulotQator, SorovQator } from "@/lib/community/hisobot";
import {
  tuzatMoslik,
  tuzatStatus,
  sorovniOchir,
  skuQidir,
  tahlilIshgaTushir,
  type SkuOpt,
  type KategoriyaOpt,
} from "./actions";

type Tab = "sorovlar" | "kategoriyalar" | "yoq" | "moslanmagan";

const STATUS_TONE: Record<string, "green" | "red" | "amber" | "muted"> = {
  YES: "green",
  NO: "red",
  UNANSWERED: "amber",
  UNCLEAR: "muted",
};
const STATUS_NOM: Record<string, string> = {
  YES: "HA",
  NO: "YO'Q",
  UNANSWERED: "JAVOBSIZ",
  UNCLEAR: "NOANIQ",
};

export function CommunityClient({
  sorovlar,
  kategoriyalar,
  yoqTop,
  kategoriyaOpts,
  canEdit,
  bugun,
}: {
  sorovlar: SorovQator[];
  kategoriyalar: KategoriyaQator[];
  yoqTop: MahsulotQator[];
  kategoriyaOpts: KategoriyaOpt[];
  canEdit: boolean;
  bugun: string;
}) {
  const [tab, setTab] = useState<Tab>("sorovlar");
  const [tahrir, setTahrir] = useState<SorovQator | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const moslanmagan = sorovlar.filter(
    (s) => !s.productId && (s.kind === "PRODUCT" || s.kind === "PRICE")
  );

  const TABS: { k: Tab; nom: string; n?: number }[] = [
    { k: "sorovlar", nom: "So'rovlar", n: sorovlar.length },
    { k: "kategoriyalar", nom: "Kategoriyalar", n: kategoriyalar.length },
    { k: "yoq", nom: "YO'Q deb javob berilgan", n: yoqTop.length },
    { k: "moslanmagan", nom: "Moslanmagan", n: moslanmagan.length },
  ];

  function amal(fn: () => Promise<{ ok: boolean; error?: string; natija?: string }>) {
    start(async () => {
      const r = await fn();
      setXabar(r.ok ? (r.natija ?? "Saqlandi") : (r.error ?? "Xato"));
      setTimeout(() => setXabar(null), 4000);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {TABS.map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={cn(
                "rounded-xl px-3 py-1.5 text-sm font-medium transition",
                tab === t.k
                  ? "bg-primary text-primary-foreground shadow-brand"
                  : "bg-muted text-muted-foreground hover:bg-muted/70"
              )}
            >
              {t.nom}
              {t.n != null && <span className="ml-1.5 opacity-70 tabular-nums">{t.n}</span>}
            </button>
          ))}
        </div>
        {canEdit && (
          <Button
            variant="outline"
            size="sm"
            disabled={pending}
            onClick={() => amal(() => tahlilIshgaTushir({ dayKey: bugun, force: false }))}
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", pending && "animate-spin")} />
            Bugunni tahlil qilish
          </Button>
        )}
      </div>

      {xabar && (
        <div className="rounded-xl border border-border bg-muted/50 px-4 py-2 text-sm">{xabar}</div>
      )}

      {tab === "sorovlar" && (
        <SorovlarJadval
          rows={sorovlar}
          canEdit={canEdit}
          pending={pending}
          onTahrir={setTahrir}
          onStatus={(id, s) => amal(() => tuzatStatus({ requestId: id, status: s }))}
          onOchir={(id) => amal(() => sorovniOchir(id))}
        />
      )}

      {tab === "kategoriyalar" && <KategoriyalarJadval rows={kategoriyalar} />}
      {tab === "yoq" && <YoqJadval rows={yoqTop} />}

      {tab === "moslanmagan" && (
        <SorovlarJadval
          rows={moslanmagan}
          canEdit={canEdit}
          pending={pending}
          onTahrir={setTahrir}
          onStatus={(id, s) => amal(() => tuzatStatus({ requestId: id, status: s }))}
          onOchir={(id) => amal(() => sorovniOchir(id))}
          bosh="Hammasi moslashtirilgan"
        />
      )}

      {tahrir && (
        <TahrirOyna
          sorov={tahrir}
          kategoriyalar={kategoriyaOpts}
          onYopish={() => setTahrir(null)}
          onSaqla={(productId, categoryId, hammasiga) => {
            setTahrir(null);
            amal(() =>
              tuzatMoslik({
                requestId: tahrir.id,
                productId,
                categoryId,
                hammasigaQoll: hammasiga,
              })
            );
          }}
        />
      )}
    </div>
  );
}

function SorovlarJadval({
  rows,
  canEdit,
  pending,
  onTahrir,
  onStatus,
  onOchir,
  bosh,
}: {
  rows: SorovQator[];
  canEdit: boolean;
  pending: boolean;
  onTahrir: (s: SorovQator) => void;
  onStatus: (id: number, s: string) => void;
  onOchir: (id: number) => void;
  bosh?: string;
}) {
  if (rows.length === 0) {
    return <EmptyState icon={MessagesSquare} title={bosh ?? "So'rov yo'q"} />;
  }
  return (
    <SectionCard bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Vaqt</th>
              <th className="px-3 py-2 text-left font-semibold">So'ralgan</th>
              <th className="px-3 py-2 text-left font-semibold">SKU / kategoriya</th>
              <th className="px-3 py-2 text-left font-semibold">Filial</th>
              <th className="px-3 py-2 text-left font-semibold">Holat</th>
              <th className="px-3 py-2 text-right font-semibold">Javob</th>
              {canEdit && <th className="px-3 py-2" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border/40 last:border-0 hover:bg-muted/30">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground">
                  {formatDateTimeUZ(r.askedAt)}
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.productText || <span className="text-muted-foreground">— {r.kind} —</span>}</div>
                  {r.productNorm && (
                    <div className="text-[11px] text-muted-foreground">{r.productNorm}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.productName ? (
                    <div className="text-xs">{r.productName}</div>
                  ) : (
                    <span className="text-xs text-muted-foreground">SKU yo'q</span>
                  )}
                  {r.categoryName && (
                    <div className="text-[11px] text-muted-foreground">{r.categoryName}</div>
                  )}
                  {r.matchStatus !== "PENDING" && (
                    <Pill tone={r.matchStatus === "MANUAL" ? "violet" : r.matchStatus === "NONE" ? "muted" : "blue"}>
                      {r.matchStatus}
                    </Pill>
                  )}
                </td>
                <td className="px-3 py-2 text-xs">{r.branchName ?? "—"}</td>
                <td className="px-3 py-2">
                  {canEdit ? (
                    <div className="flex gap-1">
                      {(["YES", "NO", "UNANSWERED"] as const).map((s) => (
                        <button
                          key={s}
                          disabled={pending}
                          onClick={() => onStatus(r.id, s)}
                          title={STATUS_NOM[s]}
                          className={cn(
                            "rounded-lg border p-1 transition",
                            r.status === s
                              ? s === "YES"
                                ? "border-primary/30 bg-primary/10 text-primary"
                                : s === "NO"
                                  ? "border-destructive/30 bg-destructive/10 text-destructive"
                                  : "border-amber-500/30 bg-amber-500/10 text-amber-600"
                              : "border-transparent text-muted-foreground hover:bg-muted"
                          )}
                        >
                          {s === "YES" ? (
                            <Check className="h-3.5 w-3.5" />
                          ) : s === "NO" ? (
                            <X className="h-3.5 w-3.5" />
                          ) : (
                            <HelpCircle className="h-3.5 w-3.5" />
                          )}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <Pill tone={STATUS_TONE[r.status] ?? "muted"}>{STATUS_NOM[r.status] ?? r.status}</Pill>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-right text-xs text-muted-foreground">
                  {r.answerMinutes != null ? (
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {r.answerMinutes} daq
                    </span>
                  ) : (
                    "—"
                  )}
                  {r.priceQuoted && <div className="tabular-nums">{r.priceQuoted}</div>}
                </td>
                {canEdit && (
                  <td className="whitespace-nowrap px-3 py-2 text-right">
                    <button
                      disabled={pending}
                      onClick={() => onTahrir(r)}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="SKU/kategoriyani tuzatish"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      disabled={pending}
                      onClick={() => {
                        if (confirm("So'rov o'chirilsinmi? (statistikadan chiqadi)")) onOchir(r.id);
                      }}
                      className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      title="O'chirish"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

function KategoriyalarJadval({ rows }: { rows: KategoriyaQator[] }) {
  if (rows.length === 0) return <EmptyState icon={MessagesSquare} title="Ma'lumot yo'q" />;
  const max = Math.max(1, ...rows.map((r) => r.jami));
  return (
    <SectionCard
      title="Kategoriya bo'yicha murojaatlar"
      description="Mahsulot va narx so'rovlari; SKU topilmagan bo'lsa ham kategoriya aniqlanadi"
    >
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.categoryId ?? "yoq"} className="flex items-center gap-3 text-sm">
            <div className="w-56 shrink-0 truncate">
              <span className="font-medium">{r.nom}</span>
              {r.parent && <span className="ml-1 text-[11px] text-muted-foreground">{r.parent}</span>}
            </div>
            <div className="flex h-5 flex-1 overflow-hidden rounded bg-muted">
              <div
                className="h-full bg-primary/70"
                style={{ width: `${(r.yes / max) * 100}%` }}
                title={`HA: ${r.yes}`}
              />
              <div
                className="h-full bg-destructive/60"
                style={{ width: `${(r.no / max) * 100}%` }}
                title={`YO'Q: ${r.no}`}
              />
              <div
                className="h-full bg-muted-foreground/25"
                style={{ width: `${((r.jami - r.yes - r.no) / max) * 100}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right font-semibold tabular-nums">{r.jami}</span>
            <span className="w-24 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
              {r.yes} / {r.no}
            </span>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}

function YoqJadval({ rows }: { rows: MahsulotQator[] }) {
  if (rows.length === 0) return <EmptyState icon={MessagesSquare} title="Ma'lumot yo'q" />;
  return (
    <SectionCard
      title="So'ralgan, lekin berilmagan"
      description="Assortiment bo'shlig'i — eng ko'p YO'Q javobi olgan yoki javobsiz qolgan mahsulotlar"
      bodyClassName="p-0"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-left font-semibold">Mahsulot</th>
              <th className="px-4 py-2 text-left font-semibold">Katalogdagi SKU</th>
              <th className="px-4 py-2 text-right font-semibold">YO'Q</th>
              <th className="px-4 py-2 text-right font-semibold">Javobsiz</th>
              <th className="px-4 py-2 text-right font-semibold">Jami</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.productNorm} className="border-b border-border/40 last:border-0">
                <td className="px-4 py-2 font-medium">{r.productNorm}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {r.productName ?? <span className="text-destructive">katalogda yo'q</span>}
                </td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums text-destructive">
                  {r.no || "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">
                  {r.unanswered || "—"}
                </td>
                <td className="px-4 py-2 text-right font-semibold tabular-nums">{r.jami}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SectionCard>
  );
}

/** SKU/kategoriya tuzatish oynasi — SYSTEM_ADMIN uchun. */
function TahrirOyna({
  sorov,
  kategoriyalar,
  onYopish,
  onSaqla,
}: {
  sorov: SorovQator;
  kategoriyalar: KategoriyaOpt[];
  onYopish: () => void;
  onSaqla: (productId: number | null, categoryId: number | null, hammasiga: boolean) => void;
}) {
  const [q, setQ] = useState(sorov.productNorm ?? "");
  const [natija, setNatija] = useState<SkuOpt[]>([]);
  const [tanlangan, setTanlangan] = useState<SkuOpt | null>(
    sorov.productId ? { id: sorov.productId, name: sorov.productName ?? "", categoryId: sorov.categoryId, categoryName: sorov.categoryName } : null
  );
  const [catId, setCatId] = useState<number | null>(sorov.categoryId);
  const [hammasiga, setHammasiga] = useState(true);
  const [qidirmoqda, setQidirmoqda] = useState(false);

  async function qidir() {
    setQidirmoqda(true);
    try {
      setNatija(await skuQidir(q));
    } finally {
      setQidirmoqda(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 pt-16"
      onClick={onYopish}
    >
      <div
        className="w-full max-w-2xl rounded-2xl border border-border bg-card p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold">Moslikni tuzatish</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Mijoz so'ragan: <b className="text-foreground">{sorov.productText}</b>
          {sorov.productNorm && ` (${sorov.productNorm})`}
        </p>

        <div className="mt-4 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && qidir()}
            placeholder="SKU nomi bo'yicha qidirish…"
            className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
          <Button onClick={qidir} disabled={qidirmoqda} size="sm">
            <Search className="mr-1.5 h-3.5 w-3.5" />
            Qidirish
          </Button>
        </div>

        {natija.length > 0 && (
          <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-border">
            {natija.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setTanlangan(s);
                  if (s.categoryId) setCatId(s.categoryId);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 border-b border-border/40 px-3 py-2 text-left text-sm last:border-0 hover:bg-muted",
                  tanlangan?.id === s.id && "bg-primary/10"
                )}
              >
                <span>{s.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">{s.categoryName}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-xl bg-muted/50 p-3 text-sm">
          <div>
            Tanlangan SKU:{" "}
            {tanlangan ? (
              <b>{tanlangan.name}</b>
            ) : (
              <span className="text-muted-foreground">yo&apos;q (katalogda mavjud emas)</span>
            )}
            {tanlangan && (
              <button
                onClick={() => setTanlangan(null)}
                className="ml-2 text-xs text-destructive hover:underline"
              >
                bekor qilish
              </button>
            )}
          </div>
          <label className="mt-2 flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Subkategoriya:</span>
            <select
              value={catId ?? ""}
              onChange={(e) => setCatId(e.target.value ? Number(e.target.value) : null)}
              className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm"
            >
              <option value="">— aniqlanmagan —</option>
              {kategoriyalar.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.parent} → {k.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={hammasiga}
            onChange={(e) => setHammasiga(e.target.checked)}
            className="h-4 w-4"
          />
          Shu nomdagi barcha so&apos;rovlarga qo&apos;llansin (kelajakdagilarga ham)
        </label>

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onYopish}>
            Bekor qilish
          </Button>
          <Button size="sm" onClick={() => onSaqla(tanlangan?.id ?? null, catId, hammasiga)}>
            Saqlash
          </Button>
        </div>
      </div>
    </div>
  );
}
