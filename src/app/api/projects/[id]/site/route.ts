import { getBundle, saveSite } from "@/server/projects";
import { errorResponse, ok, readJson, requireRevision } from "@/server/http";
import { validateSite } from "@/domain/requirements";
import { analyzeSite } from "@/domain/layout";
import type { SiteModel } from "@/domain/types";

export const dynamic = "force-dynamic";

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const expectedRevision = requireRevision(request);
    const site = await readJson<SiteModel>(request);
    if (!site || !Array.isArray(site.boundary)) {
      return Response.json({ error: "مدل زمین نامعتبر است.", detail: [] }, { status: 422 });
    }
    const check = validateSite(site);
    if (!check.ok) {
      return Response.json({ error: "زمین معتبر نیست.", detail: check.errors }, { status: 422 });
    }
    const analysis = analyzeSite(site);
    const saved = await saveSite(id, site, expectedRevision);
    return ok({ analysis, savedRevision: saved.siteRevision, bundle: await getBundle(id) });
  } catch (error) {
    return errorResponse(error);
  }
}
