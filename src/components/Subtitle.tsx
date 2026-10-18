import { useMemo } from "react";
import { useCurrentFrame, useVideoConfig } from "remotion";
import type { WordTiming } from "../lib/manifest";
import { buildCaptionPages } from "../lib/captions";

export type SubtitleProps = {
  /** manifest 中的字级时间戳 */
  words: readonly WordTiming[];
  /** 剧本原始旁白；用于还原 TTS 丢失的标点并校正被改写的文字 */
  narration: string;
  /** 场景总时长（含尾部留白），单位毫秒 */
  sceneDurationMs: number;
  /** 尾部留白时长，单位毫秒 */
  holdMs: number;
  /** 字号，默认 38 */
  fontSize?: number;
  /** 每屏最多显示多少个汉字宽度，默认 18 */
  maxCharsPerPage?: number;
};

const FONT_FAMILY = '"PingFang SC", "Microsoft YaHei", sans-serif';

/** 普通状态的文字颜色（透明度由 0.9 平滑过渡到 1） */
const BASE_COLOR = "rgba(255, 255, 255, 0.9)";
const TEXT_SHADOW = "0 2px 12px rgba(0, 0, 0, 0.85)";

/** 高亮进出的渐变时长 */
const RAMP_MS = 70;
/** 字与字之间的小停顿内，保持上一个字的高亮，避免闪烁 */
const GAP_HOLD_MS = 150;
/** 页与页之间的淡入淡出时长 */
const PAGE_FADE_MS = 160;

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
 * - 页内最后一个字参考音频结束时间
 */
function getTokenEndMs(
  tokens: readonly { fromMs: number; toMs: number }[],
  index: number,
  audioEndMs: number,
): number {
  const token = tokens[index];
  const next = tokens[index + 1];
  const boundary = next ? next.fromMs : Math.max(audioEndMs, token.toMs);
  return Math.min(boundary, token.toMs + GAP_HOLD_MS);
}

/**
 * 底部字幕：按语义分页，只显示当前这一屏。
 * - 光标所在的字做「微妙加重」（透明度、字重、缩放连续插值）；
 * - 页与页之间用透明度交叉淡化，不做硬切。
 */
export const Subtitle: React.FC<SubtitleProps> = ({
  words,
  narration,
  sceneDurationMs,
  holdMs,
  fontSize = 38,
  maxCharsPerPage = 18,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const currentMs = (frame / fps) * 1000;
  // 语音实际结束的位置；之后的 hold 期间不再有字被高亮
  const audioEndMs = Math.max(0, sceneDurationMs - holdMs);

  // 分页与标点对齐只在数据变化时计算，不随每一帧重跑
  const pages = useMemo(
    () =>
      buildCaptionPages(words, narration, {
        maxUnitsPerPage: maxCharsPerPage,
      }),
    [words, narration, maxCharsPerPage],
  );

  if (pages.length === 0) {
    return null;
  }

  const layers = pages
    .map((page, pageIndex) => {
      const isLastPage = pageIndex === pages.length - 1;
      const pageEndMs = page.startMs + page.durationMs;
      // 最后一页在语音结束后继续停留，淡出落在 hold 区间里
      const fadeEndMs = isLastPage
        ? Math.max(pageEndMs, audioEndMs) + PAGE_FADE_MS
        : pageEndMs;

      const opacity = Math.min(
        clamp01((currentMs - page.startMs) / PAGE_FADE_MS),
        clamp01((fadeEndMs - currentMs) / PAGE_FADE_MS),
      );

      return { page, pageIndex, opacity };
    })
    .filter((layer) => layer.opacity > 0.001);

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 72,
        // 固定两行高度，翻页时整体不会上下跳动
        height: fontSize * 1.6 * 2,
        pointerEvents: "none",
      }}
    >
      {layers.map(({ page, pageIndex, opacity }) => (
        <div
          key={`${pageIndex}-${page.startMs}`}
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            justifyContent: "center",
            alignItems: "flex-end",
            padding: "0 120px",
            opacity,
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
            {page.tokens.map((token, tokenIndex) => {
              const endMs = getTokenEndMs(
                page.tokens,
                tokenIndex,
                audioEndMs,
              );
              const emphasis = emphasisAt(currentMs, token.fromMs, endMs);

              return (
                <span
                  key={`${tokenIndex}-${token.fromMs}`}
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
                  {token.text}
                </span>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};
