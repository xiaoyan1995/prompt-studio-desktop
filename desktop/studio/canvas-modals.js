/* canvas-modals.js — All canvas tool modals
   InpaintModal, OutpaintModal, CropModal, FrameCaptureModal,
   LightingToolModal, MultiAngleToolModal, GridSplitModal,
   AnnotateModal, AudioTrimModal, ImageInfoModal
*/
(function() {
  'use strict';

  const { useCanvasStore, useCanvasConfigStore, useToastStore, useGenerationStore, Icon, CvBtn, CvInput, CvSelect, CvTextarea, Spinner, downloadFile } = window.Cv;

  /* ── Modal registry (opened via cv:open-modal event) ────────────── */
  const MODAL_REGISTRY = {};

  function registerModal(name, component) {
    MODAL_REGISTRY[name] = component;
  }

  function ModalHost() {
    const [active, setActive] = React.useState(null); // { modal, nodeId, data }

    React.useEffect(() => {
      const handler = e => setActive(e.detail);
      window.addEventListener('cv:open-modal', handler);
      return () => window.removeEventListener('cv:open-modal', handler);
    }, []);

    if (!active) return null;
    const Comp = MODAL_REGISTRY[active.modal];
    if (!Comp) return null;
    return React.createElement(Comp, { nodeId: active.nodeId, data: active.data, onClose: () => setActive(null) });
  }

  /* ── Shared modal wrapper ────────────────────────────────────────── */
  function ModalWrap({ title, iconName, children, footer, onClose, width, maxHeight }) {
    return React.createElement('div', { className: 'cv-modal-overlay', onClick: onClose },
      React.createElement('div', {
        className: 'cv-modal',
        style: { width: width || 520, maxHeight: maxHeight || '88vh' },
        onClick: e => e.stopPropagation(),
      },
        React.createElement('div', { className: 'cv-modal-header' },
          iconName && Icon(iconName, 16),
          React.createElement('div', { className: 'cv-modal-title' }, title),
          React.createElement('button', { className: 'cv-btn icon ghost', onClick: onClose }, Icon('X', 14)),
        ),
        React.createElement('div', { className: 'cv-modal-body' }, children),
        footer && React.createElement('div', { className: 'cv-modal-footer' }, footer),
      ),
    );
  }

  /* ── InpaintModal — brush-based inpainting ───────────────────────── */
  function InpaintModal({ nodeId, data, onClose }) {
    const canvasRef = React.useRef(null);
    const overlayRef = React.useRef(null);
    const [brushSize, setBrushSize] = React.useState(30);
    const [prompt, setPrompt] = React.useState(data.prompt || '');
    const [model, setModel] = React.useState(data.model_id || '');
    const [isDrawing, setIsDrawing] = React.useState(false);
    const [generating, setGenerating] = React.useState(false);
    const src = data.dataUrl || data.imageUrl;
    const config = useCanvasConfigStore(s => s.config);

    React.useEffect(() => {
      if (!overlayRef.current) return;
      const ctx = overlayRef.current.getContext('2d');
      ctx.fillStyle = 'rgba(0,0,0,0)';
      ctx.clearRect(0, 0, overlayRef.current.width, overlayRef.current.height);
    }, []);

    const draw = (e, force) => {
      if (!isDrawing && !force) return;
      const overlay = overlayRef.current; if (!overlay) return;
      const rect = overlay.getBoundingClientRect();
      const scaleX = overlay.width / rect.width;
      const scaleY = overlay.height / rect.height;
      const x = (e.clientX - rect.left) * scaleX;
      const y = (e.clientY - rect.top) * scaleY;
      const ctx = overlay.getContext('2d');
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(255,100,100,0.7)';
      ctx.beginPath();
      ctx.arc(x, y, brushSize * scaleX / 2, 0, Math.PI * 2);
      ctx.fill();
    };

    const clearMask = () => {
      const overlay = overlayRef.current; if (!overlay) return;
      const ctx = overlay.getContext('2d');
      ctx.clearRect(0, 0, overlay.width, overlay.height);
    };

    const handleGenerate = async () => {
      if (!prompt) { useToastStore.getState().show('请输入提示词', 'error'); return; }
      if (!config.baseUrl || !config.apiKey) { useCanvasConfigStore.getState().openConfig(); return; }
      setGenerating(true);
      try {
        const results = await window.Cv.api.editImage(config, prompt,
          [{ url: src }], { model: model || config.imageModel });
        useCanvasStore.getState().updateNodeData(nodeId, {
          dataUrl: results[0].dataUrl, imageUrl: results[0].url,
          images: [...(data.images || []), results[0]],
          prompt,
        });
        useToastStore.getState().show('局部重绘完成', 'success');
        onClose();
      } catch(err) {
        useToastStore.getState().show('重绘失败: ' + err.message, 'error');
      } finally {
        setGenerating(false);
      }
    };

    return React.createElement(ModalWrap, {
      title: '局部重绘', iconName: 'PenLine', onClose, width: 640,
      footer: React.createElement(React.Fragment, null,
        React.createElement(CvBtn, { className: 'ghost', onClick: clearMask }, '清除遮罩'),
        React.createElement(CvBtn, { className: 'ghost', onClick: onClose }, '取消'),
        React.createElement(CvBtn, { className: 'primary', onClick: handleGenerate, disabled: generating },
          generating ? React.createElement(Spinner, { size: 14 }) : Icon('Sparkles', 13), generating ? '重绘中…' : '开始重绘',
        ),
      ),
    },
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        React.createElement('p', { style: { fontSize: 12, color: 'var(--subtle)' } }, '在图片上用鼠标涂抹需要重绘的区域，然后输入提示词'),
        React.createElement('div', { style: { position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: 8, overflow: 'hidden' } },
          src && React.createElement('img', { ref: canvasRef, src, alt: '', style: { width: '100%', height: '100%', objectFit: 'contain', display: 'block' } }),
          React.createElement('canvas', {
            ref: overlayRef, width: 800, height: 450,
            style: { position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='${brushSize}' height='${brushSize}'%3E%3Ccircle cx='${brushSize/2}' cy='${brushSize/2}' r='${brushSize/2-1}' fill='rgba(255,100,100,0.5)' stroke='%23ff6464' stroke-width='1'/%3E%3C/svg%3E") ${brushSize/2} ${brushSize/2}, crosshair` },
            onMouseDown: e => { setIsDrawing(true); draw(e, true); },
            onMouseMove: draw,
            onMouseUp: () => setIsDrawing(false),
            onMouseLeave: () => setIsDrawing(false),
          }),
        ),
        React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
          React.createElement('span', { style: { fontSize: 11, color: 'var(--subtle)', whiteSpace: 'nowrap' } }, '笔刷大小'),
          React.createElement('input', { type: 'range', min: 10, max: 100, value: brushSize, onChange: e => setBrushSize(Number(e.target.value)), style: { flex: 1 } }),
          React.createElement('span', { style: { fontSize: 11, color: 'var(--text)', minWidth: 28 } }, brushSize + 'px'),
        ),
        React.createElement(CvTextarea, { value: prompt, onChange: setPrompt, placeholder: '描述重绘区域的内容…', rows: 2 }),
        React.createElement('div', { style: { display: 'flex', gap: 8 } },
          React.createElement(CvInput, { value: model, onChange: setModel, placeholder: '模型（默认使用配置中的生图模型）' }),
        ),
      ),
    );
  }

  /* ── OutpaintModal — expand canvas outwards ─────────────────────── */
  function OutpaintModal({ nodeId, data, onClose }) {
    const [direction, setDirection] = React.useState('right');
    const [pixels, setPixels] = React.useState(256);
    const [prompt, setPrompt] = React.useState(data.prompt || '');
    const [generating, setGenerating] = React.useState(false);
    const config = useCanvasConfigStore(s => s.config);
    const src = data.dataUrl || data.imageUrl;

    const DIRS = [
      { v: 'right',  l: '→ 右扩展' },
      { v: 'left',   l: '← 左扩展' },
      { v: 'up',     l: '↑ 上扩展' },
      { v: 'down',   l: '↓ 下扩展' },
      { v: 'all',    l: '四边同时扩展' },
    ];

    const handleGenerate = async () => {
      if (!config.baseUrl || !config.apiKey) { useCanvasConfigStore.getState().openConfig(); return; }
      setGenerating(true);
      try {
        const outpaintPrompt = `Extend the image ${direction === 'all' ? 'in all directions' : direction} by ${pixels} pixels. ${prompt || 'Keep the same style and content as the original image.'}`;
        const results = await window.Cv.api.editImage(config, outpaintPrompt,
          [{ url: src }], { model: config.imageModel });
        useCanvasStore.getState().updateNodeData(nodeId, {
          dataUrl: results[0].dataUrl, imageUrl: results[0].url,
          images: [...(data.images || []), results[0]],
        });
        useToastStore.getState().show('扩展画面完成', 'success');
        onClose();
      } catch(err) {
        useToastStore.getState().show('扩展失败: ' + err.message, 'error');
      } finally {
        setGenerating(false);
      }
    };

    return React.createElement(ModalWrap, {
      title: '扩展画面', iconName: 'Expand', onClose,
      footer: React.createElement(React.Fragment, null,
        React.createElement(CvBtn, { className: 'ghost', onClick: onClose }, '取消'),
        React.createElement(CvBtn, { className: 'primary', onClick: handleGenerate, disabled: generating },
          generating ? React.createElement(Spinner, { size: 14 }) : Icon('Sparkles', 13), generating ? '扩展中…' : '开始扩展',
        ),
      ),
    },
      React.createElement('div', { style: { display: 'flex', gap: 12 } },
        src && React.createElement('img', { src, alt: '', style: { width: 160, height: 160, objectFit: 'contain', borderRadius: 8, background: '#000', flexShrink: 0 } }),
        React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 10 } },
          React.createElement('div', { className: 'cv-field' },
            React.createElement('label', null, '扩展方向'),
            React.createElement(CvSelect, { value: direction, onChange: setDirection },
              DIRS.map(d => React.createElement('option', { key: d.v, value: d.v }, d.l)),
            ),
          ),
          React.createElement('div', { className: 'cv-field' },
            React.createElement('label', null, '扩展像素'),
            React.createElement('div', { style: { display: 'flex', gap: 8, alignItems: 'center' } },
              React.createElement('input', { type: 'range', min: 64, max: 512, step: 64, value: pixels, onChange: e => setPixels(Number(e.target.value)), style: { flex: 1 } }),
              React.createElement('span', { style: { fontSize: 11, minWidth: 42 } }, pixels + 'px'),
            ),
          ),
          React.createElement('div', { className: 'cv-field' },
            React.createElement('label', null, '扩展内容提示词（可选）'),
            React.createElement(CvTextarea, { value: prompt, onChange: setPrompt, placeholder: '留空则自动延续原图风格…', rows: 2 }),
          ),
        ),
      ),
    );
  }

  /* ── CropModal ───────────────────────────────────────────────────── */
  function CropModal({ nodeId, data, onClose }) {
    const canvasRef = React.useRef(null);
    const [cropBox, setCropBox] = React.useState({ x: 10, y: 10, w: 80, h: 80 }); // percent
    const [dragging, setDragging] = React.useState(null);
    const src = data.dataUrl || data.imageUrl;

    const handleCrop = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const x = Math.round(img.naturalWidth * cropBox.x / 100);
        const y = Math.round(img.naturalHeight * cropBox.y / 100);
        const w = Math.round(img.naturalWidth * cropBox.w / 100);
        const h = Math.round(img.naturalHeight * cropBox.h / 100);
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, x, y, w, h, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/png');
        useCanvasStore.getState().updateNodeData(nodeId, { dataUrl, imageUrl: null });
        useToastStore.getState().show('裁剪完成', 'success');
        onClose();
      };
      img.src = src;
    };

    return React.createElement(ModalWrap, {
      title: '裁剪图片', iconName: 'Crop', onClose,
      footer: React.createElement(React.Fragment, null,
        React.createElement(CvBtn, { className: 'ghost', onClick: onClose }, '取消'),
        React.createElement(CvBtn, { className: 'primary', onClick: handleCrop }, Icon('Check', 13), ' 应用裁剪'),
      ),
    },
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        React.createElement('p', { style: { fontSize: 12, color: 'var(--subtle)' } }, '调整裁剪区域（百分比）'),
        src && React.createElement('div', { style: { position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: 8, overflow: 'hidden' } },
          React.createElement('img', { src, alt: '', style: { width: '100%', height: '100%', objectFit: 'contain' } }),
          React.createElement('div', {
            style: {
              position: 'absolute',
              left: cropBox.x + '%', top: cropBox.y + '%',
              width: cropBox.w + '%', height: cropBox.h + '%',
              border: '2px solid var(--primary)',
              background: 'rgba(var(--primary-rgb,214,161,93),.15)',
              cursor: 'move', boxSizing: 'border-box',
            },
          }),
        ),
        React.createElement('div', { className: 'cv-field-row' },
          ['x','y','w','h'].map(k => React.createElement('div', { key: k, className: 'cv-field' },
            React.createElement('label', null, k === 'x' ? '左 (%)' : k === 'y' ? '上 (%)' : k === 'w' ? '宽 (%)' : '高 (%)'),
            React.createElement('input', { type: 'number', className: 'cv-input', value: cropBox[k], min: 0, max: 100,
              onChange: e => setCropBox(prev => ({ ...prev, [k]: Math.max(0, Math.min(100, Number(e.target.value))) })),
            }),
          )),
        ),
      ),
    );
  }

  /* ── FrameCaptureModal — capture frames from video ───────────────── */
  function FrameCaptureModal({ nodeId, data, onClose }) {
    const videoRef = React.useRef(null);
    const [capturedFrames, setCapturedFrames] = React.useState([]);
    const [time, setTime] = React.useState(0);
    const src = data.videoUrl;

    const captureFrame = () => {
      const video = videoRef.current; if (!video) return;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth; canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);
      const dataUrl = canvas.toDataURL('image/png');
      const t = Math.round(video.currentTime * 100) / 100;
      setCapturedFrames(prev => [...prev, { dataUrl, time: t }]);
    };

    const sendToCanvas = (frame) => {
      const newId = useCanvasStore.getState().addNodeWithData('source-image', 0, 0, { dataUrl: frame.dataUrl, label: '帧 ' + frame.time + 's' });
      useCanvasStore.getState().addEdgeById(nodeId, newId);
      useToastStore.getState().show('帧已发送到画布', 'success');
    };

    return React.createElement(ModalWrap, {
      title: '视频帧截取', iconName: 'Camera', onClose, width: 600,
      footer: React.createElement(React.Fragment, null,
        React.createElement(CvBtn, { className: 'primary', onClick: captureFrame }, Icon('Camera', 13), ' 截取当前帧'),
        React.createElement(CvBtn, { className: 'ghost', onClick: onClose }, '完成'),
      ),
    },
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        src
          ? React.createElement('video', { ref: videoRef, src, controls: true, style: { width: '100%', borderRadius: 8, maxHeight: 300 }, onTimeUpdate: e => setTime(e.target.currentTime) })
          : React.createElement('div', { style: { textAlign: 'center', color: 'var(--subtle)', padding: 24 } }, '视频未生成或不可用'),
        capturedFrames.length > 0 && React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
          capturedFrames.map((f, i) =>
            React.createElement('div', { key: i, style: { position: 'relative' } },
              React.createElement('img', { src: f.dataUrl, alt: '', style: { width: 80, height: 45, objectFit: 'cover', borderRadius: 6, cursor: 'pointer', border: '1.5px solid var(--border)' } }),
              React.createElement('div', { style: { fontSize: 9, color: 'var(--subtle)', textAlign: 'center' } }, f.time + 's'),
              React.createElement('button', {
                style: { position: 'absolute', top: 2, right: 2, background: 'var(--primary)', border: 'none', borderRadius: 3, padding: '1px 4px', fontSize: 9, color: '#fff', cursor: 'pointer' },
                onClick: () => sendToCanvas(f),
              }, '→'),
              React.createElement('button', {
                style: { position: 'absolute', top: 2, left: 2, background: 'rgba(0,0,0,.6)', border: 'none', borderRadius: 3, padding: '1px 4px', fontSize: 9, color: '#fff', cursor: 'pointer' },
                onClick: () => downloadFile(f.dataUrl, 'frame-' + f.time + 's.png'),
              }, '↓'),
            ),
          ),
        ),
      ),
    );
  }

  /* ── LightingToolModal ───────────────────────────────────────────── */
  function LightingToolModal({ nodeId, data, onClose }) {
    const [preset, setPreset] = React.useState('studio');
    const [intensity, setIntensity] = React.useState(50);
    const [direction, setDirection] = React.useState('top-left');
    const [generating, setGenerating] = React.useState(false);
    const config = useCanvasConfigStore(s => s.config);
    const src = data.dataUrl || data.imageUrl;

    const PRESETS = [
      { v: 'studio',    l: '专业棚拍光' },
      { v: 'natural',   l: '自然光' },
      { v: 'dramatic',  l: '戏剧光' },
      { v: 'soft',      l: '柔光' },
      { v: 'neon',      l: '霓虹氛围光' },
      { v: 'sunset',    l: '黄金时段光' },
      { v: 'moonlight', l: '月光' },
      { v: 'cinematic', l: '电影感布光' },
    ];
    const DIRS = [
      { v: 'top-left',    l: '左上' },
      { v: 'top-right',   l: '右上' },
      { v: 'top',         l: '正上' },
      { v: 'left',        l: '正左' },
      { v: 'right',       l: '正右' },
      { v: 'front',       l: '正面' },
      { v: 'back-lit',    l: '逆光' },
    ];

    const handleApply = async () => {
      if (!config.baseUrl || !config.apiKey) { useCanvasConfigStore.getState().openConfig(); return; }
      setGenerating(true);
      try {
        const presetLabel = PRESETS.find(p => p.v === preset)?.l || preset;
        const dirLabel = DIRS.find(d => d.v === direction)?.l || direction;
        const prompt = `Apply ${presetLabel} lighting to the subject. Light direction: ${dirLabel}. Intensity ${intensity}%. Keep the original content and composition.`;
        const results = await window.Cv.api.editImage(config, prompt, [{ url: src }], { model: config.imageModel });
        useCanvasStore.getState().updateNodeData(nodeId, {
          dataUrl: results[0].dataUrl, imageUrl: results[0].url,
          images: [...(data.images || []), results[0]],
          lightingSettings: { preset, intensity, direction },
        });
        useToastStore.getState().show('打光完成', 'success');
        onClose();
      } catch(err) {
        useToastStore.getState().show('打光失败: ' + err.message, 'error');
      } finally {
        setGenerating(false);
      }
    };

    return React.createElement(ModalWrap, {
      title: '打光控制', iconName: 'Sun', onClose,
      footer: React.createElement(React.Fragment, null,
        React.createElement(CvBtn, { className: 'ghost', onClick: onClose }, '取消'),
        React.createElement(CvBtn, { className: 'primary', onClick: handleApply, disabled: generating },
          generating ? React.createElement(Spinner, { size: 14 }) : Icon('Sun', 13), generating ? '处理中…' : '应用打光',
        ),
      ),
    },
      React.createElement('div', { style: { display: 'flex', gap: 16 } },
        src && React.createElement('img', { src, alt: '', style: { width: 140, height: 140, objectFit: 'cover', borderRadius: 8, flexShrink: 0 } }),
        React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 10 } },
          React.createElement('div', { className: 'cv-field' },
            React.createElement('label', null, '光照预设'),
            React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 5 } },
              PRESETS.map(p =>
                React.createElement('button', {
                  key: p.v, className: 'cv-btn sm' + (preset === p.v ? ' primary' : ''),
                  onClick: () => setPreset(p.v),
                }, p.l),
              ),
            ),
          ),
          React.createElement('div', { className: 'cv-field' },
            React.createElement('label', null, '光照方向'),
            React.createElement(CvSelect, { value: direction, onChange: setDirection },
              DIRS.map(d => React.createElement('option', { key: d.v, value: d.v }, d.l)),
            ),
          ),
          React.createElement('div', { className: 'cv-field' },
            React.createElement('label', null, '光照强度 ' + intensity + '%'),
            React.createElement('input', { type: 'range', min: 10, max: 100, value: intensity, onChange: e => setIntensity(Number(e.target.value)), style: { width: '100%' } }),
          ),
        ),
      ),
    );
  }

  /* ── MultiAngleToolModal ─────────────────────────────────────────── */
  function MultiAngleToolModal({ nodeId, data, onClose }) {
    const ANGLES = [
      { label: '正面', prompt: 'front view, facing camera directly' },
      { label: '左侧', prompt: 'left side view, 90 degrees' },
      { label: '右侧', prompt: 'right side view, 90 degrees' },
      { label: '背面', prompt: 'back view, facing away from camera' },
      { label: '俯视', prompt: 'top-down aerial view' },
      { label: '仰视', prompt: 'low angle, looking up' },
      { label: '3/4左', prompt: 'three-quarter view from left' },
      { label: '3/4右', prompt: 'three-quarter view from right' },
    ];
    const [selected, setSelected] = React.useState(['正面','左侧','右侧','背面']);
    const [generating, setGenerating] = React.useState(false);
    const [results, setResults] = React.useState([]);
    const config = useCanvasConfigStore(s => s.config);
    const src = data.dataUrl || data.imageUrl;

    const toggleAngle = (label) => {
      setSelected(prev => prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label]);
    };

    const handleGenerate = async () => {
      if (!config.baseUrl || !config.apiKey) { useCanvasConfigStore.getState().openConfig(); return; }
      setGenerating(true);
      const newResults = [];
      try {
        for (const angle of ANGLES.filter(a => selected.includes(a.label))) {
          const prompt = `${angle.prompt}. Same subject, same style, same lighting as original image. High quality.`;
          const imgs = await window.Cv.api.editImage(config, prompt, [{ url: src }], { model: config.imageModel, count: '1' });
          if (imgs[0]) newResults.push({ label: angle.label, ...imgs[0] });
        }
        setResults(newResults);
        useToastStore.getState().show('多角度生成完成', 'success');
      } catch(err) {
        useToastStore.getState().show('生成失败: ' + err.message, 'error');
      } finally {
        setGenerating(false);
      }
    };

    const sendToCanvas = () => {
      results.forEach(r => {
        useCanvasStore.getState().addNodeWithData('source-image', 0, 0, { dataUrl: r.dataUrl, imageUrl: r.url, label: r.label });
      });
      useToastStore.getState().show('已发送到画布', 'success');
      onClose();
    };

    return React.createElement(ModalWrap, {
      title: '多角度生成', iconName: 'Orbit', onClose, width: 600, maxHeight: '90vh',
      footer: React.createElement(React.Fragment, null,
        results.length > 0 && React.createElement(CvBtn, { className: 'sm', onClick: sendToCanvas }, Icon('Plus', 12), ' 发送到画布'),
        React.createElement(CvBtn, { className: 'ghost', onClick: onClose }, '关闭'),
        React.createElement(CvBtn, { className: 'primary', onClick: handleGenerate, disabled: generating || !selected.length },
          generating ? React.createElement(Spinner, { size: 14 }) : Icon('Orbit', 13), generating ? '生成中…' : '生成 ' + selected.length + ' 个角度',
        ),
      ),
    },
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
        React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
          ANGLES.map(a =>
            React.createElement('button', {
              key: a.label,
              className: 'cv-btn sm' + (selected.includes(a.label) ? ' primary' : ''),
              onClick: () => toggleAngle(a.label),
            }, a.label),
          ),
        ),
        results.length > 0 && React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
          results.map((r, i) =>
            React.createElement('div', { key: i, style: { textAlign: 'center' } },
              React.createElement('img', { src: r.dataUrl || r.url, alt: r.label, style: { width: 120, height: 120, objectFit: 'cover', borderRadius: 8 } }),
              React.createElement('div', { style: { fontSize: 10, color: 'var(--subtle)', marginTop: 4 } }, r.label),
            ),
          ),
        ),
      ),
    );
  }

  /* ── GridSplitModal — 九宫格切割 ─────────────────────────────────── */
  function GridSplitModal({ nodeId, data, onClose }) {
    const [rows, setRows] = React.useState(3);
    const [cols, setCols] = React.useState(3);
    const [gap, setGap] = React.useState(0);
    const src = data.dataUrl || data.imageUrl;

    const handleSplit = () => {
      if (!src) { useToastStore.getState().show('节点无图片', 'error'); return; }
      const img = new Image();
      img.onload = () => {
        const tileW = Math.floor(img.naturalWidth / cols);
        const tileH = Math.floor(img.naturalHeight / rows);
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const canvas = document.createElement('canvas');
            canvas.width = tileW - gap; canvas.height = tileH - gap;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(img, c * tileW + gap/2, r * tileH + gap/2, tileW - gap, tileH - gap, 0, 0, tileW - gap, tileH - gap);
            const dataUrl = canvas.toDataURL('image/png');
            const x = (useCanvasStore.getState()._nodeMap.get(nodeId)?.position.x || 0) + c * (tileW + 10 - gap);
            const y = (useCanvasStore.getState()._nodeMap.get(nodeId)?.position.y || 0) + r * (tileH + 10 - gap) + 300;
            useCanvasStore.getState().addNodeWithData('source-image', x, y, { dataUrl, label: `格${r+1}-${c+1}` }, { w: tileW - gap, h: tileH - gap });
          }
        }
        useToastStore.getState().show(`已切割为 ${rows}×${cols} 格`, 'success');
        onClose();
      };
      img.src = src;
    };

    return React.createElement(ModalWrap, {
      title: '九宫格切割', iconName: 'Grid2x2', onClose,
      footer: React.createElement(React.Fragment, null,
        React.createElement(CvBtn, { className: 'ghost', onClick: onClose }, '取消'),
        React.createElement(CvBtn, { className: 'primary', onClick: handleSplit }, Icon('Grid2x2', 13), ' 切割'),
      ),
    },
      React.createElement('div', { style: { display: 'flex', gap: 16 } },
        src && React.createElement('img', { src, alt: '', style: { width: 140, height: 140, objectFit: 'contain', borderRadius: 8, background: '#000', flexShrink: 0 } }),
        React.createElement('div', { style: { flex: 1, display: 'flex', flexDirection: 'column', gap: 10 } },
          React.createElement('div', { className: 'cv-field-row' },
            React.createElement('div', { className: 'cv-field' },
              React.createElement('label', null, '行数'),
              React.createElement('input', { type: 'number', className: 'cv-input', value: rows, min: 1, max: 10, onChange: e => setRows(Number(e.target.value)) }),
            ),
            React.createElement('div', { className: 'cv-field' },
              React.createElement('label', null, '列数'),
              React.createElement('input', { type: 'number', className: 'cv-input', value: cols, min: 1, max: 10, onChange: e => setCols(Number(e.target.value)) }),
            ),
          ),
          React.createElement('div', { className: 'cv-field' },
            React.createElement('label', null, '间距 (px)'),
            React.createElement('input', { type: 'number', className: 'cv-input', value: gap, min: 0, max: 40, onChange: e => setGap(Number(e.target.value)) }),
          ),
          React.createElement('div', { style: { fontSize: 11, color: 'var(--subtle)' } }, `将在画布上创建 ${rows * cols} 个图片节点`),
        ),
      ),
    );
  }

  /* ── AnnotateModal — add annotations to image ───────────────────── */
  function AnnotateModal({ nodeId, data, onClose }) {
    const canvasRef = React.useRef(null);
    const [tool, setTool] = React.useState('text'); // 'text' | 'arrow' | 'rect' | 'circle'
    const [color, setColor] = React.useState('#ff4444');
    const [annotations, setAnnotations] = React.useState([]);
    const [currentText, setCurrentText] = React.useState('');
    const src = data.dataUrl || data.imageUrl;

    const addAnnotation = (x, y) => {
      if (tool === 'text' && !currentText) return;
      setAnnotations(prev => [...prev, { type: tool, x, y, text: currentText, color }]);
      setCurrentText('');
    };

    const handleExport = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        annotations.forEach(a => {
          ctx.strokeStyle = a.color; ctx.fillStyle = a.color;
          ctx.lineWidth = 3; ctx.font = '24px sans-serif';
          if (a.type === 'text') ctx.fillText(a.text, a.x * img.naturalWidth / 100, a.y * img.naturalHeight / 100);
        });
        const dataUrl = canvas.toDataURL('image/png');
        useCanvasStore.getState().updateNodeData(nodeId, { dataUrl });
        useToastStore.getState().show('标注已应用', 'success');
        onClose();
      };
      img.src = src;
    };

    return React.createElement(ModalWrap, {
      title: '图片标注', iconName: 'PenLine', onClose, width: 600,
      footer: React.createElement(React.Fragment, null,
        React.createElement(CvBtn, { className: 'sm danger', onClick: () => setAnnotations([]) }, '清空标注'),
        React.createElement(CvBtn, { className: 'ghost', onClick: onClose }, '取消'),
        React.createElement(CvBtn, { className: 'primary', onClick: handleExport }, Icon('Check', 13), ' 应用'),
      ),
    },
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        React.createElement('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
          ['text','arrow','rect','circle'].map(t =>
            React.createElement('button', { key: t, className: 'cv-btn sm' + (tool === t ? ' primary' : ''), onClick: () => setTool(t) },
              t === 'text' ? '文字' : t === 'arrow' ? '箭头' : t === 'rect' ? '矩形' : '圆形',
            ),
          ),
          React.createElement('input', { type: 'color', value: color, onChange: e => setColor(e.target.value), style: { width: 32, height: 32, padding: 0, border: 'none', borderRadius: 4, cursor: 'pointer' } }),
          tool === 'text' && React.createElement(CvInput, { value: currentText, onChange: setCurrentText, placeholder: '标注文字…', style: { flex: 1 } }),
        ),
        React.createElement('div', {
          style: { position: 'relative', width: '100%', aspectRatio: '16/9', background: '#000', borderRadius: 8, overflow: 'hidden', cursor: 'crosshair' },
          onClick: e => {
            const rect = e.currentTarget.getBoundingClientRect();
            const x = (e.clientX - rect.left) / rect.width * 100;
            const y = (e.clientY - rect.top) / rect.height * 100;
            addAnnotation(x, y);
          },
        },
          src && React.createElement('img', { src, alt: '', style: { width: '100%', height: '100%', objectFit: 'contain' } }),
          annotations.map((a, i) =>
            React.createElement('div', {
              key: i, style: { position: 'absolute', left: a.x + '%', top: a.y + '%', color: a.color, fontSize: 14, fontWeight: 700, textShadow: '0 0 3px #000', pointerEvents: 'none' },
            }, a.type === 'text' ? a.text : a.type === 'arrow' ? '→' : a.type === 'rect' ? '□' : '○'),
          ),
        ),
      ),
    );
  }

  /* ── AudioTrimModal ──────────────────────────────────────────────── */
  function AudioTrimModal({ nodeId, data, onClose }) {
    const audioRef = React.useRef(null);
    const [start, setStart] = React.useState(0);
    const [end, setEnd] = React.useState(30);
    const [duration, setDuration] = React.useState(0);
    const src = data.audioUrl;

    return React.createElement(ModalWrap, {
      title: '音频裁剪', iconName: 'Scissors', onClose,
      footer: React.createElement(React.Fragment, null,
        React.createElement(CvBtn, { className: 'ghost', onClick: onClose }, '取消'),
        React.createElement(CvBtn, { className: 'primary', onClick: () => { useToastStore.getState().show('音频裁剪需要 AudioContext 支持，即将在浏览器版本中实现', 'info'); } },
          Icon('Scissors', 13), ' 裁剪',
        ),
      ),
    },
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
        src
          ? React.createElement('audio', {
              ref: audioRef, src, controls: true, style: { width: '100%' },
              onLoadedMetadata: e => { setDuration(e.target.duration); setEnd(e.target.duration); },
            })
          : React.createElement('div', { style: { textAlign: 'center', color: 'var(--subtle)', padding: 24 } }, '音频未生成'),
        duration > 0 && React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'cv-field-row' },
            React.createElement('div', { className: 'cv-field' },
              React.createElement('label', null, '起始 (s)'),
              React.createElement('input', { type: 'number', className: 'cv-input', value: start, min: 0, max: end - 0.1, step: 0.1, onChange: e => setStart(Number(e.target.value)) }),
            ),
            React.createElement('div', { className: 'cv-field' },
              React.createElement('label', null, '结束 (s)'),
              React.createElement('input', { type: 'number', className: 'cv-input', value: end, min: start + 0.1, max: duration, step: 0.1, onChange: e => setEnd(Number(e.target.value)) }),
            ),
          ),
          React.createElement('div', { style: { fontSize: 11, color: 'var(--subtle)' } }, `裁剪区间: ${start.toFixed(1)}s → ${end.toFixed(1)}s（共 ${(end - start).toFixed(1)}s）`),
        ),
      ),
    );
  }

  /* ── ImageInfoModal ──────────────────────────────────────────────── */
  function ImageInfoModal({ nodeId, data, onClose }) {
    const [dimensions, setDimensions] = React.useState('');
    const src = data.dataUrl || data.imageUrl;
    const isVideo = !!(data.videoUrl);

    React.useEffect(() => {
      if (!src || isVideo) return;
      const img = new Image();
      img.onload = () => setDimensions(img.naturalWidth + ' × ' + img.naturalHeight);
      img.src = src;
    }, [src]);

    const rows = [
      ['节点 ID', nodeId],
      ['节点类型', data.nodeType || '—'],
      ['模型', data.model_id || data.generated_model_id || '—'],
      ['生图尺寸', data.size || data.aspect_ratio || '—'],
      ['图片尺寸', dimensions || '—'],
      ['质量', data.quality || '—'],
      ['生成时间', data.generatedAt ? new Date(data.generatedAt).toLocaleString('zh-CN') : '—'],
    ].filter(([, v]) => v && v !== '—');

    return React.createElement(ModalWrap, {
      title: '生成信息', iconName: 'Info', onClose, width: 400,
      footer: React.createElement(React.Fragment, null,
        data.prompt && React.createElement('button', { className: 'cv-btn sm ghost', onClick: () => { navigator.clipboard.writeText(data.prompt); useToastStore.getState().show('已复制提示词', 'success'); } }, Icon('Copy', 12), ' 复制提示词'),
        React.createElement(CvBtn, { className: 'ghost', onClick: onClose }, '关闭'),
      ),
    },
      React.createElement('div', { style: { display: 'flex', flexDirection: 'column', gap: 0 } },
        data.prompt && React.createElement('div', { style: { marginBottom: 12, padding: '8px 12px', background: 'var(--surface-2)', borderRadius: 8 } },
          React.createElement('div', { style: { fontSize: 10, color: 'var(--subtle)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 } }, '提示词'),
          React.createElement('div', { style: { fontSize: 12, color: 'var(--text)', lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' } }, data.prompt),
        ),
        rows.map(([k, v]) =>
          React.createElement('div', { key: k, style: { display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid var(--border)' } },
            React.createElement('span', { style: { fontSize: 12, color: 'var(--subtle)' } }, k),
            React.createElement('span', { style: { fontSize: 12, color: 'var(--text)', fontWeight: 500 } }, v),
          ),
        ),
      ),
    );
  }

  /* ── Register all modals ─────────────────────────────────────────── */
  registerModal('inpaint',      InpaintModal);
  registerModal('outpaint',     OutpaintModal);
  registerModal('crop',         CropModal);
  registerModal('frame-capture',FrameCaptureModal);
  registerModal('lighting',     LightingToolModal);
  registerModal('multi-angle',  MultiAngleToolModal);
  registerModal('grid-split',   GridSplitModal);
  registerModal('annotate',     AnnotateModal);
  registerModal('audio-trim',   AudioTrimModal);
  registerModal('info',         ImageInfoModal);

  /* ── Export ──────────────────────────────────────────────────────── */
  window.Cv = window.Cv || {};
  Object.assign(window.Cv, {
    ModalHost,
    InpaintModal, OutpaintModal, CropModal, FrameCaptureModal,
    LightingToolModal, MultiAngleToolModal, GridSplitModal,
    AnnotateModal, AudioTrimModal, ImageInfoModal,
  });

})();
