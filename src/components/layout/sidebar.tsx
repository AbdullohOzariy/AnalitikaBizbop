"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Upload,
  Building2,
  Tag,
  Users,
  LayoutDashboard,
  Menu,
  Table2,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronRight,
  ArrowLeft,
  Database,
  Footprints,
  PackageMinus,
  PackageX,
  ChartPie,
  Recycle,
  Settings,
  Truck,
  PackageSearch,
  ShoppingCart,
  Hourglass,
  TrendingUp,
  ClipboardList,
  Target,
  Wallet,
  Tags,
  LayoutGrid,
  CalendarCheck,
  FileText,
  FileCheck2,
  Gem,
  Gauge,
  Megaphone,
  Zap,
  BarChart2,
  BarChart3,
  ScanSearch,
  Boxes,
  Handshake,
  LogIn,
  MessagesSquare,
  ShieldAlert,
  Coins,
  BookMarked,
  Receipt,
  Plug,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Role } from "@/generated/prisma/enums";
import { canSeePromo } from "@/lib/roles";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  roles?: Role[];
  disabled?: boolean; // vaqtinchalik ish faoliyatida emas — kulrang, bosilmaydi
};

type NavGroup = {
  label: string;
  /** Parent qatorda ko'rinadigan ikonka (drill-down menyu). */
  icon: React.ComponentType<{ className?: string }>;
  items: NavItem[];
  /** Agar rol predikati berilsa, guruh faqat shu predikat true qaytargandagina ko'rinadi. */
  guard?: (role: Role) => boolean;
};

