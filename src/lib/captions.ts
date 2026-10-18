import { createTikTokStyleCaptions } from "@remotion/captions";
import type { Caption, TikTokToken } from "@remotion/captions";
import type { WordTiming } from "./manifest";

/**
 * 字幕分页与标点还原。
 *
 * 阿里云 TTS 返回的字级时间戳不包含标点，且会把阿拉伯数字读成汉字
 * （例如旁白 O(1) 的时间戳可能是「O」「一」）。这里把时间戳与
 * 剧本里的原始 narration 做一次顺序对齐：
 * - 用对齐结果还原被 TTS 丢掉的标点；
 * - 用 narration 原文覆盖被改写的 token（数字、英文大小写）；
 * - 按「汉字宽度」分页，并把 pageBreakAfter 交给 @remotion/captions
 *   的 createTikTokStyleCaptions() 生成最终字幕页。
 */

/** 每屏最多多少个汉字宽度（全角标点按 1 个汉字计算） */
const DEFAULT_MAX_UNITS_PER_PAGE = 18;

/** 对齐时允许跳过的字符数，避免某处失配后一路漂移到句尾 */
const ALIGN_LOOKAHEAD = 24;

/** 句末标点：分页时最优先在这里断开 */
const STRONG_BREAK = /[。！？!?…]/;
/** 句中停顿：没有句末标点时退而求其次 */
const WEAK_BREAK = /[，、；：,;:]/;

const OPENING_CHARS = new Set([
  "(",
  "（",
  "[",
  "【",
  "{",
  "《",
  "〈",
  "「",
  "『",
  "“",
  "‘",
  '"',
  "'",
]);

const DIGIT_TO_CN: Record<string, string> = {
  "0": "零",
  "1": "一",
  "2": "二",
  "3": "三",
  "4": "四",
  "5": "五",
  "6": "六",
  "7": "七",
  "8": "八",
  "9": "九",
};

export interface SubtitlePage {
  /** 该页开始显示的毫秒数 */
  startMs: number;
  /** 该页停留时长；下一页开始即结束 */
  durationMs: number;
  tokens: readonly TikTokToken[];
}

export interface BuildCaptionPagesOptions {
  /** 每屏最多多少个汉字宽度，默认 18 */
  maxUnitsPerPage?: number;
}

interface AlignedToken {
  text: string;
  beginMs: number;
  endMs: number;
}

interface NormalizedText {
  text: string;
  /** text 中每个字符在原文里的下标 */
  sourceIndex: number[];
}

function isCjk(ch: string): boolean {
  return /[㐀-䶿一-鿿豈-﫿]/.test(ch);
}

/** 标点 / 符号：既不是汉字，也不是拉丁字母或数字，也不是空白 */
function isSymbol(ch: string): boolean {
  return !isCjk(ch) && !/[A-Za-z0-9]/.test(ch) && !/\s/.test(ch);
}

/**
 * 归一化：只保留汉字与拉丁字母，数字统一成汉字，
 * 同时记录每个归一化字符对应原文下标，便于反向取回原文。
 */
function normalize(text: string): NormalizedText {
  let normalized = "";
  const sourceIndex: number[] = [];

  for (let index = 0; index < text.length; index++) {
    const ch = text[index];
    const lower = ch.toLowerCase();

    if (/[a-z0-9]/.test(lower)) {
      normalized += DIGIT_TO_CN[lower] ?? lower;
      sourceIndex.push(index);
    } else if (isCjk(ch)) {
      normalized += ch;
      sourceIndex.push(index);
    }
  }

  return { text: normalized, sourceIndex };
}

/**
 * 把两个 token 之间的原文拆成：
 * - prefix：属于后一个 token 的左括号 / 左引号；
 * - suffix：属于前一个 token 的停顿标点（逗号、句号、右括号等）。
 * 原文里未被对齐的正文（汉字/字母/数字）会被丢弃，避免失配时把整句话塞进字幕。
 */
function splitGap(gap: string): { prefix: string; suffix: string } {
  let index = 0;
  let prefix = "";

  while (index < gap.length && /\s/.test(gap[index])) {
    index++;
  }
  while (index < gap.length && OPENING_CHARS.has(gap[index])) {
    prefix += gap[index];
    index++;
  }

  let suffix = "";
  for (; index < gap.length; index++) {
    if (isSymbol(gap[index])) {
      suffix += gap[index];
    }
  }

  return { prefix, suffix };
}

/** 取原文开头连续的标点（忽略空白），用于补上句末标点 */
function leadingSymbols(text: string): string {
  let symbols = "";
  for (const ch of text) {
    if (/\s/.test(ch)) {
      continue;
    }
    if (!isSymbol(ch)) {
      break;
    }
    symbols += ch;
  }
  return symbols;
}

/**
 * 按顺序把 TTS 的字级时间戳对齐到 narration 原文。
 * 对齐成功时以旁白原文为准（修复数字被读成汉字的问题），
 * 失配时保留 TTS 文本，只做有限次数的模糊跳过。
 */
