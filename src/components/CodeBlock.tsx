import { useEffect, useRef, useState } from "react";
import {
  AbsoluteFill,
  continueRender,
  delayRender,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  createHighlighterCore,
  type HighlighterCore,
  type ThemedToken,
} from "shiki/core";
import { createOnigurumaEngine } from "shiki/engine/oniguruma";
import { bundledLanguages } from "shiki/langs";
import { bundledThemes } from "shiki/themes";
import getWasmInstance from "shiki/wasm";
import type { CodeLanguage, Visual } from "../types";

type CodeVisual = Extract<Visual, { type: "code" }>;
type Tone = NonNullable<CodeVisual["focus"][number]["tone"]>;

const MONO_FAMILY =
  '"JetBrains Mono", "SFMono-Regular", Menlo, Consolas, "Liberation Mono", monospace';

const TONE_COLORS: Record<Tone, string> = {
  primary: "#6C8CFF",
  success: "#3ED598",
  warning: "#F5B544",
  muted: "#A7B0C0",
};

const FONT_SIZE = 32;
const LINE_HEIGHT = 1.5;
const LINE_PX = FONT_SIZE * LINE_HEIGHT;

const SHIKI_THEME = "github-dark-default";
const FALLBACK_COLOR = "#E6EDF3";

/** 高亮淡入 / 淡出时长 */
const FOCUS_FADE_IN_SECONDS = 0.35;
const FOCUS_FADE_OUT_SECONDS = 0.25;

// ---------- Shiki 高亮（异步，带进程内缓存） ----------

/** 支持的语言：与 src/types.ts 的 CodeLanguage 保持一致 */
const SUPPORTED_LANGUAGES: readonly CodeLanguage[] = [
  "typescript",
  "javascript",
  "python",
  "java",
  "cpp",
  "go",
  "rust",
  "sql",
];

let highlighterPromise: Promise<HighlighterCore> | null = null;

function getHighlighter(): Promise<HighlighterCore> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighterCore({
      themes: [bundledThemes["github-dark-default"]],
      // 使用内联 wasm，避免 Remotion 打包时再去加载外部 .wasm 资源
      langs: SUPPORTED_LANGUAGES.map((language) => bundledLanguages[language]),
      engine: createOnigurumaEngine(getWasmInstance),
    });
  }
  return highlighterPromise;
}

/** 已高亮结果缓存：同一个 code + lang 只跑一次 */
const TOKEN_CACHE = new Map<string, ThemedToken[][]>();

function cacheKey(code: string, language: CodeLanguage): string {
  return `${language}\u0000${code}`;
}

function readCache(
  code: string,
  language: CodeLanguage,
): ThemedToken[][] | null {
  return TOKEN_CACHE.get(cacheKey(code, language)) ?? null;
}

async function highlightCode(
  code: string,
  language: CodeLanguage,
): Promise<ThemedToken[][]> {
  const cached = readCache(code, language);
  if (cached) {
    return cached;
  }

  const highlighter = await getHighlighter();
  const { tokens } = highlighter.codeToTokens(code, {
    lang: language,
    theme: SHIKI_THEME,
  });
  TOKEN_CACHE.set(cacheKey(code, language), tokens);
  return tokens;
}

/** 高亮失败时的兜底：按行拆成无色 token，保证视频仍可渲染 */
function plainTokens(code: string): ThemedToken[][] {
  return code.split("\n").map((line) =>
    line.length === 0
      ? []
      : [{ content: line, offset: 0, color: FALLBACK_COLOR }],
  );
}

// ---------- 焦点高亮 ----------

interface ActiveHighlight {
  lines: Set<number>;
  color: string;
  opacity: number;
}

/**
 * 同一时刻只有「最近触发」的 focus 生效：
 * 每组在 at 处淡入，在下一组触发时淡出。
 */
function getActiveHighlights(
  focus: CodeVisual["focus"],
  frame: number,
  durationInFrames: number,
  fps: number,
): ActiveHighlight[] {
  const fadeInFrames = Math.max(1, Math.round(FOCUS_FADE_IN_SECONDS * fps));
  const fadeOutFrames = Math.max(1, Math.round(FOCUS_FADE_OUT_SECONDS * fps));

  return focus.flatMap((entry, index) => {
    const start = Math.round(entry.at * durationInFrames);
    const next = focus[index + 1];
    const end = next ? Math.round(next.at * durationInFrames) : null;

    const fadeIn = interpolate(
      frame,
      [start, start + fadeInFrames],
      [0, 1],
      {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      },
    );

    let fadeOut = 1;
    if (end !== null) {
      const outStart = Math.max(start, end - fadeOutFrames);
      fadeOut =
        outStart >= end
          ? frame >= end
            ? 0
            : 1
          : interpolate(frame, [outStart, end], [1, 0], {
              extrapolateLeft: "clamp",
              extrapolateRight: "clamp",
            });
    }

    const opacity = Math.min(fadeIn, fadeOut);
    if (opacity <= 0.001) {
      return [];
    }

    return [
      {
        lines: new Set(entry.lines),
        color: TONE_COLORS[entry.tone],
        opacity,
      },
    ];
  });
}

// ---------- 组件 ----------

export type CodeBlockProps = {
  visual: CodeVisual;
};

