"use client";

import { createContext, useContext } from "react";
import type { Dictionary, Locale } from "@/lib/i18n";

const LanguageContext = createContext<{ locale: Locale; t: Dictionary } | null>(null);

export function LanguageProvider({ locale, dictionary, children }: { locale: Locale; dictionary: Dictionary; children: React.ReactNode }) {
  return <LanguageContext.Provider value={{ locale, t: dictionary }}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider");
  return context;
}

export function LanguageSwitch() {
  const { locale, t } = useLanguage();
  const changeLanguage = () => {
    const next = locale === "ro" ? "en" : "ro";
    document.cookie = `marketplace-locale=${next};path=/;max-age=31536000;SameSite=Lax`;
    window.location.reload();
  };
  return <button className="language-switch" onClick={changeLanguage} aria-label={locale === "ro" ? "Switch to English" : "Schimbă în limba română"}>
    <span>{locale === "ro" ? "EN" : "RO"}</span>{t.language}
  </button>;
}
