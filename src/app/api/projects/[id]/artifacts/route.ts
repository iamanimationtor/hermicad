import { listArtifactManifests } from "@/server/projects";
import { errorResponse, ok } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return ok(await listArtifactManifests(id, new URL(request.url).searchParams.get("before") ?? undefined));
  } catch (error) {
    return errorResponse(error);
  }
}
