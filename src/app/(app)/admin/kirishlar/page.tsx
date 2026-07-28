/**
 * Tizim → Kirishlar. Platformaga va botlarga kirib-chiqishlar statistikasi.
 * FAQAT SYSTEM_ADMIN (gvardiya shu sahifada — sidebar'da yashirish yetarli emas).
 *
 * Ma'lumot manbai: AccessSession (faollik oynasi) + AccessEvent (kirish momenti).
 * Yozish qatlami — src/lib/access-log/log.ts.
 *
 * Grafik kutubxona ATAYLAB ishlatilmadi (logistika/statistika naqshi): jadval va
 * oddiy ustunlar bu hajmdagi ma'lumot uchun yetarli va halolroq.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { LogIn, Users, Timer, ShieldAlert, Activity, Clock } from "lucide-react";
import { auth } from "@/auth";
import { isSystemAdmin } from "@/lib/roles";
import { isoDay, nowTashkent, parseDateParam } from "@/lib/date";
import { formatDateTimeUZ, formatDateRangeUZ, formatNumber } from "@/lib/format";
import { EmptyState, PageHeader, Pill, SectionCard, StatCard } from "@/components/common/page";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { AccessSurface } from "@/generated/prisma/enums";
import {
  aktorlar,
  kirishKpi,
  kunlikQator,
  soatlikProfil,
  xavfsizlikLenta,
  yuzaKesim,
} from "@/lib/access-log/query";

export const dynamic = "force-dynamic";

/** Aktorlar jadvalining chegarasi — sahifa kesilganini AYTISHI uchun shu yerda. */
const AKTOR_LIMIT = 200;

// ── Yorliqlar ────────────────────────────────────────────────────────────────

const SURFACES = [
  "WEB",
  "BOT_SPISANIYA",
  "BOT_SVERKA",
  "BOT_LOGISTIKA",
  "BOT_SOTUV",
  "BOT_KIRISH",
] as const;

const SURFACE_LABEL: Record<AccessSurface, string> = {
  WEB: "Platforma",
  BOT_SPISANIYA: "Spisaniya bot",
  BOT_SVERKA: "Sverka bot",
  BOT_LOGISTIKA: "Logistika bot",
  BOT_SOTUV: "Sotuv bot",
  BOT_KIRISH: "Noma'lum bot",
};

const SURFACE_TONE: Record<AccessSurface, "green" | "blue" | "violet" | "orange" | "amber" | "muted"> = {
  WEB: "green",
  BOT_SPISANIYA: "blue",
  BOT_SVERKA: "violet",
  BOT_LOGISTIKA: "orange",
  BOT_SOTUV: "amber",
  BOT_KIRISH: "muted",
};

const TYPE_LABEL: Record<string, string> = {
  LOGIN_FAIL: "Kira olmadi",
  DENIED: "Rad etildi",
  BLOCKED: "Bloklandi",
};

const TYPE_TONE: Record<string, "red" | "orange" | "amber"> = {
  LOGIN_FAIL: "red",
  DENIED: "orange",
  BLOCKED: "amber",
};

const REASON_LABEL: Record<string, string> = {
  BAD_INPUT: "Forma noto'g'ri",
  NO_USER: "Login topilmadi",
  BAD_PASSWORD: "Parol xato",
  BAD_SIGNATURE: "Telegram imzosi yaroqsiz",
  NOT_WHITELISTED: "Ro'yxatda yo'q",
  RATE_LIMIT: "Juda ko'p urinish",
};

/** Daqiqa → "2 soat 15 daq" / "45 daq" / "—". */
function davomiylik(min: number | null): string {
  if (min == null || !Number.isFinite(min) || min <= 0) return "—";
  const m = Math.round(min);
  if (m < 60) return `${m} daq`;
  const h = Math.floor(m / 60);
  const q = m % 60;
  return q === 0 ? `${h} soat` : `${h} soat ${q} daq`;
}

/** "YYYY-MM-DD" → "12.06" (ustun tagidagi qisqa yorliq). */
function kunQisqa(s: string): string {
  return `${s.slice(8, 10)}.${s.slice(5, 7)}`;
}

