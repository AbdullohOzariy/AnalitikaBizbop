import { signOut } from "@/auth";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
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
    <header className="h-16 border-b bg-card px-4 sm:px-6 flex items-center justify-between gap-2">
      <MobileSidebarTrigger role={user.role} />
      <div className="flex items-center gap-2 sm:gap-3 ml-auto">
        <ThemeToggle />
        <div className="text-right hidden sm:block">
          <div className="text-sm font-medium leading-tight">{user.name}</div>
          <div className="text-xs text-muted-foreground">{user.email}</div>
        </div>
        <Avatar className="h-9 w-9">
          <AvatarFallback className="text-xs">{initials}</AvatarFallback>
        </Avatar>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/login" });
          }}
        >
          <Button type="submit" variant="ghost" size="icon" title="Chiqish">
            <LogOut className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </header>
  );
}
