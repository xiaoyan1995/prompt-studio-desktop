# Prompt Studio Agent Skill

你可以通过 HTTP API 直接读写本地运行的 Prompt Studio 应用（端口 8767）。
以下是所有可用操作，使用标准的 fetch / curl / requests 即可调用，无需任何额外依赖。

---

## 基础信息

- Base URL: `http://localhost:8767`
- 所有 POST 请求 Content-Type: `application/json`
- 所有响应均为 JSON，成功时包含 `"ok": true`

---

## 读取操作（GET）

### 列出所有项目
```
GET /api/cli/projects
```
返回：`{ "ok": true, "projects": [{ "id": "...", "name": "..." }, ...] }`

---

### 列出提示词
```
GET /api/cli/prompts?project=<名称或ID>&type=<image|video|skill>&limit=50
```
所有参数均可选。返回每条记录的 id、标题、标签、模型、图片路径、提示词预览等。

---

### 获取单条提示词完整内容
```
GET /api/cli/prompt?id=<id>
GET /api/cli/prompt?project=<项目名>&title=<标题关键词>&type=<类型>
```
返回：`{ "ok": true, "type": "skill", "project_name": "...", "item": { ...完整字段... } }`

完整字段包括：
- `prompt` — 提示词全文
- `title` — 标题
- `model` — 模型
- `tags` — 标签数组
- `image` — 主图路径（图片类型）
- `gallery` — 生成图路径数组
- `video` — 视频路径
- `ref_images` — 参考媒体路径数组
- `analysis` — AI 分析内容
- `created_at` — 创建时间

---

### 全文搜索
```
GET /api/cli/search?q=<关键词>&project=<项目名>&type=<类型>&limit=20
```
搜索范围：标题、提示词正文、分析内容、标签。

---

### 获取图片/视频文件
```
GET /uploads/<filename>
```
直接返回文件二进制流。路径来自上述接口返回的 `image` / `gallery[n]` / `video` 字段。

---

## 写入操作（POST）

### 推送新提示词 / Skill
```
POST /api/cli/push
```
请求体：
```json
{
  "type": "skill",          // "image" | "video" | "skill"
  "project_name": "我的项目", // 不存在则自动创建；也可用 "project_id"
  "title": "标题",
  "prompt": "提示词正文",
  "model": "Claude Sonnet",  // 可选
  "tags": ["tag1", "tag2"],  // 可选，数组或逗号分隔字符串
  "aspect": "16:9",          // 可选，仅图片类型
  "analysis": "备注"         // 可选
}
```
返回：`{ "ok": true, "id": "...", "project_id": "...", "project_name": "...", "type": "skill" }`

推送成功后，Prompt Studio UI 会**实时刷新**，无需重启。

---

## 使用示例（JavaScript fetch）

```js
// 搜索所有和"赛博"相关的图片提示词
const res = await fetch('http://localhost:8767/api/cli/search?q=赛博&type=image');
const { items } = await res.json();
console.log(items[0].prompt);

// 读取某条 skill 的完整提示词
const r = await fetch('http://localhost:8767/api/cli/prompt?id=abc123def456');
const { item } = await r.json();
console.log(item.prompt);

// 推送一条新 skill
await fetch('http://localhost:8767/api/cli/push', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    type: 'skill',
    project_name: 'AI工具箱',
    title: '代码审查专家',
    prompt: '你是一位资深代码审查员…',
    tags: ['coding', 'review']
  })
});
```

## 使用示例（Python requests）

```python
import requests

BASE = "http://localhost:8767"

# 列出所有 skill 提示词
items = requests.get(f"{BASE}/api/cli/prompts?type=skill").json()["items"]

# 推送新提示词
requests.post(f"{BASE}/api/cli/push", json={
    "type": "image",
    "project_name": "游戏角色",
    "title": "赛博武士",
    "prompt": "A cyberpunk samurai, neon city background…",
    "model": "GPT Image 2",
    "tags": ["游戏", "角色", "赛博朋克"]
})
```

## 使用示例（curl）

```bash
# 搜索
curl "http://localhost:8767/api/cli/search?q=角色&type=image"

# 推送
curl -X POST http://localhost:8767/api/cli/push \
  -H "Content-Type: application/json" \
  -d '{"type":"skill","project_name":"测试","title":"助手","prompt":"你好"}'
```
