import { useTranslation } from "react-i18next";
import { Button } from "./ui/button";

export function DemoAlert() {
  const { t } = useTranslation();

  return (
    <div className="sticky top-0 left-0 right-0 flex flex-col border-warning/30 border-b bg-warning/10 px-4 py-3 text-center">
      <div className="flex flex-col items-center justify-center gap-2 text-sm text-warning-foreground sm:flex-row">
        <p className="flex flex-col sm:flex-row items-center gap-2">
          {t("common:demoAlert.message")}
          <Button
            onClick={() =>
              window.open("https://github.com/usekaneo/kaneo", "_blank")
            }
            className="h-7 whitespace-nowrap bg-warning/15 px-3 text-warning-foreground text-xs hover:bg-warning/25 sm:h-6 sm:px-2"
          >
            {t("common:demoAlert.deployYourOwn")}
          </Button>
        </p>
      </div>
    </div>
  );
}
