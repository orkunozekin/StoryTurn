import type { SessionStatus } from "@/lib/types";
import type { ChildRelation } from "@/lib/domain/relations";
import type {
  AddBookResolution,
  AddBookResult,
  BookInput,
} from "@/lib/domain/book-duplicates";
import { isDemoMode } from "@/lib/config";
import * as demo from "@/lib/demo/store";
import * as live from "@/lib/supabase/repository";
import type { DashboardFilter } from "@/lib/types";

export async function getCurrentUser() {
  return isDemoMode() ? demo.getCurrentUser() : live.getCurrentUser();
}

export async function getCurrentMember() {
  return isDemoMode() ? demo.getCurrentMember() : live.getCurrentMember();
}

export async function getHomeContext() {
  return isDemoMode() ? demo.getHomeContext() : live.getHomeContext();
}

export async function getFamilyAdmin() {
  return isDemoMode() ? demo.getFamilyAdmin() : live.getFamilyAdmin();
}

export async function listFamilySessions() {
  return isDemoMode() ? demo.listFamilySessions() : live.listFamilySessions();
}

export async function listFamilyAssignments() {
  return isDemoMode() ? demo.listFamilyAssignments() : live.listFamilyAssignments();
}

export async function getLibrary() {
  return isDemoMode() ? demo.getLibrary() : live.getLibrary();
}

export async function getBook(id: string) {
  return isDemoMode() ? demo.getBook(id) : live.getBook(id);
}

export async function getDashboard(filter: DashboardFilter) {
  return isDemoMode() ? demo.getDashboard(filter) : live.getDashboard(filter);
}

export async function getSessionDetail(sessionId: string, selectedLibraryOnly = false) {
  return isDemoMode()
    ? demo.getSessionDetail(sessionId, selectedLibraryOnly)
    : live.getSessionDetail(sessionId, selectedLibraryOnly);
}

export async function createFamily(name: string, relation?: ChildRelation) {
  return isDemoMode()
    ? demo.createFamily(name, relation)
    : live.createFamily(name, relation);
}

export async function joinFamily(code: string, relation?: ChildRelation) {
  return isDemoMode() ? demo.joinFamily(code, relation) : live.joinFamily(code, relation);
}

export async function addKid(name: string, birthday: string) {
  return isDemoMode() ? demo.addKid(name, birthday) : live.addKid(name, birthday);
}

export async function createInviteCode(role: "owner" | "reader" = "reader") {
  return isDemoMode() ? demo.createInviteCode(role) : live.createInviteCode(role);
}

export async function saveSchedule(input: {
  readerRotationMemberIds: string[];
  startDate: string;
  timeLocal: string;
  timezone: string;
  bookTiming: "ahead" | "after";
  booksPerSession?: number;
  assignRandomBooks?: boolean;
}) {
  return isDemoMode() ? demo.saveSchedule(input) : live.saveSchedule(input);
}

export async function cancelSession(sessionId: string) {
  return isDemoMode() ? demo.cancelSession(sessionId) : live.cancelSession(sessionId);
}

export async function updateSession(input: {
  sessionId: string;
  memberIds: string[];
  bookIds: string[];
  freeformTitles: string[];
  notes: string | null;
  status: "scheduled" | "completed" | "cancelled";
  reason?: string;
}) {
  return isDemoMode() ? demo.updateSession(input) : live.updateSession(input);
}

export async function ensureUpcomingSessions(daysAhead = 14) {
  return isDemoMode()
    ? demo.ensureUpcomingSessions(daysAhead)
    : live.ensureAllUpcomingSessions(daysAhead);
}

export function countOutboundEmails(): number {
  return isDemoMode() ? demo.getDemoState().outboundEmails.length : 0;
}

