"use client"

import React, { useEffect, useRef, useState } from "react"
import gsap from "gsap"
import DetailOverlay from "./DetailOverlay"

type TileModel = { col: number; row: number; id: string }
type TileRefs = {
  el: HTMLDivElement | null
  img: HTMLImageElement | null
  vid: HTMLVideoElement | null
  media: HTMLDivElement | null
  label: HTMLDivElement | null
}
type TileSetters = { setX: ((v: number) => void) | null; setY: ((v: number) => void) | null }

type Manifest = {
  ids: string[]
  srcsById: Record<string, string[]>
  metaById?: Record<string, { title?: string; year?: string }>
  error?: string
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
const expAlpha = (dt: number, tau: number) => 1 - Math.exp(-dt / Math.max(1e-6, tau))
const keyOf = (c: number, r: number) => `${c},${r}`

function seed01(a: number, b: number) {
  let h = ((a * 73856093) ^ (b * 19349663)) >>> 0
  h ^= h << 13
  h ^= h >>> 17
  h ^= h << 5
  return (h >>> 0) / 4294967295
}

function normalizeId(id: string) {
  let s = (id || "").trim()
  if (s.includes("/")) s = s.split("/").pop() || s
  const low = s.toLowerCase()
  if (low.endsWith(".jpg") || low.endsWith(".png") || low.endsWith(".jpeg") || low.endsWith(".webp")) {
    s = s.replace(/\.(jpg|png|jpeg|webp)$/i, "")
  }
  return s
}

function prettyTitleFromId(id: string) {
  return normalizeId(id).replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim()
}

// -------- Video helpers (Cloudinary) --------
function isProbablyVideoUrl(url: string) {
  const u = url.toLowerCase()
  if (u.includes("/video/upload/")) return true
  if (u.endsWith(".mp4") || u.endsWith(".webm") || u.endsWith(".mov") || u.endsWith(".m4v")) return true
  if (u.includes("player.cloudinary.com/embed")) return true
  return false
}

function normalizeCloudinaryDeliveryUrl(input: string) {
  const s = input.trim()

  if (s.includes("res.cloudinary.com") && s.includes("/video/upload/")) {
    if (s.includes("/video/upload/") && !s.includes("f_auto") && !s.includes("q_auto")) {
      return s.replace("/video/upload/", "/video/upload/f_auto,q_auto,vc_auto/")
    }
    return s
  }

  if (s.includes("player.cloudinary.com/embed")) {
    try {
      const u = new URL(s)
      const cloud = u.searchParams.get("cloud_name") || ""
      const pub = u.searchParams.get("public_id") || ""
      if (!cloud || !pub) return s
      return `https://res.cloudinary.com/${cloud}/video/upload/f_auto,q_auto,vc_auto/${pub}`
    } catch {
      return s
    }
  }

  return s
}

function cloudinaryPosterFromVideoUrl(deliveryUrl: string) {
  const raw = deliveryUrl.trim()
  if (!raw.includes("res.cloudinary.com") || !raw.includes("/video/upload/")) return ""

  try {
    const u = new URL(raw)
    const base = `${u.protocol}//${u.host}`

    const idx = u.pathname.indexOf("/video/upload/")
    if (idx < 0) return ""

    const prefix = u.pathname.slice(0, idx)
    const rest = u.pathname.slice(idx + "/video/upload/".length)
    const segs = rest.split("/").filter(Boolean)

    const looksLikeTransform = (s: string) =>
      s.includes(",") ||
      s.includes("_") ||
      s.includes(":") ||
      s.includes("=") ||
      s.startsWith("c_") ||
      s.startsWith("w_") ||
      s.startsWith("h_") ||
      s.startsWith("q_") ||
      s.startsWith("f_") ||
      s.startsWith("vc_") ||
      s.startsWith("so_")

    let j = 0
    if (segs[0] && looksLikeTransform(segs[0])) j = 1

    const kept: string[] = []
    if (segs[j] && /^v\d+$/i.test(segs[j])) {
      kept.push(segs[j])
      j += 1
    }

    const publicParts = segs.slice(j)
    if (!publicParts.length) return ""

    const last = publicParts[publicParts.length - 1].replace(/\.(mp4|mov|webm|m4v)$/i, "")
    publicParts[publicParts.length - 1] = last

    const publicPath = publicParts.join("/")
    const poster = `${base}${prefix}/video/upload/so_0,f_jpg,q_auto,w_520/${kept.length ? kept.join("/") + "/" : ""}${publicPath}.jpg`
    return poster
  } catch {
    const m = raw.match(/^(https?:\/\/res\.cloudinary\.com\/[^/]+)\/video\/upload\/(.*)$/i)
    if (!m) return ""
    const base = m[1]
    let rest = m[2]
    rest = rest.replace(/^([^/]*[,=_][^/]*)\//, "")
    rest = rest.replace(/\.(mp4|mov|webm|m4v)(\?.*)?$/i, "")
    return `${base}/video/upload/so_0,f_jpg,q_auto,w_520/${rest}.jpg`
  }
}

// ===== tiny helpers =====
function hideBrokenImg(img: HTMLImageElement) {
  img.style.opacity = "0"
  img.style.visibility = "hidden"
  img.style.display = "none"
  img.removeAttribute("src")
}
function prepareImgForNewSrc(img: HTMLImageElement) {
  img.style.display = "block"
  img.style.visibility = "visible"
  img.style.opacity = "0"
}

export default function Experience() {
  // ===== Layout =====
  const TILE = 130
  const GAP = 140
  const SPAN = TILE + GAP
  const RADIUS = 6
  const WRAP_MARGIN = 2

  // ===== Inertia =====
  const FRICTION = 13.5
  const MAX_VEL = 5200

  // ===== pan smoothing =====
  const PAN_VIEW_TAU_DRAG = 0.14
  const PAN_VIEW_TAU_IDLE = 0.08

  // ===== Ripple timing (drag follower) =====
  const RIPPLE_BASE_DUR = 0.5
  const RIPPLE_STEP_DUR = 0.3
  const RIPPLE_MAX_DUR = 3.2
  const durToTau = (dur: number) => dur / 6

  // ===== Parallax =====
  const PARALLAX_STRENGTH = 50
  const PARALLAX_TAU = 0.1

  // ===== easing =====
  const EASE_OUT_QUINT = "cubic-bezier(0.22,1,0.36,1)"

  // ===== Mouse trail =====
  const TRAIL_COLOR = "255,0,0"
  const TRAIL_MAX_POINTS = 200
  const TRAIL_MAX_AGE_MS = 800
  const TRAIL_FADE_DUR_MS = 400
  const TRAIL_LINE_WIDTH_MAX = 4
  const TRAIL_LINE_WIDTH_MIN = 0.5

  // ===== Video performance knobs =====
  const MAX_ACTIVE_VIDEOS = 6
  const VIDEO_VIS_MARGIN = 120
  const VIDEO_MIN_WATCH_MS = 180

  // ===== INTRO (유지) =====
  const INTRO_DUR = 0.6
  const INTRO_DELAY_STEP = 0.015
  const INTRO_PULL_PX = 120
  const INTRO_SCALE_MIN = 0.7
  const INTRO_SPRING = { stiffness: 700, damping: 84, mass: 10 }

  // ✅ intro 시작 후 강제 드래그 허용 타이밍 (seconds)
  const INTRO_DRAG_ENABLE_AFTER = 0

  // ✅ left panel gate
  const introGateReady = useRef(false)

  // ✅ gate 기준으로 드래그 허용 시간을 고정 (핵심 수정)
  const dragEnableAtMs = useRef<number>(Infinity)

  // ===== manifest =====
  const [manifest, setManifest] = useState<Manifest | null>(null)

  useEffect(() => {
    let alive = true
    fetch("/api/pf-manifest", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && setManifest(j))
      .catch(() => alive && setManifest({ ids: [], srcsById: {}, error: "manifest fetch failed" }))
    return () => {
      alive = false
    }
  }, [])

  // ===== detail overlay state =====
  const [detailOpen, setDetailOpen] = useState(false)
  const detailOpenRef = useRef(false)
  const selectedIdRef = useRef<string | null>(null)
  const [detailData, setDetailData] = useState<any>(null)
  const [detailLoading, setDetailLoading] = useState(false)
  const [dragHintMounted, setDragHintMounted] = useState(true)
  const panBeforeDetail = useRef({ x: 0, y: 0 })

  const rootRef = useRef<HTMLDivElement | null>(null)
  const gridLayerRef = useRef<HTMLDivElement | null>(null)

  const [renderIds, setRenderIds] = useState<number[]>([])

  const tilesRef = useRef<TileModel[]>([])
  const refsRef = useRef<TileRefs[]>([])
  const settersRef = useRef<TileSetters[]>([])
  const lastIdByTile = useRef<string[]>([])

  const coordIdRef = useRef<Map<string, string>>(new Map())

  const viewW = useRef(0)
  const viewH = useRef(0)
  const poolCols = useRef(0)
  const poolRows = useRef(0)

  const rafId = useRef<number | null>(null)
  const lastT = useRef(0)
  const resizing = useRef(false)
  const pendingBind = useRef(false)
  const resizeTimer = useRef<number | null>(null)

  const panTarget = useRef({ x: 0, y: 0 })
  const panView = useRef({ x: 0, y: 0 })
  const panVel = useRef({ x: 0, y: 0 })

  const parallaxTarget = useRef({ x: 0, y: 0 })
  const parallaxView = useRef({ x: 0, y: 0 })

  const tileViewX = useRef<number[]>([])
  const tileViewY = useRef<number[]>([])

  const isDown = useRef(false)
  const pointerId = useRef<number | null>(null)
  const lastP = useRef({ x: 0, y: 0 })
  const dragStartPos = useRef<{ x: number; y: number } | null>(null)
  const wheelLastMs = useRef(0)
  const lastMotionAtMs = useRef(0)
  const prevPanView = useRef({ x: 0, y: 0 })
  const lastVideoUpdateAtMs = useRef(0)
  const dragHintRef = useRef<HTMLDivElement | null>(null)
  const dragHintRaf = useRef<number | null>(null)
  const dragHintVisible = useRef(false)
  const dragHintDismissed = useRef(false)
  const dragHintTarget = useRef({ x: 0, y: 0 })
  const dragHintPos = useRef({ x: 0, y: 0 })

  const downInfo = useRef<{ x: number; y: number; t: number } | null>(null)
  const suppressClickUntil = useRef(0)

  // ---- trail refs
  const trailCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const trailCtxRef = useRef<CanvasRenderingContext2D | null>(null)
  const trailPoints = useRef<{ x: number; y: number; t: number }[]>([])
  const trailFading = useRef(false)
  const trailFadeStart = useRef(0)

  // ---- video runtime state
  const tileIsVideo = useRef<boolean[]>([])
  const tileVideoUrl = useRef<string[]>([])
  const tilePosterUrl = useRef<string[]>([])
  const tileVideoLastWantedAt = useRef<number[]>([])
  const activeVideoSet = useRef<Set<number>>(new Set())

  // ===== intro physics state =====
  const introRan = useRef(false)
  const introActive = useRef(true)

  const introStartMs = useRef<number>(0)
  const introDelaySec = useRef<number[]>([])
  const introBase = useRef<Array<{ x: number; y: number }>>([])
  const introPos = useRef<Array<{ x: number; y: number }>>([])
  const introVel = useRef<Array<{ vx: number; vy: number }>>([])
  const introScale = useRef<number[]>([])
  const introScaleV = useRef<number[]>([])
  const introOpacity = useRef<number[]>([])

  const introCursorSet = useRef(false)

  // ✅ left panel 완료 이벤트 수신 + fallback
  // (핵심) 드래그 가능 시점은 introStartMs가 아니라 "gate 오픈 시점" 기준으로 고정
  useEffect(() => {
    const openGate = () => {
      if (introGateReady.current) return
      introGateReady.current = true
      dragEnableAtMs.current = performance.now() + INTRO_DRAG_ENABLE_AFTER * 1000
    }

    window.addEventListener("pf_left_panel_done", openGate as any)

    const fallback = window.setTimeout(() => {
      openGate()
    }, 1000)

    return () => {
      window.removeEventListener("pf_left_panel_done", openGate as any)
      window.clearTimeout(fallback)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function dismissDragHint() {
    if (dragHintDismissed.current) return
    dragHintDismissed.current = true

    const el = dragHintRef.current
    if (!el || !dragHintVisible.current) {
      if (dragHintRaf.current) {
        cancelAnimationFrame(dragHintRaf.current)
        dragHintRaf.current = null
      }
      dragHintVisible.current = false
      setDragHintMounted(false)
      return
    }

    gsap.killTweensOf(el)
    gsap.to(el, {
      delay: 0.4,
      scale: 0,
      opacity: 0,
      duration: 0.3,
      ease: "power2.in",
      onComplete: () => {
        dragHintVisible.current = false
        if (dragHintRaf.current) {
          cancelAnimationFrame(dragHintRaf.current)
          dragHintRaf.current = null
        }
        gsap.set(el, { visibility: "hidden" })
        setDragHintMounted(false)
      },
    })
  }

  useEffect(() => {
    dragHintVisible.current = false
    dragHintDismissed.current = false
    setDragHintMounted(true)

    const initialX = window.innerWidth * 0.5 + 10
    const initialY = window.innerHeight * 0.5 + 10
    dragHintTarget.current.x = initialX
    dragHintTarget.current.y = initialY
    dragHintPos.current.x = initialX
    dragHintPos.current.y = initialY

    requestAnimationFrame(() => {
      const el = dragHintRef.current
      if (!el) return
      gsap.set(el, { x: initialX, y: initialY, scale: 0, opacity: 1, visibility: "hidden" })
    })

    const onMouseMove = (e: MouseEvent) => {
      const x = e.clientX + 10
      const y = e.clientY + 10
      dragHintTarget.current.x = x
      dragHintTarget.current.y = y

      if (dragHintDismissed.current || dragHintVisible.current) return
      const el = dragHintRef.current
      if (!el) return

      dragHintPos.current.x = x
      dragHintPos.current.y = y
      dragHintVisible.current = true
      gsap.killTweensOf(el)
      gsap.set(el, { x, y, scale: 0, opacity: 1, visibility: "visible" })
      gsap.to(el, { scale: 1, duration: 0.3, ease: "power2.out" })
    }

    const follow = () => {
      const el = dragHintRef.current
      if (!el) return

      const p = dragHintPos.current
      const t = dragHintTarget.current
      p.x += (t.x - p.x) * 0.22
      p.y += (t.y - p.y) * 0.22

      if (dragHintVisible.current) {
        gsap.set(el, { x: p.x, y: p.y })
      } else {
        gsap.set(el, { x: p.x, y: p.y, scale: 0, opacity: 1, visibility: "hidden" })
      }
      dragHintRaf.current = requestAnimationFrame(follow)
    }

    dragHintRaf.current = requestAnimationFrame(follow)

    window.addEventListener("mousemove", onMouseMove, { passive: true })
    return () => {
      window.removeEventListener("mousemove", onMouseMove)
      if (dragHintRaf.current) {
        cancelAnimationFrame(dragHintRaf.current)
        dragHintRaf.current = null
      }
    }
  }, [])

  function ensureArrays(n: number) {
    if (tileViewX.current.length !== n) tileViewX.current = new Array(n).fill(0)
    if (tileViewY.current.length !== n) tileViewY.current = new Array(n).fill(0)
    if (lastIdByTile.current.length !== n) lastIdByTile.current = new Array(n).fill("")
    if (tileIsVideo.current.length !== n) tileIsVideo.current = new Array(n).fill(false)
    if (tileVideoUrl.current.length !== n) tileVideoUrl.current = new Array(n).fill("")
    if (tilePosterUrl.current.length !== n) tilePosterUrl.current = new Array(n).fill("")
    if (tileVideoLastWantedAt.current.length !== n) tileVideoLastWantedAt.current = new Array(n).fill(0)

    if (introDelaySec.current.length !== n) introDelaySec.current = new Array(n).fill(0)
    if (introBase.current.length !== n) introBase.current = new Array(n).fill(0).map(() => ({ x: 0, y: 0 }))
    if (introPos.current.length !== n) introPos.current = new Array(n).fill(0).map(() => ({ x: 0, y: 0 }))
    if (introVel.current.length !== n) introVel.current = new Array(n).fill(0).map(() => ({ vx: 0, vy: 0 }))
    if (introScale.current.length !== n) introScale.current = new Array(n).fill(1)
    if (introScaleV.current.length !== n) introScaleV.current = new Array(n).fill(0)
    if (introOpacity.current.length !== n) introOpacity.current = new Array(n).fill(0)
  }

  function pickIdNoAdjRepeat(col: number, row: number, ids: string[]) {
    if (ids.length <= 1) return ids[0] ?? "00"
    const map = coordIdRef.current
    const L = map.get(keyOf(col - 1, row))
    const R = map.get(keyOf(col + 1, row))
    const U = map.get(keyOf(col, row - 1))
    const D = map.get(keyOf(col, row + 1))
    const bad = (id: string) => id === L || id === R || id === U || id === D

    let idx = Math.floor(seed01(col, row) * ids.length) % ids.length
    for (let k = 0; k < 18 && bad(ids[idx]); k++) idx = (idx + 1) % ids.length
    return ids[idx]
  }

  function stopVideo(i: number) {
    const vid = refsRef.current[i]?.vid
    if (!vid) return
    try {
      vid.pause()
      vid.currentTime = 0
      vid.removeAttribute("src")
      vid.load()
      vid.style.opacity = "0"
      vid.style.display = "none"
    } catch {}
  }

  function extractYearFallback(raw: string) {
    const s = raw || ""
    const m = s.match(/\b(19\d{2}|20\d{2})\b/)
    return m?.[1] || ""
  }

  function setHoverLabel(i: number, rawId: string) {
    const label = refsRef.current[i]?.label
    if (!label) return

    const nid = normalizeId(rawId)
    const metaById = manifest?.metaById || {}

    const keys = [
      nid,
      nid.toLowerCase(),
      rawId,
      (rawId || "").toLowerCase(),
      normalizeId(rawId).replace(/\s+/g, ""),
      normalizeId(rawId).toLowerCase().replace(/\s+/g, ""),
    ]

    let meta: { title?: string; year?: string } | undefined
    for (const k of keys) {
      if (metaById[k]) {
        meta = metaById[k]
        break
      }
    }

    const title = (meta?.title && meta.title.trim()) || prettyTitleFromId(rawId)
    let year = (meta?.year && String(meta.year).trim()) || ""
    if (!year) year = extractYearFallback(rawId)
    if (!year) year = "—"

    label.innerHTML = `
      <div class="pf-h-title">${title}</div>
      <div class="pf-h-year">${year}</div>
    `
  }

  function pickRandom(arr: string[]) {
    return arr[Math.floor(Math.random() * arr.length)]
  }

  function applyTileMedia(i: number, srcsById: Record<string, string[]>) {
    const el = refsRef.current[i]?.el
    const img = refsRef.current[i]?.img
    const vid = refsRef.current[i]?.vid
    if (!el || !img || !vid) return

    const rawId = tilesRef.current[i].id
    if (lastIdByTile.current[i] === rawId) return
    lastIdByTile.current[i] = rawId

    el.dataset.pfId = normalizeId(rawId)
    setHoverLabel(i, rawId)

    const pool =
      srcsById[rawId] ??
      srcsById[normalizeId(rawId)] ??
      srcsById[normalizeId(rawId).toLowerCase()]
    const src0 = pool ? pickRandom(pool) : undefined

    if (!src0) {
      hideBrokenImg(img)
      tileIsVideo.current[i] = false
      tileVideoUrl.current[i] = ""
      tilePosterUrl.current[i] = ""
      stopVideo(i)
      return
    }

    const src = normalizeCloudinaryDeliveryUrl(src0)
    const isVid = isProbablyVideoUrl(src)

    tileIsVideo.current[i] = isVid
    tileVideoUrl.current[i] = isVid ? src : ""

    if (!isVid) {
      tilePosterUrl.current[i] = ""
      stopVideo(i)

      prepareImgForNewSrc(img)
      if (img.getAttribute("src") !== src) img.setAttribute("src", src)
      return
    }

    const poster = cloudinaryPosterFromVideoUrl(src)
    tilePosterUrl.current[i] = poster || ""

    if (poster) {
      prepareImgForNewSrc(img)
      if (img.getAttribute("src") !== poster) img.setAttribute("src", poster)
    } else {
      hideBrokenImg(img)
    }

    stopVideo(i)
  }

  function buildPool(vw: number, vh: number, ids: string[]) {
    const cols = Math.ceil(vw / SPAN) + WRAP_MARGIN * 2 + 2
    const rows = Math.ceil(vh / SPAN) + WRAP_MARGIN * 2 + 2
    poolCols.current = cols
    poolRows.current = rows
    viewW.current = vw
    viewH.current = vh

    const tiles: TileModel[] = []
    const refs: TileRefs[] = []
    const setters: TileSetters[] = []

    const map = new Map<string, string>()
    coordIdRef.current = map

    const sc = -Math.floor(cols / 2)
    const sr = -Math.floor(rows / 2)

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const col = sc + c
        const row = sr + r
        const id = pickIdNoAdjRepeat(col, row, ids)
        map.set(keyOf(col, row), id)
        tiles.push({ col, row, id })
        refs.push({ el: null, img: null, vid: null, media: null, label: null })
        setters.push({ setX: null, setY: null })
      }
    }

    const heroIdx = tiles.findIndex((t) => t.col === 0 && t.row === 0)
    if (heroIdx > 0) {
      const tmp = tiles[0]
      tiles[0] = tiles[heroIdx]
      tiles[heroIdx] = tmp
    }

    tilesRef.current = tiles
    refsRef.current = refs
    settersRef.current = setters

    ensureArrays(tiles.length)

    for (let i = 0; i < tiles.length; i++) {
      tileViewX.current[i] = tiles[i].col * SPAN + panView.current.x
      tileViewY.current[i] = tiles[i].row * SPAN + panView.current.y
    }

    setRenderIds(Array.from({ length: tiles.length }, (_, i) => i))
  }

  function bindSettersAndMedia(srcsById: Record<string, string[]>) {
    const WRAP_H = TILE + 70
    const originY = (TILE * 0.5) / WRAP_H
    const originStr = `50% ${Math.round(originY * 1000) / 10}%`

    for (let i = 0; i < refsRef.current.length; i++) {
      const el = refsRef.current[i]?.el
      const img = refsRef.current[i]?.img
      const vid = refsRef.current[i]?.vid
      if (!el || !img || !vid) continue

      gsap.set(el, { x: 0, y: 0, force3D: true, transformOrigin: originStr })
      settersRef.current[i].setX = gsap.quickSetter(el, "x", "px") as any
      settersRef.current[i].setY = gsap.quickSetter(el, "y", "px") as any

      gsap.set(el, { opacity: introRan.current && !introActive.current ? 1 : 0, scale: 1 })

      img.onload = () => {
        img.style.display = "block"
        img.style.visibility = "visible"
        img.style.opacity = "1"
      }
      img.onerror = () => hideBrokenImg(img)
      vid.onerror = () => stopVideo(i)

      applyTileMedia(i, srcsById)
    }
  }

  function wrapIfNeeded(i: number, ids: string[], srcsById: Record<string, string[]>) {
    const t = tilesRef.current[i]
    const vw = viewW.current
    const vh = viewH.current

    const bx = t.col * SPAN + panView.current.x
    const by = t.row * SPAN + panView.current.y

    const L = -SPAN * (WRAP_MARGIN + 1)
    const R = vw + SPAN * (WRAP_MARGIN + 1)
    const T = -SPAN * (WRAP_MARGIN + 1)
    const B = vh + SPAN * (WRAP_MARGIN + 1)

    let moved = false
    const oc = t.col
    const or = t.row

    if (bx < L) {
      t.col += poolCols.current
      moved = true
    } else if (bx > R) {
      t.col -= poolCols.current
      moved = true
    }
    if (by < T) {
      t.row += poolRows.current
      moved = true
    } else if (by > B) {
      t.row -= poolRows.current
      moved = true
    }

    if (moved) {
      const map = coordIdRef.current
      map.delete(keyOf(oc, or))

      t.id = pickIdNoAdjRepeat(t.col, t.row, ids)
      map.set(keyOf(t.col, t.row), t.id)

      applyTileMedia(i, srcsById)

      tileViewX.current[i] = t.col * SPAN + panView.current.x
      tileViewY.current[i] = t.row * SPAN + panView.current.y
    }
  }

  function computeTau(baseX: number, baseY: number) {
    const ds = dragStartPos.current
    if (!ds) return durToTau(RIPPLE_BASE_DUR)

    const cx = baseX + TILE * 0.5
    const cy = baseY + TILE * 0.5
    const dist = Math.hypot(cx - ds.x, cy - ds.y)
    const ring = clamp(dist / SPAN, 0, 10)
    const dur = clamp(RIPPLE_BASE_DUR + ring * RIPPLE_STEP_DUR, RIPPLE_BASE_DUR, RIPPLE_MAX_DUR)
    return durToTau(dur)
  }

  function updateVideosForViewport(nowMs: number, allowVideoWork: boolean) {
    if (detailOpenRef.current) return
    if (introActive.current) return
    if (!allowVideoWork) return

    const vw = viewW.current || window.innerWidth
    const vh = viewH.current || window.innerHeight
    const cx = vw * 0.5
    const cy = vh * 0.5

    const candidates: { i: number; d2: number }[] = []

    for (let i = 0; i < tilesRef.current.length; i++) {
      if (!tileIsVideo.current[i]) continue
      const x = tileViewX.current[i]
      const y = tileViewY.current[i]

      const inX = x + TILE > -VIDEO_VIS_MARGIN && x < vw + VIDEO_VIS_MARGIN
      const inY = y + TILE > -VIDEO_VIS_MARGIN && y < vh + VIDEO_VIS_MARGIN
      if (!inX || !inY) continue

      const tcx = x + TILE * 0.5
      const tcy = y + TILE * 0.5
      const dx = tcx - cx
      const dy = tcy - cy
      candidates.push({ i, d2: dx * dx + dy * dy })
    }

    candidates.sort((a, b) => a.d2 - b.d2)
    const want = new Set<number>(candidates.slice(0, MAX_ACTIVE_VIDEOS).map((c) => c.i))

    want.forEach((i) => (tileVideoLastWantedAt.current[i] = nowMs))

    activeVideoSet.current.forEach((i) => {
      if (want.has(i)) return
      const lastWanted = tileVideoLastWantedAt.current[i] || 0
      if (nowMs - lastWanted < VIDEO_MIN_WATCH_MS) return
      stopVideo(i)
      activeVideoSet.current.delete(i)
    })

    want.forEach((i) => {
      if (activeVideoSet.current.has(i)) return
      const vid = refsRef.current[i]?.vid
      const url = tileVideoUrl.current[i]
      if (!vid || !url) return

      if (vid.getAttribute("src") !== url) {
        vid.setAttribute("src", url)
        try {
          vid.load()
        } catch {}
      }

      vid.loop = true
      vid.style.display = "block"
      vid.style.opacity = "0"

      const p = vid.play()
      if (p && typeof (p as any).catch === "function") {
        ;(p as any).catch(() => stopVideo(i))
      }

      requestAnimationFrame(() => {
        vid.style.opacity = "1"
      })

      activeVideoSet.current.add(i)
    })
  }

  // ============================
  // INTRO (distance 기반 delay + spring physics) ✅ 유지
  // ============================
  function runIntroOnce() {
    if (introRan.current) return
    introRan.current = true
    introActive.current = true

    const vw = Math.max(1, viewW.current || window.innerWidth)
    const vh = Math.max(1, viewH.current || window.innerHeight)
    if (!tilesRef.current.length) {
      introActive.current = false
      return
    }

    const hero = tilesRef.current[0]
    const heroWorldCx = hero.col * SPAN + TILE * 0.5
    const heroWorldCy = hero.row * SPAN + TILE * 0.5
    const panX = vw * 0.5 - heroWorldCx
    const panY = vh * 0.5 - heroWorldCy

    panTarget.current.x = panX
    panTarget.current.y = panY
    panView.current.x = panX
    panView.current.y = panY

    for (let i = 0; i < tilesRef.current.length; i++) {
      const t = tilesRef.current[i]
      const baseX = t.col * SPAN + panView.current.x
      const baseY = t.row * SPAN + panView.current.y
      tileViewX.current[i] = baseX
      tileViewY.current[i] = baseY
      introBase.current[i].x = baseX
      introBase.current[i].y = baseY
    }

    const order = Array.from({ length: tilesRef.current.length }, (_, i) => i)
      .filter((i) => i !== 0)
      .map((i) => {
        const t = tilesRef.current[i]
        const dx = t.col - hero.col
        const dy = t.row - hero.row
        const dist = Math.hypot(dx, dy)
        const ang = Math.atan2(dy, dx)
        return { i, dist, ang }
      })
      .sort((a, b) => {
        if (a.dist !== b.dist) return a.dist - b.dist
        return a.ang - b.ang
      })
      .map((o) => o.i)

    introDelaySec.current.fill(0)
    for (let k = 0; k < order.length; k++) {
      introDelaySec.current[order[k]] = (k + 1) * INTRO_DELAY_STEP
    }
    introDelaySec.current[0] = 0

    introStartMs.current = performance.now()

    for (let i = 0; i < tilesRef.current.length; i++) {
      const baseX = introBase.current[i].x
      const baseY = introBase.current[i].y

      const centerX = vw * 0.5
      const centerY = vh * 0.5

      const cx = baseX + TILE * 0.5
      const cy = baseY + TILE * 0.5
      const vx = centerX - cx
      const vy = centerY - cy
      const d = Math.hypot(vx, vy) || 1
      const ux = vx / d
      const uy = vy / d

      const pull = i === 0 ? 0 : INTRO_PULL_PX

      introPos.current[i].x = baseX + ux * pull
      introPos.current[i].y = baseY + uy * pull
      introVel.current[i].vx = 0
      introVel.current[i].vy = 0

      introScale.current[i] = 1
      introScaleV.current[i] = 0
      introOpacity.current[i] = 0
    }

    for (let i = 0; i < refsRef.current.length; i++) {
      const el = refsRef.current[i]?.el
      if (!el) continue
      gsap.set(el, { opacity: 0, scale: 1 })
    }
  }

  function stepSpring1D(x: number, v: number, target: number, dt: number, k: number, c: number, m: number) {
    const a = (-k * (x - target) - c * v) / m
    const v2 = v + a * dt
    const x2 = x + v2 * dt
    return [x2, v2] as const
  }

  function stepIntro(now: number) {
    const t = (now - introStartMs.current) / 1000
    const n = tilesRef.current.length
    if (n <= 0) {
      introActive.current = false
      return
    }

    const k = INTRO_SPRING.stiffness
    const c = INTRO_SPRING.damping
    const m = INTRO_SPRING.mass

    let allDone = true

    for (let i = 0; i < n; i++) {
      const delay = introDelaySec.current[i] || 0
      if (t < delay) {
        allDone = false
        continue
      }

      const lt = t - delay
      introOpacity.current[i] = clamp(lt / INTRO_DUR, 0, 1)

      {
        const baseX = introBase.current[i].x
        const baseY = introBase.current[i].y

        const px = introPos.current[i].x
        const py = introPos.current[i].y
        const vx = introVel.current[i].vx
        const vy = introVel.current[i].vy

        const [nx, nvx] = stepSpring1D(px, vx, baseX, 1 / 60, k, c, m)
        const [ny, nvy] = stepSpring1D(py, vy, baseY, 1 / 60, k, c, m)

        introPos.current[i].x = nx
        introPos.current[i].y = ny
        introVel.current[i].vx = nvx
        introVel.current[i].vy = nvy

        tileViewX.current[i] = nx
        tileViewY.current[i] = ny

        const posErr = Math.hypot(nx - baseX, ny - baseY)
        const velMag = Math.hypot(nvx, nvy)
        if (posErr > 0.6 || velMag > 2.0) allDone = false
      }

      {
        const s = introScale.current[i]
        const sv = introScaleV.current[i]

        const half = INTRO_DUR * 0.5
        const target = lt < half ? INTRO_SCALE_MIN : 1

        const [ns, nsv] = stepSpring1D(s, sv, target, 1 / 60, k, c, m)
        introScale.current[i] = ns
        introScaleV.current[i] = nsv

        const err = Math.abs(ns - target)
        const vmag = Math.abs(nsv)
        if (lt < INTRO_DUR + 0.25 || err > 0.004 || vmag > 0.01) allDone = false
      }
    }

    if (allDone) introActive.current = false

    for (let i = 0; i < n; i++) {
      const el = refsRef.current[i]?.el
      if (!el) continue
      gsap.set(el, { opacity: introOpacity.current[i], scale: introScale.current[i] })
    }
  }

  function forceEndIntro() {
    if (!introActive.current) return
    introActive.current = false
    introCursorSet.current = true
    for (let i = 0; i < tilesRef.current.length; i++) {
      tileViewX.current[i] = introBase.current[i].x
      tileViewY.current[i] = introBase.current[i].y
      const el = refsRef.current[i]?.el
      if (el) gsap.set(el, { opacity: 1, scale: 1 })
    }
    if (rootRef.current) rootRef.current.style.cursor = "grab"
  }

  // ✅ 드래그 가능 여부: "gate 오픈 시간 + N초" 기준 (핵심)
  function canDragNow(now: number) {
    if (!introGateReady.current) return false
    return now >= dragEnableAtMs.current
  }

  function handleTileClick(i: number) {
    if (performance.now() < suppressClickUntil.current) return
    if (detailOpenRef.current) return
    const rawId = tilesRef.current[i]?.id
    if (!rawId) return

    const t = tilesRef.current[i]
    const vw = viewW.current || window.innerWidth
    const vh = viewH.current || window.innerHeight

    // 원래 pan 위치 저장 (reverse 용)
    panBeforeDetail.current = { x: panTarget.current.x, y: panTarget.current.y }

    // grid 전체를 pan → 클릭한 타일이 (20%, 12%) 위치로 이동
    panTarget.current.x = vw * 0.2 - t.col * SPAN
    panTarget.current.y = vh * 0.12 - t.row * SPAN
    panVel.current.x = 0
    panVel.current.y = 0

    openDetail(rawId)
  }

  function openDetail(rawId: string) {
    const id = normalizeId(rawId)
    selectedIdRef.current = id
    detailOpenRef.current = true
    setDetailOpen(true)
    setDetailLoading(true)
    setDetailData(null)

    fetch(`/api/pf-detail?id=${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setDetailData(null)
        else setDetailData(data)
        setDetailLoading(false)
      })
      .catch(() => {
        setDetailData(null)
        setDetailLoading(false)
      })
  }

  function beginCloseDetail() {
    // grid pan 복귀 + blur 제거 (overlay는 아직 mounted 상태 유지)
    panTarget.current.x = panBeforeDetail.current.x
    panTarget.current.y = panBeforeDetail.current.y
    panVel.current.x = 0
    panVel.current.y = 0
    if (gridLayerRef.current) gridLayerRef.current.style.filter = "blur(0px)"
    if (rootRef.current) rootRef.current.style.cursor = "grab"
  }

  function closeDetail() {
    detailOpenRef.current = false
    selectedIdRef.current = null
    setDetailOpen(false)
    setDetailData(null)
    setDetailLoading(false)
  }

  function resizeTrailCanvas() {
    const cvs = trailCanvasRef.current
    if (!cvs) return
    const dpr = window.devicePixelRatio || 1
    const w = viewW.current || window.innerWidth
    const h = viewH.current || window.innerHeight
    cvs.width = w * dpr
    cvs.height = h * dpr
    cvs.style.width = `${w}px`
    cvs.style.height = `${h}px`
    const ctx = cvs.getContext("2d")
    if (ctx) {
      ctx.scale(dpr, dpr)
      trailCtxRef.current = ctx
    }
    trailPoints.current = []
    trailFading.current = false
  }

  function drawTrail(now: number) {
    const ctx = trailCtxRef.current
    const cvs = trailCanvasRef.current
    if (!ctx || !cvs) return

    const w = viewW.current || window.innerWidth
    const h = viewH.current || window.innerHeight
    ctx.clearRect(0, 0, w, h)

    // Don't draw when detail overlay is open
    if (detailOpenRef.current) {
      trailPoints.current = []
      trailFading.current = false
      return
    }

    const pts = trailPoints.current
    if (pts.length < 2) return

    // Prune old points (by age)
    while (pts.length > 0 && now - pts[0].t > TRAIL_MAX_AGE_MS) {
      pts.shift()
    }
    if (pts.length < 2) return

    // Compute global fade alpha when fading out after drag end
    let globalAlpha = 1
    if (trailFading.current) {
      const elapsed = now - trailFadeStart.current
      globalAlpha = 1 - clamp(elapsed / TRAIL_FADE_DUR_MS, 0, 1)
      if (globalAlpha <= 0) {
        trailPoints.current = []
        trailFading.current = false
        return
      }
    }

    const n = pts.length
    ctx.lineCap = "round"
    ctx.lineJoin = "round"

    for (let i = 1; i < n; i++) {
      const p0 = pts[i - 1]
      const p1 = pts[i]

      // Age-based alpha: newer points are more opaque
      const age0 = now - p0.t
      const age1 = now - p1.t
      const alpha0 = clamp(1 - age0 / TRAIL_MAX_AGE_MS, 0, 1)
      const alpha1 = clamp(1 - age1 / TRAIL_MAX_AGE_MS, 0, 1)
      const segAlpha = (alpha0 + alpha1) * 0.5 * globalAlpha

      if (segAlpha < 0.005) continue

      // Line width taper: tail thin → head thick
      const ratio = i / (n - 1)
      const lw = TRAIL_LINE_WIDTH_MIN + (TRAIL_LINE_WIDTH_MAX - TRAIL_LINE_WIDTH_MIN) * ratio

      ctx.beginPath()
      ctx.strokeStyle = `rgba(${TRAIL_COLOR},${segAlpha})`
      ctx.lineWidth = lw

      // Use quadratic bezier for smoothness when we have 3+ points
      if (i >= 2) {
        const pPrev = pts[i - 2]
        const mx0 = (pPrev.x + p0.x) * 0.5
        const my0 = (pPrev.y + p0.y) * 0.5
        const mx1 = (p0.x + p1.x) * 0.5
        const my1 = (p0.y + p1.y) * 0.5
        ctx.moveTo(mx0, my0)
        ctx.quadraticCurveTo(p0.x, p0.y, mx1, my1)
      } else {
        ctx.moveTo(p0.x, p0.y)
        ctx.lineTo(p1.x, p1.y)
      }

      ctx.stroke()
    }
  }

  function tick(now: number, ids: string[], srcsById: Record<string, string[]>) {
    rafId.current = requestAnimationFrame((t) => tick(t, ids, srcsById))
    if (resizing.current || pendingBind.current) return

    if (!introGateReady.current) {
      for (let i = 0; i < tilesRef.current.length; i++) {
        settersRef.current[i]?.setX?.(tileViewX.current[i])
        settersRef.current[i]?.setY?.(tileViewY.current[i])
      }
      return
    }

    if (!introRan.current) runIntroOnce()

    if (introActive.current) {
      stepIntro(now)
      for (let i = 0; i < tilesRef.current.length; i++) {
        settersRef.current[i]?.setX?.(tileViewX.current[i])
        settersRef.current[i]?.setY?.(tileViewY.current[i])
      }
      return
    }

    if (!introCursorSet.current) {
      introCursorSet.current = true
      if (rootRef.current && !detailOpenRef.current) rootRef.current.style.cursor = "grab"
    }

    const prev = lastT.current || now
    const dt = clamp((now - prev) / 1000, 0, 0.05)
    lastT.current = now

    if (!isDown.current && !detailOpenRef.current) {
      const d = Math.exp(-FRICTION * dt)
      panVel.current.x *= d
      panVel.current.y *= d
      if (Math.abs(panVel.current.x) < 0.01) panVel.current.x = 0
      if (Math.abs(panVel.current.y) < 0.01) panVel.current.y = 0
      panTarget.current.x += panVel.current.x * dt
      panTarget.current.y += panVel.current.y * dt
    }

    {
      const a = expAlpha(dt, PARALLAX_TAU)
      const tx = isDown.current || detailOpenRef.current ? 0 : parallaxTarget.current.x
      const ty = isDown.current || detailOpenRef.current ? 0 : parallaxTarget.current.y
      parallaxView.current.x += (tx - parallaxView.current.x) * a
      parallaxView.current.y += (ty - parallaxView.current.y) * a
    }

    {
      const desiredX = panTarget.current.x + parallaxView.current.x
      const desiredY = panTarget.current.y + parallaxView.current.y
      const tau = isDown.current ? PAN_VIEW_TAU_DRAG : PAN_VIEW_TAU_IDLE
      const a = expAlpha(dt, tau)
      panView.current.x += (desiredX - panView.current.x) * a
      panView.current.y += (desiredY - panView.current.y) * a
    }

    for (let i = 0; i < tilesRef.current.length; i++) {
      wrapIfNeeded(i, ids, srcsById)

      const tt = tilesRef.current[i]
      const baseX = tt.col * SPAN + panView.current.x
      const baseY = tt.row * SPAN + panView.current.y

      const tauTile = computeTau(baseX, baseY)
      const a = expAlpha(dt, tauTile)

      tileViewX.current[i] += (baseX - tileViewX.current[i]) * a
      tileViewY.current[i] += (baseY - tileViewY.current[i]) * a

      settersRef.current[i]?.setX?.(tileViewX.current[i])
      settersRef.current[i]?.setY?.(tileViewY.current[i])
    }

    const desiredX = panTarget.current.x + parallaxView.current.x
    const desiredY = panTarget.current.y + parallaxView.current.y
    const panDx = panView.current.x - prevPanView.current.x
    const panDy = panView.current.y - prevPanView.current.y
    prevPanView.current.x = panView.current.x
    prevPanView.current.y = panView.current.y

    const movedPx = Math.hypot(panDx, panDy)
    const velMag = Math.hypot(panVel.current.x, panVel.current.y)
    const settleErr = Math.hypot(desiredX - panView.current.x, desiredY - panView.current.y)
    if (isDown.current || movedPx > 0.05 || velMag > 0.1 || settleErr > 0.24) {
      lastMotionAtMs.current = now
    }
    const allowVideoWork =
      !isDown.current &&
      now - lastMotionAtMs.current > 420 &&
      now - wheelLastMs.current > 220 &&
      velMag < 0.08 &&
      settleErr < 0.18 &&
      movedPx < 0.03
    if (allowVideoWork && now - lastVideoUpdateAtMs.current > 120) {
      lastVideoUpdateAtMs.current = now
      updateVideosForViewport(now, true)
    }

    drawTrail(now)
  }

  useEffect(() => {
    if (!manifest) return
    const root = rootRef.current
    if (!root) return

    const ids = manifest.ids
    const srcsById = manifest.srcsById

    const rebuild = () => {
      resizing.current = true
      const r = root.getBoundingClientRect()
      buildPool(Math.max(1, r.width), Math.max(1, r.height), ids)
      resizeTrailCanvas()

      pendingBind.current = true
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bindSettersAndMedia(srcsById)
          pendingBind.current = false
          resizing.current = false
          lastT.current = performance.now()
        })
      })
    }

    rebuild()

    if (rafId.current) cancelAnimationFrame(rafId.current)
    lastT.current = performance.now()
    rafId.current = requestAnimationFrame((t) => tick(t, ids, srcsById))

    const onDown = (e: PointerEvent) => {
      dismissDragHint()
      if (detailOpenRef.current) return
      if (!introGateReady.current) return
      if (pointerId.current !== null) return

      if (!canDragNow(performance.now())) return

      forceEndIntro()

      pointerId.current = e.pointerId
      isDown.current = true
      if (rootRef.current) rootRef.current.style.cursor = "grabbing"

      lastP.current.x = e.clientX
      lastP.current.y = e.clientY
      dragStartPos.current = { x: e.clientX, y: e.clientY }

      downInfo.current = { x: e.clientX, y: e.clientY, t: performance.now() }

      panVel.current.x = 0
      panVel.current.y = 0

      // Trail: reset points on drag start
      trailPoints.current = []
      trailFading.current = false
      trailPoints.current.push({ x: e.clientX, y: e.clientY, t: performance.now() })
    }

    const onMove = (e: PointerEvent) => {
      if (!isDown.current) return
      if (pointerId.current !== e.pointerId) return
      if (detailOpenRef.current) return

      const dx = e.clientX - lastP.current.x
      const dy = e.clientY - lastP.current.y
      lastP.current.x = e.clientX
      lastP.current.y = e.clientY

      panTarget.current.x += dx
      panTarget.current.y += dy

      const now = performance.now()
      const prev = (onMove as any)._prev ?? now
      const mdt = clamp((now - prev) / 1000, 1e-3, 0.05)
      ;(onMove as any)._prev = now

      panVel.current.x = clamp(dx / mdt, -MAX_VEL, MAX_VEL)
      panVel.current.y = clamp(dy / mdt, -MAX_VEL, MAX_VEL)

      // Trail: record point
      const tp = trailPoints.current
      tp.push({ x: e.clientX, y: e.clientY, t: now })
      if (tp.length > TRAIL_MAX_POINTS) tp.shift()
    }

    const onUp = (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return
      isDown.current = false
      pointerId.current = null
      if (rootRef.current && !detailOpenRef.current) rootRef.current.style.cursor = "grab"

      // Trail: start fading
      if (trailPoints.current.length > 0) {
        trailFading.current = true
        trailFadeStart.current = performance.now()
      }

      const di = downInfo.current
      downInfo.current = null
      if (di) {
        const dx = e.clientX - di.x
        const dy = e.clientY - di.y
        const dist = Math.hypot(dx, dy)
        const dt = performance.now() - di.t
        if (dist > 6 || dt > 250) suppressClickUntil.current = performance.now() + 250
      }
    }

    const onResize = () => {
      resizing.current = true
      if (resizeTimer.current) window.clearTimeout(resizeTimer.current)
      resizeTimer.current = window.setTimeout(rebuild, 140)
    }

    const onWheel = (e: WheelEvent) => {
      dismissDragHint()
      if (detailOpenRef.current) return
      if (!introGateReady.current) return
      forceEndIntro()

      const nowMs = performance.now()
      const startBurst = !dragStartPos.current || nowMs - wheelLastMs.current > 140
      wheelLastMs.current = nowMs

      let dy = e.deltaY
      if (e.deltaMode === 1) dy *= 16
      else if (e.deltaMode === 2) dy *= window.innerHeight

      // 버스트 시작점에 리플 기준점을 고정해 이벤트마다 tau가 튀는 현상 방지
      if (startBurst) {
        dragStartPos.current = { x: e.clientX, y: e.clientY }
      }

      // wheel delta를 속도 임펄스로 넣어 드래그 릴리즈와 같은 연속 감쇠 곡선으로 통일
      const WHEEL_TO_VEL = 13.5
      panVel.current.y = clamp(panVel.current.y + -dy * WHEEL_TO_VEL, -MAX_VEL, MAX_VEL)
      lastMotionAtMs.current = nowMs
    }

    window.addEventListener("pointerdown", onDown, { passive: true })
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerup", onUp, { passive: true })
    window.addEventListener("pointercancel", onUp, { passive: true })
    window.addEventListener("wheel", onWheel, { passive: true })
    window.addEventListener("resize", onResize)

    return () => {
      window.removeEventListener("pointerdown", onDown)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      window.removeEventListener("wheel", onWheel)
      window.removeEventListener("resize", onResize)
      if (rafId.current) cancelAnimationFrame(rafId.current)
      rafId.current = null
      if (resizeTimer.current) window.clearTimeout(resizeTimer.current)


      activeVideoSet.current.forEach((idx) => stopVideo(idx))
      activeVideoSet.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest])

  // mouse parallax (intro 중은 꺼둠)
  useEffect(() => {
    let raf: number | null = null
    let mx = 0
    let my = 0

    const onMove = (e: MouseEvent) => {
      mx = e.clientX
      my = e.clientY
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = null
        if (detailOpenRef.current) return
        if (!introGateReady.current) return
        if (introActive.current) return

        const vw = Math.max(1, viewW.current || window.innerWidth)
        const vh = Math.max(1, viewH.current || window.innerHeight)
        const cx = vw / 2
        const cy = vh / 2
        const nx = (mx - cx) / cx
        const ny = (my - cy) / cy

        parallaxTarget.current.x = -nx * PARALLAX_STRENGTH
        parallaxTarget.current.y = -ny * PARALLAX_STRENGTH
      })
    }

    window.addEventListener("mousemove", onMove, { passive: true })
    return () => {
      window.removeEventListener("mousemove", onMove)
      if (raf) cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div
      ref={rootRef}
      className="relative w-full h-full overflow-hidden bg-black select-none touch-none"
      style={{
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        cursor: "default",
      }}
    >
      <style>{`
        .pf-tile { overflow: visible; }
        .pf-tile:hover { z-index: 999; }
        .pf-media { transform: scale(1); transition: transform 600ms ${EASE_OUT_QUINT}; will-change: transform; }
        .pf-tile:hover .pf-media { transform: scale(1.3); }

        .pf-hover {
          position:absolute;
          left:50%;
          top:${TILE + 30}px;
          transform:translateX(-50%) translateY(6px);
          display:flex;
          flex-direction:column;
          align-items:center;
          gap:6px;
          width:max-content;
          white-space:nowrap;
          overflow:visible;
          text-overflow:clip;
          pointer-events:none;
          user-select:none;
          opacity:0;
          transition:opacity 260ms linear, transform 260ms ${EASE_OUT_QUINT};
          z-index:50;
        }
        .pf-tile:hover .pf-hover { opacity:1; transform:translateX(-50%) translateY(0); }
        .pf-h-title { font-size:14px; line-height:1.2; color:rgba(255,255,255,0.92); font-weight:500; }
        .pf-h-year  { font-size:12px; line-height:1.2; color:rgba(255,255,255,0.75); font-weight:400; }
      `}</style>

      {dragHintMounted && (
        <div
          ref={dragHintRef}
          className="fixed left-0 top-0 pointer-events-none"
          style={{
            zIndex: 1200,
            opacity: 1,
            transform: "scale(0)",
            visibility: "hidden",
            willChange: "transform, opacity",
          }}
        >
          <div
            style={{
              position: "relative",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "max-content",
              borderRadius: 30,
              backgroundColor: "#fff",
              padding: "10px 14px",
              boxSizing: "border-box",
              textAlign: "left",
              fontSize: 11,
              color: "#000",
              fontFamily: "'Circular Std', sans-serif",
              letterSpacing: "-0.01em",
              lineHeight: "123%",
              fontWeight: 500,
              whiteSpace: "nowrap",
              boxShadow: "0 8px 18px rgba(0,0,0,0.24)",
            }}
          >
            Drag or Scroll
          </div>
        </div>
      )}

      <div ref={gridLayerRef} className="absolute inset-0" style={{ filter: detailOpen ? "blur(14px)" : "blur(0px)", transition: "filter 500ms cubic-bezier(0.22,1,0.36,1)", willChange: "filter" }}>
        <div className="absolute inset-0">
          {renderIds.map((i) => (
            <div
              key={i}
              ref={(el) => {
                if (!refsRef.current[i]) refsRef.current[i] = { el: null, img: null, vid: null, media: null, label: null }
                refsRef.current[i].el = el
              }}
              className="absolute will-change-transform pf-tile"
              style={{ width: TILE, height: TILE + 70 }}
              onClick={() => handleTileClick(i)}
            >
              <div
                ref={(el) => {
                  if (!refsRef.current[i]) refsRef.current[i] = { el: null, img: null, vid: null, media: null, label: null }
                  refsRef.current[i].media = el
                }}
                className="relative w-full pf-media"
                style={{
                  width: TILE,
                  height: TILE,
                  borderRadius: RADIUS,
                  overflow: "hidden",
                  background: "#000",
                  boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.06)",
                }}
              >
                <img
                  ref={(el) => {
                    if (!refsRef.current[i]) refsRef.current[i] = { el: null, img: null, vid: null, media: null, label: null }
                    refsRef.current[i].img = el
                  }}
                  alt=""
                  draggable={false}
                  decoding="async"
                  loading="eager"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "block",
                    borderRadius: RADIUS,
                    pointerEvents: "none",
                    userSelect: "none",
                    opacity: 0,
                    visibility: "visible",
                    zIndex: 2,
                  }}
                />

                <video
                  ref={(el) => {
                    if (!refsRef.current[i]) refsRef.current[i] = { el: null, img: null, vid: null, media: null, label: null }
                    refsRef.current[i].vid = el
                  }}
                  muted
                  playsInline
                  loop
                  preload="none"
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                    display: "none",
                    opacity: 0,
                    transition: "opacity 140ms linear",
                    borderRadius: RADIUS,
                    pointerEvents: "none",
                    userSelect: "none",
                    zIndex: 3,
                  }}
                />
              </div>

              <div
                ref={(el) => {
                  if (!refsRef.current[i]) refsRef.current[i] = { el: null, img: null, vid: null, media: null, label: null }
                  refsRef.current[i].label = el
                }}
                className="pf-hover"
              />
            </div>
          ))}
        </div>
      </div>

      <canvas
        ref={trailCanvasRef}
        style={{
          position: "fixed",
          inset: 0,
          pointerEvents: "none",
          zIndex: 60,
        }}
      />

      <DetailOverlay open={detailOpen} loading={detailLoading} data={detailData} onBeginClose={beginCloseDetail} onClose={closeDetail} />
    </div>
  )
}
