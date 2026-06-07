"use client";

import { useState, useId, useSyncExternalStore } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  Upload,
  Building2,
  Tag,
  Target,
  Users,
  LayoutDashboard,
  Menu,
  Table2,
  Sparkles,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Database,
  BarChart2,
  Footprints,
  CalendarDays,
  PackageMinus,
  PackageX,
  ChartPie,
  Recycle,
  Settings,
  Truck,
  PackageSearch,
  ShoppingCart,
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

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
  roles?: Role[]; // faqat shu rollar ko'radi (bo'sh = hammasi)
};

type NavGroup = { label: string; items: NavItem[] };

// ─── localStorage UI sozlamalari (set-state-in-effect'siz, SSR-xavfsiz) ────────
// useSyncExternalStore — SSR'da getServerSnapshot, hydration'dan keyin getSnapshot.
const PREF_EVENT = "sidebar-pref";
function subscribePref(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(PREF_EVENT, cb);
  window.addEventListener("storage", cb); // boshqa tab'dagi o'zgarish ham aks etsin
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
// foldedGroups — Set bo'lgani uchun getSnapshot STABIL havola qaytarishi shart
// (aks holda useSyncExternalStore cheksiz render qiladi) — shu sabab keshlaymiz.
const EMPTY_FOLDED = new Set<string>();
// Birinchi kirish (saqlangan sozlama yo'q) uchun standart: barcha parent guruhlar yig'ilgan.
// NAV_GROUPS pastda e'lon qilingani sabab lazy (chaqiruv paytida tayyor) + keshlangan.
let _allFolded: Set<string> | null = null;
function getAllFolded(): Set<string> {
  if (!_allFolded) _allFolded = new Set(NAV_GROUPS.map((g) => g.label));
  return _allFolded;
}
let foldedCache: { raw: string | null; set: Set<string> } = { raw: null, set: EMPTY_FOLDED };
function getFoldedSnapshot(): Set<string> {
  const raw = localStorage.getItem("sidebar-folded-groups");
  if (raw === foldedCache.raw) return foldedCache.set;
  // raw === null — hech qachon o'zgartirilmagan → standart: hammasi yig'ilgan.
  // raw === "[]" — foydalanuvchi ataylab hammasini ochgan (bo'sh to'plam saqlangan).
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

// Bo'limlar tartibi muhim — "Tizim" doim oxirida turadi.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Baza",
    items: [
      { href: "/baza/sotuv",          label: "Sotuv",        icon: Database,     roles: ["ADMIN"] },
      { href: "/baza/metrika",        label: "Metrikalar",   icon: BarChart2,    roles: ["ADMIN"] },
      { href: "/baza/tashrif",        label: "Tashriflar",   icon: Footprints,   roles: ["ADMIN"] },
      { href: "/baza/reja",           label: "Rejalar",      icon: CalendarDays, roles: ["ADMIN"] },
      { href: "/iyerarxiya",          label: "Iyerarxiya",   icon: Tag,          roles: ["ADMIN"] },
      { href: "/baza/taminotchilar",  label: "Ta'minotchilar", icon: Truck,      roles: ["ADMIN"] },
      { href: "/baza/moslanmagan",    label: "Moslanmagan",  icon: PackageSearch, roles: ["ADMIN"] },
    ],
  },
  {
    label: "Sotuv",
    items: [
      { href: "/sotuv/sotib-olish", label: "Sotib olish", icon: ShoppingCart, roles: ["ADMIN", "CAT_MANAGER"] },
    ],
  },
  {
    label: "Analitika",
    items: [
      { href: "/dashboard",    label: "Dashboard",       icon: LayoutDashboard, roles: ["ADMIN", "CEO"] },
      { href: "/dashboard-v2", label: "Dashboard v2",    icon: Sparkles,        roles: ["ADMIN", "CAT_MANAGER", "CEO"] },
      { href: "/oos",          label: "OOS",             icon: PackageX,        roles: ["ADMIN", "CAT_MANAGER", "CEO"] },
      { href: "/branches",     label: "Filiallar",        icon: Building2,       roles: ["ADMIN"] },
      { href: "/report",       label: "Hisobot",          icon: Table2,          roles: ["ADMIN"] },
      { href: "/admin/upload", label: "Fayllar",          icon: Upload,          adminOnly: true },
      { href: "/admin/plans",  label: "Normal Reja",      icon: Target,          adminOnly: true },
    ],
  },
  {
    label: "Hisobdan chiqarish",
    items: [
      { href: "/chiqim",            label: "Chiqimlar",         icon: PackageMinus, roles: ["ADMIN", "CAT_MANAGER", "CEO"] },
      { href: "/chiqim/statistika", label: "Statistika",        icon: ChartPie,     roles: ["ADMIN", "CAT_MANAGER", "CEO"] },
      { href: "/chiqim/vozvratlar", label: "Vozvratlar",        icon: Recycle,      roles: ["ADMIN", "CAT_MANAGER", "CEO"] },
    ],
  },
  {
    label: "Tizim",
    items: [
      { href: "/admin/users",     label: "Foydalanuvchilar", icon: Users,    adminOnly: true },
      { href: "/admin/sozlamalar", label: "Sozlamalar",      icon: Settings, adminOnly: true },
    ],
  },
];

