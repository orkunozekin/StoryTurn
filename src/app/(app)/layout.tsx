import { SiteNav } from "@/components/site-nav";
import { getCurrentMember } from "@/lib/data";

/**
 * Shared shell for the signed-in tabs. The nav lives here, not in each page, so it
 * stays mounted while a tab's `loading.tsx` skeleton streams in. Pages still own
 * their auth redirects; without a member there is nothing to show in the nav.
 */
export default async function AppLayout({ children }: LayoutProps<"/">) {
  const member = await getCurrentMember();

  return (
    <div className="flex min-h-full flex-1 flex-col">
      {member && <SiteNav displayName={member.displayName} />}
      {children}
    </div>
  );
}
