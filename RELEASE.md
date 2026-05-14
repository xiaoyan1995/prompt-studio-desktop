# Prompt Studio Desktop 发布包说明

## 插件是否通用

`extension` 是 Chromium 扩展，同一份可用于 Windows 和 macOS 上的 Chrome / Edge / Arc。

Safari 需要单独转换为 Safari Web Extension，不是同一个安装包。

## Windows

优先使用安装包：

- `Prompt Studio Desktop Setup 1.0.2.exe`

免安装有两种：

- 推荐的文件夹免安装版：`PromptStudioDesktop-Windows-PortableFolder-1.0.2.zip`
- 单文件便携版：`Prompt Studio Desktop 1.0.2.exe`

如果你想要“像原版一样，程序和数据都在同一个文件夹里”，用文件夹免安装版最直观：解压后运行里面的 `Prompt Studio Desktop.exe`。

桌面端内置了本地后端，不需要额外安装 Python。

数据会写入软件同目录的 `studio-data` 文件夹：

- 文件夹免安装版：`Prompt Studio Desktop/studio-data`
- 单文件便携版：`Prompt Studio Desktop 1.0.2.exe` 旁边的 `studio-data`
- 安装版：安装目录旁的 `studio-data`

旧版 `%APPDATA%/prompt-studio-desktop/studio-data` 里的数据会在首次启动时自动迁移到本地 `studio-data`。

删除策略：

- 普通删除只删除记录，不删除图片/视频文件
- 图片/视频提示词详情里的 `删除+素材` 会同时删除未被其他提示词引用的本地素材
- 设置里的 `清理未引用素材` 会删除 `studio-data/uploads` 下没有被任何提示词引用的文件

浏览器插件安装：

1. 打开 Chrome / Edge 扩展管理页。
2. 开启开发者模式。
3. 选择本包里的 `extension` 文件夹加载。

## macOS

Electron 的 macOS 安装包必须在 macOS 上构建。

把 `PromptStudioDesktop-Source-1.0.2.zip` 解压到 Mac 后运行：

```bash
bash build-mac.command
```

构建成功后，产物会在：

```text
desktop/dist
```

浏览器插件仍然加载同一份 `extension` 文件夹。
