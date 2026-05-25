import { registerPlugin } from "../../plugin-registry";
import { PromptIdleView } from "./PromptIdleView";
import { PromptActiveView } from "./PromptActiveView";

registerPlugin({
  type: "prompt",
  IdleView: PromptIdleView,
  ActiveView: PromptActiveView,
});