function SidebarNav({
  role,
  collapsed,
  onToggle,
  onNavigate,
}: {
  role: Role;
  collapsed?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const activeLayoutId = useId(); // har sidebar instansiyasi (desktop/mobil) uchun noyob

  // Yig'ilgan (svernut) parent bo'limlar — localStorage'da saqlanadi
  const foldedGroups = useSyncExternalStore(subscribePref, getFoldedSnapshot, getAllFolded);
  const toggleGroup = (label: string) => {
    const next = new Set(foldedGroups);
    if (next.has(label)) next.delete(label); else next.add(label);
    localStorage.setItem("sidebar-folded-groups", JSON.stringify([...next]));
    emitPref();
  };

  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (i.adminOnly && role !== "ADMIN") return false;
      if (i.roles && !i.roles.includes(role)) return false;
      return true;
    }),
  })).filter((g) => g.items.length > 0);

  // Faqat ENG ANIQ (eng uzun) mos keladigan havola active bo'ladi.
  // Aks holda "/chiqim" ham, "/chiqim/vozvratlar" ham bir vaqtda active bo'lib,
  // bir xil layoutId bilan ikki "pill" animatsiya qilib, oq artefakt paydo bo'ladi.
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

      {/* Nav items — bo'limlarga guruhlangan */}
      <nav className="flex-1 p-2 space-y-3 overflow-y-auto">
        {visibleGroups.map((group, gi) => {
          const folded = foldedGroups.has(group.label);
          return (
          <div
            key={group.label}
            className={cn(
              "space-y-0.5",
              // yig'iq holatda guruhlar orasida nozik chiziq (birinchisidan tashqari)
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
                <ChevronDown className={cn("h-3.5 w-3.5 shrink-0 text-muted-foreground/70 transition-transform", folded && "-rotate-90")} />
              </button>
            )}
            {(collapsed || !folded) && group.items.map((item) => {
              const Icon = item.icon;
              const active = item.href === activeHref;
              return (
                <motion.div
                  key={item.href}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
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
                      <motion.span
                        layoutId={activeLayoutId}
                        className="absolute inset-0 bg-brand-gradient shadow-brand rounded-xl"
                        style={{ zIndex: -1 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                      />
                    )}
                    <Icon className={cn("h-4 w-4 shrink-0", active ? "opacity-100" : "opacity-70")} />
                    {!collapsed && item.label}
                  </Link>
                </motion.div>
              );
            })}
          </div>
        ); })}
      </nav>

      {/* Footer */}
      <div className="p-3 border-t border-border shrink-0">
        <div className={cn("flex items-center gap-2 px-1", collapsed && "justify-center")}>
          <div className="h-2 w-2 rounded-full shrink-0 bg-primary" />
          {!collapsed && (
            <span className="text-xs text-muted-foreground font-medium truncate">
              {role === "ADMIN" ? "Administrator" : role === "CAT_MANAGER" ? "Kategoriya menejeri" : role === "CEO" ? "CEO" : "Ko'ruvchi"} · v0.1
            </span>
          )}
        </div>
      </div>
    </>
  );
}

export function Sidebar({ role }: { role: Role }) {
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
      <SidebarNav role={role} collapsed={collapsed} onToggle={toggle} />
    </aside>
  );
}

export function MobileSidebarTrigger({ role }: { role: Role }) {
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
          <SidebarNav role={role} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