export async function deleteSchedule() {
  return isDemoMode() ? demo.deleteSchedule() : live.deleteSchedule();
}
export async function updateMember(id: string, name: string, role: "owner" | "reader") {
  return isDemoMode()
    ? demo.updateMember(id, name, role)
    : live.updateMember(id, name, role);
}
export async function updateMemberRelation(
  memberId: string,
  relationToChildren: ChildRelation,
) {
  return isDemoMode()
    ? demo.updateMemberRelation(memberId, relationToChildren)
    : live.updateMemberRelation(memberId, relationToChildren);
}
export async function cascadeInsertReader(input: {
  fromSessionId: string;
  fillInMemberId: string;
}) {
  return isDemoMode() ? demo.cascadeInsertReader(input) : live.cascadeInsertReader(input);
}
export async function swapSessionReaders(input: {
  sessionAId: string;
  sessionBId: string;
}) {
  return isDemoMode() ? demo.swapSessionReaders(input) : live.swapSessionReaders(input);
}
export async function getUpcomingBookCtaState() {
  return isDemoMode() ? demo.getUpcomingBookCtaState() : live.getUpcomingBookCtaState();
}
export async function addRandomBooksToUpcomingSessions() {
  return isDemoMode()
    ? demo.addRandomBooksToUpcomingSessions()
    : live.addRandomBooksToUpcomingSessions();
}
export async function shuffleBooksForUpcomingSessions() {
  return isDemoMode()
    ? demo.shuffleBooksForUpcomingSessions()
    : live.shuffleBooksForUpcomingSessions();
}
export async function shuffleSessionBooks(sessionId: string) {
  if (isDemoMode()) demo.shuffleSessionBooks(sessionId);
  else await live.shuffleSessionBooks(sessionId);
}
export async function addBookFromSearch(
  input: BookInput,
  resolution?: AddBookResolution,
): Promise<AddBookResult> {
  return isDemoMode()
    ? demo.addBookFromSearch(input, resolution)
    : live.addBookFromSearch(input, resolution);
}
export async function updateKid(id: string, name: string, birthday: string) {
  return isDemoMode()
    ? demo.updateKid(id, name, birthday)
    : live.updateKid(id, name, birthday);
}
export async function deleteKid(id: string) {
  return isDemoMode() ? demo.deleteKid(id) : live.deleteKid(id);
}

export async function getFamilySessionPage(
  requestedPage?: string | string[],
  status?: SessionStatus,
) {
  return isDemoMode()
    ? demo.getFamilySessionPage(requestedPage, status)
    : live.getFamilySessionPage(requestedPage, status);
}

export async function getLibraryPage(query: string, page = 1) {
  return isDemoMode()
    ? demo.getLibraryPage(query, page)
    : live.getLibraryPage(query, page);
}

export async function startBookScan() {
  return isDemoMode() ? demo.startBookScan() : live.startBookScan();
}
export async function finishBookScan(id: string) {
  return isDemoMode() ? demo.finishBookScan(id) : live.finishBookScan(id);
}
export async function saveBookEdition(
  input: import("@/lib/book-edition").BookInput,
  scanId?: string,
) {
  return isDemoMode()
    ? demo.saveBookEdition(input, scanId)
    : live.saveBookEdition(input, scanId);
}
export async function removeLibraryBooks(ids: string[], scanId?: string) {
  return isDemoMode()
    ? demo.removeLibraryBooks(ids, scanId)
    : live.removeLibraryBooks(ids, scanId);
}
export async function correctBookFormat(id: string, format: string) {
  return isDemoMode()
    ? demo.correctBookFormat(id, format)
    : live.correctBookFormat(id, format);
}
let nextDemoLookup = 0;
export async function reserveBookLookup() {
  if (!isDemoMode()) return live.reserveBookLookup();
  const slot = Math.max(Date.now(), nextDemoLookup);
  if (slot > Date.now() + 15000)
    throw new Error("Book lookup is busy. Please retry shortly.");
  nextDemoLookup = slot + 1100;
  await new Promise((resolve) => setTimeout(resolve, slot - Date.now()));
}
