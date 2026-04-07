import type { Metadata } from "next";
import { BrandLogo } from "@/components/brand-logo";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata: Metadata = {
  title: "Maintenance — Dream12",
  description: "Dream12 is temporarily unavailable while we apply updates.",
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <div className="relative flex w-full flex-col items-center gap-8 py-6">
      <div className="flex flex-col items-center gap-3">
        <BrandLogo variant="hero" heroMax="sm" />
        <div className="text-center">
          <p className="text-primary font-display text-2xl tracking-[0.2em] uppercase">
            Dream12
          </p>
          <p className="text-muted-foreground text-xs font-medium tracking-[0.2em] uppercase">
            Fantasy cricket league
          </p>
        </div>
      </div>

      <Card className="border-border/80 w-full shadow-xl ring-1 ring-accent/20">
        <CardHeader className="space-y-1">
          <CardTitle className="text-primary text-2xl">We&apos;ll be right back</CardTitle>
          <CardDescription>
            The app is under maintenance while we roll out an update. Please try again in a little
            while.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm leading-relaxed">
            Thank you for your patience — your contests and wallet are safe, and we&apos;ll have
            everything running again as soon as possible.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
