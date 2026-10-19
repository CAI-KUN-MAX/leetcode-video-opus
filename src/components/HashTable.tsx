import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Visual } from "../types";

type HashTableVisual = Extract<Visual, { type: "hash-table" }>;
type HashEntry = HashTableVisual["entries"][number];
type Tone = NonNullable<HashEntry["tone"]>;

const SANS_FAMILY =
  '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", "Segoe UI", sans-serif';

const MONO_FAMILY =
  '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace';

const TONE_COLORS: Record<Tone, string> = {
  primary: "#6C8CFF",
  success: "#3ED598",
  warning: "#F5B544",
  muted: "#A7B0C0",
};

/** 单行入场时长 */
const ENTRANCE_SECONDS = 0.45;

/** 十六进制颜色 → 带透明度的 rgba，用于背景 / 描边 / 光晕 */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export type HashTableProps = {
  visual: HashTableVisual;
};

export const HashTable: React.FC<HashTableProps> = ({ visual }) => {
  const frame = useCurrentFrame();
  // 在 <Sequence> 内，durationInFrames 就是当前场景的帧数
  const { fps, durationInFrames } = useVideoConfig();

  const entranceFrames = Math.max(1, Math.round(ENTRANCE_SECONDS * fps));
  const captionStart = Math.round(0.25 * fps);

  const headerIn = interpolate(frame, [0, Math.round(0.4 * fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const captionIn = interpolate(
    frame,
    [captionStart, captionStart + Math.max(1, Math.round(0.4 * fps))],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const highlightedKeys = new Set(visual.highlightKeys);

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        // 给底部字幕留出空间，避免长表格与字幕重叠
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
          alignItems: "center",
          width: 1100,
          maxWidth: "86%",
        }}
      >
        <div
          style={{
            marginBottom: 32,
            fontSize: 38,
            fontWeight: 700,
            letterSpacing: 4,
            color: "#6C8CFF",
            opacity: headerIn,
            transform: `translateY(${(1 - headerIn) * 18}px)`,
          }}
        >
          {visual.title}
        </div>

        <div
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "22px 24px",
            borderRadius: 24,
            backgroundColor: "#0D1117",
            border: "1px solid rgba(255, 255, 255, 0.08)",
            boxShadow:
              "0 42px 120px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(108, 140, 255, 0.05)",
          }}
        >
          {/* 列头 */}
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "0 30px 14px",
              borderBottom: "1px solid rgba(255, 255, 255, 0.07)",
              fontFamily: MONO_FAMILY,
              fontSize: 18,
              letterSpacing: 3,
              color: "#5B6474",
            }}
          >
            <span>KEY</span>
            <span>VALUE</span>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              marginTop: 14,
            }}
          >
            {visual.entries.map((entry, index) => {
              // entry.at 是场景内的相对进度，乘场景帧数得到触发帧
              const start = Math.max(
                0,
                Math.round(entry.at * durationInFrames),
              );
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

              const highlighted = highlightedKeys.has(entry.key);
              // 命中行优先使用条目自身的语义色，否则默认绿色
              const accent = highlighted
                ? entry.tone !== "muted"
                  ? TONE_COLORS[entry.tone]
                  : TONE_COLORS.success
                : null;
              const dotColor = accent ?? TONE_COLORS[entry.tone];

              return (
                <div
                  key={`${index}-${entry.key}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 40,
                    minHeight: 74,
                    padding: "0 30px",
                    boxSizing: "border-box",
                    borderRadius: 16,
                    background: accent
                      ? `linear-gradient(90deg, ${withAlpha(
                          accent,
                          0.2,
                        )} 0%, ${withAlpha(accent, 0.05)} 100%)`
                      : "rgba(255, 255, 255, 0.025)",
                    border: `1px solid ${
                      accent
                        ? withAlpha(accent, 0.55)
                        : "rgba(255, 255, 255, 0.06)"
                    }`,
                    boxShadow: accent
                      ? `0 0 36px ${withAlpha(
                          accent,
                          0.22,
                        )}, inset 0 1px 0 rgba(255, 255, 255, 0.06)`
                      : "inset 0 1px 0 rgba(255, 255, 255, 0.025)",
                    opacity: appear,
                    transform: `translateY(${(1 - appear) * 26}px)`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 16,
                      minWidth: 0,
                    }}
                  >
                    <div
                      style={{
                        flexShrink: 0,
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: dotColor,
                        opacity: highlighted ? 1 : 0.55,
                        boxShadow: accent ? `0 0 12px ${accent}` : "none",
                      }}
                    />
                    <span
                      style={{
                        fontFamily: MONO_FAMILY,
                        fontSize: 32,
                        fontWeight: 600,
                        lineHeight: 1.2,
                        color: accent ?? "#D5DCE8",
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                      }}
                    >
                      {entry.key}
                    </span>
                  </div>

                  <span
                    style={{
                      flexShrink: 0,
                      fontFamily: MONO_FAMILY,
                      fontSize: 32,
                      fontWeight: 600,
                      lineHeight: 1.2,
                      color: accent ? "#FFFFFF" : "#F5F7FA",
                      textShadow: accent
                        ? `0 0 18px ${withAlpha(accent, 0.7)}`
                        : "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {entry.value || "—"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {visual.caption ? (
          <div
            style={{
              marginTop: 40,
              padding: "14px 32px",
              borderRadius: 999,
              border: "1px solid rgba(255, 255, 255, 0.08)",
              backgroundColor: "rgba(13, 17, 23, 0.72)",
              boxShadow: "0 18px 46px rgba(0, 0, 0, 0.32)",
              color: "#A7B0C0",
              fontSize: 28,
              fontWeight: 500,
              lineHeight: 1.4,
              letterSpacing: 0.5,
              textAlign: "center",
              opacity: captionIn,
              transform: `translateY(${(1 - captionIn) * 12}px)`,
            }}
          >
            {visual.caption}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
