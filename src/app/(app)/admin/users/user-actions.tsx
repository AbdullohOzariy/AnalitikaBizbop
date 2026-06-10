"use client";

import { useMemo, useState, useTransition } from "react";
import { KeyRound, Trash2, MoreVertical, Eye, EyeOff, Loader2, FolderTree, Check, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { deleteUserAction, resetPasswordAction, setUserCategoriesAction, updateUserAction } from "./actions";

const ROLE_OPTS = [
  { v: "SYSTEM_ADMIN", l: "System Admin", d: "To'liq huquq + Tizim" },
  { v: "ADMIN",        l: "Admin (ko'rish)", d: "Tizimdan boshqa hammasi — faqat ko'rish" },
  { v: "CAT_MANAGER",  l: "Kategoriya menejeri", d: "O'z kategoriyalari" },
  { v: "SUPPLYCHAIN",  l: "Supplychain", d: "Analitika ko'rish + Ta'minotchilar boshqaruvi" },
  { v: "CEO",          l: "CEO", d: "Ko'rish (Dashboard V1+V2)" },
] as const;
const ROLE_LABEL: Record<string, string> = Object.fromEntries(ROLE_OPTS.map((o) => [o.v, o.l]));

type CatOption = { id: number; name: string; group: string | null };

export function UserActions({
  id,
  name,
  email,
  role,
  isSelf,
  categories,
  managedCategoryIds,
}: {
  id: number;
  name: string;
  email: string;
  role: string;
  isSelf: boolean;
  categories: CatOption[];
  managedCategoryIds: number[];
}) {
  const [pwOpen, setPwOpen]       = useState(false);
  const [delOpen, setDelOpen]     = useState(false);
  const [catOpen, setCatOpen]     = useState(false);
  const [editOpen, setEditOpen]   = useState(false);
  const [password, setPassword]   = useState("");
  const [showPass, setShowPass]   = useState(false);
  const [selected, setSelected]   = useState<Set<number>>(new Set(managedCategoryIds));
  const [isPending, start]        = useTransition();

  // Tahrirlash formasi holati
  const [eName, setEName] = useState(name);
  const [eEmail, setEEmail] = useState(email);
  const [eRole, setERole] = useState(role);
  const openEdit = () => { setEName(name); setEEmail(email); setERole(role); setEditOpen(true); };
  const onSaveEdit = () => {
    if (!eName.trim() || !eEmail.trim()) { toast.error("Nom va login bo'sh bo'lmasin."); return; }
    start(async () => {
      const res = await updateUserAction({ id, name: eName.trim(), email: eEmail.trim(), role: eRole as "SYSTEM_ADMIN" | "ADMIN" | "CAT_MANAGER" | "CEO" | "SUPPLYCHAIN" });
      if (res.ok) { toast.success("Saqlandi."); setEditOpen(false); }
      else toast.error(res.error);
    });
  };

  // Kategoriyalarni guruh bo'yicha guruhlash (dialog uchun)
  const byGroup = useMemo(() => {
    const m = new Map<string, CatOption[]>();
    for (const c of categories) {
      const g = c.group ?? "—";
      if (!m.has(g)) m.set(g, []);
      m.get(g)!.push(c);
    }
    return [...m.entries()];
  }, [categories]);

  const toggleCat = (cid: number) =>
    setSelected((prev) => { const n = new Set(prev); if (n.has(cid)) n.delete(cid); else n.add(cid); return n; });

  const onSaveCats = () => {
    start(async () => {
      const res = await setUserCategoriesAction(id, [...selected]);
      if (res.ok) { toast.success("Kategoriyalar saqlandi."); setCatOpen(false); }
      else toast.error(res.error);
    });
  };

  // ── Parol o'zgartirish ──────────────────────────────────────────────────────
  const onResetPassword = () => {
    if (password.length < 6) {
      toast.error("Parol kamida 6 belgi bo'lishi kerak.");
      return;
    }
    start(async () => {
      const res = await resetPasswordAction({ id, password });
      if (res.ok) {
        toast.success("Parol muvaffaqiyatli o'zgartirildi.");
        setPwOpen(false);
        setPassword("");
        setShowPass(false);
      } else {
        toast.error(res.error);
      }
    });
  };

  // ── O'chirish ───────────────────────────────────────────────────────────────
  const onDelete = () => {
    start(async () => {
      const res = await deleteUserAction(id);
      if (res.ok) {
        toast.success("Foydalanuvchi o'chirildi.");
        setDelOpen(false);
      } else {
        toast.error(res.error);
      }
    });
  };

  return (
    <>
      {/* Amallar menyusi */}
      <DropdownMenu>
        <DropdownMenuTrigger
          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 hover:bg-muted group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-none transition-opacity"
          aria-label="Amallar"
        >
          <MoreVertical className="h-4 w-4" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={openEdit} className="gap-2">
            <Pencil className="h-3.5 w-3.5" />
            Tahrirlash
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => { setPwOpen(true); setPassword(""); setShowPass(false); }}
            className="gap-2"
          >
            <KeyRound className="h-3.5 w-3.5" />
            Parolni o'zgartirish
          </DropdownMenuItem>

          {role === "CAT_MANAGER" && categories.length > 0 && (
            <DropdownMenuItem
              onClick={() => { setSelected(new Set(managedCategoryIds)); setCatOpen(true); }}
              className="gap-2"
            >
              <FolderTree className="h-3.5 w-3.5" />
              Kategoriyalar
            </DropdownMenuItem>
          )}

          {!isSelf && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={() => setDelOpen(true)}
                variant="destructive"
                className="gap-2"
              >
                <Trash2 className="h-3.5 w-3.5" />
                O'chirish
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Tahrirlash dialogi (nom / login / rol) */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Foydalanuvchini tahrirlash</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Nom, login va rolni o&apos;zgartiring.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Ism</Label>
              <Input value={eName} onChange={(e) => setEName(e.target.value)} disabled={isPending} className="h-10 rounded-xl" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Login</Label>
              <Input value={eEmail} onChange={(e) => setEEmail(e.target.value)} disabled={isPending} className="h-10 rounded-xl" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Rol</Label>
              <Select items={ROLE_LABEL} value={eRole} onValueChange={(v) => v && setERole(v)} disabled={isPending}>
                <SelectTrigger className="h-10 w-full rounded-xl"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTS.map((o) => (
                    <SelectItem key={o.v} value={o.v}>
                      <span className="flex flex-col">
                        <span className="text-sm">{o.l}</span>
                        <span className="text-[11px] text-muted-foreground">{o.d}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {isSelf && eRole !== "SYSTEM_ADMIN" && (
                <p className="text-xs text-destructive">O&apos;z rolingizni System Admin&apos;dan o&apos;zgartira olmaysiz.</p>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={isPending} className="rounded-xl">Bekor</Button>
            <Button onClick={onSaveEdit} disabled={isPending || (isSelf && eRole !== "SYSTEM_ADMIN")} className="rounded-xl">
              {isPending ? <><Loader2 className="mr-1.5 h-4 w-4 animate-spin" />Saqlanmoqda...</> : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Parol o'zgartirish dialogi */}
      <Dialog open={pwOpen} onOpenChange={(o) => { setPwOpen(o); if (!o) { setPassword(""); setShowPass(false); } }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Parolni o'zgartirish</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{name}</span> uchun yangi parol o'rnating.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5 py-2">
            <Label htmlFor="reset-pw" className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Yangi parol
            </Label>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                <KeyRound className="h-4 w-4" />
              </span>
              <Input
                id="reset-pw"
                type={showPass ? "text" : "password"}
                placeholder="Kamida 6 belgi"
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") onResetPassword(); }}
                disabled={isPending}
                className="pl-9 pr-10 h-11 rounded-xl"
                autoComplete="new-password"
                autoFocus
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPass((v) => !v)}
                className="absolute inset-y-0 right-3 flex items-center text-muted-foreground hover:text-foreground transition-colors"
                aria-label={showPass ? "Yashirish" : "Ko'rsatish"}
              >
                {showPass ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {password.length > 0 && password.length < 6 && (
              <p className="text-xs text-destructive">Kamida 6 belgi kiriting.</p>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setPwOpen(false)}
              disabled={isPending}
              className="rounded-xl"
            >
              Bekor qilish
            </Button>
            <Button
              onClick={onResetPassword}
              disabled={isPending || password.length < 6}
              className="rounded-xl"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  Saqlanmoqda...
                </>
              ) : (
                "Saqlash"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* O'chirish tasdiqlash dialogi */}
      <Dialog open={delOpen} onOpenChange={setDelOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Foydalanuvchini o'chirish</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{name}</span> o'chiriladi. Bu amalni qaytarib bo'lmaydi.
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className="gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => setDelOpen(false)}
              disabled={isPending}
              className="rounded-xl"
            >
              Bekor qilish
            </Button>
            <Button
              variant="destructive"
              onClick={onDelete}
              disabled={isPending}
              className="rounded-xl"
            >
              {isPending ? (
                <>
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  O'chirilmoqda...
                </>
              ) : (
                "Ha, o'chirish"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Javobgar kategoriyalar dialogi */}
      <Dialog open={catOpen} onOpenChange={(o) => { setCatOpen(o); if (!o) setSelected(new Set(managedCategoryIds)); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Javobgar kategoriyalar</DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">{name}</span> qaysi kategoriyalarga javobgar? Bir nechtasini belgilash mumkin.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-[55vh] space-y-3 overflow-y-auto py-1">
            {byGroup.map(([g, cats]) => (
              <div key={g} className="space-y-1.5">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{g}</p>
                <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                  {cats.map((c) => {
                    const on = selected.has(c.id);
                    return (
                      <button key={c.id} type="button" onClick={() => toggleCat(c.id)} disabled={isPending}
                        className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition-colors ${on ? "border-primary/40 bg-primary/10 text-primary" : "border-border hover:bg-muted/50"}`}>
                        <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40"}`}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                        <span className="truncate">{c.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2">
            <span className="mr-auto self-center text-xs text-muted-foreground">{selected.size} ta tanlandi</span>
            <Button variant="outline" className="rounded-xl" disabled={isPending} onClick={() => setCatOpen(false)}>Bekor</Button>
            <Button className="rounded-xl" disabled={isPending} onClick={onSaveCats}>
              {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Saqlash"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
