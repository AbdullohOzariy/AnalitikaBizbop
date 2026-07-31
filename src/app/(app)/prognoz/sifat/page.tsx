import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Gauge, ArrowLeft, Target, ShieldCheck, TrendingDown, Layers } from "lucide-react";
import { auth } from "@/auth";
import { canSeeAnalytics } from "@/lib/roles";
import { PageHeader, StatCard, EmptyState } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { formatDateUZ } from "@/lib/format";
import { cn } from "@/lib/utils";
import { sifatKesim, sifatMeta, sifatTrend, type SifatQator } from "@/lib/prognoz/oqish";

const SINF_NOM: Record<string, string> = {
  SMOOTH: "Barqaror",
  ERRATIC: "Notekis",
  INTERMITTENT: "Siyrak",
  LUMPY: "Siyrak+notekis",
};

const pc = (v: number | null, xona = 1) => (v == null ? "—" : `${(v * 100).toFixed(xona)}%`);
const son = (v: number, xona = 1) => v.toFixed(xona);

/** WAPE past = yaxshi. Rang faqat KATTA farqlarda — mayda tebranish bo'yalmasin. */
function wapeTone(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (v <= 0.3) return "text-emerald-600 dark:text-emerald-400";
  if (v <= 0.6) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function fvaTone(v: number | null): string {
  if (v == null) return "text-muted-foreground";
  if (v <= 0) return "text-rose-600 dark:text-rose-400";
  if (v < 0.02) return "text-amber-600 dark:text-amber-400";
  return "text-emerald-600 dark:text-emerald-400";
}

/** Servis maqsaddan uzoqlashsa belgilanadi (ikkala tomonga ham — ortiqcha ham yomon). */
function servisTone(v: number | null, maqsad: number): string {
  if (v == null) return "text-muted-foreground";
  const farq = Math.abs(v - maqsad);
  if (farq <= 0.02) return "text-emerald-600 dark:text-emerald-400";
  if (farq <= 0.05) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function IshonchBar({ r }: { r: SifatQator }) {
  const jami = r.ishonchli + r.taxminiy + r.ishonchsiz;
  if (jami === 0) return <span className="text-xs text-muted-foreground">—</span>;
  const p = (v: number) => (v / jami) * 100;
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-2 w-24 overflow-hidden rounded-full bg-muted">
        <div className="bg-emerald-500" style={{ width: `${p(r.ishonchli)}%` }} />
        <div className="bg-amber-500" style={{ width: `${p(r.taxminiy)}%` }} />
        <div className="bg-rose-500" style={{ width: `${p(r.ishonchsiz)}%` }} />
      </div>
      <span className="tabular-nums text-[11px] text-muted-foreground">
        {p(r.ishonchli).toFixed(0)}/{p(r.taxminiy).toFixed(0)}/{p(r.ishonchsiz).toFixed(0)}
      </span>
    </div>
  );
}

function SifatJadval({
  sarlavha,
  izoh,
  rows,
  maqsad,
  nomlar,
}: {
  sarlavha: string;
  izoh?: string;
  rows: SifatQator[];
  maqsad: number;
  nomlar?: Record<string, string>;
}) {
  if (rows.length === 0) return null;
  return (
    <Card>
      <CardContent className="p-0">
        <div className="border-b border-border px-4 py-3">
          <h3 className="text-sm font-semibold">{sarlavha}</h3>
          {izoh && <p className="text-xs text-muted-foreground">{izoh}</p>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 text-left font-medium">Kesim</th>
                <th className="px-3 py-2 text-right font-medium">Seriya</th>
                <th className="px-3 py-2 text-right font-medium">Aniqlik</th>
                <th className="px-3 py-2 text-right font-medium">naive</th>
                <th className="px-3 py-2 text-right font-medium">FVA</th>
                <th className="px-3 py-2 text-right font-medium">Xato ishorasi</th>
                <th className="px-3 py-2 text-right font-medium">Servis</th>
                <th className="px-3 py-2 text-right font-medium">Ortiq / kam</th>
                <th className="px-4 py-2 text-left font-medium">Ishonch</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border/50 last:border-0">
                  <td className="px-4 py-2 font-medium">{nomlar?.[r.nom] ?? nomlar?.[r.key] ?? r.nom}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {r.seriya.toLocaleString("uz-UZ")}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums font-medium", wapeTone(r.wape))}>
                    {r.wape == null ? "—" : pc(1 - r.wape)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {r.baseWape == null ? "—" : pc(1 - r.baseWape)}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", fvaTone(r.fva))}>{pc(r.fva)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {r.bias == null ? "—" : `${r.bias > 0 ? "+" : ""}${pc(r.bias)}`}
                  </td>
                  <td className={cn("px-3 py-2 text-right tabular-nums", servisTone(r.servis, maqsad))}>
                    {pc(r.servis)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                    {son(r.ortiqcha)} / {son(r.kamomad)}
                  </td>
                  <td className="px-4 py-2">
                    <IshonchBar r={r} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

export default async function SifatPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeAnalytics(session.user.roles)) redirect("/dashboard");

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Gauge}
        title="Prognoz sifati"
        description="Model o'z bashoratini fakt bilan solishtirib boradi — aniqlik, xato ishorasi va servis darajasi"
      >
        <Link
          href="/prognoz"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-sm hover:bg-muted"
        >
          <ArrowLeft className="h-4 w-4" />
          Prognozga qaytish
        </Link>
      </PageHeader>

      <Suspense fallback={<SifatSkeleton />}>
        <SifatData />
      </Suspense>
    </div>
  );
}

function SifatSkeleton() {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <Skeleton key={i} className="h-[104px] w-full rounded-2xl" />
        ))}
      </div>
      {[...Array(3)].map((_, i) => (
        <Skeleton key={i} className="h-64 w-full rounded-2xl" />
      ))}
    </>
  );
}

