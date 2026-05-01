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
      <div className="h-16 flex items-center px-6 border-b">
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
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
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
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
      <div className="p-3 border-t text-xs text-muted-foreground">
        v0.1 · {role === "ADMIN" ? "Admin" : "Ko'ruvchi"}
      </div>
    </>
  );
}

export function Sidebar({ role }: { role: Role }) {
  return (
    <aside className="hidden md:flex w-64 shrink-0 border-r bg-card flex-col">
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
        <SheetContent side="left" className="p-0 w-64 flex flex-col">
          <SheetHeader className="sr-only">
            <SheetTitle>Menyu</SheetTitle>
          </SheetHeader>
          <SidebarNav role={role} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
