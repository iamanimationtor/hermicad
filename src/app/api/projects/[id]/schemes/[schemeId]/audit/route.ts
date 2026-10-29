import { auditSchemeById } from "@/server/projects";
import { errorResponse, ok } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ id: string; schemeId: string }> }) {
  try {
    const { id, schemeId } = await context.params;
    const audit = await auditSchemeById(id, decodeURIComponent(schemeId));
    return ok({ audit });
  } catch (error) {
    return errorResponse(error);
  }
}
