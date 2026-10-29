import { familyOf, emptyStructure } from "@/domain/structures/catalog";
import { emptyBrief } from "@/domain/journey/model";
import { createDesignTemplate, isDesignTemplate } from "@/domain/studio/templates";
import { AccessError } from "@/server/accessError";
import { createDesign, listDesigns, sampleDesign, seedSampleDesign } from "@/server/designs";
import { createStudioDocument } from "@/domain/studio/document";
import { errorResponse, ok, readJson } from "@/server/http";
import { currentWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const workspace = await currentWorkspace();
    await seedSampleDesign(workspace);
    return ok({ designs: await listDesigns(workspace) });
  } catch (error) {
    return errorResponse(error);
  }
}

interface CreateBody {
  name?: string;
  kind?: "architecture" | "structure" | "mep" | "site";
  sheet?: { format?: "A4" | "A3" | "A2" | "A1" | "A0"; orientation?: "landscape" | "portrait"; scale?: number };
  levels?: number;
  template?: string;
  structureFamily?: string;
}

export async function POST(request: Request) {
  try {
    const body = await readJson<CreateBody>(request);
    if (body.template !== undefined && !["empty", "sample"].includes(body.template) && !isDesignTemplate(body.template))
      throw new AccessError(422, "الگوی درخواستی شناخته‌شده نیست.");
    if (body.levels !== undefined && (!Number.isInteger(body.levels) || body.levels < 1 || body.levels > 60))
      throw new AccessError(422, "تعداد طبقات باید بین ۱ و ۶۰ باشد.");
    if (body.name !== undefined && (typeof body.name !== "string" || body.name.length > 150))
      throw new AccessError(422, "نام سند باید متن کوتاه باشد.");
    if (body.kind !== undefined && !["architecture", "structure", "mep", "site"].includes(body.kind))
      throw new AccessError(422, "نوع سند معتبر نیست.");
    if (body.sheet?.format !== undefined && !["A4", "A3", "A2", "A1", "A0"].includes(body.sheet.format))
      throw new AccessError(422, "قالب برگه معتبر نیست.");
    if (body.sheet?.orientation !== undefined && !["landscape", "portrait"].includes(body.sheet.orientation))
      throw new AccessError(422, "جهت برگه معتبر نیست.");
    if (body.sheet?.scale !== undefined && (!Number.isFinite(body.sheet.scale) || body.sheet.scale < 10 || body.sheet.scale > 1000))
      throw new AccessError(422, "مقیاس باید بین ۱۰ و ۱۰۰۰ باشد.");
    const family = familyOf(body.structureFamily);
    if (body.structureFamily !== undefined && !family) throw new AccessError(422, "خانوادهٔ سازه معتبر نیست.");
    if (family && body.template && body.template !== "empty")
      throw new AccessError(422, "مسیر تخصصی از سند خالی آغاز می‌شود؛ الگوی ساختمانی به آن تحمیل نمی‌شود.");
    const base = createStudioDocument({
      ...(family
        ? {
            brief: {
              ...emptyBrief(),
              use: "other" as const,
              trades: ["structure" as const],
              outputs: [],
              structural: emptyStructure(family.id),
            },
          }
        : {}),
      name: body.name?.trim() || "سند طراحی جدید",
      kind: family ? "structure" : (body.kind ?? "architecture"),
      levels: body.levels ?? 1,
      sheet: {
        format: body.sheet?.format ?? "A3",
        orientation: body.sheet?.orientation ?? "landscape",
        scale: body.sheet?.scale ?? 100,
      },
    });
    // «الگوی نمونه» واقعاً باید اشیا داشته باشد؛ پیش‌تر فقط نام سند را عوض می‌کرد و
    // سند خالی تحویل می‌داد (خروجی ۰ شیء). اکنون همان سند نمونهٔ کامل با نام و
    // برگهٔ انتخابی کاربر ساخته می‌شود.
    const sample = isDesignTemplate(body.template) ? createDesignTemplate(body.template) : sampleDesign();
    const doc =
      body.template === "sample" || isDesignTemplate(body.template)
        ? {
            ...sample,
            id: base.id,
            kind: base.kind,
            classification: base.kind === "structure" ? "structure" : sample.classification,
            name: body.name?.trim() || sample.name,
            sheet: {
              ...sample.sheet,
              format: body.sheet?.format ?? sample.sheet.format,
              orientation: body.sheet?.orientation ?? sample.sheet.orientation,
              scale: body.sheet?.scale ?? sample.sheet.scale,
            },
            levels: body.levels ?? sample.levels,
            revision: 1,
          }
        : base;
    return ok({ design: await createDesign(doc, await currentWorkspace()) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