// ── Sahifa ───────────────────────────────────────────────────────────────────

export default async function KirishlarPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!isSystemAdmin(session.user.roles)) redirect("/dashboard");

  const sp = await searchParams;

  // Davr — default oxirgi 30 kun (Toshkent).
  const endD = parseDateParam(sp.end) ?? nowTashkent();
  const startD = parseDateParam(sp.start) ?? new Date(nowTashkent().getTime() - 29 * 86_400_000);
  const [xomStart, xomEnd] = startD <= endD ? [startD, endD] : [endD, startD];

  // CHEKLOV: oraliq 1 yildan oshmasin. Usiz "1900-01-01" kabi sana kiritilsa
  // generate_series o'n minglab qator yasab, quyidagi Math.max(...spread) esa
  // RangeError bilan sahifani yiqitardi.
  const MAX_KUN = 366;
  const start = isoDay(
    xomEnd.getTime() - xomStart.getTime() > (MAX_KUN - 1) * 86_400_000
      ? new Date(xomEnd.getTime() - (MAX_KUN - 1) * 86_400_000)
      : xomStart
  );
  const end = isoDay(xomEnd);
  const davr = { start, end };

  const surface = (SURFACES as readonly string[]).includes(sp.surface ?? "")
    ? (sp.surface as AccessSurface)
    : undefined;

  const [kpi, kunlar, yuzalar, soatlar, aktorRoyxat, lenta] = await Promise.all([
    kirishKpi(davr, surface),
    kunlikQator(davr, surface),
    yuzaKesim(davr),
    soatlikProfil(davr, surface),
    aktorlar(davr, surface, AKTOR_LIMIT),
    xavfsizlikLenta(davr, 100),
  ]);

  const maxKun = Math.max(1, ...kunlar.map((k) => k.sessions));
  const maxSoat = Math.max(1, ...soatlar.map((s) => s.n));
  const bosh = kpi.sessions === 0 && kpi.fails === 0;

  /** Filtr havolasi — davrni saqlab, faqat yuzani almashtiradi. */
  const yuzaHref = (s?: string) =>
    `/admin/kirishlar?start=${start}&end=${end}${s ? `&surface=${s}` : ""}`;

  return (
    <div className="space-y-5">
      <PageHeader
        icon={LogIn}
        title="Kirishlar"
        description={`Platforma va botlarga kirib-chiqishlar — ${formatDateRangeUZ(start, end)}`}
      />

      {/* ── Filtr ── */}
      <SectionCard bodyClassName="p-4">
        <form method="GET" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label htmlFor="start" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Boshlanishi
            </label>
            <input
              type="date"
              id="start"
              name="start"
              defaultValue={start}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="end" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tugashi
            </label>
            <input
              type="date"
              id="end"
              name="end"
              defaultValue={end}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="surface" className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Yuza
            </label>
            <select
              id="surface"
              name="surface"
              defaultValue={surface ?? ""}
              className="h-9 rounded-lg border border-border bg-background px-3 text-sm"
            >
              <option value="">Hammasi</option>
              {SURFACES.map((s) => (
                <option key={s} value={s}>
                  {SURFACE_LABEL[s]}
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            className="bg-brand-gradient shadow-brand h-9 rounded-lg px-4 text-sm font-medium text-primary-foreground"
          >
            Ko'rsatish
          </button>
          <div className="ml-auto flex flex-wrap gap-1.5">
            {[
              { n: 7, l: "7 kun" },
              { n: 30, l: "30 kun" },
              { n: 90, l: "90 kun" },
            ].map(({ n, l }) => {
              const s = isoDay(new Date(nowTashkent().getTime() - (n - 1) * 86_400_000));
              const e = isoDay(nowTashkent());
              const faol = start === s && end === e;
              return (
                <Link
                  key={n}
                  href={`/admin/kirishlar?start=${s}&end=${e}${surface ? `&surface=${surface}` : ""}`}
                  className={cn(
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
                    faol
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                  )}
                >
                  {l}
                </Link>
              );
            })}
          </div>
        </form>
      </SectionCard>

      {bosh ? (
        <EmptyState
          icon={ShieldAlert}
          title="Bu davrda kirish yozuvi yo'q"
          description="Jurnal shu bo'lim ishga tushgandan keyingi kirishlarni yozadi — oldingi davr uchun ma'lumot mavjud emas."
        />
      ) : (
        <>
          {/* ── KPI ── */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Kirishlar (sessiya)"
              value={formatNumber(kpi.sessions)}
              icon={LogIn}
              tone="green"
              hint="30 daqiqa jimlikdan keyin yangi sessiya sanaladi"
            />
            <StatCard
              label="Noyob foydalanuvchi"
              value={formatNumber(kpi.actors)}
              icon={Users}
              tone="blue"
              hint="davr ichida kamida bir marta kirgan"
            />
            <StatCard
              label="O'rtacha davomiylik"
              value={davomiylik(kpi.avgMin)}
              icon={Timer}
              tone="violet"
              hint={`jami faol vaqt: ${davomiylik(kpi.totalMin)}`}
            />
            <StatCard
              label="Muvaffaqiyatsiz urinish"
              value={formatNumber(kpi.fails)}
              icon={ShieldAlert}
              tone="red"
              hint="parol xato · ruxsat yo'q · bloklangan"
            />
          </div>

          {/* ── Kunlik dinamika ── */}
          <SectionCard
            title="Kunlik dinamika"
            description="ustun balandligi — o'sha kundagi kirishlar soni"
          >
            <div className="flex items-end gap-[3px] overflow-x-auto pb-1" style={{ height: 140 }}>
              {kunlar.map((k) => (
                <div key={k.kun} className="flex min-w-[10px] flex-1 flex-col items-center gap-1">
                  <div
                    title={`${k.kun}: ${k.sessions} kirish · ${k.actors} foydalanuvchi${k.fails ? ` · ${k.fails} muvaffaqiyatsiz` : ""}`}
                    className={cn(
                      "w-full rounded-t transition-colors",
                      k.fails > 0 ? "bg-destructive/70" : "bg-primary/70"
                    )}
                    style={{ height: Math.max(2, Math.round((k.sessions / maxKun) * 110)) }}
                  />
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex justify-between text-[10px] text-muted-foreground">
              <span>{kunQisqa(start)}</span>
              <span className="tabular-nums">eng ko'pi: {maxKun}</span>
              <span>{kunQisqa(end)}</span>
            </div>
          </SectionCard>

          {/* ── Yuzalar kesimi ── */}
          <SectionCard
            title="Yuzalar bo'yicha"
            description="platforma va har bir bot alohida"
            bodyClassName="p-0"
          >
            {yuzalar.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={Activity} title="Ma'lumot yo'q" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Yuza</TableHead>
                      <TableHead className="text-right">Kirishlar</TableHead>
                      <TableHead className="text-right">Foydalanuvchi</TableHead>
                      <TableHead className="text-right">So'rovlar</TableHead>
                      <TableHead className="text-right">O'rt. davomiylik</TableHead>
                      <TableHead className="text-right">Oxirgi faollik</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {yuzalar.map((y) => (
                      <TableRow key={y.surface}>
                        <TableCell>
                          <Link href={yuzaHref(y.surface)} className="hover:underline">
                            <Pill tone={SURFACE_TONE[y.surface]}>{SURFACE_LABEL[y.surface]}</Pill>
                          </Link>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{formatNumber(y.sessions)}</TableCell>
                        <TableCell className="text-right tabular-nums">{formatNumber(y.actors)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(y.hits)}</TableCell>
                        <TableCell className="text-right tabular-nums">{davomiylik(y.avgMin)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {y.lastAt ? formatDateTimeUZ(y.lastAt) : "—"}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>

          {/* ── Soatlik profil ── */}
          <SectionCard
            title="Kirish soati"
            description="sessiya qaysi soatda boshlangan (Toshkent vaqti)"
          >
            <div className="flex items-end gap-1" style={{ height: 110 }}>
              {soatlar.map((s) => (
                <div key={s.soat} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    title={`${String(s.soat).padStart(2, "0")}:00 — ${s.n} kirish`}
                    className="w-full rounded-t bg-blue-500/60"
                    style={{ height: Math.max(2, Math.round((s.n / maxSoat) * 80)) }}
                  />
                  <span className="text-[9px] tabular-nums text-muted-foreground">
                    {s.soat % 3 === 0 ? String(s.soat).padStart(2, "0") : ""}
                  </span>
                </div>
              ))}
            </div>
          </SectionCard>

          {/* ── Foydalanuvchilar ── */}
          <SectionCard
            title="Foydalanuvchilar"
            description={
              aktorRoyxat.length >= AKTOR_LIMIT
                ? `Eng so'nggi ${AKTOR_LIMIT} ta yozuv (kesilgan) — oxirgi faollik bo'yicha`
                : `${aktorRoyxat.length} ta yozuv — oxirgi faollik bo'yicha`
            }
            bodyClassName="p-0"
          >
            {aktorRoyxat.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={Users} title="Bu davrda kirgan foydalanuvchi yo'q" />
              </div>
            ) : (
              <div className="max-h-[520px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Kim</TableHead>
                      <TableHead>Yuza</TableHead>
                      <TableHead className="text-right">Kirishlar</TableHead>
                      <TableHead className="text-right">So'rovlar</TableHead>
                      <TableHead className="text-right">Jami vaqt</TableHead>
                      <TableHead className="text-right">Oxirgi faollik</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {aktorRoyxat.map((a) => (
                      <TableRow key={`${a.actorKey}|${a.surface}`}>
                        <TableCell>
                          <div className="font-medium">{a.actorName || "Noma'lum"}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {a.userId != null ? `ID ${a.userId}` : a.tgUserId ? `TG ${a.tgUserId}` : a.actorKey}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Pill tone={SURFACE_TONE[a.surface]}>{SURFACE_LABEL[a.surface]}</Pill>
                        </TableCell>
                        <TableCell className="text-right tabular-nums font-medium">{formatNumber(a.sessions)}</TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">{formatNumber(a.hits)}</TableCell>
                        <TableCell className="text-right tabular-nums">{davomiylik(a.totalMin)}</TableCell>
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatDateTimeUZ(a.lastAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>

          {/* ── Xavfsizlik ── */}
          <SectionCard
            title="Muvaffaqiyatsiz urinishlar"
            description="parol xato · ro'yxatda yo'q · juda ko'p urinish"
            bodyClassName="p-0"
          >
            {lenta.length === 0 ? (
              <div className="p-5">
                <EmptyState icon={ShieldAlert} title="Muvaffaqiyatsiz urinish yo'q" />
              </div>
            ) : (
              <div className="max-h-[420px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Vaqt</TableHead>
                      <TableHead>Yuza</TableHead>
                      <TableHead>Holat</TableHead>
                      <TableHead>Kim / login</TableHead>
                      <TableHead>Sabab</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lenta.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                          {formatDateTimeUZ(e.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Pill tone={SURFACE_TONE[e.surface]}>{SURFACE_LABEL[e.surface]}</Pill>
                        </TableCell>
                        <TableCell>
                          <Pill tone={TYPE_TONE[e.type]}>{TYPE_LABEL[e.type]}</Pill>
                        </TableCell>
                        <TableCell className="text-sm">
                          {e.actorName || e.login || (e.tgUserId ? `TG ${e.tgUserId}` : "—")}
                          {e.actorName && e.login ? (
                            <span className="ml-1 text-[11px] text-muted-foreground">({e.login})</span>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {REASON_LABEL[e.reason ?? ""] ?? e.reason ?? "—"}
                          {e.route ? <span className="ml-1 opacity-60">{e.route}</span> : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </SectionCard>

          <p className="flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            Sessiya 30 daqiqa jimlikdan keyin yopiladi; davomiylik oxirgi faollikkacha
            hisoblanadi. Jurnal 1 yil saqlanadi. Telegram bot buyruqlari (miniapp emas)
            bu yerda hisobga olinmaydi.
          </p>
        </>
      )}
    </div>
  );
}
