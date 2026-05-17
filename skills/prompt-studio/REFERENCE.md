# Prompt Studio API Reference

Base URL: `http://localhost:8767`

---

## GET endpoints

| Path | Params | Returns |
|------|--------|---------|
| `/api/cli/projects` | — | `{ projects: [{id, name, skill_count, image_count, video_count}] }` |
| `/api/cli/prompts` | `project`, `type`, `limit` | `{ count, items: [summary…] }` |
| `/api/cli/prompt` | `id` **or** `project`+`title`+`type` | `{ type, project_name, item }` |
| `/api/cli/search` | `q` (required), `project`, `type`, `limit` | `{ count, items }` |
| `/uploads/<file>` | — | binary file |

### Item summary fields (list)
`id` · `type` · `project_id` · `project_name` · `title` · `model` · `tags` · `aspect` · `image` · `gallery` · `video` · `ref_images` · `created_at` · `prompt_preview`

### Item full fields (get)
All of the above plus: `prompt` · `ref_image` · `analysis` · `outfit_prompt` · `char_prompt` · `scene_prompt` · `style_prompt` · `cam_prompt`

---

## POST /api/cli/push {#push}

```json
{
  "type":         "image",
  "project_name": "我的项目",
  "project_id":   "abc123",
  "title":        "标题",
  "prompt":       "提示词正文（必填）",
  "model":        "GPT Image 2",
  "tags":         ["tag1", "tag2"],
  "aspect":       "16:9",
  "analysis":     "备注",

  // ── Agent 生成的图片（三选一）──────────────────
  "image_url":      "https://cdn.example.com/gen.jpg",   // 外部 URL，server 自动下载保存
  "image_base64":   "data:image/png;base64,iVBOR…",      // base64（含/不含 data: 前缀均可）
  "image_filename": "my_image.jpg",                       // 可选，文件名提示

  // ── 多张画廊图片 ────────────────────────────────
  "gallery_images": [
    "https://cdn.example.com/img1.jpg",                  // 纯 URL 字符串
    { "url": "https://cdn.example.com/img2.jpg" },       // 对象格式
    { "base64": "data:image/png;base64,…", "filename": "img3.png" }
  ],

  // ── Agent 生成的视频 ────────────────────────────
  "video_url":      "https://cdn.example.com/gen.mp4",
  "video_base64":   "data:video/mp4;base64,AAAA…",
  "video_filename": "my_video.mp4"
}
```

- `type`: `"image"` | `"video"` | `"skill"` (default `"skill"`)
- `project_name` **or** `project_id`: omit to use first project; unknown name is auto-created
- `tags`: array or comma-separated string
- 图片/视频字段可选，省略则记录无媒体

Response: `{ ok, id, project_id, project_name, type, image, gallery, video }`

---

---

## Document Library API (文档库)

### GET /api/cli/docs

| Param | Required | Description |
|-------|----------|-------------|
| `project` | no | Project name or id; omit to list all projects |
| `q` | no | Search in title, filename, or notes |
| `limit` | no | Max results (default 200) |

Response item fields: `id` · `project_id` · `project_name` · `title` · `filename` · `path` · `size` · `tags` · `notes` · `color` · `created_at` · `download_url`

Download file: `GET http://localhost:8767` + `item.download_url`

---

## Audio Library API

### GET /api/cli/audio/folders

| Param | Required | Description |
|-------|----------|-------------|
| `project` | no | Project name or id; omit to list all projects |

Response:
```json
{
  "ok": true,
  "count": 2,
  "folders": [
    { "project_id": "abc", "project_name": "我的项目", "folder_id": "f1", "folder_name": "SFX", "local_path": "/Users/…/SFX", "added_at": "2025-01-01T12:00:00" }
  ]
}
```

### GET /api/cli/audio/files

| Param | Required | Description |
|-------|----------|-------------|
| `project` | yes | Project name or id |
| `folder` | no | Folder name or id; omit to use first folder |
| `q` | no | Search in filename or Chinese name |
| `starred` | no | `1` or `true` to return starred files only |
| `limit` | no | Max results (default 500) |

Response item fields: `name` · `nameNoExt` · `ext` · `relPath` · `absPath` · `size` · `cnName` · `starred` · `stream_url`

### GET /api/local-audio

Stream a local audio file. Supports HTTP Range requests (seek works in browsers and media players).

| Param | Required | Description |
|-------|----------|-------------|
| `path` | yes | Absolute local path (URL-encoded) — use `item.stream_url` from audio/files response |

---

## Examples

```python
import requests
B = "http://localhost:8767"

# List all skills
items = requests.get(f"{B}/api/cli/prompts?type=skill").json()["items"]

# Get prompt text by title
r = requests.get(f"{B}/api/cli/prompt?type=skill&title=代码审查").json()
print(r["item"]["prompt"])

# Search
hits = requests.get(f"{B}/api/cli/search?q=赛博&type=image").json()["items"]

# Push
requests.post(f"{B}/api/cli/push", json={
    "type": "skill", "project_name": "AI工具箱",
    "title": "摘要助手", "prompt": "请将以下内容概括为三句话…"
})

# Download image
img_path = items[0]["image"]   # e.g. "/uploads/proj/foo.jpg"
data = requests.get(B + img_path).content
open("out.jpg", "wb").write(data)

# Push image prompt WITH agent-generated image (URL)
requests.post(f"{B}/api/cli/push", json={
    "type": "image", "project_name": "AI生成",
    "title": "赛博武士", "prompt": "A cyberpunk samurai…",
    "model": "GPT Image 2",
    "image_url": "https://cdn.openai.com/result/xxx.jpg",  # server auto-downloads
})

# Push with multiple gallery images
requests.post(f"{B}/api/cli/push", json={
    "type": "image", "project_name": "AI生成",
    "title": "批量生成", "prompt": "…",
    "gallery_images": [
        "https://cdn.example.com/img1.jpg",
        "https://cdn.example.com/img2.jpg",
    ]
})

# Push video prompt WITH generated video
requests.post(f"{B}/api/cli/push", json={
    "type": "video", "project_name": "视频项目",
    "title": "城市航拍", "prompt": "Aerial shot of city at night…",
    "video_url": "https://storage.example.com/output.mp4",
})

# List audio folders
folders = requests.get(f"{B}/api/cli/audio/folders?project=我的项目").json()["folders"]

# Search audio files (returns absPath + stream_url per item)
items = requests.get(f"{B}/api/cli/audio/files", params={
    "project": "我的项目", "folder": "SFX", "q": "door"
}).json()["items"]

# Stream / download an audio file
audio = requests.get(B + items[0]["stream_url"]).content
open("door.wav", "wb").write(audio)
```
