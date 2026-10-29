import { createDesign, ensureSampleDesign, listDesigns, sampleDesign } from "@/server/designs";
import { createStudioDocument } from "@/domain/studio/document";
import { errorResponse, ok, readJson } from "@/server/http";
import { currentWorkspace } from "@/server/workspace";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const workspace = await currentWorkspace();
    await ensureSampleDesign(workspace);
    return ok({ designs: await listDesigns(workspace), workspace });
  } catch (error) {
    return errorResponse(error);
  }
}

interface CreateBody {
  name?: string;
  kind?: "architecture" | "structure" | "mep" | "site";
  sheet?: { format?: "A4" | "A3" | "A2" | "A1" | "A0"; orientation?: "landscape" | "portrait"; scale?: number };
  levels?: number;
  template?: "empty" | "sample";
}

export async function POST(request: Request) {
  try {
    const body = await readJson<CreateBody>(request).catch(() => ({}) as CreateBody);
    const base = createStudioDocument({
      name: body.name?.trim() || "سند طراحی جدید",
      kind: body.kind ?? "architecture",
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
    const sample = sampleDesign();
    const doc =
      body.template === "sample"
        ? {
            ...sample,
            id: base.id,
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
