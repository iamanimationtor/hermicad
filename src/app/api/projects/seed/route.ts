import { ensureDemoProject } from "@/server/projects";
import { errorResponse, ok } from "@/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST() {
  try {
    const project = await ensureDemoProject();
    return ok({ project });
  } catch (error) {
    return errorResponse(error);
  }
}
