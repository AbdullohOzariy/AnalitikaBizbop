"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { deleteUserAction, resetPasswordAction } from "./actions";

export function UserActions({
  id,
  name,
  isSelf,
}: {
  id: number;
  name: string;
  role: string;
  isSelf: boolean;
}) {
  const [pwOpen, setPwOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [isPending, start] = useTransition();

  const onDelete = () => {
    if (!confirm(`"${name}" foydalanuvchini o'chirasizmi?`)) return;
    start(async () => {
      const res = await deleteUserAction(id);
      if (res.ok) toast.success("O'chirildi.");
      else toast.error(res.error);
    });
  };

  const onResetPassword = () => {
    if (password.length < 6) {
      toast.error("Parol kamida 6 belgi.");
      return;
    }
    start(async () => {
      const res = await resetPasswordAction({ id, password });
      if (res.ok) {
        toast.success("Parol o'zgartirildi.");
        setPwOpen(false);
        setPassword("");
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          className={cn(
            "inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-muted text-muted-foreground"
          )}
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setPwOpen(true)}>
            Parolni o'zgartirish
          </DropdownMenuItem>
          {!isSelf && (
            <DropdownMenuItem onSelect={onDelete} variant="destructive">
              O'chirish
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Yangi parol — {name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-pw">Parol</Label>
            <Input
              id="new-pw"
              type="password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)}>
              Bekor qilish
            </Button>
            <Button onClick={onResetPassword} disabled={isPending}>
              Saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
