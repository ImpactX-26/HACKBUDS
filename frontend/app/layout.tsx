import type { Metadata, Viewport } from "next";
import Providers from "@/components/Providers";
import "./globals.css";
import "./product.css";

export const metadata: Metadata = {
  title: "GigVault",
  description: "Prove your work history without showing your bank statement.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
