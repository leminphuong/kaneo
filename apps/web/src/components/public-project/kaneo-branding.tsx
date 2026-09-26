import { useTranslation } from "react-i18next";

/**
 * Footer credit on public project pages. It used to link to kaneo.app; after
 * the rebrand that link would send visitors to a different product, so the
 * credit is plain text.
 */
export function KaneoBranding() {
  const { t } = useTranslation();

  return (
    <span>
      {t("publicProject:branding.poweredBy")}{" "}
      <span className="font-medium">{t("common:appName")}</span>
    </span>
  );
}
