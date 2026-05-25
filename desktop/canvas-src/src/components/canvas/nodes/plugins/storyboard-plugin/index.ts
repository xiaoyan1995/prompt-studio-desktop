import { registerPlugin } from "../../plugin-registry";
import { StoryboardIdleView } from "./StoryboardIdleView";
import { StoryboardActiveView } from "./StoryboardActiveView";

registerPlugin({
  type: "storyboard",
  IdleView: StoryboardIdleView,
  ActiveView: StoryboardActiveView,
});
