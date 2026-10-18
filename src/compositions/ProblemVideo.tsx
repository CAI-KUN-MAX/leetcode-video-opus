import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useVideoConfig,
} from "remotion";
import type { Scene, Script } from "../types";
import { buildTimeline, getManifest } from "../lib/manifest";
import { TitleCard } from "../components/TitleCard";
import { Bullets } from "../components/Bullets";
import { Subtitle } from "../components/Subtitle";

export type ProblemVideoProps = {
  problemId: string;
  /** 由 Root.tsx 从 content/ 目录导入并作为 defaultProps 传入 */
  script: Script;
};

/**
 * 通用题解视频：按剧本顺序排列场景，
 * 每个场景的时长来自 manifest 中对应音频的 totalMs。
 * 音频与视觉同处一个 Sequence，因此天然同步。
 */
export const ProblemVideo: React.FC<ProblemVideoProps> = ({
  problemId,
  script,
}) => {
  const { fps } = useVideoConfig();
  const manifest = getManifest(problemId);
  const timeline = buildTimeline(script, manifest, fps);

  return (
    <AbsoluteFill style={{ backgroundColor: "#0A0E1A" }}>
      {timeline.map(({ scene, audio, from, durationInFrames }) => (
        <Sequence
          key={scene.id}
          name={scene.id}
          from={from}
          durationInFrames={durationInFrames}
        >
          <Audio src={staticFile(audio.file)} />
          <SceneVisual scene={scene} />
          <Subtitle
            words={audio.words}
            narration={scene.narration}
            sceneDurationMs={audio.totalMs}
            holdMs={audio.holdMs}
          />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};

/**
 * 按 scene.visual.type 分发到对应视觉组件。
 * 尚未实现的类型会显示占位页，便于逐个补齐而不影响预览。
 */
const SceneVisual: React.FC<{ scene: Scene }> = ({ scene }) => {
  switch (scene.visual.type) {
    case "title":
      return <TitleCard visual={scene.visual} />;
    case "bullets":
      return <Bullets visual={scene.visual} />;
    default:
      return (
        <Placeholder
          sceneId={scene.id}
          visualType={scene.visual.type}
        />
      );
  }
};

const VISUAL_LABELS: Record<string, string> = {
  code: "代码演示",
  array: "数组动画",
  "hash-table": "哈希表演示",
  complexity: "复杂度总结",
};

const Placeholder: React.FC<{ sceneId: string; visualType: string }> = ({
  sceneId,
  visualType,
}) => {
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        backgroundColor: "#0A0E1A",
        color: "#A7B0C0",
        fontFamily:
          '"Noto Sans SC", "PingFang SC", "Microsoft YaHei", sans-serif',
      }}
    >
      <div style={{ fontSize: 40, fontWeight: 700, color: "#6C8CFF" }}>
        {VISUAL_LABELS[visualType] ?? visualType}
      </div>
      <div style={{ fontSize: 26 }}>
        场景「{sceneId}」的视觉组件尚未实现
      </div>
    </AbsoluteFill>
  );
};
