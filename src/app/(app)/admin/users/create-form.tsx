"use client";

import { useRef, useState, useTransition } from "react";
import { User, KeyRound, AtSign, Eye, EyeOff, Loader2 } from "lucide-react";
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

// ── Ikonkali input wrapper ────────────────────────────────────────────────────
function InputField({
  id,
  label,
  icon: Icon,
  children,
}: {
  id: string;
  label: string;
  icon: React.ElementType;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </Label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
          <Icon className="h-4 w-4" />
        </span>
        {children}
      </div>
    </div>
  );
}

const ROLE_OPTIONS = [
  { value: "CAT_MANAGER", label: "Kategoriya menejeri", desc: "Dashboard V2, Spisaniya, OOS — faqat ko'rish" },
  { value: "CEO",         label: "CEO",                 desc: "Dashboard V1+V2, Spisaniya, OOS — faqat ko'rish" },
  { value: "ADMIN",       label: "Admin",               desc: "To'liq huquq" },
] as const;

// ── Forma ─────────────────────────────────────────────────────────────────────
export function CreateUserForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [role, setRole]           = useState<"CAT_MANAGER" | "CEO" | "ADMIN">("CAT_MANAGER");
  const [showPass, setShowPass]   = useState(false);
  const [isPending, start]        = useTransition();

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createUserAction({
        name:     String(fd.get("name")     ?? ""),
        email:    String(fd.get("email")    ?? ""),
        password: String(fd.get("password") ?? ""),
        role,
      });
      if (res.ok) {
        toast.success("Foydalanuvchi qo'shildi.");
        formRef.current?.reset();
        setRole("CAT_MANAGER");
        setShowPass(false);
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
      {/* Ism */}
      <InputField id="u-name" label="Ism" icon={User}>
        <Input
          id="u-name"
          name="name"
          placeholder="Abdulloh Bozorov"
          required
          disabled={isPending}
          className="pl-9 h-11 rounded-xl"
        />
      </InputField>

      {/* Login */}
      <InputField id="u-email" label="Login" icon={AtSign}>
        <Input
          id="u-email"
          name="email"
          type="text"
          placeholder="abdulloh"
          required
          disabled={isPending}
          className="pl-9 h-11 rounded-xl"
          autoComplete="off"
        />
      </InputField>

      {/* Parol */}
      <InputField id="u-pass" label="Parol" icon={KeyRound}>
        <Input
          id="u-pass"
          name="password"
          type={showPass ? "text" : "password"}
          placeholder="Kamida 6 belgi"
          required
          minLength={6}
          disabled={isPending}
          className="pl-9 pr-10 h-11 rounded-xl"
          autoComplete="new-password"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => setShowPass((v) => !v)}
          className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
          aria-label={showPass ? "Parolni yashirish" : "Parolni ko'rsatish"}
        >
          {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </InputField>

      {/* Rol */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Rol
        </Label>
        <Select
          value={role}
          onValueChange={(v) => setRole((v as typeof role) ?? "CAT_MANAGER")}
          disabled={isPending}
        >
          <SelectTrigger className="h-11 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {ROLE_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                <div className="flex flex-col py-0.5">
                  <span className="font-medium">{opt.label}</span>
                  <span className="text-xs text-muted-foreground">{opt.desc}</span>
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Submit */}
      <Button
        type="submit"
        disabled={isPending}
        className="w-full h-11 rounded-xl font-semibold mt-2"
      >
        {isPending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Qo'shilmoqda...
          </>
        ) : (
          "Foydalanuvchi qo'shish"
        )}
      </Button>
    </form>
  );
}
