import { type PropsWithChildren, useEffect, useMemo } from "react";
import { I18nextProvider } from "react-i18next";
import useAuth from "@/components/providers/auth-provider/hooks/use-auth";
import { i18n, preloadNamespaces, resolveLocale } from "./index";

export function AppI18nProvider({ children }: PropsWithChildren) {
  const { user } = useAuth();

  // The browser locale is deliberately not consulted: this instance serves a
  // Vietnamese team, so anyone who has not picked a language in their account
  // settings gets the instance default rather than whatever their browser is
  // configured for.
  const resolvedLocale = useMemo(
    () => resolveLocale(user?.locale, null),
    [user?.locale],
  );

  useEffect(() => {
    void i18n
      .changeLanguage(resolvedLocale)
      .then(() => preloadNamespaces(resolvedLocale));
    document.documentElement.lang = resolvedLocale;
  }, [resolvedLocale]);

  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
