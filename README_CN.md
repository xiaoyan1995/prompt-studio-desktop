<div align="center">

# 🎨 Prompt Studio Desktop

**本地桌面端 AI 图片 & 视频提示词管理工具，配套浏览器插件。**

[![版本](https://img.shields.io/badge/版本-1.2.0-blue.svg)](https://github.com/xiaoyan1995/prompt-studio-desktop/releases)
[![构建](https://github.com/xiaoyan1995/prompt-studio-desktop/actions/workflows/build.yml/badge.svg)](https://github.com/xiaoyan1995/prompt-studio-desktop/actions/workflows/build.yml)
[![平台](https://img.shields.io/badge/平台-Windows%20%7C%20macOS-lightgrey.svg)](#打包说明)
[![Electron](https://img.shields.io/badge/Electron-37-47848F.svg)](https://www.electronjs.org/)

[English](README.md) · 中文说明

</div>

---

## 🖼️ 界面预览

<div align="center">

### 图片提示词 · 卡片网格 + 实时预览面板

<img src="docs/screenshots/main.png" alt="图片提示词主界面" width="760">

<br><br>

### 提示词详情 & 多图画廊 · 音效库波形预览

<table>
<tr>
<td align="center" width="50%">
  <img src="docs/screenshots/detail.png" alt="提示词详情弹窗" width="360"><br>
  <sub>📝 提示词详情 — 大图预览 · 参考图 · 多图画廊 · AI 反推</sub>
</td>
<td align="center" width="50%">
  <img src="docs/screenshots/audio.png" alt="音效库" width="360"><br>
  <sub>🎵 音效库 — 实时波形 · 子目录浏览 · 收藏 · 拖拽导出</sub>
</td>
</tr>
</table>

<br>

### 文档库 · 浏览器插件

<table>
<tr>
<td align="center" width="50%">
  <img src="docs/screenshots/docs.png" alt="文档库" width="360"><br>
  <sub>📚 文档库 — PDF / Word / Excel / PPT / Markdown 多格式预览</sub>
</td>
<td align="center" width="50%">
  <img src="docs/screenshots/extension.png" alt="浏览器插件" width="260"><br>
  <sub>🌐 浏览器插件 — 任意页面一键发送素材到桌面端</sub>
</td>
</tr>
</table>

</div>

---

## ✨ 功能特性

- 📁 **项目式管理** — 按项目组织图片和视频提示词
- 🖼️ **富媒体支持** — 每条提示词可附加参考图片和视频
- 🤖 **Skills / Agent 提示词** — 全功能 Markdown 编辑器含预览
- 🔍 **反推提示词** — 上传素材后自动分析生成提示词文本
- 🏷️ **标签与全文搜索** — 跨标题、提示词、标签、分析报告检索
- 📦 **一键导出包** — 将选中资产打包为 ZIP 分享
- 💾 **快照备份** — 一键本地备份与恢复
- 🔁 **重复检测** — 发现跨项目的相同或相似提示词
- 🌐 **浏览器插件** — 任意页面浮动工具栏，一键发送素材到桌面端
- 📚 **文档库** — 上传并预览 PDF、Word、Excel、PPT、TXT、Markdown 等多种格式
- ⚡ **提示词快速插入** — 在任意网站输入框旁显示快捷图标，一键插入提示词，支持 AI 改写后插入
- 🚫 **域名黑名单** — 按站点屏蔽插件工具栏
- 🖼️ **图片画廊** — 每条提示词支持多张生成图，点击缩略图设为主图
- 🔎 **大图查看** — 点击图片全屏浏览
- 🔊 **音效库** — 每个项目可链接本地音效文件夹，支持浏览子目录、水波形预览、收藏、LLM 翻译文件名、拖拽导入 DAW
- 🌍 **中英文界面** — 设置中心一键切换中文 / English，所有 UI 文字即时更新
- 🤝 **Agent / CLI 集成** — 完整 HTTP API，外部 agent 可读写提示词、推送 AI 生成的图片和视频，以及查询音效库
- 🖼️ **AI 画布** — 节点式 AI 生成工作台，支持文本、图像、视频、音频节点自由连线组成生成流水线；内置画布 API 配置，可独立为每个模型配置 API Key
- 🎞️ **拉片工具** — 上传本地视频，基于 ffmpeg + TransNetV2 自动分镜，AI 逐镜解析镜头语言，导出分镜稿
- 🎬 **即梦 CLI 集成** — 设备码 / OAuth 登录即梦 App，通过 Dreamina CLI 在画布中生成 Seedance 2.0 视频

---

## 🗒️ 版本记录

### v1.2.0
- **AI 画布** — 全新节点式 AI 生成工作台
  - 节点类型：文本、提示词、图像生成、涂改重绘、视频生成、音频生成、素材图、素材音、超分、视频超分、抠图、分镜、注释、分组、备注
  - 节点间可自由连线，构建多模型串联生成流水线
  - 画布 API 设置：为文本 / 图像 / 视频 / 音频各类模型分别配置 API Base、API Key 和模型名称
  - 后端统一 Job + SSE 任务追踪，支持 `/api/generate/text`（流式）、`/api/generate/image`、`/api/generate/image-edit`、`/api/generate/audio`、`/api/generate/video`、`/api/generate/video-edit`、`/api/generate/enhance-video`、`/api/generate/rembg`、`/api/generate/outpaint`
  - 视频生成支持多种第三方后端，在画布 API 设置中为每个服务商配置独立 API Key 即可使用
  - 画布快照、历史记录、右键上下文菜单、分组、对齐辅助线
- **拉片工具** — 本地视频分镜分析
  - 上传本地视频文件，ffmpeg 提取时长与关键帧
  - TransNetV2 ONNX 模型本地离线检测分镜切点，无需联网
  - AI 逐镜解析：镜头描述、景别、机位、运镜、灯光、情绪、台词等
  - 支持快、标准、精细三种检测精度，可手动重新分镜
- **即梦 CLI 集成** — Dreamina / 即梦 App 视频生成
  - 设备码 OAuth 授权登录即梦账号
  - 在画布视频节点选择 `seedance-2-cli` / `seedance-2-fast-cli` 即可调用官方 CLI 生成视频
  - 支持查询账户余额、切换账号
- **AI 标题生成优化** — 更精准的提示词模板，更低的误判率
- **自适应进度条主题** — 进度条颜色跟随深色 / 浅色界面自动切换
- **请求超时改善** — 大模型 / 图像 API 请求超时时间合理化，减少误报错误

### v1.1.4
- **项目卡片右键菜单** — 右键任意项目卡片即可打开、编辑、更改封面或删除，无需进入项目
- **自定义项目封面** — 可上传任意图片、从项目内图片中选择，或重置为自动（取项目第一张图）
- **Inspector 图片放大** — 点击右侧面板缩略图可全屏 lightbox 查看
- **置顶按钮图标优化** — 将 emoji 📌 替换为 SVG 线框图标；修复深色模式下激活时按钮变白的问题
- **卡片高度统一** — 无论是否有模型标签，所有提示词卡片高度一致（无内容时 footer 隐藏占位）
- **模型下拉框修复** — 未存储模型时下拉框显示「未指定」而非默认 GPT Image 2，避免误导性显示
- **项目数量计数修正** — 卡片统计与 inspector 均排除文件夹条目，与侧边栏数字保持一致
- **界面优化** — 项目管理页背景改为柔和蓝白渐变；深色模式侧边栏边框与选中项样式精调

### v1.1.3
- **浏览器插件 - 提示词快速插入优化**：
  - 图标定位在输入框左外侧，不遮挡文字，滚动/resize 自动跟随
  - 图标聚焦后常驻不消失，方便连续插入多条提示词
  - 面板改为 2 列网格卡片布局，带缩略图 + 标题 + 提示词摘要
  - 文件夹显示为侧边栏目录树，不再混在卡片网格中
  - 新增 ✨ AI 改写功能：输入改写指令后点击卡片，AI 自动改写提示词再插入
  - 修复 contenteditable 输入框第二次插入失败的问题
- **新增 API**：`/api/rewrite-prompt` — AI 提示词改写接口

### v1.1.2
- **浏览器插件 - 提示词快速插入**：支持在任意网站的输入框旁显示快捷图标，点击打开提示词库面板，一键插入提示词到当前输入框
- **插入白名单管理**：在插件弹窗中可按域名开关快速插入功能
- **面板功能**：搜索过滤、项目切换、分类筛选（图片/视频/Skills）

### v1.1.1
- **中英文界面本地化**：设置中心新增语言切换按钮（中文 / English），所有 UI 文字——包括弹窗、标签、按钮、提示、占位符——均可一键切换，语言偏好本地持久化

### v1.1.0
- **音效库**：每个项目可链接任意本地文件夹作为音效库；支持子目录浏览、WAV/MP3/FLAC/… 水波形预览（含 seek + 音量控制）、收藏、LLM 翻译文件名
- **音效拖拽导出**：直接拖拽卡片到 DAW 或文件管理器，系统原生拖拽，不受浏览器 drag 限制
- **音效多选**：点击选中，Ctrl+点击追加，空白处框选多个；拖拽选中卡片可一次性批量导出
- **窗口置顶**：标题栏 📌 按钮，开启后始终浮在其他应用上方，方便边浏览边拖拽
- **独立文本 LLM 配置**：设置新增「文本 LLM」页，单独配置音效名翻译用的 API Base / Key / Model，含连接测试按钮
- **更智能的翻译**：3 路并发批量翻译、支持中途取消、本地 LLM（LM Studio 等）自动补全 `/v1`、详细错误提示
- **Agent 音效 API**：`GET /api/cli/audio/folders` 和 `GET /api/cli/audio/files`，agent 现在可直接查询和流式播放音效库文件

### v1.0.8
- 图片画廊条 — 每条提示词支持多张生成图，点击缩略图设为主图
- 大图查看 — 点击主图全屏 lightbox 浏览
- @ 图片引用 — 提示词输入框输入 `@` 弹出图片选择面板
- Agent HTTP API — `/api/cli/*` 端点支持 list / get / search / push
- `pstudio-cli.py` — Agent 集成 CLI 工具
- `skills/prompt-studio/` — 开箱即用的 agent skill，含完整 API 说明
- Agent 可通过 URL 或 base64 推送 AI 生成的图片和视频
- 参考图与画廊图分离存储（`ref_image` vs `gallery`）
- **批量采集图片** — 一键扫描页面图片，智能 CDN 清洗获取大图，按格式/尺寸筛选后批量发送到桌面端

### v1.0.7
- 文档库（PDF / Word / Excel / PPT / TXT / Markdown 多格式预览）
- 浏览器插件域名黑名单
- 快照备份与恢复
- 跨项目重复提示词检测

### v1.0.6
- 视频提示词类型，支持参考媒体网格
- Skills / Agent 提示词类型，全功能 Markdown 编辑器
- AI 反推提示词功能

### v1.0.5
- 一键导出包（资产 + 元数据打 ZIP）
- 智能文件夹（规则过滤）
- 全字段全文搜索

### v1.0.4
- 首次发布
- 项目式提示词管理
- 图片提示词 + 参考图支持
- 浏览器插件浮动工具栏

---

## 📦 安装使用（无需编译）

从 [Releases](https://github.com/xiaoyan1995/prompt-studio-desktop/releases) 下载最新分发包，解压后目录结构如下：

```
Prompt Studio Desktop/
├── Prompt Studio Desktop.exe   ← 双击启动
├── studio-data/                ← 数据目录（自动创建）
└── extension/                  ← 浏览器插件目录
```

**安装浏览器插件：**
1. 打开 `chrome://extensions`（Chrome / Edge）
2. 开启**开发者模式**
3. 点击**加载已解压的扩展程序** → 选择 `extension/` 文件夹

---

## 🛠️ 开发运行

**环境要求：** Node.js 18+，Python 3.10+

```powershell
# 克隆仓库
git clone https://github.com/xiaoyan1995/prompt-studio-desktop.git
cd prompt-studio-desktop

# 安装依赖
cd desktop
npm install

# 启动
cd ..
dev-start.bat
```

开发模式会自动用本机 Python 启动 `studio/server.py`，无需手动配置。

---

## 🏗️ 打包说明

打包已通过 **GitHub Actions 自动化** — 每次推送 `main` 分支自动构建 Windows + macOS 产物，推送版本 tag 自动创建 GitHub Release。

```bash
# 发布新版本
git tag v1.2.0
git push origin v1.2.0
```

<details>
<summary>手动本地打包</summary>

```powershell
# Windows
cd desktop
pip install pyinstaller
pyinstaller --clean --noconfirm server-build/prompt-studio-server.spec --distpath server-dist
npm run build:win
```

```bash
# macOS
cd desktop
pip3 install pyinstaller
pyinstaller --clean --noconfirm server-build/prompt-studio-server.spec --distpath server-dist
npm run build:mac
```

产物在 `desktop/dist/`
</details>

---

## 📂 数据目录

数据始终存储在**软件同目录**的 `studio-data/` 文件夹，不写入系统隐藏目录：

| 平台 | 路径 |
|---|---|
| Windows | `Prompt Studio Desktop\studio-data\` |
| macOS | `Prompt Studio Desktop.app/../studio-data\` |

迁移数据只需将 `studio-data/` 文件夹复制到新版本目录即可。

---

## ⚙️ 插件与桌面端配置

桌面端「设置」是主配置（AI Key、模型、反推指令等），插件设置仅保留：
- 桌面端连接地址（默认 `http://127.0.0.1:8767`）
- 站点黑名单

反推时插件会优先读取桌面端设置，无需在插件里维护第二套 AI 配置。

---

## 🤖 Agent 集成

Prompt Studio 提供本地 HTTP API，任何 AI agent 无需 UI 即可直接读写提示词。

```python
import requests
B = "http://localhost:8767"

# 搜索提示词
hits = requests.get(f"{B}/api/cli/search?q=赛博朋克&type=image").json()["items"]

# 推送新 skill（UI 实时刷新）
requests.post(f"{B}/api/cli/push", json={
    "type": "skill", "project_name": "我的项目",
    "title": "代码审查专家", "prompt": "你是一位资深代码审查员…"
})

# 推送图片提示词 + AI 生成的图片
requests.post(f"{B}/api/cli/push", json={
    "type": "image", "project_name": "AI创作",
    "title": "赛博武士", "prompt": "A cyberpunk samurai…",
    "image_url": "https://cdn.example.com/result.jpg",  # server 自动下载保存
})
```

详见 [`skills/prompt-studio/`](skills/prompt-studio/)（agent skill 文件）和 [`pstudio-cli.py`](pstudio-cli.py)（CLI 工具）。

---

<div align="center">
<sub>Built with Electron · Python · Vanilla JS</sub>
</div>
