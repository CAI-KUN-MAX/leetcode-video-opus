import { useCurrentFrame, useVideoConfig } from "remotion";
import type { WordTiming } from "../lib/manifest";

export type SubtitleProps = {
  /** manifest 中的字级时间戳 */
  words: readonly WordTiming[];
  /** 场景总时长（含尾部留白），单位毫秒 */
  sceneDurationMs: number;
  /** 尾部留白时长，单位毫秒 */
  holdMs: number;
  /** 字号，默认 38 */
  fontSize?: number;
};

const FONT_FAMILY = '"PingFang SC", "Microsoft YaHei", sans-serif';

/** 普通状态的文字颜色（透明度由 0.9 平滑过渡到 1） */
const BASE_COLOR = "rgba(255, 255, 255, 0.9)";
const TEXT_SHADOW = "0 2px 12px rgba(0, 0, 0, 0.85)";

/** 高亮进出的渐变时长 */
const RAMP_MS = 70;
/** 字与字之间的小停顿内，保持上一个字的高亮，避免闪烁 */
const GAP_HOLD_MS = 150;

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/**
 * 某个 token 在 currentMs 时刻的「正在朗读」强度（0 → 1）。
 * 两端各用 RAMP_MS 做平滑过渡，避免逐帧硬切换。
 */
function emphasisAt(currentMs: number, startMs: number, endMs: number): number {
  const fadeIn = clamp01((currentMs - (startMs - RAMP_MS)) / (RAMP_MS * 2));
  const fadeOut = clamp01((endMs + RAMP_MS - currentMs) / (RAMP_MS * 2));
  return Math.min(fadeIn, fadeOut);
}

/**
 * token 的有效结束时间：
 * - 下一个字开始前（避免长停顿期间一直高亮）
 * - 但最多延长 GAP_HOLD_MS，覆盖正常字间空隙
 * - 最后一个字参考音频结束时间
 */
function getTokenEndMs(
  words: readonly WordTiming[],
  index: number,
  audioEndMs: number,
): number {
  const word = words[index];
  const next = words[index + 1];
  const boundary = next ? next.beginMs : Math.max(audioEndMs, word.endMs);
  return Math.min(boundary, word.endMs + GAP_HOLD_MS);
}

/**
 * 底部字幕：整句常驻显示，只有当前朗读到的字做「微妙加重」。
 * 透明度、字重、缩放均按 emphasis 连续插值，不依赖 CSS transition。
 */
export const Subtitle: React.FC<SubtitleProps> = ({
  words,
  sceneDurationMs,
  holdMs,
  fontSize = 38,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentMs = (frame / fps) * 1000;
  // 语音实际结束的位置；之后的 hold 期间不再有字被高亮
  const audioEndMs = Math.max(0, sceneDurationMs - holdMs);

  if (words.length === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 72,
        display: "flex",
        justifyContent: "center",
        padding: "0 120px",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: 1560,
          textAlign: "center",
          fontFamily: FONT_FAMILY,
          fontSize,
          lineHeight: 1.6,
          letterSpacing: 1,
          color: BASE_COLOR,
          textShadow: TEXT_SHADOW,
        }}
      >
        {words.map((word, index) => {
          const endMs = getTokenEndMs(words, index, audioEndMs);
          const emphasis = emphasisAt(currentMs, word.beginMs, endMs);

          return (
            <span
              key={`${index}-${word.beginMs}`}
              style={{
                display: "inline-block",
                color: `rgba(255, 255, 255, ${0.9 + 0.1 * emphasis})`,
                fontWeight: 400 + Math.round(300 * emphasis),
                transform: `scale(${1 + 0.06 * emphasis})`,
                transformOrigin: "center bottom",
                textShadow:
                  emphasis > 0.01
                    ? `0 0 ${Math.round(12 * emphasis)}px rgba(108, 140, 255, ${0.55 * emphasis}), ${TEXT_SHADOW}`
                    : TEXT_SHADOW,
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};
