import type { Caption } from "@remotion/captions";
import type { WordTiming } from "./manifest";

/**
 * 把 manifest 里的字级时间戳转换成 @remotion/captions 的 Caption 数组。
 *
 * @remotion/captions 的 createTikTokStyleCaptions() 用 text.startsWith(" ")
 * 判断「这里是否可能开始新的一句」，因此每个 token 需要带前导空格。
 */

export interface CaptionAdapterOptions {
  /**
   * 是否给每个 token 补前导空格，默认 true。
   * 如果要按中文逐字排版、不需要 TikTok 式分句，可以设为 false。
   */
  leadingSpace?: boolean;
}

/** 已有空白就不重复添加，避免 " 你" 变成 "  你" */
function withLeadingSpace(text: string): string {
  return /^\s/.test(text) ? text : ` ${text}`;
}

export function wordsToCaptions(
  words: readonly WordTiming[],
  options: CaptionAdapterOptions = {},
): Caption[] {
  const { leadingSpace = true } = options;

  return words.map((word) => ({
    text: leadingSpace ? withLeadingSpace(word.text) : word.text,
    startMs: word.beginMs,
    endMs: word.endMs,
    timestampMs: word.beginMs,
    confidence: 1,
  }));
}
