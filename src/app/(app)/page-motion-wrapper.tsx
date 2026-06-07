import React from "react";

/**
 * Sahifa kirish animatsiyasi — CSS (tailwindcss-animate). Avval framer-motion edi,
 * lekin u butun layout'ga (global First Load JS ~132KB) tushardi. CSS bilan bepul.
 */
export function PageMotionWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-both">
      {children}
    </div>
  );
}
