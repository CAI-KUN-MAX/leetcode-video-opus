import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Visual } from "../types";

type ComplexityVisual = Extract<Visual, { type: "complexity" }>;

const SANS_FAMILY =
  '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';

const MONO_FAMILY =
  '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace';

const ACCENT = "#6C8CFF";

/** 单行入场时长与逐行延迟 */
const ENTRANCE_SECONDS = 0.45;
const STAGGER_SECONDS = 0.08;

/** 十六进制颜色 → 带透明度的 rgba，用于背景 / 描边 / 光晕 */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type ComplexityProps = {
  visual: ComplexityVisual;
};

export const Complexity: React.FC<ComplexityProps> = ({ visual }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const entranceFrames = Math.max(1, Math.round(ENTRANCE_SECONDS * fps));
  const staggerFrames = Math.round(STAGGER_SECONDS * fps);

  const headingIn = interpolate(frame, [0, Math.round(0.4 * fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const cardIn = interpolate(
    frame,
    [Math.round(0.1 * fps), Math.round(0.5 * fps)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        // 给底部字幕留出空间
        paddingBottom: 140,
        boxSizing: "border-box",
        background:
          "radial-gradient(circle at 50% 38%, #151C2E 0%, #0A0E1A 62%)",
        fontFamily: SANS_FAMILY,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: 1200,
          maxWidth: "88%",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 36,
            opacity: headingIn,
            transform: `translateY(${(1 - headingIn) * 18}px)`,
          }}
        >
          <div
            style={{
              width: 8,
              height: 44,
              borderRadius: 4,
              backgroundColor: ACCENT,
              boxShadow: `0 0 24px ${withAlpha(ACCENT, 0.55)}`,
            }}
          />
          <div
            style={{
              fontSize: 46,
              fontWeight: 700,
              letterSpacing: 4,
              color: "#F5F7FA",
            }}
          >
            {visual.heading}
          </div>
        </div>

        <div
          style={{
            borderRadius: 24,
            overflow: "hidden",
            backgroundColor: "#0D1117",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow:
              "0 42px 120px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(108, 140, 255, 0.05)",
            opacity: cardIn,
            transform: `translateY(${(1 - cardIn) * 20}px)`,
          }}
        >
          {visual.rows.map((row, index) => {
            const start = index * staggerFrames;
            const appear = interpolate(
              frame,
              [start, start + entranceFrames],
              [0, 1],
              {
                easing: Easing.out(Easing.cubic),
                extrapolateLeft: "clamp",
                extrapolateRight: "clamp",
              },
            );

            return (
              <div
                key={`${index}-${row.label}`}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 48,
                  padding: "30px 44px",
                  borderTop:
                    index === 0
                      ? "none"
                      : "1px solid rgba(255, 255, 255, 0.06)",
                  background: row.emphasis
                    ? `linear-gradient(90deg, ${withAlpha(
                        ACCENT,
                        0.16,
                      )} 0%, ${withAlpha(ACCENT, 0.02)} 100%)`
                    : "transparent",
                  opacity: appear,
                  transform: `translateX(${(1 - appear) * 18}px)`,
                }}
              >
                {/* 强调行的左侧主题色标记 */}
                {row.emphasis ? (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      top: 14,
                      bottom: 14,
                      width: 4,
                      borderRadius: 2,
                      backgroundColor: ACCENT,
                      boxShadow: `0 0 14px ${withAlpha(ACCENT, 0.85)}`,
                    }}
                  />
                ) : null}

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <span
                    style={{
                      fontSize: 34,
                      fontWeight: row.emphasis ? 700 : 500,
                      lineHeight: 1.3,
                      letterSpacing: 1,
                      color: row.emphasis ? ACCENT : "#A7B0C0",
                    }}
                  >
                    {row.label}
                  </span>
                  {row.note ? (
                    <span
                      style={{
                        fontSize: 22,
                        lineHeight: 1.4,
                        color: row.emphasis
                          ? withAlpha(ACCENT, 0.7)
                          : "#6B7686",
                      }}
                    >
                      {row.note}
                    </span>
                  ) : null}
                </div>

                <span
                  style={{
                    flexShrink: 0,
                    fontFamily: MONO_FAMILY,
                    fontSize: row.emphasis ? 48 : 42,
                    fontWeight: 700,
                    lineHeight: 1.1,
                    color: row.emphasis ? ACCENT : "#F5F7FA",
                    textShadow: row.emphasis
                      ? `0 0 22px ${withAlpha(ACCENT, 0.55)}`
                      : "none",
                    whiteSpace: "nowrap",
                  }}
                >
                  {row.value}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
