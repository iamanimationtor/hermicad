import { sharedSnapshot } from "@/server/shares";
import { errorResponse, readJson } from "@/server/http";
import { AccessError, PRIVATE_HEADERS } from "@/server/accessError";
import { exportStudio } from "@/domain/studio/render";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  try {
    const body = await readJson<{ token: unknown; format?: string }>(request);
    if (body.format !== undefined && body.format !== "svg" && body.format !== "pdf")
      throw new AccessError(422, "بازبینی فقط خروجی SVG یا PDF دارد.");
    const document = await sharedSnapshot(body.token);
    const file = exportStudio(document, body.format === "pdf" ? "pdf" : "svg", { theme: "print" });
    return new Response(new Uint8Array(file.data), {
      headers: {
        ...PRIVATE_HEADERS,
        "Content-Type": file.mime,
        "Content-Disposition": `attachment; filename="hermicad-review.${body.format === "pdf" ? "pdf" : "svg"}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
