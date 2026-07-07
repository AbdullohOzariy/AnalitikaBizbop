"use client";

import { useRef, useState, useTransition } from "react";
import { User, KeyRound, AtSign, Eye, EyeOff, Loader2, Send } from "lucide-react";
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
import { Check } from "lucide-react";
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
  { value: "CAT_MANAGER",  label: "Kategoriya menejeri", desc: "Dashboard V2, Spisaniya, OOS — faqat ko'rish" },
  { value: "SUPPLYCHAIN",  label: "Supplychain",    desc: "Analitika/sotuv/spisaniya — ko'rish; Yetkazib beruvchilar — to'liq boshqarish" },
  { value: "CEO",          label: "CEO",                 desc: "Dashboard V1+V2, Spisaniya, OOS — faqat ko'rish" },
  { value: "ADMIN",        label: "Bo'lim boshlig'i",    desc: "Hammasini ko'radi (Tizimsiz) + anketalarni tasdiqlaydi" },
  { value: "HEAD_CAT_MANAGER", label: "Kategoriya menejerlari boshi", desc: "BARCHA kategoriyalar bo'yicha menejer ishi + yetkazib beruvchilarni ko'rish" },
  { value: "MERCHANDISER", label: "Merchandayzer",       desc: "Faqat Promo (Aksiyalar) — ko'rish va tahrirlash" },
  { value: "OPERATOR",     label: "Operator",            desc: "Faqat Hisobdan chiqarish + Sverka — kuzatish (read-only)" },
  { value: "INVENTORY",    label: "Inventar xodim",      desc: "Faqat Sotuv dashboard + Inventarizatsiya (mini app)" },
  { value: "SYSTEM_ADMIN", label: "System Admin",        desc: "To'liq huquq — barcha tahrir + Tizim bo'limi" },
] as const;

type RoleV = (typeof ROLE_OPTIONS)[number]["value"];

type BranchOption = { id: number; name: string };

// ── Forma ─────────────────────────────────────────────────────────────────────
export function CreateUserForm({ branches }: { branches: BranchOption[] }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [role, setRole]           = useState<RoleV>("CAT_MANAGER");
  const [extra, setExtra]         = useState<Set<string>>(new Set());
  const [selBranches, setSelBranches] = useState<Set<number>>(new Set());
  const [showPass, setShowPass]   = useState(false);
  const [isPending, start]        = useTransition();

  const changeRole = (v: RoleV) => { setRole(v); setExtra((prev) => { const n = new Set(prev); n.delete(v); return n; }); };
  const toggleExtra = (v: string) => setExtra((prev) => { const n = new Set(prev); if (n.has(v)) n.delete(v); else n.add(v); return n; });
  const toggleBranch = (id: number) => setSelBranches((prev) => { const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  const onSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const res = await createUserAction({
        name:     String(fd.get("name")     ?? ""),
        email:    String(fd.get("email")    ?? ""),
        password: String(fd.get("password") ?? ""),
        role,
        extraRoles: [...extra].filter((r) => r !== role) as RoleV[],
        telegramId: String(fd.get("telegramId") ?? ""),
        branchIds: [...selBranches],
      });
      if (res.ok) {
        toast.success("Foydalanuvchi qo'shildi.");
        formRef.current?.reset();
        setRole("CAT_MANAGER");
        setExtra(new Set());
        setSelBranches(new Set());
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

      {/* Telegram ID (ixtiyoriy) */}
      <InputField id="u-tg" label="Telegram ID (ixtiyoriy)" icon={Send}>
        <Input
          id="u-tg"
          name="telegramId"
          type="text"
          inputMode="numeric"
          pattern="\d{5,15}"
          placeholder="Masalan: 123456789"
          disabled={isPending}
          className="pl-9 h-11 rounded-xl"
          autoComplete="off"
        />
      </InputField>

      {/* Asosiy rol */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Asosiy rol
        </Label>
        <Select
          value={role}
          onValueChange={(v) => changeRole((v as RoleV) ?? "CAT_MANAGER")}
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

      {/* Qo'shimcha rollar */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Qo&apos;shimcha rollar (ixtiyoriy)
        </Label>
        <p className="text-[11px] text-muted-foreground">Tanlangan rollar huquqlari asosiy rolga qo&apos;shiladi (birlashma).</p>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {ROLE_OPTIONS.filter((o) => o.value !== role).map((o) => {
            const on = extra.has(o.value);
            return (
              <button key={o.value} type="button" onClick={() => toggleExtra(o.value)} disabled={isPending}
                title={o.desc}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${on ? "border-primary/40 bg-primary/10 text-primary" : "border-border hover:bg-muted/50"}`}>
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">{o.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filiallar */}
      <div className="space-y-1.5">
        <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Filiallar
        </Label>
        <p className="text-[11px] text-muted-foreground">
          {selBranches.size === 0 ? "Hech biri tanlanmagan — barcha filiallar ochiq." : `${selBranches.size} ta filial tanlandi.`}
        </p>
        <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
          {branches.map((b) => {
            const on = selBranches.has(b.id);
            return (
              <button key={b.id} type="button" onClick={() => toggleBranch(b.id)} disabled={isPending}
                className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${on ? "border-primary/40 bg-primary/10 text-primary" : "border-border hover:bg-muted/50"}`}>
                <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}>
                  {on && <Check className="h-3 w-3" />}
                </span>
                <span className="truncate">{b.name}</span>
              </button>
            );
          })}
        </div>
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
