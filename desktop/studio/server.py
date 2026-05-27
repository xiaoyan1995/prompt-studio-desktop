#!/usr/bin/env python3
"""
Prompt Studio local server.
Usage:  python server.py
Then open:  http://127.0.0.1:8767/
"""
import base64, json, mimetypes, os, re, socket, sys, tempfile, threading, time, urllib.request, urllib.error, uuid, zipfile, hashlib, difflib
import subprocess
from urllib.parse import unquote, urljoin, parse_qs, quote
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import shutil
from lapian_manager import LapianManager

# ── SSE broadcast registry ────────────────────────────────────────────────────
_sse_lock    = threading.Lock()
_sse_clients = []   # list of queue.Queue
import queue

def _sse_notify(event="data-changed", data="1"):
    msg = f"event: {event}\ndata: {data}\n\n".encode()
    with _sse_lock:
        dead = []
        for q in _sse_clients:
            try: q.put_nowait(msg)
            except: dead.append(q)
        for q in dead: _sse_clients.remove(q)

if os.environ.get("PROMPT_STUDIO_STATIC_DIR"):
    BASE_DIR = Path(os.environ["PROMPT_STUDIO_STATIC_DIR"]).resolve()
elif getattr(sys, "frozen", False):
    BASE_DIR = Path.cwd().resolve()
else:
    BASE_DIR = Path(__file__).resolve().parent
_STUDIO_CONFIG_FILE = BASE_DIR / "studio-config.json"
def _load_studio_config():
    try:
        return json.loads(_STUDIO_CONFIG_FILE.read_text(encoding="utf-8"))
    except Exception:
        return {}
_studio_cfg = _load_studio_config()
_env_data_dir = os.environ.get("PROMPT_STUDIO_DATA_DIR")
DATA_DIR   = Path(_env_data_dir or _studio_cfg.get("data_dir") or BASE_DIR).resolve()
DATA_FILE  = DATA_DIR / "data.json"
UPLOAD_DIR = DATA_DIR / "uploads"
CONFIG_FILE = DATA_DIR / "desktop_settings.json"
EXPORT_DIR = DATA_DIR / "exports"
LAPIAN_PROJECTS_FILE = DATA_DIR / "lapian_projects.json"
SNAPSHOT_DIR = DATA_DIR / "snapshots"
SMART_FOLDERS_FILE = DATA_DIR / "smart_folders.json"
lapian_mgr = LapianManager(DATA_DIR)
PORT       = 8767

# ── ffmpeg on-demand ──────────────────────────────────────────────────────────
FFMPEG_TOOLS_DIR = DATA_DIR / "tools"
FFMPEG_EXE       = FFMPEG_TOOLS_DIR / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
FFMPEG_DL_URL    = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
_ffmpeg_install  = {"status": "idle", "percent": 0, "error": ""}

DREAMINA_BIN_NAME = "dreamina.exe" if os.name == "nt" else "dreamina"

def find_ffmpeg():
    if FFMPEG_EXE.exists():
        return str(FFMPEG_EXE)
    return shutil.which("ffmpeg")

def _do_install_ffmpeg():
    global _ffmpeg_install
    try:
        FFMPEG_TOOLS_DIR.mkdir(parents=True, exist_ok=True)
        zip_path = FFMPEG_TOOLS_DIR / "ffmpeg_dl.zip"
        _ffmpeg_install = {"status": "downloading", "percent": 0, "error": ""}

        def _hook(count, block, total):
            if total > 0:
                _ffmpeg_install["percent"] = min(88, int(count * block * 88 / total))

        urllib.request.urlretrieve(FFMPEG_DL_URL, str(zip_path), _hook)
        _ffmpeg_install = {"status": "extracting", "percent": 92, "error": ""}

        with zipfile.ZipFile(zip_path) as zf:
            target_name = "ffmpeg.exe" if os.name == "nt" else "ffmpeg"
            for name in zf.namelist():
                if name.split("/")[-1] == target_name and "/bin/" in name:
                    FFMPEG_EXE.write_bytes(zf.read(name))
                    if os.name != "nt":
                        FFMPEG_EXE.chmod(0o755)
                    break

        zip_path.unlink(missing_ok=True)
        _ffmpeg_install = {"status": "done", "percent": 100, "error": ""}
    except Exception as exc:
        _ffmpeg_install = {"status": "error", "percent": 0, "error": str(exc)}


def _find_dreamina_cli():
    candidates = [
        (Path(__file__).resolve().parent.parent / "bin" / DREAMINA_BIN_NAME),
        (Path(__file__).resolve().parent / "bin" / DREAMINA_BIN_NAME),
        (Path.cwd() / "bin" / DREAMINA_BIN_NAME),
    ]
    for c in candidates:
        try:
            if c.exists() and c.is_file():
                return str(c)
        except Exception:
            continue
    found = shutil.which("dreamina") or shutil.which("dreamina.exe")
    return found or ""


def _decode_cli_text(raw):
    if raw is None:
        return ""
    if isinstance(raw, str):
        return raw
    for enc in ("utf-8", "gbk", "cp936"):
        try:
            return raw.decode(enc)
        except Exception:
            continue
    return raw.decode("utf-8", errors="ignore")


def _run_dreamina_cli(args, timeout=240):
    cli = _find_dreamina_cli()
    if not cli:
        return {
            "ok": False,
            "returncode": -1,
            "stdout": "",
            "stderr": "未找到 dreamina CLI，可先执行官方安装命令。",
            "command": [],
        }
    cmd = [cli] + [str(a) for a in (args or [])]
    try:
        result = subprocess.run(cmd, capture_output=True, timeout=timeout)
        stdout = _decode_cli_text(result.stdout).strip()
        stderr = _decode_cli_text(result.stderr).strip()
        return {
            "ok": result.returncode == 0,
            "returncode": int(result.returncode),
            "stdout": stdout,
            "stderr": stderr,
            "command": cmd,
        }
    except subprocess.TimeoutExpired:
        return {
            "ok": False,
            "returncode": -2,
            "stdout": "",
            "stderr": f"dreamina CLI 执行超时（{timeout}s）",
            "command": cmd,
        }
    except Exception as exc:
        return {
            "ok": False,
            "returncode": -3,
            "stdout": "",
            "stderr": str(exc),
            "command": cmd,
        }


def _extract_json_from_cli_text(text):
    if not text:
        return None
    start = text.find("{")
    end = text.rfind("}")
    if start < 0 or end <= start:
        return None
    chunk = text[start:end + 1]
    try:
        return json.loads(chunk)
    except Exception:
        return None


def _extract_cli_value(text, key):
    if not text or not key:
        return ""
    m = re.search(rf"{re.escape(key)}\s*:\s*(\S+)", text)
    return m.group(1).strip() if m else ""

DATA_DIR.mkdir(parents=True, exist_ok=True)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
EXPORT_DIR.mkdir(parents=True, exist_ok=True)
SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
if not DATA_FILE.exists():
    bundled_data = BASE_DIR / "data.json"
    if bundled_data.exists():
        shutil.copy2(bundled_data, DATA_FILE)
    else:
        DATA_FILE.write_text('{"projects":[]}', encoding="utf-8")

DEFAULT_DESKTOP_SETTINGS = {
    "imageApiBase": "https://api.openai.com/v1",
    "imageApiKey": "",
    "imageModel": "gpt-4o",
    "videoApiBase": "https://generativelanguage.googleapis.com/v1beta",
    "videoApiKey": "",
    "videoModel": "gemini-2.5-pro",
    "videoUploadTimeoutSec": "240",
    "lapianApiBase": "https://generativelanguage.googleapis.com/v1beta",
    "lapianApiKey": "",
    "lapianModel": "gemini-2.5-flash",
    "lapianVideoApiBase": "https://generativelanguage.googleapis.com/v1beta",
    "lapianVideoApiKey": "",
    "lapianVideoModel": "gemini-2.5-flash",
    "lapianCustomPromptImage": "",
    "lapianCustomPromptVideo": "",
    "lapianAigcPromptInstruction": "",
    "llmApiBase": "https://api.openai.com/v1",
    "llmApiKey": "",
    "llmModel": "gpt-4o-mini",
    "videoUploadRetries": "1",
    "imageReverseInstruction": "",
    "videoReverseInstruction": "",
    "runwareApiKey": "",
    "canvasModelConfigs": "",
    "promptPresets": [],
}


def _load_settings():
    try:
        saved = json.loads(CONFIG_FILE.read_text(encoding="utf-8"))
        if not isinstance(saved, dict):
            saved = {}
    except Exception:
        saved = {}
    return {**DEFAULT_DESKTOP_SETTINGS, **saved}


def _save_settings(settings):
    clean = {}
    for key, default in DEFAULT_DESKTOP_SETTINGS.items():
        value = settings.get(key, default)
        if key == "promptPresets":
            presets = value if isinstance(value, list) else []
            clean[key] = [
                {
                    "name": str(p.get("name", "")).strip()[:80],
                    "content": str(p.get("content", "")),
                }
                for p in presets
                if isinstance(p, dict) and str(p.get("name", "")).strip() and str(p.get("content", "")).strip()
            ]
        else:
            clean[key] = str(value or "")
    CONFIG_FILE.write_text(json.dumps(clean, ensure_ascii=False, indent=2), encoding="utf-8")
    return clean


def _read_json_file(path, default):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default


def _write_json_file(path, payload):
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _project_name_map(data):
    return {str(p.get("id", "")): str(p.get("name", "")) for p in (data.get("projects", []) or []) if isinstance(p, dict)}


def _normalize_text(value):
    text = str(value or "")
    text = re.sub(r"\s+", " ", text).strip().lower()
    return text


def _extract_media_path(item):
    if not isinstance(item, dict):
        return ""
    media_path = item.get("image") or item.get("video") or ""
    return str(media_path)


def _safe_stat_size_for_upload_url(path_or_url):
    rel = _normalize_upload_ref(path_or_url)
    if not rel:
        return 0
    try:
        target = _upload_target(rel)
    except Exception:
        return 0
    try:
        return int(target.stat().st_size)
    except Exception:
        return 0


def _item_identity_signature(item):
    if not isinstance(item, dict):
        return ""
    media_path = _extract_media_path(item)
    prompt = _normalize_text(item.get("prompt", ""))
    model = _normalize_text(item.get("model", ""))
    title = _normalize_text(item.get("title", ""))
    size_hint = str(_safe_stat_size_for_upload_url(media_path) or "")
    raw = "|".join([media_path, title, model, prompt, size_hint])
    return hashlib.sha1(raw.encode("utf-8", errors="ignore")).hexdigest()[:16]


def _item_version_id(item):
    if not isinstance(item, dict):
        return ""
    prompt = _normalize_text(item.get("prompt", ""))
    model = _normalize_text(item.get("model", ""))
    media_path = _extract_media_path(item)
    raw = "|".join([prompt, model, media_path])
    return hashlib.sha1(raw.encode("utf-8", errors="ignore")).hexdigest()[:16]


def _build_item_doc(project_id, project_name, category, item):
    if not isinstance(item, dict):
        return None
    item_type = "image" if category == "image_prompts" else ("video" if category == "video_prompts" else "skill")
    tags = item.get("tags", []) if isinstance(item.get("tags", []), list) else []
    title = str(item.get("title", ""))
    prompt = str(item.get("prompt", ""))
    analysis = str(item.get("analysis", ""))
    model = str(item.get("model", ""))
    media_path = _extract_media_path(item)
    doc = {
        "id": str(item.get("id", "")),
        "project_id": str(project_id),
        "project_name": str(project_name),
        "category": category,
        "type": item_type,
        "title": title,
        "prompt": prompt,
        "analysis": analysis,
        "model": model,
        "tags": [str(t) for t in tags if str(t).strip()],
        "created_at": item.get("created_at", ""),
        "updated_at": item.get("updated_at", ""),
        "image": item.get("image", ""),
        "video": item.get("video", ""),
        "ref_images": item.get("ref_images", []) if isinstance(item.get("ref_images", []), list) else [],
        "version_id": _item_version_id(item),
        "identity_sig": _item_identity_signature(item),
        "quality": item.get("quality", {}) if isinstance(item.get("quality", {}), dict) else {},
        "lineage": item.get("lineage", {}) if isinstance(item.get("lineage", {}), dict) else {},
    }
    return doc


def _collect_docs(data):
    docs = []
    for proj in data.get("projects", []) or []:
        if not isinstance(proj, dict):
            continue
        pid = proj.get("id", "")
        pname = proj.get("name", "")
        for category in ("image_prompts", "video_prompts", "skill_prompts"):
            for item in (proj.get(category, []) or []):
                doc = _build_item_doc(pid, pname, category, item)
                if doc and doc["id"]:
                    docs.append(doc)
    return docs


def _match_score(doc, query):
    if not query:
        return 0
    q = _normalize_text(query)
    title = _normalize_text(doc.get("title", ""))
    tags = " ".join(_normalize_text(t) for t in (doc.get("tags", []) or []))
    prompt = _normalize_text(doc.get("prompt", ""))
    analysis = _normalize_text(doc.get("analysis", ""))
    model = _normalize_text(doc.get("model", ""))
    score = 0
    if q in title:
        score += 60
    if q in tags:
        score += 35
    if q in model:
        score += 20
    if q in prompt:
        score += 30
    if q in analysis:
        score += 18
    if score == 0:
        ratio = difflib.SequenceMatcher(None, q, title or prompt[: max(len(q), 1)]).ratio()
        if ratio >= 0.72:
            score = int(ratio * 25)
    return score


def _ensure_item_schema(item):
    if not isinstance(item, dict):
        return
    quality = item.get("quality")
    if not isinstance(quality, dict):
        quality = {}
    quality.setdefault("star", False)
    quality.setdefault("rating", 0)
    quality.setdefault("status", "")
    item["quality"] = quality
    lineage = item.get("lineage")
    if not isinstance(lineage, dict):
        lineage = {}
    lineage.setdefault("source_id", "")
    lineage.setdefault("version", 1)
    lineage.setdefault("version_id", _item_version_id(item))
    lineage.setdefault("history", [])
    if not isinstance(lineage.get("history"), list):
        lineage["history"] = []
    item["lineage"] = lineage


def _ensure_data_schema(data):
    if not isinstance(data, dict):
        data = {"projects": []}
    projects = data.get("projects", [])
    if not isinstance(projects, list):
        projects = []
    data["projects"] = projects
    changed = False
    for proj in projects:
        if not isinstance(proj, dict):
            continue
        for category in ("image_prompts", "video_prompts", "skill_prompts"):
            items = proj.get(category, [])
            if not isinstance(items, list):
                proj[category] = []
                changed = True
                continue
            for item in items:
                before = json.dumps(item, ensure_ascii=False, sort_keys=True) if isinstance(item, dict) else ""
                _ensure_item_schema(item)
                after = json.dumps(item, ensure_ascii=False, sort_keys=True) if isinstance(item, dict) else ""
                if before and after and before != after:
                    changed = True
    return data, changed


def _get_smart_folders():
    raw = _read_json_file(SMART_FOLDERS_FILE, {"folders": []})
    folders = raw.get("folders", []) if isinstance(raw, dict) else []
    if not isinstance(folders, list):
        folders = []
    clean = []
    for f in folders:
        if not isinstance(f, dict):
            continue
        clean.append({
            "id": str(f.get("id", uuid.uuid4().hex[:12])),
            "name": str(f.get("name", "")).strip() or "未命名智能文件夹",
            "rules": f.get("rules", {}) if isinstance(f.get("rules", {}), dict) else {},
            "created_at": str(f.get("created_at", "")),
            "updated_at": str(f.get("updated_at", "")),
        })
    return {"folders": clean}


def _save_smart_folders(payload):
    folders = payload.get("folders", []) if isinstance(payload, dict) else []
    if not isinstance(folders, list):
        folders = []
    clean = []
    for f in folders:
        if not isinstance(f, dict):
            continue
        clean.append({
            "id": str(f.get("id", uuid.uuid4().hex[:12])),
            "name": str(f.get("name", "")).strip()[:80] or "未命名智能文件夹",
            "rules": f.get("rules", {}) if isinstance(f.get("rules", {}), dict) else {},
            "created_at": str(f.get("created_at", "")) or time.strftime("%Y-%m-%dT%H:%M:%S"),
            "updated_at": str(f.get("updated_at", "")) or time.strftime("%Y-%m-%dT%H:%M:%S"),
        })
    out = {"folders": clean}
    _write_json_file(SMART_FOLDERS_FILE, out)
    return out


def _apply_folder_rules(doc, rules):
    if not isinstance(rules, dict):
        return False
    doc_type = str(doc.get("type", ""))
    doc_model = str(doc.get("model", ""))
    doc_tags = set(str(t) for t in (doc.get("tags", []) or []))
    doc_quality = doc.get("quality", {}) if isinstance(doc.get("quality", {}), dict) else {}
    doc_lineage = doc.get("lineage", {}) if isinstance(doc.get("lineage", {}), dict) else {}

    type_filter = str(rules.get("type", "all") or "all")
    if type_filter != "all" and type_filter != doc_type:
        return False

    model_kw = str(rules.get("model", "")).strip().lower()
    if model_kw and model_kw not in doc_model.lower():
        return False

    include_tags = rules.get("include_tags", [])
    if isinstance(include_tags, list):
        inc_set = set(str(t).strip() for t in include_tags if str(t).strip())
        if inc_set and not inc_set.intersection(doc_tags):
            return False

    exclude_tags = rules.get("exclude_tags", [])
    if isinstance(exclude_tags, list):
        exc_set = set(str(t).strip() for t in exclude_tags if str(t).strip())
        if exc_set and exc_set.intersection(doc_tags):
            return False

    if rules.get("only_starred") and not bool(doc_quality.get("star")):
        return False

    min_rating = rules.get("min_rating")
    if min_rating is not None:
        try:
            if int(doc_quality.get("rating", 0)) < int(min_rating):
                return False
        except Exception:
            return False

    status = str(rules.get("status", "")).strip().lower()
    if status:
        if str(doc_quality.get("status", "")).strip().lower() != status:
            return False

    has_source = rules.get("has_source")
    if has_source is True and not str(doc_lineage.get("source_id", "")).strip():
        return False
    if has_source is False and str(doc_lineage.get("source_id", "")).strip():
        return False

    query = str(rules.get("query", "")).strip()
    if query and _match_score(doc, query) <= 0:
        return False
    return True


def _resolve_docs_by_refs(data, refs):
    docs = _collect_docs(data)
    lookup = {}
    for d in docs:
        lookup[f"{d.get('project_id')}::{d.get('category')}::{d.get('id')}"] = d
    resolved = []
    for ref in refs:
        if not isinstance(ref, dict):
            continue
        key = f"{ref.get('project_id','')}::{ref.get('category','')}::{ref.get('id','')}"
        doc = lookup.get(key)
        if doc:
            resolved.append(doc)
    return resolved


def _snapshot_manifest():
    snaps = []
    for zf in sorted(SNAPSHOT_DIR.glob("*.zip"), reverse=True):
        try:
            stat = zf.stat()
            snaps.append({
                "name": zf.name,
                "path": str(zf),
                "size": stat.st_size,
                "mtime": time.strftime("%Y-%m-%dT%H:%M:%S", time.localtime(stat.st_mtime)),
            })
        except Exception:
            continue
    return snaps


def _as_int(value, default, min_value=None, max_value=None):
    try:
        n = int(str(value).strip())
    except Exception:
        n = default
    if min_value is not None and n < min_value:
        n = min_value
    if max_value is not None and n > max_value:
        n = max_value
    return n


def _is_timeout_error(err):
    if isinstance(err, (TimeoutError, socket.timeout)):
        return True
    if isinstance(err, urllib.error.URLError):
        reason = getattr(err, "reason", None)
        if isinstance(reason, (TimeoutError, socket.timeout)):
            return True
        if isinstance(reason, OSError) and "timed out" in str(reason).lower():
            return True
    return "timed out" in str(err).lower()


VIDEO_EXTS = {".mp4", ".webm", ".mov", ".m4v", ".ts"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".avif"}


def _url_ext(url):
    try:
        return Path(urlparse(url).path).suffix.lower()
    except Exception:
        return ""


def _normalize_upload_ref(value):
    if not isinstance(value, str) or not value.startswith("/uploads/"):
        return None
    rel = unquote(value[len("/uploads/"):]).replace("\\", "/").lstrip("/")
    if not rel or rel.startswith("../") or "/../" in f"/{rel}":
        return None
    return rel


def _upload_target(rel):
    target = (UPLOAD_DIR / rel).resolve()
    target.relative_to(UPLOAD_DIR.resolve())
    return target


def _item_upload_refs(item):
    refs = set()
    if not isinstance(item, dict):
        return refs
    for key in ("image", "video"):
        rel = _normalize_upload_ref(item.get(key))
        if rel:
            refs.add(rel)
    ref_images = item.get("ref_images", [])
    if isinstance(ref_images, list):
        for ref in ref_images:
            rel = _normalize_upload_ref(ref)
            if rel:
                refs.add(rel)
    gallery = item.get("gallery", [])
    if isinstance(gallery, list):
        for g in gallery:
            src = g.get("src") if isinstance(g, dict) else g
            rel = _normalize_upload_ref(src)
            if rel:
                refs.add(rel)
    return refs


def _data_upload_refs(data):
    refs = set()
    for proj in data.get("projects", []):
        if not isinstance(proj, dict):
            continue
        for key in ("image_prompts", "video_prompts", "skill_prompts"):
            for item in proj.get(key, []) or []:
                refs.update(_item_upload_refs(item))
    return refs


def _prune_empty_upload_dirs(start):
    root = UPLOAD_DIR.resolve()
    parent = start.parent.resolve()
    while parent != root:
        try:
            parent.rmdir()
        except OSError:
            break
        parent = parent.parent.resolve()


def _delete_upload_refs(refs, keep_refs=None):
    keep_refs = keep_refs or set()
    deleted, skipped = [], []
    total_bytes = 0
    for rel in sorted(set(refs)):
        if rel in keep_refs:
            skipped.append(rel)
            continue
        try:
            target = _upload_target(rel)
        except Exception:
            skipped.append(rel)
            continue
        if not target.exists() or not target.is_file():
            continue
        try:
            total_bytes += target.stat().st_size
            target.unlink()
            deleted.append(rel)
            _prune_empty_upload_dirs(target)
        except OSError:
            skipped.append(rel)
    return {"files": len(deleted), "bytes": total_bytes, "deleted": deleted, "skipped": skipped}


def _cleanup_unreferenced_uploads(data):
    keep_refs = _data_upload_refs(data)
    orphan_refs = set()
    if UPLOAD_DIR.exists():
        for target in UPLOAD_DIR.rglob("*"):
            if not target.is_file():
                continue
            rel = target.relative_to(UPLOAD_DIR).as_posix()
            if rel not in keep_refs:
                orphan_refs.add(rel)
    return _delete_upload_refs(orphan_refs)


def _media_headers(media_type="image", referer="", cookie=""):
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
        "Accept": "video/*,audio/*,*/*;q=0.8" if media_type == "video"
                  else "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
    }
    if referer and referer.startswith(("http://", "https://")):
        headers["Referer"] = referer
    if cookie:
        headers["Cookie"] = cookie
    return headers


def _fetch_url(url, headers, timeout=60):
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read()
        ct = (resp.headers.get_content_type() or "").split(";")[0].strip()
    return raw, ct


def _parse_m3u8_attrs(line):
    attrs = {}
    for key, value in re.findall(r'([A-Z0-9-]+)=("[^"]*"|[^,]*)', line):
        attrs[key] = value.strip('"')
    return attrs


def _next_uri(lines, start_index):
    for i in range(start_index + 1, len(lines)):
        line = lines[i].strip()
        if line and not line.startswith("#"):
            return line
    return ""


