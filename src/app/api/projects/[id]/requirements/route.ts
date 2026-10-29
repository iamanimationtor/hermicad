import { getBundle, getProject, saveRequirements } from "@/server/projects";
import { errorResponse, ok, readJson } from "@/server/http";
import { validateRequirements } from "@/domain/requirements";
import type { Requirements } from "@/domain/types";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const project = await getProject(id);
    if (!project) return Response.json({ error: "پروژه یافت نشد.", detail: [] }, { status: 404 });
    return ok({ requirements: project.requirements });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const requirements = await readJson<Requirements>(request);
    const check = validateRequirements(requirements);
    if (!check.ok) {
      return Response.json({ error: "نیازمندی‌ها معتبر نیستند.", detail: check.errors }, { status: 422 });
    }
    await saveRequirements(id, requirements);
    return ok({ bundle: await getBundle(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
