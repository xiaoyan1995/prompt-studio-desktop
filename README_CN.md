<div align="center">

# 🎨 Prompt Studio Desktop

**本地桌面端 AI 图片 & 视频提示词管理工具，配套浏览器插件。**

[![版本](https://img.shields.io/badge/版本-1.0.3-blue.svg)](https://github.com/xiaoyan1995/prompt-studio-desktop/releases)
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
- 🚫 **域名黑名单** — 按站点屏蔽插件工具栏

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

产物在 `desktop/dist/`。macOS 打包需在 Mac 上运行：

```bash
cd desktop && npm install
bash ../build-mac.command
```

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

<div align="center">
<sub>Built with Electron · Python · Vanilla JS</sub>
</div>
