import { NextResponse } from "next/server"
import fs from "fs"
import path from "path"

const SUPPORTED = new Set(["avif", "png", "jpg", "jpeg", "gif"])
const PRIORITY: Record<string, number> = { avif: 0, png: 1, jpg: 2, jpeg: 3, gif: 4 }

type Entry = { id: string; src: string; ext: string }

export async function GET() {
  try {
    const dir = path.join(process.cwd(), "public", "pf")
    const files = fs.readdirSync(dir)

    // base only: "01.png" / exclude "-detail"
    const candidates: Record<string, Entry[]> = {}

    for (const f of files) {
      if (f.includes("-detail")) continue

      const m = f.match(/^(\d+)\.([a-zA-Z0-9]+)$/)
      if (!m) continue

      const rawId = m[1]
      const ext = m[2].toLowerCase()
      if (!SUPPORTED.has(ext)) continue

      const id = rawId.padStart(2, "0")
      const src = `/pf/${f}`

      candidates[id] ??= []
      candidates[id].push({ id, src, ext })
    }

    // pick best ext per id (priority)
    const manifest: { ids: string[]; srcById: Record<string, string> } = {
      ids: [],
      srcById: {},
    }

    const ids = Object.keys(candidates).sort()
    for (const id of ids) {
      const arr = candidates[id].sort((a, b) => (PRIORITY[a.ext] ?? 999) - (PRIORITY[b.ext] ?? 999))
      manifest.ids.push(id)
      manifest.srcById[id] = arr[0].src
    }

    return NextResponse.json(manifest, { headers: { "Cache-Control": "no-store" } })
  } catch (e: any) {
    return NextResponse.json(
      { ids: [], srcById: {}, error: String(e?.message ?? e) },
      { status: 200, headers: { "Cache-Control": "no-store" } }
    )
  }
}
