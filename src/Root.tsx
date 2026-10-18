import { Composition } from "remotion";
import { MyComposition } from "./Composition";
import { ProblemVideo } from "./compositions/ProblemVideo";
import { script } from "../content/0001-two-sum/script";
import {
  buildTimeline,
  getManifest,
  getTimelineDurationInFrames,
} from "./lib/manifest";

const FPS = 30;
const WIDTH = 1920;
const HEIGHT = 1080;
const PROBLEM_ID = "0001-two-sum";

// 总时长 = 各场景帧数之和；场景帧数由 manifest 的 totalMs 换算而来。
// 放在模块作用域，修改剧本后 HMR 会重新计算。
const manifest = getManifest(PROBLEM_ID);
const timeline = buildTimeline(script, manifest, FPS);
const durationInFrames = getTimelineDurationInFrames(timeline);

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="ProblemVideo-0001"
        component={ProblemVideo}
        durationInFrames={durationInFrames}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
        defaultProps={{ problemId: PROBLEM_ID, script }}
      />
      <MyComposition />
    </>
  );
};
