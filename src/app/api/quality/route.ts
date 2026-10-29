import { runQualitySuite } from "@/domain/testing/suite";
import { errorResponse, ok } from "@/server/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  try {
    const result = runQualitySuite();
    return ok({ ...result, ok: result.failed === 0 });
  } catch (error) {
    return errorResponse(error);
  }
}