function alignWordsWithNarration(
  words: readonly WordTiming[],
  narration: string,
): AlignedToken[] {
  if (narration.length === 0) {
    return words.map((word) => ({
      text: word.text,
      beginMs: word.beginMs,
      endMs: word.endMs,
    }));
  }

  const source = normalize(narration);
  const tokens: AlignedToken[] = [];

  /** 已消费到的归一化下标 */
  let cursor = 0;
  /** 已消费到的原文下标 */
  let consumedSource = 0;
  /** 留给下一个 token 的前缀标点 */
  let pendingPrefix = "";

  for (const word of words) {
    const rawText = word.text.trim();
    if (!rawText) {
      continue;
    }

    const normalizedWord = normalize(rawText);
    if (normalizedWord.text.length === 0) {
      // TTS 返回了纯标点 token：直接并到相邻位置
      if (tokens.length > 0) {
        tokens[tokens.length - 1].text += rawText;
      } else {
        pendingPrefix += rawText;
      }
      continue;
    }

    const found = source.text.indexOf(normalizedWord.text, cursor);
    const aligned =
      found !== -1 && found - cursor <= ALIGN_LOOKAHEAD ? found : -1;

    let displayText = rawText;
    let gap = "";

    if (aligned !== -1) {
      const start = source.sourceIndex[aligned];
      const end =
        source.sourceIndex[aligned + normalizedWord.text.length - 1] + 1;
      gap = narration.slice(consumedSource, start);
      displayText = narration.slice(start, end);
      cursor = aligned + normalizedWord.text.length;
      consumedSource = end;
    } else {
      // 失配：尝试只吃掉首字，防止后续对齐彻底跑偏
      const first = source.text.indexOf(normalizedWord.text[0], cursor);
      if (first !== -1 && first - cursor <= ALIGN_LOOKAHEAD) {
        cursor = first + 1;
      }
    }

    const { prefix, suffix } = splitGap(gap);
    if (tokens.length > 0) {
      tokens[tokens.length - 1].text += suffix;
    } else {
      pendingPrefix += suffix;
    }
    pendingPrefix += prefix;

    tokens.push({
      text: pendingPrefix + displayText,
      beginMs: word.beginMs,
      endMs: word.endMs,
    });
    pendingPrefix = "";
  }

  // 最后一个字之后可能还有句号 / 右引号
  if (tokens.length > 0) {
    tokens[tokens.length - 1].text += leadingSymbols(
      narration.slice(consumedSource),
    );
  }

  return tokens;
}

/** 单个字符的排版宽度，以汉字为 1 */
function charWidth(ch: string): number {
  if (/\s/.test(ch)) {
    return 0.3;
  }
  if (isCjk(ch) || ch.charCodeAt(0) > 0xff) {
    return 1;
  }
  if (/[A-Za-z0-9]/.test(ch)) {
    return 0.55;
  }
  return 0.5;
}

function textWidth(text: string): number {
  let width = 0;
  for (const ch of text) {
    width += charWidth(ch);
  }
  return width;
}

function lastVisibleChar(text: string): string {
  const chars = Array.from(text.trim());
  return chars.length > 0 ? chars[chars.length - 1] : "";
}

/**
 * 贪心分页：累计宽度达到上限时，
 * 优先在当前页内最靠后的句末标点处断开，其次逗号，最后才硬切。
 */
function findPageBreaks(
  tokens: readonly AlignedToken[],
  maxUnits: number,
): Set<number> {
  const breaks = new Set<number>();
  if (tokens.length === 0) {
    return breaks;
  }

  const widths = tokens.map((token) => textWidth(token.text));
  const minUnits = Math.max(8, maxUnits * 0.55);

  let pageStart = 0;
  let width = 0;

  for (let index = 0; index < tokens.length; index++) {
    width += widths[index];
    if (width < maxUnits) {
      continue;
    }

    let strongBreak = -1;
    let weakBreak = -1;
    let widthUpTo = width;

    for (let cursor = index; cursor >= pageStart; cursor--) {
      if (widthUpTo < minUnits) {
        break;
      }
      const last = lastVisibleChar(tokens[cursor].text);
      if (STRONG_BREAK.test(last)) {
        strongBreak = cursor;
        break;
      }
      if (weakBreak === -1 && WEAK_BREAK.test(last)) {
        weakBreak = cursor;
      }
      widthUpTo -= widths[cursor];
    }

    const breakAt =
      strongBreak !== -1 ? strongBreak : weakBreak !== -1 ? weakBreak : index;

    breaks.add(breakAt);
    pageStart = breakAt + 1;

    // 断点之后已经计入本页宽度的 token 要带回下一页
    width = 0;
    for (let cursor = pageStart; cursor <= index; cursor++) {
      width += widths[cursor];
    }
  }

  return breaks;
}

/**
 * 由 manifest 的字级时间戳 + 剧本旁白生成分页字幕。
 * 分页完全由 pageBreakAfter 控制，不依赖 TikTok 字幕的时间自动切分。
 */
export function buildCaptionPages(
  words: readonly WordTiming[],
  narration: string,
  options: BuildCaptionPagesOptions = {},
): SubtitlePage[] {
  if (words.length === 0) {
    return [];
  }

  const tokens = alignWordsWithNarration(words, narration);
  if (tokens.length === 0) {
    return [];
  }

  const breaks = findPageBreaks(
    tokens,
    options.maxUnitsPerPage ?? DEFAULT_MAX_UNITS_PER_PAGE,
  );

  const captions: Caption[] = tokens.map((token, index) => ({
    text: token.text,
    startMs: token.beginMs,
    endMs: token.endMs,
    timestampMs: token.beginMs,
    confidence: 1,
    ...(breaks.has(index) ? { pageBreakAfter: true } : {}),
  }));

  const { pages } = createTikTokStyleCaptions({
    captions,
    // 足够大，确保库内不会按时间自行切页
    combineTokensWithinMilliseconds: Number.MAX_SAFE_INTEGER,
  });

  return pages.map((page) => ({
    startMs: page.startMs,
    durationMs: page.durationMs,
    tokens: page.tokens,
  }));
}
