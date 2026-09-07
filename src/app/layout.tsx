import type { Metadata } from "next";
import { cookies } from "next/headers";
import { Header } from "@/components/Header";
import { LanguageProvider } from "@/components/LanguageProvider";
import { MarketplaceProvider } from "@/components/MarketplaceProvider";
import { getDictionary, type Locale } from "@/lib/i18n";
import { Providers } from "./providers";
import "./marketplace.css";
import "./community.css";

export const metadata: Metadata = {
  title: { default: "Agent Marketplace", template: "%s | Agent Marketplace" },
  description: "Descoperă, distribuie și guvernează agenți Microsoft 365 Copilot și Copilot Studio.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = ((await cookies()).get("marketplace-locale")?.value === "en" ? "en" : "ro") as Locale;
  return <html lang={locale}><body><LanguageProvider locale={locale} dictionary={getDictionary(locale)}><Providers><MarketplaceProvider><a className="skip-link" href="#main-content">{locale === "ro" ? "Sari la conținut" : "Skip to content"}</a><Header /><main id="main-content">{children}</main></MarketplaceProvider></Providers></LanguageProvider></body></html>;
}
