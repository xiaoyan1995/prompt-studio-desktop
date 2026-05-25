# -*- mode: python ; coding: utf-8 -*-
import os
from PyInstaller.utils.hooks import collect_submodules, collect_dynamic_libs
_server_py = os.path.join(SPECPATH, '..', 'studio', 'server.py')

_studio = os.path.join(SPECPATH, '..', 'studio')
_hidden = (
    ['email.mime.text','email.mime.multipart','http.server','urllib.parse',
     'cv2','numpy','tqdm','click','platformdirs',
     'onnxruntime','onnxruntime.capi']
    + collect_submodules('scenedetect')
    + collect_submodules('onnxruntime')
)

a = Analysis(
    [_server_py],
    pathex=[],
    binaries=collect_dynamic_libs('cv2'),
    datas=[
        (os.path.join(_studio, 'transnetv2.onnx'), '.'),
    ],
    hiddenimports=_hidden,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=[],
    noarchive=False,
    optimize=0,
)
pyz = PYZ(a.pure)

exe = EXE(
    pyz,
    a.scripts,
    a.binaries,
    a.datas,
    [],
    name='prompt-studio-server',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    upx_exclude=[],
    runtime_tmpdir=None,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)
