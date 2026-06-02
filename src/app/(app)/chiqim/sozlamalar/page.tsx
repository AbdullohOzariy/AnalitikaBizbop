import { redirect } from "next/navigation";
import { auth } from "@/auth";
import {
  botConfigured,
  botFilialar,
  botKategoriyalar,
} from "@/lib/spisaniya/db";
import {
  Settings,
  WifiOff,
  Building2,
  Tag,
  Info,
} from "lucide-react";
import {
  PageHeader,
  SectionCard,
  EmptyState,
  Pill,
} from "@/components/common/page";

export default async function SozlamalarPage() {
  const session = await auth();
  if (!session) redirect("/login");
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "CAT_MANAGER") redirect("/dashboard");

  if (!botConfigured()) {
    return (
      <div className="space-y-5">
        <PageHeader
          icon={Settings}
          title="Sozlamalar"
          description="BotBizBopSPS bot sozlamalari (read-only)"
        />
        <EmptyState
          icon={WifiOff}
          title="Bot bazasiga ulanmagan"
          description="BOT_DATABASE_URL muhit o'zgaruvchisi sozlanmagan."
        />
      </div>
    );
  }

  const [filialar, kategoriyalar] = await Promise.all([
    botFilialar(),
    botKategoriyalar(),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader
        icon={Settings}
        title="Sozlamalar"
        description="BotBizBopSPS bot sozlamalari (read-only ko'rinish)"
      />

      {/* Izoh banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-border bg-muted/40 px-5 py-4">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Bu sahifada bot sozlamalari <strong>faqat ko&apos;rish</strong> uchun ko&apos;rsatilgan.
          Boshqarish (qo&apos;shish, tahrirlash, o&apos;chirish) keyingi bosqichda qo&apos;shiladi.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Filialar */}
        <SectionCard
          title="Filialar"
          description={`${filialar.length} ta filial`}
          actions={
            <Building2 className="h-4 w-4 text-muted-foreground" />
          }
        >
          {filialar.length === 0 ? (
            <EmptyState
              icon={Building2}
              title="Filiallar topilmadi"
              description="Bot bazasida filiallar yo'q."
            />
          ) : (
            <div className="divide-y divide-border/60">
              {filialar.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-3 py-2.5"
                >
                  <div className="flex items-center gap-2.5">
                    <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="text-sm font-medium">{f.nomi}</span>
                  </div>
                  <Pill tone={f.aktiv ? "green" : "muted"}>
                    {f.aktiv ? "Aktiv" : "Nofaol"}
                  </Pill>
                </div>
              ))}
            </div>
          )}
        </SectionCard>

        {/* Kategoriyalar */}
        <SectionCard
          title="Kategoriyalar"
          description={`${kategoriyalar.length} ta kategoriya`}
          actions={
            <Tag className="h-4 w-4 text-muted-foreground" />
          }
        >
          {kategoriyalar.length === 0 ? (
            <EmptyState
              icon={Tag}
              title="Kategoriyalar topilmadi"
              description="Bot bazasida kategoriyalar yo'q."
            />
          ) : (
            <div className="divide-y divide-border/60">
              {kategoriyalar.map((k) => (
                <div
                  key={k.id}
                  className="flex items-center gap-2.5 py-2.5"
                >
                  <Tag className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="text-sm">{k.nomi}</span>
                </div>
              ))}
            </div>
          )}
        </SectionCard>
      </div>
    </div>
  );
}
