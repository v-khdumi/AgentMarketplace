import Link from "next/link";
import { cookies } from "next/headers";
import { getDictionary, type Locale } from "@/lib/i18n";

export default async function NotFound() {
  const locale = ((await cookies()).get("marketplace-locale")?.value === "en" ? "en" : "ro") as Locale;
  const t = getDictionary(locale);
  return <div className="page-width page-content"><div className="empty-state"><span className="eyebrow">404</span><h1>{t.notFound}</h1><p>{t.notFoundText}</p><Link className="button primary" href="/">{t.backCatalog}</Link></div></div>;
}
