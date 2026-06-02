import os
import re
import io
import json
import time
import math
import subprocess
import threading
from pathlib import Path

class LapianManager:
    def __init__(self, data_dir):
        self.data_dir = Path(data_dir)
        self.lapian_file = self.data_dir / "lapian_projects.json"
        self.upload_dir = self.data_dir / "uploads"
        self.lapian_upload_base = self.upload_dir / "lapian_projects"
        self.lapian_upload_base.mkdir(parents=True, exist_ok=True)
        self._lock = threading.Lock()
        self._ensure_file()

    def _ensure_file(self):
        if not self.lapian_file.exists():
            self._write_db({"projects": []})

    def _read_db(self):
        with self._lock:
            try:
                return json.loads(self.lapian_file.read_text(encoding="utf-8"))
            except Exception:
                return {"projects": []}

    def _write_db(self, data):
        with self._lock:
            self.lapian_file.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

    def get_list(self):
        db = self._read_db()
        # Return summary without full shots detail to optimize payload
        summary = []
        for p in db.get("projects", []):
            summary.append({
                "id": p.get("id"),
                "videoName": p.get("videoName"),
                "movieName": p.get("movieName"),
                "desc": p.get("desc", ""),
                "duration": p.get("duration"),
                "totalShots": len(p.get("shots", [])),
                "status": p.get("status", "pending"),
                "progress": p.get("progress", 0),
                "created_at": p.get("created_at"),
                "cover": p.get("cover", "")
            })
        return summary

    def get_detail(self, project_id):
        db = self._read_db()
        for p in db.get("projects", []):
            if p.get("id") == project_id:
                return p
        return None

    def resplit_project(self, ffmpeg_path, project_id, mode="standard", threshold=None):
        """Reset shots and re-run scene detection with new params."""
        db = self._read_db()
        proj = None
        for p in db["projects"]:
            if p["id"] == project_id:
                proj = p
                break
        if not proj:
            raise Exception("项目不存在")

        # Clean up old shot image files
        shots_dir = self.lapian_upload_base / project_id / "shots"
        if shots_dir.exists():
            import shutil
            shutil.rmtree(shots_dir)
        shots_dir.mkdir(parents=True, exist_ok=True)

        # Reset project state
        proj["shots"] = []
        proj["status"] = "pending"
        proj["progress"] = 0
        proj["mode"] = mode
        proj["threshold"] = threshold
        proj["cover"] = ""
        self._write_db(db)

        # Re-run background processing
        import threading
        t = threading.Thread(
            target=self._process_video_background,
            args=(ffmpeg_path, project_id, mode, threshold),
            daemon=True
        )
        t.start()
        return project_id

    def delete_project(self, project_id):
        db = self._read_db()
        projects = db.get("projects", [])
        idx = -1
        for i, p in enumerate(projects):
            if p.get("id") == project_id:
                idx = i
                break
        if idx != -1:
            # Delete project files
            proj_dir = self.lapian_upload_base / project_id
            if proj_dir.exists():
                import shutil
                try:
                    shutil.rmtree(proj_dir)
                except Exception:
                    pass
            projects.pop(idx)
            db["projects"] = projects
            self._write_db(db)
            return True
        return False

    def create_project(self, ffmpeg_path, video_path, video_name, movie_name, desc, mode="standard", threshold=None):
        import uuid
        project_id = f"lp_{uuid.uuid4().hex[:12]}"
        
        # Determine paths
        v_path = Path(video_path)
        if not v_path.exists():
            raise Exception("本地视频文件不存在")

        db = self._read_db()
        new_proj = {
            "id": project_id,
            "videoName": video_name or v_path.stem,
            "movieName": movie_name or "",
            "desc": desc or "",
            "videoPath": str(v_path),
            "duration": 0,
            "status": "pending",
            "progress": 0,
            "mode": mode,
            "threshold": threshold,
            "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
            "cover": "",
            "shots": []
        }
        db["projects"].append(new_proj)
        self._write_db(db)

        # Trigger background processing
        threading.Thread(
            target=self._process_video_background,
            args=(ffmpeg_path, project_id, mode, threshold),
            daemon=True
        ).start()

        return project_id

    def _process_video_background(self, ffmpeg_path, project_id, mode, custom_threshold=None):
        proj = self.get_detail(project_id)
        if not proj:
            return

        proj_dir = self.lapian_upload_base / project_id
        shots_dir = proj_dir / "shots"
        shots_dir.mkdir(parents=True, exist_ok=True)

        try:
            self._update_progress(project_id, "processing", 10)
            
            # 1. Use ffprobe to get video duration
            import shutil
            # Safe replacement of filename only (case-insensitive for windows)
            ffprobe_path = None
            if ffmpeg_path:
                p_ffmpeg = Path(ffmpeg_path)
                # Check same directory for ffprobe
                suffix = p_ffmpeg.suffix # .exe or empty
                sibling = p_ffmpeg.parent / f"ffprobe{suffix}"
                if sibling.exists():
                    ffprobe_path = str(sibling)
                else:
                    # case-insensitive replace only the filename
                    f_name = p_ffmpeg.name
                    if "ffmpeg" in f_name.lower():
                        new_name = re.sub(r"ffmpeg", "ffprobe", f_name, flags=re.IGNORECASE)
                        sibling2 = p_ffmpeg.parent / new_name
                        if sibling2.exists():
                            ffprobe_path = str(sibling2)

            if not ffprobe_path:
                ffprobe_path = shutil.which("ffprobe") or "ffprobe"

            probe_cmd = [
                ffprobe_path, "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", proj["videoPath"]
            ]
            duration = 0.0
            try:
                dur_res = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=30)
                if dur_res.returncode == 0:
                    try:
                        duration = float(dur_res.stdout.strip())
                    except ValueError:
                        pass
            except Exception:
                pass  # ffprobe missing or failed, duration stays 0, continue anyway
            
            # Save duration
            db = self._read_db()
            for p in db["projects"]:
                if p["id"] == project_id:
                    p["duration"] = int(duration)
            self._write_db(db)

            self._update_progress(project_id, "processing", 25)

            # 2. Scene detection — TransNetV2 ONNX or PySceneDetect
            if mode == "manual":
                # Manual or Single entire video segment mode
                scene_pairs = [(0.0, duration)]
            elif mode == "transnetv2":
                # Map sensitivity thresh (0.12–0.40) to TransNetV2 probability cutoff (0.3–0.6)
                tv2_thresh_map = {'0.40': 0.50, '0.30': 0.45, '0.20': 0.35, '0.12': 0.25}
                tv2_cut_thresh = tv2_thresh_map.get(str(custom_threshold), 0.5)
                scene_pairs = self._detect_transnetv2(proj["videoPath"], cut_threshold=tv2_cut_thresh)
                if not scene_pairs:
                    scene_pairs = [(0.0, duration)]
                if duration == 0.0 and scene_pairs:
                    duration = scene_pairs[-1][1]
            else:
                # Map user-facing threshold (0.12–0.40) to AdaptiveDetector params
                thresh_float = float(custom_threshold) if custom_threshold else (0.30 if mode == "standard" else 0.15)
                if thresh_float >= 0.35:
                    adapt_thresh, min_len = 5.0, 0.8
                elif thresh_float >= 0.25:
                    adapt_thresh, min_len = 3.0, 0.6
                elif thresh_float >= 0.16:
                    adapt_thresh, min_len = 2.0, 0.4
                else:
                    adapt_thresh, min_len = 1.5, 0.3

                from scenedetect import open_video, SceneManager
                from scenedetect.detectors import AdaptiveDetector
                video_sd = open_video(proj["videoPath"])
                sd_manager = SceneManager()
                sd_manager.add_detector(AdaptiveDetector(
                    adaptive_threshold=adapt_thresh,
                    min_scene_len=min_len
                ))
                sd_manager.detect_scenes(video_sd, show_progress=False)
                raw = sd_manager.get_scene_list()
                if not raw:
                    scene_pairs = [(0.0, duration)]
                else:
                    scene_pairs = [
                        (s[0].get_seconds() if s[0] else 0.0,
                         s[1].get_seconds() if s[1] else duration)
                        for s in raw
                    ]
                    if duration == 0.0:
                        duration = scene_pairs[-1][1]

            self._update_progress(project_id, "processing", 50)

            def format_time(seconds):
                m = int(seconds // 60)
                s = int(seconds % 60)
                cs = int((seconds - int(seconds)) * 100)
                return f"{m:02d}:{s:02d}.{cs:02d}"

            # Step 2: extract multiple keyframes per scene
            shots = []
            for idx, (start_sec, end_sec) in enumerate(scene_pairs):

                shot_dur = max(end_sec - start_sec, 0.05)

                # Extract up to 4 keyframes based on shot duration
                # Use 20%-80% range to avoid cut/transition blur at boundaries
                if shot_dur < 0.8:
                    sample_offsets = [0.50]                        # 1 frame (center)
                elif shot_dur < 1.5:
                    sample_offsets = [0.25, 0.75]                  # 2 frames
                elif shot_dur < 5.0:
                    sample_offsets = [0.20, 0.50, 0.80]            # 3 frames
                else:
                    sample_offsets = [0.15, 0.38, 0.62, 0.85]     # 4 frames

                imgs = []
                for k, frac in enumerate(sample_offsets):
                    ts = min(start_sec + shot_dur * frac, end_sec - 0.03)
                    fname = f"shot_{idx + 1:04d}_f{k}.jpg"
                    fpath = shots_dir / fname
                    extract_cmd = [
                        ffmpeg_path, "-y",
                        "-ss", f"{ts:.3f}",
                        "-i", proj["videoPath"],
                        "-vframes", "1", "-q:v", "3",
                        "-vf", "scale=480:-1",
                        str(fpath)
                    ]
                    subprocess.run(extract_cmd, capture_output=True, timeout=30)
                    if fpath.exists():
                        imgs.append(f"/uploads/lapian_projects/{project_id}/shots/{fname}")

                img = imgs[0] if imgs else ""
                shots.append({
                    "id": f"shot_{idx + 1}",
                    "index": idx + 1,
                    "startTime": format_time(start_sec),
                    "endTime": format_time(end_sec),
                    "duration": f"{shot_dur:.1f}s",
                    "img": img,
                    "imgs": imgs,
                    "summary": "",
                    "desc": "",
                    "prompt": "",
                    "status": "pending"
                })

                pct = 50 + int(40 * (idx + 1) / max(len(scene_pairs), 1))
                self._update_progress(project_id, "processing", min(pct, 90))

            # Save shots back to database
            db = self._read_db()
            for p in db["projects"]:
                if p["id"] == project_id:
                    p["shots"] = shots
                    p["status"] = "completed"
                    p["progress"] = 100
                    p["cover"] = shots[0]["img"] if shots else ""
                    break
            self._write_db(db)

        except Exception as e:
            db = self._read_db()
            for p in db["projects"]:
                if p["id"] == project_id:
                    p["status"] = "failed"
                    p["desc"] = f"分镜处理失败: {str(e)}"
                    break
            self._write_db(db)

    def _update_progress(self, project_id, status, progress):
        db = self._read_db()
        for p in db["projects"]:
            if p["id"] == project_id:
                p["status"] = status
                p["progress"] = progress
                break
        self._write_db(db)

    def _detect_transnetv2(self, video_path, cut_threshold=0.5):
        """Detect scene cuts using TransNetV2 ONNX model (official inference logic).
        Returns [(start_sec, end_sec), ...]."""
        import cv2
        import numpy as np
        import onnxruntime as ort

        model_path = Path(__file__).parent / "transnetv2.onnx"
        if not model_path.exists():
            raise FileNotFoundError("transnetv2.onnx not found in studio directory")

        sess = ort.InferenceSession(str(model_path), providers=["CPUExecutionProvider"])
        input_name = sess.get_inputs()[0].name

        cap = cv2.VideoCapture(video_path)
        fps = cap.get(cv2.CAP_PROP_FPS)
        if fps <= 0:
            fps = 25.0
        frames = []
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            frame = cv2.resize(frame, (48, 27))
            frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            frames.append(frame)
        cap.release()

        if not frames:
            return []

        arr   = np.array(frames, dtype=np.uint8)
        total = len(arr)

        # ── Official padding strategy ──────────────────────────────────────
        # Pad start with 25 copies of first frame, end with enough copies of
        # last frame so total padded length is divisible by 50.
        n_pad_start = 25
        n_pad_end   = 25 + 50 - (total % 50 if total % 50 != 0 else 50)
        padded = np.concatenate([
            np.repeat(arr[:1],  n_pad_start, axis=0),
            arr,
            np.repeat(arr[-1:], n_pad_end,   axis=0),
        ], axis=0)

        # ── Sliding window: only use middle [25:75] of each 100-frame window ──
        # Edge frames are context only — this avoids boundary artifacts.
        single_preds = []
        ptr = 0
        while ptr + 100 <= len(padded):
            chunk = padded[ptr:ptr + 100]
            inp   = chunk[np.newaxis].astype(np.float32)
            result = sess.run(None, {input_name: inp})
            # result[0] = single_frame_pred  shape (1, 100, 1)
            # result[1] = all_frame_pred     shape (1, 100, 1)
            single_preds.append(result[0][0, 25:75, 0])   # middle 50 frames only
            ptr += 50

        single_pred = np.concatenate(single_preds)[:total]

        # ── predictions_to_scenes (official logic) ─────────────────────────
        pred_bin = (single_pred > cut_threshold).astype(np.uint8)
        cut_frames = []
        for i in range(1, total):
            if pred_bin[i - 1] == 0 and pred_bin[i] == 1:
                cut_frames.append(i)

        min_scene_frames = max(3, int(fps * 0.15))
        scene_pairs = []
        prev = 0
        for cf in cut_frames:
            if cf - prev >= min_scene_frames:
                scene_pairs.append((prev / fps, cf / fps))
                prev = cf
        scene_pairs.append((prev / fps, total / fps))
        return scene_pairs

    def _parse_time_to_sec(self, ts):
        """Convert MM:SS.cs timecode to float seconds."""
        try:
            m, s_cs = ts.split(':')
            s, cs = s_cs.split('.')
            return int(m) * 60 + int(s) + int(cs) / 100
        except Exception:
            return 0.0

    def _extract_json_payload(self, text):
        """Parse model JSON, tolerating markdown fences or small text wrappers."""
        if not isinstance(text, str):
            return text
        cleaned = re.sub(r"```(?:json)?\s*|\s*```", "", text.strip(), flags=re.IGNORECASE)
        try:
            return json.loads(cleaned)
        except Exception:
            pass

        start_obj = cleaned.find("{")
        start_arr = cleaned.find("[")
        starts = [p for p in (start_obj, start_arr) if p >= 0]
        if not starts:
            raise ValueError("AI response did not contain JSON")
        start = min(starts)
        opener = cleaned[start]
        closer = "}" if opener == "{" else "]"
        end = cleaned.rfind(closer)
        if end <= start:
            raise ValueError("AI response JSON was incomplete")
        return json.loads(cleaned[start:end + 1])

    def _coerce_lapian_analysis(self, raw, shot=None):
        """Normalize custom prompt schemas into the internal single-shot fields."""
        if isinstance(raw, list):
            raw = next((item for item in raw if isinstance(item, dict)), raw)
        if not isinstance(raw, dict):
            return raw

        analysis = dict(raw)
        shot_item = None
        shot_list = analysis.get("镜头列表") or analysis.get("shots") or analysis.get("shotList")
        if isinstance(shot_list, list) and shot_list:
            target_index = None
            try:
                target_index = int((shot or {}).get("index") or 0)
            except Exception:
                target_index = None
            if target_index:
                for item in shot_list:
                    if isinstance(item, dict):
                        try:
                            if int(item.get("镜头号") or item.get("shotIndex") or item.get("index") or 0) == target_index:
                                shot_item = item
                                break
                        except Exception:
                            pass
            if shot_item is None and isinstance(shot_list[0], dict):
                shot_item = shot_list[0]

        visual = analysis.get("视觉设计") if isinstance(analysis.get("视觉设计"), dict) else {}
        photo = analysis.get("整体摄影") if isinstance(analysis.get("整体摄影"), dict) else {}
        src = {}
        src.update(analysis)
        if isinstance(shot_item, dict):
            src.update(shot_item)

        def first_value(*keys):
            for key in keys:
                val = src.get(key)
                if val is None or val == "":
                    continue
                if isinstance(val, (list, tuple)):
                    return "、".join(str(x) for x in val if x)
                return str(val)
            return ""

        def visual_value(*keys):
            for key in keys:
                val = visual.get(key)
                if val:
                    return str(val)
            return ""

        def photo_value(*keys):
            for key in keys:
                val = photo.get(key)
                if val:
                    return str(val)
            return ""

        if not analysis.get("shotSummary"):
            analysis["shotSummary"] = first_value("shotSummary", "summary", "画面描述", "视频故事", "整体提示词")
        if not analysis.get("shotScale"):
            analysis["shotScale"] = first_value("shotScale", "景别")
        if not analysis.get("cameraAngle"):
            analysis["cameraAngle"] = first_value("cameraAngle", "摄影机角度") or photo_value("角度")
        if not analysis.get("cameraMovement"):
            analysis["cameraMovement"] = first_value("cameraMovement", "摄影机运动") or photo_value("运动")

        comp = analysis.get("composition")
        if not isinstance(comp, dict):
            comp = {}
        if not comp.get("sceneAndLayers"):
            scene_bits = [
                visual_value("主体"),
                visual_value("场景"),
                first_value("画面描述"),
            ]
            comp["sceneAndLayers"] = "；".join(x for x in scene_bits if x)
        if not comp.get("compositionalRules"):
            comp["compositionalRules"] = photo_value("镜头", "角度", "焦距与景深") or first_value("焦距与景深")
        analysis["composition"] = comp

        if not analysis.get("colorAnalysis"):
            analysis["colorAnalysis"] = first_value("colorAnalysis", "色彩") or visual_value("色彩")
        if not analysis.get("lighting"):
            analysis["lighting"] = first_value("lighting", "光线") or visual_value("光线")
        if not analysis.get("soundInference"):
            sound_bits = [first_value("背景音乐"), first_value("人声/音效")]
            analysis["soundInference"] = "；".join(x for x in sound_bits if x)
        if not analysis.get("desc"):
            analysis["desc"] = first_value("desc", "叙事内容", "画面描述", "整体提示词")
        if not analysis.get("narrativeFunction"):
            analysis["narrativeFunction"] = first_value("narrativeFunction", "叙事内容", "视频故事")
        if not analysis.get("creativeIntent"):
            analysis["creativeIntent"] = first_value("creativeIntent", "表达情绪")
        if not analysis.get("experienceTransfer"):
            analysis["experienceTransfer"] = first_value("experienceTransfer", "整体风格") or photo_value("镜头", "运动")
        if not analysis.get("aigcPrompt"):
            analysis["aigcPrompt"] = first_value("aigcPrompt", "prompt", "生成提示词", "整体提示词")

        return analysis

    def analyze_shot(self, project_id, shot_id, api_base, api_key, model, custom_prompt="",
                     use_video=False, ffmpeg_path=None, aigc_instruction=""):
        # This will use the visual LLM to analyze the shot's picture/video and return:
        # summary, description, prompt
        proj = self.get_detail(project_id)
        if not proj:
            raise Exception("拉片项目未找到")
        
        shot = None
        for s in proj.get("shots", []):
            if s.get("id") == shot_id:
                shot = s
                break
        
        if not shot:
            raise Exception("镜头未找到")

        import base64
        import tempfile
        import urllib.request as _ur

        is_gemini = "gemini" in model.lower()
        # Native Gemini: googleapis.com base, OR key starts with AIza (Google API key)
        use_native_gemini = "googleapis.com" in api_base or api_key.startswith("AIza")
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        }
        b64_frames = []   # filled by image branch; video branch uses b64_data separately

        # Collect all keyframe paths (new multi-frame shots have 'imgs', older shots only have 'img')
        imgs_rel = shot.get("imgs") or ([shot["img"]] if shot.get("img") else [])
        valid_imgs = [p for p in imgs_rel if p and (self.data_dir / p.lstrip("/")).exists()]
        if not valid_imgs and not (use_video):
            # fallback: single img field
            fallback = self.data_dir / shot.get("img", "").lstrip("/")
            if fallback.exists():
                valid_imgs = [shot["img"]]

        if use_video:
            # ── Video mode: extract clip and send as inline video ──────────────
            if not ffmpeg_path:
                raise Exception("视频分析模式需要 FFmpeg，请先在「设置中心 → 工具依赖」中安装。")

            start_sec = self._parse_time_to_sec(shot.get("startTime", "00:00.00"))
            duration_str = shot.get("duration", "1.0s").replace("s", "")
            try:
                clip_duration = float(duration_str)
            except ValueError:
                clip_duration = 5.0
            clip_duration = max(clip_duration, 0.5)

            tmp_clip = Path(tempfile.gettempdir()) / f"lp_clip_{shot_id}.mp4"
            clip_cmd = [
                ffmpeg_path, "-y",
                "-ss", f"{start_sec:.3f}",
                "-i", proj["videoPath"],
                "-t", f"{clip_duration:.3f}",
                "-c", "copy",
                str(tmp_clip)
            ]
            subprocess.run(clip_cmd, capture_output=True, timeout=60)
            if not tmp_clip.exists():
                raise Exception("视频片段提取失败，请检查 FFmpeg 和视频文件路径。")

            with open(tmp_clip, "rb") as f:
                b64_data = base64.b64encode(f.read()).decode("utf-8")
            try:
                tmp_clip.unlink()
            except Exception:
                pass

            media_mime = "video/mp4"
            prompt_instruction = custom_prompt or (
                "你是一个经验丰富的导演和摄影师，正在做专业拉片分析。\n"
                "请仔细观看这段视频片段（含音轨），用实际看到/听到的内容填写以下字段。\n"
                "核心要求：shotSummary 和 cameraMovement 必须具体描述画面里有什么、摄影机怎么动，不要只写分类标签。"
                "严格以如下 JSON 格式返回，不要包含任何 markdown 标记或前导/后置文本：\n\n"
                "{\n"
                '  "shotSummary": "画面内容描述，200-400字。具体说清楚：画面里有谁/什么，在什么环境，发生了什么事或动作，镜头开始时呈现什么、结束时落在哪里。要让读者闭眼就能在脑海里看见这个镜头，而不是概括叙事功能。",\n'
                '  "shotScale": "景别 + 具体说明画框如何框住主体，如：中景，画框从腰部截断，人物占画面左三分之一，右侧留出走廊纵深",\n'
                '  "cameraAngle": "拍摄角度 + 说明视角与主体的位置关系，如：略低角度仰拍，镜头在腰部高度向上看向站立的人物",\n'
                '  "cameraMovement": "摄影机运动的具体过程，100-150字。描述镜头从哪个位置/焦距开始，如何移动（推/拉/横移/跟随/手持晃动等），速度快慢，最终停在哪里，运动过程中画面内容如何变化。不要只写运镜类型名称。",\n'
                '  "composition": {\n'
                '    "sceneAndLayers": "场景与层次，80-150字，描述拍摄的具体空间环境，前景有什么、中景主体是什么、背景有什么，纵深关系如何",\n'
                '    "compositionalRules": "构图手法，80-150字，分析画面的视觉重心在哪、用了什么构图方式、视线如何被引导"\n'
                '  },\n'
                '  "colorAnalysis": "色调倾向，50-100字，主色调、饱和度、色温风格与画面情绪",\n'
                '  "lighting": "光影，50-100字，光源方向与性质、软硬程度、明暗对比、在画面上造成的效果",\n'
                '  "soundInference": "声音，80-150字，基于实际音频：背景音乐的风格与情绪、环境音效的具体内容、对白的关键内容或情绪",\n'
                '  "desc": "视听综合，150-250字。像一个摄影师旁白一样，连贯地描述这个镜头的视听体验：画面在讲什么、摄影机怎么表达、声音怎么配合，读完像亲眼看过这个镜头",\n'
                '  "narrativeFunction": "叙事功能，100-200字，这个镜头在整体故事/片段中起什么作用",\n'
                '  "creativeIntent": "创作意图，100-150字，导演/摄影师为什么这样拍，这个选择传达了什么",\n'
                '  "experienceTransfer": "经验迁移，80-150字，从这个镜头能学到什么拍摄手法，适合在什么场景复用",\n'
                + (f'  "aigcPrompt": "{aigc_instruction}"\n' if aigc_instruction else
                '  "aigcPrompt": "AIGC英文提示词，80-150 words，直接描述这个镜头的视觉内容和摄影方式，可直接用于 Sora/FLUX/Midjourney 生成同类镜头"\n')
                + "}"
            )
        else:
            # ── Image mode: load all keyframes as JPEG ────────────────────────
            if not valid_imgs:
                raise Exception("关键帧图片不存在，无法分析")
            b64_frames = []
            for rel in valid_imgs:
                with open(self.data_dir / rel.lstrip("/"), "rb") as f:
                    b64_frames.append(base64.b64encode(f.read()).decode("utf-8"))
            media_mime = "image/jpeg"
            n_frames = len(b64_frames)
            frame_note = f"以下 {n_frames} 张关键帧按时间顺序均匀采样自同一个镜头（时长 {shot.get('duration','?')}），请综合所有帧分析整体运镜与画面变化。\n" if n_frames > 1 else ""
            prompt_instruction = custom_prompt or (
                "你是一个经验丰富的导演和摄影师，正在做专业拉片分析。\n"
                + frame_note +
                "请仔细观察这些关键帧，用实际看到的内容填写以下字段。\n"
                "核心要求：shotSummary 和 cameraMovement 必须具体描述画面里有什么、摄影机怎么构图，不要只写分类标签。"
                "严格以如下 JSON 格式返回，不要包含任何 markdown 标记或前导/后置文本：\n\n"
                "{\n"
                '  "shotSummary": "画面内容描述，200-400字。具体说清楚：画面里有谁/什么，在什么环境，发生了什么事或动作，画框里的视觉重心在哪。要让读者闭眼就能在脑海里看见这个镜头，而不是概括叙事功能。",\n'
                '  "shotScale": "景别 + 具体说明画框如何框住主体，如：中景，画框从腰部截断，人物占画面左三分之一，右侧留出走廊纵深",\n'
                '  "cameraAngle": "拍摄角度 + 说明视角与主体的位置关系，如：略低角度仰拍，镜头在腰部高度向上看向站立的人物",\n'
                '  "cameraMovement": "根据关键帧之间的变化推断摄影机运动，100-150字。描述镜头可能从哪个位置/焦距开始，如何移动，速度快慢，最终停在哪里，运动过程中画面内容如何变化。不要只写运镜类型名称。",\n'
                '  "composition": {\n'
                '    "sceneAndLayers": "场景与层次，80-150字，描述拍摄的具体空间环境，前景有什么、中景主体是什么、背景有什么，纵深关系如何",\n'
                '    "compositionalRules": "构图手法，80-150字，画面的视觉重心在哪、用了什么构图方式、视线如何被引导"\n'
                '  },\n'
                '  "colorAnalysis": "色调倾向，50-100字，主色调、饱和度、色温风格与画面情绪",\n'
                '  "lighting": "光影，50-100字，光源方向与性质、软硬程度、明暗对比、在画面上造成的效果",\n'
                '  "soundInference": "声音推断，50-100字，根据画面内容推断可能的背景音乐风格、环境音效、对白氛围",\n'
                '  "desc": "视听综合，150-250字。像一个摄影师旁白一样，连贯地描述这个镜头的视听体验：画面在讲什么、摄影机怎么表达、读完像亲眼看过这个镜头",\n'
                '  "narrativeFunction": "叙事功能，100-200字，这个镜头在整体故事/片段中起什么作用",\n'
                '  "creativeIntent": "创作意图，100-150字，导演/摄影师为什么这样拍，这个选择传达了什么",\n'
                '  "experienceTransfer": "经验迁移，80-150字，从这个镜头能学到什么拍摄手法，适合在什么场景复用",\n'
                '  "aigcPrompt": "AIGC英文提示词，80-150 words，直接描述这个镜头的视觉内容和摄影方式，可直接用于 Sora/FLUX/Midjourney 生成同类镜头"\n'
                "}"
            )

        # Always inject aigc_instruction into the aigcPrompt field regardless of custom_prompt
        if aigc_instruction:
            import re as _re
            safe = aigc_instruction.replace('"', "'")
            prompt_instruction = _re.sub(
                r'"aigcPrompt"\s*:\s*"[^"]*"',
                f'"aigcPrompt": "{safe}"',
                prompt_instruction
            )

        if use_native_gemini:
            # Official Google Gemini API (no Bearer, uses ?key=)
            url = f"{api_base}/models/{model}:generateContent?key={api_key}"
            req_headers = {"Content-Type": "application/json"}
            parts = [{"text": prompt_instruction}]
            if use_video:
                parts.append({"inlineData": {"mimeType": media_mime, "data": b64_data}})
            else:
                for b64 in b64_frames:
                    parts.append({"inlineData": {"mimeType": media_mime, "data": b64}})
            payload = {
                "contents": [{"parts": parts}],
                "generationConfig": {"responseMimeType": "application/json"}
            }
        else:
            # OpenAI / standard vision structure
            url = f"{api_base}/chat/completions"
            req_headers = headers
            content = [{"type": "text", "text": prompt_instruction}]
            if use_video:
                content.append({
                    "type": "image_url",
                    "image_url": {"url": f"data:{media_mime};base64,{b64_data}"}
                })
            else:
                for b64 in b64_frames:
                    content.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:{media_mime};base64,{b64}"}
                    })
            payload = {
                "model": model,
                "messages": [{"role": "user", "content": content}],
                "response_format": {"type": "json_object"},
                "temperature": 0.2
            }

        api_timeout = 300 if use_video else 120
        req = _ur.Request(url, data=json.dumps(payload).encode("utf-8"), headers=req_headers, method="POST")
        try:
            with _ur.urlopen(req, timeout=api_timeout) as r:
                resp = json.loads(r.read().decode("utf-8"))
            
            if use_native_gemini:
                text_res = resp["candidates"][0]["content"]["parts"][0]["text"]
            else:
                text_res = resp["choices"][0]["message"]["content"]

            raw_analysis = self._extract_json_payload(text_res)
            analysis = self._coerce_lapian_analysis(raw_analysis, shot)

            # Update database
            db = self._read_db()
            for p in db["projects"]:
                if p["id"] == project_id:
                    for s in p["shots"]:
                        if s["id"] == shot_id:
                            s["summary"] = analysis.get("shotSummary", analysis.get("summary", ""))
                            s["shotScale"] = analysis.get("shotScale", "")
                            s["cameraAngle"] = analysis.get("cameraAngle", "")
                            s["cameraMovement"] = analysis.get("cameraMovement", "")
                            comp = analysis.get("composition", {})
                            if isinstance(comp, dict):
                                s["sceneAndLayers"] = comp.get("sceneAndLayers", "")
                                s["compositionalRules"] = comp.get("compositionalRules", "")
                                s["composition"] = comp.get("sceneAndLayers", "")  # fallback
                            else:
                                s["composition"] = str(comp)
                                s["sceneAndLayers"] = ""
                                s["compositionalRules"] = ""
                            s["colorAnalysis"] = analysis.get("colorAnalysis", "")
                            s["lighting"] = analysis.get("lighting", "")
                            s["colorAndLighting"] = analysis.get("colorAnalysis", "") or analysis.get("colorAndLighting", "")
                            s["soundInference"] = analysis.get("soundInference", "")
                            s["desc"] = analysis.get("desc", "")
                            s["narrativeFunction"] = analysis.get("narrativeFunction", "")
                            s["creativeIntent"] = analysis.get("creativeIntent", "")
                            s["experienceTransfer"] = analysis.get("experienceTransfer", "")
                            s["prompt"] = analysis.get("aigcPrompt", analysis.get("prompt", ""))
                            s["rawAnalysis"] = raw_analysis
                            try:
                                s["analysisJson"] = json.dumps(raw_analysis, ensure_ascii=False, indent=2)
                            except Exception:
                                s["analysisJson"] = str(raw_analysis)
                            s["analysisMode"] = "video" if use_video else "image"
                            s["status"] = "completed"
                            break
            self._write_db(db)
            return {"ok": True, "analysis": analysis, "rawAnalysis": raw_analysis}

        except Exception as e:
            return {"ok": False, "error": f"AI 分析接口报错: {str(e)}"}

    # ── T23: Shot editing ────────────────────────────────────────────────────

    def delete_shot(self, project_id, shot_id):
        """Delete a single shot and clean up its keyframe files."""
        db = self._read_db()
        for p in db["projects"]:
            if p["id"] == project_id:
                shots = p.get("shots", [])
                target = next((s for s in shots if s["id"] == shot_id), None)
                if not target:
                    return {"ok": False, "error": "镜头不存在"}
                # Remove keyframe files
                proj_dir = self.lapian_upload_base / project_id / "shots"
                for img in (target.get("imgs") or ([] if not target.get("img") else [target["img"]])):
                    try:
                        fp = self.data_dir / img.lstrip("/")
                        if fp.exists():
                            fp.unlink()
                    except Exception:
                        pass
                p["shots"] = [s for s in shots if s["id"] != shot_id]
                # Re-number indices
                for i, s in enumerate(p["shots"]):
                    s["index"] = i + 1
                self._write_db(db)
                return {"ok": True}
        return {"ok": False, "error": "项目不存在"}

    def split_shot(self, project_id, shot_id, split_sec, ffmpeg_path):
        """Split a shot at split_sec into two shots, re-extract keyframes."""
        import uuid
        db = self._read_db()
        for p in db["projects"]:
            if p["id"] != project_id:
                continue
            shots = p.get("shots", [])
            idx = next((i for i, s in enumerate(shots) if s["id"] == shot_id), None)
            if idx is None:
                return {"ok": False, "error": "镜头不存在"}
            orig = shots[idx]

            def _parse_sec(t):
                if not t:
                    return 0.0
                parts = str(t).split(".")
                hms = parts[0].split(":")
                secs = float(hms[-1]) if hms else 0
                mins = float(hms[-2]) if len(hms) >= 2 else 0
                cs = float("0." + parts[1]) if len(parts) > 1 else 0
                return mins * 60 + secs + cs

            def _fmt_time(sec):
                m = int(sec // 60)
                s = sec - m * 60
                return f"{m:02d}:{s:05.2f}"

            start_sec = _parse_sec(orig.get("startTime", "00:00.00"))
            end_sec = _parse_sec(orig.get("endTime", "00:00.00"))

            if split_sec <= start_sec or split_sec >= end_sec:
                return {"ok": False, "error": f"拆分点 {split_sec:.2f}s 超出镜头范围 [{start_sec:.2f}, {end_sec:.2f}]"}

            shots_dir = self.lapian_upload_base / project_id / "shots"
            shots_dir.mkdir(parents=True, exist_ok=True)
            video_path = p.get("videoPath", "")

            def _extract_frames(new_id, t_start, t_end):
                dur = max(t_end - t_start, 0.05)
                if dur < 0.8:
                    offsets = [0.50]
                elif dur < 1.5:
                    offsets = [0.25, 0.75]
                elif dur < 5.0:
                    offsets = [0.20, 0.50, 0.80]
                else:
                    offsets = [0.15, 0.38, 0.62, 0.85]
                imgs = []
                for k, frac in enumerate(offsets):
                    ts = min(t_start + dur * frac, t_end - 0.03)
                    fname = f"{new_id}_f{k}.jpg"
                    fpath = shots_dir / fname
                    cmd = [ffmpeg_path, "-y", "-ss", f"{ts:.3f}", "-i", video_path,
                           "-vframes", "1", "-q:v", "3", "-vf", "scale=640:-2", str(fpath)]
                    try:
                        subprocess.run(cmd, capture_output=True, timeout=30)
                    except Exception:
                        pass
                    rel = f"/uploads/lapian_projects/{project_id}/shots/{fname}"
                    imgs.append(rel)
                return imgs

            new_id_a = f"s_{uuid.uuid4().hex[:8]}"
            new_id_b = f"s_{uuid.uuid4().hex[:8]}"

            imgs_a = _extract_frames(new_id_a, start_sec, split_sec)
            imgs_b = _extract_frames(new_id_b, split_sec, end_sec)

            dur_a = split_sec - start_sec
            dur_b = end_sec - split_sec

            shot_a = dict(orig)
            shot_a.update({
                "id": new_id_a, "endTime": _fmt_time(split_sec),
                "duration": f"{dur_a:.2f}s", "imgs": imgs_a,
                "img": imgs_a[0] if imgs_a else orig.get("img", ""),
                "status": "pending", "summary": "", "prompt": "",
            })
            shot_b = {
                "id": new_id_b, "index": orig["index"] + 1,
                "startTime": _fmt_time(split_sec), "endTime": orig.get("endTime"),
                "duration": f"{dur_b:.2f}s", "imgs": imgs_b,
                "img": imgs_b[0] if imgs_b else "",
                "status": "pending", "summary": "", "prompt": "",
            }

            shots[idx] = shot_a
            shots.insert(idx + 1, shot_b)
            for i, s in enumerate(shots):
                s["index"] = i + 1
            p["shots"] = shots
            self._write_db(db)
            return {"ok": True, "shotA": shot_a["id"], "shotB": shot_b["id"]}
        return {"ok": False, "error": "项目不存在"}

    def merge_shots(self, project_id, shot_ids, ffmpeg_path):
        """Merge a list of shot_ids (must be adjacent) into one shot."""
        import uuid
        db = self._read_db()
        for p in db["projects"]:
            if p["id"] != project_id:
                continue
            shots = p.get("shots", [])
            indices = []
            for sid in shot_ids:
                i = next((j for j, s in enumerate(shots) if s["id"] == sid), None)
                if i is None:
                    return {"ok": False, "error": f"镜头 {sid} 不存在"}
                indices.append(i)
            indices.sort()
            for a, b in zip(indices, indices[1:]):
                if b != a + 1:
                    return {"ok": False, "error": "只能合并相邻镜头"}

            first = shots[indices[0]]
            last = shots[indices[-1]]
            new_id = f"s_{uuid.uuid4().hex[:8]}"
            shots_dir = self.lapian_upload_base / project_id / "shots"
            shots_dir.mkdir(parents=True, exist_ok=True)
            video_path = p.get("videoPath", "")

            def _parse_sec(t):
                if not t:
                    return 0.0
                parts = str(t).split(".")
                hms = parts[0].split(":")
                secs = float(hms[-1]) if hms else 0
                mins = float(hms[-2]) if len(hms) >= 2 else 0
                cs = float("0." + parts[1]) if len(parts) > 1 else 0
                return mins * 60 + secs + cs

            t_start = _parse_sec(first.get("startTime", "00:00.00"))
            t_end = _parse_sec(last.get("endTime", "00:00.00"))
            dur = max(t_end - t_start, 0.05)

            if dur < 0.8:
                offsets = [0.05]
            elif dur < 1.5:
                offsets = [0.05, 0.95]
            elif dur < 5.0:
                offsets = [0.05, 0.50, 0.95]
            else:
                offsets = [0.05, 0.35, 0.65, 0.95]

            imgs = []
            for k, frac in enumerate(offsets):
                ts = min(t_start + dur * frac, t_end - 0.03)
                fname = f"{new_id}_f{k}.jpg"
                fpath = shots_dir / fname
                cmd = [ffmpeg_path, "-y", "-ss", f"{ts:.3f}", "-i", video_path,
                       "-vframes", "1", "-q:v", "3", "-vf", "scale=640:-2", str(fpath)]
                try:
                    subprocess.run(cmd, capture_output=True, timeout=30)
                except Exception:
                    pass
                imgs.append(f"/uploads/lapian_projects/{project_id}/shots/{fname}")

            merged = {
                "id": new_id, "index": first["index"],
                "startTime": first.get("startTime"), "endTime": last.get("endTime"),
                "duration": f"{dur:.2f}s", "imgs": imgs,
                "img": imgs[0] if imgs else "", "status": "pending",
                "summary": "", "prompt": "",
            }
            new_shots = [s for i, s in enumerate(shots) if i not in indices]
            new_shots.insert(indices[0], merged)
            for i, s in enumerate(new_shots):
                s["index"] = i + 1
            p["shots"] = new_shots
            self._write_db(db)
            return {"ok": True, "mergedId": new_id}
        return {"ok": False, "error": "项目不存在"}

    # ── T26: Edit shot description ───────────────────────────────────────────

    def update_shot_description(self, project_id, shot_id, description):
        db = self._read_db()
        for p in db["projects"]:
            if p["id"] == project_id:
                for s in p.get("shots", []):
                    if s["id"] == shot_id:
                        s["description"] = description
                        self._write_db(db)
                        return {"ok": True}
                return {"ok": False, "error": "镜头不存在"}
        return {"ok": False, "error": "项目不存在"}

    # ── T21-T22: Shot chat ───────────────────────────────────────────────────

    def shot_chat(self, project_id, shot_id, message, history, api_base, api_key, model):
        """Multi-turn chat about a specific shot using its keyframes + analysis as context."""
        import urllib.request as _ur
        db = self._read_db()
        proj = next((p for p in db["projects"] if p["id"] == project_id), None)
        if not proj:
            return {"ok": False, "error": "项目不存在"}
        shot = next((s for s in proj.get("shots", []) if s["id"] == shot_id), None)
        if not shot:
            return {"ok": False, "error": "镜头不存在"}

        # Build system context
        analysis_ctx = ""
        for field, label in [
            ("summary", "镜头摘要"), ("shotScale", "景别"), ("cameraAngle", "角度"),
            ("cameraMovement", "运镜"), ("sceneAndLayers", "场景层次"),
            ("compositionalRules", "构图规则"), ("colorAnalysis", "色调"),
            ("lighting", "光影"), ("soundInference", "声音"),
            ("desc", "视听综合"), ("narrativeFunction", "叙事功能"),
            ("creativeIntent", "创作意图"), ("experienceTransfer", "经验迁移"),
            ("prompt", "AIGC提示词"),
        ]:
            val = shot.get(field, "")
            if val:
                analysis_ctx += f"【{label}】{val}\n"

        system_msg = (
            "你是一位电影学院级视听语言分析专家，正在回答关于以下镜头的问题。\n"
            "以下是该镜头的已有分析内容，请结合画面关键帧和这些分析回答用户问题：\n\n"
            + analysis_ctx
        )

        # Load keyframe images
        imgs = shot.get("imgs") or ([shot["img"]] if shot.get("img") else [])
        b64_frames = []
        for rel in imgs[:4]:
            try:
                fp = self.data_dir / rel.lstrip("/")
                if fp.exists():
                    import base64
                    b64_frames.append(base64.b64encode(fp.read_bytes()).decode())
            except Exception:
                pass

        # Build messages
        messages = [{"role": "system", "content": system_msg}]
        for turn in (history or []):
            messages.append({"role": turn.get("role", "user"), "content": turn.get("content", "")})

        # Current user message with images
        user_content = []
        for b64 in b64_frames:
            user_content.append({"type": "image_url", "image_url": {"url": f"data:image/jpeg;base64,{b64}"}})
        user_content.append({"type": "text", "text": message})
        messages.append({"role": "user", "content": user_content})

        headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
        payload = {"model": model, "messages": messages, "temperature": 0.7, "max_tokens": 1000}
        url = f"{api_base.rstrip('/')}/chat/completions"

        try:
            req = _ur.Request(url, data=json.dumps(payload).encode(), headers=headers, method="POST")
            with _ur.urlopen(req, timeout=60) as r:
                resp = json.loads(r.read().decode())
            reply = resp["choices"][0]["message"]["content"]
            return {"ok": True, "reply": reply}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ── T28: Export report ───────────────────────────────────────────────────

    def export_report(self, project_id, fmt="json"):
        """Export project as markdown, csv, or json."""
        proj = self.get_detail(project_id)
        if not proj:
            return {"ok": False, "error": "项目不存在"}

        shots = proj.get("shots", [])
        name_safe = re.sub(r'[\\/*?:"<>|]', "_", proj.get("videoName", "lapian"))

        if fmt == "json":
            content = json.dumps(proj, ensure_ascii=False, indent=2)
            filename = f"{name_safe}.json"
            mime = "application/json"

        elif fmt == "csv":
            import io, csv as _csv
            buf = io.StringIO()
            writer = _csv.writer(buf)
            writer.writerow(["镜号", "起始时间", "结束时间", "时长", "景别", "角度", "运镜",
                             "场景层次", "构图规则", "色调", "光影", "声音推断",
                             "叙事功能", "创作意图", "经验迁移", "视听综合", "AIGC提示词"])
            for s in shots:
                writer.writerow([
                    s.get("index", ""), s.get("startTime", ""), s.get("endTime", ""),
                    s.get("duration", ""), s.get("shotScale", ""), s.get("cameraAngle", ""),
                    s.get("cameraMovement", ""), s.get("sceneAndLayers", ""),
                    s.get("compositionalRules", ""), s.get("colorAnalysis", ""),
                    s.get("lighting", ""), s.get("soundInference", ""),
                    s.get("narrativeFunction", ""), s.get("creativeIntent", ""),
                    s.get("experienceTransfer", ""), s.get("desc", ""), s.get("prompt", ""),
                ])
            content = "\ufeff" + buf.getvalue()  # BOM for Excel
            filename = f"{name_safe}.csv"
            mime = "text/csv"

        elif fmt == "md":
            lines = [
                f"# {proj.get('videoName', '')}",
                f"> 来自：{proj.get('movieName', '')}  ",
                f"> 总镜头数：{len(shots)}  时长：{proj.get('duration', 0):.0f}s\n",
            ]
            for s in shots:
                lines.append(f"## 镜头 {s.get('index')}  `{s.get('startTime')} → {s.get('endTime')}` ({s.get('duration')})")
                if s.get("summary"):
                    lines.append(f"\n{s['summary']}\n")
                lines.append("### 视听分析")
                for field, label in [
                    ("shotScale", "景别"), ("cameraAngle", "角度"), ("cameraMovement", "运镜"),
                    ("sceneAndLayers", "场景与层次"), ("compositionalRules", "构图规则"),
                    ("colorAnalysis", "色调倾向"), ("lighting", "光影"),
                    ("soundInference", "声音推断"), ("desc", "视听综合"),
                    ("narrativeFunction", "叙事功能"), ("creativeIntent", "创作意图"),
                    ("experienceTransfer", "经验迁移"),
                ]:
                    if s.get(field):
                        lines.append(f"- **{label}**：{s[field]}")
                if s.get("prompt"):
                    lines.append(f"\n### 🔥 AIGC 提示词\n```\n{s['prompt']}\n```")
                lines.append("\n---\n")
            content = "\n".join(lines)
            filename = f"{name_safe}.md"
            mime = "text/markdown"
        elif fmt == "image":
            return self._export_image_strip(proj, shots, name_safe)
        else:
            return {"ok": False, "error": f"不支持的格式: {fmt}"}

        return {"ok": True, "content": content, "filename": filename, "mime": mime}

    def _export_image_strip(self, proj, shots, name_safe):
        """T29: Export tall PNG image strip using Pillow."""
        try:
            from PIL import Image, ImageDraw, ImageFont
        except ImportError:
            return {"ok": False, "error": "导出图片长图需要 Pillow 库，请运行: pip install Pillow"}

        W = 880
        CARD_H = 260
        PAD = 20
        THUMB_W = 220
        THUMB_H = 140
        BG = (18, 18, 22)
        CARD_BG = (30, 30, 38)
        BORDER = (55, 55, 70)
        TEXT_PRI = (230, 230, 235)
        TEXT_SEC = (145, 145, 165)
        ACCENT = (99, 102, 241)
        DONE_COL = (34, 197, 94)
        PENDING_COL = (100, 100, 120)

        try:
            font_title = ImageFont.truetype("arial.ttf", 14)
            font_body  = ImageFont.truetype("arial.ttf", 11)
            font_small = ImageFont.truetype("arial.ttf", 9)
        except Exception:
            font_title = ImageFont.load_default()
            font_body  = font_title
            font_small = font_title

        HEADER_H = 80
        total_h = HEADER_H + len(shots) * (CARD_H + PAD) + PAD

        img = Image.new("RGB", (W, total_h), BG)
        d = ImageDraw.Draw(img)

        # Header
        title = proj.get("videoName", "拉片报告")
        movie = proj.get("movieName", "")
        done_cnt = sum(1 for s in shots if s.get("status") == "completed")
        d.rectangle([0, 0, W, HEADER_H], fill=(25, 25, 35))
        d.text((PAD, 14), title, fill=TEXT_PRI, font=font_title)
        d.text((PAD, 34), f"来自：{movie}  共 {len(shots)} 镜头  已分析 {done_cnt}", fill=TEXT_SEC, font=font_body)

        # Timeline bar
        tl_y = 56
        tl_h = 10
        total_dur = sum(float(str(s.get("duration", "1")).rstrip("s")) for s in shots) or 1
        x = PAD
        tl_w_total = W - PAD * 2
        for s in shots:
            dur = float(str(s.get("duration", "1")).rstrip("s"))
            w = max(2, int(tl_w_total * dur / total_dur))
            col = DONE_COL if s.get("status") == "completed" else PENDING_COL
            d.rectangle([x, tl_y, x + w - 1, tl_y + tl_h], fill=col)
            x += w

        # Cards
        for i, s in enumerate(shots):
            cy = HEADER_H + i * (CARD_H + PAD) + PAD
            r = 8
            d.rounded_rectangle([PAD, cy, W - PAD, cy + CARD_H], radius=r, fill=CARD_BG, outline=BORDER)
            is_done = s.get("status") == "completed"
            status_col = DONE_COL if is_done else PENDING_COL
            d.rectangle([PAD, cy + 2, PAD + 4, cy + CARD_H - 2], fill=status_col)

            # Thumbnail
            frames = s.get("imgs") or ([s["img"]] if s.get("img") else [])
            tx = PAD + 10 + 4
            if frames:
                try:
                    thumb = Image.open(frames[0]).convert("RGB")
                    thumb.thumbnail((THUMB_W, THUMB_H))
                    paste_y = cy + (CARD_H - THUMB_H) // 2
                    img.paste(thumb, (tx, paste_y))
                    d.rectangle([tx, paste_y, tx + thumb.width - 1, paste_y + thumb.height - 1], outline=BORDER)
                except Exception:
                    d.rectangle([tx, cy + 15, tx + THUMB_W, cy + 15 + THUMB_H], fill=(40, 40, 50), outline=BORDER)
            else:
                d.rectangle([tx, cy + 15, tx + THUMB_W, cy + 15 + THUMB_H], fill=(40, 40, 50), outline=BORDER)

            # Shot info (right column)
            rx = tx + THUMB_W + 12
            rw = W - PAD - rx - 10
            ry = cy + 12

            idx_txt = f"#{s.get('index', i+1)}"
            d.text((rx, ry), idx_txt, fill=ACCENT, font=font_title)
            d.text((rx + 30, ry), f"{s.get('startTime','')} → {s.get('endTime','')}  ({s.get('duration','')})", fill=TEXT_SEC, font=font_body)
            ry += 20

            if s.get("summary"):
                self._draw_wrapped(d, s["summary"][:120], rx, ry, rw, font_body, TEXT_PRI)
                ry += 40

            for field, label in [("shotScale","景别"),("cameraMovement","运镜"),("colorAnalysis","色调"),("lighting","光影")]:
                if s.get(field):
                    txt = f"{label}：{s[field][:45]}"
                    d.text((rx, ry), txt, fill=TEXT_SEC, font=font_small)
                    ry += 14
                    if ry > cy + CARD_H - 14:
                        break

            if s.get("prompt") and ry < cy + CARD_H - 20:
                prompt_preview = s["prompt"][:80] + ("…" if len(s["prompt"]) > 80 else "")
                self._draw_wrapped(d, prompt_preview, rx, ry, rw, font_small, (180, 140, 100))

        buf = io.BytesIO()
        img.save(buf, format="PNG", optimize=True)
        filename = f"{name_safe}_lapian.png"
        return {"ok": True, "content": buf.getvalue(), "filename": filename, "mime": "image/png"}

    def _draw_wrapped(self, draw, text, x, y, max_w, font, color, line_h=15):
        words = text.split()
        line = ""
        for w in words:
            test = (line + " " + w).strip()
            try:
                tw = font.getlength(test)
            except Exception:
                tw = len(test) * 7
            if tw <= max_w:
                line = test
            else:
                if line:
                    draw.text((x, y), line, fill=color, font=font)
                    y += line_h
                line = w
        if line:
            draw.text((x, y), line, fill=color, font=font)

    # ── Manual frame capture ──────────────────────────────────────────────────

    def capture_custom_frame(self, project_id, shot_id, frame_data_b64, replace_index=None):
        """Save a base64-encoded JPEG as a custom keyframe for a shot.
        replace_index: int index into shot.imgs to replace, or None to append."""
        import base64, uuid
        db = self._read_db()
        for p in db["projects"]:
            if p["id"] != project_id:
                continue
            shots = p.get("shots", [])
            shot = next((s for s in shots if s["id"] == shot_id), None)
            if not shot:
                return {"ok": False, "error": "镜头不存在"}

            shots_dir = self.lapian_upload_base / project_id / "shots"
            shots_dir.mkdir(parents=True, exist_ok=True)

            fname = f"custom_{uuid.uuid4().hex[:8]}.jpg"
            fpath = shots_dir / fname
            try:
                raw = frame_data_b64
                if "," in raw:
                    raw = raw.split(",", 1)[1]
                fpath.write_bytes(base64.b64decode(raw))
            except Exception as e:
                return {"ok": False, "error": f"解码失败: {e}"}

            rel = f"/uploads/lapian_projects/{project_id}/shots/{fname}"
            imgs = shot.get("imgs") or ([shot["img"]] if shot.get("img") else [])

            if replace_index is not None and 0 <= replace_index < len(imgs):
                imgs[replace_index] = rel
            else:
                imgs.append(rel)

            shot["imgs"] = imgs
            shot["img"] = imgs[0]
            self._write_db(db)
            return {"ok": True, "imgs": imgs, "added": rel}
        return {"ok": False, "error": "项目不存在"}

    # ── T32-T33: Download video from URL ─────────────────────────────────────

    def download_video_url(self, url, video_name, movie_name, desc, mode, ffmpeg_path):
        """Download video from URL using yt-dlp then create a project."""
        import uuid, shutil
        dl_id = f"dl_{uuid.uuid4().hex[:8]}"
        dl_dir = self.lapian_upload_base / dl_id
        dl_dir.mkdir(parents=True, exist_ok=True)

        # Attempt yt-dlp download
        ytdlp = shutil.which("yt-dlp") or shutil.which("yt_dlp")
        if not ytdlp:
            # Try common install locations
            for p in ["yt-dlp", "yt_dlp", "python -m yt_dlp"]:
                try:
                    subprocess.run([p, "--version"], capture_output=True, timeout=5)
                    ytdlp = p
                    break
                except Exception:
                    pass
        if not ytdlp:
            import shutil as _sh
            shutil.rmtree(dl_dir, ignore_errors=True)
            return {"ok": False, "error": "未找到 yt-dlp，请先运行 pip install yt-dlp 安装"}

        out_template = str(dl_dir / "%(title)s.%(ext)s")
        cmd = [ytdlp, "-f", "bestvideo[ext=mp4]+bestaudio[ext=m4a]/mp4",
               "--merge-output-format", "mp4", "-o", out_template, url]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
        except subprocess.TimeoutExpired:
            return {"ok": False, "error": "下载超时（5分钟），请检查网络或视频链接"}
        except Exception as e:
            return {"ok": False, "error": f"yt-dlp 执行失败: {e}"}

        if result.returncode != 0:
            return {"ok": False, "error": f"yt-dlp 下载失败: {result.stderr[-500:]}"}

        # Find downloaded file
        mp4s = list(dl_dir.glob("*.mp4"))
        if not mp4s:
            mp4s = list(dl_dir.glob("*.*"))
        if not mp4s:
            return {"ok": False, "error": "下载完成但未找到视频文件"}

        video_path = str(mp4s[0])
        detected_name = video_name or mp4s[0].stem

        try:
            proj_id = self.create_project(ffmpeg_path, video_path, detected_name, movie_name, desc, mode)
            return {"ok": True, "projectId": proj_id}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    # ── T40: Bulk update and edit of shots range ─────────────────────────────────

    def update_bulk_shots(self, project_id, new_shots_input, ffmpeg_path):
        """
        Receives an array of custom shots. For each shot, if the time range changed
        (or it is a completely new manual shot), re-extract frames with FFmpeg,
        otherwise keep existing. Properly updates indexes, durations and file paths.
        """
        import uuid
        db = self._read_db()
        proj = None
        for p in db["projects"]:
            if p["id"] == project_id:
                proj = p
                break
        if not proj:
            return {"ok": False, "error": "项目不存在"}

        video_path = proj.get("videoPath", "")
        shots_dir = self.lapian_upload_base / project_id / "shots"
        shots_dir.mkdir(parents=True, exist_ok=True)

        def _parse_sec(t):
            if not t:
                return 0.0
            parts = str(t).split(".")
            hms = parts[0].split(":")
            secs = float(hms[-1]) if hms else 0
            mins = float(hms[-2]) if len(hms) >= 2 else 0
            cs = float("0." + parts[1]) if len(parts) > 1 else 0
            return mins * 60 + secs + cs

        def _fmt_time(sec):
            m = int(sec // 60)
            s = sec - m * 60
            return f"{m:02d}:{s:05.2f}"

        # Helper to extract keyframes
        def _extract_frames_for_range(t_start, t_end, shot_id):
            dur = max(t_end - t_start, 0.05)
            if dur < 0.8:
                offsets = [0.50]
            elif dur < 1.5:
                offsets = [0.25, 0.75]
            elif dur < 5.0:
                offsets = [0.20, 0.50, 0.80]
            else:
                offsets = [0.15, 0.38, 0.62, 0.85]
            imgs = []
            for k, frac in enumerate(offsets):
                ts = min(t_start + dur * frac, t_end - 0.03)
                fname = f"bulk_{shot_id}_f{k}.jpg"
                fpath = shots_dir / fname
                cmd = [ffmpeg_path, "-y", "-ss", f"{ts:.3f}", "-i", video_path,
                       "-vframes", "1", "-q:v", "3", "-vf", "scale=640:-2", str(fpath)]
                try:
                    subprocess.run(cmd, capture_output=True, timeout=30)
                except Exception:
                    pass
                if fpath.exists():
                    rel = f"/uploads/lapian_projects/{project_id}/shots/{fname}"
                    imgs.append(rel)
            return imgs

        old_shots = proj.get("shots", [])
        old_by_id = {s["id"]: s for s in old_shots}

        updated_shots = []
        for i, s_in in enumerate(new_shots_input):
            s_id = s_in.get("id")
            # If id starts with 'new_' or does not exist, treat as newly created
            is_new = not s_id or str(s_id).startswith("new_") or s_id not in old_by_id
            if is_new:
                s_id = f"s_{uuid.uuid4().hex[:8]}"

            start_t = s_in.get("startTime", "00:00.00")
            end_t = s_in.get("endTime", "00:00.00")
            start_sec = _parse_sec(start_t)
            end_sec = _parse_sec(end_t)
            dur_sec = max(end_sec - start_sec, 0.05)

            # Check if time range actually changed
            time_changed = True
            existing_shot = old_by_id.get(s_id)
            if existing_shot and not is_new:
                old_start = _parse_sec(existing_shot.get("startTime"))
                old_end = _parse_sec(existing_shot.get("endTime"))
                if abs(old_start - start_sec) < 0.05 and abs(old_end - end_sec) < 0.05:
                    time_changed = False

            if time_changed or is_new:
                # Re-extract frames
                imgs = _extract_frames_for_range(start_sec, end_sec, s_id)
                img = imgs[0] if imgs else (existing_shot.get("img", "") if existing_shot else "")
            else:
                imgs = existing_shot.get("imgs", [])
                img = existing_shot.get("img", "")

            new_shot = {
                "id": s_id,
                "index": i + 1,
                "startTime": _fmt_time(start_sec),
                "endTime": _fmt_time(end_sec),
                "duration": f"{dur_sec:.2f}s",
                "img": img,
                "imgs": imgs,
                "summary": s_in.get("summary", existing_shot.get("summary", "") if existing_shot else ""),
                "desc": s_in.get("desc", existing_shot.get("desc", "") if existing_shot else ""),
                "prompt": s_in.get("prompt", existing_shot.get("prompt", "") if existing_shot else ""),
                "status": s_in.get("status", existing_shot.get("status", "pending") if existing_shot else "pending")
            }
            updated_shots.append(new_shot)

        # Write database
        proj["shots"] = updated_shots
        if updated_shots:
            proj["cover"] = updated_shots[0]["img"]
        self._write_db(db)

        return {"ok": True}
