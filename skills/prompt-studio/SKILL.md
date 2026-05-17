---
name: prompt-studio
description: Read and write ALL assets in the local Prompt Studio app (http://localhost:8767). Covers 4 asset types: (1) prompts/skills/images/videos via /api/cli/prompts, (2) document library (文档库, PDF/Word/Excel files) via /api/cli/docs, (3) audio library (音效库, local sound files) via /api/cli/audio/folders + /api/cli/audio/files, (4) push AI-generated content back via /api/cli/push. Use when user asks to list, search, read, save, or push anything in Prompt Studio, or asks about their asset library (资产库), document library, audio library, or project contents.
---

# Prompt Studio

Local prompt manager running at `http://localhost:8767`. No auth required.

## All commands → HTTP endpoints

| What you want to do | HTTP call |
|---|---|
| List projects (with item counts) | `GET /api/cli/projects` |
| List prompts in a project | `GET /api/cli/prompts?project=X&type=skill&limit=50` |
| Get full prompt (by id) | `GET /api/cli/prompt?id=abc123` |
| Get only the prompt text | `GET /api/cli/prompt?id=abc123` → read `item.prompt` |
| Full-text search | `GET /api/cli/search?q=关键词&type=image` |
| Download main image | `GET /uploads/<path from item.image>` |
| Download gallery image N | `GET /uploads/<path from item.gallery[N]>` |
| Push new prompt / skill | `POST /api/cli/push` with JSON body |
| Push with agent image/video | add `image_url`, `gallery_images`, `video_url` to push body |
| List audio folders | `GET /api/cli/audio/folders?project=X` |
| List / search audio files | `GET /api/cli/audio/files?project=X&folder=Y&q=keyword&starred=1` |
| Stream audio file | `GET /api/local-audio?path=<absPath>` (Range-request capable) |
| List / search documents (文档库) | `GET /api/cli/docs?project=X&q=keyword&limit=50` |
| Download a document | `GET /uploads/<path from item.path>` |

All operations use plain HTTP — no CLI, no Python, no extra tools needed.

## Quick start

```js
// Push a new skill
await fetch('http://localhost:8767/api/cli/push', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'skill',           // "image" | "video" | "skill"
    project_name: '项目名',  // auto-created if missing
    title: '标题',
    prompt: '提示词正文',
    tags: ['tag1', 'tag2']
  })
});

// Search
const { items } = await fetch('http://localhost:8767/api/cli/search?q=关键词&type=skill').then(r => r.json());

// Push image with generated result (URL or base64)
await fetch('http://localhost:8767/api/cli/push', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'image', project_name: 'AI生成', title: '赛博武士',
    prompt: 'A cyberpunk samurai…',
    image_url: 'https://cdn.example.com/result.jpg',   // server auto-saves
    gallery_images: ['https://…/v2.jpg', 'https://…/v3.jpg']
  })
});
```

## Document library (文档库)

```js
// List docs in a project
const { items } = await fetch('http://localhost:8767/api/cli/docs?project=我的项目').then(r => r.json());
// items[n]: { id, project_id, project_name, title, filename, path, size, tags, notes, download_url }

// Download a document
const file = await fetch('http://localhost:8767' + items[0].download_url).then(r => r.arrayBuffer());
```

## Audio library

```js
// List audio folders in a project
const { folders } = await fetch('http://localhost:8767/api/cli/audio/folders?project=我的项目').then(r => r.json());
// folders[n]: { project_id, project_name, folder_id, folder_name, local_path, added_at }

// List / search audio files
const { items } = await fetch('http://localhost:8767/api/cli/audio/files?project=我的项目&folder=SFX&q=door').then(r => r.json());
// items[n]: { name, nameNoExt, ext, relPath, absPath, size, cnName, starred, stream_url }

// Stream an audio file
// Use item.stream_url directly: GET /api/local-audio?path=<absPath>
// Supports Range requests (seek works).
```

## Workflows

### Push a prompt / skill
1. Choose `type`: `skill` (AI agent prompt) · `image` · `video`
2. POST `/api/cli/push` with fields from [REFERENCE.md](REFERENCE.md#push)
3. UI auto-refreshes via SSE — no restart needed

### Read an existing prompt
1. Search: `GET /api/cli/search?q=<keyword>` → get `id`
2. Get full content: `GET /api/cli/prompt?id=<id>`
3. Extract field: add `?id=<id>` → read `item.prompt`, `item.analysis`, etc.

### Get complete asset library overview
Always start with this sequence to see everything:
```
1. GET /api/cli/projects
   → returns each project with skill_count, image_count, video_count
   → does NOT include doc_count or audio_count (fetch separately if needed)

2. GET /api/cli/docs?project=<name>
   → lists all documents in 文档库 (PDF / Word / Excel / TXT etc.)

3. GET /api/cli/audio/folders?project=<name>
   → lists linked audio folders in 音效库
   → then GET /api/cli/audio/files?project=<name>&folder=<id> to list files
```
Never skip steps 2 and 3 when the user asks about their full asset library (资产库).

### List items in a project
```
GET /api/cli/prompts?project=<name>&type=skill&limit=50
GET /api/cli/prompts?project=<name>&type=image&limit=50
GET /api/cli/prompts?project=<name>&type=video&limit=50
```
Always pass `limit` (default 200). For large libraries use `limit=20` and paginate via search.

### Download an image / video
```
GET /uploads/<filename>   ← path from item.image or item.gallery[n]
```

See [REFERENCE.md](REFERENCE.md) for all endpoints and fields.
