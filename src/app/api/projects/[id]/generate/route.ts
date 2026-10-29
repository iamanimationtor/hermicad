import { generateForProject, type GenerateOptions } from "@/server/projects";
import { errorResponse, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await readJson<GenerateOptions>(request);
    return ok(await generateForProject(id, body));
  } catch (error) {
    return errorResponse(error);
  }
}
