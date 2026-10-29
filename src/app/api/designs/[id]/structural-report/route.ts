import { getDesign } from "@/server/designs";
import { currentWorkspace } from "@/server/workspace";
import { readJson, errorResponse } from "@/server/http";
import { AccessError, PRIVATE_HEADERS } from "@/server/accessError";
import { structuralReport } from "@/server/structuralReport";
export const dynamic = "force-dynamic";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ revision: number; purpose: string }>(request);
    const doc = await getDesign(id, await currentWorkspace());
    if (!doc) throw new AccessError(404, "سند یافت نشد.");
    if (body.revision !== doc.revision) throw new AccessError(409, "نسخهٔ پرونده تغییر کرده است؛ آخرین نسخه را باز کنید.");
    const data = structuralReport(doc, body.purpose);
    return new Response(new Uint8Array(data), {
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="structural-review-r${doc.revision}.zip"`,
      },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
