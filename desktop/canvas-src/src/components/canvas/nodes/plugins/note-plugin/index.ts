import { registerPlugin } from "../../plugin-registry";
import { NoteView } from "./NoteView";

registerPlugin({
  type: "note",
  IdleView: NoteView,
});
