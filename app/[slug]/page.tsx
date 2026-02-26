import type { Metadata } from "next"
import { sanity } from "@/lib/sanity"
import SlugClient from "./client"

type Props = { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const id = decodeURIComponent(slug)

  const data = await sanity.fetch(
    `*[_type == "project" && slug.current == $id][0]{ title, year, "image": detailSections[0].image.asset->url }`,
    { id }
  )

  if (!data) {
    return { title: "Seongju Lee's Portfolio" }
  }

  const title = `${data.title} — Seongju Lee`
  const description = data.year ? `${data.title} (${data.year})` : data.title

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(data.image ? { images: [{ url: data.image }] } : {}),
    },
  }
}

export default async function SlugPage({ params }: Props) {
  const { slug } = await params
  return <SlugClient slug={decodeURIComponent(slug)} />
}
