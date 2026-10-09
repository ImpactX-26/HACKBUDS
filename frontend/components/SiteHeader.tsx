"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { useLang } from "@/lib/lang";
import { useSession } from "@/lib/session";

export default function SiteHeader() {
  const { lang, setLang, t } = useLang();
  const { role, reset } = useSession();
  const router = useRouter();

  return (
    <header className="site-header wrap">
      <Link href="/" className="brand">{t("brand")}</Link>
      <div className="row">
        {role && (
          <button
            className="linklike"
            onClick={() => {
              void api.reset();
              reset();
              router.push("/");
            }}
          >
            {t("startOver")}
          </button>
        )}
        <div className="seg" role="group" aria-label={t("language")}>
          <button aria-pressed={lang === "en"} onClick={() => setLang("en")}>EN</button>
          <button aria-pressed={lang === "kn"} onClick={() => setLang("kn")}>ಕನ್ನಡ</button>
        </div>
      </div>
    </header>
  );
}
