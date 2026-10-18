import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Visual } from "../types";

type ArrayVisual = Extract<Visual, { type: "array" }>;
type ArrayHighlight = ArrayVisual["highlights"][number];
type ArrayPointer = ArrayVisual["pointers"][number];
type ArrayMove = ArrayVisual["moves"][number];
type Tone = NonNullable<ArrayHighlight["tone"]>;

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

// ---------- 布局常量 ----------

/** 数组行最大宽度：与 CodeBlock 的 1520 容器保持同一视觉尺度 */
const MAX_ROW_WIDTH = 1480;
const MAX_CELL = 128;
const MIN_CELL = 48;
const CELL_GAP = 18;
const CELL_RADIUS = 18;

/** 高亮淡入时长 */
const HIGHLIGHT_FADE_SECONDS = 0.35;
/** 方块入场时长与逐个延迟 */
const ENTRANCE_SECONDS = 0.4;
const STAGGER_SECONDS = 0.05;
/** 指针入场时长 */
const POINTER_ENTRANCE_SECONDS = 0.35;

/** 指针（标签 + 箭头）所占高度；多个指针重叠时按 lane 向上堆叠 */
const POINTER_LANE_HEIGHT = 72;
/** 箭头尖端与方块顶部的间距 */
const POINTER_GAP_ABOVE_CELLS = 12;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 十六进制颜色 → 带透明度的 rgba，用于背景 / 描边 / 光晕 */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * 指针在某一帧的「连续索引位置」（可以是小数，用于 X 轴插值）。
 * 按 moves 的时间顺序逐步推进；当前 move 结束后再处理下一条。
 */
function getPointerPosition(
  pointer: ArrayPointer,
  moves: readonly ArrayMove[],
  frame: number,
  durationInFrames: number,
  fps: number,
  maxIndex: number,
): number {
  let position = clamp(pointer.index, 0, maxIndex);

  for (const move of moves) {
    const start = Math.max(0, Math.round(move.at * durationInFrames));
    if (frame < start) {
      break;
    }

    const end = start + Math.max(1, Math.round(move.duration * fps));
    const progress = interpolate(frame, [start, end], [0, 1], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut(Easing.cubic),
    });

    const target = clamp(move.to, 0, maxIndex);
    position += (target - position) * progress;

    // 动画尚未结束，后续 moves 不再叠加
    if (progress < 1) {
      break;
    }
  }

  return position;
}

// ---------- 组件 ----------

export type ArrayVizProps = {
  visual: ArrayVisual;
};

