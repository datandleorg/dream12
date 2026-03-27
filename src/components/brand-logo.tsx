import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

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
        <Image
          src="/brand-logo.png"
          alt="Fantasy Cricket League"
          width={1024}
          height={558}
          className="h-11 w-auto max-w-[5.5rem] shrink-0 rounded-lg object-contain object-left shadow-md ring-2 ring-primary/40"
          priority
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
        <Image
          src="/brand-logo.png"
          alt="Fantasy Cricket League — logo"
          width={1024}
          height={558}
          className="relative w-[min(94vw,380px)] max-w-full rounded-2xl object-contain shadow-2xl ring-2 ring-accent/50"
          priority
        />
      </div>
    </div>
  );
}
