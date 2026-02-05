"use client";

import Experience from "../components/Experience";
import UIOverlay from "../components/UIOverlay";

export default function Page() {
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
      {/* ✅ Blur는 main이 아니라 “내부 래퍼”에만 적용 */}
      <div
        style={{
          position: "absolute",
          inset: 0,

          // blur 강도는 Experience가 세팅하는 CSS 변수 --pf-blur
          filter: "blur(var(--pf-blur, 0px))",
          transition: "filter 660ms ease, transform 660ms ease",
          willChange: "filter, transform",

          // ✅ 핵심: blur 시 edge halo 방지용으로 살짝 확대해서
          // 블러 픽셀이 viewport 밖으로 나가도록 만든 다음 overflow:hidden으로 잘라냄
          transform:
            "translateZ(0) scale(var(--pf-blur-scale, 1))",
          transformOrigin: "50% 50%",
        }}
      >
        <Experience />
        <UIOverlay />
      </div>
    </main>
  );
}
