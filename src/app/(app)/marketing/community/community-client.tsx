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
  ChevronRight,
  Loader2,
} from "lucide-react";
import { SectionCard, EmptyState, Pill } from "@/components/common/page";
import { Button } from "@/components/ui/button";
import { formatDateTimeUZ } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { KategoriyaQator, MahsulotQator, SorovQator, TafsilotQator } from "@/lib/community/hisobot";
import {
  tuzatKanon,
  tuzatStatus,
  sorovniOchir,
  kanonQidir,
  tahlilIshgaTushir,
  yoqTafsilotAction,
  type KanonOpt,
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
  from,
  to,
}: {
  sorovlar: SorovQator[];
  kategoriyalar: KategoriyaQator[];
  yoqTop: MahsulotQator[];
  kategoriyaOpts: KategoriyaOpt[];
  canEdit: boolean;
  bugun: string;
  from: string;
  to: string;
}) {
  const [tab, setTab] = useState<Tab>("sorovlar");
  const [tahrir, setTahrir] = useState<SorovQator | null>(null);
  const [xabar, setXabar] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const moslanmagan = sorovlar.filter(
    (s) => !s.canonId && (s.kind === "PRODUCT" || s.kind === "PRICE")
  );

  const TABS: { k: Tab; nom: string; n?: number }[] = [
    { k: "sorovlar", nom: "So'rovlar", n: sorovlar.length },
    { k: "kategoriyalar", nom: "Kategoriyalar", n: kategoriyalar.length },
    { k: "yoq", nom: "Berilmagan", n: yoqTop.length },
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

      {tab === "yoq" && <YoqJadval rows={yoqTop} from={from} to={to} canEdit={canEdit} />}

      {tab === "moslanmagan" && (
        <SorovlarJadval
          rows={moslanmagan}
          canEdit={canEdit}
          pending={pending}
          onTahrir={setTahrir}
          onStatus={(id, s) => amal(() => tuzatStatus({ requestId: id, status: s }))}
          onOchir={(id) => amal(() => sorovniOchir(id))}
          bosh="Hammasi kanonga bog'langan"
        />
      )}

      {tahrir && (
        <TahrirOyna
          sorov={tahrir}
          kategoriyalar={kategoriyaOpts}
          onYopish={() => setTahrir(null)}
          onSaqla={(canonId, yangiNom, categoryId) => {
            setTahrir(null);
            amal(() => tuzatKanon({ requestId: tahrir.id, canonId, yangiNom, categoryId }));
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
  if (rows.length === 0) return <EmptyState icon={MessagesSquare} title={bosh ?? "So'rov yo'q"} />;
  return (
    <SectionCard bodyClassName="p-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-border/60 text-[11px] uppercase text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-semibold">Vaqt</th>
              <th className="px-3 py-2 text-left font-semibold">So'ralgan</th>
              <th className="px-3 py-2 text-left font-semibold">Kanon / kategoriya</th>
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
                  <div className="font-medium">
                    {r.productText || <span className="text-muted-foreground">— {r.kind} —</span>}
                  </div>
                  {r.productNorm && (
                    <div className="text-[11px] text-muted-foreground">{r.productNorm}</div>
                  )}
                </td>
                <td className="px-3 py-2">
                  {r.canonName ? (
                    <div className="text-xs font-medium">{r.canonName}</div>
                  ) : (
                    <span className="text-xs text-muted-foreground">bog&apos;lanmagan</span>
                  )}
                  {r.categoryName && (
                    <div className="text-[11px] text-muted-foreground">{r.categoryName}</div>
                  )}
                  {r.matchStatus !== "PENDING" && (
                    <Pill
                      tone={
                        r.matchStatus === "MANUAL"
                          ? "violet"
                          : r.matchStatus === "NONE"
                            ? "muted"
                            : "blue"
                      }
                    >
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
                    <Pill tone={STATUS_TONE[r.status] ?? "muted"}>
                      {STATUS_NOM[r.status] ?? r.status}
                    </Pill>
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
                      title="Kanon/kategoriyani tuzatish"
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
      description="Mahsulot va narx so'rovlari; katalogda bo'lmagan mahsulot ham kategoriyaga biriktiriladi"
    >
      <div className="flex flex-col gap-2">
        {rows.map((r) => (
          <div key={r.categoryId ?? "yoq"} className="flex items-center gap-3 text-sm">
            <div className="w-56 shrink-0 truncate">
              <span className="font-medium">{r.nom}</span>
              {r.parent && (
                <span className="ml-1 text-[11px] text-muted-foreground">{r.parent}</span>
              )}
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

/** "Berilmagan" ro'yxati — qatorni bosganda ochiladigan to'liq tarix bilan. */
function YoqJadval({
  rows,
  from,
  to,
  canEdit,
}: {
  rows: MahsulotQator[];
  from: string;
  to: string;
  canEdit: boolean;
}) {
  const [ochiq, setOchiq] = useState<string | null>(null);
  const [kesh, setKesh] = useState<Record<string, TafsilotQator[]>>({});
  const [yuklanmoqda, setYuklanmoqda] = useState<string | null>(null);

  if (rows.length === 0) return <EmptyState icon={MessagesSquare} title="Ma'lumot yo'q" />;

  const kalit = (r: MahsulotQator) => (r.canonId != null ? `c${r.canonId}` : `n${r.nom}`);

  async function toggle(r: MahsulotQator) {
    const k = kalit(r);
    if (ochiq === k) {
      setOchiq(null);
      return;
    }
    setOchiq(k);
    if (kesh[k] || !canEdit) return; // bir marta yuklanadi
    setYuklanmoqda(k);
    try {
      const res = await yoqTafsilotAction({
        canonId: r.canonId,
        normKey: r.canonId == null ? r.nom : null,
        from,
        to,
      });
      if (res.ok) setKesh((s) => ({ ...s, [k]: res.qatorlar }));
    } finally {
      setYuklanmoqda(null);
    }
  }

  return (
    <SectionCard
      title="So'ralgan, lekin berilmagan"
      description="Assortiment bo'shlig'i. Qatorni bosing — qachon yo'q deyilgani va operator javobi ko'rinadi"
      bodyClassName="p-0"
    >
      <div className="divide-y divide-border/40">
        {rows.map((r) => {
          const k = kalit(r);
          const open = ochiq === k;
          return (
            <div key={k}>
              <button
                onClick={() => toggle(r)}
                className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-muted/30"
              >
                <ChevronRight
                  className={cn("h-4 w-4 shrink-0 text-muted-foreground transition", open && "rotate-90")}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.nom}</span>
                    {!r.yechilgan && (
                      <Pill tone="muted">yechilmagan</Pill>
                    )}
                    {r.yesBor > 0 && <Pill tone="green">keyin bor bo&apos;lgan</Pill>}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.kategoriya ?? "kategoriya aniqlanmagan"}
                    {r.birinchi && (
                      <>
                        {" · "}
                        {r.birinchi === r.oxirgi
                          ? r.birinchi
                          : `${r.birinchi} … ${r.oxirgi}`}{" "}
                        oralig&apos;ida yo&apos;q edi
                      </>
                    )}
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <div className="font-semibold tabular-nums text-destructive">{r.no || "—"}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {r.unanswered > 0 && `${r.unanswered} javobsiz`}
                  </div>
                </div>
                <div className="w-10 shrink-0 text-right font-semibold tabular-nums">{r.jami}</div>
              </button>

              {open && (
                <div className="bg-muted/20 px-4 py-3">
                  {yuklanmoqda === k ? (
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> yuklanmoqda…
                    </div>
                  ) : !canEdit ? (
                    <p className="text-xs text-muted-foreground">Tafsilot faqat adminlarga ko&apos;rinadi.</p>
                  ) : (kesh[k] ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">Tafsilot topilmadi.</p>
                  ) : (
                    <div className="flex flex-col gap-2.5">
                      {(kesh[k] ?? []).map((t) => (
                        <div key={t.id} className="rounded-xl border border-border/60 bg-card p-2.5">
                          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                            <Pill tone={STATUS_TONE[t.status] ?? "muted"}>
                              {STATUS_NOM[t.status] ?? t.status}
                            </Pill>
                            <span>{formatDateTimeUZ(t.askedAt)}</span>
                            {t.branchName && <span>· {t.branchName}</span>}
                            {t.answerMinutes != null && <span>· {t.answerMinutes} daq</span>}
                          </div>
                          <div className="mt-1 text-sm">{t.productText ?? "—"}</div>
                          {t.javoblar.length > 0 ? (
                            <div className="mt-1.5 border-l-2 border-primary/40 pl-2.5">
                              {t.javoblar.map((j) => (
                                <div key={j.messageId} className="text-xs text-muted-foreground">
                                  <span className="font-medium text-foreground">Operator:</span>{" "}
                                  {j.text || (j.mediaKind ? `[${j.mediaKind}]` : "—")}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="mt-1.5 text-xs italic text-amber-600 dark:text-amber-400">
                              javob berilmagan
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </SectionCard>
  );
}

/** Kanon/kategoriya tuzatish oynasi — SYSTEM_ADMIN uchun. */
function TahrirOyna({
  sorov,
  kategoriyalar,
  onYopish,
  onSaqla,
}: {
  sorov: SorovQator;
  kategoriyalar: KategoriyaOpt[];
  onYopish: () => void;
  onSaqla: (canonId: number | null, yangiNom: string | undefined, categoryId: number | null) => void;
}) {
  const [q, setQ] = useState("");
  const [natija, setNatija] = useState<KanonOpt[]>([]);
  const [tanlangan, setTanlangan] = useState<KanonOpt | null>(
    sorov.canonId
      ? {
          id: sorov.canonId,
          name: sorov.canonName ?? "",
          categoryId: sorov.categoryId,
          categoryName: sorov.categoryName,
          hits: 0,
        }
      : null
  );
  const [yangiNom, setYangiNom] = useState("");
  const [catId, setCatId] = useState<number | null>(sorov.categoryId);
  const [qidirmoqda, setQidirmoqda] = useState(false);

  async function qidir(term: string) {
    setQidirmoqda(true);
    try {
      setNatija(await kanonQidir(term));
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
        <h3 className="text-base font-semibold">Kanonik mahsulotga bog&apos;lash</h3>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Mijoz so&apos;ragan: <b className="text-foreground">{sorov.productText}</b>
          {sorov.productNorm && ` (${sorov.productNorm})`}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Tuzatish shu yozilishdagi <b>barcha</b> so&apos;rovlarga qo&apos;llanadi va
          kelajakda ham eslab qolinadi.
        </p>

        <div className="mt-4 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && qidir(q)}
            placeholder="Reyestrdan qidirish (bo'sh qoldirsangiz — eng ko'p uchraganlar)…"
            className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-sm"
          />
          <Button onClick={() => qidir(q)} disabled={qidirmoqda} size="sm">
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
                  setYangiNom("");
                  if (s.categoryId) setCatId(s.categoryId);
                }}
                className={cn(
                  "flex w-full items-center justify-between gap-2 border-b border-border/40 px-3 py-2 text-left text-sm last:border-0 hover:bg-muted",
                  tanlangan?.id === s.id && "bg-primary/10"
                )}
              >
                <span>{s.name}</span>
                <span className="shrink-0 text-[11px] text-muted-foreground">
                  {s.categoryName} {s.hits > 0 && `· ${s.hits}x`}
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-4 rounded-xl bg-muted/50 p-3 text-sm">
          <div>
            Tanlangan kanon:{" "}
            {tanlangan ? (
              <b>{tanlangan.name}</b>
            ) : (
              <span className="text-muted-foreground">yo&apos;q</span>
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

          {!tanlangan && (
            <label className="mt-2 flex items-center gap-2">
              <span className="shrink-0 text-xs text-muted-foreground">Yangi kanon nomi:</span>
              <input
                value={yangiNom}
                onChange={(e) => setYangiNom(e.target.value)}
                placeholder="masalan: Shaftoli"
                className="flex-1 rounded-lg border border-border bg-background px-2 py-1 text-sm"
              />
            </label>
          )}

          <label className="mt-2 flex items-center gap-2">
            <span className="shrink-0 text-xs text-muted-foreground">Subkategoriya:</span>
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

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={onYopish}>
            Bekor qilish
          </Button>
          <Button
            size="sm"
            disabled={!tanlangan && !yangiNom.trim()}
            onClick={() =>
              onSaqla(tanlangan?.id ?? null, tanlangan ? undefined : yangiNom.trim(), catId)
            }
          >
            Saqlash
          </Button>
        </div>
      </div>
    </div>
  );
}
