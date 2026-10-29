import { saveWeights } from "@/server/projects";
import { errorResponse, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await readJson<{ weights: Record<string, number> }>(request);
    const bundle = await saveWeights(id, body.weights ?? {});
    return ok({ bundle });
  } catch (error) {
    return errorResponse(error);
  }
}
