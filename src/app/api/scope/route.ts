import { scopeRegister } from "@/domain/scope/registry";

/** دفتر عمومی و فقط‌خواندنی است؛ پاسخ آن اجازهٔ صدور یا تأیید پروژه نیست. */
export const dynamic = "force-dynamic";

export function GET() {
  return Response.json(scopeRegister(), { headers: { "Cache-Control": "no-store" } });
}
