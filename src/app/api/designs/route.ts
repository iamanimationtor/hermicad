import { createDesign, ensureSampleDesign, listDesigns } from "@/server/designs";
import { createStudioDocument } from "@/domain/studio/document";
import { errorResponse, ok, readJson } from "@/server/http";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await ensureSampleDesign();
    return ok({ designs: await listDesigns() });
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
    const doc = body.template === "sample" ? { ...base, name: body.name?.trim() || base.name } : base;
    return ok({ design: await createDesign(doc) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
