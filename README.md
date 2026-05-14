# Prompt Studio Desktop

这是一个和原项目并行存在的桌面端版本，默认使用 `http://127.0.0.1:8767`，不会影响原来的 `8766` 版本。

## 开发运行

直接双击根目录的 `dev-start.bat`，或在终端运行：

```powershell
cd prompt_studio_desktop
.\dev-start.bat
```

开发模式会用本机 Python 启动 `desktop/studio/server.py`。

只检查环境不启动窗口：

```powershell
.\dev-start.bat --check
```

## 安装新版浏览器插件

1. 打开 Chrome / Edge 的扩展管理页。
2. 开启开发者模式。
3. 加载 `prompt_studio_desktop/extension`。

新版插件默认连接桌面端 `http://127.0.0.1:8767`。

## 设置归属

桌面端「设置」是主配置：

- AI Key
- 图片/视频模型
- 反推默认指令
- 提示词预设库

插件设置只保留：

- 桌面端连接地址
- 站点黑名单

反推时插件会优先读取桌面端 `/api/desktop/settings`，所以不要在插件里维护第二套 AI 配置。

## 数据目录

正式包会把数据放在软件同目录的 `studio-data` 文件夹里，和原版“程序旁边存数据”的方式一致：

- Windows 文件夹免安装版：`Prompt Studio Desktop/studio-data`
- Windows 单文件便携版：`Prompt Studio Desktop 1.0.2.exe` 旁边的 `studio-data`
- Windows 安装版：安装目录旁的 `studio-data`
- macOS：`Prompt Studio Desktop.app` 所在目录旁的 `studio-data`，或单文件便携环境提供的同级目录

迁移数据只需把旧的 `studio-data` 文件夹复制到新版软件同目录即可。

## 删除与素材清理

默认删除只删除项目/提示词记录，不会删除 `studio-data/uploads` 里的图片或视频。

图片/视频提示词详情里可以使用「删除+素材」，它会删除当前提示词记录，并删除只被这条提示词引用的本地图片/视频；如果同一个素材还被其他提示词引用，会保留。

桌面端设置里的「清理未引用素材」会扫描 `studio-data/uploads`，删除所有没有被任何提示词引用的本地图片/视频。

## 打包说明

正式发布前建议先用 PyInstaller 把 `desktop/studio/server.py` 打成 sidecar，并放入：

```text
prompt_studio_desktop/desktop/server-dist/prompt-studio-server.exe
prompt_studio_desktop/desktop/server-dist/prompt-studio-server
```

Electron 启动时会优先使用 sidecar；找不到 sidecar 时才退回系统 Python。

### Windows

在 Windows 上运行：

```powershell
cd prompt_studio_desktop\desktop
npm install
python -m PyInstaller --clean --noconfirm --onefile --name prompt-studio-server --distpath server-dist --workpath server-build --specpath server-build studio\server.py
$env:CSC_IDENTITY_AUTO_DISCOVERY='false'
npm run build:win -- --publish never
```

产物在 `desktop/dist`。

### macOS

macOS 安装包必须在 macOS 上构建。把源码包拷到 Mac 后运行：

```bash
bash build-mac.command
```

产物在 `desktop/dist`，同一份 `extension` 可在 macOS 的 Chrome / Edge / Arc 里加载。