// ─── localStorage UI sozlamalari ─────────────────────────────────────────────
const PREF_EVENT = "sidebar-pref";
function subscribePref(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PREF_EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(PREF_EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
function emitPref() {
  window.dispatchEvent(new Event(PREF_EVENT));
}
function getCollapsedSnapshot() {
  return localStorage.getItem("sidebar-collapsed") === "true";
}

// ─── Navigatsiya tuzilmasi ───────────────────────────────────────────────────
const A = "ADMIN" as const;        // read-only admin
const SA = "SYSTEM_ADMIN" as const; // to'liq admin

/** Guruhsiz, eng yuqori darajadagi bo'limlar. */
const ROOT_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Bosh sahifa", icon: LayoutDashboard, roles: [SA, A, "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER", "FINANCE"] },
];

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Analitika",
    icon: BarChart3,
    items: [
      // INVENTORY ATAYLAB shu yerda: sahifa guard'i (sotuv-dashboard/page.tsx) va
      // auth.config uni o'tkazadi, login'dan keyin ham aynan shu sahifaga tushadi —
      // lekin menyuda havolasi yo'q edi, ya'ni boshqa bo'limga o'tsa qaytolmasdi.
      { href: "/sotuv-dashboard", label: "Sotuv Dashboard", icon: Target,          roles: [SA, A, "CEO", "SUPPLYCHAIN", "INVENTORY"] },
      { href: "/oos",             label: "OOS",             icon: PackageX,        roles: [SA, A, "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER"] },
      { href: "/stockday",        label: "Stockday",        icon: Hourglass,       roles: [SA, A, "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER"] },
      { href: "/prognoz",         label: "Talab prognozi",  icon: TrendingUp,      roles: [SA, A, "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER"] },
      { href: "/abc-xyz",         label: "ABC/XYZ",         icon: LayoutGrid,      roles: [SA, A, "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER"] },
      { href: "/pme",             label: "PME analyze",     icon: Gem,             roles: [SA, A, "CAT_MANAGER", "SUPPLYCHAIN", "HEAD_CAT_MANAGER"] },
      { href: "/analyze",         label: "Analyze (narx)",  icon: ScanSearch,      roles: [SA, A, "CAT_MANAGER", "SUPPLYCHAIN", "HEAD_CAT_MANAGER"] },
      { href: "/report",          label: "Hisobot",         icon: Table2,          roles: [SA, A, "SUPPLYCHAIN"] },
      { href: "/rejalar",         label: "Rejalar",         icon: ClipboardList,   roles: [SA, A, "CAT_MANAGER", "CEO", "HEAD_CAT_MANAGER"] },
    ],
  },
  {
    label: "Sotuv",
    icon: ShoppingCart,
    items: [
      { href: "/sotuv/bugun",       label: "Bugun",       icon: CalendarCheck, roles: [SA, A, "CAT_MANAGER", "SUPPLYCHAIN", "HEAD_CAT_MANAGER"] },
      { href: "/sotuv/sotib-olish", label: "Sotib olish", icon: ShoppingCart, roles: [SA, A, "CAT_MANAGER", "SUPPLYCHAIN", "HEAD_CAT_MANAGER", "CEO"] },
      { href: "/sotuv/nazorat",     label: "Zakaz nazorati", icon: ShieldAlert, roles: [SA, A, "CAT_MANAGER", "SUPPLYCHAIN", "HEAD_CAT_MANAGER", "CEO"] },
      { href: "/sverka",            label: "Sverka",      icon: FileCheck2,   roles: [SA, A, "SUPPLYCHAIN", "CEO", "OPERATOR"] },
    ],
  },
  {
    // MOLIYA — kassa/DDS (treasury). FINANCE izolyatsiyalanmagan rol: bu bo'limni
    // to'liq boshqaradi va analitikani ham ko'radi. Reja: MOLIYA_PLAN.md
    label: "Moliya",
    icon: Wallet,
    items: [
      { href: "/moliya/kassa",         label: "Kassa jurnali", icon: Coins,       roles: [SA, A, "CEO", "FINANCE"] },
      { href: "/moliya/qoldiq",        label: "Qoldiqlar",     icon: Wallet,      roles: [SA, A, "CEO", "FINANCE"] },
      { href: "/moliya/dds",           label: "DDS hisoboti",  icon: TrendingUp,  roles: [SA, A, "CEO", "FINANCE"] },
      { href: "/moliya/kontragentlar", label: "Kontragentlar", icon: Users,       roles: [SA, A, "CEO", "FINANCE"] },
      { href: "/moliya/malumotnoma",   label: "Moddalar",      icon: BookMarked,  roles: [SA, A, "CEO", "FINANCE"] },
      { href: "/sotuv/finans",         label: "Harajatlar",    icon: Receipt,     roles: [SA, A, "CEO", "FINANCE"] },
    ],
  },
  {
    // LOGIST izolatsiyasi: bu rol faqat shu guruh item'larida bor (auth.config unga
    // /logistika prefiksini ochadi) — boshqa bo'limlar ko'rinmaydi.
    label: "Logistika",
    icon: Truck,
    items: [
      { href: "/logistika/hozir",      label: "Hozir",       icon: Gauge,     roles: [SA, A, "CEO", "SUPPLYCHAIN", "LOGIST"] },
      { href: "/logistika/statistika", label: "Statistika",  icon: ChartPie,  roles: [SA, A, "CEO", "SUPPLYCHAIN", "LOGIST"] },
      { href: "/logistika/malumotlar", label: "Ma'lumotlar", icon: Database,  roles: [SA, "SUPPLYCHAIN", "LOGIST"] },
    ],
  },
  {
    label: "Hisobdan chiqarish",
    icon: PackageMinus,
    items: [
      { href: "/chiqim",            label: "Chiqimlar",        icon: PackageMinus, roles: [SA, A, "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER", "OPERATOR"] },
      { href: "/chiqim/statistika", label: "Statistika",       icon: ChartPie,     roles: [SA, A, "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER", "OPERATOR"] },
      { href: "/chiqim/nazorat",    label: "Reja nazorati",    icon: Target,       roles: [SA, A, "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER", "OPERATOR"] },
      { href: "/chiqim/vozvratlar", label: "Vozvratlar",       icon: Recycle,      roles: [SA, A, "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER", "OPERATOR"] },
      { href: "/chiqim/moslash",    label: "Kategoriya moslash", icon: Tags,       roles: [SA, A] },
      { href: "/chiqim/sabablar",   label: "Sabablar",         icon: ClipboardList, roles: [SA] },
    ],
  },
  {
    // INVENTORY izolatsiyasi: bu rol faqat shu guruh item'larida bor (+ auth.config
    // unga /sotuv-dashboard'ni ochadi) — boshqa bo'limlar ko'rinmaydi.
    label: "Inventarizatsiya",
    icon: ClipboardList,
    items: [
      { href: "/inventarizatsiya",         label: "SKU ro'yxati", icon: ClipboardList, roles: [SA, A, "CEO", "INVENTORY"] },
      { href: "/inventarizatsiya/hisobot", label: "Hisobot",      icon: BarChart2,     roles: [SA, A, "CEO", "INVENTORY"] },
    ],
  },
  {
    label: "Baza",
    icon: Database,
    items: [
      { href: "/baza/sotuv",         label: "Sotuv",             icon: Database,      roles: [SA, A, "INVENTORY"] },
      { href: "/baza/qoldiq",        label: "Qoldiq",            icon: Boxes,         roles: [SA, A] },
      { href: "/baza/tashrif",       label: "Tashriflar",        icon: Footprints,    roles: [SA, A] },
      { href: "/iyerarxiya",         label: "Iyerarxiya",        icon: Tag,           roles: [SA, A] },
      { href: "/baza/taminotchilar", label: "Yetkazib beruvchilar",    icon: Truck,         roles: [SA, A, "SUPPLYCHAIN", "HEAD_CAT_MANAGER", "CAT_MANAGER"] },
      // Analitika'dan ko'chirildi (loyiha egasining qarori) — ta'minotchi shartlari
      // master-data qatorida turadi.
      { href: "/strategik-hamkorlik", label: "Strategik hamkorlik", icon: Handshake,   roles: [SA, A, "CEO", "SUPPLYCHAIN"] },
      { href: "/baza/moslanmagan",   label: "Moslanmagan",       icon: PackageSearch, roles: [SA, A] },
    ],
  },
  {
    // MARKETING izolatsiyasi: bu guruh canSeePromo predikatiga bog'liq.
    // Boshqa guruhlarning har biri o'z roles[] massiviga ega bo'lib, MARKETING
    // u massiвlarda yo'q — shuning uchun Promo'dan boshqa hech bir guruh ko'rinmaydi.
    label: "Marketing",
    icon: Megaphone,
    guard: canSeePromo,
    items: [
      { href: "/promo/doimiy",         label: "Doimiy aksiyalar", icon: Megaphone,      roles: [SA, A, "CAT_MANAGER", "CEO", "HEAD_CAT_MANAGER", "MARKETING"] },
      { href: "/promo/flash",          label: "Flash aksiyalar",  icon: Zap,            roles: [SA, A, "CAT_MANAGER", "CEO", "HEAD_CAT_MANAGER", "MARKETING"] },
      { href: "/promo/hisobot",        label: "Hisobot",          icon: BarChart2,      roles: [SA, A, "CAT_MANAGER", "CEO", "HEAD_CAT_MANAGER", "MARKETING"] },
      { href: "/marketing/community",  label: "Community",        icon: MessagesSquare, roles: [SA, A, "CAT_MANAGER", "CEO", "HEAD_CAT_MANAGER", "MARKETING"] },
    ],
  },
  {
    label: "Tizim",
    icon: Settings,
    items: [
      { href: "/branches",          label: "Filiallar",        icon: Building2, roles: [SA] },
      { href: "/admin/upload",      label: "Fayllar",          icon: Upload,    roles: [SA] },
      { href: "/admin/users",       label: "Foydalanuvchilar", icon: Users,     roles: [SA] },
      { href: "/admin/kirishlar",   label: "Kirishlar",        icon: LogIn,     roles: [SA] },
      { href: "/admin/anketa",      label: "Anketa",           icon: FileText,  roles: [SA, A, "SUPPLYCHAIN"] },
      { href: "/admin/integratsiya", label: "Integratsiya (1C)", icon: Plug,     roles: [SA] },
      { href: "/admin/sozlamalar",  label: "Sozlamalar",       icon: Settings,  roles: [SA] },
    ],
  },
];

