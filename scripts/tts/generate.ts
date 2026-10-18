import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { ScriptSchema, type Script } from '../../src/types';
import { getNlsToken } from './token';
import { DEFAULT_VOICE, synthesize, type WordTiming } from './synthesize';

/**
 * 批量合成剧本音频。
 *
 * 用法：
 *   pnpm tts                  # 默认 0001-two-sum
 *   pnpm tts 0001-two-sum
 *   pnpm tts 0001-two-sum --no-cache
 */

/** 缓存版本参与 hash：解析逻辑变化时递增，自动让旧缓存失效 */
const CACHE_VERSION = 1;

const ROOT = process.cwd();
const CONTENT_DIR = path.join(ROOT, 'content');
const PUBLIC_DIR = path.join(ROOT, 'public');
const CACHE_DIR = path.join(ROOT, '.cache', 'tts');

interface CacheMeta {
  key: string;
  text: string;
  voice: string;
  speechRate: number;
  durationMs: number;
  words: WordTiming[];
  createdAt: string;
}

interface CachedScene {
  meta: CacheMeta;
  audioPath: string;
}

interface ManifestScene {
  id: string;
  /** 相对 public/ 的路径，供 Remotion staticFile() 使用 */
  file: string;
  durationMs: number;
  holdMs: number;
  totalMs: number;
  words: WordTiming[];
}

interface Manifest {
  version: number;
  problemId: string;
  voice: string;
  speechRate: number;
  format: string;
  generatedAt: string;
  totalMs: number;
  scenes: ManifestScene[];
}

