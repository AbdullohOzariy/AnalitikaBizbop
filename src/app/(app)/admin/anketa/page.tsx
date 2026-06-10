/**
 * Tizim → Anketa: ta'minotchi anketasi boshqaruvi.
 * Tablar: kelgan javoblar · forma maydonlarini tahrirlash.
 * Public forma: supplier.oilagroup.uz (yoki /anketa).
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isSystemAdmin } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { FileText, Inbox, SlidersHorizontal, ExternalLink } from "lucide-react";
import { PageHeader, StatCard } from "@/components/common/page";
import { cn } from "@/lib/utils";
import { formatDateTimeUZ } from "@/lib/format";
import { SubmissionsList, FieldsEditor, type FieldRow, type SubmissionRow } from "./anketa-admin";

export const dynamic = "force-dynamic";

type Tab = "javoblar" | "maydonlar";

export default async function AnketaAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await auth();
  if (!session?.user || !isSystemAdmin(session.user.role)) redirect("/dashboard");

  const sp = await searchParams;
  const tab: Tab = sp.tab === "maydonlar" ? "maydonlar" : "javoblar";

  const [fields, submissions, newCount] = await Promise.all([
    prisma.anketaField.findMany({ orderBy: [{ sortOrder: "asc" }, { id: "asc" }] }),
    prisma.anketaSubmission.findMany({ orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.anketaSubmission.count({ where: { status: "NEW" } }),
  ]);

  const fieldRows: FieldRow[] = fields.map((f) => ({
    id: f.id, section: f.section, label: f.label, type: f.type,
    required: f.required, sortOrder: f.sortOrder, active: f.active,
  }));
  const subRows: SubmissionRow[] = submissions.map((s) => ({
    id: s.id, companyName: s.companyName, phone: s.phone, status: s.status,
    createdAt: formatDateTimeUZ(s.createdAt),
    answers: (s.answers ?? {}) as Record<string, string>,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        icon={FileText}
        title="Ta'minotchi anketasi"
        description="supplier.oilagroup.uz dagi forma — javoblar va maydonlar boshqaruvi"
      >
        <a
          href="/anketa"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-card px-3.5 text-sm font-medium shadow-sm transition-colors hover:bg-secondary"
        >
          <ExternalLink className="h-4 w-4" /> Formani ko&apos;rish
        </a>
      </PageHeader>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Yangi anketalar" value={newCount.toLocaleString("uz-UZ")} icon={Inbox}
          tone={newCount > 0 ? "green" : "default"} hint="ko'rib chiqilmagan" />
        <StatCard label="Jami kelgan" value={submissions.length.toLocaleString("uz-UZ")} icon={FileText} />
        <StatCard label="Forma maydonlari" value={`${fields.filter((f) => f.active).length}/${fields.length}`}
          icon={SlidersHorizontal} hint="aktiv / jami" />
      </div>

      {/* Tablar */}
      <div role="tablist" className="flex gap-2">
        {([
          { v: "javoblar", l: `Javoblar${newCount > 0 ? ` (${newCount} yangi)` : ""}` },
          { v: "maydonlar", l: "Maydonlarni tahrirlash" },
        ] as { v: Tab; l: string }[]).map((t) => (
          <Link key={t.v} href={`/admin/anketa?tab=${t.v}`} scroll={false}
            aria-current={tab === t.v ? "page" : undefined}
            className={cn(
              "inline-flex h-9 items-center rounded-xl border px-4 text-sm font-medium transition-colors",
              tab === t.v
                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                : "border-border bg-card text-muted-foreground hover:text-foreground hover:bg-secondary"
            )}>
            {t.l}
          </Link>
        ))}
      </div>

      {tab === "javoblar"
        ? <SubmissionsList rows={subRows} fields={fieldRows} />
        : <FieldsEditor fields={fieldRows} />}
    </div>
  );
}
