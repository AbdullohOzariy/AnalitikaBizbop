import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isSystemAdmin } from "@/lib/roles";
import { Plug, Inbox, Clock, AlertTriangle, Layers } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import { Card, CardContent } from "@/components/ui/card";
import { IntegratsiyaClient } from "./integratsiya-client";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | string[] | undefined>>;
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function IntegratsiyaPage({ searchParams }: { searchParams: SP }) {
  const session = await auth();
  if (!session) redirect("/login");
  if (!isSystemAdmin(session.user.roles)) redirect("/dashboard");

  const sp = await searchParams;
  const kind = one(sp.kind) || null;
  const status = one(sp.status) || null;

  const where = {
    ...(kind ? { kind } : {}),
    ...(status ? { status: status as "PENDING" } : {}),
  };

  const [rows, byKind, byStatus, total, oxirgi] = await Promise.all([
    prisma.integrationEvent.findMany({
      where,
      orderBy: { receivedAt: "desc" },
      take: 100,
      select: {
        id: true,
        kind: true,
        externalId: true,
        externalNo: true,
        occurredAt: true,
        status: true,
        error: true,
        attempts: true,
        batchId: true,
        receivedAt: true,
        payload: true,
      },
    }),
    prisma.integrationEvent.groupBy({ by: ["kind"], _count: true, orderBy: { _count: { kind: "desc" } } }),
    prisma.integrationEvent.groupBy({ by: ["status"], _count: true }),
    prisma.integrationEvent.count(),
    prisma.integrationEvent.findFirst({ orderBy: { receivedAt: "desc" }, select: { receivedAt: true } }),
  ]);

  const statusCount = Object.fromEntries(byStatus.map((s) => [s.status, s._count]));
  const tokenSozlangan = Boolean(process.env.ONEC_INGEST_TOKEN);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Plug}
        title="Integratsiya — 1C hodisalari"
        description="1C yuborgan xom JSON. Hech narsa o'zgartirilmasdan saqlanadi: sxema kelishuvi davomida ma'lumot yo'qolmasligi uchun."
      />

      {!tokenSozlangan && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex items-start gap-3 py-4 text-sm">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <div className="font-medium">Endpoint yopiq — <code>ONEC_INGEST_TOKEN</code> sozlanmagan</div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Token bo&apos;lmasa <code>/api/1c/ingest</code> hamma so&apos;rovga 404 qaytaradi (ataylab:
                token unutilsa endpoint ochiq qolmasin). Railway o&apos;zgaruvchilariga qo&apos;shing.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Jami hodisa" value={total.toLocaleString("uz-UZ")} icon={Inbox} tone="blue" />
        <StatCard
          label="Kutmoqda"
          value={(statusCount.PENDING ?? 0).toLocaleString("uz-UZ")}
          icon={Clock}
          tone="orange"
          hint="Qayta ishlash bosqichi hali qurilmagan"
        />
        <StatCard
          label="Xato"
          value={(statusCount.FAILED ?? 0).toLocaleString("uz-UZ")}
          icon={AlertTriangle}
          tone={(statusCount.FAILED ?? 0) > 0 ? "red" : "green"}
        />
        <StatCard
          label="Hujjat turlari"
          value={String(byKind.length)}
          icon={Layers}
          tone="violet"
          hint={oxirgi ? `oxirgi: ${oxirgi.receivedAt.toLocaleString("uz-UZ")}` : "hali hech narsa kelmagan"}
        />
      </div>

      <IntegratsiyaClient
        rows={rows.map((r) => ({
          id: r.id,
          kind: r.kind,
          externalId: r.externalId,
          externalNo: r.externalNo,
          occurredAt: r.occurredAt?.toISOString() ?? null,
          status: r.status,
          error: r.error,
          attempts: r.attempts,
          batchId: r.batchId,
          receivedAt: r.receivedAt.toISOString(),
          payload: r.payload,
        }))}
        kinds={byKind.map((k) => ({ kind: k.kind, count: k._count }))}
        filters={{ kind, status }}
      />
    </div>
  );
}
