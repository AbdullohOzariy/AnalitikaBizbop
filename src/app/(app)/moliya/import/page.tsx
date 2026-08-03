import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { canSeeFinance, canEnterCash } from "@/lib/roles";
import { decimalToNumber } from "@/lib/format";
import { Upload, FileCheck2, CircleAlert, Layers } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import { ImportClient } from "./import-client";

export const dynamic = "force-dynamic";

export default async function MoliyaImportPage() {
  const session = await auth();
  if (!session) redirect("/login");
  if (!canSeeFinance(session.user.roles)) redirect("/dashboard");

  const canEdit = canEnterCash(session.user.roles);

  const [batches, imported, unmatchedOpen] = await Promise.all([
    prisma.cashImportBatch.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true,
        fileName: true,
        status: true,
        sourceSumIn: true,
        sourceSumOut: true,
        parsedSumIn: true,
        parsedSumOut: true,
        rowsTotal: true,
        rowsImported: true,
        rowsSkipped: true,
        rowsUnmatched: true,
        error: true,
        createdAt: true,
        createdBy: { select: { name: true } },
      },
    }),
    prisma.cashTxn.count({ where: { source: "IMPORT" } }),
    prisma.unmatchedCashRow.count({ where: { resolvedAt: null } }),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Upload}
        title="Tarixni ko'chirish"
        description="Google Sheets'dagi kassa kitobini .xlsx qilib yuklang. Checksum mos kelmasa — HECH NARSA import qilinmaydi."
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          label="Ko'chirilgan yozuv"
          value={imported.toLocaleString("uz-UZ")}
          icon={FileCheck2}
          tone="blue"
          hint="Qulflangan — tahrirlanmaydi"
        />
        <StatCard
          label="Moslanmagan"
          value={unmatchedOpen.toLocaleString("uz-UZ")}
          icon={CircleAlert}
          tone={unmatchedOpen > 0 ? "orange" : "green"}
          hint={unmatchedOpen > 0 ? "Qo'lda hal qilinishi kerak" : "Hammasi tanildi"}
        />
        <StatCard label="Partiyalar" value={String(batches.length)} icon={Layers} tone="violet" />
      </div>

      <ImportClient
        canEdit={canEdit}
        batches={batches.map((b) => ({
          id: b.id,
          fileName: b.fileName,
          status: b.status,
          sourceSumIn: b.sourceSumIn ? decimalToNumber(b.sourceSumIn) : null,
          sourceSumOut: b.sourceSumOut ? decimalToNumber(b.sourceSumOut) : null,
          parsedSumIn: decimalToNumber(b.parsedSumIn),
          parsedSumOut: decimalToNumber(b.parsedSumOut),
          rowsTotal: b.rowsTotal,
          rowsImported: b.rowsImported,
          rowsSkipped: b.rowsSkipped,
          rowsUnmatched: b.rowsUnmatched,
          error: b.error,
          createdAt: b.createdAt.toISOString(),
          createdBy: b.createdBy?.name ?? null,
        }))}
      />
    </div>
  );
}