def _download_hls(url, headers, timeout=120):
    raw, _ct = _fetch_url(url, headers, timeout=30)
    text = raw.decode("utf-8", errors="replace")
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    if any(line.startswith("#EXT-X-KEY") and "METHOD=NONE" not in line for line in lines):
        ff = find_ffmpeg()
        if not ff:
            raise RuntimeError("检测到加密 HLS 视频流，需要先安装 ffmpeg 才能下载（在桌面端保存视频时会提示安装）。")
        # Use ffmpeg to download encrypted HLS to a temp file, then return bytes
        import subprocess as _sp, tempfile as _tf
        tmp_path = _tf.mktemp(suffix=".mp4")
        extra_hdrs = "".join(f"{k}: {v}\r\n" for k, v in (headers or {}).items()
                             if k.lower() in ("cookie", "referer", "user-agent"))
        cmd = [ff, "-y", "-loglevel", "error"]
        if extra_hdrs:
            cmd += ["-headers", extra_hdrs]
        cmd += ["-i", url, "-c", "copy", "-bsf:a", "aac_adtstoasc", tmp_path]
        result = _sp.run(cmd, capture_output=True, timeout=timeout)
        if result.returncode == 0 and os.path.exists(tmp_path) and os.path.getsize(tmp_path) > 0:
            with open(tmp_path, "rb") as f:
                data = f.read()
            os.unlink(tmp_path)
            return data, "video/mp4", "hd"
        err = (result.stderr or b"").decode("utf-8", errors="replace")[-400:]
        if os.path.exists(tmp_path): os.unlink(tmp_path)
        raise RuntimeError(f"ffmpeg 下载加密 HLS 失败: {err or 'unknown error'}")

    # Master playlist: choose the highest bandwidth variant.
    variants = []
    for i, line in enumerate(lines):
        if line.startswith("#EXT-X-STREAM-INF"):
            attrs = _parse_m3u8_attrs(line)
            uri = _next_uri(lines, i)
            if uri:
                try:
                    bandwidth = int(attrs.get("BANDWIDTH", "0"))
                except ValueError:
                    bandwidth = 0
                variants.append((bandwidth, urljoin(url, uri)))
    if variants:
        variants.sort(reverse=True)
        return _download_hls(variants[0][1], headers, timeout=timeout)

    if "#EXT-X-ENDLIST" not in text:
        raise RuntimeError("检测到直播/未结束的 HLS 视频流，当前只支持下载点播视频。")

    init_url = ""
    for line in lines:
        if line.startswith("#EXT-X-MAP"):
            attrs = _parse_m3u8_attrs(line)
            if attrs.get("URI"):
                init_url = urljoin(url, attrs["URI"])
            break

    segment_urls = [urljoin(url, line) for line in lines if line and not line.startswith("#")]
    if not segment_urls:
        raise RuntimeError("HLS 播放列表里没有找到可下载的视频分片。")

    parts = []
    if init_url:
        init_raw, _ = _fetch_url(init_url, headers, timeout=30)
        parts.append(init_raw)
    for seg_url in segment_urls:
        seg_raw, _ = _fetch_url(seg_url, headers, timeout=30)
        parts.append(seg_raw)

    return b"".join(parts), "video/mp4" if init_url else "video/mp2t", ".mp4" if init_url else ".ts"


def _download_remote_media(url, media_type="image", referer="", cookie="", timeout=60):
    if not url:
        raise RuntimeError("Missing media URL")
    if not url.startswith(("http://", "https://")):
        raise RuntimeError("Unsupported media URL")

    ext = _url_ext(url)
    if ext == ".mpd":
        raise RuntimeError("已识别到 DASH/MPD 视频流；当前版本先支持直连视频和 m3u8，MPD 需要后续接入音视频轨合并。")

    headers = _media_headers(media_type, referer, cookie)
    if ext == ".m3u8":
        return _download_hls(url, headers, timeout=timeout)

    raw, ct = _fetch_url(url, headers, timeout=timeout)
    if "mpegurl" in ct or "m3u8" in ct:
        return _download_hls(url, headers, timeout=timeout)
    if "dash+xml" in ct or "mpd" in ct:
        raise RuntimeError("已识别到 DASH/MPD 视频流；当前版本先支持直连视频和 m3u8，MPD 需要后续接入音视频轨合并。")
    return raw, ct or ("video/mp4" if media_type == "video" else "image/jpeg"), ""


def _format_art_brief(obj):
    """Convert a JSON art-brief dict to a readable multi-section text."""
    lines = []
    if obj.get("title"):
        lines.append(f"【{obj['title']}】\n")
    if obj.get("coreExpression"):
        lines.append(f"▍核心表达\n{obj['coreExpression']}\n")
    section_labels = [
        ("composition","构图"), ("camera","镜头"), ("lighting","光线"),
        ("material","材质"), ("space","空间"), ("colorAesthetics","色彩"),
        ("postProcessing","后期"), ("technicalSketch","技术细节"), ("vision","画面语言"),
    ]
    secs = obj.get("sections") or {}
    for key, label in section_labels:
        if secs.get(key):
            lines.append(f"▍{label}\n{secs[key]}\n")
    colors = obj.get("colors") or []
    if colors:
        lines.append(f"▍色板\n{' '.join(str(c) for c in colors)}\n")
    tp = obj.get("technicalParams") or {}
    parts = []
    if tp.get("format"):       parts.append(f"画幅：{tp['format']}")
    if tp.get("renderEngine"): parts.append(f"渲染：{tp['renderEngine']}")
    if parts:
        lines.append(f"▍技术参数\n{'　'.join(parts)}\n")
    return "\n".join(lines).strip()


# ── Per-job SSE registry ─────────────────────────────────────────────────────
_jobs_lock = threading.Lock()
_jobs = {}        # job_id -> {"status": str, "result": dict|None, "error": str|None}
_job_queues = {}  # job_id -> queue.Queue

def _job_create(job_id):
    with _jobs_lock:
        q = queue.Queue()
        _jobs[job_id] = {"status": "running", "result": None, "error": None}
        _job_queues[job_id] = q
    return q

def _job_succeed(job_id, result):
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id]["status"] = "succeeded"
            _jobs[job_id]["result"] = result
        if job_id in _job_queues:
            _job_queues[job_id].put({"status": "SUCCEEDED", **result})

def _job_fail(job_id, error):
    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id]["status"] = "failed"
            _jobs[job_id]["error"] = error
        if job_id in _job_queues:
            _job_queues[job_id].put({"status": "FAILED", "error": error})


# ── Runware image enhancement ─────────────────────────────────────────────────
RUNWARE_API_URL = "https://api.runware.ai/v1"

_ENHANCE_MODEL_MAP = {
    "Standard V2":       "topazlabs:standard-v2@2",
    "High Fidelity V2":  "topazlabs:high-fidelity-v2@2",
    "Low Resolution V2": "topazlabs:low-resolution-v2@2",
    "CG Art & Game Art": "topazlabs:cg-art@2",
}

