import { Link } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import useProjectStore from "@/store/project";

type LogoProps = {
  className?: string;
};

/**
 * Brand mark plus wordmark. The wordmark is real text rather than part of the
 * SVG so it picks up the app font and the light/dark foreground colour, and
 * stays sharp at any zoom; the mark itself is a flat vector with its own plate,
 * so it reads on either theme without a second asset.
 */
export function Logo({ className = "" }: LogoProps) {
  const { t } = useTranslation();
  const { setProject } = useProjectStore();
  const appName = t("common:appName");

  // "JOYDIGI TASK" -> bold "JOYDIGI" + lighter "TASK". A single-word name still
  // renders correctly: the second half is simply empty.
  const [first, ...rest] = appName.split(" ");
  const second = rest.join(" ");

  return (
    <Link
      onClick={() => {
        setProject(undefined);
      }}
      to="/dashboard"
      aria-label={appName}
      className={`w-auto ${className}`}
    >
      <span className="flex items-center gap-2">
        <img
          src="/joydigi-mark.svg"
          alt=""
          aria-hidden="true"
          className="size-7 shrink-0 rounded-[0.4rem]"
        />
        <span className="flex items-baseline gap-1.5 text-lg leading-none tracking-tight">
          <span className="font-semibold text-foreground">{first}</span>
          {second ? (
            <span className="font-normal text-foreground/60">{second}</span>
          ) : null}
        </span>
      </span>
    </Link>
  );
}