export const ArrayViz: React.FC<ArrayVizProps> = ({ visual }) => {
  const frame = useCurrentFrame();
  // 在 <Sequence> 内，durationInFrames 就是当前场景的帧数
  const { fps, durationInFrames } = useVideoConfig();

  const count = visual.values.length;
  const maxIndex = count - 1;

  // 根据元素个数自适应方块尺寸，保证长数组也不会溢出画面
  const cell = Math.max(
    MIN_CELL,
    Math.min(MAX_CELL, (MAX_ROW_WIDTH - CELL_GAP * (count - 1)) / count),
  );
  const stride = cell + CELL_GAP;
  const rowWidth = count * cell + CELL_GAP * (count - 1);

  const longestValue = Math.max(
    1,
    ...visual.values.map((value) => String(value).length),
  );
  const valueFontSize = Math.max(
    18,
    Math.min(56, (cell - 26) / (longestValue * 0.62)),
  );
  const indexFontSize = Math.max(16, Math.min(22, cell * 0.19));

  const entranceFrames = Math.max(1, Math.round(ENTRANCE_SECONDS * fps));
  const staggerFrames = Math.round(STAGGER_SECONDS * fps);
  const highlightFadeFrames = Math.max(
    1,
    Math.round(HIGHLIGHT_FADE_SECONDS * fps),
  );
  const pointerEntrance = interpolate(
    frame,
    [0, Math.max(1, Math.round(POINTER_ENTRANCE_SECONDS * fps))],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );
  const captionIn = interpolate(
    frame,
    [Math.round(0.25 * fps), Math.round(0.6 * fps)],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  // ---------- 高亮区间 ----------

  const activeHighlights = visual.highlights
    .map((highlight, highlightIndex) => {
      const start = Math.round(highlight.at * durationInFrames);
      const opacity = interpolate(
        frame,
        [start, start + highlightFadeFrames],
        [0, 1],
        { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
      );

      const from = clamp(highlight.from, 0, maxIndex);
      const to = clamp(highlight.to, 0, maxIndex);

      return {
        key: `${highlightIndex}-${highlight.from}-${highlight.to}-${highlight.tone}`,
        from: Math.min(from, to),
        to: Math.max(from, to),
        color: TONE_COLORS[highlight.tone],
        opacity,
      };
    })
    .filter((highlight) => highlight.opacity > 0.001);

  // 每个下标当前生效的颜色：多个区间重叠时取透明度最高的一个
  const highlightByIndex = new Map<
    number,
    { color: string; opacity: number }
  >();
  for (const highlight of activeHighlights) {
    for (let index = highlight.from; index <= highlight.to; index++) {
      const existing = highlightByIndex.get(index);
      if (!existing || highlight.opacity > existing.opacity) {
        highlightByIndex.set(index, {
          color: highlight.color,
          opacity: highlight.opacity,
        });
      }
    }
  }

  // ---------- 指针时间轴 ----------

  const movesByPointer = new Map<string, ArrayMove[]>();
  for (const move of visual.moves) {
    const list = movesByPointer.get(move.pointer);
    if (list) {
      list.push(move);
    } else {
      movesByPointer.set(move.pointer, [move]);
    }
  }
  for (const list of movesByPointer.values()) {
    list.sort((a, b) => a.at - b.at);
  }

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
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
        }}
      >
        <div
          style={{
            position: "relative",
            display: "flex",
            gap: CELL_GAP,
            width: rowWidth,
          }}
        >
          {/* 区间光晕：垫在方块下方，给出整段高亮的「区域感」 */}
          {activeHighlights.map((highlight) => {
            const left = highlight.from * stride - 8;
            const width = (highlight.to - highlight.from) * stride + cell + 16;

            return (
              <div
                key={highlight.key}
                style={{
                  position: "absolute",
                  left,
                  top: -8,
                  width,
                  height: cell + 16,
                  borderRadius: CELL_RADIUS + 8,
                  backgroundColor: withAlpha(highlight.color, 0.1),
                  border: `1px solid ${withAlpha(highlight.color, 0.2)}`,
                  boxShadow: `0 0 46px ${withAlpha(
                    highlight.color,
                    0.16,
                  )}`,
                  opacity: highlight.opacity,
                }}
              />
            );
          })}

          {/* 数组方块 */}
          {visual.values.map((value, index) => {
            const delay = index * staggerFrames;
            const appear = interpolate(
              frame,
              [delay, delay + entranceFrames],
              [0, 1],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            );

            const highlight = highlightByIndex.get(index);
            const tone = highlight?.color;
            const strength = highlight?.opacity ?? 0;

            return (
              <div
                key={`${index}-${String(value)}`}
                style={{
                  position: "relative",
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  width: cell,
                  flexShrink: 0,
                  opacity: appear,
                  transform: `translateY(${(1 - appear) * 18}px) scale(${
                    0.96 + appear * 0.04
                  })`,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: cell,
                    height: cell,
                    boxSizing: "border-box",
                    borderRadius: CELL_RADIUS,
                    background: tone
                      ? `linear-gradient(180deg, ${withAlpha(
                          tone,
                          strength * 0.28,
                        )} 0%, ${withAlpha(
                          tone,
                          strength * 0.16,
                        )} 100%), linear-gradient(180deg, #1A2236 0%, #121827 100%)`
                      : "linear-gradient(180deg, #1A2236 0%, #121827 100%)",
                    border: `1px solid ${
                      tone
                        ? withAlpha(tone, strength * 0.8)
                        : "rgba(255, 255, 255, 0.08)"
                    }`,
                    boxShadow: tone
                      ? `0 0 ${Math.round(
                          32 * strength,
                        )}px ${withAlpha(
                          tone,
                          strength * 0.24,
                        )}, inset 0 1px 0 rgba(255, 255, 255, 0.06)`
                      : "0 14px 34px rgba(0, 0, 0, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
                  }}
                >
                  <span
                    style={{
                      fontFamily: MONO_FAMILY,
                      fontSize: valueFontSize,
                      fontWeight: 600,
                      lineHeight: 1,
                      color: "#F5F7FA",
                      fontVariantNumeric: "tabular-nums",
                      textShadow: tone
                        ? `0 0 ${Math.round(18 * strength)}px ${withAlpha(
                            tone,
                            strength * 0.75,
                          )}`
                        : "none",
                    }}
                  >
                    {String(value)}
                  </span>
                </div>

                {visual.showIndices ? (
                  <div
                    style={{
                      marginTop: 12,
                      fontFamily: MONO_FAMILY,
                      fontSize: indexFontSize,
                      lineHeight: 1,
                      color: tone ?? "#5B6474",
                      opacity: tone ? 0.6 + strength * 0.4 : 1,
                    }}
                  >
                    {index}
                  </div>
                ) : null}
              </div>
            );
          })}

          {/* 指针：按 lane 向上堆叠，同一位置也不会重叠 */}
          {visual.pointers.map((pointer, lane) => {
            const position = getPointerPosition(
              pointer,
              movesByPointer.get(pointer.id) ?? [],
              frame,
              durationInFrames,
              fps,
              maxIndex,
            );
            const color = TONE_COLORS[pointer.tone];

            return (
              <div
                key={pointer.id}
                style={{
                  position: "absolute",
                  left: position * stride + cell / 2,
                  top: -(POINTER_GAP_ABOVE_CELLS + lane * POINTER_LANE_HEIGHT),
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  transform: `translate(-50%, calc(-100% + ${
                    (1 - pointerEntrance) * 10
                  }px))`,
                  opacity: pointerEntrance,
                  zIndex: 3,
                  pointerEvents: "none",
                }}
              >
                <div
                  style={{
                    padding: "6px 16px",
                    borderRadius: 999,
                    backgroundColor: color,
                    color: "#0A0E1A",
                    fontFamily: MONO_FAMILY,
                    fontSize: 24,
                    fontWeight: 700,
                    lineHeight: 1.1,
                    boxShadow: `0 0 24px ${withAlpha(
                      color,
                      0.55,
                    )}, 0 4px 14px rgba(0, 0, 0, 0.35)`,
                  }}
                >
                  {pointer.label ?? pointer.id}
                </div>
                <div
                  style={{
                    marginTop: 6,
                    width: 0,
                    height: 0,
                    borderLeft: "10px solid transparent",
                    borderRight: "10px solid transparent",
                    borderTop: `12px solid ${color}`,
                    filter: `drop-shadow(0 0 8px ${withAlpha(color, 0.6)})`,
                  }}
                />
              </div>
            );
          })}
        </div>

        {visual.caption ? (
          <div
            style={{
              marginTop: 58,
              maxWidth: 1420,
              padding: "14px 30px",
              borderRadius: 14,
              border: "1px solid rgba(255, 255, 255, 0.07)",
              backgroundColor: "rgba(13, 17, 23, 0.72)",
              boxShadow: "0 18px 46px rgba(0, 0, 0, 0.32)",
              color: "#A7B0C0",
              fontSize: 30,
              fontWeight: 500,
              lineHeight: 1.5,
              letterSpacing: 0.5,
              textAlign: "center",
              opacity: captionIn,
              transform: `translateY(${(1 - captionIn) * 14}px)`,
            }}
          >
            {visual.caption}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
