import { sanity } from "@/lib/sanity"

export async function GET() {
  const rows = await sanity.fetch(`
    *[_type=="project"] | order(order asc) {
      "id": coalesce(slug.current, _id),
      title,
      year,
      "imageUrl": thumbnailImage.asset->url,
      "videoUrl": thumbnailVideoUrl
    }
  `)

  const ids = (rows || []).map((r: any) => r.id).filter(Boolean)

  const srcById: Record<string, string> = {}
  const metaById: Record<string, { title?: string; year?: string }> = {}
  for (const r of rows || []) {
    const src = r.imageUrl || r.videoUrl || ""
    if (r.id && src) srcById[r.id] = src
    if (r.id) metaById[r.id] = { title: r.title, year: r.year }
  }

  return Response.json({ ids, srcById, metaById })
}
