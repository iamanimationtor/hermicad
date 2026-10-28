import { generateForProject } from "@/server/projects";
import { errorResponse, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ seed?: number; variants?: number; weights?: Record<string, number> }>(request);
    const bundle = await generateForProject(id, body);
    return ok({ bundle });
  } catch (error) {
    return errorResponse(error);
  }
}
