import { assertStudioDocument } from "@/domain/studio/input";
import { slabConfig } from "@/domain/studio/slabConfig";
import { WorkspaceMismatchError, deleteDesign, getDesign, saveDesign } from "@/server/designs";
import { currentWorkspace } from "@/server/workspace";
import { errorResponse, ok, readJson } from "@/server/http";
import type { StudioDocument } from "@/domain/studio/document";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const design = await getDesign(id, await currentWorkspace());
    if (!design) return Response.json({ error: "سند طراحی یافت نشد.", detail: [] }, { status: 404 });
    return ok({ design });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ document?: StudioDocument }>(request);
    const doc = body.document;
    assertStudioDocument(doc);
    if (doc.slabRebar !== undefined) doc.slabRebar = slabConfig(doc.slabRebar);
    return ok({ design: await saveDesign(id, doc, await currentWorkspace()) });
  } catch (error) {
    if (error instanceof WorkspaceMismatchError) {
      return Response.json({ error: "این سند در فضای کار دیگری است.", detail: [] }, { status: 403 });
    }
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const removed = await deleteDesign(id, await currentWorkspace());
    if (!removed) return Response.json({ error: "سند طراحی یافت نشد یا قابل حذف نیست.", detail: [] }, { status: 404 });
    return ok({ deleted: id });
  } catch (error) {
    return errorResponse(error);
  }
}
