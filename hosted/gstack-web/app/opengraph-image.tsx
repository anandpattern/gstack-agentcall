import { ImageResponse } from "next/og";

// OG image — generated at build time, served at /opengraph-image.
// Brand lockup: lime gstack / cream agentcall.dev over the JOINS YOUR MEETING
// tagline. Text-based (Satori) so it renders without bundling the AgentCall
// wordmark paths into the edge image.
export const runtime = "edge";
export const alt = "gstack / agentcall.dev — joins your meeting";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const LIME = "#c8ff3a";
const CREAM = "#f4eedd";
const INK_BG = "#07080a";

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 64,
          fontFamily: "Inter, system-ui, sans-serif",
          backgroundColor: INK_BG,
          backgroundImage:
            "radial-gradient(800px 500px at 80% -10%, rgba(200, 255, 58, 0.16), transparent 60%), " +
            "radial-gradient(600px 400px at 0% 110%, rgba(255, 107, 43, 0.08), transparent 60%)",
          color: "#ecedef",
        }}
      >
        {/* top: the two brand tiles, side by side */}
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: LIME, color: INK_BG,
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, fontWeight: 800,
          }}>G</div>
          <div style={{
            width: 44, height: 44, borderRadius: 10,
            background: CREAM, color: "#16140d",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 26, fontWeight: 700,
          }}>A</div>
        </div>

        {/* center: the lockup */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 34 }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <span style={{ fontSize: 90, fontWeight: 800, letterSpacing: -4, color: LIME }}>gstack</span>
            <span style={{ fontSize: 80, fontWeight: 300, color: "#5c6052", margin: "0 26px" }}>/</span>
            <span style={{ fontSize: 90, fontWeight: 800, letterSpacing: -4, color: CREAM }}>agentcall.dev</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 26 }}>
            <div style={{ width: 120, height: 2, background: "#5c6052" }} />
            <span style={{ fontSize: 24, letterSpacing: 13, color: "#9aa08c" }}>JOINS YOUR MEETING</span>
            <div style={{ width: 120, height: 2, background: "#5c6052" }} />
          </div>
        </div>

        {/* bottom: provenance */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 19,
            color: "#6a707a",
          }}
        >
          <div style={{ display: "flex" }}>
            built on&nbsp;<span style={{ color: "#ecedef" }}>garrytan/gstack</span>&nbsp;+&nbsp;<span style={{ color: "#ecedef" }}>agentcall.dev</span>
          </div>
          <div>open source · MIT</div>
        </div>
      </div>
    ),
    { ...size },
  );
}
