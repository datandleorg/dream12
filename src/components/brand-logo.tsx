import Link from "next/link";
import { cn } from "@/lib/utils";

/** Public asset — use `<img>` so the logo works even when `/_next/image` fails (Docker standalone, some proxies). */
const LOGO_SRC = "/brand-logo.png";
const LOGO_W = 733;
const LOGO_H = 1024;

export function BrandLogo({
  variant = "hero",
  className,
  heroMax = "default",
}: {
  variant?: "hero" | "compact";
  className?: string;
  /** Only applies when `variant` is `hero`. */
  heroMax?: "default" | "sm";
}) {
  if (variant === "compact") {
    return (
      <Link
        href="/"
        className={cn(
          "flex min-h-11 items-center gap-2.5 rounded-lg pr-2 transition-opacity hover:opacity-90",
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- static public asset; avoids optimizer edge cases */}
        <img
          src={LOGO_SRC}
          alt=""
          width={LOGO_W}
          height={LOGO_H}
          decoding="async"
          className="bg-muted/50 h-11 w-auto max-w-[2.75rem] shrink-0 rounded-lg object-contain object-left shadow-md ring-2 ring-primary/40"
        />
        <div className="flex min-w-0 flex-col leading-none">
          <span className="text-primary font-display text-lg tracking-[0.12em] uppercase">
            Dream12
          </span>
          <span className="text-muted-foreground text-[10px] font-medium tracking-wide uppercase">
            Fantasy cricket
          </span>
        </div>
      </Link>
    );
  }

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative">
        <div
          className={cn(
            "absolute rounded-3xl bg-gradient-to-b from-primary/25 via-transparent to-accent/15 blur-2xl",
            heroMax === "sm" ? "-inset-2 blur-xl" : "-inset-3 blur-2xl",
          )}
          aria-hidden
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- static public asset; avoids optimizer edge cases */}
        <img
          src={LOGO_SRC}
          alt="Fantasy Cricket League — logo"
          width={LOGO_W}
          height={LOGO_H}
          decoding="async"
          className={cn(
            "bg-muted/40 relative max-w-full rounded-2xl object-contain shadow-2xl ring-2 ring-accent/50",
            heroMax === "sm" ? "w-[min(38vw,132px)]" : "w-[min(72vw,280px)]",
          )}
        />
      </div>
    </div>
  );
}
