import { NextResponse } from "next/server";
import {
  completePastSessions,
  countOutboundEmails,
  ensureUpcomingSessions,
} from "@/lib/data";
import { verifyQstashSignature } from "@/lib/qstash";

export async function POST(request: Request) {
  const body = await request.text();
  const signature =
    request.headers.get("upstash-signature") ?? request.headers.get("x-cron-secret");

  const ok = await verifyQstashSignature({ signature, body });
  if (!ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const completed = await completePastSessions();
  const created = await ensureUpcomingSessions(14);
  return NextResponse.json({
    ok: true,
    created,
    completed,
    emailsQueued: countOutboundEmails(),
  });
}
