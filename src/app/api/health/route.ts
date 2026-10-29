import { getDb } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return Response.json({ ok: true, scope: "database-connectivity-only" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // خطا و نشانی پایگاه عمومی نمی‌شوند؛ سلامت صرفاً آماده‌بودن اتصال را می‌سنجد.
    return Response.json({ ok: false, scope: "database-connectivity-only" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
