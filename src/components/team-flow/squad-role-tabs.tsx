"use client";

import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ROLE_ORDER, type RoleKey } from "@/lib/fantasy/rules";
import { cn } from "@/lib/utils";

function tabShort(r: RoleKey): string {
  return r === "BOWL" ? "BWL" : r;
}

export function SquadRoleTabs({
  roleTab,
  onRoleTabChange,
  roleCounts: rc,
}: {
  roleTab: RoleKey;
  onRoleTabChange: (r: RoleKey) => void;
  roleCounts: Record<RoleKey, number>;
}) {
  return (
    <Tabs value={roleTab} onValueChange={(v) => onRoleTabChange(v as RoleKey)}>
      <div className="border-zinc-300/90 shrink-0 border-b">
        <TabsList
          variant="line"
          className="mb-0 h-auto w-full grid grid-cols-4 gap-0 rounded-none border-0 bg-transparent p-0 shadow-none"
        >
          {ROLE_ORDER.map((r) => (
            <TabsTrigger
              key={r}
              value={r}
              className={cn(
                "group flex min-h-12 flex-none items-end justify-center rounded-none border-0 bg-transparent px-1 py-3 text-xs font-medium text-zinc-500 shadow-none",
                "after:hidden",
                "hover:text-zinc-700",
              )}
            >
              <span
                className={cn(
                  "tabular-nums -mb-px inline-block border-b-2 border-transparent pb-0.5",
                  "group-data-[active]:border-primary group-data-[active]:font-bold group-data-[active]:text-zinc-900",
                  "dark:group-data-[active]:text-zinc-100",
                )}
              >
                {tabShort(r)} ({rc[r]})
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>
    </Tabs>
  );
}
