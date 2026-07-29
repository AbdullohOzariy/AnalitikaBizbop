import { redirect } from "next/navigation";
import { MessagesSquare, Check, X, HelpCircle, Clock } from "lucide-react";
import { auth } from "@/auth";
import { canSeePromo, isSystemAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, SectionCard, EmptyState } from "@/components/common/page";
import { todayTashkentISO } from "@/lib/date";
import { tahlilChatId } from "@/lib/community/sozlama";
import { umumiy, kunlik, kategoriyalar, yoqTop, sorovlar } from "@/lib/community/hisobot";
import { CommunityClient } from "./community-client";
import { kategoriyalarRoyxati } from "./actions";

export const metadata = { title: "Community" };
export const dynamic = "force-dynamic";

/** Sana oralig'i: default — oxirgi 30 kun. */
function davr(sp: Record<string, string | string[] | undefined>): { from: string; to: string } {
  const bugun = todayTashkentISO();
  const g = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string) : "");
  const to = /^\d{4}-\d{2}-\d{2}$/.test(g("to")) ? g("to") : bugun;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(g("from"))
    ? g("from")
    : new Date(new Date(to + "T00:00:00Z").getTime() - 29 * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

export default async function CommunityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await auth();
  if (!session?.user || !canSeePromo(session.user.roles)) redirect("/dashboard");
  const canEdit = isSystemAdmin(session.user.roles);

  const sp = await searchParams;
  const { from, to } = davr(sp);
  const chatId = await tahlilChatId();

  if (chatId == null) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title="Community" description="Mijozlar guruhidagi so'rov va murojaatlar" icon={MessagesSquare} />
        <EmptyState
          icon={MessagesSquare}
          title="Guruh ulanmagan"
          description="Botni guruhga qo'shing (BotFather'da Privacy mode o'chirilgan bo'lsin) yoki eksportni import qiling."
        />
      </div>
    );
  }

  const [stat, kunlar, katlar, yoq, royxat, katOpts, xabarSoni] = await Promise.all([
    umumiy(chatId, from, to),
    kunlik(chatId, from, to),
    kategoriyalar(chatId, from, to),
    yoqTop(chatId, from, to),
    sorovlar({ chatId, from, to, limit: 300 }),
    canEdit ? kategoriyalarRoyxati() : Promise.resolve([]),
    prisma.tgGroupMessage.count({ where: { chatId, dayKey: { gte: from, lte: to } } }),
  ]);

  const maxKun = Math.max(1, ...kunlar.map((k) => k.jami));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Community"
        description={`Mijozlar guruhidagi so'rovlar — ${from} … ${to}`}
        icon={MessagesSquare}
      />

      {stat.jami === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Tahlil qilingan so'rov yo'q"
          description={
            xabarSoni > 0
              ? `Bu davrda ${xabarSoni} ta xabar bor, lekin AI tahlili ishga tushirilmagan.`
              : "Bu davrda xabar yig'ilmagan."
          }
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <StatCard label="So'rovlar" value={stat.jami} icon={MessagesSquare} tone="violet" hint={`${xabarSoni} xabardan`} />
            <StatCard label="Bor (HA)" value={stat.yes} icon={Check} tone="green" hint={`${Math.round((stat.yes / stat.jami) * 100)}%`} />
            <StatCard label="Yo'q" value={stat.no} icon={X} tone="red" hint={`${Math.round((stat.no / stat.jami) * 100)}%`} />
            <StatCard label="Javobsiz" value={stat.unanswered} icon={HelpCircle} tone="orange" hint={`javob ulushi ${stat.javobUlushi}%`} />
            <StatCard
              label="O'rtacha javob"
              value={stat.ortachaJavobDaq != null ? `${stat.ortachaJavobDaq} daq` : "—"}
              icon={Clock}
              tone="blue"
            />
          </div>

          {kunlar.length > 1 && (
            <SectionCard title="Kunlik dinamika" description="Yashil — bor, qizil — yo'q">
              <div className="flex flex-col gap-1.5">
                {kunlar.map((k) => (
                  <div key={k.dayKey} className="flex items-center gap-3 text-xs">
                    <span className="w-20 shrink-0 text-muted-foreground tabular-nums">{k.dayKey}</span>
                    <div className="flex h-4 flex-1 overflow-hidden rounded bg-muted">
                      <div className="h-full bg-primary/70" style={{ width: `${(k.yes / maxKun) * 100}%` }} />
                      <div className="h-full bg-destructive/60" style={{ width: `${(k.no / maxKun) * 100}%` }} />
                      <div
                        className="h-full bg-muted-foreground/25"
                        style={{ width: `${((k.jami - k.yes - k.no) / maxKun) * 100}%` }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right font-semibold tabular-nums">{k.jami}</span>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          <CommunityClient
            sorovlar={royxat}
            kategoriyalar={katlar}
            yoqTop={yoq}
            kategoriyaOpts={katOpts}
            canEdit={canEdit}
            bugun={todayTashkentISO()}
          />
        </>
      )}
    </div>
  );
}
