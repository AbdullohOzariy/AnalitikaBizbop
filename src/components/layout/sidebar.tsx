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
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
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
  ScanSearch,
  Boxes,
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

// foldedGroups — default: HAMMASI YIG'IQ (barcha guruh nomlari)
const EMPTY_FOLDED = new Set<string>();
let _allFolded: Set<string> | null = null;
function getAllFolded(): Set<string> {
  if (!_allFolded) _allFolded = new Set(NAV_GROUPS.map((g) => g.label));
  return _allFolded;
}
let foldedCache: { raw: string | null; set: Set<string> } = { raw: undefined as unknown as null, set: EMPTY_FOLDED };
function getFoldedSnapshot(): Set<string> {
  const raw = localStorage.getItem("sidebar-folded-groups");
  if (raw === foldedCache.raw) return foldedCache.set;
  let set: Set<string>;
  if (raw === null) {
    set = getAllFolded();
  } else {
    set = EMPTY_FOLDED;
    try { set = new Set(JSON.parse(raw) as string[]); } catch { set = EMPTY_FOLDED; }
  }
  foldedCache = { raw, set };
  return set;
}

// ─── Navigatsiya tuzilmasi ───────────────────────────────────────────────────
const A = "ADMIN" as const;        // read-only admin
const SA = "SYSTEM_ADMIN" as const; // to'liq admin

const NAV_GROUPS: NavGroup[] = [
  {
    label: "Analitika",
    items: [
      { href: "/dashboard",       label: "Dashboard",       icon: LayoutDashboard, roles: [SA, A, "CEO", "SUPPLYCHAIN"] },
      { href: "/sotuv-dashboard", label: "Sotuv Dashboard", icon: Target,          roles: [SA, A, "CEO", "SUPPLYCHAIN"] },
      { href: "/dashboard-v2",    label: "Dashboard v2",    icon: Sparkles,        roles: [SA, A, "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER"] },
      { href: "/oos",             label: "OOS",             icon: PackageX,        roles: [SA, A, "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER"] },
      { href: "/stockday",        label: "Stockday",        icon: Hourglass,       roles: [SA, A, "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER"] },
      { href: "/abc-xyz",         label: "ABC/XYZ",         icon: LayoutGrid,      roles: [SA, A, "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER"] },
      { href: "/pme",             label: "PME analyze",     icon: Gem,             roles: [SA, A, "CAT_MANAGER", "SUPPLYCHAIN", "HEAD_CAT_MANAGER"] },
      { href: "/analyze",         label: "Analyze (narx)",  icon: ScanSearch,      roles: [SA, A, "CAT_MANAGER", "SUPPLYCHAIN", "HEAD_CAT_MANAGER"] },
      { href: "/report",          label: "Hisobot",         icon: Table2,          roles: [SA, A, "SUPPLYCHAIN"] },
      { href: "/rejalar",         label: "Rejalar",         icon: ClipboardList,   roles: [SA, A, "CAT_MANAGER", "CEO", "HEAD_CAT_MANAGER"] },
    ],
  },
  {
    label: "Sotuv",
    items: [
      { href: "/sotuv/bugun",       label: "Bugun",       icon: CalendarCheck, roles: [SA, A, "CAT_MANAGER", "SUPPLYCHAIN", "HEAD_CAT_MANAGER"] },
      { href: "/sotuv/sotib-olish", label: "Sotib olish", icon: ShoppingCart, roles: [SA, A, "CAT_MANAGER", "SUPPLYCHAIN", "HEAD_CAT_MANAGER", "CEO"] },
      { href: "/sverka",            label: "Sverka",      icon: FileCheck2,   roles: [SA, A, "SUPPLYCHAIN", "CEO", "OPERATOR"] },
      { href: "/logistika",         label: "Logistika",   icon: Gauge,        roles: [SA, A, "SUPPLYCHAIN", "HEAD_CAT_MANAGER"], disabled: true },
      { href: "/sotuv/finans",      label: "Finans",      icon: Wallet,       roles: [SA, A, "CEO"] },
    ],
  },
  {
    label: "Hisobdan chiqarish",
    items: [
      { href: "/chiqim",            label: "Chiqimlar",        icon: PackageMinus, roles: [SA, A, "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER", "OPERATOR"] },
      { href: "/chiqim/statistika", label: "Statistika",       icon: ChartPie,     roles: [SA, A, "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER", "OPERATOR"] },
      { href: "/chiqim/vozvratlar", label: "Vozvratlar",       icon: Recycle,      roles: [SA, A, "CAT_MANAGER", "CEO", "SUPPLYCHAIN", "HEAD_CAT_MANAGER", "OPERATOR"] },
      { href: "/chiqim/moslash",    label: "Kategoriya moslash", icon: Tags,       roles: [SA, A] },
    ],
  },
  {
    // INVENTORY izolatsiyasi: bu rol faqat shu guruh item'larida bor (+ auth.config
    // unga /sotuv-dashboard'ni ochadi) — boshqa bo'limlar ko'rinmaydi.
    label: "Inventarizatsiya",
    items: [
      { href: "/inventarizatsiya",         label: "SKU ro'yxati", icon: ClipboardList, roles: [SA, A, "CEO", "INVENTORY"] },
      { href: "/inventarizatsiya/hisobot", label: "Hisobot",      icon: BarChart2,     roles: [SA, A, "CEO", "INVENTORY"] },
    ],
  },
  {
    label: "Baza",
    items: [
      { href: "/baza/sotuv",         label: "Sotuv",             icon: Database,      roles: [SA, A] },
      { href: "/baza/qoldiq",        label: "Qoldiq",            icon: Boxes,         roles: [SA, A] },
      { href: "/baza/tashrif",       label: "Tashriflar",        icon: Footprints,    roles: [SA, A] },
      { href: "/iyerarxiya",         label: "Iyerarxiya",        icon: Tag,           roles: [SA, A] },
      { href: "/baza/taminotchilar", label: "Yetkazib beruvchilar",    icon: Truck,         roles: [SA, A, "SUPPLYCHAIN", "HEAD_CAT_MANAGER", "CAT_MANAGER"] },
      { href: "/baza/moslanmagan",   label: "Moslanmagan",       icon: PackageSearch, roles: [SA, A] },
    ],
  },
  {
    // MERCHANDISER izolatsiyasi: bu guruh canSeePromo predikatiga bog'liq.
    // Boshqa guruhlarning har biri o'z roles[] massiviga ega bo'lib, MERCHANDISER
    // u massiвlarda yo'q — shuning uchun Promo'dan boshqa hech bir guruh ko'rinmaydi.
    label: "Promo",
    guard: canSeePromo,
    items: [
      { href: "/promo/doimiy",  label: "Doimiy aksiyalar", icon: Megaphone, roles: [SA, A, "CAT_MANAGER", "CEO", "HEAD_CAT_MANAGER", "MERCHANDISER"] },
      { href: "/promo/flash",   label: "Flash aksiyalar",  icon: Zap,       roles: [SA, A, "CAT_MANAGER", "CEO", "HEAD_CAT_MANAGER", "MERCHANDISER"] },
      { href: "/promo/hisobot", label: "Hisobot",          icon: BarChart2, roles: [SA, A, "CAT_MANAGER", "CEO", "HEAD_CAT_MANAGER", "MERCHANDISER"] },
    ],
  },
  {
    label: "Tizim",
    items: [
      { href: "/branches",          label: "Filiallar",        icon: Building2, roles: [SA] },
      { href: "/admin/upload",      label: "Fayllar",          icon: Upload,    roles: [SA] },
      { href: "/admin/users",       label: "Foydalanuvchilar", icon: Users,     roles: [SA] },
      { href: "/admin/anketa",      label: "Anketa",           icon: FileText,  roles: [SA, A, "SUPPLYCHAIN"] },
      { href: "/admin/sozlamalar",  label: "Sozlamalar",       icon: Settings,  roles: [SA] },
    ],
  },
];

