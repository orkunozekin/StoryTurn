"use server";

import { cookies } from "next/headers";
import { plainBookDescription } from "@/lib/book-description";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { acceptPendingInviteForCurrentUser } from "@/lib/accept-pending-invite";
import { appUrl, isDemoMode } from "@/lib/config";
import {
  addBookFromSearch,
  addKid,
  addRandomBooksToUpcomingSessions,
  cancelSession,
  cascadeInsertReader,
  createFamily,
  createInviteCode,
  deleteKid,
  deleteSchedule,
  getCurrentMember,
  getSessionDetail,
  joinFamily,
  reserveBookLookup,
  saveSchedule,
  shuffleBooksForUpcomingSessions,
  shuffleSessionBooks,
  swapSessionReaders,
  updateKid,
  updateMember,
  updateMemberRelation,
  updateSession,
} from "@/lib/data";
import * as demo from "@/lib/demo/store";
import { demoLogin, demoLogout } from "@/lib/demo/store";
import type { AddBookResolution, AddBookResult } from "@/lib/domain/book-duplicates";
import { clearDemoSessionCookie, setDemoSessionCookie } from "@/lib/demo-session";
import { searchBooks } from "@/lib/book-search";
import { parseChildRelation } from "@/lib/domain/relations";
import { clearPendingInvite, setPendingInvite } from "@/lib/pending-invite";
import { createClient } from "@/lib/supabase/server";

function authErrorRedirect(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email.includes("@")) {
    authErrorRedirect("/login", "Enter a valid email");
  }

  const inviteFromForm = String(formData.get("invite") ?? "").trim();
  if (inviteFromForm && isDemoMode()) {
    await setPendingInvite(inviteFromForm);
  }

  if (isDemoMode()) {
    const user = demoLogin(email);
    await setDemoSessionCookie(user.id);
    const accepted = await acceptPendingInviteForCurrentUser();
    revalidatePath("/");
    if (await getCurrentMember()) {
      redirect(accepted.status === "joined" ? "/invite/consumed" : "/");
    }
    redirect("/onboarding");
  }

  const password = String(formData.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) authErrorRedirect("/login", error.message);
  redirect("/");
}

export async function signupAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(formData.get("password") ?? "");
  const displayName =
    String(formData.get("displayName") ?? "").trim() || email.split("@")[0] || "Reader";
  if (!email.includes("@")) {
    authErrorRedirect("/signup", "Enter a valid email");
  }

  const inviteFromForm = String(formData.get("invite") ?? "").trim();
  if (inviteFromForm && isDemoMode()) {
    await setPendingInvite(inviteFromForm);
  }

  if (isDemoMode()) {
    const user = demoLogin(email);
    await setDemoSessionCookie(user.id);
    const accepted = await acceptPendingInviteForCurrentUser();
    revalidatePath("/");
    if (await getCurrentMember()) {
      redirect(accepted.status === "joined" ? "/invite/consumed" : "/");
    }
    redirect("/onboarding");
  }

  if (password.length < 6) {
    authErrorRedirect("/signup", "Use at least 6 characters");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${appUrl()}/auth/callback`,
      data: { display_name: displayName },
    },
  });
  if (error) authErrorRedirect("/signup", error.message);
  if (!data.session) {
    redirect("/login?notice=Check your email to confirm your account");
  }
  redirect("/onboarding");
}

export async function googleLoginAction() {
  if (isDemoMode()) {
    authErrorRedirect("/login", "Google sign-in is available when demo mode is off");
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${appUrl()}/auth/callback` },
  });
  if (error || !data.url) {
    authErrorRedirect("/login", error?.message ?? "Google sign-in failed");
  }
  redirect(data.url);
}

