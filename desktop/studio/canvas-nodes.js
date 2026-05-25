/* canvas-nodes.js — All node components for the canvas
   Implements: AnimatedEdge, GroupNode, CommentNode, NodeShell + all per-type plugins
   Each node has IdleView (compact) + ActiveView (expanded when solo-selected).
*/
(function() {
  'use strict';

  const { Handle, Position, NodeResizer, useStore } = window.ReactFlow;
  const {
    useCanvasStore, useHandleProximityStore, useCanvasDragStore,
    useConnectionDragStore, useCommentModeStore, useGenerationStore,
    useCanvasConfigStore, useToastStore, usePanelStore,
    useHistoryStore, NODE_TYPE_CONFIGS, isConnectionAllowed, nanoid,
  } = window.Cv;

  /* ── Icon helpers from lucide ──────────────────────────────────────────── */
  const L = window.lucideReact || {};
  const Icon = (name, size, color, style) => {
    const Comp = L[name];
    if (!Comp) return null;
    return React.createElement(Comp, { size: size || 14, color: color, style });
  };

  /* ── Tiny shared UI ────────────────────────────────────────────────────── */
  function Spinner({ size }) {
    return React.createElement('div', { className: 'cv-gen-spinner', style: size ? { width: size, height: size } : undefined });
  }

  function TbBtn({ iconName, onClick, title, active, danger }) {
    return React.createElement('button', {
      className: 'cv-node-action-btn' + (active ? ' active' : '') + (danger ? ' danger' : ''),
      onClick: e => { e.stopPropagation(); onClick && onClick(e); },
      onMouseDown: e => e.stopPropagation(),
      title,
      style: danger ? { color: 'var(--danger)' } : undefined,
    }, Icon(iconName, 13));
  }

  function CvBtn({ children, onClick, className, disabled, style }) {
    return React.createElement('button', {
      className: 'cv-btn ' + (className || ''),
      onClick, disabled, style,
      onMouseDown: e => e.stopPropagation(),
    }, children);
  }

  function CvSelect({ value, onChange, children, style }) {
    return React.createElement('select', { className: 'cv-select', value, onChange: e => onChange(e.target.value), style }, children);
  }

  function CvInput({ value, onChange, placeholder, type, style }) {
    return React.createElement('input', {
      className: 'cv-input', value: value || '', placeholder, type: type || 'text',
      onChange: e => onChange(e.target.value), style,
      onMouseDown: e => e.stopPropagation(),
    });
  }

  function CvTextarea({ value, onChange, placeholder, rows, style }) {
    return React.createElement('textarea', {
      className: 'cv-textarea', value: value || '', placeholder, rows: rows || 4,
      onChange: e => onChange(e.target.value), style,
      onMouseDown: e => e.stopPropagation(),
      onKeyDown: e => e.stopPropagation(),
    });
  }

  /* ── Download helper ───────────────────────────────────────────────────── */
  function downloadFile(url, filename) {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || ('canvas-export-' + Date.now());
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function copyToClipboard(text) {
    try { navigator.clipboard.writeText(text); } catch(e) {}
  }

  /* ── AnimatedEdge ──────────────────────────────────────────────────────── */
  function AnimatedEdge({ id, sourceX, sourceY, targetX, targetY, selected }) {
    const edgeId = useCanvasStore.useHandleProximityStore ? id : id;
    const { edgeId: hoveredId, scissorVisible, x: sx, y: sy } = (window.Cv.useEdgeHoverStore)(s => ({
      edgeId: s.edgeId, scissorVisible: s.scissorVisible, x: s.x, y: s.y,
    }));
    const isHovered = hoveredId === id;

    const midX = (sourceX + targetX) / 2;
    const midY = (sourceY + targetY) / 2;
    const d = `M${sourceX},${sourceY} C${sourceX + 60},${sourceY} ${targetX - 60},${targetY} ${targetX},${targetY}`;

    return React.createElement(React.Fragment, null,
      React.createElement('path', {
        d, fill: 'none',
        stroke: selected ? 'var(--primary)' : 'var(--border)',
        strokeWidth: selected ? 2 : 1.5,
        style: { transition: 'stroke .15s' },
      }),
      isHovered && scissorVisible && React.createElement('foreignObject', {
        x: sx - 16, y: sy - 16, width: 32, height: 32, style: { overflow: 'visible', pointerEvents: 'all' },
      },
        React.createElement('div', {
          style: { width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '50%',
            cursor: 'pointer', color: 'var(--danger)', boxShadow: 'var(--shadow)' },
          onClick: e => { e.stopPropagation(); window.Cv.useCanvasStore.getState().deleteEdgeById(id); },
          title: '删除连接',
        }, Icon('Scissors', 13)),
      ),
    );
  }

  /* ── GroupNode ─────────────────────────────────────────────────────────── */
  function GroupNode({ id, data, selected }) {
    const updateData = d => useCanvasStore.getState().updateNodeData(id, d);
    const [editing, setEditing] = React.useState(false);
    const [label, setLabel] = React.useState(data.label || '分组');

    return React.createElement('div', { className: 'cv-group-node', style: { width: '100%', height: '100%' } },
      React.createElement(NodeResizer, { isVisible: selected, minWidth: 200, minHeight: 100, color: 'var(--primary)' }),
      React.createElement('div', { className: 'cv-group-header' },
        editing
          ? React.createElement('input', {
              className: 'cv-input', value: label,
              onChange: e => setLabel(e.target.value),
              onBlur: () => { setEditing(false); updateData({ label }); },
              onKeyDown: e => { if (e.key === 'Enter') { setEditing(false); updateData({ label }); } e.stopPropagation(); },
              autoFocus: true, style: { background: 'transparent', border: 'none', padding: 0, fontSize: 11, fontWeight: 600, color: 'var(--subtle)' },
            })
          : React.createElement('span', { onDoubleClick: () => setEditing(true), style: { cursor: 'text' } }, label || '分组'),
      ),
    );
  }

  /* ── CommentNode ───────────────────────────────────────────────────────── */
  function CommentNode({ id, data, selected }) {
    const updateData = d => useCanvasStore.getState().updateNodeData(id, d);
    const [text, setText] = React.useState(data.content || '');
    const commitText = () => updateData({ content: text });

    return React.createElement('div', { className: 'cv-comment-node' + (selected ? ' selected' : '') },
      React.createElement('div', {
        className: 'cv-comment-text',
        contentEditable: true,
        suppressContentEditableWarning: true,
        onBlur: e => { const t = e.target.innerText; updateData({ content: t }); },
        onKeyDown: e => e.stopPropagation(),
        style: { outline: 'none', minHeight: 24 },
      }, data.content || React.createElement('span', { style: { opacity: .4 } }, '点击添加评论…')),
    );
  }

  /* ── NodeHandle (with proximity + + button) ─────────────────────────── */
  function NodeHandle({ type, position, handleId, selected, nodeId }) {
    const isLeft = position === Position.Left;
    const [hovering, setHovering] = React.useState(false);
    const [offset, setOffset] = React.useState({ x: 0, y: 0 });
    const hitRef = React.useRef(null);
    const isNear = useHandleProximityStore(s => s.nearNodeId === nodeId);
    const showIcon = hovering || selected || isNear;

    const handleMouseMove = e => {
      const el = hitRef.current; if (!el) return;
      const rect = el.getBoundingClientRect();
      setOffset({ x: e.clientX - (rect.left + rect.width/2), y: e.clientY - (rect.top + rect.height/2) });
    };
    const handleMouseUp = e => {
      const dist = Math.hypot(e.movementX, e.movementY);
      if (dist > 5) return;
      window.dispatchEvent(new CustomEvent('cv:handle-plus-click', { detail: { nodeId, screenX: e.clientX, screenY: e.clientY } }));
    };

    return React.createElement(Handle, {
      type, position, id: handleId,
      style: { width: 0, height: 0, background: 'transparent', border: 'none', top: '50%' },
    },
      React.createElement('div', {
        ref: hitRef,
        style: {
          position: 'absolute', top: '50%', transform: 'translateY(-50%)',
          width: 40, height: 60, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          [isLeft ? 'right' : 'left']: 0,
          pointerEvents: isNear ? 'auto' : undefined,
        },
        onMouseEnter: e => { setHovering(true); handleMouseMove(e); },
        onMouseMove: handleMouseMove,
        onMouseLeave: () => { setHovering(false); setOffset({ x: 0, y: 0 }); },
        onMouseUp: handleMouseUp,
      },
        React.createElement('div', {
          style: {
            transform: hovering ? `translate(${offset.x * 0.4}px,${offset.y * 0.4}px)` : 'translate(0,0)',
            opacity: showIcon ? 1 : 0,
            transition: hovering ? 'none' : 'opacity .15s, transform .2s',
            pointerEvents: 'none',
          },
        },
          React.createElement('div', {
            style: {
              width: 22, height: 22, borderRadius: '50%', border: '2px solid var(--subtle)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--subtle)',
            },
          }, Icon('Plus', 12)),
        ),
      ),
    );
  }

  /* ── Image multi-result display ─────────────────────────────────────── */
  function ImageResultDisplay({ images, onOpenDetail, onDownload, onSaveToLib, compact }) {
    const [activeIdx, setActiveIdx] = React.useState(0);
    if (!images || !images.length) return null;
    const current = images[activeIdx];
    const src = current.dataUrl || current.url;

    return React.createElement('div', { style: { position: 'relative', width: '100%', height: '100%' } },
      React.createElement('img', {
        src, alt: '',
        style: { width: '100%', height: '100%', objectFit: 'contain', display: 'block', cursor: 'pointer' },
        onClick: () => onOpenDetail && onOpenDetail(current, activeIdx),
      }),
      images.length > 1 && React.createElement('div', {
        style: { position: 'absolute', bottom: 6, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 4 },
      },
        images.map((_, i) =>
          React.createElement('div', {
            key: i, onClick: () => setActiveIdx(i),
            style: {
              width: i === activeIdx ? 16 : 6, height: 6, borderRadius: 3,
              background: i === activeIdx ? 'var(--primary)' : 'rgba(255,255,255,.4)',
              cursor: 'pointer', transition: 'width .2s',
            },
          }),
        ),
      ),
      !compact && React.createElement('div', {
        style: { position: 'absolute', top: 6, right: 6, display: 'flex', gap: 4 },
      },
        React.createElement('button', {
          className: 'cv-btn icon sm', title: '下载',
          onClick: e => { e.stopPropagation(); onDownload && onDownload(current); },
        }, Icon('Download', 12)),
        React.createElement('button', {
          className: 'cv-btn icon sm', title: '存入素材库',
          onClick: e => { e.stopPropagation(); onSaveToLib && onSaveToLib(current); },
        }, Icon('FolderPlus', 12)),
      ),
    );
  }

  /* ── Generation prompt editor (inline, inside active node) ──────────── */
  function PromptEditor({ nodeId, data, connectedRefs, onGenerate, onGenVideo, isGenerating, config, onConfigOpen }) {
    const [prompt, setPrompt] = React.useState(data.prompt || '');
    const [model, setModel] = React.useState(data.model_id || config.imageModel || '');
    const [quality, setQuality] = React.useState(data.quality || config.quality || 'auto');
    const [size, setSize] = React.useState(data.size || config.size || '1:1');
    const [count, setCount] = React.useState(data.count || config.count || '1');
    const [negPrompt, setNegPrompt] = React.useState(data.negative_prompt || '');
    const [showNeg, setShowNeg] = React.useState(false);
    const models = config.models || [];
    const refs = connectedRefs || {};
    const hasRefs = (refs.images && refs.images.length > 0) || (refs.videos && refs.videos.length > 0);

    React.useEffect(() => {
      useCanvasStore.getState().updateNodeData(nodeId, { prompt, model_id: model, quality, size, count, negative_prompt: negPrompt });
    }, [prompt, model, quality, size, count, negPrompt]);

    const handleGenerate = () => {
      if (!config.baseUrl || !config.apiKey) { onConfigOpen && onConfigOpen(); return; }
      onGenerate && onGenerate({ prompt, model, quality, size, count, negativePrompt: negPrompt });
    };

    const SIZES = ['1:1','16:9','9:16','4:3','3:4','3:2','2:3'];
    const QUALITIES = ['auto','standard','hd','low'];
    const COUNTS = ['1','2','3','4'];

    return React.createElement('div', { className: 'cv-prompt-editor-inner' },
      React.createElement('div', { className: 'cv-prompt-model-row' },
        models.length > 0
          ? React.createElement(CvSelect, { value: model, onChange: setModel, style: { flex: 1, minWidth: 0 } },
              React.createElement('option', { value: '' }, '选择模型…'),
              models.map(m => React.createElement('option', { key: m, value: m }, m)),
            )
          : React.createElement(CvInput, { value: model, onChange: setModel, placeholder: '模型名称', style: { flex: 1 } }),
        React.createElement(CvSelect, { value: size, onChange: setSize },
          SIZES.map(s => React.createElement('option', { key: s, value: s }, s)),
        ),
        React.createElement(CvSelect, { value: count, onChange: setCount },
          COUNTS.map(c => React.createElement('option', { key: c, value: c }, c + '张')),
        ),
        React.createElement(CvSelect, { value: quality, onChange: setQuality },
          QUALITIES.map(q => React.createElement('option', { key: q, value: q }, q)),
        ),
      ),
      React.createElement('div', { className: 'cv-prompt-textarea-wrap' },
        React.createElement(CvTextarea, {
          value: prompt, onChange: setPrompt, rows: 4,
          placeholder: hasRefs ? '图生图提示词（留空使用参考图）' : '描述要生成的内容…',
        }),
      ),
      hasRefs && React.createElement('div', { className: 'cv-prompt-refs' },
        React.createElement('span', { style: { fontSize: 10, color: 'var(--subtle)', alignSelf: 'center' } }, '参考:'),
        (refs.images || []).slice(0, 6).map((url, i) =>
          React.createElement('img', { key: i, src: url, className: 'cv-ref-thumb', title: '参考图 ' + (i+1) }),
        ),
        (refs.videos || []).slice(0, 2).map((url, i) =>
          React.createElement('div', { key: 'v'+i, className: 'cv-ref-thumb', style: { background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
            Icon('Film', 16, 'var(--subtle)'),
          ),
        ),
      ),
      React.createElement('div', { style: { padding: '0 10px 6px', display: 'flex', alignItems: 'center', gap: 6 } },
        React.createElement('button', {
          className: 'cv-btn ghost sm', style: { fontSize: 10 },
          onClick: () => setShowNeg(!showNeg),
        }, (showNeg ? '▲ ' : '▼ ') + '反向提示词'),
      ),
      showNeg && React.createElement('div', { style: { padding: '0 10px 8px' } },
        React.createElement(CvTextarea, {
          value: negPrompt, onChange: setNegPrompt, rows: 2,
          placeholder: '不想出现的内容…',
        }),
      ),
      React.createElement('div', { className: 'cv-prompt-actions' },
        React.createElement('span', { style: { flex: 1, fontSize: 10, color: 'var(--subtle)' } },
          (!config.baseUrl || !config.apiKey) ? '⚠ 请先配置 API' : (model || '未选模型'),
        ),
        onGenVideo && React.createElement(CvBtn, {
          className: 'sm', onClick: () => onGenVideo({ prompt, model, quality, size, count }),
          disabled: isGenerating,
        }, Icon('Video', 12), '生视频'),
        React.createElement(CvBtn, {
          className: 'primary sm', onClick: handleGenerate, disabled: isGenerating,
        }, isGenerating ? React.createElement(Spinner, { size: 14 }) : Icon('Sparkles', 12), isGenerating ? '生成中…' : '生成'),
      ),
    );
  }

  /* ── Generation overlay ─────────────────────────────────────────────── */
  function GenOverlay({ nodeId, label }) {
    const job = useGenerationStore(s => s.jobs[nodeId]);
    if (!job || job.status !== 'running') return null;
    return React.createElement('div', { className: 'cv-gen-overlay' },
      React.createElement(Spinner),
      React.createElement('div', { className: 'cv-gen-label' }, label || '生成中…'),
      React.createElement('div', {
        className: 'cv-gen-cancel',
        onClick: () => useGenerationStore.getState().cancelJob(nodeId),
      }, '取消'),
    );
  }

  /* ─────────────────────────────────────────────────────────────────────
     NODE TYPE PLUGINS
     Each exports: { idleView, activeView, hasInput, hasOutput }
  ───────────────────────────────────────────────────────────────────── */

  /* ── SOURCE IMAGE ─────────────────────────────────────────────────── */
  function SourceImageIdle({ id, data, selected }) {
    const [dragOver, setDragOver] = React.useState(false);
    const store = useCanvasStore.getState;
    const hasSrc = !!(data.imageUrl || data.dataUrl);
    const src = data.dataUrl || data.imageUrl;

    const handleFile = file => {
      if (!file || !file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = e => store().updateNodeData(id, { dataUrl: e.target.result, label: file.name });
      reader.readAsDataURL(file);
    };
    const handleDrop = e => {
      e.preventDefault(); setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    };
    const handleClick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = e => handleFile(e.target.files[0]);
      inp.click();
    };

    return React.createElement('div', {
      className: 'cv-img-content' + (dragOver ? ' dragover' : ''),
      style: { background: dragOver ? 'var(--primary-soft)' : undefined },
      onDragOver: e => { e.preventDefault(); setDragOver(true); },
      onDragLeave: () => setDragOver(false),
      onDrop: handleDrop,
    },
      hasSrc
        ? React.createElement('img', { src, alt: data.label || '', style: { width: '100%', height: '100%', objectFit: 'contain' } })
        : React.createElement('div', { className: 'cv-img-placeholder', onClick: handleClick },
            Icon('ImagePlus', 40),
            React.createElement('div', { className: 'cv-img-upload-hint' }, '点击或拖入图片'),
          ),
    );
  }

  function SourceImageActive({ id, data, updaters, connectedRefs }) {
    const src = data.dataUrl || data.imageUrl;
    const store = useCanvasStore.getState;
    const openDetail = () => usePanelStore.getState().openDetailView({ imageUrl: src, nodeId: id, data });

    const handlePaste = e => {
      const item = Array.from(e.clipboardData.items).find(i => i.type.startsWith('image/'));
      if (!item) return;
      const reader = new FileReader();
      reader.onload = ev => store().updateNodeData(id, { dataUrl: ev.target.result });
      reader.readAsDataURL(item.getAsFile());
    };

    return React.createElement('div', { style: { position: 'absolute', bottom: 0, left: 0, right: 0 } },
      React.createElement('div', { className: 'cv-sel-toolbar' },
        src && React.createElement(React.Fragment, null,
          React.createElement('button', { className: 'cv-sel-btn', onClick: openDetail, title: '全屏预览' }, Icon('Expand', 13)),
          React.createElement('div', { className: 'cv-sel-sep' }),
          React.createElement('button', { className: 'cv-sel-btn', onClick: () => downloadFile(src, 'source-image.png'), title: '下载' }, Icon('Download', 13)),
          React.createElement('button', { className: 'cv-sel-btn', onClick: () => window.Cv.api.saveImageToLibrary(src, { label: data.label }), title: '存入素材库' }, Icon('FolderPlus', 13)),
          React.createElement('div', { className: 'cv-sel-sep' }),
        ),
        React.createElement('button', { className: 'cv-sel-btn danger', onClick: () => store().deleteNodeById(id), title: '删除节点' }, Icon('Trash2', 13)),
      ),
    );
  }

  /* ── SOURCE AUDIO ──────────────────────────────────────────────────── */
  function SourceAudioIdle({ id, data }) {
    const hasSrc = !!(data.audioUrl);
    const handleClick = () => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'audio/*';
      inp.onchange = e => {
        const file = e.target.files[0]; if (!file) return;
        const url = URL.createObjectURL(file);
        useCanvasStore.getState().updateNodeData(id, { audioUrl: url, label: file.name });
      };
      inp.click();
    };

    return React.createElement('div', { className: 'cv-img-content', style: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 } },
      hasSrc
        ? React.createElement(React.Fragment, null,
            React.createElement('audio', { src: data.audioUrl, controls: true, style: { width: '100%' } }),
            React.createElement('div', { style: { fontSize: 10, color: 'var(--subtle)', textAlign: 'center' } }, data.label || '音频'),
          )
        : React.createElement('div', { className: 'cv-img-placeholder', onClick: handleClick },
            Icon('Music', 32),
            React.createElement('div', { className: 'cv-img-upload-hint' }, '点击或拖入音频'),
          ),
    );
  }

  /* ── TEXT NODE ─────────────────────────────────────────────────────── */
  function TextIdle({ id, data, selected, soloSelected, updaters }) {
    const textContent = String(data.content || '');
    const [editingContent, setEditingContent] = React.useState(false);

    React.useEffect(() => { if (!soloSelected) setEditingContent(false); }, [soloSelected]);

    return React.createElement('div', {
      className: 'flex-1 overflow-y-auto',
      onClick: () => { if (soloSelected && !editingContent) setEditingContent(true); },
    },
      soloSelected && editingContent
        ? React.createElement('div', {
            className: 'p-3 px-4',
            contentEditable: true,
            suppressContentEditableWarning: true,
            onBlur: e => { updaters.updateData({ content: e.currentTarget.innerHTML }); },
            onKeyDown: e => e.stopPropagation(),
            onPointerDownCapture: e => e.stopPropagation(),
            dangerouslySetInnerHTML: { __html: textContent },
            style: { outline: 'none', minHeight: 80, color: '#e4e4e7', fontSize: 14, lineHeight: 1.6 },
          })
        : React.createElement('div', { className: 'flex flex-col w-full h-full min-h-0 relative p-3 px-4 cursor-default' },
            textContent
              ? React.createElement('div', { className: 'xinyu-text-preview', dangerouslySetInnerHTML: { __html: textContent } })
              : React.createElement('p', { className: 'text-zinc-500 text-sm' }, '开始创作…'),
          ),
    );
  }

  function TextActive({ id, data, updaters }) {
    return null;
  }

  /* ── PROMPT NODE ───────────────────────────────────────────────────── */
  function PromptIdle({ id, data, selected }) {
    return React.createElement('div', {
      className: 'cv-text-body',
      contentEditable: selected,
      suppressContentEditableWarning: true,
      onBlur: e => useCanvasStore.getState().updateNodeData(id, { content: e.target.innerText }),
      onKeyDown: e => e.stopPropagation(),
      style: { minHeight: 60, fontFamily: 'monospace', fontSize: 12 },
    }, data.content || React.createElement('span', { className: 'cv-text-placeholder' }, '输入提示词模板…'));
  }

  /* ── NOTE NODE ─────────────────────────────────────────────────────── */
  function NoteIdle({ id, data, selected }) {
    return React.createElement('div', {
      className: 'cv-note-body',
      contentEditable: selected,
      suppressContentEditableWarning: true,
      onBlur: e => useCanvasStore.getState().updateNodeData(id, { content: e.target.innerText }),
      onKeyDown: e => e.stopPropagation(),
    }, data.content || React.createElement('span', { style: { opacity: .4 } }, '便签…'));
  }

  /* ── IMAGE GEN NODE ────────────────────────────────────────────────── */
  function ImageGenIdle({ id, data, selected, soloSelected, isZoomedOut }) {
    const images = data.images || (data.imageUrl ? [{ dataUrl: data.dataUrl, url: data.imageUrl }] : []);
    const job = useGenerationStore(s => s.jobs[id]);
    const isGenerating = job?.status === 'running';

    return React.createElement('div', { style: { width: '100%', height: '100%', position: 'relative' } },
      images.length > 0
        ? React.createElement(ImageResultDisplay, {
            images, compact: isZoomedOut,
            onOpenDetail: img => usePanelStore.getState().openDetailView({ imageUrl: img.dataUrl || img.url, nodeId: id, data }),
            onDownload: img => downloadFile(img.dataUrl || img.url, 'gen-' + Date.now() + '.png'),
            onSaveToLib: img => {
              const src = img.dataUrl || img.url;
              if (src) window.Cv.api.saveImageToLibrary(src, { prompt: data.prompt, model: data.model_id });
            },
          })
        : React.createElement('div', { className: 'cv-img-placeholder', style: { cursor: 'default' } },
            Icon('Sparkles', 32),
            React.createElement('div', { className: 'cv-img-upload-hint' }, isGenerating ? '生成中…' : '生成图像节点'),
          ),
      isGenerating && React.createElement(GenOverlay, { nodeId: id }),
    );
  }

  function ImageGenActive({ id, data, updaters, connectedRefs }) {
    const config = useCanvasConfigStore(s => s.config);
    const job = useGenerationStore(s => s.jobs[id]);
    const isGenerating = job?.status === 'running';
    const toast = useToastStore.getState;
    const images = data.images || (data.imageUrl ? [{ url: data.imageUrl, dataUrl: data.dataUrl }] : []);

    const handleGenerate = async (opts) => {
      if (!config.baseUrl || !config.apiKey) {
        useCanvasConfigStore.getState().openConfig(); return;
      }
      const ctrl = new AbortController();
      useGenerationStore.getState().startJob(id, ctrl);
      try {
        const refs = connectedRefs || {};
        let results;
        if (refs.images && refs.images.length > 0) {
          const refObjs = refs.images.map(url => ({ url }));
          results = await window.Cv.api.editImage(config, opts.prompt, refObjs, { ...opts, signal: ctrl.signal });
        } else {
          results = await window.Cv.api.generateImage(config, opts.prompt, { ...opts, signal: ctrl.signal });
        }
        const newImages = [...(data.images || []), ...results].slice(-16);
        useCanvasStore.getState().updateNodeData(id, {
          images: newImages,
          imageUrl: results[0].url, dataUrl: results[0].dataUrl,
          prompt: opts.prompt, model_id: opts.model,
          quality: opts.quality, size: opts.size, generatedAt: new Date().toISOString(),
        });
        useHistoryStore.getState().add({ type: 'image', prompt: opts.prompt, model: opts.model, images: results });
        useGenerationStore.getState().finishJob(id);
        toast().show('图片生成完成', 'success');
      } catch(err) {
        if (err.message !== '已取消') {
          useGenerationStore.getState().failJob(id, err.message);
          toast().show('生成失败: ' + err.message, 'error');
          setTimeout(() => useGenerationStore.getState().finishJob(id), 3000);
        }
      }
    };

    return React.createElement('div', { style: { position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', borderRadius: '0 0 12px 12px' } },
      React.createElement('div', { className: 'cv-sel-toolbar', style: { position: 'static', transform: 'none', left: 'auto', padding: '4px 8px' } },
        images.length > 0 && React.createElement(React.Fragment, null,
          React.createElement('button', { className: 'cv-sel-btn', onClick: () => usePanelStore.getState().openDetailView({ imageUrl: images[0].dataUrl || images[0].url, nodeId: id, data }), title: '全屏预览' }, Icon('Expand', 13)),
          React.createElement('button', { className: 'cv-sel-btn', onClick: () => downloadFile(images[0].dataUrl || images[0].url, 'gen-image.png'), title: '下载' }, Icon('Download', 13)),
          React.createElement('button', { className: 'cv-sel-btn', title: '存入素材库',
            onClick: () => {
              const src = images[0].dataUrl || images[0].url;
              if (src) window.Cv.api.saveImageToLibrary(src, { prompt: data.prompt, model: data.model_id });
            },
          }, Icon('FolderPlus', 13)),
          React.createElement('button', { className: 'cv-sel-btn', title: '局部重绘',
            onClick: () => window.dispatchEvent(new CustomEvent('cv:open-modal', { detail: { modal: 'inpaint', nodeId: id, data } })),
          }, Icon('PenLine', 13)),
          React.createElement('button', { className: 'cv-sel-btn', title: '扩展画面',
            onClick: () => window.dispatchEvent(new CustomEvent('cv:open-modal', { detail: { modal: 'outpaint', nodeId: id, data } })),
          }, Icon('Expand', 13)),
          React.createElement('button', { className: 'cv-sel-btn', title: '裁剪',
            onClick: () => window.dispatchEvent(new CustomEvent('cv:open-modal', { detail: { modal: 'crop', nodeId: id, data } })),
          }, Icon('Crop', 13)),
          React.createElement('button', { className: 'cv-sel-btn', title: '超分辨率',
            onClick: () => {
              const newId = useCanvasStore.getState().addNodeWithData('upscale', 0, 0, { sourceNodeId: id, imageUrl: images[0].dataUrl || images[0].url });
              useCanvasStore.getState().addEdgeById(id, newId);
            },
          }, Icon('ZoomIn', 13)),
          React.createElement('button', { className: 'cv-sel-btn', title: '去背景',
            onClick: () => {
              const newId = useCanvasStore.getState().addNodeWithData('rembg', 0, 0, { sourceNodeId: id, imageUrl: images[0].dataUrl || images[0].url });
              useCanvasStore.getState().addEdgeById(id, newId);
            },
          }, Icon('Scissors', 13)),
          React.createElement('button', { className: 'cv-sel-btn', title: '打光控制',
            onClick: () => window.dispatchEvent(new CustomEvent('cv:open-modal', { detail: { modal: 'lighting', nodeId: id, data } })),
          }, Icon('Sun', 13)),
          React.createElement('button', { className: 'cv-sel-btn', title: '多角度',
            onClick: () => window.dispatchEvent(new CustomEvent('cv:open-modal', { detail: { modal: 'multi-angle', nodeId: id, data } })),
          }, Icon('Orbit', 13)),
          React.createElement('button', { className: 'cv-sel-btn', title: '九宫格',
            onClick: () => window.dispatchEvent(new CustomEvent('cv:open-modal', { detail: { modal: 'grid-split', nodeId: id, data } })),
          }, Icon('Grid2x2', 13)),
          React.createElement('div', { className: 'cv-sel-sep' }),
          React.createElement('button', { className: 'cv-sel-btn', title: '查看信息',
            onClick: () => window.dispatchEvent(new CustomEvent('cv:open-modal', { detail: { modal: 'info', nodeId: id, data } })),
          }, Icon('Info', 13)),
          React.createElement('div', { className: 'cv-sel-sep' }),
        ),
        React.createElement('button', { className: 'cv-sel-btn', onClick: () => useCanvasStore.getState().duplicateSelected(), title: '复制节点' }, Icon('CopyPlus', 13)),
        React.createElement('button', { className: 'cv-sel-btn danger', onClick: () => useCanvasStore.getState().deleteNodeById(id) }, Icon('Trash2', 13)),
      ),
      React.createElement(PromptEditor, { nodeId: id, data, connectedRefs, onGenerate: handleGenerate, isGenerating, config,
        onConfigOpen: () => useCanvasConfigStore.getState().openConfig(),
      }),
    );
  }

  /* ── VIDEO GEN NODE ────────────────────────────────────────────────── */
  function VideoGenIdle({ id, data, isZoomedOut }) {
    const job = useGenerationStore(s => s.jobs[id]);
    const isGenerating = job?.status === 'running';
    const videoUrl = data.videoUrl;

    return React.createElement('div', { style: { width: '100%', height: '100%', position: 'relative', background: '#000' } },
      videoUrl
        ? React.createElement('video', {
            src: videoUrl, controls: true, loop: true,
            style: { width: '100%', height: '100%', objectFit: 'contain' },
          })
        : React.createElement('div', { className: 'cv-img-placeholder', style: { cursor: 'default', background: 'transparent' } },
            Icon('Film', 40),
            React.createElement('div', { className: 'cv-img-upload-hint' }, isGenerating ? '视频生成中…' : '生成视频节点'),
          ),
      isGenerating && React.createElement(GenOverlay, { nodeId: id, label: '视频生成中，请稍候…' }),
    );
  }

  function VideoGenActive({ id, data, updaters, connectedRefs }) {
    const config = useCanvasConfigStore(s => s.config);
    const job = useGenerationStore(s => s.jobs[id]);
    const isGenerating = job?.status === 'running';
    const [duration, setDuration] = React.useState(data.duration || 5);
    const [aspect, setAspect] = React.useState(data.aspect_ratio || '16:9');

    const handleGenVideo = async (opts) => {
      if (!config.baseUrl || !config.apiKey) { useCanvasConfigStore.getState().openConfig(); return; }
      const ctrl = new AbortController();
      useGenerationStore.getState().startJob(id, ctrl);
      try {
        const refs = connectedRefs || {};
        const refImageUrl = refs.images?.[0];
        const results = await window.Cv.api.generateVideo(config, opts.prompt, {
          model: opts.model || config.videoModel,
          duration, aspect_ratio: aspect,
          referenceImageUrl: refImageUrl,
          signal: ctrl.signal,
        }, progress => useGenerationStore.getState().setProgress(id, progress));
        useCanvasStore.getState().updateNodeData(id, {
          videoUrl: results[0].url, prompt: opts.prompt,
          duration, aspect_ratio: aspect, generatedAt: new Date().toISOString(),
        });
        useHistoryStore.getState().add({ type: 'video', prompt: opts.prompt, videoUrl: results[0].url });
        useGenerationStore.getState().finishJob(id);
        useToastStore.getState().show('视频生成完成', 'success');
      } catch(err) {
        if (err.message !== '已取消') {
          useGenerationStore.getState().failJob(id, err.message);
          useToastStore.getState().show('视频生成失败: ' + err.message, 'error');
          setTimeout(() => useGenerationStore.getState().finishJob(id), 3000);
        }
      }
    };

    return React.createElement('div', { style: { position: 'absolute', left: 0, right: 0, bottom: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', borderRadius: '0 0 12px 12px' } },
      React.createElement('div', { className: 'cv-sel-toolbar', style: { position: 'static', transform: 'none', padding: '4px 8px' } },
        data.videoUrl && React.createElement(React.Fragment, null,
          React.createElement('button', { className: 'cv-sel-btn', onClick: () => downloadFile(data.videoUrl, 'gen-video.mp4'), title: '下载视频' }, Icon('Download', 13)),
          React.createElement('button', { className: 'cv-sel-btn', title: '帧截取',
            onClick: () => window.dispatchEvent(new CustomEvent('cv:open-modal', { detail: { modal: 'frame-capture', nodeId: id, data } })),
          }, Icon('Camera', 13)),
          React.createElement('button', { className: 'cv-sel-btn', title: '视频信息',
            onClick: () => window.dispatchEvent(new CustomEvent('cv:open-modal', { detail: { modal: 'info', nodeId: id, data } })),
          }, Icon('Info', 13)),
          React.createElement('div', { className: 'cv-sel-sep' }),
        ),
        React.createElement('button', { className: 'cv-sel-btn danger', onClick: () => useCanvasStore.getState().deleteNodeById(id) }, Icon('Trash2', 13)),
      ),
      React.createElement('div', { style: { padding: '8px 10px', display: 'flex', gap: 6, alignItems: 'center' } },
        React.createElement('span', { style: { fontSize: 10, color: 'var(--subtle)' } }, '时长'),
        React.createElement(CvSelect, { value: String(duration), onChange: v => setDuration(Number(v)) },
          [4,5,6,8,10].map(d => React.createElement('option', { key: d, value: d }, d + 's')),
        ),
        React.createElement('span', { style: { fontSize: 10, color: 'var(--subtle)' } }, '比例'),
        React.createElement(CvSelect, { value: aspect, onChange: setAspect },
          ['16:9','9:16','1:1','4:3','3:4','21:9'].map(r => React.createElement('option', { key: r, value: r }, r)),
        ),
      ),
      React.createElement(PromptEditor, { nodeId: id, data, connectedRefs, onGenerate: opts => handleGenVideo({ ...opts }), isGenerating, config,
        onConfigOpen: () => useCanvasConfigStore.getState().openConfig(),
      }),
    );
  }

  /* ── UPSCALE NODE ──────────────────────────────────────────────────── */
  function UpscaleIdle({ id, data }) {
    const job = useGenerationStore(s => s.jobs[id]);
    const isGenerating = job?.status === 'running';
    const src = data.outputUrl || data.imageUrl;

    return React.createElement('div', { style: { width: '100%', height: '100%', position: 'relative' } },
      src
        ? React.createElement('img', { src, alt: '', style: { width: '100%', height: '100%', objectFit: 'contain' } })
        : React.createElement('div', { className: 'cv-img-placeholder', style: { cursor: 'default' } },
            Icon('ZoomIn', 32),
            React.createElement('div', { className: 'cv-img-upload-hint' }, '超分辨率节点'),
          ),
      isGenerating && React.createElement(GenOverlay, { nodeId: id, label: '超分辨中…' }),
    );
  }

  function UpscaleActive({ id, data, updaters, connectedRefs }) {
    const config = useCanvasConfigStore(s => s.config);
    const job = useGenerationStore(s => s.jobs[id]);
    const isGenerating = job?.status === 'running';
    const [scale, setScale] = React.useState(data.scale || '2x');

    const handleUpscale = async () => {
      const srcUrl = data.imageUrl || (connectedRefs?.images?.[0]);
      if (!srcUrl) { useToastStore.getState().show('请先连接源图片节点', 'error'); return; }
      if (!config.baseUrl || !config.apiKey) { useCanvasConfigStore.getState().openConfig(); return; }
      const ctrl = new AbortController();
      useGenerationStore.getState().startJob(id, ctrl);
      try {
        const prompt = `Upscale this image by ${scale}. Enhance details and sharpness. Keep original content.`;
        const results = await window.Cv.api.editImage(config, prompt, [{ url: srcUrl }],
          { model: config.imageModel, signal: ctrl.signal });
        useCanvasStore.getState().updateNodeData(id, { outputUrl: results[0].dataUrl || results[0].url, scale });
        useGenerationStore.getState().finishJob(id);
        useToastStore.getState().show('超分辨率完成', 'success');
      } catch(err) {
        if (err.message !== '已取消') {
          useGenerationStore.getState().failJob(id, err.message);
          useToastStore.getState().show('超分失败: ' + err.message, 'error');
          setTimeout(() => useGenerationStore.getState().finishJob(id), 3000);
        }
      }
    };

    return React.createElement('div', { style: { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', borderRadius: '0 0 12px 12px', padding: 10 } },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        React.createElement('span', { style: { fontSize: 11, color: 'var(--subtle)', fontWeight: 600 } }, '放大倍数'),
        React.createElement(CvSelect, { value: scale, onChange: setScale },
          ['2x','4x'].map(s => React.createElement('option', { key: s, value: s }, s)),
        ),
        React.createElement('div', { style: { flex: 1 } }),
        React.createElement(CvBtn, { className: 'primary sm', onClick: handleUpscale, disabled: isGenerating },
          isGenerating ? React.createElement(Spinner, { size: 14 }) : Icon('ZoomIn', 12), isGenerating ? '处理中…' : '超分',
        ),
      ),
      data.outputUrl && React.createElement('div', { style: { marginTop: 8, display: 'flex', gap: 6 } },
        React.createElement(CvBtn, { className: 'sm', onClick: () => downloadFile(data.outputUrl, 'upscaled.png') }, Icon('Download', 12), '下载'),
        React.createElement(CvBtn, { className: 'sm', onClick: () => window.Cv.api.saveImageToLibrary(data.outputUrl) }, Icon('FolderPlus', 12), '存库'),
      ),
    );
  }

  /* ── VIDEO UPSCALE NODE ────────────────────────────────────────────── */
  function VideoUpscaleIdle({ id, data }) {
    const job = useGenerationStore(s => s.jobs[id]);
    const isGenerating = job?.status === 'running';
    return React.createElement('div', { style: { width: '100%', height: '100%', position: 'relative', background: '#000' } },
      data.outputUrl
        ? React.createElement('video', { src: data.outputUrl, controls: true, style: { width: '100%', height: '100%', objectFit: 'contain' } })
        : React.createElement('div', { className: 'cv-img-placeholder', style: { cursor: 'default', background: 'transparent' } },
            Icon('Expand', 32),
            React.createElement('div', { className: 'cv-img-upload-hint' }, '视频超分节点'),
          ),
      isGenerating && React.createElement(GenOverlay, { nodeId: id, label: '视频超分中…' }),
    );
  }

  function VideoUpscaleActive({ id, data, updaters, connectedRefs }) {
    const videoUrl = data.videoUrl || connectedRefs?.videos?.[0];
    return React.createElement('div', { style: { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', borderRadius: '0 0 12px 12px', padding: 10 } },
      React.createElement('div', { style: { fontSize: 12, color: 'var(--subtle)', textAlign: 'center', padding: '8px 0' } },
        videoUrl ? '已连接视频，点击处理' : '请连接视频节点',
      ),
      React.createElement('div', { style: { display: 'flex', justifyContent: 'center' } },
        React.createElement(CvBtn, { className: 'primary sm', onClick: () => useToastStore.getState().show('视频超分需配置专用API', 'info'), disabled: !videoUrl },
          Icon('Expand', 12), '视频超分',
        ),
      ),
    );
  }

  /* ── REMBG NODE ────────────────────────────────────────────────────── */
  function RembgIdle({ id, data }) {
    const job = useGenerationStore(s => s.jobs[id]);
    const isGenerating = job?.status === 'running';
    const src = data.outputUrl || data.imageUrl;
    return React.createElement('div', { style: { width: '100%', height: '100%', position: 'relative', background: 'repeating-conic-gradient(#888 0% 25%, #444 0% 50%) 0 0 / 16px 16px' } },
      src
        ? React.createElement('img', { src, alt: '', style: { width: '100%', height: '100%', objectFit: 'contain' } })
        : React.createElement('div', { className: 'cv-img-placeholder', style: { cursor: 'default', background: 'transparent' } },
            Icon('Scissors', 32),
            React.createElement('div', { className: 'cv-img-upload-hint' }, '去背景节点'),
          ),
      isGenerating && React.createElement(GenOverlay, { nodeId: id, label: '去背景中…' }),
    );
  }

  function RembgActive({ id, data, updaters, connectedRefs }) {
    const srcUrl = data.imageUrl || connectedRefs?.images?.[0];
    const isGenerating = useGenerationStore(s => !!s.jobs[id]);
    const handleRembg = async () => {
      if (!srcUrl) { useToastStore.getState().show('请连接源图片节点', 'error'); return; }
      const config = useCanvasConfigStore.getState().config;
      if (!config.baseUrl || !config.apiKey) { useCanvasConfigStore.getState().openConfig(); return; }
      const ctrl = new AbortController();
      useGenerationStore.getState().startJob(id, ctrl);
      try {
        const results = await window.Cv.api.editImage(config,
          'Remove the background from this image. Return the subject with a transparent background.',
          [{ url: srcUrl }], { model: config.imageModel, signal: ctrl.signal });
        useCanvasStore.getState().updateNodeData(id, { outputUrl: results[0].dataUrl || results[0].url });
        useGenerationStore.getState().finishJob(id);
        useToastStore.getState().show('去背景完成', 'success');
      } catch(err) {
        if (err.message !== '已取消') {
          useGenerationStore.getState().failJob(id, err.message);
          useToastStore.getState().show('去背景失败: ' + err.message, 'error');
          setTimeout(() => useGenerationStore.getState().finishJob(id), 3000);
        }
      }
    };
    return React.createElement('div', { style: { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', borderRadius: '0 0 12px 12px', padding: 10 } },
      React.createElement('div', { style: { display: 'flex', gap: 6 } },
        React.createElement(CvBtn, { className: 'primary sm', onClick: handleRembg, disabled: isGenerating || !srcUrl },
          isGenerating ? React.createElement(Spinner, { size: 14 }) : Icon('Scissors', 12), isGenerating ? '处理中…' : '去背景',
        ),
        data.outputUrl && React.createElement(React.Fragment, null,
          React.createElement(CvBtn, { className: 'sm', onClick: () => downloadFile(data.outputUrl, 'rembg.png') }, Icon('Download', 12), '下载'),
          React.createElement(CvBtn, { className: 'sm', onClick: () => window.Cv.api.saveImageToLibrary(data.outputUrl) }, Icon('FolderPlus', 12), '存库'),
        ),
      ),
    );
  }

  /* ── AUDIO GEN NODE ────────────────────────────────────────────────── */
  function AudioGenIdle({ id, data }) {
    const job = useGenerationStore(s => s.jobs[id]);
    const isGenerating = job?.status === 'running';
    return React.createElement('div', { style: { width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 12 } },
      data.audioUrl
        ? React.createElement(React.Fragment, null,
            Icon('Music', 24, 'var(--primary)'),
            React.createElement('audio', { src: data.audioUrl, controls: true, style: { width: '100%' } }),
          )
        : React.createElement('div', { className: 'cv-img-placeholder', style: { cursor: 'default' } },
            Icon('Music', 32),
            React.createElement('div', { className: 'cv-img-upload-hint' }, isGenerating ? '音频生成中…' : '生成音频节点'),
          ),
      isGenerating && React.createElement(GenOverlay, { nodeId: id, label: '音频生成中…' }),
    );
  }

  function AudioGenActive({ id, data, updaters, connectedRefs }) {
    const [text, setText] = React.useState(data.text || '');
    const [voice, setVoice] = React.useState(data.voice || 'alloy');
    const config = useCanvasConfigStore(s => s.config);
    const isGenerating = useGenerationStore(s => !!s.jobs[id]);
    const refTexts = connectedRefs?.textNodes?.map(n => n.content).join('\n') || '';
    const finalText = text || refTexts;

    const VOICES = ['alloy','echo','fable','onyx','nova','shimmer'];

    const handleGenAudio = async () => {
      if (!config.baseUrl || !config.apiKey) { useCanvasConfigStore.getState().openConfig(); return; }
      const ctrl = new AbortController();
      useGenerationStore.getState().startJob(id, ctrl);
      try {
        const res = await fetch(window.Cv.api.buildApiUrl(config.baseUrl, '/audio/speech'), {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + config.apiKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: config.textModel || 'tts-1', input: finalText, voice }),
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error('音频生成失败: ' + res.status);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        useCanvasStore.getState().updateNodeData(id, { audioUrl: url, text, voice });
        useGenerationStore.getState().finishJob(id);
        useToastStore.getState().show('音频生成完成', 'success');
      } catch(err) {
        if (err.message !== '已取消') {
          useGenerationStore.getState().failJob(id, err.message);
          useToastStore.getState().show(err.message, 'error');
          setTimeout(() => useGenerationStore.getState().finishJob(id), 3000);
        }
      }
    };

    return React.createElement('div', { style: { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', borderRadius: '0 0 12px 12px', padding: 10 } },
      React.createElement(CvTextarea, { value: text, onChange: setText, placeholder: refTexts || '输入要合成的文本…', rows: 3 }),
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 } },
        React.createElement('span', { style: { fontSize: 11, color: 'var(--subtle)', fontWeight: 600 } }, '声音'),
        React.createElement(CvSelect, { value: voice, onChange: setVoice },
          VOICES.map(v => React.createElement('option', { key: v, value: v }, v)),
        ),
        React.createElement('div', { style: { flex: 1 } }),
        React.createElement(CvBtn, { className: 'primary sm', onClick: handleGenAudio, disabled: isGenerating || !finalText },
          isGenerating ? React.createElement(Spinner, { size: 14 }) : Icon('Music', 12), isGenerating ? '合成中…' : '合成',
        ),
      ),
      data.audioUrl && React.createElement('div', { style: { display: 'flex', gap: 6, marginTop: 8 } },
        React.createElement(CvBtn, { className: 'sm', onClick: () => downloadFile(data.audioUrl, 'audio.mp3') }, Icon('Download', 12), '下载'),
      ),
    );
  }

  /* ── STORYBOARD NODE ───────────────────────────────────────────────── */
  function StoryboardIdle({ id, data }) {
    const shots = data.shots || [];
    return React.createElement('div', { style: { width: '100%', height: '100%', overflow: 'auto', padding: 8, display: 'flex', gap: 6, flexWrap: 'wrap' } },
      shots.length === 0
        ? React.createElement('div', { className: 'cv-img-placeholder', style: { width: '100%', cursor: 'default' } },
            Icon('Clapperboard', 32),
            React.createElement('div', { className: 'cv-img-upload-hint' }, '分镜板节点'),
          )
        : shots.map((shot, i) =>
            React.createElement('div', { key: i, style: { width: 80, flexShrink: 0 } },
              React.createElement('div', { style: { width: 80, height: 45, borderRadius: 6, overflow: 'hidden', background: 'var(--surface-2)', border: '1px solid var(--border)' } },
                shot.imageUrl && React.createElement('img', { src: shot.imageUrl, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } }),
              ),
              React.createElement('div', { style: { fontSize: 9, color: 'var(--subtle)', marginTop: 3, textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                shot.title || ('镜头 ' + (i+1)),
              ),
            ),
          ),
    );
  }

  function StoryboardActive({ id, data, updaters, connectedRefs }) {
    const shots = data.shots || [];
    const [newTitle, setNewTitle] = React.useState('');
    const addShot = () => {
      const refImg = connectedRefs?.images?.[0];
      const newShots = [...shots, { title: newTitle || ('镜头 ' + (shots.length + 1)), imageUrl: refImg, prompt: '' }];
      useCanvasStore.getState().updateNodeData(id, { shots: newShots });
      setNewTitle('');
    };
    const removeShot = idx => {
      const newShots = shots.filter((_, i) => i !== idx);
      useCanvasStore.getState().updateNodeData(id, { shots: newShots });
    };

    return React.createElement('div', { style: { position: 'absolute', bottom: 0, left: 0, right: 0, background: 'var(--surface)', borderTop: '1px solid var(--border)', borderRadius: '0 0 12px 12px', padding: 10, maxHeight: 200, overflow: 'auto' } },
      shots.map((shot, i) =>
        React.createElement('div', { key: i, className: 'cv-sb-row' },
          React.createElement('div', { className: 'cv-sb-thumb' },
            shot.imageUrl && React.createElement('img', { src: shot.imageUrl, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } }),
          ),
          React.createElement('div', { className: 'cv-sb-meta' },
            React.createElement('div', { className: 'cv-sb-title' }, shot.title),
            React.createElement('div', { className: 'cv-sb-prompt' }, shot.prompt || '（无提示词）'),
          ),
          React.createElement('button', { className: 'cv-node-action-btn', onClick: () => removeShot(i) }, Icon('Trash2', 12)),
        ),
      ),
      React.createElement('div', { style: { display: 'flex', gap: 6, marginTop: 6 } },
        React.createElement(CvInput, { value: newTitle, onChange: setNewTitle, placeholder: '镜头名称…', style: { flex: 1 } }),
        React.createElement(CvBtn, { className: 'primary sm', onClick: addShot }, Icon('Plus', 12), '添加'),
      ),
    );
  }

  /* ─────────────────────────────────────────────────────────────────────
     NodeShell — The main wrapper component for all content nodes
  ───────────────────────────────────────────────────────────────────── */
  const NODE_ICONS = {
    'text':          'AlignLeft',
    'prompt':        'FileText',
    'source-image':  'Image',
    'source-audio':  'Music',
    'image-gen':     'ImagePlus',
    'video-gen':     'Film',
    'note':          'StickyNote',
    'upscale':       'ZoomIn',
    'video-upscale': 'Expand',
    'rembg':         'Scissors',
    'audio-gen':     'Music',
    'storyboard':    'Clapperboard',
  };

  const NODE_LABELS = {
    'text':          '文本',
    'prompt':        '提示词',
    'source-image':  '源图片',
    'source-audio':  '源音频',
    'image-gen':     '生成图像',
    'video-gen':     '生成视频',
    'note':          '便签',
    'upscale':       '超分辨率',
    'video-upscale': '视频超分',
    'rembg':         '去背景',
    'audio-gen':     '生成音频',
    'storyboard':    '分镜板',
  };

  // Nodes that accept input connections
  const HAS_INPUT = new Set(['image-gen','video-gen','upscale','video-upscale','rembg','audio-gen','storyboard']);
  // Nodes that have output connections
  const HAS_OUTPUT = new Set(['source-image','source-audio','text','prompt','image-gen','video-gen','upscale','rembg','audio-gen','storyboard']);
  // Nodes that are resizable
  const IS_RESIZABLE = new Set(['text','prompt','note','source-image','source-audio','image-gen','video-gen','storyboard','group']);

  const IDLE_VIEWS = {
    'text':          TextIdle,
    'prompt':        PromptIdle,
    'source-image':  SourceImageIdle,
    'source-audio':  SourceAudioIdle,
    'image-gen':     ImageGenIdle,
    'video-gen':     VideoGenIdle,
    'note':          NoteIdle,
    'upscale':       UpscaleIdle,
    'video-upscale': VideoUpscaleIdle,
    'rembg':         RembgIdle,
    'audio-gen':     AudioGenIdle,
    'storyboard':    StoryboardIdle,
  };

  const ACTIVE_VIEWS = {
    'source-image':  SourceImageActive,
    'image-gen':     ImageGenActive,
    'video-gen':     VideoGenActive,
    'upscale':       UpscaleActive,
    'video-upscale': VideoUpscaleActive,
    'rembg':         RembgActive,
    'audio-gen':     AudioGenActive,
    'storyboard':    StoryboardActive,
    'text':          TextActive,
  };

  function resolveConnectedRefs(nodeId, state) {
    const edges = state._edgesByTarget.get(nodeId) || [];
    const images = [], videos = [], audios = [], textNodes = [], imageNodes = [], videoNodes = [], audioNodes = [];
    for (const e of edges) {
      const src = state._nodeMap.get(e.source);
      if (!src) continue;
      const d = src.data;
      if (d.audioUrl) {
        audios.push(d.audioUrl);
        audioNodes.push({ nodeId: src.id, url: d.audioUrl, label: d.label || '' });
      } else if (d.videoUrl) {
        videos.push(d.videoUrl);
        videoNodes.push({ nodeId: src.id, url: d.videoUrl, label: d.label || '' });
      } else if (d.dataUrl || d.imageUrl) {
        const url = d.dataUrl || d.imageUrl;
        images.push(url);
        imageNodes.push({ nodeId: src.id, url, thumbnailUrl: url, label: d.label || '' });
      } else if ((d.nodeType === 'text' || d.nodeType === 'prompt') && d.content) {
        textNodes.push({ id: src.id, label: d.label || '', content: d.content });
      }
    }
    return { images, videos, audios, textNodes, imageNodes, videoNodes, audioNodes };
  }

  function NodeShellComponent({ id, data, selected }) {
    const nodeType = data.nodeType || 'text';
    const connDragSource = useConnectionDragStore(s => s.sourceNodeType);
    const isIncompatibleTarget = connDragSource ? !isConnectionAllowed(connDragSource, nodeType) : false;
    const isDragging = useCanvasDragStore(s => s.isNodeDragging);
    const zoom = useStore(s => s.transform[2]);
    const isZoomedOut = zoom < 0.35;
    const shellRef = React.useRef(null);

    const selectedNodeCount = useCanvasStore(s => s.nodes.filter(n => n.selected).length);
    const soloSelected = selected && selectedNodeCount === 1;

    // Connected refs (only computed when solo-selected to save perf)
    const connectedRefs = React.useMemo(() => {
      if (!soloSelected || !HAS_INPUT.has(nodeType)) return {};
      return resolveConnectedRefs(id, useCanvasStore.getState());
    }, [soloSelected, useCanvasStore(s => s._mutationVersion), id, nodeType]);

    // Blur incompatible nodes during connection drag
    React.useEffect(() => {
      const rfNode = shellRef.current?.closest('.react-flow__node');
      if (!rfNode) return;
      rfNode.style.filter = isIncompatibleTarget ? 'blur(3px)' : '';
      rfNode.style.opacity = isIncompatibleTarget ? '0.3' : '';
      rfNode.style.pointerEvents = isIncompatibleTarget ? 'none' : '';
      rfNode.style.transition = 'filter .2s, opacity .2s';
    }, [isIncompatibleTarget]);

    // Note nodes get special coloring
    const isNote = nodeType === 'note';
    const isComment = nodeType === 'comment';

    if (isComment) return React.createElement(CommentNode, { id, data, selected });

    const IdleView = IDLE_VIEWS[nodeType];
    const ActiveView = ACTIVE_VIEWS[nodeType];
    const iconName = NODE_ICONS[nodeType] || 'Box';
    const label = data.label || NODE_LABELS[nodeType] || nodeType;
    const cfg = NODE_TYPE_CONFIGS[nodeType] || {};
    const minW = cfg.defaultW ? Math.round(cfg.defaultW * 0.5) : 140;
    const minH = cfg.defaultH ? Math.round(cfg.defaultH * 0.5) : 100;
    const hasInput = HAS_INPUT.has(nodeType);
    const hasOutput = HAS_OUTPUT.has(nodeType);
    const resizable = IS_RESIZABLE.has(nodeType);
    const job = useGenerationStore(s => s.jobs[id]);
    const isGenerating = job?.status === 'running';

    const updaters = React.useMemo(() => ({
      updateData: d => useCanvasStore.getState().updateNodeData(id, d),
      updateSize: (w, h) => useCanvasStore.getState().updateNodeSize(id, w, h),
      addNodeWithData: useCanvasStore.getState().addNodeWithData,
      addEdgeById: useCanvasStore.getState().addEdgeById,
      deleteEdgeById: useCanvasStore.getState().deleteEdgeById,
    }), [id]);

    return React.createElement('div', { ref: shellRef, style: { width: '100%', height: '100%', position: 'relative' } },
      // Floating title ABOVE card (matches source pattern)
      React.createElement('div', { className: 'cv-node-title' },
        Icon(iconName, 14),
        React.createElement('span', { className: 'cv-node-title-text' }, label),
      ),
      resizable && selected && React.createElement(NodeResizer, { isVisible: true, minWidth: minW, minHeight: minH, color: 'rgba(255,255,255,0.4)', handleStyle: { width: 8, height: 8, borderRadius: 2 } }),
      React.createElement('div', {
        className: 'flex-1 flex flex-col overflow-hidden',
        style: {
          width: '100%', height: '100%',
          borderRadius: 12,
          border: '1px solid',
          borderColor: isGenerating ? 'rgba(204,255,0,0.4)' : selected ? 'rgba(82,82,91,1)' : 'rgba(39,39,42,0.5)',
          background: isNote ? 'rgba(214,161,93,0.1)' : '#1c1c1c',
          overflow: 'hidden',
          contentVisibility: 'auto',
        },
      },
        IdleView && React.createElement(IdleView, { id, data, selected, soloSelected, isZoomedOut, zoom, updaters }),
        soloSelected && ActiveView && !isDragging && React.createElement(ActiveView, { id, data, updaters, connectedRefs }),
      ),
      hasInput && React.createElement(NodeHandle, { type: 'target', position: Position.Left, handleId: 'ref-in', selected: !!selected, nodeId: id }),
      hasOutput && React.createElement(NodeHandle, { type: 'source', position: Position.Right, handleId: 'out', selected: !!selected, nodeId: id }),
    );
  }

  const NodeShell = React.memo(NodeShellComponent);

  /* ── CssDotsBackground ─────────────────────────────────────────────── */
  function CssDotsBackground({ gap, size, color }) {
    return React.createElement('div', {
      style: {
        position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        backgroundImage: `radial-gradient(circle, ${color || 'var(--border)'} ${size || 1.2}px, transparent ${size || 1.2}px)`,
        backgroundSize: `${gap || 20}px ${gap || 20}px`,
      },
    });
  }

  /* ── Export ──────────────────────────────────────────────────────────── */
  window.Cv = window.Cv || {};
  Object.assign(window.Cv, {
    AnimatedEdge,
    GroupNode,
    CommentNode,
    NodeShell,
    CssDotsBackground,
    NodeHandle,
    PromptEditor,
    GenOverlay,
    ImageResultDisplay,
    // Shared UI primitives
    Spinner, TbBtn, CvBtn, CvSelect, CvInput, CvTextarea,
    downloadFile, copyToClipboard, Icon,
  });

})();
