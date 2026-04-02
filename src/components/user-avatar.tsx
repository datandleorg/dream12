"use client";

import Image from "next/image";
import { useState } from "react";
import { initialsFromUsername, userProfileAvatarUrl } from "@/lib/avatar-url";
import { cn } from "@/lib/utils";

const sizePx = { sm: 32, md: 40, lg: 44, xl: 80 } as const;

export function UserAvatar({
  avatarUrl,
  username,
  userIdFallback,
  size = "md",
  className,
}: {
  avatarUrl?: string | null;
  username?: string | null;
  /** Shown as initials seed when username is empty */
  userIdFallback?: string | null;
  size?: keyof typeof sizePx;
  className?: string;
}) {
  const label = username?.trim() || userIdFallback?.slice(0, 8) || null;
  const src = userProfileAvatarUrl(avatarUrl, label ?? username);
  const [broken, setBroken] = useState(false);
  const px = sizePx[size];
  const initials = initialsFromUsername(label);

  return (
    <div
      className={cn(
        "border-border bg-secondary/80 flex shrink-0 items-center justify-center overflow-hidden rounded-full border text-xs font-bold",
        className,
      )}
      style={{ width: px, height: px }}
    >
      {!broken ? (
        <Image
          src={src}
          alt=""
          width={px}
          height={px}
          className="size-full object-cover"
          unoptimized
          onError={() => setBroken(true)}
        />
      ) : (
        <span className="tabular-nums" aria-hidden>
          {initials}
        </span>
      )}
    </div>
  );
}
