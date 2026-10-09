"use client";

import type { ReactNode } from "react";
import { LangProvider } from "@/lib/lang";
import { SessionProvider } from "@/lib/session";
import SiteHeader from "./SiteHeader";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <LangProvider>
      <SessionProvider>
        <SiteHeader />
        {children}
      </SessionProvider>
    </LangProvider>
  );
}
