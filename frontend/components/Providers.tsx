"use client";

import type { ReactNode } from "react";
import { LangProvider } from "@/lib/lang";
import { SessionProvider } from "@/lib/session";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <LangProvider>
      <SessionProvider>
        {children}
      </SessionProvider>
    </LangProvider>
  );
}
