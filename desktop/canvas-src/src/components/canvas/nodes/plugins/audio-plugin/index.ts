import { registerPlugin } from "../../plugin-registry";
import { AudioIdleView } from "./AudioIdleView";
import { AudioActiveView } from "./AudioActiveView";

registerPlugin({
  type: ["source-audio"],
  IdleView: AudioIdleView,
});

registerPlugin({
  type: ["audio-gen"],
  IdleView: AudioIdleView,
  ActiveView: AudioActiveView,
});
