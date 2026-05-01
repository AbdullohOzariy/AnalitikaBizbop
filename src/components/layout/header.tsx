import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { LogOut, Bell } from "lucide-react";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import type { Session } from "next-auth";
import { MobileSidebarTrigger } from "./sidebar";
import { ThemeToggle } from "./theme-toggle";

export function Header({ user }: { user: Session["user"] }) {
  const initials = (user.name ?? user.email ?? "?")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <header className="h-16 border-b border-border bg-card px-4 sm:px-6 flex items-center justify-between gap-2 shadow-sm">
      <MobileSidebarTrigger role={user.role} />

      <div className="flex items-center gap-2 sm:gap-3 ml-auto">
        <ThemeToggle />

        {/* Notification bell */}
        <Button variant="ghost" size="icon" className="relative text-muted-foreground hover:text-foreground">
          <Bell className="h-4 w-4" />
        </Button>

        {/* Divider */}
        <div className="h-6 w-px bg-border hidden sm:block" />

        <div className="text-right hidden sm:block">
          <div className="text-sm font-semibold leading-tight">{user.name}</div>
          <div className="text-xs text-muted-foreground">{user.email}</div>
        </div>

        <Avatar className="h-9 w-9 ring-2 ring-primary/30">
          <AvatarFallback
            className="text-xs font-semibold"
            style={{
              background: "linear-gradient(135deg, oklch(0.877 0.165 134), oklch(0.73 0.17 48))",
              color: "oklch(0.18 0.04 145)",
            }}
          >
            {initials}
          </AvatarFallback>
        </Avatar>

        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <Button
            type="submit"
            variant="ghost"
            size="icon"
            title="Chiqish"
            className="text-muted-foreground hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}
