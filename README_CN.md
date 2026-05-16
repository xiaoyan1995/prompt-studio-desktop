<div align="center">

# 🎨 Prompt Studio Desktop

**本地桌面端 AI 图片 & 视频提示词管理工具，配套浏览器插件。**

[![版本](https://img.shields.io/badge/版本-1.0.8-blue.svg)](https://github.com/xiaoyan1995/prompt-studio-desktop/releases)
[![构建](https://github.com/xiaoyan1995/prompt-studio-desktop/actions/workflows/build.yml/badge.svg)](https://github.com/xiaoyan1995/prompt-studio-desktop/actions/workflows/build.yml)
[![平台](https://img.shields.io/badge/平台-Windows%20%7C%20macOS-lightgrey.svg)](#打包说明)
[![Electron](https://img.shields.io/badge/Electron-37-47848F.svg)](https://www.electronjs.org/)

[English](README.md) · 中文说明

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
- 🚫 **域名黑名单** — 按站点屏蔽插件工具栏
- 🖼️ **图片画廊** — 每条提示词支持多张生成图，点击缩略图设为主图
- 🔎 **大图查看** — 点击图片全屏浏览
- 🤝 **Agent / CLI 集成** — 完整 HTTP API，外部 agent 可读写提示词、推送 AI 生成的图片和视频

---

## � 版本记录

### v1.0.8
- 🖼️ 图片画廊条 — 每条提示词支持多张生成图，点击缩略图设为主图
- 🔎 大图查看 — 点击主图全屏 lightbox 浏览
- @ 图片引用 — 提示词输入框输入 `@` 弹出图片选择面板
- 🤝 Agent HTTP API — `/api/cli/*` 端点支持 list / get / search / push
-  `pstudio-cli.py` — Agent 集成 CLI 工具
- 🤖 `skills/prompt-studio/` — 开箱即用的 agent skill，含完整 API 说明
- Agent 可通过 URL 或 base64 推送 AI 生成的图片和视频
- 参考图与画廊图分离存储（`ref_image` vs `gallery`）
- 📸 **批量采集图片** — 一键扫描页面图片，智能 CDN 清洗获取大图，按格式/尺寸筛选后批量发送到桌面端

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
git tag v1.0.8
git push origin v1.0.8
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
