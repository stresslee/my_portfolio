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
      <Experience />
      <UIOverlay />
    </main>
  );
}