async function SifatData() {
  const [meta, jami, sinf, filial, abc, kat, trend] = await Promise.all([
    sifatMeta(),
    sifatKesim("ALL"),
    sifatKesim("SINF"),
    sifatKesim("BRANCH"),
    sifatKesim("ABC"),
    sifatKesim("KAT", 10),
    sifatTrend(10),
  ]);

  const all = jami[0];
  if (!all) {
    return (
      <EmptyState
        icon={Gauge}
        title="Sifat o'lchovi hali yo'q"
        description="4 haftalik prognozning fakti 4 haftadan keyin bilinadi — birinchi baho shundan keyin paydo bo'ladi."
      />
    );
  }
  const maqsad = meta.servis ?? 0.9;

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Aniqlik (1 − WAPE)"
          value={all.wape == null ? "—" : pc(1 - all.wape)}
          icon={Target}
          hint={`naive: ${all.baseWape == null ? "—" : pc(1 - all.baseWape)}`}
        />
        <StatCard
          label="Model qo'shgan qiymat"
          value={pc(all.fva)}
          icon={TrendingDown}
          hint="naive (o'tgan hafta takrori) ga nisbatan"
        />
        <StatCard
          label="Servis darajasi"
          value={pc(all.servis)}
          icon={ShieldCheck}
          hint={`maqsad ${pc(maqsad, 0)} · ortiq ${son(all.ortiqcha)} / kam ${son(all.kamomad)} dona`}
        />
        <StatCard
          label="Baholangan oyna"
          value={`${meta.baholangan} / ${meta.runs}`}
          icon={Layers}
          hint={
            meta.birinchi && meta.oxirgi
              ? `${formatDateUZ(meta.birinchi)} — ${formatDateUZ(meta.oxirgi)}`
              : undefined
          }
        />
      </div>

      <Card>
        <CardContent className="space-y-2 p-4 text-sm">
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Aniqlik</span> = 1 − WAPE (Σ|fakt−prognoz| / Σfakt).
            MAPE ataylab ishlatilmaydi — o'lchov kataklarining ~70%ida fakt nol, MAPE esa nolga bo'linadi.{" "}
            <span className="font-medium text-foreground">Xato ishorasi</span> musbat bo'lsa model tizimli ko'p
            prognoz qilyapti.{" "}
            <span className="font-medium text-foreground">Servis</span> — zaxira tavsiyasi (q90) faktni qoplagan
            oynalar ulushi; <span className="font-medium text-foreground">ortiq/kam</span> esa buning narxi:
            seriya-oynasiga o'rtacha ortiqcha zaxira va yo'qotilgan sotuv (dona).
          </p>
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">Ishonch</span> — har seriyaning oxirgi oynalardagi
            WAPE'i: <span className="text-emerald-600 dark:text-emerald-400">ishonchli</span> ≤30% ·{" "}
            <span className="text-amber-600 dark:text-amber-400">taxminiy</span> 30–60% ·{" "}
            <span className="text-rose-600 dark:text-rose-400">ishonchsiz</span> &gt;60%.
          </p>
          {meta.biasK != null && Math.abs(meta.biasK - 1) > 0.001 && (
            <p className="text-xs text-muted-foreground">
              Joriy kalibratsiya: prognoz {meta.biasK > 1 ? "kamaytirilgan" : "oshirilgan"} (koeffitsient{" "}
              {meta.biasK.toFixed(4)}) — bu tuzatish o'tgan oynalardagi tizimli xatodan o'rganilgan.
            </p>
          )}
        </CardContent>
      </Card>

      <SifatJadval
        sarlavha="Talab sinfi bo'yicha"
        izoh="Sinf talabning shakli: har hafta sotiladimi va miqdor qanchalik tekis"
        rows={sinf}
        maqsad={maqsad}
        nomlar={SINF_NOM}
      />
      <SifatJadval sarlavha="Filial bo'yicha" rows={filial} maqsad={maqsad} />
      <SifatJadval
        sarlavha="ABC bo'yicha"
        izoh="A — savdoning asosiy qismi; u yerdagi kamomad eng qimmatga tushadi"
        rows={abc}
        maqsad={maqsad}
      />
      <SifatJadval
        sarlavha="Oyna bo'yicha (origin sanasi)"
        izoh="Har qator — o'sha haftada berilgan prognozning 4 hafta keyingi fakt bilan solishtiruvi"
        rows={trend}
        maqsad={maqsad}
      />
      <SifatJadval
        sarlavha="Kategoriya (xato hissasi eng katta)"
        rows={kat}
        maqsad={maqsad}
      />
    </>
  );
}
