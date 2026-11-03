import { AppNav } from "@/components/app-nav";
import { AppTabBar } from "@/components/app-tab-bar";
import { NAV_STYLE } from "@/lib/nav-config";

/** Picks the navigation set in `NAV_STYLE`. */
export function SiteNav({ displayName }: { displayName: string }) {
  if (NAV_STYLE === "top") return <AppNav displayName={displayName} />;
  return (
    <>
      <AppNav displayName={displayName} className="hidden lg:block" />
      <AppTabBar />
    </>
  );
}
