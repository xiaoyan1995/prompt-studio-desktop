---
name: prompt-studio
description: Read and write prompts, skills, images, and videos in the local Prompt Studio app (http://localhost:8767). Use when user asks to save a prompt to Prompt Studio, search existing prompts, retrieve a skill by name, push AI-generated content into the app, or list/download media assets from it.
---

# Prompt Studio

Local prompt manager running at `http://localhost:8767`. No auth required.

## All commands → HTTP endpoints

| What you want to do | HTTP call |
|---|---|
| List projects | `GET /api/cli/projects` |
| List prompts in a project | `GET /api/cli/prompts?project=X&type=skill` |
| Get full prompt (by id) | `GET /api/cli/prompt?id=abc123` |
| Get only the prompt text | `GET /api/cli/prompt?id=abc123` → read `item.prompt` |
| Full-text search | `GET /api/cli/search?q=关键词&type=image` |
| Download main image | `GET /uploads/<path from item.image>` |
| Download gallery image N | `GET /uploads/<path from item.gallery[N]>` |
| Push new prompt / skill | `POST /api/cli/push` with JSON body |
| Push with agent image/video | add `image_url`, `gallery_images`, `video_url` to push body |

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

## Workflows

### Push a prompt / skill
1. Choose `type`: `skill` (AI agent prompt) · `image` · `video`
2. POST `/api/cli/push` with fields from [REFERENCE.md](REFERENCE.md#push)
3. UI auto-refreshes via SSE — no restart needed

### Read an existing prompt
1. Search: `GET /api/cli/search?q=<keyword>` → get `id`
2. Get full content: `GET /api/cli/prompt?id=<id>`
3. Extract field: add `?id=<id>` → read `item.prompt`, `item.analysis`, etc.

### List everything in a project
```
GET /api/cli/prompts?project=<name>&type=skill
```

### Download an image / video
```
GET /uploads/<filename>   ← path from item.image or item.gallery[n]
```

See [REFERENCE.md](REFERENCE.md) for all endpoints and fields.
