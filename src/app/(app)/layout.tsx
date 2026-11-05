import { SiteNav } from "@/components/site-nav";
import { ThemeSync } from "@/components/theme-sync";
import { getCurrentMember, getThemePreference } from "@/lib/data";

/**
 * Shared shell for the signed-in tabs. The nav lives here, not in each page, so it
 * stays mounted while a tab's `loading.tsx` skeleton streams in. Pages still own
 * their auth redirects; without a member there is nothing to show in the nav.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const [member, savedTheme] = await Promise.all([
    getCurrentMember(),
    getThemePreference(),
  ]);

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {member && <ThemeSync saved={savedTheme} />}
      {member && <SiteNav displayName={member.displayName} />}
      {children}
    </div>
  );
}
