import { registerPlugin } from "../../plugin-registry";
import { MediaIdleView } from "./MediaIdleView";
import { MediaActiveView } from "./MediaActiveView";

registerPlugin({
  type: ["image-gen", "video-gen", "source-image", "upscale", "video-upscale", "rembg"],
  IdleView: MediaIdleView,
  ActiveView: MediaActiveView,
});
