import { Suspense } from "react";
import Image from "next/image";
import { TrendingUp, ArrowDownUp, Target, ShieldCheck } from "lucide-react";
import { LoginForm } from "./login-form";

const FEATURES = [
  { icon: TrendingUp, title: "Savdo analitikasi", desc: "Filial × kategoriya × davr kesimida" },
  { icon: ArrowDownUp, title: "Chiqim va vozvrat", desc: "Spisaniya, qaytarish, kafe hisobi" },
  { icon: Target, title: "Reja va bajarilish", desc: "Kunlik va oylik rejalar nazorati" },
];

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-1">
      {/* ── Chap: brend paneli (lg+) ── */}
      <div className="relative hidden w-1/2 overflow-hidden bg-gradient-to-br from-emerald-500 via-emerald-600 to-green-800 lg:flex lg:flex-col">
        {/* dekor */}
        <div className="pointer-events-none absolute -left-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -right-16 h-[28rem] w-[28rem] rounded-full bg-lime-300/20 blur-3xl" />
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
            backgroundSize: "44px 44px",
          }}
        />

        <div className="relative z-10 flex h-full flex-col justify-between p-12 text-white">
          {/* wordmark */}
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/15 backdrop-blur">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">BizBop Analitika</span>
          </div>

          {/* markaz */}
          <div className="max-w-md space-y-8">
            <div className="space-y-3">
              <h2 className="text-3xl font-bold leading-tight tracking-tight">
                Supermarket biznesingiz — bitta platformada
              </h2>
              <p className="text-sm text-white/80">
                Savdo, chiqim va rejalarni real vaqtda kuzating. To&apos;g&apos;ri qarorlar — aniq raqamlar asosida.
              </p>
            </div>
            <ul className="space-y-4">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/15 backdrop-blur">
                    <f.icon className="h-[1.1rem] w-[1.1rem]" />
                  </div>
                  <div>
                    <div className="text-sm font-semibold">{f.title}</div>
                    <div className="text-xs text-white/70">{f.desc}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <p className="text-xs text-white/60">analitika.oilagroup.uz · © {new Date().getFullYear()} BizBop · by #Bozorov</p>
        </div>
      </div>

      {/* ── O'ng: forma ── */}
      <div className="flex w-full flex-col items-center justify-center px-5 py-10 lg:w-1/2">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center text-center">
            <Image src="/logo.png" alt="BizBop" width={280} height={92} priority className="h-14 w-auto" />
            <h1 className="mt-5 text-2xl font-bold tracking-tight">Tizimga kirish</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              Hisobingizga kirish uchun login va parolni kiriting
            </p>
          </div>

          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <Suspense fallback={null}>
              <LoginForm />
            </Suspense>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground lg:hidden">
            © {new Date().getFullYear()} BizBop Analitika · by #Bozorov
          </p>
        </div>
      </div>
    </div>
  );
}
