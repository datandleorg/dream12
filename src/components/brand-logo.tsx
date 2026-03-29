import Link from "next/link";
import { cn } from "@/lib/utils";

/** Public asset — use `<img>` so the logo works even when `/_next/image` fails (Docker standalone, some proxies). */
const LOGO_SRC = "/brand-logo.png";

export function BrandLogo({
  variant = "hero",
  className,
}: {
  variant?: "hero" | "compact";
  className?: string;
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
          width={1024}
          height={558}
          decoding="async"
          className="bg-muted/50 h-11 w-auto max-w-[5.5rem] shrink-0 rounded-lg object-contain object-left shadow-md ring-2 ring-primary/40"
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
          className="absolute -inset-3 rounded-3xl bg-gradient-to-b from-primary/25 via-transparent to-accent/15 blur-2xl"
          aria-hidden
        />
        {/* eslint-disable-next-line @next/next/no-img-element -- static public asset; avoids optimizer edge cases */}
        <img
          src={LOGO_SRC}
          alt="Fantasy Cricket League — logo"
          width={1024}
          height={558}
          decoding="async"
          className="bg-muted/40 relative w-[min(94vw,380px)] max-w-full rounded-2xl object-contain shadow-2xl ring-2 ring-accent/50"
        />
      </div>
    </div>
  );
}
