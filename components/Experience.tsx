"use client"

import React, { useEffect, useRef, useState } from "react"
import gsap from "gsap"

type TileModel = { col: number; row: number; id: string }
type TileRefs = { el: HTMLDivElement | null; img: HTMLImageElement | null }
type TileSetters = { setX: ((v: number) => void) | null; setY: ((v: number) => void) | null }

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

export default function Experience() {
  // ===== Layout =====
  const TILE = 130
  const GAP = 140
  const SPAN = TILE + GAP
  const RADIUS = 6
  const WRAP_MARGIN = 2

  // ===== Inertia (약 0.5초 감각) =====
  const FRICTION = 13.5
  const MAX_VEL = 5200

  // ===== pan smoothing =====
  const PAN_VIEW_TAU_DRAG = 0.14
  const PAN_VIEW_TAU_IDLE = 0.08

  // ===== Ripple timing (Framer-like) =====
  const RIPPLE_BASE_DUR = 0.5
  const RIPPLE_STEP_DUR = 0.3
  const RIPPLE_MAX_DUR = 3.2
  const RIPPLE_MAX_RING = 10

  // 🔥 2배 빠르게: tau 절반
  const durToTau = (dur: number) => dur / 6

  // ===== manifest =====
  const [manifest, setManifest] = useState<{ ids: string[]; srcById: Record<string, string>; error?: string } | null>(
    null
  )
  useEffect(() => {
    let alive = true
    fetch("/api/pf-manifest", { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && setManifest(j))
      .catch((e) => alive && setManifest({ ids: [], srcById: {}, error: String(e) }))
    return () => {
      alive = false
    }
  }, [])

  const rootRef = useRef<HTMLDivElement | null>(null)
  const [renderIds, setRenderIds] = useState<number[]>([])

  const tilesRef = useRef<TileModel[]>([])
  const refsRef = useRef<TileRefs[]>([])
  const settersRef = useRef<TileSetters[]>([])
  const lastIdByTile = useRef<string[]>([])

  // coord -> id (인접 중복 최소화용)
  const coordIdRef = useRef<Map<string, string>>(new Map())

  // viewport/pool
  const viewW = useRef(0)
  const viewH = useRef(0)
  const poolCols = useRef(0)
  const poolRows = useRef(0)

  // RAF
  const rafId = useRef<number | null>(null)
  const lastT = useRef(0)
  const resizing = useRef(false)
  const pendingBind = useRef(false)
  const resizeTimer = useRef<number | null>(null)

  // world motion
  const panTarget = useRef({ x: 0, y: 0 })
  const panView = useRef({ x: 0, y: 0 })
  const panVel = useRef({ x: 0, y: 0 })

  // per-tile follower (Framer tileX/tileY)
  const tileViewX = useRef<number[]>([])
  const tileViewY = useRef<number[]>([])

  // input
  const isDown = useRef(false)
  const pointerId = useRef<number | null>(null)
  const lastP = useRef({ x: 0, y: 0 })
  const dragStartPos = useRef<{ x: number; y: number } | null>(null)

  function ensureArrays(n: number) {
    if (tileViewX.current.length !== n) tileViewX.current = new Array(n).fill(0)
    if (tileViewY.current.length !== n) tileViewY.current = new Array(n).fill(0)
    if (lastIdByTile.current.length !== n) lastIdByTile.current = new Array(n).fill("")
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

  function applyTileImage(i: number, srcById: Record<string, string>) {
    const img = refsRef.current[i]?.img
    if (!img) return

    const id = tilesRef.current[i].id
    if (lastIdByTile.current[i] === id) return
    lastIdByTile.current[i] = id

    const src = srcById[id]
    if (!src) {
      img.removeAttribute("src")
      img.style.opacity = "0"
      return
    }

    // assign
    if (img.src !== src) img.src = src
    img.style.opacity = "1"
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
        refs.push({ el: null, img: null })
        setters.push({ setX: null, setY: null })
      }
    }

    tilesRef.current = tiles
    refsRef.current = refs
    settersRef.current = setters

    ensureArrays(tiles.length)

    // 초기 표시 위치를 base로 맞춤 (초기 튐 방지)
    for (let i = 0; i < tiles.length; i++) {
      tileViewX.current[i] = tiles[i].col * SPAN + panView.current.x
      tileViewY.current[i] = tiles[i].row * SPAN + panView.current.y
    }

    setRenderIds(Array.from({ length: tiles.length }, (_, i) => i))
  }

  function bindSettersAndImages(srcById: Record<string, string>) {
    for (let i = 0; i < refsRef.current.length; i++) {
      const el = refsRef.current[i]?.el
      const img = refsRef.current[i]?.img
      if (!el || !img) continue

      gsap.set(el, { x: 0, y: 0, force3D: true })
      settersRef.current[i].setX = gsap.quickSetter(el, "x", "px") as any
      settersRef.current[i].setY = gsap.quickSetter(el, "y", "px") as any

      applyTileImage(i, srcById)
    }
  }

  function wrapIfNeeded(i: number, ids: string[], srcById: Record<string, string>) {
    const t = tilesRef.current[i]
    const vw = viewW.current
    const vh = viewH.current

    // base 기준으로 밖으로 나갔는지 판단
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
      // 화면 밖에서만 콘텐츠 교체
      const map = coordIdRef.current
      map.delete(keyOf(oc, or))

      t.id = pickIdNoAdjRepeat(t.col, t.row, ids)
      map.set(keyOf(t.col, t.row), t.id)

      applyTileImage(i, srcById)

      // wrap 순간 표시 좌표도 base로 보정 (겹침/튐 방지)
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
    const ring = clamp(Math.floor(dist / SPAN), 0, RIPPLE_MAX_RING)
    const dur = clamp(RIPPLE_BASE_DUR + ring * RIPPLE_STEP_DUR, RIPPLE_BASE_DUR, RIPPLE_MAX_DUR)
    return durToTau(dur)
  }

  function tick(now: number, ids: string[], srcById: Record<string, string>) {
    rafId.current = requestAnimationFrame((t) => tick(t, ids, srcById))
    if (resizing.current || pendingBind.current) return

    const prev = lastT.current || now
    const dt = clamp((now - prev) / 1000, 0, 0.05)
    lastT.current = now

    // inertia integrate
    if (!isDown.current) {
      const d = Math.exp(-FRICTION * dt)
      panVel.current.x *= d
      panVel.current.y *= d
      if (Math.abs(panVel.current.x) < 10) panVel.current.x = 0
      if (Math.abs(panVel.current.y) < 10) panVel.current.y = 0
      panTarget.current.x += panVel.current.x * dt
      panTarget.current.y += panVel.current.y * dt
    }

    // panView smoothing
    {
      const tau = isDown.current ? PAN_VIEW_TAU_DRAG : PAN_VIEW_TAU_IDLE
      const a = expAlpha(dt, tau)
      panView.current.x += (panTarget.current.x - panView.current.x) * a
      panView.current.y += (panTarget.current.y - panView.current.y) * a
    }

    for (let i = 0; i < tilesRef.current.length; i++) {
      wrapIfNeeded(i, ids, srcById)

      const t = tilesRef.current[i]
      const baseX = t.col * SPAN + panView.current.x
      const baseY = t.row * SPAN + panView.current.y

      // per-tile follower
      const tauTile = computeTau(baseX, baseY)
      const a = expAlpha(dt, tauTile)

      tileViewX.current[i] += (baseX - tileViewX.current[i]) * a
      tileViewY.current[i] += (baseY - tileViewY.current[i]) * a

      settersRef.current[i]?.setX?.(tileViewX.current[i])
      settersRef.current[i]?.setY?.(tileViewY.current[i])
    }
  }

  // init + resize
  useEffect(() => {
    if (!manifest) return
    const root = rootRef.current
    if (!root) return

    const ids = manifest.ids
    const srcById = manifest.srcById

    const rebuild = () => {
      resizing.current = true
      const r = root.getBoundingClientRect()
      buildPool(Math.max(1, r.width), Math.max(1, r.height), ids)

      // ✅ DOM이 실제로 붙은 다음에만 바인딩해야 함 (1~2프레임 뒤)
      pendingBind.current = true
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          bindSettersAndImages(srcById)
          pendingBind.current = false
          resizing.current = false
          lastT.current = performance.now()
        })
      })
    }

    rebuild()

    if (rafId.current) cancelAnimationFrame(rafId.current)
    lastT.current = performance.now()
    rafId.current = requestAnimationFrame((t) => tick(t, ids, srcById))

    const onDown = (e: PointerEvent) => {
      if (pointerId.current !== null) return
      pointerId.current = e.pointerId
      isDown.current = true

      lastP.current.x = e.clientX
      lastP.current.y = e.clientY
      dragStartPos.current = { x: e.clientX, y: e.clientY }

      // 반동/점프 방지: drag 시작 시 velocity reset
      panVel.current.x = 0
      panVel.current.y = 0
    }

    const onMove = (e: PointerEvent) => {
      if (!isDown.current) return
      if (pointerId.current !== e.pointerId) return

      const dx = e.clientX - lastP.current.x
      const dy = e.clientY - lastP.current.y
      lastP.current.x = e.clientX
      lastP.current.y = e.clientY

      panTarget.current.x += dx
      panTarget.current.y += dy

      // 속도 추정
      const now = performance.now()
      const prev = (onMove as any)._prev ?? now
      const mdt = clamp((now - prev) / 1000, 1e-3, 0.05)
      ;(onMove as any)._prev = now

      panVel.current.x = clamp(dx / mdt, -MAX_VEL, MAX_VEL)
      panVel.current.y = clamp(dy / mdt, -MAX_VEL, MAX_VEL)
    }

    const onUp = (e: PointerEvent) => {
      if (pointerId.current !== e.pointerId) return
      isDown.current = false
      pointerId.current = null
    }

    const onResize = () => {
      resizing.current = true
      if (resizeTimer.current) window.clearTimeout(resizeTimer.current)
      resizeTimer.current = window.setTimeout(rebuild, 140)
    }

    window.addEventListener("pointerdown", onDown, { passive: true })
    window.addEventListener("pointermove", onMove, { passive: true })
    window.addEventListener("pointerup", onUp, { passive: true })
    window.addEventListener("pointercancel", onUp, { passive: true })
    window.addEventListener("resize", onResize)

    return () => {
      window.removeEventListener("pointerdown", onDown)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
      window.removeEventListener("resize", onResize)
      if (rafId.current) cancelAnimationFrame(rafId.current)
      rafId.current = null
      if (resizeTimer.current) window.clearTimeout(resizeTimer.current)
    }
  }, [manifest])

  return (
    <div
      ref={rootRef}
      className="relative w-full h-full overflow-hidden bg-black select-none touch-none"
      style={{
        // 추가 안전장치: 브라우저 기본 드래그/선택 방지
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
      }}
    >
      <div className="absolute inset-0">
        {renderIds.map((i) => (
          <div
            key={i}
            ref={(el) => {
              if (!refsRef.current[i]) refsRef.current[i] = { el: null, img: null }
              refsRef.current[i].el = el
            }}
            className="absolute will-change-transform"
            style={{ width: TILE, height: TILE }}
          >
            <div
              className="relative w-full h-full"
              style={{
                borderRadius: RADIUS,
                overflow: "hidden",
                background: "rgba(255,255,255,0.06)",
              }}
            >
              <img
                ref={(el) => {
                  if (!refsRef.current[i]) refsRef.current[i] = { el: null, img: null }
                  refsRef.current[i].img = el
                }}
                alt=""
                draggable={false}
                decoding="async"
                loading="eager"
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                  borderRadius: RADIUS,
                  pointerEvents: "none",
                  userSelect: "none",
                  opacity: 0,
                  transition: "opacity 120ms linear",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
