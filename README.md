<div align="center">

# 🎨 Prompt Studio Desktop

**A local desktop app for managing AI image & video prompts — with a companion browser extension.**

[![Version](https://img.shields.io/badge/version-1.0.3-blue.svg)](https://github.com/xiaoyan1995/prompt-studio-desktop/releases)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey.svg)](#build)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-37-47848F.svg)](https://www.electronjs.org/)

[English](#english) · [中文说明](#中文说明)

</div>

---

## English

### ✨ Features

- 📁 **Project-based organization** — group image & video prompts by project
- 🖼️ **Rich media support** — attach reference images and videos to each prompt
- 🤖 **Skills / Agent prompts** — full Markdown editor with preview
- 🔍 **Reverse prompt** — analyze uploaded media and auto-generate prompt text
- 🏷️ **Tags & search** — full-text search across titles, prompts, tags and analysis
- 📦 **Export bundles** — zip selected assets with metadata for sharing
- 💾 **Snapshot backup** — one-click local backup and restore
- 🔁 **Duplicate detection** — find identical or similar prompts across projects
- 🌐 **Browser extension** — floating toolbar on any page; send media to desktop instantly
- 🚫 **Domain blacklist** — per-site block list to hide the extension toolbar

### 📦 Installation (No Build Required)

Download the latest distribution zip from [Releases](https://github.com/xiaoyan1995/prompt-studio-desktop/releases), unzip and run:

```
Prompt Studio Desktop/
├── Prompt Studio Desktop.exe   ← double-click to launch
├── studio-data/                ← your data lives here (auto-created)
└── extension/                  ← load this folder as a browser extension
```

**Load the browser extension:**
1. Open `chrome://extensions` (Chrome / Edge)
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `extension/` folder

### 🛠️ Development

**Requirements:** Node.js 18+, Python 3.10+

```bash
# Clone
git clone https://github.com/xiaoyan1995/prompt-studio-desktop.git
cd prompt-studio-desktop

# Install dependencies
cd desktop && npm install

# Start (Windows)
cd ..
dev-start.bat

# Start (macOS / Linux)
cd desktop && npm start
```

Dev mode starts `studio/server.py` automatically using your system Python.

### 🏗️ Build

<details>
<summary><b>Windows</b></summary>

```powershell
cd desktop
npm install

# Compile Python server (required for packaged app)
python -m PyInstaller --clean --noconfirm --onefile `
  --name prompt-studio-server `
  --distpath server-dist `
  --workpath server-build `
  --specpath server-build `
  studio\server.py

# Build Electron app
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
npm run build:win
```

Output: `desktop/dist/`
</details>

<details>
<summary><b>macOS</b></summary>

```bash
cd desktop && npm install
bash ../build-mac.command
```

Output: `desktop/dist/`
</details>

### 📂 Data Directory

All data is stored **next to the app**, never in hidden system folders:

| Platform | Path |
|---|---|
| Windows (portable) | `Prompt Studio Desktop\studio-data\` |
| macOS | `Prompt Studio Desktop.app/../studio-data\` |

To migrate data, simply copy the `studio-data/` folder to the new version's directory.

---

## 中文说明

### ✨ 功能特性

- 📁 **项目式管理** — 按项目组织图片和视频提示词
- 🖼️ **富媒体支持** — 每条提示词可附加参考图片和视频
- 🤖 **Skills / Agent 提示词** — 全功能 Markdown 编辑器含预览
- 🔍 **反推提示词** — 上传素材后自动分析生成提示词文本
- 🏷️ **标签与全文搜索** — 跨标题、提示词、标签、分析报告检索
- 📦 **一键导出包** — 将选中资产打包为 ZIP 分享
- 💾 **快照备份** — 一键本地备份与恢复
- 🔁 **重复检测** — 发现跨项目的相同或相似提示词
- 🌐 **浏览器插件** — 任意页面浮动工具栏，一键发送素材到桌面端
- 🚫 **域名黑名单** — 按站点屏蔽插件工具栏

### 📦 安装使用（无需编译）

从 [Releases](https://github.com/xiaoyan1995/prompt-studio-desktop/releases) 下载最新分发包，解压后直接双击 `Prompt Studio Desktop.exe` 运行。

**安装浏览器插件：**
1. 打开 `chrome://extensions`（Chrome / Edge）
2. 开启**开发者模式**
3. 点击**加载已解压的扩展程序** → 选择 `extension/` 文件夹

### 🛠️ 开发运行

**环境要求：** Node.js 18+，Python 3.10+

```powershell
# 克隆仓库
git clone https://github.com/xiaoyan1995/prompt-studio-desktop.git
cd prompt-studio-desktop

# 安装依赖
cd desktop
npm install

# 启动（Windows）
cd ..
dev-start.bat
```

开发模式会自动用本机 Python 启动 `studio/server.py`。

### 📂 数据目录

数据始终存储在**软件同目录**的 `studio-data/` 文件夹，迁移时直接复制该文件夹到新版目录即可。

### 🏗️ 打包说明

```powershell
cd desktop
npm install

# 编译 Python 服务（打包必须）
python -m PyInstaller --clean --noconfirm --onefile `
  --name prompt-studio-server `
  --distpath server-dist `
  --workpath server-build `
  --specpath server-build `
  studio\server.py

# 构建 Electron 应用
$env:CSC_IDENTITY_AUTO_DISCOVERY = 'false'
npm run build:win
```

产物在 `desktop/dist/`，macOS 在 Mac 上运行 `bash build-mac.command`。

---

<div align="center">
<sub>Built with Electron · Python · Vanilla JS</sub>
</div>