function parseArgs(): { problemId: string; useCache: boolean } {
  const rawArgs = process.argv.slice(2);
  const useCache = !rawArgs.includes('--no-cache');
  const problemId = rawArgs.find((arg) => !arg.startsWith('--')) ?? '0001-two-sum';
  return { problemId, useCache };
}

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少环境变量 ${name}，请检查 .env 文件`);
  }
  return value;
}

function computeCacheKey(text: string, voice: string, speechRate: number): string {
  return createHash('sha256')
    .update(JSON.stringify({ version: CACHE_VERSION, text, voice, speechRate }))
    .digest('hex')
    .slice(0, 16);
}

function cachePaths(key: string): { audioPath: string; metaPath: string } {
  return {
    audioPath: path.join(CACHE_DIR, `${key}.wav`),
    metaPath: path.join(CACHE_DIR, `${key}.json`),
  };
}

function readCache(key: string): CachedScene | null {
  const { audioPath, metaPath } = cachePaths(key);
  try {
    if (!fs.existsSync(audioPath) || !fs.existsSync(metaPath)) {
      return null;
    }
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as CacheMeta;
    if (meta.key !== key || !Array.isArray(meta.words)) {
      return null;
    }
    return { meta, audioPath };
  } catch {
    return null;
  }
}

function writeCache(
  key: string,
  text: string,
  voice: string,
  speechRate: number,
  result: { audio: Buffer; words: WordTiming[]; durationMs: number },
): CachedScene {
  const { audioPath, metaPath } = cachePaths(key);
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.writeFileSync(audioPath, result.audio);

  const meta: CacheMeta = {
    key,
    text,
    voice,
    speechRate,
    durationMs: result.durationMs,
    words: result.words,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return { meta, audioPath };
}

async function loadScript(problemId: string): Promise<Script> {
  const scriptPath = path.join(CONTENT_DIR, problemId, 'script.ts');
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`找不到剧本文件：${scriptPath}`);
  }

  const module = (await import(pathToFileURL(scriptPath).href)) as {
    default?: unknown;
    script?: unknown;
  };
  const raw = module.default ?? module.script;
  if (!raw) {
    throw new Error(`剧本 ${scriptPath} 没有导出 script / default`);
  }
  return ScriptSchema.parse(raw);
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

async function main(): Promise<void> {
  const { problemId, useCache } = parseArgs();

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(problemId)) {
    throw new Error(`题目 id 不合法：${problemId}`);
  }

  const voice = process.env.NLS_VOICE || DEFAULT_VOICE;
  const speechRate = Number(process.env.NLS_SPEECH_RATE ?? 0);
  if (!Number.isFinite(speechRate)) {
    throw new Error('NLS_SPEECH_RATE 必须是数字');
  }

  const script = await loadScript(problemId);
  const audioDir = path.join(PUBLIC_DIR, 'audio', problemId);
  fs.mkdirSync(audioDir, { recursive: true });

  console.log(`▸ ${problemId} · ${script.length} 个场景 · 发音人 ${voice} · 语速 ${speechRate}`);

  // 先全部查缓存，避免「全命中」时还去请求 Token
  const plans = script.map((scene) => {
    const key = computeCacheKey(scene.narration, voice, speechRate);
    return { scene, key, cached: useCache ? readCache(key) : null };
  });
  const misses = plans.filter((plan) => plan.cached === null);

  let token = '';
  let appkey = '';
  if (misses.length > 0) {
    appkey = assertEnv('NLS_APPKEY');
    token = await getNlsToken();
  } else {
    console.log('  · 全部命中缓存，跳过 Token 获取');
  }

  const manifestScenes: ManifestScene[] = [];
  let cacheHits = 0;
  let synthesized = 0;
  const missingTimestamps: string[] = [];

  for (let index = 0; index < plans.length; index++) {
    const { scene, key, cached } = plans[index];
    const label = `[${index + 1}/${plans.length}] ${scene.id}`;

    let entry: CachedScene;
    if (cached) {
      entry = cached;
      cacheHits++;
      console.log(`  ${label} · 缓存命中`);
    } else {
      const start = Date.now();
      const result = await synthesize({
        text: scene.narration,
        token,
        appkey,
        voice,
        speechRate,
      });
      entry = writeCache(key, scene.narration, voice, speechRate, result);
      synthesized++;
      console.log(`  ${label} · 合成完成 ${(Date.now() - start) / 1000}s`);
    }

    if (entry.meta.words.length === 0) {
      missingTimestamps.push(scene.id);
    }

    const outputPath = path.join(audioDir, `${scene.id}.wav`);
    fs.copyFileSync(entry.audioPath, outputPath);

    const holdMs = Math.round(scene.holdSeconds * 1000);
    manifestScenes.push({
      id: scene.id,
      file: ['audio', problemId, `${scene.id}.wav`].join('/'),
      durationMs: entry.meta.durationMs,
      holdMs,
      totalMs: entry.meta.durationMs + holdMs,
      words: entry.meta.words,
    });
  }

  const totalMs = manifestScenes.reduce((sum, scene) => sum + scene.totalMs, 0);
  const manifest: Manifest = {
    version: 1,
    problemId,
    voice,
    speechRate,
    format: 'wav',
    generatedAt: new Date().toISOString(),
    totalMs,
    scenes: manifestScenes,
  };

  const manifestPath = path.join(audioDir, 'manifest.json');
  const tempPath = `${manifestPath}.tmp`;
  fs.writeFileSync(tempPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  fs.renameSync(tempPath, manifestPath);

  console.log('');
  console.log(`✓ 完成：${script.length} 个场景（缓存命中 ${cacheHits}，新合成 ${synthesized}）`);
  console.log(`✓ 总时长：${formatDuration(totalMs)}`);
  console.log(`✓ 音频目录：${path.relative(ROOT, audioDir)}`);
  console.log(`✓ 清单文件：${path.relative(ROOT, manifestPath)}`);

  if (missingTimestamps.length > 0) {
    console.warn(
      `⚠ 以下场景未返回字级时间戳，字幕/高亮同步会退回按比例估算：${missingTimestamps.join(', ')}`,
    );
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`✗ ${message}`);
  process.exitCode = 1;
});
