import { getArchiveScheme } from "@/server/projects";
import { errorResponse, ok } from "@/server/http";
import { AccessError } from "@/server/accessError";

export const dynamic = "force-dynamic";

function positiveInteger(value: string | null): number | undefined {
  if (value === null) return undefined;
  const number = Number(value);
  if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(number) || number > 2147483647)
    throw new AccessError(400, "شمارهٔ نسخه باید عدد صحیح مثبت باشد.");
  return number;
}

export async function GET(request: Request, context: { params: Promise<{ id: string; runId: string; schemeId: string }> }) {
  try {
    const { id, runId, schemeId } = await context.params;
    const params = new URL(request.url).searchParams;
    const revision = positiveInteger(params.get("revision"));
    const before = positiveInteger(params.get("before"));
    if (revision !== undefined && before !== undefined) throw new AccessError(400, "فقط یکی از revision یا before را مشخص کنید.");
    return ok(await getArchiveScheme(id, runId, schemeId, revision, before));
  } catch (error) {
    return errorResponse(error);
  }
}
