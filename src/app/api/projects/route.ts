import { createProject, ensureCodeSet, listProjects, logEvent } from "@/server/projects";
import { errorResponse, ok, readJson } from "@/server/http";
import { DEFAULT_REQUIREMENTS, DEFAULT_SITE, parseRequirementsText, applyRequirementsPatch, validateRequirements } from "@/domain/requirements";
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
    if (!body.name || body.name.trim().length < 3) {
      return Response.json({ error: "نام پروژه باید حداقل ۳ نویسه باشد.", detail: [] }, { status: 422 });
    }
    const site = body.site ?? DEFAULT_SITE;
    let requirements = body.requirements ?? DEFAULT_REQUIREMENTS;
    if (body.rawRequirements) {
      const parsed = parseRequirementsText(body.rawRequirements, requirements);
      requirements = { ...applyRequirementsPatch(requirements, parsed.patch), parse: parsed.parse, rawText: body.rawRequirements };
    }
    const check = validateRequirements(requirements);
    if (!check.ok) {
      return Response.json({ error: "نیازمندی‌ها معتبر نیستند.", detail: check.errors }, { status: 422 });
    }
    const project = await createProject({
      name: body.name.trim(),
      client: body.client ?? null,
      description: body.description ?? null,
      site,
      requirements,
    });
    await logEvent(project.id, "project.created.api", { name: project.name });
    return ok({ project }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
