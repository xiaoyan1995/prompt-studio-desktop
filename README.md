<div align="center">

# 🎨 Prompt Studio Desktop

**A local desktop app for managing AI image & video prompts — with a companion browser extension.**

[![Version](https://img.shields.io/badge/version-1.0.4-blue.svg)](https://github.com/xiaoyan1995/prompt-studio-desktop/releases)
[![Build](https://github.com/xiaoyan1995/prompt-studio-desktop/actions/workflows/build.yml/badge.svg)](https://github.com/xiaoyan1995/prompt-studio-desktop/actions/workflows/build.yml)
[![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20macOS-lightgrey.svg)](#build)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![Electron](https://img.shields.io/badge/Electron-37-47848F.svg)](https://www.electronjs.org/)

[English](README.md) · [中文说明](README_CN.md)

</div>

---

## ✨ Features

- 📁 **Project-based organization** — group image & video prompts by project
- 🖼️ **Rich media support** — attach reference images and videos to each prompt
- 🤖 **Skills / Agent prompts** — full Markdown editor with preview
- 🔍 **Reverse prompt** — analyze uploaded media and auto-generate prompt text
- 🏷️ **Tags & search** — full-text search across titles, prompts, tags and analysis
- 📦 **Export bundles** — zip selected assets with metadata for sharing
- 💾 **Snapshot backup** — one-click local backup and restore
- 🔁 **Duplicate detection** — find identical or similar prompts across projects
- 🌐 **Browser extension** — floating toolbar on any page; send media to desktop instantly
- � **Document library** — upload & preview PDF, Word, Excel, PPT, TXT, Markdown and more
- �🚫 **Domain blacklist** — per-site block list to hide the extension toolbar

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

Builds are **automated via GitHub Actions** — every push to `main` produces Windows + macOS artifacts, and pushing a version tag creates a GitHub Release.

```bash
# Trigger a release
git tag v1.0.4
git push origin v1.0.4
```

<details>
<summary>Manual build (local)</summary>

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

<div align="center">
<sub>Built with Electron · Python · Vanilla JS</sub>
</div>
