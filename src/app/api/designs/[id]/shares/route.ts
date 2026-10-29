import { currentWorkspace } from "@/server/workspace";
import { assertSameOrigin, PRIVATE_HEADERS } from "@/server/accessError";
import { errorResponse, readJson } from "@/server/http";
import { createShare, listShares, revokeShare } from "@/server/shares";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try {
    const { id } = await context.params;
    return Response.json({ shares: await listShares(id, await currentWorkspace()) }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const body = await readJson<{ days?: unknown }>(request);
    return Response.json(await createShare(id, await currentWorkspace(), body.days ?? 7), { status: 201, headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function DELETE(request: Request, context: Context) {
  try {
    assertSameOrigin(request);
    const { id } = await context.params;
    const body = await readJson<{ shareId: string }>(request);
    await revokeShare(id, body.shareId, await currentWorkspace());
    return Response.json({ ok: true }, { headers: PRIVATE_HEADERS });
  } catch (error) {
    return errorResponse(error);
  }
}
