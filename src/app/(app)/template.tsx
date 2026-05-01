"use client";

import { useEffect, useState } from "react";

export default function AppTemplate({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Sahifa render bo'lgandan so'ng suzib kirish animatsiyasini 
    // ishga tushirish uchun qisqa kechikish (delay) beramiz
    const timer = setTimeout(() => setMounted(true), 10);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`transition-all duration-500 ease-out transform ${
        mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-3"
      }`}
    >
      {children}
    </div>
  );
}