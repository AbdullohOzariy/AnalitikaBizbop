import { redirect } from "next/navigation";
import { UsersRound, ShieldCheck, Eye, FolderKanban } from "lucide-react";
import { PageHeader, StatCard, SectionCard, EmptyState, Pill } from "@/components/common/page";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateUZ } from "@/lib/format";
import { CreateUserForm } from "./create-form";
import { UserActions } from "./user-actions";

// ── Rol konfiguratsiyasi ──────────────────────────────────────────────────────
const ROLE_CONFIG: Record<
  string,
  { label: string; tone: "green" | "blue" | "muted"; icon: string }
> = {
  SYSTEM_ADMIN: { label: "System Admin",        tone: "green",  icon: "S" },
  ADMIN:        { label: "Admin (ko'rish)",     tone: "blue",   icon: "A" },
  CEO:          { label: "CEO",                  tone: "blue",   icon: "C" },
  CAT_MANAGER:  { label: "Kategoriya menejeri", tone: "blue",   icon: "K" },
  SUPPLYCHAIN:  { label: "Supplychain",         tone: "blue",   icon: "S" },
  HEAD_CAT_MANAGER: { label: "Kat. menejerlari boshi", tone: "blue", icon: "H" },
  MERCHANDISER: { label: "Merchandayzer",       tone: "blue",   icon: "M" },
  OPERATOR:     { label: "Operator",            tone: "muted",  icon: "O" },
  VIEWER:       { label: "Ko'ruvchi",           tone: "muted",  icon: "V" },
};

// ── Avatar: ismdagi bosh harflar ─────────────────────────────────────────────
const AVATAR_COLORS = [
  "bg-primary/15 text-primary",
  "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  "bg-accent/15 text-accent",
  "bg-purple-500/15 text-purple-600 dark:text-purple-400",
  "bg-amber-500/15 text-amber-600 dark:text-amber-400",
];

function getAvatarColor(id: number) {
  return AVATAR_COLORS[id % AVATAR_COLORS.length];
}

function getInitials(name: string) {
  return name
    .split(" ")
    .map((w) => w[0]?.toUpperCase() ?? "")
    .slice(0, 2)
    .join("");
}

// ── Sahifa ────────────────────────────────────────────────────────────────────
export default async function UsersPage() {
  const session = await auth();
  if (!session?.user.roles.includes("SYSTEM_ADMIN")) redirect("/dashboard");

  const [users, catRows] = await Promise.all([
    prisma.user.findMany({
      orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      include: { managedCategories: { select: { categoryId: true } } },
    }),
    prisma.category.findMany({
      where: { parentId: null },
      select: { id: true, name: true, group: { select: { name: true } } },
      orderBy: [{ groupId: "asc" }, { sortOrder: "asc" }],
    }),
  ]);
  const categories = catRows.map((c) => ({ id: c.id, name: c.name, group: c.group?.name ?? null }));

  const totalAdmin      = users.filter((u) => u.role === "SYSTEM_ADMIN").length;
  const totalCatManager = users.filter((u) => u.role === "CAT_MANAGER").length;
  const totalViewer     = users.filter((u) => u.role === "CEO").length;

  return (
    <div className="space-y-6">
      <PageHeader
        icon={UsersRound}
        title="Foydalanuvchilar"
        description="Yangi foydalanuvchi qo'shing, parol o'zgartiring yoki o'chiring."
      />

      {/* Statistika qatori */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Jami"
          value={users.length}
          icon={UsersRound}
          tone="default"
        />
        <StatCard
          label="Adminlar"
          value={totalAdmin}
          icon={ShieldCheck}
          tone="green"
        />
        <StatCard
          label="Kat. menejerlar"
          value={totalCatManager}
          icon={FolderKanban}
          tone="blue"
        />
        <StatCard
          label="CEO"
          value={totalViewer}
          icon={Eye}
          tone="default"
        />
      </div>

      {/* Asosiy kontent */}
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        {/* Foydalanuvchilar jadvali */}
        <SectionCard title={`Ro'yxat — ${users.length} nafar`}>
          {users.length === 0 ? (
            <EmptyState
              icon={UsersRound}
              title="Foydalanuvchi yo'q"
              description="Hozircha hech kim qo'shilmagan. O'ngdagi forma orqali qo'shing."
            />
          ) : (
            <div className="overflow-x-auto -mx-5">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="pl-5">Foydalanuvchi</TableHead>
                    <TableHead className="hidden sm:table-cell">Login</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead className="hidden md:table-cell">Qo'shilgan</TableHead>
                    <TableHead className="w-10 pr-5"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => {
                    const isSelf = String(u.id) === session.user.id;
                    const cfg = ROLE_CONFIG[u.role] ?? ROLE_CONFIG.VIEWER;
                    return (
                      <TableRow key={u.id} className="group">
                        {/* Avatar + Ism */}
                        <TableCell className="pl-5">
                          <div className="flex items-center gap-3 min-w-0">
                            <span
                              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${getAvatarColor(u.id)}`}
                            >
                              {getInitials(u.name)}
                            </span>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-medium text-sm truncate">{u.name}</span>
                                {isSelf && (
                                  <Pill tone="green" className="text-[10px] py-0 px-1.5">
                                    Siz
                                  </Pill>
                                )}
                              </div>
                              {/* Mobilda login ko'rinadi */}
                              <span className="block text-xs text-muted-foreground truncate sm:hidden">
                                {u.email}
                              </span>
                            </div>
                          </div>
                        </TableCell>

                        {/* Login (katta ekranda) */}
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          {u.email}
                        </TableCell>

                        {/* Rol badge — asosiy + qo'shimcha rollar */}
                        <TableCell>
                          <div className="flex flex-wrap items-center gap-1">
                            <Pill tone={cfg.tone}>{cfg.label}</Pill>
                            {u.extraRoles.map((r) => {
                              const ec = ROLE_CONFIG[r] ?? ROLE_CONFIG.VIEWER;
                              return (
                                <Pill key={r} tone="muted" className="text-[10px] py-0 px-1.5">+ {ec.label}</Pill>
                              );
                            })}
                          </div>
                        </TableCell>

                        {/* Sana (o'rta ekrandan) */}
                        <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                          {formatDateUZ(u.createdAt)}
                        </TableCell>

                        {/* Amallar */}
                        <TableCell className="pr-5">
                          <UserActions
                            id={u.id}
                            name={u.name}
                            email={u.email}
                            role={u.role}
                            extraRoles={u.extraRoles}
                            isSelf={isSelf}
                            categories={categories}
                            managedCategoryIds={u.managedCategories.map((m) => m.categoryId)}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </SectionCard>

        {/* Yangi foydalanuvchi formasi */}
        <SectionCard
          title="Yangi foydalanuvchi"
          description="Ma'lumotlarni to'ldiring va qo'shing."
        >
          <CreateUserForm />
        </SectionCard>
      </div>
    </div>
  );
}
