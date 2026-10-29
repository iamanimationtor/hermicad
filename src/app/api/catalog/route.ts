import { CATALOG, CATALOG_STATS, CATEGORIES, DISCIPLINE_LABELS, STUDIO_LAYERS, searchCatalog } from "@/domain/studio/catalog";

export const dynamic = "force-static";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const category = url.searchParams.get("category") ?? undefined;
  const items = searchCatalog(query, category);
  return Response.json(
    {
      stats: CATALOG_STATS,
      categories: CATEGORIES,
      disciplines: DISCIPLINE_LABELS,
      layers: STUDIO_LAYERS,
      count: items.length,
      items,
    },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
