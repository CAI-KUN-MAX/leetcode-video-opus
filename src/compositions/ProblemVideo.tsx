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
import { CodeBlock } from "../components/CodeBlock";
import { ArrayViz } from "../components/ArrayViz";
import { HashTable } from "../components/HashTable";
import { Complexity } from "../components/Complexity";
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
 * 联合类型已全部覆盖；新增视觉类型时 TS 会在此处报错，提醒补齐组件。
 */
const SceneVisual: React.FC<{ scene: Scene }> = ({ scene }) => {
  switch (scene.visual.type) {
    case "title":
      return <TitleCard visual={scene.visual} />;
    case "bullets":
      return <Bullets visual={scene.visual} />;
    case "code":
      return <CodeBlock visual={scene.visual} />;
    case "array":
      return <ArrayViz visual={scene.visual} />;
    case "hash-table":
      return <HashTable visual={scene.visual} />;
    case "complexity":
      return <Complexity visual={scene.visual} />;
  }
};
