import { sanity } from "@/lib/sanity"

export const dynamic = "force-dynamic"

export async function GET() {
  const rows = await sanity.fetch(`
    *[_type=="project"] | order(order asc) {
      "id": coalesce(slug.current, _id),
      title,
      year,
      "legacyImage": thumbnailImage.asset->url,
      "legacyVideo": thumbnailVideoUrl,
      "images": thumbnailImages[].asset->url,
      "videos": thumbnailVideoUrls
    }
  `)

  const ids = (rows || []).map((r: any) => r.id).filter(Boolean)

  const srcsById: Record<string, string[]> = {}
  const metaById: Record<string, { title?: string; year?: string }> = {}
  for (const r of rows || []) {
    if (!r.id) continue

    const pool: string[] = [
      ...((r.images || []) as string[]),
      ...((r.videos || []) as string[]),
    ].filter(Boolean)

    // Fallback to legacy single fields
    if (pool.length === 0) {
      if (r.legacyImage) pool.push(r.legacyImage)
      if (r.legacyVideo) pool.push(r.legacyVideo)
    }

    if (pool.length > 0) srcsById[r.id] = pool
    metaById[r.id] = { title: r.title, year: r.year }
  }

  return Response.json({ ids, srcsById, metaById })
}
