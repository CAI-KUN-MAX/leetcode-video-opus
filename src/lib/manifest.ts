import { z } from "zod";
import rawTwoSum from "../../public/audio/0001-two-sum/manifest.json";

/**
 * 音频清单（manifest）的类型与读取。
 * 清单由 scripts/tts/generate.ts 生成，是「视觉时长」的唯一来源。
 */

export const WordTimingSchema = z.object({
  text: z.string(),
  beginMs: z.number().nonnegative(),
  endMs: z.number().nonnegative(),
});

export const ManifestSceneSchema = z.object({
  id: z.string().min(1),
  /** 相对 public/ 的路径，配合 staticFile() 使用 */
  file: z.string().min(1),
  durationMs: z.number().nonnegative(),
  holdMs: z.number().nonnegative(),
  totalMs: z.number().nonnegative(),
  words: z.array(WordTimingSchema),
});

export const ManifestSchema = z.object({
  version: z.number(),
  problemId: z.string().min(1),
  voice: z.string(),
  speechRate: z.number(),
  format: z.string(),
  generatedAt: z.string(),
  totalMs: z.number().nonnegative(),
  scenes: z.array(ManifestSceneSchema).min(1),
});

export type WordTiming = z.infer<typeof WordTimingSchema>;
export type ManifestScene = z.infer<typeof ManifestSceneSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

/**
 * 目前采用显式注册：新增题目时在这里加一行 import + 映射。
 * 相比运行时 fetch，静态导入是同步的，组件里不需要 delayRender。
 */
const RAW_MANIFESTS: Record<string, unknown> = {
  "0001-two-sum": rawTwoSum,
};

const parsedManifests = new Map<string, Manifest>();

export function getManifest(problemId: string): Manifest {
  const cached = parsedManifests.get(problemId);
  if (cached) {
    return cached;
  }

  const raw = RAW_MANIFESTS[problemId];
  if (!raw) {
    throw new Error(
      `没有 ${problemId} 的音频清单，请先运行：pnpm tts ${problemId}`,
    );
  }

  const manifest = ManifestSchema.parse(raw);
  parsedManifests.set(problemId, manifest);
  return manifest;
}

// ---------- 时间换算 ----------

/** 毫秒 → 帧，至少 1 帧，避免 0 时长 Sequence */
export function msToFrames(ms: number, fps: number): number {
  return Math.max(1, Math.round((ms / 1000) * fps));
}

/** 帧 → 毫秒，用于调试 */
export function framesToMs(frames: number, fps: number): number {
  return Math.round((frames / fps) * 1000);
}

export function getSceneDurationInFrames(
  scene: ManifestScene,
  fps: number,
): number {
  return msToFrames(scene.totalMs, fps);
}

export interface SceneTiming<T extends { id: string }> {
  /** 剧本中的场景（含旁白与视觉指令） */
  scene: T;
  /** 清单中对应的音频信息 */
  audio: ManifestScene;
  /** 在整条视频中的起始帧 */
  from: number;
  durationInFrames: number;
}

/**
 * 按剧本顺序计算每个场景的起始帧与时长。
 * 场景 id 必须都能在清单中找到，否则直接抛错，避免静默错位。
 */
export function buildTimeline<T extends { id: string }>(
  scenes: readonly T[],
  manifest: Manifest,
  fps: number,
): SceneTiming<T>[] {
  const audioById = new Map(
    manifest.scenes.map((scene) => [scene.id, scene] as const),
  );

  let cursor = 0;
  return scenes.map((scene) => {
    const audio = audioById.get(scene.id);
    if (!audio) {
      throw new Error(
        `清单中找不到场景「${scene.id}」，请重新运行：pnpm tts ${manifest.problemId}`,
      );
    }

    const durationInFrames = getSceneDurationInFrames(audio, fps);
    const timing: SceneTiming<T> = {
      scene,
      audio,
      from: cursor,
      durationInFrames,
    };
    cursor += durationInFrames;
    return timing;
  });
}

export function getTimelineDurationInFrames<T extends { id: string }>(
  timeline: readonly SceneTiming<T>[],
): number {
  return timeline.reduce((sum, entry) => sum + entry.durationInFrames, 0);
}
