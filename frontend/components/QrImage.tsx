"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

// Draws the QR for any text. Greys out when `dim` is set, for example after it expires.
export default function QrImage({ text, size = 240, dim = false, label }: { text: string; size?: number; dim?: boolean; label: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    QRCode.toDataURL(text, { width: size, margin: 2, errorCorrectionLevel: "M" })
      .then((url) => {
        if (live) setSrc(url);
      })
      .catch(() => {
        if (live) setSrc(null);
      });
    return () => {
      live = false;
    };
  }, [text, size]);

  if (!src) return <div className="qrbox" style={{ width: size, height: size }} aria-hidden="true" />;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={`qrbox ${dim ? "dim" : ""}`} src={src} width={size} height={size} alt={label} />
  );
}
