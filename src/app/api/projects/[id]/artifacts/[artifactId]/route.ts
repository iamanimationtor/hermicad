import { getArtifactManifest } from "@/server/projects";
import { errorResponse, ok } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string; artifactId: string }> }) {
  try {
    const { id, artifactId } = await context.params;
    return ok(await getArtifactManifest(id, artifactId));
  } catch (error) {
    return errorResponse(error);
  }
}
