"use client"

import Experience from "../../components/Experience"
import UIOverlay from "../../components/UIOverlay"

export default function SlugClient({ slug }: { slug: string }) {
  return (
    <main
      style={{
        width: "100vw",
        height: "100vh",
        overflow: "hidden",
        position: "relative",
        background: "#0a0a0a",
      }}
    >
      <div
        style={{
          position: "absolute",
          inset: 0,
          filter: "blur(var(--pf-blur, 0px))",
          transition: "filter 660ms ease, transform 660ms ease",
          willChange: "filter, transform",
          transform: "translateZ(0) scale(var(--pf-blur-scale, 1))",
          transformOrigin: "50% 50%",
        }}
      >
        <Experience initialSlug={slug} />
        <UIOverlay />
      </div>
    </main>
  )
}
