"use client"

import React, { useEffect, useLayoutEffect, useRef } from "react"
import gsap from "gsap"
import Lenis from "lenis"

type DetailSection = { headline?: string; paragraph?: string; imageUrl?: string; videoUrl?: string }

function toDirectVideoUrl(url: string): string {
  try {
    const u = new URL(url)
    if (u.hostname === "player.cloudinary.com") {
      const cloud = u.searchParams.get("cloud_name")
      const pub = u.searchParams.get("public_id")
      if (cloud && pub) return `https://res.cloudinary.com/${cloud}/video/upload/${pub}.mp4`
    }
  } catch {}
  return url
}
type DetailData = { title?: string; year?: string; slug?: string; detailSections?: DetailSection[] | null }

type Props = {
  open: boolean
  loading: boolean
  data: DetailData | null
  panelWidthVw?: number
  onBeginClose: () => void
  onClose: () => void
}

export default function DetailOverlay({ open, loading, data, panelWidthVw = 50, onBeginClose, onClose }: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const scrollerRef = useRef<HTMLDivElement | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const scrollThumbRef = useRef<HTMLDivElement | null>(null)
  const gradientRef = useRef<HTMLDivElement | null>(null)
  const xBtnRef = useRef<HTMLDivElement | null>(null)

  const lenisRef = useRef<Lenis | null>(null)
  const drag = useRef({ active: false, pid: -1, lastY: 0 })
  const isOnContent = useRef(false)
  const appearDone = useRef(false)
  const closing = useRef(false)

  const EASE = "cubic-bezier(0.22,1,0.36,1)"
  const BTN = 52
  const FOLLOW_LERP = 0.15
  const SCROLLBAR_PAD = 10

  // smooth follow state
  const btnTarget = useRef({ x: -BTN, y: -BTN })
  const btnPos = useRef({ x: -BTN, y: -BTN })
  const followRaf = useRef<number | null>(null)
  const scrollUiRaf = useRef<number | null>(null)
  const scrollHideTimer = useRef<number | null>(null)
  const scrollPendingActive = useRef(false)

  // persistent mouse position tracker (always on)
  const lastMouse = useRef({ x: 0, y: 0 })
  useEffect(() => {
    const track = (e: MouseEvent) => {
      lastMouse.current.x = e.clientX
      lastMouse.current.y = e.clientY
    }
    window.addEventListener("mousemove", track, { passive: true })
    return () => window.removeEventListener("mousemove", track)
  }, [])

  // open/close: cleanup + initialize X button on open
  useEffect(() => {
    if (!open) {
      isOnContent.current = false
      appearDone.current = false
      closing.current = false
      document.documentElement.style.cursor = ""
      if (followRaf.current) {
        cancelAnimationFrame(followRaf.current)
        followRaf.current = null
      }
      if (scrollUiRaf.current) {
        cancelAnimationFrame(scrollUiRaf.current)
        scrollUiRaf.current = null
      }
      if (scrollHideTimer.current) {
        window.clearTimeout(scrollHideTimer.current)
        scrollHideTimer.current = null
      }
      const thumb = scrollThumbRef.current
      if (thumb) gsap.set(thumb, { opacity: 0, y: SCROLLBAR_PAD })
    } else {
      // initialize X button position from current cursor
      const mx = lastMouse.current.x
      const my = lastMouse.current.y
      btnTarget.current = { x: mx - BTN / 2, y: my - BTN / 2 }
      btnPos.current = { x: mx - BTN / 2, y: my - BTN / 2 }

      // determine if cursor is over content area (right side panel)
      const contentLeft = window.innerWidth * (1 - panelWidthVw / 100)
      const onContent = mx >= contentLeft
      isOnContent.current = onContent

      // defer to next frame so xBtnRef is mounted
      requestAnimationFrame(() => {
        const btn = xBtnRef.current
        if (!btn) return
        btn.style.left = `${btnPos.current.x}px`
        btn.style.top = `${btnPos.current.y}px`
        if (onContent) {
          document.documentElement.style.cursor = ""
          gsap.set(btn, { scale: 0 })
        } else {
          document.documentElement.style.cursor = "none"
          gsap.set(btn, { scale: 1 })
        }
      })
    }
  }, [open, panelWidthVw])

  // rAF loop: smooth follow
  useEffect(() => {
    if (!open) return

    const tick = () => {
      const btn = xBtnRef.current
      if (btn) {
        btnPos.current.x += (btnTarget.current.x - btnPos.current.x) * FOLLOW_LERP
        btnPos.current.y += (btnTarget.current.y - btnPos.current.y) * FOLLOW_LERP
        btn.style.left = `${btnPos.current.x}px`
        btn.style.top = `${btnPos.current.y}px`
      }
      followRaf.current = requestAnimationFrame(tick)
    }

    followRaf.current = requestAnimationFrame(tick)
    return () => {
      if (followRaf.current) cancelAnimationFrame(followRaf.current)
      followRaf.current = null
    }
  }, [open])

  // 마우스 추적 + content 안/밖 감지
  useEffect(() => {
    if (!open) return

    const moveCb = (e: MouseEvent) => {
      // target 위치 업데이트 (rAF에서 smooth 보간)
      btnTarget.current.x = e.clientX - BTN / 2
      btnTarget.current.y = e.clientY - BTN / 2

      // 드래그 중이면 상태 변경 안 함
      if (drag.current.active) return

      // content 영역 안/밖 감지
      const t = e.target as HTMLElement
      const nowOnContent = !!t.closest("[data-detail-content='1']")
      if (nowOnContent === isOnContent.current) return
      isOnContent.current = nowOnContent

      const btn = xBtnRef.current
      if (!btn) return

      if (nowOnContent) {
        // detail page 위: X 숨김, 시스템 커서 보임
        document.documentElement.style.cursor = ""
        gsap.to(btn, { scale: 0, duration: 0.3, ease: EASE, overwrite: true })
      } else {
        // 밖: X 보임 + 커서 숨김
        document.documentElement.style.cursor = "none"
        gsap.to(btn, { scale: 1, duration: 0.3, ease: EASE, overwrite: true })
      }
    }

    window.addEventListener("mousemove", moveCb, { passive: true })
    return () => {
      window.removeEventListener("mousemove", moveCb)
      document.documentElement.style.cursor = ""
    }
  }, [open])

  // appear animation: staggered fade-in + slide-up
  useLayoutEffect(() => {
    if (!open) return
    if (loading || appearDone.current) return
    appearDone.current = true

    const scroller = scrollerRef.current
    if (!scroller) return

    const blocks = scroller.querySelectorAll<HTMLElement>("[data-detail-block]")
    const vh = window.innerHeight
    const visible: HTMLElement[] = []

    blocks.forEach((block) => {
      const rect = block.getBoundingClientRect()
      if (rect.top <= vh) {
        visible.push(block)
      }
    })

    // gradient fade-in
    if (gradientRef.current) {
      gsap.fromTo(gradientRef.current, { opacity: 0 }, { opacity: 1, duration: 1, ease: "power4.out" })
    }

    visible.forEach((block, i) => {
      gsap.fromTo(
        block,
        { opacity: 0, y: 40 },
        { opacity: 1, y: 0, duration: 1, ease: "power4.out", delay: (i + 1) * 0.1 }
      )
    })
  }, [open, loading])

  // Lenis smooth scroll + drag-to-scroll
  useEffect(() => {
    if (!open || loading) return
    const host = hostRef.current
    const scroller = scrollerRef.current
    if (!host || !scroller) return

    // Lenis: wrapper(scroller)를 smooth scroll 대상으로 지정
    const lenis = new Lenis({
      wrapper: scroller,
      lerp: 0.1,
      smoothWheel: true,
    })
    lenisRef.current = lenis

    // Lenis rAF loop
    let rafId: number
    const raf = (time: number) => {
      lenis.raf(time)
      rafId = requestAnimationFrame(raf)
    }
    rafId = requestAnimationFrame(raf)

    // drag-to-scroll
    const isInteractive = (t: HTMLElement) =>
      !!t.closest("button, a, input, textarea, select, [role='button'], [data-no-drag='1']")

    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (!t.closest("[data-detail-content='1']")) return
      if (isInteractive(t)) return

      drag.current = { active: true, pid: e.pointerId, lastY: e.clientY }
      try { host.setPointerCapture(e.pointerId) } catch {}
      scroller.classList.add("pf-detail-grabbing")
    }

    const onMove = (e: PointerEvent) => {
      if (!drag.current.active || drag.current.pid !== e.pointerId) return
      const dy = e.clientY - drag.current.lastY
      drag.current.lastY = e.clientY
      lenis.scrollTo(scroller.scrollTop - dy, { immediate: true })
    }

    const onUp = (e: PointerEvent) => {
      if (!drag.current.active || drag.current.pid !== e.pointerId) return
      drag.current.active = false
      drag.current.pid = -1
      scroller.classList.remove("pf-detail-grabbing")
      try { host.releasePointerCapture(e.pointerId) } catch {}
    }

    host.addEventListener("pointerdown", onDown)
    host.addEventListener("pointermove", onMove)
    host.addEventListener("pointerup", onUp)
    host.addEventListener("pointercancel", onUp)
    return () => {
      cancelAnimationFrame(rafId)
      lenis.destroy()
      lenisRef.current = null
      host.removeEventListener("pointerdown", onDown)
      host.removeEventListener("pointermove", onMove)
      host.removeEventListener("pointerup", onUp)
      host.removeEventListener("pointercancel", onUp)
    }
  }, [open, loading])

  // custom scrollbar: scroll active only, auto-hide when idle
  useEffect(() => {
    if (!open) return
    const scroller = scrollerRef.current
    const thumb = scrollThumbRef.current
    if (!scroller || !thumb) return

    const updateThumb = (active: boolean) => {
      const viewportH = scroller.clientHeight
      const contentH = scroller.scrollHeight
      const maxScroll = contentH - viewportH

      if (viewportH <= 0 || maxScroll <= 1) {
        if (scrollHideTimer.current) {
          window.clearTimeout(scrollHideTimer.current)
          scrollHideTimer.current = null
        }
        gsap.to(thumb, { opacity: 0, duration: 0.18, ease: "power2.out", overwrite: true })
        return
      }

      const ratio = viewportH / contentH
      const thumbH = Math.max(28, Math.min(viewportH * 0.6, viewportH * ratio))
      const travel = Math.max(0, viewportH - thumbH - SCROLLBAR_PAD * 2)
      const progress = maxScroll <= 0 ? 0 : scroller.scrollTop / maxScroll
      const y = SCROLLBAR_PAD + progress * travel

      thumb.style.height = `${thumbH}px`
      gsap.set(thumb, { y })

      if (active) {
        gsap.to(thumb, { opacity: 0.4, duration: 0.12, ease: "power2.out", overwrite: true })
        if (scrollHideTimer.current) window.clearTimeout(scrollHideTimer.current)
        scrollHideTimer.current = window.setTimeout(() => {
          gsap.to(thumb, { opacity: 0, duration: 0.24, ease: "power2.out", overwrite: true })
          scrollHideTimer.current = null
        }, 320)
      }
    }

    const requestUpdate = (active: boolean) => {
      if (active) scrollPendingActive.current = true
      if (scrollUiRaf.current) return
      scrollUiRaf.current = requestAnimationFrame(() => {
        scrollUiRaf.current = null
        const shouldShow = scrollPendingActive.current
        scrollPendingActive.current = false
        updateThumb(shouldShow)
      })
    }

    const onScroll = () => requestUpdate(true)
    const onResize = () => requestUpdate(false)

    scroller.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onResize)

    const ro = new ResizeObserver(() => requestUpdate(false))
    ro.observe(scroller)
    if (contentRef.current) ro.observe(contentRef.current)

    const bootRaf = requestAnimationFrame(() => requestUpdate(false))
    const bootTimer = window.setTimeout(() => requestUpdate(false), 80)

    return () => {
      scroller.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onResize)
      ro.disconnect()
      cancelAnimationFrame(bootRaf)
      window.clearTimeout(bootTimer)
      if (scrollUiRaf.current) {
        cancelAnimationFrame(scrollUiRaf.current)
        scrollUiRaf.current = null
      }
      if (scrollHideTimer.current) {
        window.clearTimeout(scrollHideTimer.current)
        scrollHideTimer.current = null
      }
      scrollPendingActive.current = false
    }
  }, [open, loading, data, panelWidthVw])

  function handleClose() {
    if (closing.current) return
    closing.current = true

    // 즉시 grid blur 제거 + pan 복귀
    onBeginClose()

    // X 버튼 즉시 숨김
    if (xBtnRef.current) {
      gsap.to(xBtnRef.current, { scale: 0, duration: 0.3, ease: EASE, overwrite: true })
    }
    document.documentElement.style.cursor = ""

    const tl = gsap.timeline({
      onComplete: () => {
        closing.current = false
        onClose()
      },
    })

    // gradient fade-out
    if (gradientRef.current) {
      tl.to(gradientRef.current, { opacity: 0, duration: 0.3, ease: "power4.out" }, 0)
    }

    // blocks stagger out
    const scroller = scrollerRef.current
    if (scroller) {
      const blocks = scroller.querySelectorAll<HTMLElement>("[data-detail-block]")
      const vh = window.innerHeight
      let idx = 0
      blocks.forEach((block) => {
        const rect = block.getBoundingClientRect()
        if (rect.top > vh) return
        tl.to(block, { opacity: 0, y: "+=40", duration: 0.5, ease: "power4.out" }, idx * 0.02)
        idx++
      })
    }
  }

  if (!open) return null

  return (
    <div
      ref={hostRef}
      className="absolute inset-0"
      style={{ pointerEvents: "auto", zIndex: 9999 }}
    >
      <style>{`
        [data-detail-content="1"] {
          cursor: grab;
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
        [data-detail-content="1"]::-webkit-scrollbar {
          width: 0 !important;
          height: 0 !important;
          display: none;
        }
        .pf-detail-grabbing [data-detail-content="1"],
        .pf-detail-grabbing { cursor: grabbing; }
      `}</style>

      {/* gradient 배경 (시각 전용) */}
      <div
        ref={gradientRef}
        style={{
          position: "absolute",
          inset: 0,
          background: "linear-gradient(90deg, rgba(0,0,0,0), #000)",
          pointerEvents: "none",
          zIndex: 1,
          opacity: 0,
        }}
      />

      {/* backdrop: 밖 클릭 → 닫힘 */}
      <div
        onClick={handleClose}
        style={{
          position: "absolute",
          inset: 0,
          cursor: "none",
          zIndex: 2,
        }}
      />

      {/* content scroller — 오른쪽 50vw */}
      <div
        ref={scrollerRef}
        data-detail-content="1"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          top: 0,
          right: 0,
          bottom: 0,
          width: `${panelWidthVw}vw`,
          zIndex: 3,
          overflowY: "auto",
          padding: "60px 42px 60px 0",
          boxSizing: "border-box",
          color: "#fff",
        }}
      >
        <div ref={contentRef} style={{ display: "flex", flexDirection: "column", gap: 36 }}>
          {!loading && (
            <div data-detail-block style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <b style={{ fontSize: 24, letterSpacing: "-0.01em", lineHeight: "145%" }}>
                {data?.title || ""}
              </b>
              <div style={{ fontSize: 15, letterSpacing: "-0.01em", lineHeight: "145%", color: "rgba(255,255,255,0.75)" }}>
                {data?.year || ""}
              </div>
            </div>
          )}

          {!loading &&
            data?.detailSections?.map((s, idx) => (
              <div key={idx} data-detail-block style={{ display: "flex", flexDirection: "column", gap: 24 }}>
                {s.videoUrl ? (
                  <video
                    src={toDirectVideoUrl(s.videoUrl)}
                    autoPlay
                    loop
                    muted
                    playsInline
                    preload="metadata"
                    draggable={false}
                    style={{
                      pointerEvents: "none",
                      width: "100%",
                      height: "auto",
                      display: "block",
                      objectFit: "cover",
                      userSelect: "none",
                    }}
                  />
                ) : s.imageUrl ? (
                  <img
                    src={s.imageUrl}
                    alt=""
                    draggable={false}
                    style={{
                      pointerEvents: "none",
                      width: "100%",
                      height: "auto",
                      display: "block",
                      objectFit: "cover",
                      userSelect: "none",
                    }}
                  />
                ) : null}
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {s.headline && (
                    <b style={{ fontSize: 18, letterSpacing: "-0.02em", lineHeight: "145%" }}>
                      {s.headline}
                    </b>
                  )}
                  {s.paragraph && (
                    <div
                      style={{
                        fontSize: 15,
                        letterSpacing: "-0.02em",
                        lineHeight: "145%",
                        color: "#b4b4b4",
                        whiteSpace: "pre-wrap",
                      }}
                    >
                      {s.paragraph}
                    </div>
                  )}
                </div>
              </div>
            ))}
        </div>
      </div>

      <div
        ref={scrollThumbRef}
        style={{
          position: "absolute",
          top: 0,
          right: 10,
          width: 3,
          height: 28,
          borderRadius: 999,
          background: "#fff",
          opacity: 0,
          pointerEvents: "none",
          zIndex: 5,
          transform: `translateY(${SCROLLBAR_PAD}px)`,
        }}
      />

      {/* floating X — 순수 시각 요소, 이벤트 통과 */}
      <div
        ref={xBtnRef}
        style={{
          position: "fixed",
          left: -BTN,
          top: -BTN,
          width: BTN,
          height: BTN,
          borderRadius: 40,
          background: "#fff",
          border: "none",
          boxShadow: "0px 4px 11.3px rgba(0,0,0,0.11)",
          zIndex: 99999,
          display: "grid",
          placeItems: "center",
          pointerEvents: "none",
          transform: "scale(0)",
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M6 6L18 18" stroke="#000" strokeWidth="2" strokeLinecap="round" />
          <path d="M18 6L6 18" stroke="#000" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </div>
    </div>
  )
}
