import { Suspense } from "react";
import Image from "next/image";
import { LoginForm } from "./login-form";

export default function LoginPage() {
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-md space-y-6">
        <div className="flex flex-col items-center text-center space-y-3">
          <Image
            src="/logo.png"
            alt="BizBop Supermarket"
            width={280}
            height={92}
            priority
            className="h-16 w-auto"
          />
          <p className="text-sm text-muted-foreground">
            Savdo analitika platformasi
          </p>
        </div>
        <Suspense fallback={null}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
