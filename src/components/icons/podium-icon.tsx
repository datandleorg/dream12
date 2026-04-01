import type { SVGProps } from "react";
import { cn } from "@/lib/utils";

/** Prize-podium silhouette (1st center tall, 2nd left, 3rd right) — matches stroke icons in the nav. */
export function PodiumIcon({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn("size-6 shrink-0", className)}
      aria-hidden
      {...props}
    >
      <rect x="3" y="12" width="5" height="8" rx="1" />
      <rect x="9.5" y="6" width="5" height="14" rx="1" />
      <rect x="16" y="14" width="5" height="6" rx="1" />
    </svg>
  );
}