export async function resetPasswordAction(formData: FormData) {
  const email = String(formData.get("email") ?? "")
    .trim()
    .toLowerCase();
  if (!email.includes("@")) {
    authErrorRedirect("/reset-password", "Enter a valid email");
  }
  if (isDemoMode()) {
    redirect("/reset-password?sent=1");
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${appUrl()}/auth/callback?next=/reset-password/update`,
  });
  if (error) authErrorRedirect("/reset-password", error.message);
  redirect("/reset-password?sent=1");
}

export async function updatePasswordAction(formData: FormData) {
  if (isDemoMode()) redirect("/login");
  const password = String(formData.get("password") ?? "");
  if (password.length < 6) {
    authErrorRedirect("/reset-password/update", "Use at least 6 characters");
  }
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) authErrorRedirect("/reset-password/update", error.message);
  redirect("/");
}

export async function logoutAction() {
  (await cookies()).delete("storyturn-invite");
  if (isDemoMode()) {
    demoLogout();
    await clearDemoSessionCookie();
  } else {
    const supabase = await createClient();
    await supabase.auth.signOut();
  }
  redirect("/login");
}

export async function createFamilyAction(formData: FormData) {
  const name = String(formData.get("name") ?? "Our family");
  const relation = parseChildRelation(formData.get("relationToChildren"), "parent");
  await createFamily(name, relation);
  (await cookies()).delete("storyturn-invite");
  await clearPendingInvite();
  revalidatePath("/");
  redirect("/");
}

export async function joinFamilyAction(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const relation = parseChildRelation(formData.get("relationToChildren"), "other");
  await joinFamily(code, relation);
  (await cookies()).delete("storyturn-invite");
  await clearPendingInvite();
  revalidatePath("/");
  redirect("/");
}

export async function cascadeInsertAction(formData: FormData) {
  await cascadeInsertReader({
    fromSessionId: String(formData.get("fromSessionId") ?? ""),
    fillInMemberId: String(formData.get("fillInMemberId") ?? ""),
  });
  revalidatePath("/schedule");
  revalidatePath("/");
}

export async function swapSessionsAction(formData: FormData) {
  await swapSessionReaders({
    sessionAId: String(formData.get("sessionAId") ?? ""),
    sessionBId: String(formData.get("sessionBId") ?? ""),
  });
  revalidatePath("/schedule");
  revalidatePath("/");
}

export async function addKidAction(formData: FormData) {
  const name = String(formData.get("name") ?? "");
  const birthdayRaw = String(formData.get("birthday") ?? "");
  await addKid(name, birthdayRaw);
  revalidatePath("/kids");
  revalidatePath("/family");
}

export async function createInviteAction(formData?: FormData) {
  const role = formData && String(formData.get("role")) === "owner" ? "owner" : "reader";
  const code = await createInviteCode(role);
  revalidatePath("/family");
  return { code };
}

export async function saveScheduleAction(formData: FormData) {
  const readers = formData.getAll("readers").map(String);
  await saveSchedule({
    readerRotationMemberIds: readers,
    startDate: String(formData.get("startDate")),
    timeLocal: String(formData.get("timeLocal")),
    timezone: String(formData.get("timezone") ?? ""),
    booksPerSession: Number(formData.get("booksPerSession") ?? 1),
    assignRandomBooks: formData.get("assignRandomBooks") === "on",
    bookTiming: "after",
  });
  revalidatePath("/schedule");
  revalidatePath("/");
}

export async function addRandomBooksToUpcomingAction(_formData?: FormData) {
  void _formData;
  const updated = await addRandomBooksToUpcomingSessions();
  revalidatePath("/schedule");
  revalidatePath("/");
  return { updated };
}

export async function shuffleUpcomingBooksAction(_formData?: FormData) {
  void _formData;
  const updated = await shuffleBooksForUpcomingSessions();
  revalidatePath("/schedule");
  revalidatePath("/");
  return { updated };
}

export async function shuffleSessionBooksAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId") ?? "");
  await shuffleSessionBooks(sessionId);
  revalidatePath("/");
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/schedule");
}

export async function searchBooksAction(query: string) {
  if (!(await getCurrentMember())) throw new Error("Join a family first");
  try {
    await reserveBookLookup();
    return await searchBooks(query.slice(0, 120), { limit: 8 });
  } catch {
    throw new Error("Book search is unavailable. Please retry shortly.");
  }
}

function parseAddBookResolution(formData: FormData): AddBookResolution | undefined {
  const resolution = String(formData.get("resolution") ?? "");
  if (resolution === "keep_both") return { action: "keep_both" };
  if (resolution === "replace") {
    const existingBookId = String(formData.get("existingBookId") ?? "");
    if (!existingBookId) throw new Error("Pick which library book to replace");
    return { action: "replace", existingBookId };
  }
  return undefined;
}

export async function addBookAction(formData: FormData): Promise<AddBookResult> {
  const result = await addBookFromSearch(
    {
      title: String(formData.get("title") ?? ""),
      authors: String(formData.get("authors") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      openLibraryKey: String(formData.get("openLibraryKey") || "") || null,
      coverUrl: String(formData.get("coverUrl") || "") || null,
      isbn: String(formData.get("isbn") || "") || null,
      description: plainBookDescription(formData.get("description")),
    },
    parseAddBookResolution(formData),
  );
  if (
    result.status === "added" ||
    result.status === "replaced" ||
    result.status === "already_in_library"
  ) {
    revalidatePath("/library");
    revalidatePath(
      `/library/${result.status === "already_in_library" ? result.existing.id : result.book.id}`,
    );
  }
  if (result.status === "added" || result.status === "replaced") {
    revalidatePath("/schedule");
    revalidatePath("/");
  }
  return result;
}

export async function cancelSessionAction(sessionId: string) {
  await cancelSession(sessionId);
  revalidatePath("/");
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/dashboard");
}

export async function updateSessionAction(formData: FormData) {
  const sessionId = String(formData.get("sessionId"));
  const status = String(formData.get("status"));
  if (status !== "scheduled" && status !== "completed" && status !== "cancelled") {
    throw new Error("Invalid status");
  }
  await updateSession({
    sessionId,
    memberIds: formData.getAll("memberIds").map(String),
    bookIds: formData.getAll("bookIds").map(String),
    freeformTitles: String(formData.get("freeformTitles") ?? "")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean),
    notes: String(formData.get("notes") || "") || null,
    status,
    reason: String(formData.get("reason") || "") || undefined,
  });
  revalidatePath("/");
  revalidatePath(`/sessions/${sessionId}`);
  revalidatePath("/dashboard");
  redirect(`/sessions/${sessionId}`);
}

export async function switchDemoUserAction(formData: FormData) {
  if (!isDemoMode()) {
    authErrorRedirect("/login", "Demo users are only available in demo mode");
  }
  (await cookies()).delete("storyturn-invite");
  const user = demoLogin(String(formData.get("email") ?? "alex@example.com"));
  await setDemoSessionCookie(user.id);
  const accepted = await acceptPendingInviteForCurrentUser();
  revalidatePath("/");
  if (await getCurrentMember()) {
    redirect(accepted.status === "joined" ? "/invite/consumed" : "/");
  }
  redirect("/onboarding");
}

export async function deleteScheduleAction() {
  await deleteSchedule();
  revalidatePath("/", "layout");
}

export async function updateMemberAction(formData: FormData) {
  const id = String(formData.get("id"));
  const role = String(formData.get("role"));
  if (role !== "owner" && role !== "reader") throw new Error("Invalid role");
  await updateMember(id, String(formData.get("name") ?? ""), role);
  if (formData.has("relationToChildren")) {
    await updateMemberRelation(
      id,
      parseChildRelation(formData.get("relationToChildren")),
    );
  }
  revalidatePath("/", "layout");
}

export async function updateKidAction(formData: FormData) {
  const id = String(formData.get("id"));
  const name = String(formData.get("name") ?? "");
  const birthday = String(formData.get("birthday") ?? "");
  if (isDemoMode()) {
    demo.updateKid(id, name, birthday);
  } else {
    await updateKid(id, name, birthday);
  }
  revalidatePath("/", "layout");
}

export async function deleteKidAction(formData: FormData) {
  await deleteKid(String(formData.get("id")));
  revalidatePath("/", "layout");
}

export async function reactivateSessionAction(sessionId: string) {
  const detail = await getSessionDetail(sessionId);
  if (!detail) throw new Error("Session not found");
  if (detail.session.status !== "cancelled") return;
  await updateSession({
    sessionId,
    memberIds: detail.assignments
      .filter((row) => row.isCurrent)
      .map((row) => row.memberId),
    bookIds: detail.books.flatMap((book) => (book.bookId ? [book.bookId] : [])),
    freeformTitles: detail.books.flatMap((book) =>
      book.titleFreeform ? [book.titleFreeform] : [],
    ),
    notes: detail.session.notes,
    status: "scheduled",
    reason: "Reactivated canceled session",
  });
  for (const path of ["/", "/schedule", "/dashboard", `/sessions/${sessionId}`])
    revalidatePath(path);
}
