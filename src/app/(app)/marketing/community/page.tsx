import { redirect } from "next/navigation";
import { MessagesSquare, Users, CalendarDays, Clock } from "lucide-react";
import { auth } from "@/auth";
import { canSeePromo } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { PageHeader, StatCard, SectionCard, EmptyState } from "@/components/common/page";
import { formatDateTimeUZ } from "@/lib/format";

export const metadata = { title: "Community" };
export const dynamic = "force-dynamic";

export default async function CommunityPage() {
  const session = await auth();
  if (!session?.user || !canSeePromo(session.user.roles)) redirect("/dashboard");

  const groups = await prisma.tgGroup.findMany({ orderBy: { joinedAt: "asc" } });

  const [total, byDay, byAuthor, recent] = await Promise.all([
    prisma.tgGroupMessage.count(),
    prisma.tgGroupMessage.groupBy({
      by: ["dayKey"],
      _count: { _all: true },
      orderBy: { dayKey: "desc" },
      take: 14,
    }),
    prisma.tgGroupMessage.groupBy({
      by: ["fromName"],
      _count: { _all: true },
      orderBy: { _count: { id: "desc" } },
      take: 10,
    }),
    prisma.tgGroupMessage.findMany({
      orderBy: { sentAt: "desc" },
      take: 40,
      select: {
        id: true,
        sentAt: true,
        fromName: true,
        text: true,
        mediaKind: true,
        replyToId: true,
        source: true,
      },
    }),
  ]);

  const authorCount = await prisma.tgGroupMessage
    .findMany({ distinct: ["fromId"], select: { fromId: true } })
    .then((r) => r.length);

  const days = byDay.map((d) => d.dayKey).sort();
  const maxDay = Math.max(1, ...byDay.map((d) => d._count._all));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Community"
        description="Mijozlar guruhidagi so'rov va murojaatlar — xom ma'lumot oqimi"
        icon={MessagesSquare}
      />

      {total === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Hali xabar yig'ilmagan"
          description="Botni guruhga qo'shing (BotFather'da Privacy mode o'chirilgan bo'lsin) yoki Telegram Desktop eksportini import qiling: npx tsx scripts/tg-group-import.ts export.json"
        />
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Xabarlar" value={total.toLocaleString("ru-RU")} icon={MessagesSquare} tone="green" />
            <StatCard label="Ishtirokchilar" value={authorCount} icon={Users} tone="blue" />
            <StatCard
              label="Kunlar"
              value={days.length}
              icon={CalendarDays}
              tone="violet"
              hint={days.length ? `${days[0]} … ${days[days.length - 1]}` : undefined}
            />
            <StatCard
              label="So'nggi xabar"
              value={recent[0] ? formatDateTimeUZ(recent[0].sentAt) : "—"}
              icon={Clock}
              tone="orange"
            />
          </div>

          <SectionCard title="Kunlik faollik" description="So'nggi 14 kun">
            <div className="flex flex-col gap-1.5">
              {byDay.map((d) => (
                <div key={d.dayKey} className="flex items-center gap-3 text-xs">
                  <span className="w-20 shrink-0 text-muted-foreground tabular-nums">{d.dayKey}</span>
                  <div className="h-4 flex-1 overflow-hidden rounded bg-muted">
                    <div
                      className="h-full rounded bg-primary/70"
                      style={{ width: `${(d._count._all / maxDay) * 100}%` }}
                    />
                  </div>
                  <span className="w-12 shrink-0 text-right font-semibold tabular-nums">{d._count._all}</span>
                </div>
              ))}
            </div>
          </SectionCard>

          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            <SectionCard title="Eng faol ishtirokchilar">
              <div className="flex flex-col gap-2">
                {byAuthor.map((a) => (
                  <div key={a.fromName ?? "?"} className="flex items-center justify-between gap-2 text-sm">
                    <span className="truncate">{a.fromName ?? "—"}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-muted-foreground">
                      {a._count._all}
                    </span>
                  </div>
                ))}
              </div>
            </SectionCard>

            <SectionCard title="So'nggi xabarlar" description="Oxirgi 40 ta">
              <div className="flex flex-col gap-3">
                {recent.map((m) => (
                  <div key={m.id} className="border-b border-border/50 pb-2.5 last:border-0 last:pb-0">
                    <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                      <span className="font-semibold text-foreground">{m.fromName ?? "—"}</span>
                      <span>{formatDateTimeUZ(m.sentAt)}</span>
                      {m.replyToId && <span>↩ javob</span>}
                      {m.mediaKind && <span>[{m.mediaKind}]</span>}
                      {m.source === "EXPORT" && <span className="opacity-60">eksport</span>}
                    </div>
                    <p className="mt-0.5 whitespace-pre-wrap text-sm">{m.text || "—"}</p>
                  </div>
                ))}
              </div>
            </SectionCard>
          </div>

          {groups.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Guruh: {groups.map((g) => `${g.title ?? "(nomsiz)"} (${g.chatId})`).join(", ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
