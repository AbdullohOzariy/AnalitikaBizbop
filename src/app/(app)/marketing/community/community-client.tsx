"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
  Loader2,
} from "lucide-react";
import { EmptyState, Pill } from "@/components/common/page";
import { DataTable, type Ustun } from "@/components/common/data-table";
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
const KIND_NOM: Record<string, string> = {
  PRODUCT: "Mahsulot",
  PRICE: "Narx",
  PROMO: "Aksiya",
  COMPLAINT: "Shikoyat",
  RETURN: "Qaytarish",
  SERVICE: "Xizmat",
  OTHER: "Boshqa",
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
  branchId,
  filiallar,
}: {
  sorovlar: SorovQator[];
  kategoriyalar: KategoriyaQator[];
  yoqTop: MahsulotQator[];
  kategoriyaOpts: KategoriyaOpt[];
  canEdit: boolean;
  bugun: string;
  from: string;
  to: string;
  branchId: number | null;
  filiallar: { id: number; name: string }[];
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

  const sorovUstunlari = sorovUstunlar({
    canEdit,
    pending,
    onTahrir: setTahrir,
    onStatus: (id, s) => amal(() => tuzatStatus({ requestId: id, status: s })),
    onOchir: (id) => amal(() => sorovniOchir(id)),
  });

  return (
    <div className="flex flex-col gap-4">
      <FilialFiltr filiallar={filiallar} joriy={branchId} />

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

      <p className="text-xs text-muted-foreground">
        Ustun sarlavhasini bosing — saralanadi; yonidagi belgi orqali qiymat bo&apos;yicha
        filtrlanadi.
      </p>

      {xabar && (
        <div className="rounded-xl border border-border bg-muted/50 px-4 py-2 text-sm">{xabar}</div>
      )}

      {tab === "sorovlar" && (
        <DataTable
          rows={sorovlar}
          ustunlar={sorovUstunlari}
          kalit={(r) => r.id}
          bosh="So'rov yo'q"
          boshIcon={MessagesSquare}
        />
      )}

      {tab === "kategoriyalar" && <KategoriyalarJadval rows={kategoriyalar} />}

      {tab === "yoq" && (
        <YoqJadval rows={yoqTop} from={from} to={to} branchId={branchId} canEdit={canEdit} />
      )}

      {tab === "moslanmagan" && (
        <DataTable
          rows={moslanmagan}
          ustunlar={sorovUstunlari}
          kalit={(r) => r.id}
          bosh="Hammasi kanonga bog'langan"
          boshIcon={MessagesSquare}
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

/** So'rovlar jadvali ustunlari — "So'rovlar" va "Moslanmagan" tablari uchun bir xil. */
function sorovUstunlar(opts: {
  canEdit: boolean;
  pending: boolean;
  onTahrir: (s: SorovQator) => void;
  onStatus: (id: number, s: string) => void;
  onOchir: (id: number) => void;
}): Ustun<SorovQator>[] {
  const { canEdit, pending, onTahrir, onStatus, onOchir } = opts;

  const ustunlar: Ustun<SorovQator>[] = [
    {
      key: "vaqt",
      nom: "Vaqt",
      qiymat: (r) => new Date(r.askedAt).getTime(),
      render: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {formatDateTimeUZ(r.askedAt)}
        </span>
      ),
    },
    {
      key: "sorov",
      nom: "So'ralgan",
      qiymat: (r) => r.productText ?? r.kind,
      render: (r) => (
        <div>
          <div className="font-medium">
            {r.productText || <span className="text-muted-foreground">—</span>}
          </div>
          {r.productNorm && <div className="text-[11px] text-muted-foreground">{r.productNorm}</div>}
        </div>
      ),
    },
    {
      key: "tur",
      nom: "Tur",
      qiymat: (r) => r.kind,
      filtrlanadi: true,
      yorliq: (v) => KIND_NOM[v] ?? v,
      render: (r) => <span className="text-xs">{KIND_NOM[r.kind] ?? r.kind}</span>,
    },
    {
      key: "kanon",
      nom: "Kanon",
      qiymat: (r) => r.canonName,
      filtrlanadi: true,
      render: (r) =>
        r.canonName ? (
          <span className="text-xs font-medium">{r.canonName}</span>
        ) : (
          <span className="text-xs text-muted-foreground">bog&apos;lanmagan</span>
        ),
    },
    {
      key: "kategoriya",
      nom: "Kategoriya",
      qiymat: (r) => r.categoryName,
      filtrlanadi: true,
      render: (r) => <span className="text-xs text-muted-foreground">{r.categoryName ?? "—"}</span>,
    },
    {
      key: "filial",
      nom: "Filial",
      qiymat: (r) => r.branchName,
      filtrlanadi: true,
      render: (r) => <span className="text-xs">{r.branchName ?? "—"}</span>,
    },
    {
      key: "moslik",
      nom: "Moslik",
      qiymat: (r) => r.matchStatus,
      filtrlanadi: true,
      render: (r) =>
        r.matchStatus === "PENDING" ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <Pill
            tone={
              r.matchStatus === "MANUAL" ? "violet" : r.matchStatus === "NONE" ? "muted" : "blue"
            }
          >
            {r.matchStatus}
          </Pill>
        ),
    },
    {
      key: "holat",
      nom: "Holat",
      qiymat: (r) => r.status,
      filtrlanadi: true,
      yorliq: (v) => STATUS_NOM[v] ?? v,
      render: (r) =>
        canEdit ? (
          <div className="flex gap-1">
            {(["YES", "NO", "UNANSWERED"] as const).map((s) => (
              <button
                key={s}
                disabled={pending}
                onClick={(e) => {
                  e.stopPropagation();
                  onStatus(r.id, s);
                }}
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
        ),
    },
    {
      key: "javob",
      nom: "Javob",
      ong: true,
      qiymat: (r) => r.answerMinutes,
      render: (r) => (
        <div className="whitespace-nowrap text-xs text-muted-foreground">
          {r.answerMinutes != null ? (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {r.answerMinutes} daq
            </span>
          ) : (
            "—"
          )}
          {r.priceQuoted && <div className="tabular-nums">{r.priceQuoted}</div>}
        </div>
      ),
    },
  ];

  if (canEdit) {
    ustunlar.push({
      key: "amal",
      nom: "",
      ong: true,
      saralanmaydi: true,
      qiymat: () => null,
      render: (r) => (
        <div className="whitespace-nowrap">
          <button
            disabled={pending}
            onClick={(e) => {
              e.stopPropagation();
              onTahrir(r);
            }}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            title="Kanon/kategoriyani tuzatish"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            disabled={pending}
            onClick={(e) => {
              e.stopPropagation();
              if (confirm("So'rov o'chirilsinmi? (statistikadan chiqadi)")) onOchir(r.id);
            }}
            className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
            title="O'chirish"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      ),
    });
  }

  return ustunlar;
}

/**
 * Filial kesimi. Mijoz filial aytmasa so'rov ASOSIY filialga (Mega Center) yoziladi,
 * shuning uchun filtr "qaysi filialda nima yetishmayapti" savoliga javob beradi.
 */
function FilialFiltr({
  filiallar,
  joriy,
}: {
  filiallar: { id: number; name: string }[];
  joriy: number | null;
}) {
  const router = useRouter();
  const sp = useSearchParams();

  function tanla(id: number | null) {
    const q = new URLSearchParams(sp.toString());
    if (id == null) q.delete("branch");
    else q.set("branch", String(id));
    router.push(`?${q.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Filial
      </span>
      <button
        onClick={() => tanla(null)}
        className={cn(
          "rounded-lg px-2.5 py-1 text-xs font-medium transition",
          joriy == null
            ? "bg-foreground text-background"
            : "bg-muted text-muted-foreground hover:bg-muted/70"
        )}
      >
        Barchasi
      </button>
      {filiallar.map((b) => (
        <button
          key={b.id}
          onClick={() => tanla(b.id)}
          className={cn(
            "rounded-lg px-2.5 py-1 text-xs font-medium transition",
            joriy === b.id
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground hover:bg-muted/70"
          )}
        >
          {b.name}
        </button>
      ))}
    </div>
  );
}

function KategoriyalarJadval({ rows }: { rows: KategoriyaQator[] }) {
  if (rows.length === 0) return <EmptyState icon={MessagesSquare} title="Ma'lumot yo'q" />;
  const max = Math.max(1, ...rows.map((r) => r.jami));

  const ustunlar: Ustun<KategoriyaQator>[] = [
    {
      key: "kategoriya",
      nom: "Subkategoriya",
      qiymat: (r) => r.nom,
      filtrlanadi: true,
      render: (r) => <span className="font-medium">{r.nom}</span>,
    },
    {
      key: "bolim",
      nom: "Bo'lim",
      qiymat: (r) => r.parent || null,
      filtrlanadi: true,
      render: (r) => <span className="text-xs text-muted-foreground">{r.parent || "—"}</span>,
    },
    {
      key: "ulush",
      nom: "Ulush",
      saralanmaydi: true,
      qiymat: (r) => r.jami,
      render: (r) => (
        <div className="flex h-4 w-40 overflow-hidden rounded bg-muted">
          <div className="h-full bg-primary/70" style={{ width: `${(r.yes / max) * 100}%` }} />
          <div className="h-full bg-destructive/60" style={{ width: `${(r.no / max) * 100}%` }} />
          <div
            className="h-full bg-muted-foreground/25"
            style={{ width: `${((r.jami - r.yes - r.no) / max) * 100}%` }}
          />
        </div>
      ),
    },
    {
      key: "yes",
      nom: "Bor",
      ong: true,
      qiymat: (r) => r.yes,
      render: (r) => <span className="tabular-nums text-primary">{r.yes || "—"}</span>,
    },
    {
      key: "no",
      nom: "Yo'q",
      ong: true,
      qiymat: (r) => r.no,
      render: (r) => <span className="tabular-nums text-destructive">{r.no || "—"}</span>,
    },
    {
      key: "jami",
      nom: "Jami",
      ong: true,
      qiymat: (r) => r.jami,
      render: (r) => <span className="font-semibold tabular-nums">{r.jami}</span>,
    },
  ];

  return (
    <DataTable
      rows={rows}
      ustunlar={ustunlar}
      kalit={(r) => r.categoryId ?? "yoq"}
      bosh="Ma'lumot yo'q"
      boshIcon={MessagesSquare}
    />
  );
}

/** "Berilmagan" ro'yxati — qatorni bosganda to'liq tarix ochiladi. */
function YoqJadval({
  rows,
  from,
  to,
  branchId,
  canEdit,
}: {
  rows: MahsulotQator[];
  from: string;
  to: string;
  branchId: number | null;
  canEdit: boolean;
}) {
  const [kesh, setKesh] = useState<Record<string, TafsilotQator[]>>({});
  const [yuklanmoqda, setYuklanmoqda] = useState<string | null>(null);

  const kalit = (r: MahsulotQator) => (r.canonId != null ? `c${r.canonId}` : `n${r.nom}`);

  async function yukla(r: MahsulotQator) {
    const k = kalit(r);
    if (kesh[k] || !canEdit) return;
    setYuklanmoqda(k);
    try {
      const res = await yoqTafsilotAction({
        canonId: r.canonId,
        normKey: r.canonId == null ? r.nom : null,
        from,
        to,
        branchId,
      });
      if (res.ok) setKesh((s) => ({ ...s, [k]: res.qatorlar }));
    } finally {
      setYuklanmoqda(null);
    }
  }

  const ustunlar: Ustun<MahsulotQator>[] = [
    {
      key: "mahsulot",
      nom: "Mahsulot",
      qiymat: (r) => r.nom,
      render: (r) => (
        <div className="flex items-center gap-2">
          <span className="font-medium">{r.nom}</span>
          {!r.yechilgan && <Pill tone="muted">yechilmagan</Pill>}
          {r.yesBor > 0 && <Pill tone="green">keyin bor bo&apos;lgan</Pill>}
        </div>
      ),
    },
    {
      key: "kategoriya",
      nom: "Kategoriya",
      qiymat: (r) => r.kategoriya,
      filtrlanadi: true,
      render: (r) => (
        <span className="text-xs text-muted-foreground">{r.kategoriya ?? "aniqlanmagan"}</span>
      ),
    },
    {
      key: "davr",
      nom: "Yo'q bo'lgan davr",
      qiymat: (r) => r.birinchi,
      render: (r) => (
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {r.birinchi === r.oxirgi ? r.birinchi : `${r.birinchi} … ${r.oxirgi}`}
        </span>
      ),
    },
    {
      key: "no",
      nom: "Yo'q",
      ong: true,
      qiymat: (r) => r.no,
      render: (r) => (
        <span className="font-semibold tabular-nums text-destructive">{r.no || "—"}</span>
      ),
    },
    {
      key: "javobsiz",
      nom: "Javobsiz",
      ong: true,
      qiymat: (r) => r.unanswered,
      render: (r) => (
        <span className="tabular-nums text-muted-foreground">{r.unanswered || "—"}</span>
      ),
    },
    {
      key: "jami",
      nom: "Jami",
      ong: true,
      qiymat: (r) => r.jami,
      render: (r) => <span className="font-semibold tabular-nums">{r.jami}</span>,
    },
  ];

  return (
    <DataTable
      rows={rows}
      ustunlar={ustunlar}
      kalit={kalit}
      bosh="Ma'lumot yo'q"
      boshIcon={MessagesSquare}
      onOpen={yukla}
      expand={(r) => {
        const k = kalit(r);
        if (yuklanmoqda === k) {
          return (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> yuklanmoqda…
            </div>
          );
        }
        if (!canEdit) {
          return (
            <p className="text-xs text-muted-foreground">
              Tafsilot faqat adminlarga ko&apos;rinadi.
            </p>
          );
        }
        const qatorlar = kesh[k] ?? [];
        if (qatorlar.length === 0) {
          return <p className="text-xs text-muted-foreground">Tafsilot topilmadi.</p>;
        }
        return (
          <div className="flex flex-col gap-2.5">
            {qatorlar.map((t) => (
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
        );
      }}
    />
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
          Tuzatish shu yozilishdagi <b>barcha</b> so&apos;rovlarga qo&apos;llanadi va kelajakda ham
          eslab qolinadi.
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
            {tanlangan ? <b>{tanlangan.name}</b> : <span className="text-muted-foreground">yo&apos;q</span>}
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
            onClick={() => onSaqla(tanlangan?.id ?? null, tanlangan ? undefined : yangiNom.trim(), catId)}
          >
            Saqlash
          </Button>
        </div>
      </div>
    </div>
  );
}
