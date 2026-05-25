import { registerPlugin } from "../../plugin-registry";
import { TextIdleView } from "./TextIdleView";
import { TextActiveView } from "./TextActiveView";

registerPlugin({
  type: "text",
  IdleView: TextIdleView,
  ActiveView: TextActiveView,
});