export const CodeBlock: React.FC<CodeBlockProps> = ({ visual }) => {
  const frame = useCurrentFrame();
  // 在 <Sequence> 内，useVideoConfig().durationInFrames 就是当前场景的帧数
  const { fps, durationInFrames } = useVideoConfig();

  const [tokens, setTokens] = useState<ThemedToken[][] | null>(() =>
    readCache(visual.code, visual.language),
  );
  const [handle] = useState(() => delayRender("Shiki 代码高亮"));
  const finished = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const finish = () => {
      if (!finished.current) {
        finished.current = true;
        continueRender(handle);
      }
    };

    highlightCode(visual.code, visual.language)
      .then((result) => {
        if (!cancelled) {
          setTokens(result);
        }
      })
      .catch((error: unknown) => {
        console.error("Shiki 高亮失败，回退为纯文本", error);
        if (!cancelled) {
          setTokens(plainTokens(visual.code));
        }
      })
      .finally(finish);

    return () => {
      cancelled = true;
    };
  }, [handle, visual.code, visual.language]);

  const entrance = interpolate(
    frame,
    [0, Math.max(1, Math.round(0.5 * fps))],
    [0, 1],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
  );

  const activeHighlights = getActiveHighlights(
    visual.focus,
    frame,
    durationInFrames,
    fps,
  );

  const codeTokens = tokens ?? plainTokens(visual.code);

  // 常驻高亮：行号 → 颜色（同一行有多个时取第一个）
  const staticLineColors = new Map<number, string>();
  for (const highlight of visual.highlights) {
    for (const lineNumber of highlight.lines) {
      if (!staticLineColors.has(lineNumber)) {
        staticLineColors.set(lineNumber, TONE_COLORS[highlight.tone]);
      }
    }
  }

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at 50% 38%, #151C2E 0%, #0A0E1A 62%)",
      }}
    >
      <div
        style={{
          width: 1520,
          maxWidth: "88%",
          borderRadius: 20,
          overflow: "hidden",
          backgroundColor: "#0D1117",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          boxShadow:
            "0 42px 120px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(108, 140, 255, 0.06)",
          opacity: entrance,
          transform: `translateY(${(1 - entrance) * 28}px) scale(${
            0.98 + entrance * 0.02
          })`,
        }}
      >
        {/* 标题栏 */}
        <div
          style={{
            position: "relative",
            display: "flex",
            alignItems: "center",
            height: 56,
            padding: "0 22px",
            backgroundColor: "#161B22",
            borderBottom: "1px solid rgba(255, 255, 255, 0.06)",
          }}
        >
          <div style={{ display: "flex", gap: 8 }}>
            {["#FF5F57", "#FEBC2E", "#28C840"].map((color) => (
              <div
                key={color}
                style={{
                  width: 13,
                  height: 13,
                  borderRadius: "50%",
                  backgroundColor: color,
                  opacity: 0.9,
                }}
              />
            ))}
          </div>

          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              textAlign: "center",
              fontFamily: MONO_FAMILY,
              fontSize: 20,
              color: "#8B949E",
              pointerEvents: "none",
            }}
          >
            {visual.filename ?? visual.language}
          </div>
        </div>

        {/* 代码区 */}
        <div
          style={{
            padding: "34px 44px",
            fontFamily: MONO_FAMILY,
            fontSize: FONT_SIZE,
            lineHeight: LINE_HEIGHT,
            overflow: "hidden",
          }}
        >
          {codeTokens.map((line, lineIndex) => {
            const lineNumber = lineIndex + 1;
            const staticColor = staticLineColors.get(lineNumber);
            const lineHighlights = activeHighlights.filter((highlight) =>
              highlight.lines.has(lineNumber),
            );

            return (
              <div
                key={lineIndex}
                style={{
                  position: "relative",
                  display: "flex",
                  alignItems: "center",
                  height: LINE_PX,
                  whiteSpace: "pre",
                }}
              >
                {/* 剧本中的常驻高亮：低亮度背景 */}
                {staticColor ? (
                  <div
                    style={{
                      position: "absolute",
                      top: 2,
                      bottom: 2,
                      left: -18,
                      right: -18,
                      borderRadius: 10,
                      backgroundColor: staticColor,
                      opacity: 0.07,
                    }}
                  />
                ) : null}

                {/* focus 动态高亮 */}
                {lineHighlights.map((highlight, highlightIndex) => (
                  <div
                    key={`${highlight.color}-${highlightIndex}`}
                    style={{
                      position: "absolute",
                      top: 2,
                      bottom: 2,
                      left: -18,
                      right: -18,
                      borderRadius: 10,
                      backgroundColor: highlight.color,
                      opacity: highlight.opacity * 0.14,
                    }}
                  />
                ))}

                {lineHighlights.map((highlight, highlightIndex) => (
                  <div
                    key={`bar-${highlight.color}-${highlightIndex}`}
                    style={{
                      position: "absolute",
                      top: 9,
                      bottom: 9,
                      left: -18,
                      width: 4,
                      borderRadius: 2,
                      backgroundColor: highlight.color,
                      opacity: highlight.opacity * 0.9,
                    }}
                  />
                ))}

                <span
                  style={{
                    position: "relative",
                    zIndex: 1,
                    flexShrink: 0,
                    width: 64,
                    paddingRight: 26,
                    textAlign: "right",
                    fontSize: 26,
                    color: staticColor ?? "#484F58",
                    userSelect: "none",
                  }}
                >
                  {lineNumber}
                </span>

                <span style={{ position: "relative", zIndex: 1 }}>
                  {line.map((token, tokenIndex) => (
                    <span
                      key={`${tokenIndex}-${token.offset}`}
                      style={{
                        color: token.color ?? FALLBACK_COLOR,
                        fontStyle:
                          token.fontStyle !== undefined &&
                          (token.fontStyle & 1) !== 0
                            ? "italic"
                            : "normal",
                        fontWeight:
                          token.fontStyle !== undefined &&
                          (token.fontStyle & 2) !== 0
                            ? 700
                            : 400,
                      }}
                    >
                      {token.content}
                    </span>
                  ))}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </AbsoluteFill>
  );
};
