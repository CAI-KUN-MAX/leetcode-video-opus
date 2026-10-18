import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Visual } from "../types";

type TitleVisual = Extract<Visual, { type: "title" }>;
type Accent = TitleVisual["accent"];

const FONT_FAMILY =
  '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';

const ACCENT_COLORS: Record<Accent, string> = {
  primary: "#6C8CFF",
  success: "#3ED598",
  warning: "#F5B544",
  muted: "#A7B0C0",
};

/** 在 delay 秒后开始的入场进度（0 → 1） */
function entrance(
  frame: number,
  delaySeconds: number,
  fps: number,
  durationSeconds = 0.5,
): number {
  const start = Math.round(delaySeconds * fps);
  const end = start + Math.max(1, Math.round(durationSeconds * fps));
  return interpolate(frame, [start, end], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

export const TitleCard: React.FC<{ visual: TitleVisual }> = ({ visual }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = ACCENT_COLORS[visual.accent];

  const lineIn = entrance(frame, 0, fps, 0.4);
  const eyebrowIn = entrance(frame, 0.15, fps);
  const titleIn = entrance(frame, 0.35, fps, 0.6);
  const subtitleIn = entrance(frame, 0.65, fps);
  const tagsIn = entrance(frame, 0.85, fps);

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 160px",
        overflow: "hidden",
        fontFamily: FONT_FAMILY,
        color: "#F5F7FA",
        backgroundColor: "#0A0E1A",
      }}
    >
      {/* 右侧光晕 */}
      <div
        style={{
          position: "absolute",
          width: 960,
          height: 960,
          right: -260,
          top: -320,
          borderRadius: "50%",
          background: `radial-gradient(circle, ${accent}30 0%, transparent 65%)`,
        }}
      />

      <div
        style={{
          width: 88,
          height: 6,
          marginBottom: 40,
          backgroundColor: accent,
          opacity: lineIn,
          transform: `scaleX(${lineIn})`,
          transformOrigin: "left center",
        }}
      />

      {visual.eyebrow ? (
        <div
          style={{
            marginBottom: 24,
            fontSize: 30,
            fontWeight: 600,
            letterSpacing: 8,
            color: accent,
            opacity: eyebrowIn,
            transform: `translateY(${(1 - eyebrowIn) * 16}px)`,
          }}
        >
          {visual.eyebrow}
        </div>
      ) : null}

      <div
        style={{
          fontSize: 120,
          fontWeight: 800,
          lineHeight: 1.1,
          letterSpacing: 2,
          opacity: titleIn,
          transform: `translateY(${(1 - titleIn) * 32}px)`,
        }}
      >
        {visual.title}
      </div>

      {visual.subtitle ? (
        <div
          style={{
            marginTop: 28,
            fontSize: 46,
            fontWeight: 400,
            color: "#A7B0C0",
            opacity: subtitleIn,
            transform: `translateY(${(1 - subtitleIn) * 24}px)`,
          }}
        >
          {visual.subtitle}
        </div>
      ) : null}

      {visual.tags.length > 0 ? (
        <div
          style={{
            display: "flex",
            gap: 20,
            marginTop: 56,
            opacity: tagsIn,
            transform: `translateY(${(1 - tagsIn) * 20}px)`,
          }}
        >
          {visual.tags.map((tag) => (
            <div
              key={tag}
              style={{
                padding: "12px 30px",
                borderRadius: 999,
                border: `2px solid ${accent}66`,
                backgroundColor: `${accent}14`,
                color: accent,
                fontSize: 28,
                fontWeight: 500,
              }}
            >
              {tag}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
};
