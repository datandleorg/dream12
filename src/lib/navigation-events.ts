/** Dispatched before client `router.push` so `NavigationProgress` can show the top bar. */
export const NAVIGATION_START_EVENT = "dream12:navigation-start";

export function dispatchNavigationStart(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(NAVIGATION_START_EVENT));
}
