"use client"

import { useMemo, useRef } from "react"

export type RippleFieldOptions = {
  /** 가까운 타일이 따라오는 체감 duration (초) */
  nearDuration: number // e.g. 0.5
  /** 먼 타일이 따라오는 체감 duration (초) */
  farDuration: number // e.g. 1.0

  /** dist=0~maxDistTiles 사이에서 duration을 near→far로 보간 */
  maxDistTiles: number // e.g. 6

  /** duration에 섞이는 랜덤(개별성) 강도 */
  noiseDuration: number // e.g. 0.08

  /**
   * ripple 변위 스케일(픽셀)
   * - drag impulse(Δpx)를 그대로 쓰면 너무 커질 수 있어 스케일링
   */
  impulseScale: number // e.g. 1.0 (보통 1.0 근처)

  /** drag가 없을 때 impulse가 0으로 수렴하는 시간상수(초) */
  impulseTau: number // e.g. 0.06
}

export type RippleTile = {
  col: number
  row: number
}

/**
 * 개별 타일 기반 ripple 필드
 * - 입력: 현재 프레임의 drag impulse (dx, dy)
 * - 출력: 타일별 ripple offset (ox, oy)
 */
export function useRippleField(opts: RippleFieldOptions) {
  const tilesRef = useRef<RippleTile[]>([])

  // 타일별 상태
  const oxRef = useRef<number[]>([])
  const oyRef = useRef<number[]>([])
  const tauRef = useRef<number[]>([])

  // 드래그 원점(타일 좌표)
  const originColRef = useRef(0)
  const originRowRef = useRef(0)

  // 입력 impulse는 tick에서 스무딩
  const impulseXRef = useRef(0)
  const impulseYRef = useRef(0)

  const options = useMemo(() => opts, [opts])

  function setTiles(tiles: RippleTile[]) {
    tilesRef.current = tiles

    const n = tiles.length
    oxRef.current = new Array(n).fill(0)
    oyRef.current = new Array(n).fill(0)
    tauRef.current = new Array(n).fill(0.12)
  }

  function setOrigin(col: number, row: number) {
    originColRef.current = col
    originRowRef.current = row

    // origin이 바뀌면 각 타일의 tau(개별성 포함)를 다시 계산
    const tiles = tilesRef.current
    const n = tiles.length

    const near = options.nearDuration
    const far = options.farDuration
    const maxD = Math.max(1e-6, options.maxDistTiles)
    const noise = options.noiseDuration

    for (let i = 0; i < n; i++) {
      const t = tiles[i]
      const dc = t.col - col
      const dr = t.row - row
      const dist = Math.hypot(dc, dr) // “개별” 느낌엔 euclidean이 더 자연스럽다

      const u = Math.max(0, Math.min(1, dist / maxD)) // 0..1
      // base duration near->far
      let dur = near + (far - near) * u

      // seeded noise (타일마다 고정)
      const seed = seed01(t.col, t.row)
      const n01 = seed * 2 - 1 // -1..1
      dur += n01 * noise

      // clamp duration
      dur = Math.max(0.18, Math.min(1.6, dur))

      // 지수 스무딩의 tau는 "체감 duration"을 그대로 쓰면 너무 느리게 보이기 때문에,
      // settle(≈95%)가 ~3*tau 라는 점을 이용해 tau = duration/3 로 매핑
      tauRef.current[i] = dur / 3
    }
  }

  function setImpulse(dx: number, dy: number) {
    impulseXRef.current = dx
    impulseYRef.current = dy
  }

  /**
   * 매 프레임 호출:
   * - impulse를 0으로 수렴시키면서(드래그 종료 후 자연 해소)
   * - 각 타일 offset을 개별 tau로 업데이트
   */
  function tick(dt: number, isDragging: boolean) {
    // impulse 스무딩: 드래그 중엔 즉시, 드래그 아니면 0으로 감쇠
    const itau = options.impulseTau
    const ia = 1 - Math.exp(-dt / Math.max(1e-6, itau))

    if (!isDragging) {
      // release 후 impulse가 자연스럽게 0으로
      impulseXRef.current += (0 - impulseXRef.current) * ia
      impulseYRef.current += (0 - impulseYRef.current) * ia
    }

    const ix = impulseXRef.current * options.impulseScale
    const iy = impulseYRef.current * options.impulseScale

    const ox = oxRef.current
    const oy = oyRef.current
    const tau = tauRef.current

    for (let i = 0; i < ox.length; i++) {
      const a = 1 - Math.exp(-dt / Math.max(1e-6, tau[i]))
      ox[i] += (ix - ox[i]) * a
      oy[i] += (iy - oy[i]) * a
    }
  }

  function getOffset(i: number) {
    return { x: oxRef.current[i] || 0, y: oyRef.current[i] || 0 }
  }

  return {
    setTiles,
    setOrigin,
    setImpulse,
    tick,
    getOffset,
  }
}

/** 0..1 deterministic random */
function seed01(col: number, row: number) {
  let h = ((col * 73856093) ^ (row * 19349663)) >>> 0
  // xorshift-ish mix
  h ^= h << 13
  h ^= h >>> 17
  h ^= h << 5
  return (h >>> 0) / 4294967295
}
