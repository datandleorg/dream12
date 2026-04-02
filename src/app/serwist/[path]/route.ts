import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import { createSerwistRoute } from "@serwist/turbopack";

const revision =
  spawnSync("git", ["rev-parse", "HEAD"], { encoding: "utf-8" }).stdout?.trim() ||
  crypto.randomUUID();

export const { dynamic, dynamicParams, revalidate, generateStaticParams, GET } =
  createSerwistRoute({
    swSrc: "src/app/sw.ts",
    additionalPrecacheEntries: [{ url: "/~offline", revision }],
    /** Splash PNGs are large and only used by iOS as startup images — fetch at runtime, don’t precache. */
    globIgnores: ["public/splash/**"],
    useNativeEsbuild: true,
  });
