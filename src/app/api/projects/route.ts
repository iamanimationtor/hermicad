import { createProject, ensureCodeSet, listProjects } from "@/server/projects";
import { errorResponse, ok, readJson } from "@/server/http";
import { DEFAULT_PROJECT_SITE, DEFAULT_REQUIREMENTS, parseRequirementsText, applyRequirementsPatch, validateRequirements, validateSite } from "@/domain/requirements";
import type { Requirements, SiteModel } from "@/domain/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureCodeSet();
    return ok({ projects: await listProjects() });
  } catch (error) {
    return errorResponse(error);
  }
}

interface CreateBody {
  name?: string;
  client?: string | null;
  description?: string | null;
  site?: SiteModel;
  requirements?: Requirements;
  rawRequirements?: string;
}

export async function POST(request: Request) {
  try {
    const body = await readJson<CreateBody>(request);
    if (typeof body.name !== "string" || body.name.trim().length < 3 || body.name.length > 500 ||
        (body.client != null && (typeof body.client !== "string" || body.client.length > 1000)) ||
        (body.description != null && (typeof body.description !== "string" || body.description.length > 10000)) ||
        (body.rawRequirements !== undefined && (typeof body.rawRequirements !== "string" || body.rawRequirements.length > 100000))) {
      return Response.json({ error: "مشخصات پروژه نامعتبر یا بیش از حد طولانی است.", detail: [] }, { status: 422 });
    }
    const site = body.site === undefined ? DEFAULT_PROJECT_SITE : body.site;
    let requirements = body.requirements === undefined ? DEFAULT_REQUIREMENTS : body.requirements;
    const siteCheck = validateSite(site);
    const initialCheck = validateRequirements(requirements);
    if (!siteCheck.ok || !initialCheck.ok) {
      return Response.json({ error: "ورودی پروژه معتبر نیست.", detail: [...siteCheck.errors, ...initialCheck.errors] }, { status: 422 });
    }
    if (body.rawRequirements) {
      const parsed = parseRequirementsText(body.rawRequirements, requirements);
      requirements = { ...applyRequirementsPatch(requirements, parsed.patch), parse: parsed.parse, rawText: body.rawRequirements };
    }
    const check = validateRequirements(requirements);
    if (!check.ok) return Response.json({ error: "نیازمندی‌ها معتبر نیستند.", detail: check.errors }, { status: 422 });
    const project = await createProject({
      name: body.name.trim(), client: body.client ?? null, description: body.description ?? null, site, requirements,
    });
    return ok({ project }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
