import { interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { Visual } from "../types";

type BulletsVisual = Extract<Visual, { type: "bullets" }>;
type BulletItem = BulletsVisual["items"][number];
type Tone = NonNullable<BulletItem["tone"]>;

const FONT_FAMILY =
  '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';

const TONE_COLORS: Record<Tone, string> = {
  primary: "#6C8CFF",
  success: "#3ED598",
  warning: "#F5B544",
  muted: "#A7B0C0",
};

export const Bullets: React.FC<{ visual: BulletsVisual }> = ({ visual }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();

  const headingIn = interpolate(frame, [0, Math.round(0.4 * fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        padding: "100px 180px",
        fontFamily: FONT_FAMILY,
        color: "#F5F7FA",
        backgroundColor: "#0A0E1A",
      }}
    >
      {visual.heading ? (
        <div
          style={{
            marginBottom: 56,
            fontSize: 40,
            fontWeight: 700,
            letterSpacing: 4,
            color: "#6C8CFF",
            opacity: headingIn,
            transform: `translateY(${(1 - headingIn) * 20}px)`,
          }}
        >
          {visual.heading}
        </div>
      ) : null}

      <div style={{ display: "flex", flexDirection: "column", gap: 34 }}>
        {visual.items.map((item, index) => {
          // item.at 是场景内的相对进度，乘场景帧数得到触发帧
          const start = Math.max(0, Math.round(item.at * durationInFrames));
          const end = start + Math.max(1, Math.round(0.4 * fps));
          const appear = interpolate(frame, [start, end], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });

          const markerColor = item.tone
            ? TONE_COLORS[item.tone]
            : "#6C8CFF";
          const textColor = item.tone
            ? TONE_COLORS[item.tone]
            : item.emphasis
              ? "#FFFFFF"
              : "#D5DCE8";

          return (
            <div
              key={`${index}-${item.text}`}
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 26,
                opacity: appear,
                transform: `translateX(${(1 - appear) * -28}px)`,
              }}
            >
              <div
                style={{
                  flexShrink: 0,
                  width: 14,
                  height: 14,
                  marginTop: item.emphasis ? 28 : 22,
                  borderRadius: 7,
                  backgroundColor: markerColor,
                }}
              />
              <div
                style={{
                  fontSize: item.emphasis ? 58 : 46,
                  fontWeight: item.emphasis ? 700 : 500,
                  lineHeight: 1.4,
                  color: textColor,
                }}
              >
                {item.text}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