def _runware_enhance_sync(api_key, input_image, enhance_model, upscale_factor):
    task_uuid = str(uuid.uuid4())
    runware_model = _ENHANCE_MODEL_MAP.get(enhance_model, "topazlabs:standard-v2@2")
    task = {
        "taskType": "imageEnhancement",
        "taskUUID": task_uuid,
        "model": runware_model,
        "inputImage": input_image,
        "upscaleFactor": int(upscale_factor),
        "outputType": ["URL"],
        "outputFormat": "PNG",
        "includeCost": True,
    }
    req = urllib.request.Request(
        RUNWARE_API_URL,
        data=json.dumps([task]).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        resp_data = json.loads(resp.read().decode())
    errors = resp_data.get("errors") or []
    if errors:
        msg = errors[0].get("message") if isinstance(errors[0], dict) else str(errors[0])
        raise Exception(f"Runware error: {msg}")
    items = resp_data.get("data") or []
    if not items or not items[0].get("imageURL"):
        raise Exception(f"Runware returned no imageURL: {resp_data}")
    item = items[0]
    return {"url": item["imageURL"], "width": item.get("width"), "height": item.get("height")}


def _save_image_local(img_bytes, stem, project_id, subfolder):
    proj_folder = re.sub(r"[^\w\u4e00-\u9fff\-]", "_", project_id)[:40] if project_id else subfolder
    save_dir = UPLOAD_DIR / proj_folder / subfolder
    save_dir.mkdir(parents=True, exist_ok=True)
    out_path = save_dir / f"{stem}.png"
    counter = 1
    while out_path.exists():
        out_path = save_dir / f"{stem}_{counter}.png"
        counter += 1
    out_path.write_bytes(img_bytes)
    return f"/uploads/{proj_folder}/{subfolder}/{out_path.name}"


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=str(BASE_DIR), **kw)

    def end_headers(self):
        # Prevent caching for canvas-bundle to ensure new assets always load instantly
        if "/canvas-bundle/" in self.path or "canvas-bundle" in self.path:
            self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def log_message(self, fmt, *args):
        print(f"[studio] {fmt % args}")

    # ── routing ──────────────────────────────────────────────────────────
    def do_OPTIONS(self):
        self.send_response(204)
        self._cors_headers()
        self.end_headers()

    def do_GET(self):
        try:
            self._do_GET_inner()
        except Exception as exc:
            try:
                self._err(500, f"Server error: {exc}")
            except Exception:
                pass

    def _do_GET_inner(self):
        parsed = urlparse(self.path)
        path = parsed.path
        query = parse_qs(parsed.query or "")
        if path == "/api/data":
            raw = json.loads(DATA_FILE.read_text(encoding="utf-8"))
            fixed, changed = _ensure_data_schema(raw)
            if changed:
                DATA_FILE.write_text(json.dumps(fixed, ensure_ascii=False, indent=2), encoding="utf-8")
            self._json_resp(fixed)
        elif path == "/api/projects":
            data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
            data, changed = _ensure_data_schema(data)
            if changed:
                DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
            self._json_resp(data.get("projects", []))
        elif path == "/api/desktop/settings":
            self._json_resp({"ok": True, "settings": _load_settings()})
        elif path == "/api/studio-config":
            self._json_resp({"ok": True, "data_dir": str(DATA_DIR), "config_file": str(_STUDIO_CONFIG_FILE)})
        elif path == "/api/smart-folders":
            self._json_resp({"ok": True, **_get_smart_folders()})
        elif path == "/api/snapshot/list":
            self._json_resp({"ok": True, "snapshots": _snapshot_manifest()})
        elif path == "/api/cli/projects":
            data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
            projs = [{
                "id": p["id"], "name": p["name"],
                "skill_count": len(p.get("skill_prompts", [])),
                "image_count": len(p.get("image_prompts", [])),
                "video_count": len(p.get("video_prompts", [])),
            } for p in data.get("projects", [])]
            self._json_resp({"ok": True, "projects": projs})
        elif path == "/api/cli/prompts":
            self._handle_cli_list(query)
        elif path == "/api/cli/prompt":
            self._handle_cli_get(query)
        elif path == "/api/cli/search":
            self._handle_cli_search(query)
        elif path == "/api/cli/audio/folders":
            self._handle_cli_audio_folders(query)
        elif path == "/api/cli/audio/files":
            self._handle_cli_audio_files(query)
        elif path == "/api/cli/docs":
            self._handle_cli_docs(query)
        elif path == "/api/search-assets":
            self._handle_search_assets(query)
        elif path == "/api/detect-duplicates":
            self._handle_detect_duplicates(query)
        elif path == "/api/smart-folders/preview":
            self._handle_smart_folder_preview(query)
        elif path == "/api/events":
            self._handle_sse()
        elif path == "/api/generate/text/pricing":
            return self._json_resp({"pricing": {}})
        elif path == "/api/ffmpeg-status":
            ff = find_ffmpeg()
            self._json_resp({"ok": bool(ff), "path": ff or "", "install": _ffmpeg_install})
        elif path == "/api/lapian/list":
            self._json_resp({"ok": True, "projects": lapian_mgr.get_list()})
        elif path == "/api/lapian/video":
            proj_id = (query.get("id") or [""])[0]
            detail = lapian_mgr.get_detail(proj_id)
            if not detail:
                return self._err(404, "project_not_found")
            vid = Path(detail.get("videoPath", ""))
            if not vid.exists() or not vid.is_file():
                return self._err(404, "video_not_found")
            ctype = mimetypes.guess_type(str(vid))[0] or "video/mp4"
            file_size = vid.stat().st_size
            range_header = self.headers.get("Range")
            if range_header:
                try:
                    spec = range_header.replace("bytes=", "").strip()
                    parts = spec.split("-")
                    start = int(parts[0]) if parts[0] else 0
                    end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
                    end = min(end, file_size - 1)
                except (ValueError, IndexError):
                    self.send_response(416); self.send_header("Content-Range", f"bytes */{file_size}"); self.end_headers(); return
                length = end - start + 1
                self.send_response(206)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
                self.send_header("Content-Length", str(length))
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()
                with open(vid, "rb") as f:
                    f.seek(start)
                    remaining = length
                    while remaining > 0:
                        chunk = f.read(min(65536, remaining))
                        if not chunk: break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
            else:
                self.send_response(200)
                self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(file_size))
                self.send_header("Accept-Ranges", "bytes")
                self.end_headers()
                with open(vid, "rb") as f:
                    while True:
                        chunk = f.read(65536)
                        if not chunk: break
                        self.wfile.write(chunk)
        elif path == "/api/lapian/detail":
            proj_id = (query.get("id") or [""])[0]
            detail = lapian_mgr.get_detail(proj_id)
            if detail:
                self._json_resp({"ok": True, "project": detail})
            else:
                self._json_resp({"ok": False, "error": "project_not_found"})
        elif path == "/api/local-audio":
            self._serve_local_audio(query)
        elif path.startswith("/uploads/"):
            self._serve_upload(path)
        elif path.startswith("/exports/"):
            self._serve_export(path)
        elif path.startswith("/api/jobs/") and path.endswith("/sse"):
            job_id = path[len("/api/jobs/"):-len("/sse")]
            self._handle_job_sse(job_id)
        else:
            super().do_GET()

    def _serve_upload(self, path):
        rel = unquote(path[len("/uploads/"):]).replace("\\", "/")
        if rel.startswith("../") or "/../" in rel:
            return self._err(400, "Invalid upload path")
        target = (UPLOAD_DIR / rel).resolve()
        try:
            target.relative_to(UPLOAD_DIR.resolve())
        except ValueError:
            return self._err(400, "Invalid upload path")
        if not target.exists() or not target.is_file():
            return self._err(404, "Not found")
        ctype = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
        file_size = target.stat().st_size
        range_header = self.headers.get("Range")
        if range_header:
            try:
                spec = range_header.replace("bytes=", "").strip()
                parts = spec.split("-")
                start = int(parts[0]) if parts[0] else 0
                end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
                end = min(end, file_size - 1)
            except (ValueError, IndexError):
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{file_size}")
                self.end_headers()
                return
            if start >= file_size:
                self.send_response(416)
                self.send_header("Content-Range", f"bytes */{file_size}")
                self.end_headers()
                return
            length = end - start + 1
            self.send_response(206)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(length))
            self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
            self.send_header("Accept-Ranges", "bytes")
            self._cors_headers()
            self.end_headers()
            with target.open("rb") as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(65536, remaining))
                    if not chunk:
                        break
                    try:
                        self.wfile.write(chunk)
                    except Exception:
                        break
                    remaining -= len(chunk)
        else:
            self.send_response(200)
            self.send_header("Content-Type", ctype)
            self.send_header("Content-Length", str(file_size))
            self.send_header("Accept-Ranges", "bytes")
            self._cors_headers()
            self.end_headers()
            with target.open("rb") as f:
                shutil.copyfileobj(f, self.wfile)

    def _serve_export(self, path):
        rel = unquote(path[len("/exports/"):]).replace("\\", "/").strip()
        if not rel or "/" in rel or "\\" in rel or rel.startswith("."):
            return self._err(400, "Invalid export path")
        target = (EXPORT_DIR / rel).resolve()
        try:
            target.relative_to(EXPORT_DIR.resolve())
        except Exception:
            return self._err(400, "Invalid export path")
        if not target.exists() or not target.is_file():
            return self._err(404, "Not found")
        ctype = "application/zip"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(target.stat().st_size))
        self._cors_headers()
        self.end_headers()
        with target.open("rb") as f:
            shutil.copyfileobj(f, self.wfile)

    def _handle_sse(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        q = queue.Queue()
        with _sse_lock: _sse_clients.append(q)
        try:
            while True:
                try:
                    msg = q.get(timeout=25)
                    self.wfile.write(msg)
                    self.wfile.flush()
                except queue.Empty:
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass
        finally:
            with _sse_lock:
                if q in _sse_clients: _sse_clients.remove(q)

    def do_POST(self):
        path = urlparse(self.path).path
        if path == "/api/upload-video":
            return self._handle_video_upload()
        if path == "/api/upload-pdf":
            return self._handle_pdf_upload()
        if path == "/api/preview-doc":
            try:
                body = self._read_body()
            except Exception as e:
                return self._err(400, str(e))
            return self._handle_preview_doc(body)
        try:
            body = self._read_body()
        except Exception as e:
            return self._err(400, str(e))

        if path == "/api/data":
            fixed, _changed = _ensure_data_schema(body if isinstance(body, dict) else {"projects": []})
            DATA_FILE.write_text(
                json.dumps(fixed, ensure_ascii=False, indent=2), encoding="utf-8"
            )
            self._json_resp({"ok": True})
        elif path == "/api/upload-image":
            self._handle_upload(body)
        elif path == "/api/upload-material":
            self._handle_upload_material(body)
        elif path == "/api/save-media":
            self._handle_save_media(body)
        elif path == "/api/save-prompt":
            self._handle_save_prompt(body)
        elif path == "/api/delete-prompt":
            self._handle_delete_prompt(body)
        elif path == "/api/delete-project":
            self._handle_delete_project(body)
        elif path == "/api/cleanup-media":
            self._handle_cleanup_media(body)
        elif path == "/api/reverse-prompt":
            self._handle_reverse_prompt(body)
        elif path == "/api/create-project":
            self._handle_create_project(body)
        elif path == "/api/rename-project":
            self._handle_rename_project(body)
        elif path == "/api/gen-title":
            self._handle_gen_title(body)
        elif path == "/api/rewrite-prompt":
            self._handle_rewrite_prompt(body)
        elif path == "/api/desktop/settings":
            self._json_resp({"ok": True, "settings": _save_settings(body)})
        elif path == "/api/export-bundle":
            self._handle_export_bundle(body)
        elif path == "/api/snapshot/create":
            self._handle_snapshot_create(body)
        elif path == "/api/snapshot/restore":
            self._handle_snapshot_restore(body)
        elif path == "/api/smart-folders":
            self._handle_save_smart_folders(body)
        elif path == "/api/delete-pdf":
            self._handle_delete_pdf(body)
        elif path == "/api/asset/quality":
            self._handle_asset_quality(body)
        elif path == "/api/asset/palette":
            self._handle_save_palette(body)
        elif path == "/api/asset/lineage":
            self._handle_asset_lineage(body)
        elif path == "/api/upload-to-public":
            self._handle_upload_to_public(body)
        elif path == "/api/lapian/create":
            video_path = body.get("videoPath", "")
            video_asset_url = body.get("videoAssetUrl", "")
            video_name = body.get("videoName", "")
            movie_name = body.get("movieName", "")
            desc = body.get("desc", "")
            mode = body.get("mode", "standard")
            threshold = body.get("threshold", None)
            # Pre-flight: FFmpeg must be available
            ff = find_ffmpeg()
            if not ff:
                self._json_resp({"ok": False, "ffmpeg_missing": True,
                                 "error": "未检测到 FFmpeg，请先在「设置中心 → 工具依赖」中一键安装 FFmpeg 后再使用智能拉片。"})
                return
            # Resolve relative asset URL to absolute path via DATA_DIR
            if video_asset_url and not video_path:
                rel = video_asset_url.lstrip("/")
                resolved = (DATA_DIR / rel).resolve()
                if resolved.exists():
                    video_path = str(resolved)
                else:
                    self._json_resp({"ok": False, "error": f"视频文件不存在: {resolved}"})
                    return
            try:
                lp_id = lapian_mgr.create_project(ff, video_path, video_name, movie_name, desc, mode, threshold=threshold)
                self._json_resp({"ok": True, "projectId": lp_id})
            except Exception as e:
                self._json_resp({"ok": False, "error": str(e)})
        elif path == "/api/lapian/resplit":
            lp_id = body.get("id", "")
            mode = body.get("mode", "standard")
            threshold = body.get("threshold", None)
            ff = find_ffmpeg()
            if not ff:
                self._json_resp({"ok": False, "error": "FFmpeg 未安装"})
                return
            try:
                lapian_mgr.resplit_project(ff, lp_id, mode=mode, threshold=threshold)
                self._json_resp({"ok": True})
            except Exception as e:
                self._json_resp({"ok": False, "error": str(e)})
        elif path == "/api/lapian/delete":
            lp_id = body.get("id", "")
            success = lapian_mgr.delete_project(lp_id)
            self._json_resp({"ok": success})
        elif path == "/api/lapian/analyze-shot":
            lp_id = body.get("projectId", "")
            shot_id = body.get("shotId", "")
            use_video = bool(body.get("useVideo", False))
            cfg = _load_settings()

            if use_video:
                # Video analysis mode: use dedicated video API config
                api_base = cfg.get("lapianVideoApiBase", "")
                api_key = cfg.get("lapianVideoApiKey", "")
                model = cfg.get("lapianVideoModel", "")
                if not api_key:
                    self._json_resp({"ok": False, "error": "未配置视频分析模式 API Key，请在「设置中心 → 智能拉片 → 视频分析模式」中填写。"})
                    return
            else:
                # Image analysis mode: use lapian-specific or fallback configs
                api_base = cfg.get("lapianApiBase", "")
                api_key = cfg.get("lapianApiKey", "")
                model = cfg.get("lapianModel", "")
                if not api_key:
                    api_base = cfg.get("videoApiBase", "https://generativelanguage.googleapis.com/v1beta")
                    api_key = cfg.get("videoApiKey", "")
                    model = cfg.get("videoModel", "gemini-2.5-pro")
                if not api_key:
                    api_key = cfg.get("llmApiKey", "")
                    api_base = cfg.get("llmApiBase", "https://api.openai.com/v1")
                    model = cfg.get("llmModel", "gpt-4o-mini")
                if not api_key:
                    self._json_resp({"ok": False, "error": "未配置智能拉片或大模型 API Key，请先去左下角「设置中心」配置拉片专属 API"})
                    return

            custom_prompt = body.get("customPrompt", "")
            if not custom_prompt:
                if use_video:
                    custom_prompt = cfg.get("lapianCustomPromptVideo", "")
                else:
                    custom_prompt = cfg.get("lapianCustomPromptImage", "")
            aigc_instruction = cfg.get("lapianAigcPromptInstruction", "")
            ff = find_ffmpeg()
            res = lapian_mgr.analyze_shot(lp_id, shot_id, api_base, api_key, model, custom_prompt,
                                          use_video=use_video, ffmpeg_path=ff,
                                          aigc_instruction=aigc_instruction)
            self._json_resp(res)
        elif path == "/api/lapian/shot/delete":
            res = lapian_mgr.delete_shot(body.get("projectId",""), body.get("shotId",""))
            self._json_resp(res)
        elif path == "/api/lapian/shot/split":
            ff = find_ffmpeg()
            if not ff:
                self._json_resp({"ok": False, "error": "FFmpeg 未安装"})
                return
            res = lapian_mgr.split_shot(body.get("projectId",""), body.get("shotId",""),
                                        float(body.get("splitSec", 0)), ff)
            self._json_resp(res)
        elif path == "/api/lapian/project/update-all-shots":
            ff = find_ffmpeg()
            if not ff:
                self._json_resp({"ok": False, "error": "FFmpeg 未安装"})
                return
            res = lapian_mgr.update_bulk_shots(
                body.get("projectId", ""),
                body.get("shots", []),
                ff
            )
            self._json_resp(res)
        elif path == "/api/lapian/shot/merge":
            ff = find_ffmpeg()
            if not ff:
                self._json_resp({"ok": False, "error": "FFmpeg 未安装"})
                return
            res = lapian_mgr.merge_shots(body.get("projectId",""), body.get("shotIds",[]), ff)
            self._json_resp(res)
        elif path == "/api/lapian/shot/update-desc":
            res = lapian_mgr.update_shot_description(
                body.get("projectId",""), body.get("shotId",""), body.get("description",""))
            self._json_resp(res)
        elif path == "/api/lapian/shot/chat":
            cfg = _load_settings()
            api_base = cfg.get("lapianApiBase", cfg.get("videoApiBase",""))
            api_key  = cfg.get("lapianApiKey",  cfg.get("videoApiKey",""))
            model    = cfg.get("lapianModel",    cfg.get("videoModel","gpt-4o"))
            res = lapian_mgr.shot_chat(
                body.get("projectId",""), body.get("shotId",""),
                body.get("message",""), body.get("history",[]),
                api_base, api_key, model)
            self._json_resp(res)
        elif path == "/api/lapian/export":
            res = lapian_mgr.export_report(body.get("projectId",""), body.get("fmt","json"))
            if res.get("ok"):
                content = res["content"]
                mime    = res.get("mime","text/plain")
                fname   = res.get("filename","export.txt")
                enc = content.encode("utf-8") if isinstance(content, str) else content
                self.send_response(200)
                self.send_header("Content-Type", f"{mime}; charset=utf-8")
                self.send_header("Content-Disposition", f'attachment; filename="{fname}"')
                self.send_header("Content-Length", str(len(enc)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(enc)
            else:
                self._json_resp(res)
        elif path == "/api/lapian/shot/capture-frame":
            res = lapian_mgr.capture_custom_frame(
                body.get("projectId",""), body.get("shotId",""),
                body.get("frameData",""), body.get("replaceIndex",None))
            self._json_resp(res)
        elif path == "/api/lapian/download-url":
            ff = find_ffmpeg()
            if not ff:
                self._json_resp({"ok": False, "error": "FFmpeg 未安装"})
                return
            res = lapian_mgr.download_video_url(
                body.get("url",""), body.get("videoName",""),
                body.get("movieName",""), body.get("desc",""),
                body.get("mode","standard"), ff)
            self._json_resp(res)
        elif path == "/api/lapian/save-to-assets":
            target_proj_id = body.get("projectId", "")
            shot = body.get("shot", {})
            if not target_proj_id or not shot:
                self._json_resp({"ok": False, "error": "missing_params"})
                return
            
            data_db = json.loads(DATA_FILE.read_text(encoding="utf-8"))
            target_proj = None
            for p in data_db.get("projects", []):
                if p.get("id") == target_proj_id:
                    target_proj = p
                    break
            
            if not target_proj:
                self._json_resp({"ok": False, "error": "target_project_not_found"})
                return
            
            new_prompt = {
                "id": f"pr_{uuid.uuid4().hex[:12]}",
                "title": f"镜头_{shot.get('index', 1)}_{shot.get('summary', '未命名')[:20]}",
                "content": shot.get("prompt", ""),
                "notes": f"【时段时间】{shot.get('startTime')} - {shot.get('endTime')}\n【视听描述】\n{shot.get('desc', '')}",
                "image": shot.get("img", ""),
                "created_at": time.strftime("%Y-%m-%d %H:%M:%S")
            }
            target_proj["video_prompts"] = target_proj.get("video_prompts", []) or []
            target_proj["video_prompts"].append(new_prompt)
            
            DATA_FILE.write_text(json.dumps(data_db, ensure_ascii=False, indent=2), encoding="utf-8")
            self._json_resp({"ok": True, "promptId": new_prompt["id"]})
        elif path == "/api/import-bundle":
            return self._handle_import_bundle()
        elif path == "/api/studio-config":
            cfg = _load_studio_config()
            new_dir_str = body.get("data_dir", "").strip()
            if new_dir_str:
                new_dir = Path(new_dir_str).resolve()
                migrate = body.get("migrate", True)
                migrated, errors = [], []
                if migrate and new_dir != DATA_DIR:
                    new_dir.mkdir(parents=True, exist_ok=True)
                    for item in DATA_DIR.iterdir():
                        dest = new_dir / item.name
                        try:
                            if item.is_dir():
                                if dest.exists():
                                    shutil.copytree(str(item), str(dest), dirs_exist_ok=True)
                                else:
                                    shutil.copytree(str(item), str(dest))
                            else:
                                shutil.copy2(str(item), str(dest))
                            migrated.append(item.name)
                        except Exception as e:
                            errors.append(f"{item.name}: {e}")
                cfg["data_dir"] = str(new_dir)
                _STUDIO_CONFIG_FILE.write_text(json.dumps(cfg, ensure_ascii=False, indent=2), encoding="utf-8")
                self._json_resp({"ok": True, "saved": str(new_dir), "migrated": migrated, "errors": errors, "restart_required": True})
            else:
                self._json_resp({"ok": True, "data_dir": str(DATA_DIR), "config_file": str(_STUDIO_CONFIG_FILE)})
        elif path == "/api/install-ffmpeg":
            if _ffmpeg_install.get("status") not in ("downloading", "extracting"):
                threading.Thread(target=_do_install_ffmpeg, daemon=True).start()
            self._json_resp({"ok": True, "status": _ffmpeg_install["status"]})
        elif path == "/api/download-video":
            self._handle_download_video(body)
        elif path == "/api/cli/push":
            self._handle_cli_push(body)
        elif path == "/api/jimeng-cli/login/headless":
            self._handle_jimeng_cli_login_headless(body)
        elif path == "/api/jimeng-cli/login/check":
            self._handle_jimeng_cli_login_check(body)
        elif path == "/api/jimeng-cli/user-credit":
            self._handle_jimeng_cli_user_credit(body)
        elif path == "/api/jimeng-cli/generate-video":
            self._handle_jimeng_cli_generate_video(body)
        elif path == "/api/jimeng-cli/query":
            self._handle_jimeng_cli_query(body)
        elif path == "/api/generate/enhance":
            self._handle_enhance(body)
        elif path == "/api/generate/video":
            self._handle_generate_video(body)
        elif path == "/api/generate/video-edit":
            self._handle_generate_video(body)
        elif path == "/api/generate/text":
            self._handle_generate_text(body)
        elif path == "/api/generate/rembg":
            self._handle_rembg(body)
        elif path == "/api/generate/image":
            self._handle_generate_image(body)
        elif path == "/api/generate/image-edit":
            image_data = str(body.get("image_data") or "")
            if image_data:
                existing = list(body.get("reference_images") or [])
                body["reference_images"] = [image_data] + existing
            self._handle_generate_image(body)
        elif path == "/api/generate/audio":
            self._handle_generate_audio(body)
        elif path == "/api/generate/enhance-video":
            self._handle_enhance_video(body)
        elif path == "/api/generate/outpaint":
            self._handle_outpaint(body)
        else:
            self._err(404, "Not found")

    # ── helpers ───────────────────────────────────────────────────────────
    def _read_body(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        return json.loads(raw)

    def _handle_upload(self, body):
        data_url = body.get("data_url", "")
        filename  = body.get("filename", "image.jpg") or "image.jpg"
        # strip unsafe chars from filename
        filename = re.sub(r"[^\w.\-]", "_", Path(filename).name)[:60]
        m = re.match(r"data:([^;]+);base64,(.+)", data_url, re.DOTALL)
        if not m:
            return self._err(400, "Invalid data_url")
        mime, b64 = m.group(1), m.group(2)
        ext = mimetypes.guess_extension(mime) or ".jpg"
        ext = ext.replace(".jpe", ".jpg")
        stem = Path(filename).stem
        # sub-folder by project
        proj_raw = body.get("project", "") or ""
        proj_folder = re.sub(r"[^\w\u4e00-\u9fff\-]", "_", proj_raw)[:40] if proj_raw else "default"
        save_dir = UPLOAD_DIR / proj_folder / "images"
        save_dir.mkdir(parents=True, exist_ok=True)
        out_path = save_dir / f"{stem}{ext}"
        counter = 1
        while out_path.exists():
            out_path = save_dir / f"{stem}_{counter}{ext}"
            counter += 1
        out_path.write_bytes(base64.b64decode(b64))
        self._json_resp({"ok": True, "path": f"/uploads/{proj_folder}/images/{out_path.name}"})

    def _handle_upload_material(self, body):
        project_id = body.get("projectId", "")
        filename = body.get("filename", "file.bin") or "file.bin"
        media_type = body.get("type", "IMAGE")  # "IMAGE" | "VIDEO" | "AUDIO"
        data_url = body.get("data_url", "")

        # Read DB
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, changed = _ensure_data_schema(data)
        if changed:
            DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        
        proj = next((p for p in data.get("projects", []) if p["id"] == project_id), None)
        if not proj:
            # Fallback to the first available project or create a default one if project_id is "ps-local" or not found
            projects = data.get("projects", [])
            if projects:
                proj = projects[0]
            else:
                proj = {
                    "id": "ps-local",
                    "name": "默认画布项目",
                    "description": "自动创建的默认画布项目",
                    "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                    "is_canvas": True,
                    "image_prompts": [],
                    "video_prompts": [],
                    "skill_prompts": []
                }
                data["projects"].append(proj)
                DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")

        # Strip unsafe chars from filename
        filename = re.sub(r"[^\w.\-]", "_", Path(filename).name)[:60]
        stem = Path(filename).stem

        proj_folder = re.sub(r"[^\w\u4e00-\u9fff\-]", "_", proj.get("name", "default"))[:40]
        sub = "images" if media_type == "IMAGE" else "videos" if media_type == "VIDEO" else "audio"
        save_dir = UPLOAD_DIR / proj_folder / "materials" / sub
        save_dir.mkdir(parents=True, exist_ok=True)

        # Support two modes: data_url (base64) or source_url (existing local path)
        source_url = body.get("source_url", "")
        if source_url and source_url.startswith("/"):
            # Already a local file, just register it (or copy to materials folder)
            src_path = DATA_DIR / source_url.lstrip("/")
            if not src_path.exists():
                src_path = BASE_DIR / source_url.lstrip("/")
            if not src_path.exists():
                return self._err(400, f"Source file not found: {source_url}")
            ext = src_path.suffix or ".png"
            out_path = save_dir / f"{stem}{ext}"
            counter = 1
            while out_path.exists():
                out_path = save_dir / f"{stem}_{counter}{ext}"
                counter += 1
            import shutil
            shutil.copy2(str(src_path), str(out_path))
        elif data_url:
            m = re.match(r"data:([^;]+);base64,(.+)", data_url, re.DOTALL)
            if not m:
                return self._err(400, "Invalid data_url")
            mime, b64 = m.group(1), m.group(2)
            ext = mimetypes.guess_extension(mime) or ".bin"
            out_path = save_dir / f"{stem}{ext}"
            counter = 1
            while out_path.exists():
                out_path = save_dir / f"{stem}_{counter}{ext}"
                counter += 1
            out_path.write_bytes(base64.b64decode(b64))
        else:
            return self._err(400, "Missing 'data_url' or 'source_url'")
        
        rel_path = f"/uploads/{proj_folder}/materials/{sub}/{out_path.name}"

        # Register in project materials list
        materials_list = proj.setdefault("materials", [])
        mat_item = {
            "id": uuid.uuid4().hex[:12],
            "name": out_path.name,
            "type": media_type,
            "storage_key": rel_path,
            "thumbnail_url": rel_path,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S")
        }
        materials_list.append(mat_item)
        
        # Save DB
        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        _sse_notify()

        self._json_resp({"ok": True, "path": rel_path, "item": mat_item})

    def _handle_video_upload(self):
        length = int(self.headers.get("Content-Length", 0))
        raw = self.rfile.read(length)
        filename  = unquote(self.headers.get("X-Filename", "video.mp4") or "video.mp4")
        proj_raw  = unquote(self.headers.get("X-Project",  "default")  or "default")
        proj_folder = re.sub(r"[^\w\u4e00-\u9fff\-]", "_", proj_raw)[:40] if proj_raw else "default"
        stem = re.sub(r"[^\w.\-]", "_", Path(filename).stem)[:50]
        ext  = Path(filename).suffix or ".mp4"
        save_dir = UPLOAD_DIR / proj_folder / "videos"
        save_dir.mkdir(parents=True, exist_ok=True)
        out_path = save_dir / f"{stem}{ext}"
        counter = 1
        while out_path.exists():
            out_path = save_dir / f"{stem}_{counter}{ext}"
            counter += 1
        out_path.write_bytes(raw)
        self._json_resp({"ok": True, "path": f"/uploads/{proj_folder}/videos/{out_path.name}"})

    def _handle_pdf_upload(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            if not raw:
                return self._err(400, "Empty file")
            filename  = unquote(self.headers.get("X-Filename", "document.bin") or "document.bin")
            proj_raw  = unquote(self.headers.get("X-Project",  "default") or "default")
            proj_folder = re.sub(r"[^\w\u4e00-\u9fff\-]", "_", proj_raw)[:40] if proj_raw else "default"
            stem = re.sub(r"[^\w\u4e00-\u9fff.\-]", "_", Path(filename).stem)[:50] or "document"
            ext  = Path(filename).suffix or ".bin"
            save_dir = UPLOAD_DIR / proj_folder / "docs"
            save_dir.mkdir(parents=True, exist_ok=True)
            out_path = save_dir / f"{stem}{ext}"
            counter = 1
            while out_path.exists():
                out_path = save_dir / f"{stem}_{counter}{ext}"
                counter += 1
            out_path.write_bytes(raw)
            # Extract text content for full-text search
            content_text = ""
            try:
                ext_lower = ext.lower()
                if ext_lower == ".txt" or ext_lower in (".md", ".markdown"):
                    content_text = raw.decode("utf-8", errors="replace")[:50000]
                elif ext_lower == ".csv":
                    content_text = raw.decode("utf-8", errors="replace")[:50000]
                elif ext_lower == ".pdf":
                    # Try pdfminer
                    try:
                        from pdfminer.high_level import extract_text as _pdf_extract
                        content_text = _pdf_extract(str(out_path))[:50000]
                    except ImportError:
                        pass
                elif ext_lower == ".docx":
                    try:
                        import zipfile as _zf, xml.etree.ElementTree as _ET
                        with _zf.ZipFile(out_path) as zf:
                            xml_content = zf.read("word/document.xml")
                        root = _ET.fromstring(xml_content)
                        ns = {"w": "http://schemas.openxmlformats.org/wordprocessingml/2006/main"}
                        content_text = "\n".join(t.text for t in root.iter("{%s}t" % ns["w"]) if t.text)[:50000]
                    except Exception:
                        pass
                elif ext_lower in (".xlsx", ".xls"):
                    try:
                        import zipfile as _zf, xml.etree.ElementTree as _ET
                        if ext_lower == ".xlsx":
                            with _zf.ZipFile(out_path) as zf:
                                shared = _ET.fromstring(zf.read("xl/sharedStrings.xml"))
                            ns = {"s": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
                            content_text = "\n".join(t.text for t in shared.iter("{%s}t" % ns["s"]) if t.text)[:50000]
                    except Exception:
                        pass
            except Exception:
                pass
            self._json_resp({
                "ok": True,
                "path": f"/uploads/{proj_folder}/docs/{out_path.name}",
                "filename": out_path.name,
                "size": len(raw),
                "content_text": content_text
            })
        except Exception as e:
            self._err(500, f"Upload failed: {e}")

    def _handle_preview_doc(self, body):
        try:
            rel = (body.get("path") or "").lstrip("/")
            file_path = (DATA_DIR / rel).resolve()
            if not file_path.exists():
                return self._err(404, "File not found")
            ext = file_path.suffix.lower()
            # Try mammoth (Python) for .docx first
            try:
                import mammoth as _mammoth
                with open(file_path, "rb") as f:
                    result = _mammoth.convert_to_html(f)
                return self._json_resp({"ok": True, "html": result.value})
            except ImportError:
                pass
            except Exception:
                pass
            # Fallback: win32com Word automation (Windows only)
            import tempfile
            try:
                import win32com.client
                word = win32com.client.Dispatch("Word.Application")
                word.Visible = False
                doc = word.Documents.Open(str(file_path))
                tmp = Path(tempfile.mktemp(suffix=".html"))
                doc.SaveAs2(str(tmp), FileFormat=10)  # wdFormatFilteredHTML
                doc.Close(False)
                word.Quit()
                html = tmp.read_text(encoding="utf-8", errors="replace")
                tmp.unlink(missing_ok=True)
                return self._json_resp({"ok": True, "html": html})
            except Exception as e:
                return self._err(500, f"Word conversion failed: {e}")
        except Exception as e:
            return self._err(500, str(e))

    def _handle_delete_pdf(self, body):
        project_id = body.get("projectId", "")
        pdf_id     = body.get("pdfId", "")
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        proj = next((p for p in data.get("projects", []) if p["id"] == project_id), None)
        if not proj:
            return self._err(404, "Project not found")
        pdfs = proj.get("pdf_files", [])
        item = next((p for p in pdfs if p["id"] == pdf_id), None)
        if item:
            try:
                rel = item.get("path", "").lstrip("/")[len("uploads/"):]
                full = (UPLOAD_DIR / rel).resolve()
                if UPLOAD_DIR.resolve() in full.parents and full.exists():
                    full.unlink()
            except Exception:
                pass
        proj["pdf_files"] = [p for p in pdfs if p["id"] != pdf_id]
        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        _sse_notify()
        self._json_resp({"ok": True})

    def _handle_cli_push(self, body):
        """CLI / agent endpoint: push a prompt into Prompt Studio."""
        project_name = (body.get("project_name") or "").strip()
        project_id   = (body.get("project_id") or "").strip()
        type_        = body.get("type", "skill")   # image | video | skill
        title        = (body.get("title") or "").strip()
        prompt       = (body.get("prompt") or "").strip()
        model        = body.get("model", "")
        tags         = body.get("tags", [])
        if isinstance(tags, str):
            tags = [t.strip() for t in tags.split(",") if t.strip()]
        if not prompt and type_ == "skill":
            return self._err(400, "prompt is required for skill type")
        cat_map = {"image": "image_prompts", "video": "video_prompts", "skill": "skill_prompts"}
        category = cat_map.get(type_, "skill_prompts")
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, _ = _ensure_data_schema(data)
        proj = None
        if project_id:
            proj = next((p for p in data.get("projects", []) if p["id"] == project_id), None)
        elif project_name:
            proj = next((p for p in data.get("projects", []) if p["name"] == project_name), None)
            if not proj:  # auto-create
                proj = {"id": uuid.uuid4().hex[:16], "name": project_name,
                        "image_prompts": [], "video_prompts": [], "skill_prompts": []}
                data.setdefault("projects", []).append(proj)
        else:
            projs = data.get("projects", [])
            if not projs:
                return self._err(400, "No projects found. Provide project_name.")
            proj = projs[0]
        pname = proj.get("name", project_name or "default")
        # ── Save agent-generated images ────────────────────────────────────
        # Single main image: image_base64 / image_url
        img_path = self._save_agent_media(pname, "image",
                        b64=body.get("image_base64",""), url=body.get("image_url",""),
                        filename=body.get("image_filename","agent_image.jpg"))
        # Gallery: list of {base64, url, filename} objects or plain URL strings
        gallery_in = body.get("gallery_images", [])
        gallery_paths = []
        if img_path: gallery_paths.append(img_path)
        for g in (gallery_in if isinstance(gallery_in, list) else []):
            if isinstance(g, str):
                p = self._save_agent_media(pname, "image", url=g)
            elif isinstance(g, dict):
                p = self._save_agent_media(pname, "image",
                        b64=g.get("base64",""), url=g.get("url",""),
                        filename=g.get("filename",""))
            else: p = ""
            if p: gallery_paths.append(p)
        # ── Save agent-generated video ─────────────────────────────────────
        vid_path = self._save_agent_media(pname, "video",
                        b64=body.get("video_base64",""), url=body.get("video_url",""),
                        filename=body.get("video_filename","agent_video.mp4"))
        item_id  = uuid.uuid4().hex[:16]
        new_item = {
            "id": item_id, "title": title or "Agent 推送",
            "prompt": prompt, "analysis": body.get("analysis", ""),
            "model": model, "tags": tags,
            "image": img_path or (gallery_paths[0] if gallery_paths else ""),
            "gallery": gallery_paths, "ref_image": "",
            "video": vid_path, "ref_images": [], "aspect": body.get("aspect", ""),
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S")
        }
        _ensure_item_schema(new_item)
        proj.setdefault(category, []).insert(0, new_item)
        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        _sse_notify()
        self._json_resp({"ok": True, "id": item_id,
                         "project_id": proj["id"], "project_name": proj["name"], "type": type_,
                         "image": new_item["image"], "gallery": gallery_paths, "video": vid_path})

    # ── CLI media helpers ─────────────────────────────────────────────────
    def _save_agent_media(self, proj_name: str, media_type: str,
                          b64: str = "", url: str = "", filename: str = "") -> str:
        """Save image/video from base64 or URL. Returns /uploads/... path or ''."""
        import urllib.request as _ur
        subdir = "images" if media_type == "image" else "videos"
        proj_folder = re.sub(r"[^\w\u4e00-\u9fff\-]", "_", proj_name)[:40] if proj_name else "default"
        save_dir = UPLOAD_DIR / proj_folder / subdir
        save_dir.mkdir(parents=True, exist_ok=True)
        raw = b""
        ext = ".jpg" if media_type == "image" else ".mp4"
        stem = re.sub(r"[^\w.\-]", "_", Path(filename).stem)[:50] if filename else "agent_gen"
        if b64:
            m = re.match(r"data:([^;]+);base64,(.+)", b64.strip(), re.DOTALL)
            if m:
                mime, data = m.group(1), m.group(2)
                ext = (mimetypes.guess_extension(mime) or ext).replace(".jpe", ".jpg")
                raw = base64.b64decode(data)
            else:
                try: raw = base64.b64decode(b64.strip())
                except Exception: return ""
        elif url:
            try:
                with _ur.urlopen(url, timeout=30) as r:
                    raw = r.read()
                    ct = r.headers.get("Content-Type", "")
                    guessed = mimetypes.guess_extension(ct.split(";")[0].strip())
                    if guessed: ext = guessed.replace(".jpe", ".jpg")
            except Exception: return ""
        if not raw: return ""
        if not stem or stem == "agent_gen":
            stem = Path(url).stem[:40] if url else "agent_gen"
            stem = re.sub(r"[^\w\-]", "_", stem) or "agent_gen"
        out = save_dir / f"{stem}{ext}"
        counter = 1
        while out.exists():
            out = save_dir / f"{stem}_{counter}{ext}"; counter += 1
        out.write_bytes(raw)
        return f"/uploads/{proj_folder}/{subdir}/{out.name}"

    # ── CLI audio helpers ─────────────────────────────────────────────────
    def _handle_cli_audio_folders(self, query):
        """GET /api/cli/audio/folders?project=<name|id>"""
        AUDIO_EXTS = {'.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a', '.opus', '.weba', '.m4r', '.aiff', '.au'}
        project_ref = (query.get("project") or [""])[0]
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        results = []
        for proj in data.get("projects", []):
            if project_ref and project_ref not in (proj["id"], proj["name"]):
                continue
            for folder in proj.get("audio_folders", []):
                local_path = folder.get("localPath", "")
                file_count = 0
                accessible = False
                if local_path and os.path.isdir(local_path):
                    accessible = True
                    try:
                        for _, _, files in os.walk(local_path):
                            file_count += sum(1 for f in files if os.path.splitext(f)[1].lower() in AUDIO_EXTS)
                    except Exception:
                        pass
                results.append({
                    "project_id":   proj["id"],
                    "project_name": proj["name"],
                    "folder_id":    folder["id"],
                    "folder_name":  folder["name"],
                    "local_path":   local_path,
                    "file_count":   file_count,
                    "accessible":   accessible,
                    "added_at":     folder.get("added_at", ""),
                })
        self._json_resp({"ok": True, "count": len(results), "folders": results})

    def _handle_cli_audio_files(self, query):
        """GET /api/cli/audio/files?project=<name|id>&folder=<folder_id|name>&q=<search>&starred=<1|true>&limit=500"""
        AUDIO_EXTS = {'.mp3', '.wav', '.flac', '.ogg', '.aac', '.m4a', '.opus', '.weba', '.m4r', '.aiff', '.au'}
        project_ref  = (query.get("project") or [""])[0]
        folder_ref   = (query.get("folder")  or [""])[0]
        q            = (query.get("q")       or [""])[0].lower()
        starred_only = (query.get("starred") or [""])[0].lower() in ("1", "true", "yes")
        limit        = int((query.get("limit") or ["500"])[0])
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        if project_ref:
            proj = next((p for p in data.get("projects", []) if project_ref in (p["id"], p["name"])), None)
        else:
            # pick first project that actually has audio folders
            proj = next((p for p in data.get("projects", []) if p.get("audio_folders")), None)
        if not proj:
            return self._err(404, "No project with audio folders found")
        folder = next((f for f in proj.get("audio_folders", [])
                       if not folder_ref or folder_ref in (f["id"], f["name"])), None)
        if not folder:
            return self._err(404, f"Audio folder not found in project '{proj['name']}'."
                             " Use /api/cli/audio/folders to list available folders.")
        local_path = folder.get("localPath", "")
        if not local_path or not os.path.isdir(local_path):
            return self._err(400, f"Local path not accessible: {local_path}")
        translations = proj.get("audio_translations", {}).get(folder["id"], {})
        stars = set(proj.get("audio_stars", []))
        items = []
        for root, dirs, files in os.walk(local_path):
            dirs.sort()
            for fname in sorted(files):
                ext = os.path.splitext(fname)[1].lower()
                if ext not in AUDIO_EXTS:
                    continue
                abs_path = os.path.join(root, fname)
                rel_path = os.path.relpath(abs_path, local_path).replace('\\', '/')
                name_no_ext = os.path.splitext(fname)[0]
                cn_name = translations.get(name_no_ext, "")
                is_starred = abs_path in stars
                if starred_only and not is_starred:
                    continue
                if q and q not in fname.lower() and q not in cn_name.lower():
                    continue
                try:
                    size = os.path.getsize(abs_path)
                except Exception:
                    size = 0
                items.append({
                    "name":       fname,
                    "nameNoExt":  name_no_ext,
                    "ext":        ext.lstrip('.'),
                    "relPath":    rel_path,
                    "absPath":    abs_path,
                    "size":       size,
                    "cnName":     cn_name,
                    "starred":    is_starred,
                    "stream_url": f"/api/local-audio?path={quote(abs_path)}",
                })
                if len(items) >= limit:
                    break
            if len(items) >= limit:
                break
        self._json_resp({
            "ok":           True,
            "project_id":   proj["id"],
            "project_name": proj["name"],
            "folder_id":    folder["id"],
            "folder_name":  folder["name"],
            "local_path":   local_path,
            "count":        len(items),
            "items":        items,
        })

    # ── CLI read helpers ──────────────────────────────────────────────────
    def _handle_cli_list(self, query):
        """GET /api/cli/prompts?project=<name|id>&type=image|video|skill&limit=50"""
        project_ref = (query.get("project") or [""])[0]
        type_       = (query.get("type") or [""])[0] or None   # None = all
        limit       = int((query.get("limit") or ["200"])[0])
        data        = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        cat_map = {"image": "image_prompts", "video": "video_prompts", "skill": "skill_prompts"}
        cats = [cat_map[type_]] if type_ in cat_map else list(cat_map.values())
        results = []
        for proj in data.get("projects", []):
            if project_ref and project_ref not in (proj["id"], proj["name"]):
                continue
            for cat in cats:
                ptype = {v: k for k, v in cat_map.items()}[cat]
                for item in proj.get(cat, []):
                    results.append({
                        "id": item["id"], "type": ptype,
                        "project_id": proj["id"], "project_name": proj["name"],
                        "title": item.get("title",""), "model": item.get("model",""),
                        "tags": item.get("tags",[]), "aspect": item.get("aspect",""),
                        "image": item.get("image",""), "gallery": item.get("gallery",[]),
                        "video": item.get("video",""),
                        "ref_images": item.get("ref_images",[]),
                        "created_at": item.get("created_at",""),
                        "prompt_preview": (item.get("prompt") or "")[:120],
                    })
                    if len(results) >= limit:
                        break
        self._json_resp({"ok": True, "count": len(results), "items": results})

    def _handle_cli_get(self, query):
        """GET /api/cli/prompt?id=<id>  or  ?project=<name>&title=<title>&type=<type>"""
        item_id     = (query.get("id") or [""])[0]
        project_ref = (query.get("project") or [""])[0]
        title_q     = (query.get("title") or [""])[0].lower()
        type_       = (query.get("type") or [""])[0] or None
        data        = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        cat_map = {"image": "image_prompts", "video": "video_prompts", "skill": "skill_prompts"}
        cats = [cat_map[type_]] if type_ in cat_map else list(cat_map.values())
        for proj in data.get("projects", []):
            if project_ref and project_ref not in (proj["id"], proj["name"]):
                continue
            for cat in cats:
                ptype = {v: k for k, v in cat_map.items()}[cat]
                for item in proj.get(cat, []):
                    match_id    = item_id and item["id"] == item_id
                    match_title = title_q and title_q in (item.get("title") or "").lower()
                    if match_id or match_title:
                        return self._json_resp({"ok": True, "type": ptype,
                            "project_id": proj["id"], "project_name": proj["name"],
                            "item": item})
        self._err(404, "Prompt not found")

    def _handle_cli_search(self, query):
        """GET /api/cli/search?q=<text>&project=<name>&type=<type>&limit=20"""
        q           = (query.get("q") or [""])[0].lower()
        project_ref = (query.get("project") or [""])[0]
        type_       = (query.get("type") or [""])[0] or None
        limit       = int((query.get("limit") or ["20"])[0])
        if not q:
            return self._err(400, "q is required")
        data    = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        cat_map = {"image": "image_prompts", "video": "video_prompts", "skill": "skill_prompts"}
        cats    = [cat_map[type_]] if type_ in cat_map else list(cat_map.values())
        results = []
        for proj in data.get("projects", []):
            if project_ref and project_ref not in (proj["id"], proj["name"]):
                continue
            for cat in cats:
                ptype = {v: k for k, v in cat_map.items()}[cat]
                for item in proj.get(cat, []):
                    haystack = " ".join([
                        item.get("title",""), item.get("prompt",""),
                        item.get("analysis",""), " ".join(item.get("tags",[]))
                    ]).lower()
                    if q in haystack:
                        results.append({
                            "id": item["id"], "type": ptype,
                            "project_id": proj["id"], "project_name": proj["name"],
                            "title": item.get("title",""), "model": item.get("model",""),
                            "tags": item.get("tags",[]),
                            "image": item.get("image",""), "gallery": item.get("gallery",[]),
                            "video": item.get("video",""),
                            "prompt": item.get("prompt",""),
                            "analysis": item.get("analysis",""),
                        })
                        if len(results) >= limit:
                            break
        self._json_resp({"ok": True, "query": q, "count": len(results), "items": results})

    def _handle_save_prompt(self, body):
        project_id = body.get("projectId", "")
        category   = body.get("category", "skill_prompts")
        title      = body.get("title", "")
        prompt     = body.get("prompt", "")
        model      = body.get("model", "")
        tags       = body.get("tags", [])

        if not prompt:
            return self._err(400, "prompt is required")

        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, changed = _ensure_data_schema(data)
        if changed:
            DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        proj = next((p for p in data.get("projects", []) if p["id"] == project_id), None)
        if not proj:
            return self._err(404, "Project not found")

        analysis   = body.get("analysis", "")
        item_id    = body.get("id", "")
        
        existing_item = None
        if item_id:
            existing_item = next((item for item in proj.get(category, []) if item.get("id") == item_id), None)

        if existing_item:
            existing_item["title"] = title or existing_item.get("title", "未命名提示词")
            existing_item["prompt"] = prompt
            existing_item["model"] = model
            existing_item["tags"] = tags
            existing_item["analysis"] = analysis
            existing_item["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
            new_item = existing_item
        else:
            if not item_id:
                item_id = uuid.uuid4().hex[:16]
            new_item = {
                "id": item_id, "title": title or "未命名提示词",
                "prompt": prompt, "analysis": analysis, "model": model, "tags": tags,
                "image": "", "video": "", "ref_images": [], "aspect": "",
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%S")
            }
            _ensure_item_schema(new_item)
            proj.setdefault(category, []).insert(0, new_item)

        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        _sse_notify()
        self._json_resp({"ok": True, "item": new_item})

    def _handle_create_project(self, body):
        name = (body.get("name") or "").strip()
        if not name:
            return self._err(400, "Missing name")
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, changed = _ensure_data_schema(data)
        if changed:
            DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        proj = {"id": uuid.uuid4().hex[:16], "name": name,
                "image_prompts": [], "video_prompts": [], "skill_prompts": []}
        data.setdefault("projects", []).append(proj)
        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        _sse_notify()
        self._json_resp({"ok": True, "project": proj})

    def _handle_rename_project(self, body):
        project_id = body.get("projectId", "")
        name = (body.get("name") or "").strip()
        if not project_id:
            return self._err(400, "Missing projectId")
        if not name:
            return self._err(400, "Missing name")
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, changed = _ensure_data_schema(data)
        proj = next((p for p in data.get("projects", []) if p["id"] == project_id), None)
        if not proj:
            return self._err(404, "Project not found")
        proj["name"] = name
        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        _sse_notify()
        self._json_resp({"ok": True})

    def _handle_delete_prompt(self, body):
        project_id = body.get("projectId", "")
        category = body.get("category", "")
        prompt_id = body.get("promptId", "")
        delete_media = bool(body.get("deleteMedia"))
        if category not in {"image_prompts", "video_prompts", "skill_prompts"}:
            return self._err(400, "Invalid category")

        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, changed = _ensure_data_schema(data)
        if changed:
            DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        proj = next((p for p in data.get("projects", []) if p.get("id") == project_id), None)
        if not proj:
            return self._err(404, "Project not found")
        items = proj.get(category, []) or []
        idx = next((i for i, item in enumerate(items) if item.get("id") == prompt_id), -1)
        if idx < 0:
            return self._err(404, "Prompt not found")

        media_refs = _item_upload_refs(items[idx])
        del items[idx]
        proj[category] = items

        media_result = {"files": 0, "bytes": 0, "deleted": [], "skipped": []}
        if delete_media and media_refs:
            media_result = _delete_upload_refs(media_refs, _data_upload_refs(data))

        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        _sse_notify()
        self._json_resp({"ok": True, "media": media_result})

    def _handle_delete_project(self, body):
        project_id = body.get("projectId", "")
        delete_media = bool(body.get("deleteMedia"))

        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, changed = _ensure_data_schema(data)
        if changed:
            DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        projects = data.get("projects", []) or []
        proj = next((p for p in projects if p.get("id") == project_id), None)
        if not proj:
            return self._err(404, "Project not found")

        media_refs = set()
        for key in ("image_prompts", "video_prompts"):
            for item in proj.get(key, []) or []:
                media_refs.update(_item_upload_refs(item))

        data["projects"] = [p for p in projects if p.get("id") != project_id]
        media_result = {"files": 0, "bytes": 0, "deleted": [], "skipped": []}
        if delete_media and media_refs:
            media_result = _delete_upload_refs(media_refs, _data_upload_refs(data))

        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        _sse_notify()
        self._json_resp({"ok": True, "media": media_result})

    def _handle_cleanup_media(self, _body):
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, changed = _ensure_data_schema(data)
        if changed:
            DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        media_result = _cleanup_unreferenced_uploads(data)
        self._json_resp({"ok": True, "media": media_result})

    def _handle_search_assets(self, query):
        q = (query.get("q", [""])[0] or "").strip()
        project_id = (query.get("projectId", [""])[0] or "").strip()
        item_type = (query.get("type", ["all"])[0] or "all").strip()
        limit = _as_int((query.get("limit", ["120"])[0] or "120"), default=120, min_value=1, max_value=500)
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, changed = _ensure_data_schema(data)
        if changed:
            DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        docs = _collect_docs(data)
        out = []
        for d in docs:
            if project_id and str(d.get("project_id", "")) != project_id:
                continue
            if item_type != "all" and str(d.get("type", "")) != item_type:
                continue
            score = _match_score(d, q) if q else 1
            if score <= 0:
                continue
            out.append({
                "id": d["id"],
                "project_id": d["project_id"],
                "project_name": d["project_name"],
                "category": d["category"],
                "type": d["type"],
                "title": d["title"],
                "tags": d["tags"],
                "model": d["model"],
                "prompt": d["prompt"][:400],
                "analysis": d["analysis"][:220],
                "created_at": d.get("created_at", ""),
                "updated_at": d.get("updated_at", ""),
                "quality": d.get("quality", {}),
                "lineage": d.get("lineage", {}),
                "score": score,
            })
        out.sort(key=lambda x: (x.get("score", 0), x.get("updated_at", "") or x.get("created_at", "")), reverse=True)
        self._json_resp({"ok": True, "query": q, "results": out[:limit], "total": len(out)})

    def _handle_detect_duplicates(self, query):
        project_id = (query.get("projectId", [""])[0] or "").strip()
        include_similar = (query.get("includeSimilar", ["1"])[0] or "1").strip() not in {"0", "false", "False"}
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, changed = _ensure_data_schema(data)
        if changed:
            DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        docs = _collect_docs(data)
        if project_id:
            docs = [d for d in docs if d.get("project_id") == project_id]

        exact_by_path = {}
        exact_by_sig = {}
        for d in docs:
            media_path = _extract_media_path(d)
            if media_path:
                exact_by_path.setdefault(media_path, []).append(d)
            sig = d.get("identity_sig", "")
            if sig:
                exact_by_sig.setdefault(sig, []).append(d)

        groups = []
        for source_map, reason in ((exact_by_path, "same_media_path"), (exact_by_sig, "same_signature")):
            for k, arr in source_map.items():
                if not k or len(arr) < 2:
                    continue
                refs = [{
                    "id": x["id"],
                    "project_id": x["project_id"],
                    "project_name": x["project_name"],
                    "category": x["category"],
                    "type": x["type"],
                    "title": x["title"],
                    "created_at": x.get("created_at", ""),
                    "updated_at": x.get("updated_at", ""),
                } for x in arr]
                groups.append({"reason": reason, "key": k, "count": len(refs), "items": refs})

        similar_pairs = []
        if include_similar:
            for i in range(len(docs)):
                a = docs[i]
                text_a = _normalize_text(a.get("prompt") or a.get("title"))
                if not text_a:
                    continue
                for j in range(i + 1, len(docs)):
                    b = docs[j]
                    if a.get("type") != b.get("type"):
                        continue
                    text_b = _normalize_text(b.get("prompt") or b.get("title"))
                    if not text_b:
                        continue
                    ratio = difflib.SequenceMatcher(None, text_a[:1800], text_b[:1800]).ratio()
                    if ratio >= 0.9:
                        similar_pairs.append({
                            "similarity": round(ratio, 4),
                            "a": {
                                "id": a["id"], "project_id": a["project_id"], "project_name": a["project_name"],
                                "category": a["category"], "type": a["type"], "title": a["title"],
                            },
                            "b": {
                                "id": b["id"], "project_id": b["project_id"], "project_name": b["project_name"],
                                "category": b["category"], "type": b["type"], "title": b["title"],
                            },
                        })
            similar_pairs.sort(key=lambda x: x["similarity"], reverse=True)

        self._json_resp({
            "ok": True,
            "projectId": project_id,
            "exact_groups": groups,
            "similar_pairs": similar_pairs[:120],
            "summary": {
                "items_scanned": len(docs),
                "exact_group_count": len(groups),
                "similar_pair_count": len(similar_pairs),
            }
        })

    def _handle_smart_folder_preview(self, query):
        folder_id = (query.get("id", [""])[0] or "").strip()
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, changed = _ensure_data_schema(data)
        if changed:
            DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        sf = _get_smart_folders()
        folder = next((f for f in sf.get("folders", []) if f.get("id") == folder_id), None)
        if not folder:
            return self._err(404, "Smart folder not found")
        docs = _collect_docs(data)
        matched = [d for d in docs if _apply_folder_rules(d, folder.get("rules", {}))]
        matched.sort(key=lambda x: (x.get("updated_at", "") or x.get("created_at", "")), reverse=True)
        self._json_resp({
            "ok": True,
            "folder": folder,
            "count": len(matched),
            "items": [{
                "id": x["id"],
                "project_id": x["project_id"],
                "project_name": x["project_name"],
                "category": x["category"],
                "type": x["type"],
                "title": x["title"],
                "model": x["model"],
                "tags": x["tags"],
                "quality": x["quality"],
                "lineage": x["lineage"],
                "updated_at": x.get("updated_at", ""),
                "created_at": x.get("created_at", ""),
            } for x in matched[:300]]
        })

    def _handle_save_smart_folders(self, body):
        saved = _save_smart_folders(body)
        self._json_resp({"ok": True, **saved})

    def _find_item_mut(self, data, project_id, category, item_id):
        projects = data.get("projects", []) or []
        proj = next((p for p in projects if p.get("id") == project_id), None)
        if not proj:
            return None, None
        if category not in {"image_prompts", "video_prompts", "skill_prompts"}:
            return proj, None
        items = proj.get(category, []) or []
        item = next((x for x in items if x.get("id") == item_id), None)
        return proj, item

    def _handle_asset_quality(self, body):
        project_id = body.get("projectId", "")
        category = body.get("category", "")
        item_id = body.get("itemId", "")
        quality_in = body.get("quality", {}) if isinstance(body.get("quality", {}), dict) else {}
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, changed = _ensure_data_schema(data)
        if changed:
            DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        proj, item = self._find_item_mut(data, project_id, category, item_id)
        if not proj or not item:
            return self._err(404, "Item not found")
        _ensure_item_schema(item)
        star = bool(quality_in.get("star", item["quality"].get("star", False)))
        rating = _as_int(quality_in.get("rating", item["quality"].get("rating", 0)), default=0, min_value=0, max_value=5)
        status = str(quality_in.get("status", item["quality"].get("status", ""))).strip()[:24]
        item["quality"] = {"star": star, "rating": rating, "status": status}
        item["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        _sse_notify()
        self._json_resp({"ok": True, "quality": item["quality"], "itemId": item_id})

    def _handle_save_palette(self, body):
        project_id = body.get("projectId", "")
        category = body.get("category", "")
        item_id = body.get("itemId", "")
        palette = body.get("palette", [])
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, changed = _ensure_data_schema(data)
        if changed:
            DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        proj, item = self._find_item_mut(data, project_id, category, item_id)
        if not proj or not item:
            return self._err(404, "Item not found")
        item["palette_cache"] = palette
        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        self._json_resp({"ok": True, "palette": palette, "itemId": item_id})

    def _handle_asset_lineage(self, body):
        project_id = body.get("projectId", "")
        category = body.get("category", "")
        item_id = body.get("itemId", "")
        lineage_in = body.get("lineage", {}) if isinstance(body.get("lineage", {}), dict) else {}
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, changed = _ensure_data_schema(data)
        if changed:
            DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        proj, item = self._find_item_mut(data, project_id, category, item_id)
        if not proj or not item:
            return self._err(404, "Item not found")
        _ensure_item_schema(item)
        lin = item.get("lineage", {})
        if not isinstance(lin.get("history"), list):
            lin["history"] = []
        source_id = str(lineage_in.get("source_id", lin.get("source_id", ""))).strip()
        version = _as_int(lineage_in.get("version", lin.get("version", 1)), default=1, min_value=1, max_value=9999)
        note = str(lineage_in.get("note", "")).strip()
        prev_vid = str(lin.get("version_id", ""))
        next_vid = _item_version_id(item)
        if note:
            lin["history"].insert(0, {
                "time": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "note": note[:240],
                "from_version_id": prev_vid,
                "to_version_id": next_vid,
            })
            lin["history"] = lin["history"][:100]
        lin["source_id"] = source_id
        lin["version"] = version
        lin["version_id"] = next_vid
        item["lineage"] = lin
        item["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        _sse_notify()
        self._json_resp({"ok": True, "lineage": lin, "itemId": item_id})

    def _handle_export_bundle(self, body):
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, changed = _ensure_data_schema(data)
        if changed:
            DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        selected = body.get("selected", [])
        include_data_json = bool(body.get("includeDataJson", True))
        include_media = bool(body.get("includeMedia", True))
        include_prompts = bool(body.get("includePrompts", True))
        docs = _resolve_docs_by_refs(data, selected)
        if not docs:
            return self._err(400, "No valid selected items")
        stamp = time.strftime("%Y%m%d-%H%M%S")
        out_name = f"bundle-{stamp}-{uuid.uuid4().hex[:6]}.zip"
        out_path = EXPORT_DIR / out_name
        written_files = 0
        with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
            manifest = {
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "items": docs,
                "includeMedia": include_media,
                "includePrompts": include_prompts,
            }
            z.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
            written_files += 1
            if include_prompts:
                prompt_lines = []
                for d in docs:
                    prompt_lines.append(f"# {d.get('title') or d.get('id')}")
                    prompt_lines.append(f"- 项目: {d.get('project_name')}")
                    prompt_lines.append(f"- 类型: {d.get('type')}")
                    prompt_lines.append(f"- 模型: {d.get('model')}")
                    prompt_lines.append(f"- 标签: {', '.join(d.get('tags', []))}")
                    prompt_lines.append("")
                    prompt_lines.append(d.get("prompt", ""))
                    prompt_lines.append("\n---\n")
                z.writestr("prompts.md", "\n".join(prompt_lines).strip() + "\n")
                written_files += 1
            if include_data_json:
                z.writestr("data.partial.json", json.dumps({"items": docs}, ensure_ascii=False, indent=2))
                written_files += 1
            if include_media:
                for d in docs:
                    media_candidates = []
                    if d.get("image"):
                        media_candidates.append(d.get("image"))
                    if d.get("video"):
                        media_candidates.append(d.get("video"))
                    for ref in d.get("ref_images", []) or []:
                        media_candidates.append(ref)
                    for media_url in media_candidates:
                        rel = _normalize_upload_ref(media_url)
                        if not rel:
                            continue
                        try:
                            target = _upload_target(rel)
                        except Exception:
                            continue
                        if not target.exists() or not target.is_file():
                            continue
                        arcname = f"media/{rel}"
                        try:
                            z.write(target, arcname=arcname)
                            written_files += 1
                        except Exception:
                            continue
        stat = out_path.stat()
        self._json_resp({
            "ok": True,
            "bundle": {
                "name": out_name,
                "path": str(out_path),
                "download_url": f"/exports/{out_name}",
                "size": stat.st_size,
                "files": written_files,
                "items": len(docs),
            }
        })

    def _handle_snapshot_create(self, body):
        note = str(body.get("note", "")).strip()[:120]
        stamp = time.strftime("%Y%m%d-%H%M%S")
        name_core = f"snapshot-{stamp}-{uuid.uuid4().hex[:6]}"
        out_path = SNAPSHOT_DIR / f"{name_core}.zip"
        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, changed = _ensure_data_schema(data)
        if changed:
            DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as z:
            z.writestr("meta.json", json.dumps({
                "created_at": time.strftime("%Y-%m-%dT%H:%M:%S"),
                "note": note,
                "data_file": DATA_FILE.name,
            }, ensure_ascii=False, indent=2))
            z.writestr("data.json", json.dumps(data, ensure_ascii=False, indent=2))
            if CONFIG_FILE.exists():
                z.write(CONFIG_FILE, arcname="desktop_settings.json")
            if SMART_FOLDERS_FILE.exists():
                z.write(SMART_FOLDERS_FILE, arcname="smart_folders.json")
            if UPLOAD_DIR.exists():
                for fp in UPLOAD_DIR.rglob("*"):
                    if fp.is_file():
                        rel = fp.relative_to(UPLOAD_DIR).as_posix()
                        z.write(fp, arcname=f"uploads/{rel}")
        self._json_resp({"ok": True, "snapshot": {
            "name": out_path.name,
            "path": str(out_path),
            "size": out_path.stat().st_size,
            "note": note,
        }})

    def _handle_snapshot_restore(self, body):
        name = str(body.get("name", "")).strip()
        if not name:
            return self._err(400, "Missing snapshot name")
        target = (SNAPSHOT_DIR / name).resolve()
        try:
            target.relative_to(SNAPSHOT_DIR.resolve())
        except Exception:
            return self._err(400, "Invalid snapshot name")
        if not target.exists() or not target.is_file():
            return self._err(404, "Snapshot not found")
        try:
            with zipfile.ZipFile(target, "r") as z:
                names = set(z.namelist())
                if "data.json" not in names:
                    return self._err(400, "Invalid snapshot package")
                data_raw = z.read("data.json")
                data_obj = json.loads(data_raw.decode("utf-8"))
                data_obj, _ = _ensure_data_schema(data_obj)
                DATA_FILE.write_text(json.dumps(data_obj, ensure_ascii=False, indent=2), encoding="utf-8")
                if "desktop_settings.json" in names:
                    CONFIG_FILE.write_bytes(z.read("desktop_settings.json"))
                if "smart_folders.json" in names:
                    SMART_FOLDERS_FILE.write_bytes(z.read("smart_folders.json"))
                if UPLOAD_DIR.exists():
                    shutil.rmtree(UPLOAD_DIR, ignore_errors=True)
                UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
                for n in names:
                    if not n.startswith("uploads/") or n.endswith("/"):
                        continue
                    rel = n[len("uploads/"):]
                    out = (UPLOAD_DIR / rel).resolve()
                    try:
                        out.relative_to(UPLOAD_DIR.resolve())
                    except Exception:
                        continue
                    out.parent.mkdir(parents=True, exist_ok=True)
                    out.write_bytes(z.read(n))
        except Exception as e:
            return self._err(500, f"Restore failed: {e}")
        _sse_notify()
        self._json_resp({"ok": True, "restored": name})

    def _handle_gen_title(self, body):
        prompt   = (body.get("prompt") or "").strip()[:800]
        settings = _load_settings()
        api_key  = body.get("apiKey") or settings.get("imageApiKey") or settings.get("videoApiKey") or ""
        api_base = (body.get("apiBase") or settings.get("imageApiBase") or "https://api.openai.com/v1").rstrip("/")
        model    = body.get("model") or settings.get("imageModel") or settings.get("videoModel") or "gpt-4o-mini"
        if not prompt:
            return self._err(400, "Missing prompt")
        if not api_key:
            return self._err(400, "Missing apiKey")
        payload = json.dumps({
            "model": model,
            "temperature": 0.7,
            "messages": [
                {"role": "user", "content": 
                    f"请根据下面这段 AI 绘图提示词，用一句极其直白、通俗的中文，概括出这张图片画了什么内容（核心主体 + 画面场景）。\n\n"
                    f"{prompt}\n\n"
                    f"【硬性要求】\n"
                    f"1. 必须使用大白话、通俗易懂地总结（例如：'和风霓虹少女海报'、'丛林遗迹废土风景' 这样直白、一眼能看懂画了什么的内容，绝对不要使用晦涩、文艺、矫情或华而不实的艺术词汇）。\n"
                    f"2. 字数必须控制在 4 到 12 个汉字之间。\n"
                    f"3. 只需要直接输出这几个字的标题文字本身，千万不要带任何标点、任何引号、引言、多余的字或解释。"
                }
            ]
        }).encode()
        req = urllib.request.Request(
            f"{api_base}/chat/completions",
            data=payload,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                res_data = json.loads(resp.read().decode())
                title = res_data["choices"][0]["message"]["content"].strip()
                title = title.replace('"', '').replace('“', '').replace('”', '').replace('`', '')
                if not title:
                    return self._err(500, "大模型未能生成有效标题，API 实际返回为空。请检查设置中的模型名称是否支持。")
                return self._json_resp({"ok": True, "title": title})
        except urllib.error.HTTPError as e:
            err_msg = e.read().decode('utf-8', errors='ignore')
            try:
                err_json = json.loads(err_msg)
                detail = err_json.get("error", {}).get("message", err_msg)
            except Exception:
                detail = err_msg
            return self._err(502, f"大模型接口服务报错 ({e.code}): {detail}")
        except socket.timeout:
            return self._err(504, "网络请求超时：大模型服务商响应过慢，请检查大模型网络或重试。")
        except urllib.error.URLError as e:
            if isinstance(e.reason, socket.timeout):
                return self._err(504, "网络请求超时：大模型服务商响应过慢，请检查大模型网络或重试。")
            return self._err(502, f"无法连接到大模型接口: {e.reason}")
        except Exception as e:
            return self._err(500, f"服务器内部错误: {str(e)}")

    def _handle_rewrite_prompt(self, body):
        original = (body.get("prompt") or "").strip()
        instruction = (body.get("instruction") or "").strip()
        if not original:
            return self._err(400, "Missing prompt")
        if not instruction:
            return self._err(400, "Missing instruction")
        settings = _load_settings()
        api_key = settings.get("llmApiKey") or settings.get("imageApiKey") or ""
        api_base = (settings.get("llmApiBase") or settings.get("imageApiBase") or "https://api.openai.com/v1").rstrip("/")
        model = settings.get("llmModel") or settings.get("imageModel") or "gpt-4o-mini"
        if not api_key:
            return self._err(400, "Missing API Key in desktop settings")
        payload = json.dumps({
            "model": model,
            "max_tokens": 20000,
            "temperature": 0.7,
            "messages": [
                {"role": "system", "content":
                    "你是一个 AI 绘图提示词改写助手。用户会给你一段原始提示词和一个修改指令。"
                    "请根据指令对原始提示词进行修改，保留原始结构和风格，只改变指令要求的部分。"
                    "只输出修改后的提示词，不要加任何解释、引号或前缀。"
                    "如果原始提示词是英文就输出英文，中文就输出中文。"},
                {"role": "user", "content": f"原始提示词：\n{original}\n\n修改指令：{instruction}"}
            ]
        }).encode()
        req = urllib.request.Request(
            f"{api_base}/chat/completions",
            data=payload,
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            method="POST"
        )
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                data = json.loads(resp.read())
            choice = data["choices"][0]
            result = (choice["message"]["content"] or "").strip()
            if choice.get("finish_reason") == "length":
                result += "\n\n⚠️ [输出被截断，提示词可能不完整]"
            self._json_resp({"ok": True, "prompt": result})
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            try:   msg = (json.loads(raw).get("error") or {}).get("message") or raw[:200]
            except: msg = raw[:200]
            self._err(502, f"AI API {e.code}: {msg}")
        except Exception as e:
            self._err(502, str(e))

    def _handle_save_media(self, body):
        url        = body.get("url", "")
        media_type = body.get("mediaType", "")
        project_id = body.get("projectId", "")
        category   = body.get("category", "image_prompts")
        title         = body.get("title", "")
        prompt        = body.get("prompt", "")
        aspect        = body.get("aspect", "")
        analysis      = body.get("analysis", "")
        model         = body.get("model", "")
        tags          = body.get("tags", [])
        outfit_prompt = body.get("outfit_prompt", "")
        char_prompt   = body.get("char_prompt", "")
        scene_prompt  = body.get("scene_prompt", "")
        style_prompt  = body.get("style_prompt", "")
        cam_prompt    = body.get("cam_prompt", "")
        referer       = body.get("referer") or body.get("pageUrl") or ""
        cookie        = body.get("cookie", "")

        data = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        data, changed = _ensure_data_schema(data)
        if changed:
            DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        proj = next((p for p in data.get("projects", []) if p["id"] == project_id), None)
        if not proj:
            return self._err(404, "Project not found")

        # Download media
        raw = None
        forced_ext = ""
        ct = ""
        try:
            if url.startswith("/uploads/"):
                rel_in = unquote(url[len("/uploads/"):]).replace("\\", "/")
                local_path = (UPLOAD_DIR / rel_in).resolve()
                local_path.relative_to(UPLOAD_DIR.resolve())
                raw = local_path.read_bytes()
                ct = mimetypes.guess_type(str(local_path))[0] or "application/octet-stream"
                forced_ext = local_path.suffix.lower()
            elif url.startswith("data:"):
                m = re.match(r"data:([^;]+);base64,(.+)", url, re.DOTALL)
                if m:
                    ct = m.group(1)
                    raw = base64.b64decode(m.group(2))
                    forced_ext = mimetypes.guess_extension(ct) or ".jpg"
            else:
                if not media_type:
                    media_type = "video" if category == "video_prompts" else "image"
                raw, ct, forced_ext = _download_remote_media(
                    url, media_type=media_type, referer=referer, cookie=cookie,
                    timeout=120 if media_type == "video" else 30
                )
        except Exception as e:
            print(f"[save-media] Warning: download failed for {url}, using original url as fallback. Error: {e}")

        if raw:
            url_ext = _url_ext(url)
            is_video = (
                media_type == "video"
                or category == "video_prompts"
                or "video" in (ct or "")
                or url_ext in VIDEO_EXTS
                or forced_ext in VIDEO_EXTS
            )
            url_ext_ok = url_ext if url_ext in VIDEO_EXTS or url_ext in IMAGE_EXTS else ""
            mime_ext = "" if (ct == "application/octet-stream" and is_video) else (mimetypes.guess_extension(ct) or "")
            ext = forced_ext or url_ext_ok or mime_ext or (".mp4" if is_video else ".jpg")
            if ext == ".m3u8":
                ext = ".ts"
            ext = ext.replace(".jpe", ".jpg")
            proj_folder = re.sub(r"[^\w\u4e00-\u9fff\-]", "_", proj.get("name","default"))[:40]
            sub = "videos" if is_video else "images"
            save_dir = UPLOAD_DIR / proj_folder / sub
            save_dir.mkdir(parents=True, exist_ok=True)
            stem = f"clip_{uuid.uuid4().hex[:8]}"
            out_path = save_dir / f"{stem}{ext}"
            out_path.write_bytes(raw)
            rel = f"/uploads/{proj_folder}/{sub}/{out_path.name}"
        else:
            is_video = (media_type == "video" or category == "video_prompts" or _url_ext(url) in VIDEO_EXTS)
            sub = "videos" if is_video else "images"
            rel = url
            stem = f"clip_{uuid.uuid4().hex[:8]}"

        item_id = uuid.uuid4().hex[:16]
        new_item = {
            "id": item_id, "title": title or stem,
            "prompt": prompt, "model": model, "tags": tags,
            "image": rel if sub == "images" else "",
            "video": rel if sub == "videos" else "",
            "ref_images": [], "aspect": aspect, "analysis": analysis,
            "outfit_prompt": outfit_prompt, "char_prompt": char_prompt,
            "scene_prompt": scene_prompt, "style_prompt": style_prompt,
            "cam_prompt": cam_prompt,
            "created_at": time.strftime("%Y-%m-%dT%H:%M:%S")
        }
        _ensure_item_schema(new_item)
        proj.setdefault(category, []).insert(0, new_item)
        DATA_FILE.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
        _sse_notify()
        self._json_resp({"ok": True, "item": new_item})

    def _handle_reverse_prompt(self, body):
        url      = body.get("url", "")
        media_type = body.get("mediaType", "image")   # 'image' | 'video'
        settings = _load_settings()
        is_video = media_type == "video"
        api_key  = body.get("apiKey") or (settings.get("videoApiKey") if is_video else settings.get("imageApiKey")) or ""
        api_base = (
            body.get("apiBase")
            or (settings.get("videoApiBase") if is_video else settings.get("imageApiBase"))
            or "https://api.openai.com/v1"
        ).rstrip("/")
        model    = body.get("model") or (settings.get("videoModel") if is_video else settings.get("imageModel")) or "gpt-4o"
        lang     = body.get("lang", "zh")
        referer  = body.get("referer") or body.get("pageUrl") or ""
        cookie   = body.get("cookie", "")
        video_upload_timeout = _as_int(
            body.get("videoUploadTimeoutSec") or settings.get("videoUploadTimeoutSec") or 240,
            default=240, min_value=60, max_value=1800
        )
        video_upload_retries = _as_int(
            body.get("videoUploadRetries") or settings.get("videoUploadRetries") or 1,
            default=1, min_value=0, max_value=5
        )

        if not api_key:
            return self._err(400, "Missing apiKey")

        img_w = int(body.get("imgWidth")  or 0)
        img_h = int(body.get("imgHeight") or 0)

        def _aspect_note(w, h):
            if not w or not h: return ""
            from math import gcd
            g = gcd(w, h); rw, rh = w // g, h // g
            # Simplify over-complex ratios to nearest common
            common = [(1,1),(4,3),(3,2),(16,9),(21,9),(2,1),(3,4),(2,3),(9,16)]
            best = min(common, key=lambda r: abs(r[0]/r[1] - rw/rh))
            orient = "竖版" if h > w else ("横版" if w > h else "方形")
            return f"【图片实际尺寸】{w}×{h}px，比例约 {best[0]}:{best[1]}，{orient}画幅。请直接使用此数据描述画幅，无需从画面猜测。\n"

        dim_note = _aspect_note(img_w, img_h)

        default_instruction = settings.get("videoReverseInstruction") if is_video else settings.get("imageReverseInstruction")
        custom = (body.get("customInstruction") or default_instruction or "").strip()
        if custom:
            prompt_instruction = dim_note + custom
        elif lang == "zh":
            prompt_instruction = dim_note + (
                "【第一步：判断图片类型】先判断这张图属于哪种类型，然后按对应规则输出提示词：\n"
                "A. 角色设定参考图（Character Reference Sheet）：图中包含多视角立绘、表情图、道具图、配色板、数值/文字说明区块等——输出：①整体类型说明（character reference sheet, multi-view layout）②版式结构（有哪些区块、排列方式）③角色完整外观（整合所有视角信息）④画风与渲染风格⑤配色方案⑥武器/道具/配件⑦所有文字区块的内容摘要\n"
                "B. 漫画页/分格图（Comic/Manga Page）：图中包含多个面板/格子，有对话框或叙事性连续画面——输出：①分格数量与布局②每格内容摘要③整体画风④对话框样式\n"
                "C. 信息图/海报/UI截图（Infographic/Poster/UI）：以文字、图表、排版为主要内容——输出：①整体设计类型②版式结构③主要视觉元素④字体与配色风格\n"
                "D. 单张插画/摄影（普通图）：单一场景、单张人像或风景——按以下5段输出：\n"
                "请仔细分析这个媒体内容，生成一段结构化的中文AI生成提示词，按以下5个段落依次输出，段落之间空一行：\n"
                "【画风】按以下顺序判断并输出：①【第一步：渲染真实度】是否存在真实皮肤质感（毛孔/次表面散射）、真实布料纹理、真实光源？→若是：输出 hyperrealistic anime / photorealistic anime illustration，渲染技术为 PBR-based rendering + anime aesthetics，不得误写赛璐璐/厚涂；→若否：继续下步②【第二步：描线】有明显黑色描边→thick outlines/lineart，无描边→no outlines③【第三步：着色】平涂→cel-shading/flat shading，厚涂→painterly，写实→PBR/photo-real④【第四步：作品引用】仅当明确识别时才引用具体作品/游戏/动漫/电影/艺术家，不确定则写通用风格描述，绝对不得猜测⑤绘画/摄影类型（anime/concept art/oil painting/3D CG/landscape photography等英文关键词）⑥精细度（highly detailed/photorealistic/semi-realistic/stylized等）。\n"
                "【主体】先判断画面类型——若有人物：每个人物单独说明：①画面位置（左/中/右、前景/中景/背景）②面朝方向（正面朝向镜头/斜45度小侧脸/正侧面/斜45度背面/完全背对镜头）③若多人则描述站位关系及互动④外貌特征（发型发色/脸部/肤色/表情）⑤姿态动作——【重要：描述四肢必须用画面方位，例如：画面右侧的手握着.../画面左侧的腿踩在...，禁止说左手/右脚，因为角色面对镜头时人体左右与画面左右相反，AI容易判断错误】⑥【服装从头到脚逐部位，不得遗漏】头饰→颈部→上衣/外套/内搭→手部/臂部→下装→腰带→袜子/腿部→鞋子（每部位写款式/颜色/材质）⑦【铁律：画面中所有道具/物品一个不漏】每件物品写清：名称/颜色/款式/上面的文字标识/位置（握在画面某侧手/靠在某处/踩在某物上等），不得一笔带过。若无人物（风景/建筑/静物）：描述①主体是什么②形态特征③位置占比④受光状态⑤视觉焦点。\n"
                "【镜头】①景别（大远景/远景/全景/中景/中近景/近景/特写/大特写）②垂直视角（仰视感→低角度仰拍；俯视感→高角度俯拍；否则→平视）③水平视角（正面/正侧面/斜45°/背面/过肩）④焦距感（鱼眼/超广角/广角/标准/中长焦/长焦/超长焦）⑤景深与散景（浅/中/深，虚化程度）⑥透视感（强透视/正常/压缩透视）⑦构图方式（居中/三分法/对角线/框架/引导线等）⑧画幅（竖版/横版/方形/宽银幕及比例）⑨镜头特效（光晕/眩光/色散/暗角，有则描述）。\n"
                "【场景】环境类型与具体设定、前景/中景/背景的层次关系、空间纵深感、背景元素细节、主体与背景距离关系、时间/天气/季节氛围。\n"
                "【色调光影】整体色调与主配色、光源位置与性质（硬光/软光/侧光/顶光/逆光/漫射光等）、光影对比强度、高光与暗部表现、材质质感的光效体现、整体氛围。\n"
                "【准确性第一原则】：严格基于图片中真实可见的内容，不猜测、不补脑。直接输出提示词，不需要任何额外说明。"
            )
        else:
            prompt_instruction = (
                "Analyze this media and generate a detailed AI generation prompt that would recreate it. "
                "Include subject, style, lighting, composition, colors, camera details. "
                "Output only the prompt, no explanations."
            )

        # 强制格式约束，仅当使用系统默认指令时，才拼上标准的 JSON 结构，从而 100% 提取出标题、视觉报告
        if not custom:
            json_suffix = (
                "\n\n【重要格式要求】请务必将你的全部分析结果整理并以标准的 JSON 格式返回，不要带有任何多余的解释，必须以 '{' 开头和 '}' 结尾。JSON 格式如下：\n"
                "{\n"
                '  "title": "请为这张图/视频起一个简短、有意境的创意中文标题（15字以内）",\n'
                '  "reversePrompt": "这是根据画面提炼出的、用于AI重新生成该媒体的最终核心英文提示词（即作为 SD/Midjourney 绘图的 Prompt）",\n'
                '  "coreExpression": "对媒体核心情感、主题与艺术表达的简要提炼",\n'
                '  "style": "分析画风、媒介类型、精细度、描线、着色风格等",\n'
                '  "subject": "分析画面中的主体人物、外貌、姿态、动作、服装细节与道具细节",\n'
                '  "camera": "分析镜头景别、视角、焦距感、透视与构图方式",\n'
                '  "scene": "分析环境类型、场景层次、背景元素与空间纵深感",\n'
                '  "lighting": "分析整体色调、光源、光影对比与材质质感"\n'
                "}\n"
                "注意：必须输出标准的、无任何语法错误的合法 JSON 字符串，确保可以直接被 json.loads 解析。"
            )
            prompt_instruction += json_suffix

        # Download media
        try:
            if url.startswith("/uploads/"):
                rel = unquote(url[len("/uploads/"):]).replace("\\", "/")
                local_path = (UPLOAD_DIR / rel).resolve()
                local_path.relative_to(UPLOAD_DIR.resolve())
                raw = local_path.read_bytes()
                ct = mimetypes.guess_type(str(local_path))[0] or ("video/mp4" if media_type == "video" else "image/jpeg")
            else:
                raw, ct, _forced_ext = _download_remote_media(
                    url, media_type=media_type, referer=referer, cookie=cookie,
                    timeout=120 if media_type == "video" else 60
                )
        except Exception as e:
            return self._err(502, f"Download failed: {e}")

        b64 = base64.b64encode(raw).decode()

        # Use native Gemini API only when pointing at Google's endpoint
        # Third-party proxies (yunwu.ai, etc.) use OpenAI-compatible path even with gemini models
        use_gemini = "generativelanguage.googleapis.com" in api_base

        try:
            if use_gemini and media_type == "video":
                result_text = self._gemini_reverse_video(
                    raw, ct, api_key, model, prompt_instruction,
                    upload_timeout=video_upload_timeout,
                    upload_retries=video_upload_retries
                )
            elif use_gemini:
                result_text = self._gemini_reverse_image(b64, ct, api_key, model, prompt_instruction)
            else:
                result_text = self._openai_reverse(
                    b64, ct, api_base, api_key, model, prompt_instruction, media_type=media_type
                )
        except urllib.error.HTTPError as e:
            raw = e.read().decode("utf-8", errors="replace")
            try:
                j = json.loads(raw)
                # OpenAI: {"error":{"message":"..."}}
                # Gemini: {"error":{"message":"..."}}
                msg = (j.get("error") or {}).get("message") or raw[:400]
            except Exception:
                msg = raw[:400]
            return self._err(502, f"AI API {e.code} {e.reason}: {msg}")
        except Exception as e:
            if is_video and _is_timeout_error(e):
                if use_gemini:
                    return self._err(
                        504,
                        f"AI API timeout: 视频反推请求超时。"
                        f"当前上传超时阈值为 {video_upload_timeout}s，可在桌面端设置中调大，或缩短/压缩视频后重试。原始错误: {e}"
                    )
                return self._err(
                    504,
                    "AI API timeout: 非 Gemini 接口视频反推超时。"
                    "这通常是第三方 OpenAI 兼容接口不支持视频输入、或视频体积限制导致。"
                    "请确认该地址支持 `video_url` 输入并放宽上传限制，或改用 Gemini 官方地址。"
                    f"原始错误: {e}"
                )
            return self._err(502, f"AI API error: {e}")

        # If the AI returned a JSON art-brief structure, extract fields
        final_text  = result_text
        auto_title  = ""
        analysis    = ""
        stripped = result_text.strip()
        # Strip markdown code fences (```json ... ``` or ``` ... ```)
        if stripped.startswith("```"):
            stripped = re.sub(r"^```[a-zA-Z]*\n?", "", stripped)
            stripped = re.sub(r"\n?```$", "", stripped).strip()
        if stripped.startswith("{"):
            try:
                obj = json.loads(stripped)
                if "reversePrompt" in obj:
                    final_text = obj["reversePrompt"]
                if "title" in obj:
                    auto_title = str(obj["title"]).strip()
                analysis = _format_art_brief(obj)
            except Exception:
                pass  # not valid JSON, use raw text as-is

        # 如果没有成功解析出 JSON（比如用户使用了自定义指令），我们智能使用正则尝试从纯文本里分流出标题和报告
        if not auto_title or not analysis:
            # 1. 寻找可能存在的标题：形如 【标题】或 标题: 或 Title:
            title_patterns = [
                r"(?:【标题】|标题[:：]|Title[:：])\s*([^\n]+)",
                r"^#\s*([^\n]+)", # markdown 一级标题
            ]
            for pat in title_patterns:
                m = re.search(pat, result_text, re.IGNORECASE)
                if m:
                    auto_title = m.group(1).strip()
                    # 移掉纯文本里的标题行，让提示词干净
                    final_text = re.sub(re.escape(m.group(0)), "", final_text)
                    break

            # 2. 寻找可能存在的视觉报告：形如 【视觉分析】或 【分析】或 分析[:：]
            analysis_patterns = [
                r"(?:【视觉分析报告】|【分析报告】|【分析】|视觉分析[:：]|分析报告[:：]|分析[:：]|Analysis[:：])\s*([\s\S]+)$"
            ]
            for pat in analysis_patterns:
                m = re.search(pat, result_text, re.IGNORECASE)
                if m:
                    analysis = m.group(1).strip()
                    # 移掉纯文本里的分析报告部分，保证提示词主框内只有纯净的描述语
                    final_text = final_text.replace(m.group(0), "").strip()
                    break

        resp = {"ok": True, "prompt": final_text}
        if auto_title: resp["title"]    = auto_title
        if analysis:   resp["analysis"] = analysis
        try:
            self._json_resp(resp)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass

    def _openai_reverse(self, b64, ct, api_base, api_key, model, instruction, media_type="image"):
        # Normalize mime for OpenAI-compatible payloads
        if media_type == "video":
            if not ct or ct in {"application/octet-stream", "binary/octet-stream"}:
                ct = "video/mp4"
            media_part = {"type": "video_url", "video_url": {"url": f"data:{ct};base64,{b64}"}}
        else:
            ct_map = {"image/jpg": "image/jpeg", "image/jpe": "image/jpeg"}
            ct = ct_map.get(ct, ct)
            media_part = {"type": "image_url", "image_url": {"url": f"data:{ct};base64,{b64}"}}

        payload = json.dumps({
            "model": model,
            "max_tokens": 4096,
            "messages": [{"role": "user", "content": [
                media_part,
                {"type": "text", "text": instruction}
            ]}]
        }).encode()
        req = urllib.request.Request(
            f"{api_base}/chat/completions", data=payload,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=90) as r:
            data = json.loads(r.read())
        return data["choices"][0]["message"]["content"].strip()

    def _gemini_reverse_image(self, b64, ct, api_key, model, instruction):
        url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        payload = json.dumps({"contents": [{"parts": [
            {"inline_data": {"mime_type": ct, "data": b64}},
            {"text": instruction}
        ]}], "generationConfig": {"maxOutputTokens": 4096}}).encode()
        req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=90) as r:
            data = json.loads(r.read())
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()

    def _gemini_reverse_video(self, raw, ct, api_key, model, instruction, upload_timeout=240, upload_retries=1):
        # Step 1: upload to Gemini Files API
        size = len(raw)
        init_url = f"https://generativelanguage.googleapis.com/upload/v1beta/files?key={api_key}"
        meta = json.dumps({"file": {"display_name": "clip", "mime_type": ct}}).encode()
        upload_url = None
        for attempt in range(upload_retries + 1):
            req = urllib.request.Request(init_url, data=meta, headers={
                "X-Goog-Upload-Protocol": "resumable", "X-Goog-Upload-Command": "start",
                "X-Goog-Upload-Header-Content-Length": str(size),
                "X-Goog-Upload-Header-Content-Type": ct, "Content-Type": "application/json"
            }, method="POST")
            try:
                with urllib.request.urlopen(req, timeout=30) as r:
                    upload_url = r.headers.get("X-Goog-Upload-URL")
                break
            except Exception:
                if attempt >= upload_retries:
                    raise
                time.sleep(min(2 * (attempt + 1), 6))
        if not upload_url:
            raise RuntimeError("No upload URL from Gemini Files API")

        file_info = None
        for attempt in range(upload_retries + 1):
            req2 = urllib.request.Request(upload_url, data=raw, headers={
                "Content-Length": str(size),
                "X-Goog-Upload-Offset": "0", "X-Goog-Upload-Command": "upload, finalize"
            }, method="POST")
            try:
                with urllib.request.urlopen(req2, timeout=upload_timeout) as r:
                    file_info = json.loads(r.read())
                break
            except Exception:
                if attempt >= upload_retries:
                    raise
                time.sleep(min(2 * (attempt + 1), 6))
        if not file_info:
            raise RuntimeError("Gemini upload failed without response")
        file_uri = file_info["file"]["uri"]

        # Step 2: wait for file to be ACTIVE
        for _ in range(20):
            check_url = f"https://generativelanguage.googleapis.com/v1beta/files/{file_uri.split('/')[-1]}?key={api_key}"
            with urllib.request.urlopen(check_url, timeout=10) as r:
                fdata = json.loads(r.read())
            if fdata.get("state") == "ACTIVE":
                break
            time.sleep(3)

        # Step 3: generate content
        gen_url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
        payload = json.dumps({"contents": [{"parts": [
            {"file_data": {"mime_type": ct, "file_uri": file_uri}},
            {"text": instruction}
        ]}]}).encode()
        req3 = urllib.request.Request(gen_url, data=payload, headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req3, timeout=120) as r:
            data = json.loads(r.read())
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()

    def _resolve_jimeng_cli_media_path(self, value, media_kind="image", project_ref="default"):
        src = str(value or "").strip()
        if not src:
            return ""

        rel = _normalize_upload_ref(src)
        if rel:
            try:
                target = _upload_target(rel)
                if target.exists() and target.is_file():
                    return str(target)
            except Exception:
                pass

        if src.startswith("data:"):
            m = re.match(r"data:([^;]+);base64,(.+)", src, re.DOTALL)
            if not m:
                return ""
            mime, b64 = m.group(1), m.group(2)
            ext = (mimetypes.guess_extension(mime) or (".jpg" if media_kind == "image" else ".mp4")).replace(".jpe", ".jpg")
            proj_folder = re.sub(r"[^\w\u4e00-\u9fff\-]", "_", str(project_ref or "default"))[:40] or "default"
            tmp_dir = UPLOAD_DIR / proj_folder / "_jimeng_cli_tmp"
            tmp_dir.mkdir(parents=True, exist_ok=True)
            out = tmp_dir / f"{media_kind}_{uuid.uuid4().hex[:12]}{ext}"
            try:
                out.write_bytes(base64.b64decode(b64))
                return str(out)
            except Exception:
                return ""

        if src.startswith("http://") or src.startswith("https://"):
            proj_folder = re.sub(r"[^\w\u4e00-\u9fff\-]", "_", str(project_ref or "default"))[:40] or "default"
            tmp_dir = UPLOAD_DIR / proj_folder / "_jimeng_cli_tmp"
            tmp_dir.mkdir(parents=True, exist_ok=True)
            ext = _url_ext(src) or (".jpg" if media_kind == "image" else ".mp4")
            if not ext.startswith("."):
                ext = f".{ext}"
            out = tmp_dir / f"{media_kind}_{uuid.uuid4().hex[:12]}{ext}"
            try:
                req = urllib.request.Request(src, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=120) as r:
                    raw = r.read()
                out.write_bytes(raw)
                return str(out)
            except Exception:
                return ""

        p = Path(src)
        if p.exists() and p.is_file():
            return str(p.resolve())
        p2 = (DATA_DIR / src.lstrip("/")).resolve()
        try:
            p2.relative_to(DATA_DIR.resolve())
            if p2.exists() and p2.is_file():
                return str(p2)
        except Exception:
            pass
        return ""

    def _jimeng_cli_model_version(self, model_id):
        mid = str(model_id or "").strip()
        if mid == "seedance-2-fast-cli":
            return "seedance2.0fast"
        if mid == "seedance-2-cli":
            return "seedance2.0"
        if "fast" in mid:
            return "seedance2.0fast"
        return "seedance2.0"

    def _extract_submit_id_from_cli(self, payload, text):
        if isinstance(payload, dict):
            candidates = [
                payload.get("submit_id"),
                payload.get("task_id"),
                payload.get("id"),
                (payload.get("data") or {}).get("submit_id") if isinstance(payload.get("data"), dict) else None,
                (payload.get("data") or {}).get("task_id") if isinstance(payload.get("data"), dict) else None,
            ]
            for c in candidates:
                if c:
                    return str(c)
        m = re.search(r"submit_id\s*[:=]\s*([A-Za-z0-9\-]+)", text or "")
        return m.group(1) if m else ""

    def _extract_cli_video_url(self, payload):
        if not isinstance(payload, dict):
            return ""
        for key in ("video_url", "url", "result_url", "output_url"):
            v = payload.get(key)
            if isinstance(v, str) and v.startswith(("http://", "https://", "/")):
                return v
        for key in ("result_urls", "urls", "outputs", "videos"):
            v = payload.get(key)
            if isinstance(v, list) and v:
                first = v[0]
                if isinstance(first, str):
                    return first
                if isinstance(first, dict):
                    for k in ("url", "video_url", "output"):
                        vv = first.get(k)
                        if isinstance(vv, str) and vv:
                            return vv
        data = payload.get("data")
        if isinstance(data, dict):
            return self._extract_cli_video_url(data)
        return ""

    def _handle_jimeng_cli_login_headless(self, body):
        data = body if isinstance(body, dict) else {}
        use_relogin = str(data.get("relogin", "true")).lower() in ("1", "true", "yes", "on")
        cmd = ["relogin" if use_relogin else "login", "--headless"]
        run = _run_dreamina_cli(cmd, timeout=60)
        out_text = "\n".join(x for x in [run.get("stdout", ""), run.get("stderr", "")] if x)
        self._json_resp({
            "ok": run.get("ok", False),
            "returncode": run.get("returncode", -1),
            "verification_uri": _extract_cli_value(out_text, "verification_uri"),
            "user_code": _extract_cli_value(out_text, "user_code"),
            "device_code": _extract_cli_value(out_text, "device_code"),
            "expires_at": _extract_cli_value(out_text, "expires_at"),
            "raw": out_text,
            "command": run.get("command", []),
        })

    def _handle_jimeng_cli_login_check(self, body):
        data = body if isinstance(body, dict) else {}
        device_code = str(data.get("device_code", "")).strip()
        poll = _as_int(data.get("poll", 5), default=5, min_value=0, max_value=120)
        if not device_code:
            return self._json_resp({"ok": False, "error": "missing_device_code"})
        run = _run_dreamina_cli(["login", "checklogin", f"--device_code={device_code}", f"--poll={poll}"], timeout=max(30, poll + 20))
        out_text = "\n".join(x for x in [run.get("stdout", ""), run.get("stderr", "")] if x)
        success = ("OAuth 登录成功" in out_text) or ("LOGIN_SUCCESS" in out_text) or (run.get("returncode") == 0 and "登录成功" in out_text)
        self._json_resp({
            "ok": success,
            "returncode": run.get("returncode", -1),
            "user_id": _extract_cli_value(out_text, "user_id"),
            "vip_level": _extract_cli_value(out_text, "vip_level"),
            "total_credit": _extract_cli_value(out_text, "total_credit"),
            "raw": out_text,
            "command": run.get("command", []),
        })

    def _handle_jimeng_cli_user_credit(self, _body):
        run = _run_dreamina_cli(["user_credit"], timeout=30)
        out_text = run.get("stdout", "") or run.get("stderr", "")
        payload = _extract_json_from_cli_text(out_text)
        if isinstance(payload, dict):
            return self._json_resp({"ok": run.get("ok", False), "returncode": run.get("returncode", -1), **payload})
        self._json_resp({
            "ok": run.get("ok", False),
            "returncode": run.get("returncode", -1),
            "raw": out_text,
            "error": run.get("stderr", "") or run.get("stdout", "") or "user_credit_failed",
        })

    def _handle_jimeng_cli_generate_video(self, body):
        data = body if isinstance(body, dict) else {}
        prompt = str(data.get("prompt", "")).strip()
        model_id = str(data.get("model_id", "seedance-2-fast-cli")).strip() or "seedance-2-fast-cli"
        aspect_ratio = str(data.get("aspect_ratio", "16:9")).strip() or "16:9"
        duration_s = _as_int(data.get("duration_s", 5), default=5, min_value=4, max_value=15)
        resolution = str(data.get("resolution", "720p")).strip() or "720p"
        ref_mode = str(data.get("video_ref_mode", "imageRef")).strip() or "imageRef"
        project_ref = str(data.get("project_id", "default")).strip() or "default"

        start_image = self._resolve_jimeng_cli_media_path(data.get("start_image_url", ""), "image", project_ref)
        end_image = self._resolve_jimeng_cli_media_path(data.get("end_image_url", ""), "image", project_ref)

        image_refs = []
        if start_image:
            image_refs.append(start_image)
        if end_image:
            image_refs.append(end_image)
        for item in (data.get("element_images") or []):
            p = self._resolve_jimeng_cli_media_path(item, "image", project_ref)
            if p:
                image_refs.append(p)
        dedup_images = []
        for p in image_refs:
            if p not in dedup_images:
                dedup_images.append(p)
        image_refs = dedup_images[:9]

        video_refs = []
        for item in (data.get("ref_video_urls") or []):
            p = self._resolve_jimeng_cli_media_path(item, "video", project_ref)
            if p:
                video_refs.append(p)
        dedup_videos = []
        for p in video_refs:
            if p not in dedup_videos:
                dedup_videos.append(p)
        video_refs = dedup_videos[:3]

        audio_refs = []
        for item in (data.get("ref_audio_urls") or []):
            p = self._resolve_jimeng_cli_media_path(item, "audio", project_ref)
            if p:
                audio_refs.append(p)
        dedup_audios = []
        for p in audio_refs:
            if p not in dedup_audios:
                dedup_audios.append(p)
        audio_refs = dedup_audios[:3]

        model_version = self._jimeng_cli_model_version(model_id)
        if video_refs or audio_refs:
            if not image_refs and not video_refs:
                return self._json_resp({"ok": False, "error": "multimodal mode needs at least one image or video reference"})
            cmd = ["multimodal2video"]
            for p in image_refs:
                cmd += ["--image", p]
            for p in video_refs:
                cmd += ["--video", p]
            for p in audio_refs:
                cmd += ["--audio", p]
            if prompt:
                cmd += ["--prompt", prompt]
            cmd += [
                f"--duration={duration_s}",
                f"--ratio={aspect_ratio}",
                f"--video_resolution={resolution}",
                f"--model_version={model_version}",
                "--poll=0",
            ]
        elif ref_mode == "startEnd" and len(image_refs) >= 2:
            cmd = [
                "frames2video",
                "--first", image_refs[0],
                "--last", image_refs[1],
                "--prompt", prompt,
                f"--duration={duration_s}",
                f"--video_resolution={resolution}",
                f"--model_version={model_version}",
                "--poll=0",
            ]
        elif len(image_refs) >= 1:
            cmd = [
                "image2video",
                "--image", image_refs[0],
                "--prompt", prompt,
                f"--duration={duration_s}",
                f"--video_resolution={resolution}",
                f"--model_version={model_version}",
                "--poll=0",
            ]
        else:
            if not prompt:
                return self._json_resp({"ok": False, "error": "missing_prompt"})
            cmd = [
                "text2video",
                "--prompt", prompt,
                f"--duration={duration_s}",
                f"--ratio={aspect_ratio}",
                f"--video_resolution={resolution}",
                f"--model_version={model_version}",
                "--poll=0",
            ]

        run = _run_dreamina_cli(cmd, timeout=300)
        out_text = "\n".join(x for x in [run.get("stdout", ""), run.get("stderr", "")] if x)
        payload = _extract_json_from_cli_text(out_text)
        submit_id = self._extract_submit_id_from_cli(payload, out_text)
        gen_status = ""
        if isinstance(payload, dict):
            gen_status = str(payload.get("gen_status", payload.get("status", ""))).lower()

        if not submit_id:
            return self._json_resp({
                "ok": False,
                "error": run.get("stderr", "") or run.get("stdout", "") or "no_submit_id",
                "returncode": run.get("returncode", -1),
                "raw": out_text,
                "command": run.get("command", []),
            })

        self._json_resp({
            "ok": True,
            "submit_id": submit_id,
            "gen_status": gen_status or "querying",
            "returncode": run.get("returncode", -1),
            "raw": out_text,
            "command": run.get("command", []),
        })

    def _handle_jimeng_cli_query(self, body):
        data = body if isinstance(body, dict) else {}
        submit_id = str(data.get("submit_id", "")).strip()
        project_ref = str(data.get("project_id", "default")).strip() or "default"
        if not submit_id:
            return self._json_resp({"ok": False, "error": "missing_submit_id"})

        run = _run_dreamina_cli(["query_result", f"--submit_id={submit_id}"], timeout=120)
        out_text = "\n".join(x for x in [run.get("stdout", ""), run.get("stderr", "")] if x)
        payload = _extract_json_from_cli_text(out_text)
        if not isinstance(payload, dict):
            if run.get("returncode", 0) != 0:
                return self._json_resp({"ok": False, "status": "FAILED", "error": out_text or "query_failed"})
            return self._json_resp({"ok": True, "status": "RUNNING", "raw": out_text})

        raw_status = str(payload.get("gen_status", payload.get("status", ""))).strip().lower()
        if raw_status in ("querying", "running", "pending", "queued", "processing"):
            return self._json_resp({"ok": True, "status": "RUNNING", "raw_status": raw_status})

        if raw_status in ("fail", "failed", "error"):
            return self._json_resp({
                "ok": False,
                "status": "FAILED",
                "raw_status": raw_status,
                "error": str(payload.get("fail_reason", payload.get("error", "视频生成失败"))),
                "raw": out_text,
            })

        if raw_status in ("success", "succeeded", "completed", "done"):
            remote_url = self._extract_cli_video_url(payload)
            local_url = ""
            if remote_url and remote_url.startswith(("http://", "https://")):
                local_url = self._save_agent_media(
                    project_ref,
                    "video",
                    b64="",
                    url=remote_url,
                    filename=f"jimeng_{submit_id}.mp4",
                )
            display_url = local_url or remote_url
            if not display_url:
                return self._json_resp({
                    "ok": False,
                    "status": "FAILED",
                    "error": "任务成功但未解析到视频地址",
                    "raw": out_text,
                })
            return self._json_resp({
                "ok": True,
                "status": "SUCCEEDED",
                "videoUrl": display_url,
                "originalVideoUrl": remote_url or display_url,
                "raw_status": raw_status,
            })

        if run.get("returncode", 0) == 0:
            return self._json_resp({"ok": True, "status": "RUNNING", "raw_status": raw_status or "unknown"})
        return self._json_resp({"ok": False, "status": "FAILED", "error": out_text or "query_failed"})
    def _handle_download_video(self, body):
        """Download a remote video/stream URL via ffmpeg and save to uploads."""
        import subprocess as _sp
        data = body if isinstance(body, dict) else json.loads(body)
        video_url  = data.get("url", "").strip()
        project_id = data.get("projectId", "")
        referer    = data.get("referer", "")
        cookie     = data.get("cookie", "")

        if not video_url:
            self._json_resp({"ok": False, "error": "no_url"}); return


        ff = find_ffmpeg()
        if not ff:
            self._json_resp({"ok": False, "error": "ffmpeg_not_found",
                             "install": _ffmpeg_install}); return

        proj_folder = re.sub(r"[^\w\u4e00-\u9fff\-]", "_", project_id)[:40] or "default"
        save_dir = UPLOAD_DIR / proj_folder / "videos"
        save_dir.mkdir(parents=True, exist_ok=True)

        stem     = f"video_{int(time.time())}"
        out_path = save_dir / f"{stem}.mp4"

        is_dash = re.search(r'\.mpd([?#]|$)', video_url, re.I) is not None
        is_hls  = re.search(r'\.(m3u8|ts)([?#]|$)', video_url, re.I) is not None

        cmd = [ff, "-y", "-loglevel", "error"]
        extra_headers = ""
        if referer: extra_headers += f"Referer: {referer}\r\n"
        if cookie:  extra_headers += f"Cookie: {cookie}\r\n"
        if extra_headers:
            cmd += ["-headers", extra_headers]
        if is_dash:
            # ffmpeg's DASH demuxer has a hardcoded manifest size limit (~100KB).
            # Bypass completely: Python parses the MPD, downloads every segment,
            # then ffmpeg only does the final audio+video merge.
            try:
                import xml.etree.ElementTree as _ET
                import urllib.request as _ur

                _UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

                def _fetch(url):
                    _r2 = _ur.Request(url)
                    _r2.add_header('User-Agent', _UA)
                    if referer: _r2.add_header('Referer', referer)
                    if cookie:  _r2.add_header('Cookie', cookie)
                    with _ur.urlopen(_r2, timeout=120) as _rr:
                        return _rr.read()

                # 1. Download MPD (Python has no size limit)
                _mpd_bytes = _fetch(video_url)

                # 2. Parse MPD XML
                _root = _ET.fromstring(_mpd_bytes)
                _tag0 = _root.tag
                _ns = _tag0[1:_tag0.index('}')] if _tag0.startswith('{') else ''
                def _T(name): return f'{{{_ns}}}{name}' if _ns else name

                _base = video_url.rsplit('?', 1)[0].rsplit('/', 1)[0] + '/'
                _base_el = _root.find(f'.//{_T("BaseURL")}')
                if _base_el is not None and (_base_el.text or '').strip():
                    _b = _base_el.text.strip()
                    _base = _b if _b.startswith('http') else _base + _b

                def _abs(rel):
                    return rel if rel.startswith('http') else _base + rel

                # 3. Find best video + audio AdaptationSets
                _tracks = {}

                def _tmpl_apply(tmpl, rep_id, num=None):
                    t = tmpl.replace('$RepresentationID$', str(rep_id))
                    if num is not None:
                        t = re.sub(r'\$Number%0?(\d+)d\$', lambda m: str(num).zfill(int(m.group(1))), t)
                        t = t.replace('$Number$', str(num))
                    return t

                for _aset in _root.findall(f'.//{_T("AdaptationSet")}'):
                    # Determine type: mimeType or contentType on AdaptationSet
                    _mime = (_aset.get('mimeType') or _aset.get('contentType') or '').lower()
                    _kind = 'video' if 'video' in _mime else ('audio' if 'audio' in _mime else None)

                    # Fallback: check first Representation's mimeType or codecs
                    if not _kind:
                        _fr = _aset.find(f'{_T("Representation")}')
                        if _fr is not None:
                            _rm = (_fr.get('mimeType') or _fr.get('codecs') or '').lower()
                            _kind = 'video' if ('video' in _rm or _rm.startswith(('avc','hvc','hevc','vp9','av1'))) \
                                    else ('audio' if ('audio' in _rm or _rm.startswith(('mp4a','ac-3','ec-3','opus','flac'))) else None)

                    if not _kind:
                        continue

                    _reps = _aset.findall(f'{_T("Representation")}')
                    _best = max(_reps, key=lambda r: int(r.get('bandwidth', 0)), default=None)
                    if _best is None:
                        continue
                    _rep_id = _best.get('id', '')

                    # Try SegmentList (check rep → adaptation set)
                    _sl = _best.find(f'{_T("SegmentList")}') or _aset.find(f'{_T("SegmentList")}')
                    if _sl is not None:
                        _init_el = _sl.find(f'{_T("Initialization")}')
                        _init = _abs(_init_el.get('sourceURL', '')) if _init_el is not None else None
                        _segs = [_abs(s.get('media', '')) for s in _sl.findall(f'{_T("SegmentURL")}') if s.get('media')]
                        if _segs:
                            _tracks[_kind] = {'init': _init, 'segs': _segs}
                        continue

                    # Try SegmentTemplate (check rep → adaptation set → period → root)
                    _st = (_best.find(f'{_T("SegmentTemplate")}') or
                           _aset.find(f'{_T("SegmentTemplate")}') or
                           _root.find(f'.//{_T("SegmentTemplate")}'))
                    if _st is not None:
                        _init_tmpl = _st.get('initialization', '')
                        _media_tmpl = _st.get('media', '')
                        _start_num = int(_st.get('startNumber', 1))
                        _init = _abs(_tmpl_apply(_init_tmpl, _rep_id)) if _init_tmpl else None
                        _segs = []
                        _tl = _st.find(f'{_T("SegmentTimeline")}')
                        if _tl is not None:
                            _n = _start_num
                            for _s in _tl.findall(f'{_T("S")}'):
                                for _ in range(int(_s.get('r', 0)) + 1):
                                    _segs.append(_abs(_tmpl_apply(_media_tmpl, _rep_id, _n)))
                                    _n += 1
                        if _segs:
                            _tracks[_kind] = {'init': _init, 'segs': _segs}

                if not _tracks:
                    _rep_tag = _T("Representation")
                    _aset_tag = _T("AdaptationSet")
                    _dbg = '; '.join(
                        'aset[' + str(i) + '] mime=' + a.get('mimeType','') + ' ct=' + a.get('contentType','') + ' reps=' + str(len(a.findall(_rep_tag)))
                        for i, a in enumerate(_root.findall('.//' + _aset_tag))
                    )
                    raise Exception('MPD 中未找到可下载的流. AdaptationSets: [' + _dbg + ']')

                # 4. Download segments and concatenate per track
                def _dl_track(kind, info):
                    _tp = save_dir / f"{stem}_{kind}.mp4"
                    with open(_tp, 'wb') as _tf:
                        if info.get('init'):
                            _tf.write(_fetch(info['init']))
                        for _su in info['segs']:
                            _tf.write(_fetch(_su))
                    return _tp

                _vid_path = _dl_track('video', _tracks['video']) if 'video' in _tracks else None
                _aud_path = _dl_track('audio', _tracks['audio']) if 'audio' in _tracks else None

                # 5. Merge with ffmpeg
                if _vid_path and _aud_path:
                    _mc = [ff, '-y', '-loglevel', 'error',
                           '-i', str(_vid_path), '-i', str(_aud_path),
                           '-c', 'copy', str(out_path)]
                elif _vid_path:
                    _mc = [ff, '-y', '-loglevel', 'error',
                           '-i', str(_vid_path), '-c', 'copy', str(out_path)]
                else:
                    raise Exception('未找到视频轨道')

                _mr = _sp.run(_mc, capture_output=True, timeout=120)
                for _p in [_vid_path, _aud_path]:
                    if _p and _p.exists():
                        try: _p.unlink()
                        except Exception: pass

                if _mr.returncode == 0 and out_path.exists() and out_path.stat().st_size > 0:
                    self._json_resp({"ok": True,
                                     "path": f"/uploads/{proj_folder}/videos/{out_path.name}",
                                     "filename": out_path.name,
                                     "size": out_path.stat().st_size})
                else:
                    _err = (_mr.stderr or b'').decode('utf-8', errors='replace')[-600:]
                    if out_path.exists(): out_path.unlink(missing_ok=True)
                    self._json_resp({"ok": False, "error": _err or "ffmpeg_merge_failed"})
            except Exception as _de:
                self._json_resp({"ok": False, "error": f"dash_download_failed: {_de}"})
            return

        if is_hls:
            cmd += ["-i", video_url, "-c", "copy", "-bsf:a", "aac_adtstoasc", str(out_path)]
        else:
            cmd += ["-i", video_url, "-c", "copy", "-bsf:a", "aac_adtstoasc", str(out_path)]

        try:
            result = _sp.run(cmd, capture_output=True, timeout=600)
            if result.returncode == 0 and out_path.exists() and out_path.stat().st_size > 0:
                self._json_resp({
                    "ok": True,
                    "path": f"/uploads/{proj_folder}/videos/{out_path.name}",
                    "filename": out_path.name,
                    "size": out_path.stat().st_size
                })
            else:
                err = (result.stderr or b"").decode("utf-8", errors="replace")[-600:]
                if out_path.exists(): out_path.unlink(missing_ok=True)
                self._json_resp({"ok": False, "error": err or "ffmpeg_failed"})
        except _sp.TimeoutExpired:
            self._json_resp({"ok": False, "error": "timeout_600s"})
        except Exception as exc:
            self._json_resp({"ok": False, "error": str(exc)})

    def _handle_import_bundle(self):
        """Import a ZIP bundle exported by export-bundle. Extracts media, returns metadata for client merge."""
        import zipfile, io
        try:
            length = int(self.headers.get("Content-Length", 0))
            raw = self.rfile.read(length)
            proj_raw = unquote(self.headers.get("X-Project", "default") or "default")
            proj_folder = re.sub(r"[^\w\u4e00-\u9fff\-]", "_", proj_raw)[:40] or "default"
            zf = zipfile.ZipFile(io.BytesIO(raw))
            meta = None
            extracted_files = {}
            partial_meta = None
            for name in zf.namelist():
                if name in ("manifest.json", "metadata.json") or name.endswith("metadata.json"):
                    if meta is None:
                        meta = json.loads(zf.read(name))
                elif name == "data.partial.json":
                    if partial_meta is None:
                        partial_meta = json.loads(zf.read(name))
                elif not name.endswith("/"):
                    parts = name.split("/")
                    # strip leading "media/" folder
                    if parts[0] == "media" and len(parts) > 1:
                        rel = "/".join(parts[1:])
                    else:
                        rel = "/".join(parts[1:]) if len(parts) > 1 else name
                    if not rel:
                        continue
                    import pathlib as _pl
                    filename = _pl.Path(rel).name
                    out_dir = UPLOAD_DIR / proj_folder
                    out_path = out_dir / filename
                    out_path.parent.mkdir(parents=True, exist_ok=True)
                    out_path.write_bytes(zf.read(name))
                    new_rel = f"/uploads/{proj_folder}/{filename}"
                    # map both /uploads/original_rel and /old_flat variants
                    extracted_files["/uploads/" + rel] = new_rel
                    extracted_files["/" + rel.replace("/", "_")] = new_rel
                    extracted_files["/" + rel] = new_rel
            if meta is None and partial_meta is not None:
                meta = partial_meta
            zf.close()
            self._json_resp({"ok": True, "meta": meta, "file_map": extracted_files})
        except Exception as e:
            self._err(500, f"Import failed: {e}")

    def _handle_cli_docs(self, query):
        """GET /api/cli/docs?project=<name|id>&q=keyword&limit=100"""
        project_ref = (query.get("project") or [""])[0]
        q           = (query.get("q") or [""])[0].lower().strip()
        limit       = int((query.get("limit") or ["200"])[0])
        data        = json.loads(DATA_FILE.read_text(encoding="utf-8"))
        results = []
        for proj in data.get("projects", []):
            if project_ref and project_ref not in (proj["id"], proj["name"]):
                continue
            for doc in proj.get("pdf_files", []):
                if doc.get("is_folder"):
                    continue
                if q and q not in (doc.get("title") or "").lower() and q not in (doc.get("filename") or "").lower() and q not in (doc.get("notes") or "").lower():
                    continue
                results.append({
                    "id":           doc.get("id", ""),
                    "project_id":   proj["id"],
                    "project_name": proj["name"],
                    "title":        doc.get("title", ""),
                    "filename":     doc.get("filename", ""),
                    "path":         doc.get("path", ""),
                    "size":         doc.get("size", 0),
                    "tags":         doc.get("tags", []),
                    "notes":        doc.get("notes", ""),
                    "color":        doc.get("color", ""),
                    "created_at":   doc.get("created_at", ""),
                    "download_url": doc.get("path", ""),
                })
                if len(results) >= limit:
                    break
        self._json_resp({"ok": True, "count": len(results), "items": results})

    def _serve_local_audio(self, query):
        AUDIO_EXTS = {'.mp3','.wav','.ogg','.flac','.aac','.m4a','.opus','.weba','.aiff','.au','.m4r'}
        MIME_MAP = {'.mp3':'audio/mpeg','.wav':'audio/wav','.ogg':'audio/ogg','.flac':'audio/flac',
                    '.aac':'audio/aac','.m4a':'audio/mp4','.opus':'audio/opus','.weba':'audio/webm',
                    '.aiff':'audio/aiff','.au':'audio/basic','.m4r':'audio/mp4'}
        file_path = unquote((query.get('path') or [''])[0])
        if not file_path:
            return self._err(400, 'missing path')
        p = Path(file_path)
        if not p.is_file():
            return self._err(404, 'file not found')
        ext = p.suffix.lower()
        if ext not in AUDIO_EXTS:
            return self._err(400, 'not an audio file')
        mime = MIME_MAP.get(ext, 'audio/mpeg')
        file_size = p.stat().st_size
        range_header = self.headers.get('Range', '')
        try:
            with open(file_path, 'rb') as f:
                if range_header and range_header.startswith('bytes='):
                    parts = range_header[6:].split('-')
                    start = int(parts[0]) if parts[0] else 0
                    end = int(parts[1]) if len(parts) > 1 and parts[1] else file_size - 1
                    end = min(end, file_size - 1)
                    length = end - start + 1
                    self.send_response(206)
                    self.send_header('Content-Type', mime)
                    self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
                    self.send_header('Content-Length', str(length))
                    self.send_header('Accept-Ranges', 'bytes')
                    self._cors_headers()
                    self.end_headers()
                    f.seek(start)
                    remaining = length
                    while remaining > 0:
                        chunk = f.read(min(65536, remaining))
                        if not chunk: break
                        self.wfile.write(chunk)
                        remaining -= len(chunk)
                else:
                    self.send_response(200)
                    self.send_header('Content-Type', mime)
                    self.send_header('Content-Length', str(file_size))
                    self.send_header('Accept-Ranges', 'bytes')
                    self._cors_headers()
                    self.end_headers()
                    shutil.copyfileobj(f, self.wfile)
        except (BrokenPipeError, ConnectionAbortedError, ConnectionResetError):
            pass
        except Exception as e:
            try: self._err(500, str(e))
            except: pass

    def _handle_upload_to_public(self, body):
        """Upload a local file (by URL, path or base64) to a public image host (Catbox/Telegraph)."""
        local_url = body.get("url", "")
        file_path = body.get("file_path", "")
        base64_data = body.get("base64", "")
        try:
            file_data = None
            file_ext = "png"
            if base64_data:
                import base64
                if "," in base64_data:
                    header, base64_data = base64_data.split(",", 1)
                    if "image/jpeg" in header or "image/jpg" in header:
                        file_ext = "jpg"
                    elif "image/webp" in header:
                        file_ext = "webp"
                    elif "image/gif" in header:
                        file_ext = "gif"
                file_data = base64.b64decode(base64_data)
            elif file_path:
                p = Path(file_path)
                if not p.exists():
                    return self._err(400, f"File not found: {file_path}")
                file_data = p.read_bytes()
                file_ext = p.suffix.lstrip(".") or "png"
            elif local_url:
                # Resolve: blob or local URL → fetch
                if local_url.startswith("blob:"):
                    return self._err(400, "blob URLs must be converted to base64 by renderer process first")
                elif local_url.startswith("/"):
                    # Relative to DATA_DIR
                    rel = local_url.lstrip("/")
                    candidates = [DATA_DIR / rel, BASE_DIR / rel]
                    for c in candidates:
                        if c.exists():
                            file_data = c.read_bytes()
                            file_ext = c.suffix.lstrip(".") or "png"
                            break
                    if not file_data:
                        return self._err(400, f"Cannot resolve local path: {local_url}")
                elif "localhost" in local_url or "127.0.0.1" in local_url:
                    req = urllib.request.Request(local_url)
                    with urllib.request.urlopen(req, timeout=30) as resp:
                        file_data = resp.read()
                    # Guess extension from URL
                    url_path = urlparse(local_url).path
                    file_ext = url_path.rsplit(".", 1)[-1] if "." in url_path else "png"
                else:
                    return self._err(400, "URL is not a local URL")
            else:
                return self._err(400, "Missing 'base64', 'url' or 'file_path'")

            if not file_data:
                return self._err(500, "Failed to read file data")

            safe_ext = file_ext.lower().replace("jpeg", "jpg")
            if safe_ext not in ("png", "jpg", "webp", "gif"):
                safe_ext = "png"
            filename = f"image.{safe_ext}"

            # Try Catbox.moe
            try:
                boundary = uuid.uuid4().hex
                body_parts = []
                body_parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"reqtype\"\r\n\r\nfileupload".encode())
                body_parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"fileToUpload\"; filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n".encode() + file_data)
                body_parts.append(f"--{boundary}--\r\n".encode())
                multipart_body = b"\r\n".join(body_parts)
                req = urllib.request.Request(
                    "https://catbox.moe/user/api.php",
                    data=multipart_body,
                    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=60) as resp:
                    result = resp.read().decode().strip()
                    if result.startswith("http"):
                        return self._json_resp({"ok": True, "public_url": result})
            except Exception as e:
                print(f"[upload-to-public] Catbox failed: {e}")

            # Try Telegraph
            try:
                boundary = uuid.uuid4().hex
                body_parts = []
                body_parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n".encode() + file_data)
                body_parts.append(f"--{boundary}--\r\n".encode())
                multipart_body = b"\r\n".join(body_parts)
                req = urllib.request.Request(
                    "https://telegra.ph/upload",
                    data=multipart_body,
                    headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=60) as resp:
                    result = json.loads(resp.read().decode())
                    if isinstance(result, list) and result and result[0].get("src"):
                        public_url = f"https://telegra.ph{result[0]['src']}"
                        return self._json_resp({"ok": True, "public_url": public_url})
            except Exception as e:
                print(f"[upload-to-public] Telegraph failed: {e}")

            # Try sm.ms (国内可访问)
            try:
                import base64 as b64mod
                boundary = uuid.uuid4().hex
                body_parts = []
                body_parts.append(f"--{boundary}\r\nContent-Disposition: form-data; name=\"smfile\"; filename=\"{filename}\"\r\nContent-Type: application/octet-stream\r\n\r\n".encode() + file_data)
                body_parts.append(f"--{boundary}--\r\n".encode())
                multipart_body = b"\r\n".join(body_parts)
                req = urllib.request.Request(
                    "https://sm.ms/api/v2/upload",
                    data=multipart_body,
                    headers={
                        "Content-Type": f"multipart/form-data; boundary={boundary}",
                        "User-Agent": "Mozilla/5.0",
                    },
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=60) as resp:
                    result = json.loads(resp.read().decode())
                    smurl = ""
                    if result.get("success") and result.get("data", {}).get("url"):
                        smurl = result["data"]["url"]
                    elif result.get("code") == "image_repeated" and result.get("images"):
                        smurl = result["images"]
                    if smurl:
                        print(f"[upload-to-public] sm.ms succeeded: {smurl}")
                        return self._json_resp({"ok": True, "public_url": smurl})
            except Exception as e:
                print(f"[upload-to-public] sm.ms failed: {e}")

            # Try freeimage.host (国内可访问, 免费无需注册)
            try:
                import base64 as b64mod
                b64_str = b64mod.b64encode(file_data).decode()
                req = urllib.request.Request(
                    "https://freeimage.host/api/1/upload",
                    data=urllib.parse.urlencode({"key": "6d207e02198a847aa98d0a2a901485a5", "source": b64_str, "format": "json"}).encode(),
                    headers={"User-Agent": "Mozilla/5.0"},
                    method="POST"
                )
                with urllib.request.urlopen(req, timeout=60) as resp:
                    result = json.loads(resp.read().decode())
                    if result.get("status_code") == 200 and result.get("image", {}).get("url"):
                        furl = result["image"]["url"]
                        print(f"[upload-to-public] freeimage.host succeeded: {furl}")
                        return self._json_resp({"ok": True, "public_url": furl})
            except Exception as e:
                print(f"[upload-to-public] freeimage.host failed: {e}")

            self._err(500, "所有公网图床上传均失败（Catbox / Telegraph / sm.ms / freeimage.host），可能因网络原因无法连接。请配置 S3 存储或使用公网图片链接。")
        except Exception as e:
            self._err(500, f"Upload error: {e}")

    def _handle_generate_video(self, body):
        cfg = _load_settings()
        model_id = str(body.get("model_id") or "").strip()
        prompt = str(body.get("prompt") or "").strip()
        aspect_ratio = str(body.get("aspect_ratio") or "16:9")
        duration_s = int(body.get("duration_s") or 5)
        generate_audio = body.get("generate_audio", True)
        resolution = str(body.get("resolution") or "720p")
        node_id = str(body.get("node_id") or "")
        project_id = str(body.get("project_id") or "")
        video_ref_mode = str(body.get("video_ref_mode") or "imageRef")
        start_image_url = str(body.get("start_image_url") or "")
        end_image_url = str(body.get("end_image_url") or "")
        element_images = list(body.get("element_images") or [])
        ref_video_urls = list(body.get("ref_video_urls") or [])
        ref_audio_urls = list(body.get("ref_audio_urls") or [])
        # video-edit specific
        video_url = str(body.get("video_url") or "")
        image_urls = list(body.get("image_urls") or [])
        if not model_id:
            return self._err(400, "model_id is required")
        api_base = ""
        api_key = ""
        canvas_cfgs_raw = str(cfg.get("canvasModelConfigs") or "").strip()
        if canvas_cfgs_raw:
            try:
                for mc in json.loads(canvas_cfgs_raw).values():
                    if mc.get("modelName") == model_id:
                        api_base = str(mc.get("apiBase") or "").strip().rstrip("/")
                        api_key = str(mc.get("apiKey") or "").strip()
                        break
            except Exception:
                pass
        if not api_key:
            return self._err(400, f"视频模型 \"{model_id}\" 的 API Key 未配置，请在画布 API 设置中配置对应视频模型的 API Key")

        def _resolve_img(url):
            if not url:
                return url
            if url.startswith("/uploads/"):
                rel = url[len("/uploads/"):]
                p = UPLOAD_DIR / rel
                if p.exists():
                    ext = p.suffix.lower().lstrip(".")
                    mime = {"png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp"}.get(ext, "image/jpeg")
                    return f"data:{mime};base64,{base64.b64encode(p.read_bytes()).decode()}"
            return url

        def _download_save_video(remote_url):
            req2 = urllib.request.Request(remote_url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(req2, timeout=300) as r:
                vid_bytes = r.read()
            stem = f"vid_{node_id or uuid.uuid4().hex[:8]}"
            proj_folder = re.sub(r"[^\w\u4e00-\u9fff\-]", "_", project_id)[:40] if project_id else "video"
            save_dir = UPLOAD_DIR / proj_folder / "generated_video"
            save_dir.mkdir(parents=True, exist_ok=True)
            out_path = save_dir / f"{stem}.mp4"
            counter = 1
            while out_path.exists():
                out_path = save_dir / f"{stem}_{counter}.mp4"
                counter += 1
            out_path.write_bytes(vid_bytes)
            return f"/uploads/{proj_folder}/generated_video/{out_path.name}"

        def _poll_kie(task_id):
            poll_interval = 8
            max_attempts = 450
            consecutive_errors = 0
            for attempt in range(1, max_attempts + 1):
                time.sleep(poll_interval)
                try:
                    pr = urllib.request.Request(
                        f"{api_base}/api/v1/jobs/recordInfo?taskId={task_id}",
                        headers={"Authorization": f"Bearer {api_key}"})
                    with urllib.request.urlopen(pr, timeout=30) as r:
                        pd = json.loads(r.read().decode())
                    record = pd.get("data") or {}
                    raw_state = str(record.get("state") or "unknown").lower()
                    video_url_result = ""
                    result_json = record.get("resultJson")
                    if result_json:
                        try:
                            rj = json.loads(result_json) if isinstance(result_json, str) else result_json
                            urls = rj.get("resultUrls") or rj.get("result_urls") or []
                            video_url_result = (urls[0] if urls else rj.get("video_url") or rj.get("url") or "")
                        except Exception:
                            pass
                    if raw_state in ("success", "succeeded", "completed"):
                        if not video_url_result:
                            raise Exception("KIE task succeeded but no video URL in resultJson")
                        return video_url_result
                    if raw_state not in ("waiting", "running", "processing", "queued", "pending"):
                        fail_msg = record.get("failMsg") or record.get("failReason") or raw_state
                        raise Exception(f"KIE task failed: {fail_msg}")
                    consecutive_errors = 0
                except Exception as e:
                    msg = str(e)
                    if "task failed" in msg or "task succeeded" in msg:
                        raise
                    consecutive_errors += 1
                    if consecutive_errors >= 10:
                        raise Exception(f"KIE poll failed 10 consecutive times: {msg}")
            raise Exception("KIE video task timed out")

        def _poll_t8star_v3(task_id):
            poll_interval = 10
            max_attempts = 360
            consecutive_errors = 0
            for attempt in range(1, max_attempts + 1):
                time.sleep(poll_interval)
                try:
                    pr = urllib.request.Request(
                        f"{api_base}/seedance/v3/contents/generations/tasks/{task_id}",
                        headers={"Authorization": f"Bearer {api_key}"})
                    with urllib.request.urlopen(pr, timeout=30) as r:
                        pd = json.loads(r.read().decode())
                    raw_status = str(pd.get("status") or "unknown").lower()
                    video_url_result = pd.get("content", {}).get("video_url") or pd.get("data", {}).get("video_url") or pd.get("video_url") or ""
                    if raw_status in ("succeeded", "completed", "success"):
                        if not video_url_result:
                            raise Exception("T8Star task succeeded but no video_url")
                        return video_url_result
                    if raw_status in ("failed", "error", "expired", "cancelled"):
                        err_msg = pd.get("error", {}).get("message") or pd.get("error_message") or raw_status
                        raise Exception(f"T8Star task failed: {err_msg}")
                    consecutive_errors = 0
                except Exception as e:
                    msg = str(e)
                    if "task failed" in msg or "task succeeded" in msg:
                        raise
                    consecutive_errors += 1
                    if consecutive_errors >= 10:
                        raise Exception(f"T8Star poll failed 10 consecutive times: {msg}")
            raise Exception("T8Star video task timed out")

        def _poll_t8star_v2(task_id):
            poll_interval = 10
            max_attempts = 360
            consecutive_errors = 0
            for attempt in range(1, max_attempts + 1):
                time.sleep(poll_interval)
                try:
                    pr = urllib.request.Request(
                        f"{api_base}/v2/videos/generations/{task_id}",
                        headers={"Authorization": f"Bearer {api_key}"})
                    with urllib.request.urlopen(pr, timeout=30) as r:
                        pd = json.loads(r.read().decode())
                    raw_status = str(pd.get("status") or "unknown").upper()
                    video_url_result = pd.get("data", {}).get("output") or pd.get("video", {}).get("url") or pd.get("output") or pd.get("url") or ""
                    if raw_status in ("SUCCESS", "DONE", "SUCCEEDED", "COMPLETED"):
                        if not video_url_result:
                            raise Exception("T8Star v2 task succeeded but no video URL")
                        return video_url_result
                    if raw_status in ("FAILURE", "FAILED", "ERROR", "EXPIRED", "CANCELLED"):
                        fail_reason = pd.get("fail_reason") or pd.get("error") or raw_status
                        raise Exception(f"T8Star v2 task failed: {fail_reason}")
                    consecutive_errors = 0
                except Exception as e:
                    msg = str(e)
                    if "task failed" in msg or "task succeeded" in msg:
                        raise
                    consecutive_errors += 1
                    if consecutive_errors >= 10:
                        raise Exception(f"T8Star v2 poll failed 10 consecutive times: {msg}")
            raise Exception("T8Star v2 video task timed out")

        job_id = str(uuid.uuid4())
        _job_create(job_id)

        def _run():
            try:
                headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
                remote_video_url = ""

                if "kie.ai" in api_base:
                    # ── KIE.ai API ──
                    has_images = bool(start_image_url or element_images or image_urls)
                    KIE_MODEL_MAP = {
                        "grok-video": "grok-imagine/image-to-video" if has_images else "grok-imagine/text-to-video",
                        "wan-2.7-video": "wan2.7-i2v" if start_image_url else "wan2.7-t2v",
                        "kling-video": "kling/image-to-video" if has_images else "kling/text-to-video",
                    }
                    kie_model = KIE_MODEL_MAP.get(model_id, model_id)
                    inp: dict = {
                        "prompt": prompt,
                        "aspect_ratio": aspect_ratio,
                        "duration": str(duration_s),
                        "resolution": resolution,
                        "mode": "normal",
                    }
                    if start_image_url:
                        inp["first_frame_url"] = _resolve_img(start_image_url)
                    if end_image_url:
                        inp["last_frame_url"] = _resolve_img(end_image_url)
                    if element_images:
                        inp["reference_image_urls"] = [_resolve_img(u) for u in element_images[:9]]
                    if image_urls:
                        inp["image_urls"] = [_resolve_img(u) for u in image_urls[:7]]
                    if ref_video_urls:
                        inp["reference_video_urls"] = ref_video_urls
                    if ref_audio_urls:
                        inp["reference_audio_urls"] = ref_audio_urls
                    if video_url:
                        inp["video_url"] = video_url
                    task_body = {"model": kie_model, "input": inp}
                    req = urllib.request.Request(f"{api_base}/api/v1/jobs/createTask",
                        data=json.dumps(task_body).encode(), headers=headers, method="POST")
                    with urllib.request.urlopen(req, timeout=60) as r:
                        rd = json.loads(r.read().decode())
                    task_id = (rd.get("data") or {}).get("taskId") or (rd.get("data") or {}).get("recordId")
                    if not task_id:
                        raise Exception(f"KIE create task: no taskId in response: {str(rd)[:500]}")
                    print(f"[video] KIE task created id={task_id} model={kie_model}")
                    remote_video_url = _poll_kie(task_id)

                elif model_id in ("seedance-2", "seedance-2-fast"):
                    # ── T8Star Seedance v3 API ──
                    MODEL_MAP = {
                        "seedance-2": "doubao-seedance-2-0-260128",
                        "seedance-2-fast": "doubao-seedance-2-0-fast-260128",
                    }
                    t8_model = MODEL_MAP.get(model_id, "doubao-seedance-2-0-260128")
                    VALID_RATIOS = {"16:9", "4:3", "1:1", "3:4", "9:16", "21:9", "9:21", "adaptive"}
                    VALID_DURS = set(range(4, 16))
                    VALID_RES = {"480p", "720p", "1080p", "native1080p"}
                    eff_ratio = aspect_ratio if aspect_ratio in VALID_RATIOS else "16:9"
                    eff_dur = duration_s if duration_s in VALID_DURS else 5
                    eff_res = resolution if resolution in VALID_RES else "720p"
                    if eff_res == "1080p":
                        eff_res = "native1080p"
                    content = [{"type": "text", "text": prompt}]
                    if start_image_url:
                        content.append({"type": "image_url", "image_url": {"url": _resolve_img(start_image_url)}, "role": "first_frame"})
                    if end_image_url:
                        content.append({"type": "image_url", "image_url": {"url": _resolve_img(end_image_url)}, "role": "last_frame"})
                    for img in element_images[:9]:
                        content.append({"type": "image_url", "image_url": {"url": _resolve_img(img)}})
                    for vid in ref_video_urls[:4]:
                        content.append({"type": "video_url", "video_url": {"url": vid}})
                    for aud in ref_audio_urls[:2]:
                        content.append({"type": "audio_url", "audio_url": {"url": aud}})
                    task_body = {
                        "model": t8_model, "content": content,
                        "ratio": eff_ratio, "duration": eff_dur,
                        "resolution": eff_res, "generate_audio": bool(generate_audio),
                        "watermark": False,
                    }
                    req = urllib.request.Request(f"{api_base}/seedance/v3/contents/generations/tasks",
                        data=json.dumps(task_body).encode(), headers=headers, method="POST")
                    with urllib.request.urlopen(req, timeout=120) as r:
                        rd = json.loads(r.read().decode())
                    task_id = rd.get("id") or (rd.get("data") or {}).get("task_id") or (rd.get("data") or {}).get("id")
                    if not task_id:
                        raise Exception(f"T8Star Seedance create task: no task_id: {str(rd)[:500]}")
                    print(f"[video] T8Star Seedance task created id={task_id} model={t8_model}")
                    remote_video_url = _poll_t8star_v3(task_id)

                else:
                    # ── T8Star v2 generic (grok-video, kling-video, etc.) ──
                    GROK_VALID_RATIOS = {"16:9", "9:16", "1:1", "4:3", "3:4", "3:2", "2:3"}
                    GROK_VALID_DURS = [5, 10, 15]
                    eff_ratio = aspect_ratio if aspect_ratio in GROK_VALID_RATIOS else "16:9"
                    eff_dur = min(GROK_VALID_DURS, key=lambda x: abs(x - duration_s))
                    eff_res = resolution if resolution in {"480p", "720p", "1080p"} else "720p"
                    MODEL_MAP_V2 = {
                        "grok-video": "grok-video-3",
                        "kling-video": "kling-video",
                    }
                    t8_model = MODEL_MAP_V2.get(model_id, model_id)
                    task_body: dict = {
                        "model": t8_model, "prompt": prompt,
                        "ratio": eff_ratio, "duration": eff_dur, "resolution": eff_res,
                    }
                    imgs = element_images or image_urls
                    if imgs:
                        task_body["images"] = [_resolve_img(u) for u in imgs[:7]]
                    if start_image_url:
                        task_body["start_image"] = _resolve_img(start_image_url)
                    if video_url:
                        task_body["video_url"] = video_url
                    req = urllib.request.Request(f"{api_base}/v2/videos/generations",
                        data=json.dumps(task_body).encode(), headers=headers, method="POST")
                    with urllib.request.urlopen(req, timeout=60) as r:
                        rd = json.loads(r.read().decode())
                    task_id = rd.get("task_id") or rd.get("id") or (rd.get("data") or {}).get("task_id")
                    if not task_id:
                        raise Exception(f"T8Star v2 create task: no task_id: {str(rd)[:500]}")
                    print(f"[video] T8Star v2 task created id={task_id} model={t8_model}")
                    remote_video_url = _poll_t8star_v2(task_id)

                if not remote_video_url:
                    raise Exception("No video URL returned from API")
                local_url = _download_save_video(remote_video_url)
                _job_succeed(job_id, {
                    "videoUrl": local_url,
                    "originalVideoUrl": local_url,
                    "thumbnailUrl": None,
                })
            except urllib.error.HTTPError as e:
                try:
                    msg = json.loads(e.read().decode()).get("message") or f"HTTP {e.code}"
                except Exception:
                    msg = f"HTTP {e.code}"
                print(f"[video] job {job_id} HTTP error: {msg}")
                _job_fail(job_id, msg)
            except Exception as e:
                print(f"[video] job {job_id} failed: {e}")
                _job_fail(job_id, str(e))

        threading.Thread(target=_run, daemon=True).start()
        self._json_resp({"jobId": job_id})

    def _handle_generate_text(self, body):
        cfg = _load_settings()
        model_id = str(body.get("model") or body.get("model_id") or "").strip()
        prompt = str(body.get("prompt") or "").strip()
        if not model_id:
            return self._err(400, "model is required")
        if not prompt:
            return self._err(400, "prompt is required")
        api_base = ""
        api_key = ""
        model_name = model_id
        canvas_cfgs_raw = str(cfg.get("canvasModelConfigs") or "").strip()
        if canvas_cfgs_raw:
            try:
                canvas_cfgs = json.loads(canvas_cfgs_raw)
                for mc in canvas_cfgs.values():
                    if mc.get("modelName") == model_id:
                        api_base = str(mc.get("apiBase") or "").strip()
                        api_key = str(mc.get("apiKey") or "").strip()
                        model_name = str(mc.get("modelName") or model_id)
                        break
            except Exception:
                pass
        if not api_key:
            api_base = str(cfg.get("llmApiBase") or "https://api.openai.com/v1").strip()
            api_key = str(cfg.get("llmApiKey") or "").strip()
            model_name = str(cfg.get("llmModel") or model_id).strip()
        if not api_key:
            return self._err(400, "文本模型 API Key 未配置，请在画布 API 设置中配置对应模型的 API Key")
        api_base = api_base.rstrip("/")
        if api_base.endswith("/v1"):
            url = api_base + "/chat/completions"
        elif api_base.endswith("/v1beta"):
            url = api_base + "/openai/chat/completions"
        else:
            url = api_base + "/v1/chat/completions"
        messages = [{"role": "user", "content": prompt}]
        req_body = {"model": model_name, "messages": messages, "stream": True,
                    "temperature": 0.7, "max_tokens": 4096}
        req = urllib.request.Request(
            url, data=json.dumps(req_body).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
            method="POST",
        )
        try:
            resp = urllib.request.urlopen(req, timeout=120)
        except urllib.error.HTTPError as e:
            try:
                err_json = json.loads(e.read().decode())
                msg = str(err_json.get("error", {}).get("message", "") or err_json)
            except Exception:
                msg = f"HTTP {e.code}"
            return self._err(e.code, f"LLM API 错误: {msg}")
        except Exception as e:
            return self._err(500, f"LLM 请求失败: {e}")
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Accel-Buffering", "no")
        self._cors_headers()
        self.end_headers()
        try:
            buf = b""
            while True:
                chunk = resp.read(256)
                if not chunk:
                    break
                buf += chunk
                while b"\n" in buf:
                    line_bytes, buf = buf.split(b"\n", 1)
                    line_str = line_bytes.decode("utf-8", errors="replace").rstrip("\r")
                    if not line_str.startswith("data: "):
                        continue
                    payload = line_str[6:]
                    if payload == "[DONE]":
                        self.wfile.write(b"data: [DONE]\n\n")
                        self.wfile.flush()
                        break
                    try:
                        d = json.loads(payload)
                        text = (d.get("choices") or [{}])[0].get("delta", {}).get("content") or ""
                        if text:
                            out = json.dumps({"text": text}, ensure_ascii=False)
                            self.wfile.write(f"data: {out}\n\n".encode())
                            self.wfile.flush()
                    except Exception:
                        pass
        except Exception as e:
            print(f"[generate/text] stream error: {e}")
        finally:
            resp.close()

    def _handle_rembg(self, body):
        image_url = str(body.get("image_url") or "").strip()
        if not image_url:
            return self._err(400, "image_url is required")
        node_id = str(body.get("node_id") or "")
        project_id = str(body.get("project_id") or "")
        rembg_model_name = str(body.get("rembg_model") or "General Use (Light)")
        output_mask = bool(body.get("output_mask", False))
        # Resolve image bytes
        if image_url.startswith("/") and not image_url.startswith("//"):
            rel = image_url.lstrip("/")
            local_path = (DATA_DIR / rel).resolve()
            if not local_path.exists():
                local_path = (BASE_DIR / rel).resolve()
            if not local_path.exists():
                return self._err(400, f"Image not found: {image_url}")
            img_bytes_in = local_path.read_bytes()
        else:
            try:
                req = urllib.request.Request(image_url, headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=60) as r:
                    img_bytes_in = r.read()
            except Exception as e:
                return self._err(400, f"Failed to fetch image: {e}")
        job_id = str(uuid.uuid4())
        _job_create(job_id)
        def _run():
            try:
                try:
                    from rembg import remove, new_session
                    from PIL import Image as PILImage
                    import io as _io
                except ImportError:
                    _job_fail(job_id, "rembg 未安装，请运行: pip install rembg[gpu] 或 pip install rembg")
                    return
                MODEL_MAP = {
                    "General Use (Light)": "u2netp",
                    "General Use (Light 2K)": "u2netp",
                    "General Use (Heavy)": "isnet-general-use",
                    "Matting": "u2net",
                    "Portrait": "u2net_human_seg",
                }
                session_name = MODEL_MAP.get(rembg_model_name, "u2netp")
                session = new_session(session_name)
                pil_in = PILImage.open(_io.BytesIO(img_bytes_in))
                pil_out = remove(pil_in, session=session, only_mask=output_mask)
                buf = _io.BytesIO()
                pil_out.save(buf, format="PNG")
                img_bytes_out = buf.getvalue()
                stem = f"rembg_{node_id or uuid.uuid4().hex[:8]}"
                local_url = _save_image_local(img_bytes_out, stem, project_id, "rembg")
                w, h = pil_out.size
                _job_succeed(job_id, {"url": local_url, "thumbnailUrl": local_url, "originalUrl": local_url, "width": w, "height": h})
            except Exception as e:
                print(f"[rembg] job {job_id} failed: {e}")
                _job_fail(job_id, str(e))
        threading.Thread(target=_run, daemon=True).start()
        self._json_resp({"jobId": job_id})

    def _handle_generate_image(self, body):
        cfg = _load_settings()
        model_id = str(body.get("model_id") or "")
        api_base = ""
        api_key = ""
        use_model = model_id or "dall-e-3"
        canvas_cfgs_raw = str(cfg.get("canvasModelConfigs") or "").strip()
        if canvas_cfgs_raw and model_id:
            try:
                for mc in json.loads(canvas_cfgs_raw).values():
                    if mc.get("modelName") == model_id:
                        api_base = str(mc.get("apiBase") or "").strip().rstrip("/")
                        api_key = str(mc.get("apiKey") or "").strip()
                        use_model = str(mc.get("modelName") or model_id)
                        break
            except Exception:
                pass
        if not api_key:
            api_base = str(cfg.get("imageApiBase") or "https://api.openai.com/v1").rstrip("/")
            api_key = str(cfg.get("imageApiKey") or "").strip()
            cfg_model = str(cfg.get("imageModel") or "").strip()
            use_model = cfg_model or model_id or "dall-e-3"
        if not api_key:
            return self._err(400, "图像生成 API Key 未配置，请在画布 API 设置中配置对应图像模型的 API Key")
        prompt = str(body.get("prompt") or "").strip()
        if not prompt:
            return self._err(400, "prompt is required")
        aspect_ratio = str(body.get("aspect_ratio") or "1:1")
        node_id = str(body.get("node_id") or "")
        project_id = str(body.get("project_id") or "")
        reference_images = list(body.get("reference_images") or [])
        SIZE_MAP = {"1:1": "1024x1024", "16:9": "1792x1024", "9:16": "1024x1792",
                   "4:3": "1024x768", "3:4": "768x1024", "3:2": "1024x682", "2:3": "682x1024"}
        size = SIZE_MAP.get(aspect_ratio, "1024x1024")
        job_id = str(uuid.uuid4())
        _job_create(job_id)
        def _run():
            try:
                req_body: dict = {"model": use_model, "prompt": prompt, "n": 1,
                                  "size": size, "response_format": "url"}
                if reference_images:
                    req_body["image_url"] = reference_images[0]
                img_url = (api_base + "/images/generations") if api_base.endswith("/v1") else (api_base + "/v1/images/generations")
                req = urllib.request.Request(
                    img_url,
                    data=json.dumps(req_body).encode(),
                    headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=120) as resp:
                    resp_data = json.loads(resp.read().decode())
                if resp_data.get("error"):
                    err = resp_data["error"]
                    raise Exception(str(err.get("message", err)) if isinstance(err, dict) else str(err))
                items = resp_data.get("data") or []
                if not items:
                    raise Exception(f"API returned no data: {resp_data}")
                item = items[0]
                img_src_url = item.get("url")
                b64 = item.get("b64_json")
                if img_src_url:
                    req2 = urllib.request.Request(img_src_url, headers={"User-Agent": "Mozilla/5.0"})
                    with urllib.request.urlopen(req2, timeout=120) as r:
                        img_bytes = r.read()
                elif b64:
                    img_bytes = base64.b64decode(b64)
                else:
                    raise Exception("No url or b64_json in API response")
                try:
                    from PIL import Image as PILImage
                    import io as _io
                    with PILImage.open(_io.BytesIO(img_bytes)) as pil_img:
                        w, h = pil_img.size
                        buf = _io.BytesIO()
                        pil_img.save(buf, format="PNG")
                        img_bytes = buf.getvalue()
                except Exception:
                    w, h = None, None
                stem = f"gen_{node_id or uuid.uuid4().hex[:8]}"
                local_url = _save_image_local(img_bytes, stem, project_id, "generated")
                _job_succeed(job_id, {"url": local_url, "thumbnailUrl": local_url, "originalUrl": local_url,
                                      "width": w, "height": h, "aspect_ratio": aspect_ratio})
            except Exception as e:
                print(f"[generate/image] job {job_id} failed: {e}")
                _job_fail(job_id, str(e))
        threading.Thread(target=_run, daemon=True).start()
        self._json_resp({"jobId": job_id})

    def _handle_generate_audio(self, body):
        cfg = _load_settings()
        text = str(body.get("text") or "").strip()
        voice = str(body.get("voice") or "21m00Tcm4TlvDq8ikWAM").strip()
        node_id = str(body.get("node_id") or "")
        project_id = str(body.get("project_id") or "")
        stability = float(body.get("stability") or 0.5)
        speed = float(body.get("speed") or 1.0)
        if not text:
            return self._err(400, "text is required")
        api_key = ""
        canvas_cfgs_raw = str(cfg.get("canvasModelConfigs") or "").strip()
        if canvas_cfgs_raw:
            try:
                mc = json.loads(canvas_cfgs_raw).get("elevenlabs_audio") or {}
                api_key = str(mc.get("apiKey") or "").strip()
            except Exception:
                pass
        if not api_key:
            return self._err(400, "ElevenLabs API Key 未配置，请在画布 API 设置 → 音频生成 (ElevenLabs) 中填写 API Key")
        job_id = str(uuid.uuid4())
        _job_create(job_id)
        ELABS_MODEL_MAP = {
            "elevenlabs/text-to-dialogue-v3": "eleven_flash_v2_5",
            "elevenlabs/multilingual-v2": "eleven_multilingual_v2",
            "elevenlabs/turbo-v2-5": "eleven_turbo_v2_5",
        }
        model_id_raw = str(body.get("model_id") or "elevenlabs/text-to-dialogue-v3")
        elabs_model = ELABS_MODEL_MAP.get(model_id_raw, "eleven_flash_v2_5")
        def _run():
            try:
                req_body = {
                    "text": text,
                    "model_id": elabs_model,
                    "voice_settings": {"stability": stability, "similarity_boost": 0.75, "speed": speed},
                }
                req = urllib.request.Request(
                    f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
                    data=json.dumps(req_body).encode(),
                    headers={"Content-Type": "application/json", "xi-api-key": api_key},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=60) as resp:
                    audio_bytes = resp.read()
                stem = f"audio_{node_id or uuid.uuid4().hex[:8]}"
                proj_folder = re.sub(r"[^\w\u4e00-\u9fff\-]", "_", project_id)[:40] if project_id else "audio"
                save_dir = UPLOAD_DIR / proj_folder / "audio"
                save_dir.mkdir(parents=True, exist_ok=True)
                out_path = save_dir / f"{stem}.mp3"
                counter = 1
                while out_path.exists():
                    out_path = save_dir / f"{stem}_{counter}.mp3"
                    counter += 1
                out_path.write_bytes(audio_bytes)
                audio_url = f"/uploads/{proj_folder}/audio/{out_path.name}"
                _job_succeed(job_id, {"audioUrl": audio_url, "status": "SUCCEEDED"})
            except urllib.error.HTTPError as e:
                try:
                    msg = json.loads(e.read().decode()).get("detail", {}).get("message", f"HTTP {e.code}")
                except Exception:
                    msg = f"ElevenLabs HTTP {e.code}"
                print(f"[audio] job {job_id} failed: {msg}")
                _job_fail(job_id, str(msg))
            except Exception as e:
                print(f"[audio] job {job_id} failed: {e}")
                _job_fail(job_id, str(e))
        threading.Thread(target=_run, daemon=True).start()
        self._json_resp({"jobId": job_id})

    def _handle_enhance_video(self, body):
        cfg = _load_settings()
        api_key = str(cfg.get("runwareApiKey") or "").strip() or os.environ.get("RUNWARE_API_KEY", "")
        if not api_key:
            return self._err(400, "Runware API Key 未配置，视频增强需要 Runware API Key，请在画布 API 设置 → 图像增强中配置")
        video_url = str(body.get("video_url") or "").strip()
        if not video_url:
            return self._err(400, "video_url is required")
        if video_url.startswith("/") and not video_url.startswith("//"):
            return self._err(400, "视频增强需要公网可访问的视频 URL，本地视频请先通过菜单 \"上传到公网\" 获取外链")
        node_id = str(body.get("node_id") or "")
        project_id = str(body.get("project_id") or "")
        enhance_model_name = str(body.get("enhance_model") or "Starlight Precise 2.5")
        upscale_factor = float(body.get("upscale_factor") or 2)
        target_fps = body.get("target_fps")
        source_w = int(body.get("source_width") or 0)
        source_h = int(body.get("source_height") or 0)
        RUNWARE_VIDEO_MODELS = {
            "Starlight Precise 2.5": "topazlabs:starlight-precise@2.5",
            "Starlight Smooth 2.5": "topazlabs:starlight-smooth@2.5",
            "ByteDance Upscaler": "bytedance:50@1",
        }
        runware_model = RUNWARE_VIDEO_MODELS.get(enhance_model_name, "topazlabs:starlight-precise@2.5")
        new_w = int(source_w * upscale_factor) if source_w else None
        new_h = int(source_h * upscale_factor) if source_h else None
        job_id = str(uuid.uuid4())
        _job_create(job_id)
        def _run():
            try:
                task_uuid = str(uuid.uuid4())
                task: dict = {
                    "taskType": "upscale", "taskUUID": task_uuid,
                    "model": runware_model,
                    "inputs": {"video": video_url},
                    "outputFormat": "MP4",
                    "includeCost": True,
                    "deliveryMethod": "async",
                }
                if new_w: task["width"] = new_w
                if new_h: task["height"] = new_h
                if target_fps: task["fps"] = int(target_fps)
                headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
                req = urllib.request.Request(RUNWARE_API_URL, data=json.dumps([task]).encode(), headers=headers, method="POST")
                with urllib.request.urlopen(req, timeout=60) as r:
                    sd = json.loads(r.read().decode())
                if sd.get("errors"):
                    raise Exception(f"Runware submit error: {sd['errors']}")
                print(f"[enhance-video] job {job_id} submitted to Runware, polling...")
                max_ms = 60 * 60 * 1000
                poll_ms = 10
                started = time.time()
                while (time.time() - started) * 1000 < max_ms:
                    time.sleep(poll_ms)
                    poll_req = urllib.request.Request(
                        RUNWARE_API_URL, headers=headers, method="POST",
                        data=json.dumps([{"taskType": "getResponse", "taskUUID": task_uuid}]).encode())
                    with urllib.request.urlopen(poll_req, timeout=30) as pr:
                        pd = json.loads(pr.read().decode())
                    item = (pd.get("data") or [{}])[0]
                    if item.get("videoURL"):
                        remote_url = item["videoURL"]
                        req2 = urllib.request.Request(remote_url, headers={"User-Agent": "Mozilla/5.0"})
                        with urllib.request.urlopen(req2, timeout=300) as r:
                            vid_bytes = r.read()
                        stem = f"evid_{node_id or uuid.uuid4().hex[:8]}"
                        proj_folder = re.sub(r"[^\w\u4e00-\u9fff\-]", "_", project_id)[:40] if project_id else "enhanced"
                        save_dir = UPLOAD_DIR / proj_folder / "enhanced_video"
                        save_dir.mkdir(parents=True, exist_ok=True)
                        out_path = save_dir / f"{stem}.mp4"
                        counter = 1
                        while out_path.exists():
                            out_path = save_dir / f"{stem}_{counter}.mp4"
                            counter += 1
                        out_path.write_bytes(vid_bytes)
                        local_url = f"/uploads/{proj_folder}/enhanced_video/{out_path.name}"
                        _job_succeed(job_id, {"videoUrl": local_url, "originalVideoUrl": local_url,
                                              "width": new_w, "height": new_h})
                        return
                    if item.get("status") == "failed":
                        raise Exception(f"Runware task failed: {item}")
                    errs = pd.get("errors") or []
                    fatal = [e for e in errs if e.get("code") not in ("taskNotFound", "taskStillProcessing")]
                    if fatal:
                        raise Exception(f"Runware poll error: {fatal}")
                    poll_ms = min(poll_ms * 2, 30)
                raise Exception("Runware video enhance timed out (60 min)")
            except Exception as e:
                print(f"[enhance-video] job {job_id} failed: {e}")
                _job_fail(job_id, str(e))
        threading.Thread(target=_run, daemon=True).start()
        self._json_resp({"jobId": job_id})

    def _handle_outpaint(self, body):
        cfg = _load_settings()
        image_url = str(body.get("image_url") or "").strip()
        if not image_url:
            return self._err(400, "image_url is required")
        outpaint_model = str(body.get("outpaint_model") or "outpaint-v2")
        prompt = str(body.get("prompt") or "")
        node_id = str(body.get("node_id") or "")
        project_id = str(body.get("project_id") or "")
        expand_top = int(body.get("expand_top") or 0)
        expand_right = int(body.get("expand_right") or 0)
        expand_bottom = int(body.get("expand_bottom") or 0)
        expand_left = int(body.get("expand_left") or 0)
        if outpaint_model == "outpaint-v2":
            api_key = str(cfg.get("runwareApiKey") or "").strip() or os.environ.get("RUNWARE_API_KEY", "")
            if not api_key:
                return self._err(400, "Runware API Key 未配置，扩图 (outpaint-v2) 需要 Runware API Key，请在画布 API 设置 → 图像增强中配置")
            input_image = image_url
            if image_url.startswith("/") and not image_url.startswith("//"):
                rel = image_url.lstrip("/")
                lp = (DATA_DIR / rel).resolve()
                if not lp.exists():
                    lp = (BASE_DIR / rel).resolve()
                if not lp.exists():
                    return self._err(400, f"Image not found: {image_url}")
                mime = mimetypes.guess_type(str(lp))[0] or "image/png"
                input_image = f"data:{mime};base64,{base64.b64encode(lp.read_bytes()).decode()}"
            job_id = str(uuid.uuid4())
            _job_create(job_id)
            def _run_rw():
                try:
                    task = {"taskType": "imageOutpaint", "taskUUID": str(uuid.uuid4()),
                            "inputImage": input_image,
                            "topPx": expand_top, "rightPx": expand_right,
                            "bottomPx": expand_bottom, "leftPx": expand_left,
                            "outputType": ["URL"], "outputFormat": "PNG", "includeCost": True}
                    if prompt:
                        task["prompt"] = prompt
                    req = urllib.request.Request(
                        RUNWARE_API_URL, data=json.dumps([task]).encode(),
                        headers={"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"},
                        method="POST")
                    with urllib.request.urlopen(req, timeout=180) as resp:
                        rd = json.loads(resp.read().decode())
                    errors = rd.get("errors") or []
                    if errors:
                        msg = errors[0].get("message") if isinstance(errors[0], dict) else str(errors[0])
                        raise Exception(f"Runware error: {msg}")
                    items = rd.get("data") or []
                    if not items or not items[0].get("imageURL"):
                        raise Exception(f"Runware outpaint: no imageURL in response")
                    remote_url = items[0]["imageURL"]
                    req2 = urllib.request.Request(remote_url, headers={"User-Agent": "Mozilla/5.0"})
                    with urllib.request.urlopen(req2, timeout=120) as r:
                        img_bytes = r.read()
                    stem = f"outpaint_{node_id or uuid.uuid4().hex[:8]}"
                    local_url = _save_image_local(img_bytes, stem, project_id, "outpaint")
                    _job_succeed(job_id, {"url": local_url, "thumbnailUrl": local_url, "originalUrl": local_url,
                                          "width": items[0].get("width"), "height": items[0].get("height")})
                except Exception as e:
                    print(f"[outpaint] job {job_id} failed: {e}")
                    _job_fail(job_id, str(e))
            threading.Thread(target=_run_rw, daemon=True).start()
            self._json_resp({"jobId": job_id})
        else:
            # nano-banana-pro or any other: route to generic image generation
            enhanced_body = dict(body)
            if not enhanced_body.get("prompt"):
                enhanced_body["prompt"] = "高质量自然延伸图像"
            enhanced_body["reference_images"] = [image_url]
            self._handle_generate_image(enhanced_body)

    def _handle_job_sse(self, job_id):
        with _jobs_lock:
            job = _jobs.get(job_id)
            q = _job_queues.get(job_id)
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "keep-alive")
        self._cors_headers()
        self.end_headers()
        def _send(payload):
            line = "data: " + json.dumps(payload, ensure_ascii=False) + "\n\n"
            self.wfile.write(line.encode())
            self.wfile.flush()
        if not job:
            _send({"status": "FAILED", "error": "job_not_found"})
            return
        if job["status"] == "succeeded" and job["result"]:
            _send({"status": "SUCCEEDED", **job["result"]})
            return
        if job["status"] == "failed":
            _send({"status": "FAILED", "error": job.get("error", "Unknown error")})
            return
        if q is None:
            _send({"status": "FAILED", "error": "no_queue"})
            return
        try:
            while True:
                try:
                    event = q.get(timeout=30)
                    _send(event)
                    break
                except queue.Empty:
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
        except Exception:
            pass

    def _handle_enhance(self, body):
        cfg = _load_settings()
        api_key = str(cfg.get("runwareApiKey") or "").strip()
        if not api_key:
            api_key = os.environ.get("RUNWARE_API_KEY", "")
        if not api_key:
            return self._err(400, "Runware API Key 未配置，请在画布 API 设置 → 图像增强 中填写 Runware API Key")
        image_url = str(body.get("image_url") or "").strip()
        if not image_url:
            return self._err(400, "image_url is required")
        enhance_model = str(body.get("enhance_model") or "Standard V2")
        upscale_factor = max(1, min(4, int(body.get("upscale_factor") or 2)))
        node_id = str(body.get("node_id") or "")
        project_id = str(body.get("project_id") or "")
        # Resolve local path → base64 (Runware cannot reach localhost)
        input_image = image_url
        if image_url.startswith("/") and not image_url.startswith("//"):
            rel = image_url.lstrip("/")
            local_path = (DATA_DIR / rel).resolve()
            if not local_path.exists():
                local_path = (BASE_DIR / rel).resolve()
            if not local_path.exists():
                return self._err(400, f"Local image not found: {image_url}")
            mime = mimetypes.guess_type(str(local_path))[0] or "image/png"
            raw = local_path.read_bytes()
            input_image = f"data:{mime};base64,{base64.b64encode(raw).decode()}"
        job_id = str(uuid.uuid4())
        _job_create(job_id)
        def _run():
            try:
                result = _runware_enhance_sync(api_key, input_image, enhance_model, upscale_factor)
                remote_url = result["url"]
                try:
                    req = urllib.request.Request(remote_url, headers={"User-Agent": "Mozilla/5.0"})
                    with urllib.request.urlopen(req, timeout=120) as r:
                        img_data = r.read()
                    stem = f"enhanced_{node_id or uuid.uuid4().hex[:8]}"
                    proj_folder = re.sub(r"[^\w\u4e00-\u9fff\-]", "_", project_id)[:40] if project_id else "enhanced"
                    save_dir = UPLOAD_DIR / proj_folder / "enhanced"
                    save_dir.mkdir(parents=True, exist_ok=True)
                    out_path = save_dir / f"{stem}.png"
                    counter = 1
                    while out_path.exists():
                        out_path = save_dir / f"{stem}_{counter}.png"
                        counter += 1
                    out_path.write_bytes(img_data)
                    local_url = f"/uploads/{proj_folder}/enhanced/{out_path.name}"
                    _job_succeed(job_id, {"url": local_url, "thumbnailUrl": local_url, "originalUrl": local_url,
                                          "width": result.get("width"), "height": result.get("height")})
                except Exception:
                    _job_succeed(job_id, {"url": remote_url, "thumbnailUrl": remote_url, "originalUrl": remote_url,
                                          "width": result.get("width"), "height": result.get("height")})
            except Exception as e:
                print(f"[enhance] job {job_id} failed: {e}")
                _job_fail(job_id, str(e))
        threading.Thread(target=_run, daemon=True).start()
        self._json_resp({"jobId": job_id})

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, X-Filename, X-Project")

    def _json_resp(self, obj, status=200):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def _err(self, code, msg):
        self._json_resp({"ok": False, "error": msg}, status=code)


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else PORT
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"Prompt Studio running at  http://127.0.0.1:{port}/")
    print("Press Ctrl+C to stop.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")

