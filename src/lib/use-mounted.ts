"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * SSR'da `false`, brauzerda hydration'dan keyin `true` qaytaradi.
 * `useState`+`useEffect(setMounted(true))` naqshining o'rnini bosadi —
 * set-state-in-effect'siz (kaskadli render bermaydi).
 */
export function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
