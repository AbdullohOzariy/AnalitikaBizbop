"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  Upload,
  Building2,
  Tag,
  Target,
  Files,
  Users,
  LayoutDashboard,
  Menu,
  Table2,
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
};

const NAV: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/branches", label: "Filiallar", icon: Building2 },
  { href: "/categories", label: "Kategoriyalar", icon: Tag },
  { href: "/report", label: "Hisobot", icon: Table2 },
  { href: "/admin/upload", label: "Fayl yuklash", icon: Upload, adminOnly: true },
  { href: "/admin/files", label: "Yuklangan fayllar", icon: Files, adminOnly: true },
  { href: "/admin/plans", label: "Normal Reja", icon: Target, adminOnly: true },
  { href: "/admin/users", label: "Foydalanuvchilar", icon: Users, adminOnly: true },
];

function SidebarNav({
  role,
  onNavigate,
}: {
  role: Role;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const items = NAV.filter((i) => !i.adminOnly || role === "ADMIN");
  return (
    <>
      {/* Logo */}
      <div className="h-16 flex items-center px-5 border-b border-border">
        <Link
          href="/dashboard"
          className="flex items-center"
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
      </div>

      {/* Nav items */}
      <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-150",
                active
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-secondary hover:text-foreground"
              )}
            >
              <Icon
                className={cn(
                  "h-4 w-4 shrink-0",
                  active ? "opacity-100" : "opacity-70"
                )}
              />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <div className="flex items-center gap-2 px-1">
          <div
            className="h-2 w-2 rounded-full"
            style={{ backgroundColor: "oklch(0.877 0.165 134)" }}
          />
          <span className="text-xs text-muted-foreground font-medium">
            {role === "ADMIN" ? "Administrator" : "Ko'ruvchi"} · v0.1
          </span>
        </div>
      </div>
    </>
  );
}

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="hidden md:flex w-64 shrink-0 border-r border-border bg-card flex-col shadow-sm">
      <SidebarNav role={role} />
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
