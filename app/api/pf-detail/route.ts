import { NextResponse } from "next/server"
import { sanity } from "../../../lib/sanity"

export const dynamic = "force-dynamic"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const id = (searchParams.get("id") || "").trim()

    if (!id) {
      return NextResponse.json(
        { error: "Missing ?id=" },
        { status: 400 }
      )
    }

    // slug.current == id 로 project 1개 찾기
    const query = /* groq */ `
      *[_type == "project" && slug.current == $id][0]{
        title,
        year,
        "slug": slug.current,
        detailSections[]{
          headline,
          paragraph,
          "imageUrl": image.asset->url
        }
      }
    `

    const data = await sanity.fetch(query, { id })

    // 없을 때도 안전하게
    if (!data) {
      return NextResponse.json(
        { error: "Not found", id },
        { status: 404 }
      )
    }

    return NextResponse.json(data)
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e) },
      { status: 500 }
    )
  }
}
