"use client";

import { useState, useEffect, useId } from "react";
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

// Bo'limlar tartibi muhim — "Tizim" doim oxirida turadi.
const NAV_GROUPS: NavGroup[] = [
  {
    label: "Analitika",
    items: [
      { href: "/dashboard",    label: "Dashboard",       icon: LayoutDashboard, roles: ["ADMIN", "VIEWER"] },
      { href: "/dashboard-v2", label: "Dashboard v2",    icon: Sparkles },
      { href: "/branches",     label: "Filiallar",        icon: Building2,       roles: ["ADMIN", "VIEWER"] },
      { href: "/iyerarxiya",   label: "Iyerarxiya",       icon: Tag },
      { href: "/report",       label: "Hisobot",          icon: Table2,          roles: ["ADMIN", "VIEWER"] },
      { href: "/admin/upload", label: "Fayllar",          icon: Upload,          adminOnly: true },
      { href: "/admin/plans",  label: "Normal Reja",      icon: Target,          adminOnly: true },
    ],
  },
  {
    label: "Baza",
    items: [
      { href: "/baza/sotuv",   label: "Sotuv",      icon: Database,     roles: ["ADMIN", "CAT_MANAGER"] },
      { href: "/baza/metrika", label: "Metrikalar",  icon: BarChart2,    roles: ["ADMIN", "CAT_MANAGER"] },
      { href: "/baza/tashrif", label: "Tashriflar",  icon: Footprints,   roles: ["ADMIN", "CAT_MANAGER"] },
      { href: "/baza/reja",    label: "Rejalar",     icon: CalendarDays, roles: ["ADMIN", "CAT_MANAGER"] },
    ],
  },
  // Keyinroq: { label: "Hisobdan chiqarish", items: [ ... ] },
  {
    label: "Tizim",
    items: [
      { href: "/admin/users", label: "Foydalanuvchilar", icon: Users, adminOnly: true },
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
  const [foldedGroups, setFoldedGroups] = useState<Set<string>>(new Set());
  useEffect(() => {
    const saved = localStorage.getItem("sidebar-folded-groups");
    if (saved) {
      try { setFoldedGroups(new Set(JSON.parse(saved) as string[])); } catch {}
    }
  }, []);
  const toggleGroup = (label: string) =>
    setFoldedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label); else next.add(label);
      localStorage.setItem("sidebar-folded-groups", JSON.stringify([...next]));
      return next;
    });

  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => {
      if (i.adminOnly && role !== "ADMIN") return false;
      if (i.roles && !i.roles.includes(role)) return false;
      return true;
    }),
  })).filter((g) => g.items.length > 0);

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
              const active =
                pathname === item.href || pathname.startsWith(item.href + "/");
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
                        className="absolute inset-0 bg-primary rounded-xl"
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
              {role === "ADMIN" ? "Administrator" : role === "CAT_MANAGER" ? "Kategoriya menejeri" : "Ko'ruvchi"} · v0.1
            </span>
          )}
        </div>
      </div>
    </>
  );
}

export function Sidebar({ role }: { role: Role }) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    if (saved === "true") setCollapsed(true);
  }, []);

  const toggle = () =>
    setCollapsed((prev) => {
      localStorage.setItem("sidebar-collapsed", String(!prev));
      return !prev;
    });

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
