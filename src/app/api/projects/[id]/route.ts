import { deleteProject, getBundle, getProject, updateProjectMeta } from "@/server/projects";
import { errorResponse, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const project = await getProject(id);
    if (!project) return Response.json({ error: "پروژه یافت نشد.", detail: [] }, { status: 404 });
    const bundle = await getBundle(id);
    return ok(bundle);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ name?: string; client?: string | null; status?: string; description?: string | null }>(request);
    await updateProjectMeta(id, body);
    return ok({ project: await getProject(id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    await deleteProject(id);
    return ok({ deleted: true });
  } catch (error) {
    return errorResponse(error);
  }
}
