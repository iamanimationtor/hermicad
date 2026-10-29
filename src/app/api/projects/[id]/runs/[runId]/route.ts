import { getRunArchive } from "@/server/projects";
import { errorResponse, ok } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string; runId: string }> }) {
  try {
    const { id, runId } = await context.params;
    return ok(await getRunArchive(id, runId));
  } catch (error) {
    return errorResponse(error);
  }
}
