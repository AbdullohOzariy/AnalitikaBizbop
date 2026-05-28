"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { createUserAction } from "./actions";

export function CreateUserForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [role, setRole] = useState("VIEWER");
  const [isPending, start] = useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createUserAction({
        name: String(fd.get("name") ?? ""),
        email: String(fd.get("email") ?? ""),
        password: String(fd.get("password") ?? ""),
        role: role as "ADMIN" | "VIEWER" | "CAT_MANAGER",
      });
      if (res.ok) {
        toast.success("Foydalanuvchi qo'shildi.");
        formRef.current?.reset();
        setRole("VIEWER");
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="u-name">Ism</Label>
        <Input id="u-name" name="name" required disabled={isPending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="u-email">Email</Label>
        <Input id="u-email" name="email" type="email" required disabled={isPending} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="u-pass">Parol</Label>
        <Input id="u-pass" name="password" type="password" required minLength={6} disabled={isPending} />
      </div>
      <div className="space-y-2">
        <Label>Rol</Label>
        <Select value={role} onValueChange={(v) => setRole(v ?? "VIEWER")} disabled={isPending}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="VIEWER">Ko'ruvchi</SelectItem>
            <SelectItem value="CAT_MANAGER">Kategoriya menejeri</SelectItem>
            <SelectItem value="ADMIN">Admin</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={isPending} className="w-full">
        {isPending ? "Qo'shilmoqda..." : "Qo'shish"}
      </Button>
    </form>
  );
}