/** Bitta navigatsiya qatori (link yoki "soon" holati). */
function NavRow({
  item,
  active,
  collapsed,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;

  if (item.disabled) {
    return (
      <div
        title="Vaqtinchalik ish faoliyatida emas"
        className={cn(
          "relative flex cursor-not-allowed items-center rounded-xl text-sm font-medium text-muted-foreground opacity-50",
          collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
        )}
      >
        <Icon className="h-4 w-4 shrink-0 opacity-70" />
        {!collapsed && (
          <span className="flex items-center gap-1.5">
            {item.label}
            <span className="rounded bg-muted px-1 py-px text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/70">soon</span>
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="transition-transform duration-150 hover:scale-[1.01] active:scale-[0.98]">
      <Link
        href={item.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        title={collapsed ? item.label : undefined}
        className={cn(
          "relative isolate flex items-center rounded-xl text-sm font-medium transition-colors duration-150 overflow-hidden",
          collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
          active
            ? "text-primary-foreground shadow-sm"
            : "text-muted-foreground hover:bg-secondary hover:text-foreground"
        )}
      >
        {active && (
          <span
            className="absolute inset-0 rounded-xl bg-brand-gradient shadow-brand"
            style={{ zIndex: -1 }}
          />
        )}
        <Icon className={cn("h-4 w-4 shrink-0", active ? "opacity-100" : "opacity-70")} />
        {!collapsed && item.label}
      </Link>
    </div>
  );
}

function SidebarNav({
  role,
  roles,
  collapsed,
  onToggle,
  onExpand,
  onNavigate,
}: {
  role: Role; // asosiy rol — pastdagi yorliq uchun
  roles: Role[]; // barcha rollar (union) — ko'rinish/ruxsat uchun
  collapsed?: boolean;
  onToggle?: () => void;
  onExpand?: () => void; // yig'iq holatda parent bosilganda sidebar'ni ochish
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const visibleRootItems = ROOT_ITEMS.filter((i) => {
    if (i.adminOnly && !roles.includes("SYSTEM_ADMIN")) return false;
    if (i.roles && !i.roles.some((r) => roles.includes(r))) return false;
    return true;
  });

  const visibleGroups = NAV_GROUPS.filter((g) => {
    // Guruh darajasidagi guard (predikat funksiya) — rollardan birortasi o'tsa ko'rinadi.
    if (g.guard && !roles.some((r) => g.guard!(r))) return false;
    return true;
  }).map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (i.adminOnly && !roles.includes("SYSTEM_ADMIN")) return false;
      if (i.roles && !i.roles.some((r) => roles.includes(r))) return false;
      return true;
    }),
  })).filter((g) => g.items.length > 0);

  const activeHref = [...visibleRootItems, ...visibleGroups.flatMap((g) => g.items)]
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  const activeGroupLabel =
    visibleGroups.find((g) => g.items.some((i) => i.href === activeHref))?.label ?? null;

  // Ochiq parent: standart holat — joriy sahifaning guruhi. Foydalanuvchi menyuda
  // yursa (parent bosdi / orqaga qaytdi) — override ishlaydi, lekin faqat o'sha yo'l
  // uchun: pathname o'zgarishi bilan override eskiradi va yana avtomatikka qaytadi.
  // (Effekt ham, render paytida setState ham yo'q — sof derive.)
  const [override, setOverride] = useState<{ path: string; open: string | null } | null>(null);
  const openLabel = override && override.path === pathname ? override.open : activeGroupLabel;
  const openGroup = visibleGroups.find((g) => g.label === openLabel) ?? null;

  const openParent = (label: string) => {
    setOverride({ path: pathname, open: label });
    onExpand?.(); // yig'iq bo'lsa — kengaytiramiz, aks holda no-op
  };
  const goBack = () => setOverride({ path: pathname, open: null });

  return (
    <>
      {/* Logo / header */}
      <div className="h-16 flex items-center border-b border-border shrink-0 px-3 gap-2">
        {!collapsed && (
          <Link
            href="/dashboard"
            className="flex-1 flex items-center overflow-hidden"
            onClick={onNavigate}
          >
            <Image
              src="/logo.png"
              alt="BizBop Supermarket"
              width={140}
              height={46}
              priority
              className="h-9 w-auto"
            />
          </Link>
        )}

        {onToggle && (
          <button
            onClick={onToggle}
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors shrink-0",
              collapsed && "mx-auto"
            )}
            title={collapsed ? "Kengaytirish" : "Qisqartirish"}
            aria-label={collapsed ? "Kengaytirish" : "Qisqartirish"}
          >
            {collapsed
              ? <PanelLeftOpen  className="h-4 w-4" />
              : <PanelLeftClose className="h-4 w-4" />
            }
          </button>
        )}
      </div>

      {/* Nav — drill-down: ildiz ro'yxati yoki bitta bo'lim ichi */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2">
        {openGroup && !collapsed ? (
          <div
            key={openGroup.label}
            className="space-y-0.5 duration-200 animate-in fade-in slide-in-from-right-3"
          >
            <button
              type="button"
              onClick={goBack}
              className="mb-1 flex w-full items-center gap-2 rounded-md px-3 py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4 shrink-0" />
              <span className="truncate">{openGroup.label}</span>
            </button>
            {openGroup.items.map((item) => (
              <NavRow
                key={item.href}
                item={item}
                active={item.href === activeHref}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ) : (
          <div
            key="root"
            className={cn(
              "space-y-0.5 duration-200 animate-in fade-in",
              !collapsed && "slide-in-from-left-3"
            )}
          >
            {visibleRootItems.map((item) => (
              <NavRow
                key={item.href}
                item={item}
                active={item.href === activeHref}
                collapsed={collapsed}
                onNavigate={onNavigate}
              />
            ))}

            {visibleRootItems.length > 0 && visibleGroups.length > 0 && (
              <div className="!my-2 border-t border-border/60" />
            )}

            {visibleGroups.map((group) => {
              const Icon = group.icon;
              const activeParent = group.label === activeGroupLabel;
              return (
                <div
                  key={group.label}
                  className="transition-transform duration-150 hover:scale-[1.01] active:scale-[0.98]"
                >
                  <button
                    type="button"
                    onClick={() => openParent(group.label)}
                    title={collapsed ? group.label : undefined}
                    aria-expanded={false}
                    className={cn(
                      "flex w-full items-center rounded-xl text-sm font-medium transition-colors duration-150",
                      collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5",
                      activeParent
                        ? "bg-secondary text-foreground"
                        : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                    )}
                  >
                    <Icon className={cn("h-4 w-4 shrink-0", activeParent ? "opacity-100" : "opacity-70")} />
                    {!collapsed && (
                      <>
                        <span className="flex-1 truncate text-left">{group.label}</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border shrink-0">
        <div className={cn("flex items-center gap-2 px-1", collapsed && "justify-center")}>
          <div className="h-2 w-2 rounded-full shrink-0 bg-primary" />
          {!collapsed && (
            <span className="text-xs text-muted-foreground font-medium truncate">
              {role === "SYSTEM_ADMIN"
                ? "System Admin"
                : role === "ADMIN"
                ? "Admin (ko'rish)"
                : role === "CAT_MANAGER"
                ? "Kategoriya menejeri"
                : role === "CEO"
                ? "CEO"
                : role === "MARKETING"
                ? "Marketing"
                : "Ko'ruvchi"}{" "}
              · v0.1
            </span>
          )}
        </div>
      </div>
    </>
  );
}

export function Sidebar({ role, roles }: { role: Role; roles: Role[] }) {
  const collapsed = useSyncExternalStore(subscribePref, getCollapsedSnapshot, () => false);

  const setCollapsed = (v: boolean) => {
    localStorage.setItem("sidebar-collapsed", String(v));
    emitPref();
  };

  return (
    <aside
      className={cn(
        "hidden md:flex shrink-0 border-r border-border bg-card flex-col shadow-sm transition-all duration-300 ease-in-out",
        collapsed ? "w-[60px]" : "w-64"
      )}
    >
      <SidebarNav
        role={role}
        roles={roles}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        onExpand={() => { if (collapsed) setCollapsed(false); }}
      />
    </aside>
  );
}

export function MobileSidebarTrigger({ role, roles }: { role: Role; roles: Role[] }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Menyu"
      >
        <Menu className="h-5 w-5" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" className="p-0 w-64 flex flex-col bg-card">
          <SheetHeader className="sr-only">
            <SheetTitle>Menyu</SheetTitle>
          </SheetHeader>
          <SidebarNav role={role} roles={roles} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
