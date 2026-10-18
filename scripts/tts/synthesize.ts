import { SpeechSynthesizer } from 'alibabacloud-nls';

/**
 * 单段语音合成封装。
 * 输入一段旁白，输出 wav 音频 + 字级时间戳 + 精确时长。
 */

export const DEFAULT_VOICE = 'aixia';

export interface WordTiming {
  text: string;
  /** 相对音频开头的毫秒数 */
  beginMs: number;
  /** 相对音频开头的毫秒数 */
  endMs: number;
}

export interface SynthesizeOptions {
  text: string;
  token: string;
  appkey: string;
  /** 发音人，默认 aixia */
  voice?: string;
  /** 语速，范围 -500 ~ 500，0 为正常 */
  speechRate?: number;
  /** 地域，决定 WebSocket 地址 */
  region?: string;
  /** 显式覆盖 WebSocket 地址 */
  url?: string;
  /** 整体超时（毫秒） */
  timeoutMs?: number;
}

export interface SynthesizeResult {
  /** wav 文件内容 */
  audio: Buffer;
  /** 字级时间戳；未开启字幕或服务未返回时为空数组 */
  words: WordTiming[];
  /** 音频时长（毫秒），由 wav 头精确计算 */
  durationMs: number;
}

interface RawSubtitle {
  text?: unknown;
  begin_time?: unknown;
  end_time?: unknown;
  beginTime?: unknown;
  endTime?: unknown;
}

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return fallback;
}

/**
 * 解析 MetaInfo 中的字幕。
 * 线上格式为 { payload: { subtitles: "[{ text, begin_time, end_time }]" } }，
 * 同时兼容 subtitles 直接是数组、字段为驼峰命名的情况。
 */
function parseSubtitles(metaMessage: string | null): WordTiming[] {
  if (!metaMessage) {
    return [];
  }

  try {
    const message = JSON.parse(metaMessage) as {
      payload?: { subtitles?: unknown };
    };
    const raw = message.payload?.subtitles;
    const list: unknown = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!Array.isArray(list)) {
      return [];
    }

    const words: WordTiming[] = [];
    for (const item of list) {
      if (!item || typeof item !== 'object') {
        continue;
      }
      const entry = item as RawSubtitle;
      const text = typeof entry.text === 'string' ? entry.text : '';
      if (!text) {
        continue;
      }
      const beginMs = toNumber(entry.begin_time ?? entry.beginTime, 0);
      const endMs = toNumber(entry.end_time ?? entry.endTime, beginMs);
      words.push({ text, beginMs, endMs });
    }
    return words;
  } catch {
    return [];
  }
}

/**
 * 从 wav 头计算音频时长（毫秒），不依赖第三方解码库。
 */
export function wavDurationMs(buffer: Buffer): number {
  if (buffer.length < 12) {
    return Number.NaN;
  }
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return Number.NaN;
  }

  let offset = 12;
  let byteRate = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString('ascii', offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + 8;

    if (chunkId === 'fmt ' && dataStart + 16 <= buffer.length) {
      // fmt 块：audioFormat(2) + numChannels(2) + sampleRate(4) + byteRate(4)
      byteRate = buffer.readUInt32LE(dataStart + 8);
    } else if (chunkId === 'data') {
      if (byteRate <= 0) {
        return Number.NaN;
      }
      const dataSize = Math.min(chunkSize, buffer.length - dataStart);
      return Math.round((dataSize / byteRate) * 1000);
    }

    // RIFF 块按偶数对齐
    offset = dataStart + chunkSize + (chunkSize % 2);
  }

  return Number.NaN;
}

function formatError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : JSON.stringify(error);
}

/**
 * 合成一段文本。成功时返回音频与时间戳，失败时抛出带上下文的错误。
 */
export async function synthesize(options: SynthesizeOptions): Promise<SynthesizeResult> {
  const {
    text,
    token,
    appkey,
    voice = DEFAULT_VOICE,
    speechRate = 0,
    region = process.env.NLS_REGION || 'cn-shanghai',
    url = `wss://nls-gateway-${region}.aliyuncs.com/ws/v1`,
    timeoutMs = 60_000,
  } = options;

  if (!text.trim()) {
    throw new Error('合成文本不能为空');
  }

  const synthesizer = new SpeechSynthesizer({ url, appkey, token });
  const chunks: Buffer[] = [];
  let metaMessage: string | null = null;

  synthesizer.on('meta', (message: string) => {
    metaMessage = message;
  });
  synthesizer.on('data', (data: Buffer) => {
    chunks.push(Buffer.from(data));
  });

  const params = synthesizer.defaultStartParams(voice);
  Object.assign(params, {
    text,
    voice,
    speech_rate: speechRate,
    enable_subtitle: true,
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      synthesizer.start(params, true, 6000),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`合成超时（${timeoutMs}ms）`));
        }, timeoutMs);
      }),
    ]);
  } catch (error) {
    throw new Error(`TTS 合成失败：${formatError(error)}`);
  } finally {
    if (timer !== undefined) {
      clearTimeout(timer);
    }
    synthesizer.shutdown();
  }

  if (chunks.length === 0) {
    throw new Error('TTS 合成完成但没有收到音频数据');
  }

  const audio = Buffer.concat(chunks);
  const words = parseSubtitles(metaMessage);
  let durationMs = wavDurationMs(audio);

  // 兜底：wav 头解析失败时，用最后一个时间戳估算
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    if (words.length > 0) {
      durationMs = words[words.length - 1].endMs + 300;
    } else {
      throw new Error('无法计算音频时长，且服务未返回时间戳');
    }
  }

  return { audio, words, durationMs };
}