function SidebarNav({
  role,
  roles,
  collapsed,
  onToggle,
  onNavigate,
}: {
  role: Role; // asosiy rol — pastdagi yorliq uchun
  roles: Role[]; // barcha rollar (union) — ko'rinish/ruxsat uchun
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const foldedGroups = useSyncExternalStore(subscribePref, getFoldedSnapshot, getAllFolded);
  const toggleGroup = (label: string) => {
    const next = new Set(foldedGroups);
    if (next.has(label)) next.delete(label); else next.add(label);
    localStorage.setItem("sidebar-folded-groups", JSON.stringify([...next]));
    emitPref();
  };

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

  const activeHref = visibleGroups
    .flatMap((g) => g.items)
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

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

      {/* Nav items */}
      <nav className="flex-1 p-2 space-y-3 overflow-y-auto">
        {visibleGroups.map((group, gi) => {
          const folded = foldedGroups.has(group.label);
          return (
            <div
              key={group.label}
              className={cn(
                "space-y-0.5",
                collapsed && gi > 0 && "mt-3 border-t border-border/60 pt-3"
              )}
            >
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.label)}
                  title={folded ? "Ochish" : "Yig'ish"}
                  className="flex w-full items-center justify-between rounded-md px-3 pb-1 pt-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
                >
                  <span>{group.label}</span>
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform duration-200",
                      folded && "-rotate-90"
                    )}
                  />
                </button>
              )}
              {(collapsed || !folded) &&
                group.items.map((item) => {
                  const Icon = item.icon;
                  const active = item.href === activeHref;
                  if (item.disabled) {
                    return (
                      <div key={item.href} title="Vaqtinchalik ish faoliyatida emas"
                        className={cn(
                          "relative flex cursor-not-allowed items-center rounded-xl text-sm font-medium text-muted-foreground opacity-50",
                          collapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
                        )}>
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
                    <div
                      key={item.href}
                      className="transition-transform duration-150 hover:scale-[1.01] active:scale-[0.98]"
                    >
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
                })}
            </div>
          );
        })}
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
                : role === "MERCHANDISER"
                ? "Merchandiser"
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

  const toggle = () => {
    localStorage.setItem("sidebar-collapsed", String(!collapsed));
    emitPref();
  };

  return (
    <aside
      className={cn(
        "hidden md:flex shrink-0 border-r border-border bg-card flex-col shadow-sm transition-all duration-300 ease-in-out",
        collapsed ? "w-[60px]" : "w-64"
      )}
    >
      <SidebarNav role={role} roles={roles} collapsed={collapsed} onToggle={toggle} />
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
