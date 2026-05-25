/* canvas-tools.js — Faithful replica of xinyuai_canvasagent canvas UI components
   DockToolbar (left vertical pill), CanvasTopBar (absolute floating),
   ConnectionDropMenu, HandleMenu, ContextMenu (dark glass cmdk-style),
   ShortcutsHelp (SVG animations), SelectionToolbar, AlignmentGuides
*/
(function() {
  'use strict';

  const {
    useCanvasStore, useCanvasConfigStore, usePanelStore, useToastStore,
    useCommentModeStore, useSnapshotStore, NODE_TYPE_CONFIGS, isConnectionAllowed,
    useMultiDragStore,
  } = window.Cv;
  const { Icon } = window.Cv;
  const { useReactFlow, useStore: useRFStore, MiniMap } = window.ReactFlow;

  /* ── Shared React helpers ──────────────────────────────────────── */
  const { useState, useEffect, useCallback, useMemo, useRef, memo } = React;
  const h = React.createElement;
  const ACCENT = '#CCFF00';
  const isMac = /Mac/.test(navigator.userAgent);
  const MOD = isMac ? '⌘' : 'Ctrl';

  /* ── Inline SVG node type icons ───────────────────────────────── */
  function SvgTextIcon()  { return h('svg',{width:14,height:14,viewBox:'0 0 14 14',fill:'none'},h('path',{d:'M9.719 10.256a.583.583 0 010 1.166H2.041a.583.583 0 010-1.166h7.678zM7.8 6.417a.583.583 0 010 1.166H2.041a.583.583 0 010-1.166H7.8zM11.958 2.578a.583.583 0 010 1.167H2.041a.583.583 0 010-1.167h9.917z',fill:'currentColor'})); }
  function SvgPromptIcon(){ return h('svg',{width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:'2',strokeLinejoin:'round'},h('path',{d:'M5 5h14v10H9l-4 4V5Z'}),h('path',{d:'M9 9h6M9 12h4',strokeLinecap:'round'})); }
  function SvgImageIcon() { return h('svg',{width:18,height:18,viewBox:'0 0 48 48',fill:'none'},h('path',{fillRule:'evenodd',clipRule:'evenodd',d:'M31.8 3c1.927 0 3.493-.002 4.76.102 1.291.105 2.448.33 3.526.878a8 8 0 013.934 3.934c.549 1.078.773 2.235.878 3.525C45.002 12.707 45 14.273 45 16.2v15.6c0 1.927.002 3.493-.102 4.76-.105 1.291-.33 2.448-.878 3.526a8 8 0 01-3.934 3.934c-1.078.549-2.235.773-3.525.878-1.268.104-2.834.102-4.761.102H16.2c-1.927 0-3.493.002-4.76-.102-1.291-.105-2.448-.33-3.526-.878a8 8 0 01-3.934-3.934c-.549-1.078-.773-2.235-.878-3.525C2.998 35.293 3 33.727 3 31.8V16.2c0-1.927-.002-3.493.102-4.76.105-1.291.33-2.448.878-3.526a8 8 0 013.934-3.934C8.992 3.431 10.149 3.207 11.44 3.102 12.707 2.998 14.273 3 16.2 3h15.6zM31 13a4 4 0 110 8 4 4 0 010-8z',fill:'currentColor'})); }
  function SvgVideoIcon() { return h('svg',{width:18,height:18,viewBox:'0 0 48 48',fill:'none'},h('path',{fillRule:'evenodd',clipRule:'evenodd',d:'M31.8 3c1.927 0 3.493-.002 4.76.102 1.291.105 2.448.33 3.526.878a8 8 0 013.934 3.934c.549 1.078.773 2.235.878 3.525C45.002 12.707 45 14.273 45 16.2v15.6c0 1.927.002 3.493-.102 4.76-.105 1.291-.33 2.448-.878 3.526a8 8 0 01-3.934 3.934c-1.078.549-2.235.773-3.525.878-1.268.104-2.834.102-4.761.102H16.2c-1.927 0-3.493.002-4.76-.102-1.291-.105-2.448-.33-3.526-.878a8 8 0 01-3.934-3.934c-.549-1.078-.773-2.235-.878-3.525C2.998 35.293 3 33.727 3 31.8V16.2c0-1.927-.002-3.493.102-4.76.105-1.291.33-2.448.878-3.526a8 8 0 013.934-3.934C8.992 3.431 10.149 3.207 11.44 3.102 12.707 2.998 14.273 3 16.2 3h15.6zM18.576 19.58c0-1.633 1.922-2.637 3.42-1.785l7.769 4.42c1.433.816 1.433 2.753 0 3.569l-7.77 4.42c-1.497.852-3.419-.152-3.419-1.785V19.58z',fill:'currentColor'})); }
  function SvgUploadIcon(){ return h('svg',{xmlns:'http://www.w3.org/2000/svg',width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:'2',strokeLinecap:'round',strokeLinejoin:'round'},h('path',{d:'M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2'}),h('path',{d:'M7 9l5-5 5 5'}),h('path',{d:'M12 4v12'})); }
  function SvgAudioIcon() { return h('svg',{xmlns:'http://www.w3.org/2000/svg',width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:'2',strokeLinecap:'round',strokeLinejoin:'round'},h('path',{d:'M9 18V5l12-2v13'}),h('circle',{cx:6,cy:18,r:3}),h('circle',{cx:18,cy:16,r:3})); }
  function SvgNoteIcon()  { return h('svg',{xmlns:'http://www.w3.org/2000/svg',width:18,height:18,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:'2',strokeLinecap:'round',strokeLinejoin:'round'},h('path',{d:'M8 2v4'}),h('path',{d:'M16 2v4'}),h('rect',{width:18,height:18,x:3,y:4,rx:2}),h('path',{d:'M3 10h18'})); }
  function ClapperboardIcon({ size=18 }) { return h('svg',{xmlns:'http://www.w3.org/2000/svg',width:size,height:size,viewBox:'0 0 24 24',fill:'none',stroke:'currentColor',strokeWidth:'2',strokeLinecap:'round',strokeLinejoin:'round'},h('path',{d:'m12.296 3.464 3.02 3.956'}),h('path',{d:'M20.2 6 3 11l-.9-2.4c-.3-1.1.3-2.2 1.3-2.5l13.5-4c1.1-.3 2.2.3 2.5 1.3z'}),h('path',{d:'M3 11h18v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'}),h('path',{d:'m6.18 5.276 3.1 3.899'})); }
  function MaterialLibraryIcon({ size=20 }) { return h('svg',{width:size,height:size,viewBox:'0 0 20 20',fill:'none',style:{flexShrink:0}},h('path',{d:'M13.2094 8.05177C13.6634 8.05177 14.0988 8.23211 14.4198 8.55312C14.7408 8.87413 14.9211 9.30951 14.9211 9.76348V15.3265C14.9211 15.7805 14.7408 16.2159 14.4198 16.5369C14.0988 16.8579 13.6634 17.0382 13.2094 17.0382H3.79505C3.34108 17.0382 2.9057 16.8579 2.58469 16.5369C2.26368 16.2159 2.08334 15.7805 2.08334 15.3265V7.62385C2.08334 7.16987 2.26368 6.73449 2.58469 6.41349C2.9057 6.09248 3.34108 5.91214 3.79505 5.91214H6.36261C6.56191 5.91214 6.75847 5.95854 6.93673 6.04767C7.11499 6.1368 7.27005 6.26621 7.38963 6.42565L7.90315 7.53826C8.02273 7.6977 8.17779 7.82711 8.35605 7.91624C8.53431 8.00537 8.73087 8.05177 8.93017 8.05177H13.2094Z',stroke:'currentColor',strokeWidth:'1.5',strokeLinecap:'round',strokeLinejoin:'round'}),h('path',{d:'M17.4153 13.5414C17.7363 13.2204 17.9167 12.785 17.9167 12.331V6.768C17.9167 6.31403 17.7363 5.87865 17.4153 5.55764C17.0943 5.23663 16.6589 5.05629 16.2049 5.05629H11.9257C11.7264 5.05629 11.5298 5.00989 11.3516 4.92076C11.1733 4.83163 11.0182 4.70222 10.8987 4.54278L10.3851 3.43017C10.2656 3.27073 10.1105 3.14132 9.93224 3.05219C9.75398 2.96306 9.55742 2.91666 9.35812 2.91666H6.79056C6.33659 2.91666 5.90121 3.097 5.5802 3.418',stroke:'currentColor',strokeWidth:'1.5',strokeLinecap:'round',strokeLinejoin:'round'})); }

  /* ── DockTooltip ──────────────────────────────────────────────── */
  function DockTooltip({ label, children }) {
    const [show, setShow] = useState(false);
    return h('div', { style: { position: 'relative' }, onMouseEnter: () => setShow(true), onMouseLeave: () => setShow(false) },
      children,
      show && h('div', { style: { position: 'absolute', left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: 10, pointerEvents: 'none', zIndex: 100, whiteSpace: 'nowrap' } },
        h('span', { style: { borderRadius: 8, background: '#232323', border: '1px solid rgba(255,255,255,0.1)', padding: '6px 10px', fontSize: 12, color: '#e4e4e7', boxShadow: '0 4px 12px rgba(0,0,0,0.4)' } }, label),
      ),
    );
  }

  /* ── DockToolbar — left vertical pill ────────────────────────── */
  function DockToolbar({ onOpenAddMenu, onToggleAssets, assetsOpen, onToggleMaterials, materialsOpen, onToggleStoryboard, storyboardOpen, onToggleMarketing, marketingOpen }) {
    const addBtnRef = useRef(null);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const commentActive = useCommentModeStore(s => s.active);

    const handleAddClick = () => {
      if (!addBtnRef.current) return;
      const rect = addBtnRef.current.getBoundingClientRect();
      onOpenAddMenu && onOpenAddMenu(rect.right + 8, rect.top);
    };

    const pillStyle = { display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'center', borderRadius: 32, background: 'rgba(26,26,26,0.92)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', padding: 6 };
    const iconBtnStyle = (active) => ({ borderRadius: 8, width: '100%', aspectRatio: '1/1', minWidth: 36, minHeight: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', border: 'none', background: active ? 'rgba(255,255,255,0.1)' : 'transparent', color: active ? '#fff' : '#71717a', transition: 'background 0.15s,color 0.15s' });

    const HoverIconBtn = ({ label, onClick, active, children, accentActive }) => {
      const [hov, setHov] = useState(false);
      const base = active ? (accentActive ? { background: 'rgba(204,255,0,0.1)', color: ACCENT } : { background: 'rgba(255,255,255,0.1)', color: '#fff' }) : { background: 'transparent', color: '#71717a' };
      const hover = { background: 'rgba(255,255,255,0.1)', color: '#fff' };
      return h(DockTooltip, { label },
        h('button', { ref: label === '添加节点' ? addBtnRef : undefined, onClick, onMouseEnter: () => setHov(true), onMouseLeave: () => setHov(false), style: { ...iconBtnStyle(active), ...(hov ? hover : base) } }, children),
      );
    };

    return h(React.Fragment, null,
      h('div', { style: { position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', zIndex: 50 } },
        h('div', { style: pillStyle },
          // Add node
          h(DockTooltip, { label: '添加节点' },
            h('button', { ref: addBtnRef, onClick: handleAddClick, style: { width: 40, height: 40, borderRadius: '50%', background: '#fff', color: '#000', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.3)', flexShrink: 0 } },
              Icon('Plus', 20),
            ),
          ),
          // Tool icons
          h('div', { style: { width: '100%', display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 } },
            h(HoverIconBtn, { label: '素材库', onClick: onToggleMaterials, active: !!materialsOpen },
              h(MaterialLibraryIcon, { size: 20 }),
            ),
            h(HoverIconBtn, { label: '项目素材', onClick: onToggleAssets, active: !!assetsOpen },
              Icon('FolderOpen', 18),
            ),
            h(HoverIconBtn, { label: '评论模式', onClick: () => useCommentModeStore.getState().toggle(), active: commentActive },
              Icon('MessageCircle', 18),
            ),
            onToggleStoryboard && h(HoverIconBtn, { label: '故事板', onClick: onToggleStoryboard, active: !!storyboardOpen, accentActive: true },
              h(ClapperboardIcon, { size: 18 }),
            ),
            onToggleMarketing && h(HoverIconBtn, { label: '营销工作台', onClick: onToggleMarketing, active: !!marketingOpen, accentActive: true },
              Icon('Film', 18),
            ),
          ),
          // Separator
          h('div', { style: { width: '100%', padding: '4px 12px' } },
            h('span', { style: { height: 1, width: '100%', background: 'rgba(255,255,255,0.1)', display: 'block' } }),
          ),
          // Settings (avatar)
          h(DockTooltip, { label: '设置' },
            h('button', { onClick: () => setSettingsOpen(true), style: { borderRadius: '50%', border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' } },
              h('span', { style: { width: 36, height: 36, borderRadius: '50%', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: '#27272a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#a1a1aa', fontSize: 13, fontWeight: 600, flexShrink: 0 } }, 'PS'),
            ),
          ),
        ),
      ),
      h(CanvasSettingsModal, { open: settingsOpen, onClose: () => setSettingsOpen(false) }),
    );
  }

  /* ── CanvasTopBar — absolute top-left floating ────────────────── */
  function CanvasTopBar({ projectName = '未命名画布', saveStatus = 'saved', onRename }) {
    const [editName, setEditName] = useState(projectName);
    const inputRef = useRef(null);

    useEffect(() => { setEditName(projectName); }, [projectName]);

    const commitRename = () => {
      const trimmed = editName.trim();
      if (trimmed && trimmed !== projectName) onRename && onRename(trimmed);
      else setEditName(projectName);
    };

    const SaveChip = () => {
      if (saveStatus === 'saving') return h('span', { style: chipStyle('#3f3f46') }, Icon('Loader2', 14), ' 保存中…');
      if (saveStatus === 'error')  return h('span', { style: chipStyle('rgba(239,68,68,0.15)', '#f87171') }, Icon('CloudOff', 14), ' 保存失败');
      if (saveStatus === 'unsaved') return h('span', { style: chipStyle('#3f3f46', '#fbbf24') }, h('span', { style: { width: 6, height: 6, borderRadius: '50%', background: '#fbbf24', display: 'inline-block', marginRight: 4 } }), '未保存');
      return h('span', { style: chipStyle('#3f3f46', '#52525b') }, Icon('Check', 14), ' 已保存');
    };

    return h('div', { style: { position: 'absolute', top: 16, left: 16, zIndex: 30, display: 'flex', alignItems: 'center' } },
      // Logo / back
      h('button', { onClick: () => window.parent && window.parent.postMessage({ type: 'CANVAS_CLOSE' }, '*'), style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: 32, padding: '0 8px', borderRadius: 999, cursor: 'pointer', border: 'none', background: 'transparent', color: '#a1a1aa', transition: 'background 0.15s', marginRight: 4 }, title: '返回' },
        Icon('ArrowLeft', 14),
      ),
      // Project name
      h('input', { ref: inputRef, value: editName, onChange: e => setEditName(e.target.value), onBlur: commitRename, onKeyDown: e => { if (e.key === 'Enter') { commitRename(); inputRef.current?.blur(); } if (e.key === 'Escape') { setEditName(projectName); inputRef.current?.blur(); } }, style: { height: 36, borderRadius: 8, background: 'transparent', border: 'none', outline: 'none', padding: '0 12px', fontSize: 14, color: '#fff', width: 192, transition: 'width 0.2s' }, placeholder: '未命名画布' }),
      // Right side (fixed)
      h('div', { style: { position: 'fixed', top: 16, right: 16, zIndex: 30, display: 'flex', alignItems: 'center', gap: 8 } },
        h(SaveChip),
      ),
    );
  }

  function chipStyle(bg, color = '#71717a') {
    return { display: 'flex', alignItems: 'center', gap: 6, height: 40, padding: '0 12px', borderRadius: 12, background: bg, fontSize: 13, color, userSelect: 'none', backdropFilter: 'blur(8px)' };
  }

  /* ── Dark glass menu container ────────────────────────────────── */
  function GlassMenu({ x, y, children, onClose, width = 288 }) {
    const ref = useRef(null);
    const menuH = 400;
    const clampedX = Math.min(x, window.innerWidth - width - 10);
    const clampedY = Math.min(y, window.innerHeight - menuH - 10);

    useEffect(() => {
      const onPointer = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
      const onKey = e => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('pointerdown', onPointer);
      document.addEventListener('keydown', onKey);
      return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
    }, [onClose]);

    return h('div', { ref, style: { position: 'fixed', zIndex: 1000, top: clampedY, left: clampedX, minWidth: width, background: 'rgba(30,30,30,0.88)', border: '1px solid rgba(63,63,70,0.6)', backdropFilter: 'blur(20px)', borderRadius: 16, padding: 4, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', maxHeight: 500, overflowY: 'auto' } },
      children,
    );
  }

  /* ── Animated node menu item (cmdk-style) ─────────────────────── */
  function NodeMenuItem({ icon, label, desc, onSelect }) {
    const [hov, setHov] = useState(false);
    return h('button', {
      onClick: onSelect,
      onMouseEnter: () => setHov(true),
      onMouseLeave: () => setHov(false),
      style: { width: '100%', height: 52, display: 'flex', alignItems: 'center', gap: 8, padding: '0 8px', borderRadius: 12, border: 'none', cursor: 'pointer', background: hov ? 'rgba(63,63,70,0.5)' : 'transparent', color: '#d4d4d8', transition: 'background 0.15s', textAlign: 'left' },
    },
      h('div', { style: { height: 36, width: 36, flexShrink: 0, borderRadius: 8, background: 'rgba(39,39,42,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#e4e4e7' } }, icon),
      h('div', { style: { flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', overflow: 'hidden' } },
        h('span', { style: { fontWeight: 500, fontSize: 13, color: '#e4e4e7', transform: hov ? 'translateY(0)' : 'translateY(8px)', transition: 'transform 0.2s', display: 'block', whiteSpace: 'nowrap' } }, label),
        h('p', { style: { fontSize: 11, color: '#71717a', opacity: hov ? 1 : 0, transition: 'opacity 0.2s', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, desc),
      ),
    );
  }

  function MenuGroupHeading({ label }) {
    return h('div', { style: { fontSize: 12, padding: '6px 8px', color: '#71717a', fontWeight: 500 } }, label);
  }

  /* ── ConnectionDropMenu ───────────────────────────────────────── */
  function ConnectionDropMenu({ x, y, sourceNodeId, onSelect, onClose }) {
    const sourceNode = useCanvasStore(s => s._nodeMap.get(sourceNodeId));
    const sourceType = sourceNode?.data?.nodeType || '';

    const items = [
      { type: 'text',      label: '文字生成', desc: '使用 AI 生成或编辑文本',           icon: h(SvgTextIcon) },
      { type: 'prompt',    label: 'Prompt',   desc: '提示词节点，作为生成的输入',        icon: h(SvgPromptIcon) },
      { type: 'image-gen', label: '生图',      desc: '根据提示词生成图片',               icon: h(SvgImageIcon) },
      { type: 'video-gen', label: '生视频',    desc: '根据提示词或图片生成视频',          icon: h(SvgVideoIcon) },
    ].filter(item => sourceType ? isConnectionAllowed(sourceType, item.type) : true);

    return h(GlassMenu, { x, y, onClose, width: 288 },
      h(MenuGroupHeading, { label: '连接并生成' }),
      items.map(item => h(NodeMenuItem, { key: item.type, icon: item.icon, label: item.label, desc: item.desc, onSelect: () => { onSelect(item.type, sourceNodeId); onClose(); } })),
    );
  }

  /* ── HandleMenu ───────────────────────────────────────────────── */
  function HandleMenu({ x, y, onSelect, onClose }) {
    const sections = [
      { heading: '生成', items: [
        { type: 'text',      label: '文字',   desc: 'AI 文字生成/编辑',              icon: h(SvgTextIcon) },
        { type: 'image-gen', label: '图片',   desc: '根据提示词生成图片',             icon: h(SvgImageIcon) },
        { type: 'video-gen', label: '视频',   desc: '根据提示词或图片生成视频',       icon: h(SvgVideoIcon) },
        { type: 'audio-gen', label: '音频',   desc: 'AI 音乐/音效生成',              icon: h(SvgAudioIcon) },
      ]},
      { heading: '素材', items: [
        { type: 'source-image', label: '上传图片', desc: '上传本地图片或输入 URL',    icon: h(SvgUploadIcon) },
      ]},
      { heading: '工具', items: [
        { type: 'note',      label: '便签',   desc: '添加注释或说明',                 icon: h(SvgNoteIcon) },
      ]},
    ];
    return h(GlassMenu, { x, y, onClose, width: 288 },
      sections.map(s => h(React.Fragment, { key: s.heading },
        h(MenuGroupHeading, { label: s.heading }),
        s.items.map(item => h(NodeMenuItem, { key: item.type, icon: item.icon, label: item.label, desc: item.desc, onSelect: () => { onSelect(item.type); onClose(); } })),
      )),
    );
  }

  /* ── ContextMenu ─────────────────────────────────────────────── */
  function CtxItem({ label, shortcut, danger, onSelect }) {
    const [hov, setHov] = useState(false);
    return h('button', {
      onClick: onSelect,
      onMouseEnter: () => setHov(true),
      onMouseLeave: () => setHov(false),
      style: { width: '100%', display: 'flex', alignItems: 'center', justifyContent: shortcut ? 'space-between' : 'flex-start', gap: 8, padding: '10px 12px', borderRadius: 8, border: 'none', cursor: 'pointer', background: hov ? 'rgba(63,63,70,0.5)' : 'transparent', color: danger ? '#f87171' : '#d4d4d8', fontSize: 13, transition: 'background 0.12s', textAlign: 'left' },
    },
      h('span', null, label),
      shortcut && h('span', { style: { fontSize: 12, color: '#71717a', letterSpacing: 2 } }, shortcut),
    );
  }

  function CtxSep() { return h('div', { style: { height: 1, background: 'rgba(63,63,70,0.6)', margin: '4px -4px' } }); }

  function ContextMenu({ x, y, target, onClose, onDelete, onDeleteSelected, onDuplicate, onDuplicateSelected, onCopy, onPaste, onOpenAddNodeMenu, onUploadAsset, onSaveToMaterial, canSaveToMaterial }) {
    const menuW = 240, menuH = 300;
    const cx = Math.min(x, window.innerWidth - menuW - 10);
    const cy = Math.min(y, window.innerHeight - menuH - 10);
    const ref = useRef(null);

    useEffect(() => {
      const onPD = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
      const onKey = e => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('pointerdown', onPD);
      document.addEventListener('keydown', onKey);
      return () => { document.removeEventListener('pointerdown', onPD); document.removeEventListener('keydown', onKey); };
    }, [onClose]);

    return h('div', { ref, style: { position: 'fixed', zIndex: 100, left: cx, top: cy, background: 'rgba(30,30,30,0.88)', border: '1px solid rgba(63,63,70,0.6)', backdropFilter: 'blur(20px)', borderRadius: 16, padding: 4, width: menuW, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' } },
      target.type === 'canvas' && h(React.Fragment, null,
        h(CtxItem, { label: '上传素材', onSelect: () => { onClose(); onUploadAsset && onUploadAsset(); } }),
        h(CtxSep),
        h(CtxItem, { label: '添加节点', onSelect: () => { onClose(); onOpenAddNodeMenu && onOpenAddNodeMenu(); } }),
        h(CtxSep),
        h(CtxItem, { label: '撤销', shortcut: MOD + 'Z', onSelect: () => { useCanvasStore.getState().undo(); onClose(); } }),
        h(CtxItem, { label: '重做', shortcut: '⇧' + MOD + 'Z', onSelect: () => { useCanvasStore.getState().redo(); onClose(); } }),
        h(CtxSep),
        h(CtxItem, { label: '粘贴', shortcut: MOD + 'V', onSelect: () => { onPaste && onPaste(); onClose(); } }),
      ),
      target.type === 'node' && target.id && h(React.Fragment, null,
        canSaveToMaterial && h(React.Fragment, null, h(CtxItem, { label: '存入素材库', onSelect: () => { onSaveToMaterial && onSaveToMaterial(target.id); onClose(); } }), h(CtxSep)),
        h(CtxItem, { label: '复制', shortcut: MOD + 'C', onSelect: () => { onCopy && onCopy(); onClose(); } }),
        h(CtxItem, { label: '粘贴', shortcut: MOD + 'V', onSelect: () => { onPaste && onPaste(); onClose(); } }),
        h(CtxItem, { label: '复制节点', shortcut: '⇧' + MOD + 'V', onSelect: () => { onDuplicate && onDuplicate(target.id); onClose(); } }),
        h(CtxSep),
        h(CtxItem, { label: '删除', shortcut: '⌫', danger: true, onSelect: () => { onDelete && onDelete(target.id); onClose(); } }),
      ),
      target.type === 'node' && !target.id && h(React.Fragment, null,
        h(CtxItem, { label: '复制', shortcut: MOD + 'C', onSelect: () => { onCopy && onCopy(); onClose(); } }),
        h(CtxItem, { label: '粘贴', shortcut: MOD + 'V', onSelect: () => { onPaste && onPaste(); onClose(); } }),
        h(CtxItem, { label: '复制节点', shortcut: '⇧' + MOD + 'V', onSelect: () => { onDuplicateSelected && onDuplicateSelected(); onClose(); } }),
        h(CtxSep),
        h(CtxItem, { label: '删除', shortcut: '⌫', danger: true, onSelect: () => { onDeleteSelected && onDeleteSelected(); onClose(); } }),
      ),
      target.type === 'edge' && target.id && h(CtxItem, { label: '删除连线', shortcut: '⌫', danger: true, onSelect: () => { onDelete && onDelete(target.id); onClose(); } }),
    );
  }

  /* ── ShortcutsHelp ────────────────────────────────────────────── */
  function MouseScrollIcon() {
    return h('svg', { width: 28, height: 28, viewBox: '0 0 24 30', fill: 'none', style: { width: 32, height: 32 } },
      h('style', null, '@keyframes scrollw{0%,100%{transform:translateY(0)}50%{transform:translateY(2.5px)}}'),
      h('rect', { x: 3, y: 3, width: 18, height: 24, rx: 9, stroke: 'currentColor', strokeOpacity: 0.35, strokeWidth: 1.5 }),
      h('line', { x1: 12, y1: 3, x2: 12, y2: 13, stroke: 'currentColor', strokeOpacity: 0.2, strokeWidth: 1 }),
      h('g', { style: { animation: 'scrollw 1.5s ease-in-out infinite' } },
        h('rect', { x: 10.5, y: 7, width: 3, height: 5, rx: 1.5, fill: ACCENT, fillOpacity: 0.3, stroke: ACCENT, strokeWidth: 1 }),
      ),
      h('path', { d: 'M12 4.5V2', stroke: ACCENT, strokeOpacity: 0.5, strokeWidth: 1, strokeLinecap: 'round' }),
      h('path', { d: 'M11 2.5L12 1.5l1 1', stroke: ACCENT, strokeOpacity: 0.5, strokeWidth: 1, strokeLinecap: 'round', strokeLinejoin: 'round' }),
    );
  }
  function TrackpadPinchIcon() {
    return h('svg', { width: 28, height: 28, viewBox: '0 0 36 36', fill: 'none', style: { width: 32, height: 32 } },
      h('style', null, '@keyframes tpinch{0%,100%{transform:translate(0,0)}50%{transform:translate(var(--px),var(--py))}}'),
      h('rect', { x: 2, y: 2, width: 32, height: 32, rx: 6, stroke: 'currentColor', strokeOpacity: 0.25, strokeWidth: 1.2 }),
      h('g', { style: { '--px': '-3px', '--py': '-3px', animation: 'tpinch 1.8s ease-in-out infinite' } },
        h('circle', { cx: 14, cy: 14, r: 3.5, fill: ACCENT, fillOpacity: 0.12, stroke: ACCENT, strokeWidth: 1.2 }),
        h('circle', { cx: 14, cy: 14, r: 1.2, fill: ACCENT }),
      ),
      h('g', { style: { '--px': '3px', '--py': '3px', animation: 'tpinch 1.8s ease-in-out infinite' } },
        h('circle', { cx: 22, cy: 22, r: 3.5, fill: ACCENT, fillOpacity: 0.12, stroke: ACCENT, strokeWidth: 1.2 }),
        h('circle', { cx: 22, cy: 22, r: 1.2, fill: ACCENT }),
      ),
    );
  }
  function MouseDragIcon() {
    return h('svg', { width: 28, height: 28, viewBox: '0 0 24 30', fill: 'none', style: { width: 32, height: 32 } },
      h('style', null, '@keyframes mdrag{0%,100%{transform:translate(0,0)}50%{transform:translate(2px,-2px)}}'),
      h('g', { style: { animation: 'mdrag 2s ease-in-out infinite' } },
        h('rect', { x: 3, y: 3, width: 18, height: 24, rx: 9, stroke: 'currentColor', strokeOpacity: 0.35, strokeWidth: 1.5 }),
        h('path', { d: 'M3.6 12H12V3.3A8.7 8.7 0 003.6 12z', fill: ACCENT, fillOpacity: 0.25, stroke: ACCENT, strokeWidth: 1 }),
        h('line', { x1: 12, y1: 3, x2: 12, y2: 13, stroke: 'currentColor', strokeOpacity: 0.25, strokeWidth: 1 }),
      ),
      h('path', { d: 'M22 6l-3-3M22 6l-3 3', stroke: ACCENT, strokeOpacity: 0.5, strokeWidth: 1, strokeLinecap: 'round', strokeLinejoin: 'round' }),
      h('line', { x1: 22, y1: 6, x2: 17, y2: 6, stroke: ACCENT, strokeOpacity: 0.5, strokeWidth: 1, strokeLinecap: 'round' }),
    );
  }
  function TrackpadDragIcon() {
    return h('svg', { width: 28, height: 28, viewBox: '0 0 36 36', fill: 'none', style: { width: 32, height: 32 } },
      h('style', null, '@keyframes tfdrag{0%,100%{transform:translate(0,0)}50%{transform:translate(2.5px,-2.5px)}}'),
      h('rect', { x: 2, y: 2, width: 32, height: 32, rx: 6, stroke: 'currentColor', strokeOpacity: 0.25, strokeWidth: 1.2 }),
      h('g', { style: { animation: 'tfdrag 2s ease-in-out infinite' } },
        h('circle', { cx: 18, cy: 18, r: 3.5, fill: ACCENT, fillOpacity: 0.12, stroke: ACCENT, strokeWidth: 1.2 }),
        h('circle', { cx: 18, cy: 18, r: 1.3, fill: ACCENT }),
      ),
    );
  }
  function Kbd({ children }) { return h('span', { style: { minWidth: 32, height: 32, padding: '0 8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #3f3f46', borderRadius: 6, fontSize: 13, fontVariantNumeric: 'tabular-nums', color: '#e4e4e7' } }, children); }
  function ShortcutRow({ label, keys }) {
    return h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'nowrap', color: '#e4e4e7' } },
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, whiteSpace: 'nowrap', fontSize: 13 } }, label),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } }, ...keys),
    );
  }
  function ShortcutsHelp({ open, onClose }) {
    useEffect(() => {
      if (!open) return;
      const onKey = e => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }, [open, onClose]);
    if (!open) return null;
    return h('div', { className: 'react-flow__panel bottom center', style: { pointerEvents: 'auto', bottom: 52 } },
      h('div', { style: { width: 640, background: '#1a1a1a', border: '1px solid rgba(63,63,70,0.6)', borderRadius: 16, padding: '24px 40px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 56, boxShadow: '0 16px 48px rgba(0,0,0,0.6)', position: 'relative' } },
        h('button', { onClick: onClose, style: { position: 'absolute', top: 12, right: 12, width: 32, height: 32, borderRadius: '50%', border: 'none', background: 'transparent', color: '#71717a', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' } }, Icon('X', 18)),
        // Left col
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 20 } },
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
            h('h2', { style: { fontSize: 17, fontWeight: 400, color: '#71717a', margin: 0 } }, '缩放'),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
              h(ShortcutRow, { label: '鼠标', keys: [h(MouseScrollIcon, { key: 's' })] }),
              h(ShortcutRow, { label: '触控板', keys: [h(TrackpadPinchIcon, { key: 't' })] }),
            ),
          ),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
            h('h2', { style: { fontSize: 17, fontWeight: 400, color: '#71717a', margin: 0 } }, '移动画布'),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
              h(ShortcutRow, { label: '鼠标', keys: [h(MouseDragIcon, { key: 'd' })] }),
              h(ShortcutRow, { label: '触控板', keys: [h(TrackpadDragIcon, { key: 't' })] }),
            ),
          ),
        ),
        // Right col
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: 12 } },
          h('h2', { style: { fontSize: 17, fontWeight: 400, color: '#71717a', margin: 0 } }, '其他快捷键'),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: 10 } },
            h(ShortcutRow, { label: '删除', keys: [h(Kbd, { key: 'b' }, '⌫')] }),
            h(ShortcutRow, { label: '撤销', keys: [h(Kbd, { key: 'm' }, MOD), h(Kbd, { key: 'z' }, 'Z')] }),
            h(ShortcutRow, { label: '重做', keys: [h(Kbd, { key: 's' }, '⇧'), h(Kbd, { key: 'm' }, MOD), h(Kbd, { key: 'z' }, 'Z')] }),
            h(ShortcutRow, { label: '复制', keys: [h(Kbd, { key: 'm' }, MOD), h(Kbd, { key: 'c' }, 'C')] }),
            h(ShortcutRow, { label: '粘贴', keys: [h(Kbd, { key: 'm' }, MOD), h(Kbd, { key: 'v' }, 'V')] }),
            h(ShortcutRow, { label: '复制节点', keys: [h(Kbd, { key: 's' }, '⇧'), h(Kbd, { key: 'm' }, MOD), h(Kbd, { key: 'v' }, 'V')] }),
          ),
        ),
      ),
    );
  }

  /* ── SelectionToolbar ────────────────────────────────────────── */
  const GROUP_COLORS = ['#6b7280','#ef4444','#f97316','#eab308','#22c55e','#3b82f6','#8b5cf6','#ec4899'];
  const transformSelector = s => s.transform;

  function useSelectionBounds() {
    const nodes = useCanvasStore(s => s.nodes);
    const selectedIds = useCanvasStore(s => s.selectedNodeIds);
    return useMemo(() => {
      if (!selectedIds || selectedIds.size === 0) return null;
      const selected = nodes.filter(n => selectedIds.has(n.id));
      if (selected.length === 0) return null;
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const n of selected) {
        const w = Number(n.style?.width ?? n.width ?? 280);
        const wh = Number(n.style?.height ?? n.height ?? 200);
        minX = Math.min(minX, n.position.x); minY = Math.min(minY, n.position.y);
        maxX = Math.max(maxX, n.position.x + w); maxY = Math.max(maxY, n.position.y + wh);
      }
      return { minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
    }, [nodes, selectedIds]);
  }

  function ToolbarButton({ icon: Ic, label, onClick, variant = 'default' }) {
    const [hov, setHov] = useState(false);
    const color = variant === 'danger' ? (hov ? '#f87171' : '#a1a1aa') : (hov ? '#e4e4e7' : '#a1a1aa');
    const bg = variant === 'danger' ? (hov ? 'rgba(239,68,68,0.15)' : 'transparent') : (hov ? 'rgba(255,255,255,0.08)' : 'transparent');
    return h('button', { type: 'button', onClick, onMouseEnter: () => setHov(true), onMouseLeave: () => setHov(false), title: label, style: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, color, background: bg, border: 'none', cursor: 'pointer', transition: 'all 0.15s' } },
      h(Ic, { size: 14 }),
      h('span', null, label),
    );
  }

  function AlignDistributePopover({ alignSelected, distributeSelected }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
      if (!open) return;
      const fn = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
      document.addEventListener('mousedown', fn);
      return () => document.removeEventListener('mousedown', fn);
    }, [open]);

    const alignItems = [
      { icon: window.lucide?.AlignStartVertical || (() => h('span', null, '⬛')), label: '左对齐',  dir: 'left' },
      { icon: window.lucide?.AlignCenterVertical || (() => h('span', null, '⬜')), label: '水平居中', dir: 'center-h' },
      { icon: window.lucide?.AlignEndVertical || (() => h('span', null, '⬛')), label: '右对齐',  dir: 'right' },
      { icon: window.lucide?.AlignStartHorizontal || (() => h('span', null, '⬛')), label: '顶对齐',  dir: 'top' },
      { icon: window.lucide?.AlignCenterHorizontal || (() => h('span', null, '⬜')), label: '垂直居中', dir: 'center-v' },
      { icon: window.lucide?.AlignEndHorizontal || (() => h('span', null, '⬛')), label: '底对齐',  dir: 'bottom' },
    ];

    const [hov, setHov] = useState(false);
    return h('div', { style: { position: 'relative' }, ref },
      h('button', { type: 'button', onClick: () => setOpen(!open), onMouseEnter: () => setHov(true), onMouseLeave: () => setHov(false), title: '对齐', style: { display: 'flex', alignItems: 'center', gap: 6, padding: '6px 10px', borderRadius: 999, fontSize: 12, fontWeight: 500, color: hov ? '#e4e4e7' : '#a1a1aa', background: hov ? 'rgba(255,255,255,0.08)' : 'transparent', border: 'none', cursor: 'pointer' } },
        Icon('CircleEllipsis', 14), h('span', null, '对齐'),
      ),
      open && h('div', { style: { position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 6, padding: '6px 0', minWidth: 180, borderRadius: 8, background: '#1c1c1c', border: '1px solid rgba(63,63,70,0.6)', boxShadow: '0 8px 24px rgba(0,0,0,0.5)', zIndex: 50 } },
        h('div', { style: { padding: '4px 12px', fontSize: 10, fontWeight: 500, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1 } }, '对齐'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 2, padding: '4px 8px' } },
          alignItems.map(({ icon: Ic, label, dir }) => {
            const [hv, setHv] = useState(false);
            return h('button', { key: dir, type: 'button', onClick: () => { alignSelected(dir); setOpen(false); }, onMouseEnter: () => setHv(true), onMouseLeave: () => setHv(false), title: label, style: { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 8, borderRadius: 6, border: 'none', cursor: 'pointer', background: hv ? 'rgba(255,255,255,0.08)' : 'transparent', color: hv ? '#fff' : '#a1a1aa' } },
              h(Ic, { size: 15 }),
            );
          }),
        ),
        h('div', { style: { height: 1, background: 'rgba(63,63,70,0.5)', margin: '4px 8px' } }),
        h('div', { style: { padding: '4px 12px', fontSize: 10, fontWeight: 500, color: '#71717a', textTransform: 'uppercase', letterSpacing: 1 } }, '分布'),
        ...([['horizontal','水平分布'],['vertical','垂直分布']].map(([axis, label]) => {
          const [hv, setHv] = useState(false);
          return h('button', { key: axis, type: 'button', onClick: () => { distributeSelected(axis); setOpen(false); }, onMouseEnter: () => setHv(true), onMouseLeave: () => setHv(false), style: { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', fontSize: 12, color: hv ? '#fff' : '#d4d4d8', background: hv ? 'rgba(255,255,255,0.08)' : 'transparent', border: 'none', cursor: 'pointer' } }, label);
        })),
      ),
    );
  }

  function MultiSelectToolbarInner() {
    const groupSelected = useCanvasStore(s => s.groupSelected);
    const deleteSelected = useCanvasStore(s => s.deleteSelected);
    const alignSelected = useCanvasStore(s => s.alignSelected);
    const distributeSelected = useCanvasStore(s => s.distributeSelected);
    const { Group, Trash2 } = window.lucide;
    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 2 } },
      h(AlignDistributePopover, { alignSelected, distributeSelected }),
      h('div', { style: { width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' } }),
      h(ToolbarButton, { icon: Group, label: '分组', onClick: groupSelected, variant: 'primary' }),
      h(ToolbarButton, { icon: Trash2, label: '删除', onClick: deleteSelected, variant: 'danger' }),
    );
  }

  function GroupToolbarInner({ groupId }) {
    const ungroupNode = useCanvasStore(s => s.ungroupNode);
    const deleteGroup = useCanvasStore(s => s.deleteGroup);
    const layoutGroupHorizontal = useCanvasStore(s => s.layoutGroupHorizontal);
    const layoutGroupGrid = useCanvasStore(s => s.layoutGroupGrid);
    const updateNodeData = useCanvasStore(s => s.updateNodeData);
    const groupColor = useCanvasStore(s => String(s.nodes.find(n => n.id === groupId)?.data?.groupColor ?? '#6b7280'));
    const [showColors, setShowColors] = useState(false);
    const colorRef = useRef(null);
    const { Ungroup, Trash2, Grid2X2, AlignVerticalJustifyCenter } = window.lucide;

    useEffect(() => {
      if (!showColors) return;
      const fn = e => { if (colorRef.current && !colorRef.current.contains(e.target)) setShowColors(false); };
      document.addEventListener('mousedown', fn);
      return () => document.removeEventListener('mousedown', fn);
    }, [showColors]);

    return h('div', { style: { display: 'flex', alignItems: 'center', gap: 2 } },
      h('div', { style: { position: 'relative' }, ref: colorRef },
        h('button', { type: 'button', onClick: () => setShowColors(!showColors), title: '分组颜色', style: { padding: 6, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer' } },
          h('div', { style: { width: 16, height: 16, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.2)', background: groupColor } }),
        ),
        showColors && h('div', { style: { position: 'absolute', top: '100%', left: 0, marginTop: 4, padding: 6, borderRadius: 8, background: '#1c1c1c', border: '1px solid rgba(63,63,70,0.6)', boxShadow: '0 4px 16px rgba(0,0,0,0.5)', display: 'flex', gap: 4, zIndex: 50 } },
          GROUP_COLORS.map(c => h('button', { key: c, type: 'button', onClick: () => { updateNodeData(groupId, { groupColor: c }); setShowColors(false); }, style: { width: 20, height: 20, borderRadius: '50%', border: '1px solid rgba(255,255,255,0.1)', background: c, cursor: 'pointer' } })),
        ),
      ),
      h('div', { style: { width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' } }),
      h(ToolbarButton, { icon: AlignVerticalJustifyCenter, label: '横向布局', onClick: () => layoutGroupHorizontal(groupId) }),
      h(ToolbarButton, { icon: Grid2X2, label: '网格布局', onClick: () => layoutGroupGrid(groupId) }),
      h('div', { style: { width: 1, height: 20, background: 'rgba(255,255,255,0.1)', margin: '0 4px' } }),
      h(ToolbarButton, { icon: Ungroup, label: '取消分组', onClick: () => ungroupNode(groupId) }),
      h(ToolbarButton, { icon: Trash2, label: '删除分组', onClick: () => deleteGroup(groupId), variant: 'danger' }),
    );
  }

  function SelectionToolbarComponent() {
    const { flowToScreenPosition } = useReactFlow();
    const transform = useRFStore(transformSelector);
    void transform; // reactive re-render on viewport change
    const selectedIds = useCanvasStore(s => s.selectedNodeIds);
    const nodes = useCanvasStore(s => s.nodes);
    const bounds = useSelectionBounds();
    const isMultiDragging = useMultiDragStore(s => s.isDragging);
    const isMultiPinned = useMultiDragStore(s => s.isPinned);

    const selectedNodes = useMemo(() => nodes.filter(n => selectedIds && selectedIds.has(n.id)), [nodes, selectedIds]);

    const dragStartRef = useRef(null);
    const didDragRef = useRef(false);
    const selectedIdsRef = useRef(selectedIds);
    selectedIdsRef.current = selectedIds;

    const handlePlusPointerDown = useCallback(e => {
      e.stopPropagation(); e.preventDefault();
      e.target.setPointerCapture(e.pointerId);
      dragStartRef.current = { x: e.clientX, y: e.clientY };
      didDragRef.current = false;

      const onMove = ev => {
        if (!dragStartRef.current) return;
        const dist = Math.hypot(ev.clientX - dragStartRef.current.x, ev.clientY - dragStartRef.current.y);
        if (dist > 4 && !didDragRef.current) {
          didDragRef.current = true;
          useMultiDragStore.getState().startDrag(Array.from(selectedIdsRef.current), ev.clientX, ev.clientY);
        }
        if (didDragRef.current) {
          useMultiDragStore.getState().updateCursor(ev.clientX, ev.clientY);
        }
      };
      const onUp = ev => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        const wasDragging = didDragRef.current;
        dragStartRef.current = null; didDragRef.current = false;
        if (wasDragging) {
          useMultiDragStore.getState().endDrag();
          window.dispatchEvent(new CustomEvent('xinyu:multiselect-plus-click', { detail: { screenX: ev.clientX, screenY: ev.clientY, nodeIds: Array.from(selectedIdsRef.current) } }));
        } else {
          window.dispatchEvent(new CustomEvent('xinyu:multiselect-plus-click', { detail: { screenX: ev.clientX, screenY: ev.clientY, nodeIds: Array.from(selectedIdsRef.current) } }));
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    }, []);

    if (!bounds || !selectedIds || selectedIds.size < 1) return null;

    const isSingleGroup = selectedNodes.length === 1 && selectedNodes[0].data?.nodeType === 'group';
    const isMultiSelect = (selectedIds.size >= 2) && !selectedNodes.every(n => n.data?.nodeType === 'group');
    const isSingleNonGroup = selectedNodes.length === 1 && selectedNodes[0].data?.nodeType !== 'group';
    if (isSingleNonGroup) return null;
    if (!isSingleGroup && !isMultiSelect) return null;

    const screenPos = flowToScreenPosition({ x: bounds.cx, y: bounds.minY });
    const rightCenterScreen = isMultiSelect ? flowToScreenPosition({ x: bounds.maxX, y: (bounds.minY + bounds.maxY) / 2 }) : null;
    const { Plus } = window.lucide;

    return h(React.Fragment, null,
      h('div', { style: { position: 'fixed', zIndex: 50, pointerEvents: 'auto', left: screenPos.x, top: screenPos.y, transform: 'translate(-50%, calc(-100% - 12px))' } },
        h('div', { style: { height: 40, padding: '0 6px', borderRadius: 999, display: 'flex', alignItems: 'center', background: 'rgba(26,26,26,0.92)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.1)', boxShadow: '0 4px 16px rgba(0,0,0,0.4)' } },
          isSingleGroup ? h(GroupToolbarInner, { groupId: selectedNodes[0].id }) : h(MultiSelectToolbarInner),
        ),
      ),
      isMultiSelect && rightCenterScreen && h('div', {
        style: { position: 'fixed', zIndex: 50, pointerEvents: 'auto', cursor: 'grab', left: rightCenterScreen.x, top: rightCenterScreen.y, transform: 'translate(12px, -50%)', opacity: (isMultiDragging || isMultiPinned) ? 0 : 1, transition: 'opacity 0.15s' },
        onPointerDown: handlePlusPointerDown,
      },
        h('div', { style: { width: 32, height: 32, borderRadius: '50%', background: 'rgba(113,113,122,0.8)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.4)' } },
          h(Plus, { size: 18, style: { color: '#fff', strokeWidth: 2.5 } }),
        ),
      ),
    );
  }

  const SelectionToolbar = memo(SelectionToolbarComponent);

  /* ── AlignmentGuides ─────────────────────────────────────────── */
  const SNAP_THRESHOLD = 5;
  const isDraggingSelector = s => s.nodes.some(n => n.dragging);

  function AlignmentGuides() {
    const isDragging = useRFStore(isDraggingSelector);
    const rfNodes = useRFStore(s => s.nodes);
    const transform = useRFStore(s => s.transform);

    const draggingNodes = useMemo(() => isDragging ? rfNodes.filter(n => n.dragging) : [], [rfNodes, isDragging]);
    const staticNodes = useMemo(() => isDragging ? rfNodes.filter(n => !n.dragging && !n.selected) : [], [rfNodes, isDragging]);

    const guides = useMemo(() => {
      if (!draggingNodes.length || !staticNodes.length) return [];
      const lines = []; const seen = new Set();
      for (const drag of draggingNodes) {
        const dw = drag.measured?.width ?? drag.width ?? 280, dh = drag.measured?.height ?? drag.height ?? 200;
        const dCx = drag.position.x + dw / 2, dCy = drag.position.y + dh / 2;
        const dL = drag.position.x, dR = drag.position.x + dw, dT = drag.position.y, dB = drag.position.y + dh;
        for (const stat of staticNodes) {
          const sw = stat.measured?.width ?? stat.width ?? 280, sh = stat.measured?.height ?? stat.height ?? 200;
          const sCx = stat.position.x + sw / 2, sCy = stat.position.y + sh / 2;
          const sL = stat.position.x, sR = stat.position.x + sw, sT = stat.position.y, sB = stat.position.y + sh;
          for (const { a, b } of [{ a: dCx, b: sCx }, { a: dL, b: sL }, { a: dR, b: sR }, { a: dL, b: sR }, { a: dR, b: sL }]) {
            if (Math.abs(a - b) < SNAP_THRESHOLD) { const k = 'v:' + Math.round(b); if (!seen.has(k)) { seen.add(k); lines.push({ orientation: 'v', pos: b }); } }
          }
          for (const { a, b } of [{ a: dCy, b: sCy }, { a: dT, b: sT }, { a: dB, b: sB }, { a: dT, b: sB }, { a: dB, b: sT }]) {
            if (Math.abs(a - b) < SNAP_THRESHOLD) { const k = 'h:' + Math.round(b); if (!seen.has(k)) { seen.add(k); lines.push({ orientation: 'h', pos: b }); } }
          }
        }
      }
      return lines;
    }, [draggingNodes, staticNodes]);

    if (!guides.length) return null;
    const [tx, ty, zoom] = transform;
    return h('svg', { style: { pointerEvents: 'none', position: 'absolute', inset: 0, width: '100%', height: '100%', zIndex: 100 } },
      guides.map((g, i) => g.orientation === 'v'
        ? h('line', { key: 'v-' + i, x1: g.pos * zoom + tx, y1: 0, x2: g.pos * zoom + tx, y2: '100%', stroke: 'rgba(192,192,192,0.5)', strokeWidth: 0.5, strokeDasharray: '4 4' })
        : h('line', { key: 'h-' + i, x1: 0, y1: g.pos * zoom + ty, x2: '100%', y2: g.pos * zoom + ty, stroke: 'rgba(192,192,192,0.5)', strokeWidth: 0.5, strokeDasharray: '4 4' }),
      ),
    );
  }

  /* ── CanvasSettingsModal — now accepts {open, onClose} props ─── */
  function CanvasSettingsModal({ open, onClose }) {
    const config = useCanvasConfigStore(s => s.config);

    const [local, setLocal] = useState({ ...config });
    const [loadingModels, setLoadingModels] = useState(false);
    const [testResult, setTestResult] = useState(null);

    useEffect(() => { if (open) setLocal({ ...config }); }, [open]);

    if (!open) return null;
    const setF = (k, v) => setLocal(prev => ({ ...prev, [k]: v }));

    const handleFetchModels = async () => {
      if (!local.baseUrl || !local.apiKey) { setTestResult({ ok: false, msg: '请填写 API Base 和 API Key' }); return; }
      setLoadingModels(true); setTestResult(null);
      try {
        const models = await window.Cv.api.fetchModels(local);
        setF('models', models);
        setTestResult({ ok: true, msg: `获取到 ${models.length} 个模型` });
      } catch(e) { setTestResult({ ok: false, msg: e.message }); }
      finally { setLoadingModels(false); }
    };

    const handleSave = () => {
      useCanvasConfigStore.getState().patchConfig(local);
      onClose();
      useToastStore.getState().show('API 设置已保存', 'success');
    };

    const VIDEO_API_TYPES = [
      ['openai-async','OpenAI 异步 (/v1/video/generations)'],
      ['fal','fal.ai 队列'],
      ['kling','Kling 直连 API'],
      ['replicate','Replicate 预测 API'],
    ];

    return h('div', { className: 'cv-modal-overlay', onClick: onClose },
      h('div', { className: 'cv-modal', style: { width: 520 }, onClick: e => e.stopPropagation() },
        h('div', { className: 'cv-modal-header' },
          Icon('Settings', 16), h('div', { className: 'cv-modal-title' }, '画布 API 设置'),
          h('button', { className: 'cv-btn icon ghost', onClick: onClose }, Icon('X', 14)),
        ),
        h('div', { className: 'cv-modal-body' },
          h('div', { className: 'cv-settings-section' },
            h('div', { className: 'cv-settings-section-title' }, '生图 API（OpenAI 兼容）'),
            h('div', { className: 'cv-field', style: { marginBottom: 8 } },
              h('label', null, 'API Base URL'),
              h('div', { style: { display: 'flex', gap: 6 } },
                h('input', { className: 'cv-input', value: local.baseUrl || '', placeholder: 'https://api.openai.com', onChange: e => setF('baseUrl', e.target.value), style: { flex: 1 } }),
                h('button', { className: 'cv-btn sm', onClick: handleFetchModels, disabled: loadingModels }, loadingModels ? Icon('Loader2', 13) : Icon('Plug', 13), ' 测试'),
              ),
            ),
            h('div', { className: 'cv-field', style: { marginBottom: 8 } },
              h('label', null, 'API Key'),
              h('input', { className: 'cv-input', type: 'password', value: local.apiKey || '', placeholder: 'sk-…', onChange: e => setF('apiKey', e.target.value) }),
            ),
            testResult && h('div', { style: { fontSize: 11, color: testResult.ok ? '#22c55e' : 'var(--danger)', marginBottom: 8, padding: '4px 8px', background: testResult.ok ? 'rgba(34,197,94,.08)' : 'var(--danger-soft)', borderRadius: 6 } }, testResult.msg),
            h('div', { className: 'cv-field-row' },
              h('div', { className: 'cv-field' },
                h('label', null, '生图模型'),
                local.models && local.models.length > 0
                  ? h('select', { className: 'cv-select', value: local.imageModel || '', onChange: e => setF('imageModel', e.target.value) }, h('option', { value: '' }, '选择模型…'), ...local.models.map(m => h('option', { key: m, value: m }, m)))
                  : h('input', { className: 'cv-input', value: local.imageModel || '', placeholder: 'gpt-image-2 / dall-e-3', onChange: e => setF('imageModel', e.target.value) }),
              ),
              h('div', { className: 'cv-field' },
                h('label', null, '文字模型（对话/TTS）'),
                local.models && local.models.length > 0
                  ? h('select', { className: 'cv-select', value: local.textModel || '', onChange: e => setF('textModel', e.target.value) }, h('option', { value: '' }, '选择模型…'), ...local.models.map(m => h('option', { key: m, value: m }, m)))
                  : h('input', { className: 'cv-input', value: local.textModel || '', placeholder: 'gpt-4o / gpt-4o-mini', onChange: e => setF('textModel', e.target.value) }),
              ),
            ),
            h('div', { className: 'cv-field-row', style: { marginTop: 8 } },
              h('div', { className: 'cv-field' }, h('label', null, '默认尺寸'), h('select', { className: 'cv-select', value: local.size || '1:1', onChange: e => setF('size', e.target.value) }, ...['1:1','16:9','9:16','4:3','3:4'].map(s => h('option', { key: s, value: s }, s)))),
              h('div', { className: 'cv-field' }, h('label', null, '默认质量'), h('select', { className: 'cv-select', value: local.quality || 'auto', onChange: e => setF('quality', e.target.value) }, ...['auto','standard','hd','low'].map(q => h('option', { key: q, value: q }, q)))),
              h('div', { className: 'cv-field' }, h('label', null, '默认数量'), h('select', { className: 'cv-select', value: local.count || '1', onChange: e => setF('count', e.target.value) }, ...['1','2','3','4'].map(c => h('option', { key: c, value: c }, c + '张')))),
            ),
            h('div', { className: 'cv-field', style: { marginTop: 8 } }, h('label', null, '系统提示词（对话用）'), h('textarea', { className: 'cv-textarea', value: local.systemPrompt || '', rows: 2, placeholder: '可选，对所有对话请求生效', onChange: e => setF('systemPrompt', e.target.value) })),
          ),
          h('div', { className: 'cv-settings-section' },
            h('div', { className: 'cv-settings-section-title' }, '生视频 API'),
            h('div', { className: 'cv-field', style: { marginBottom: 8 } }, h('label', null, 'API 类型'), h('select', { className: 'cv-select', value: local.videoApiType || 'openai-async', onChange: e => setF('videoApiType', e.target.value) }, ...VIDEO_API_TYPES.map(([v,l]) => h('option', { key: v, value: v }, l)))),
            h('div', { className: 'cv-field', style: { marginBottom: 8 } }, h('label', null, '视频 API Base URL（留空则复用生图 Base URL）'), h('input', { className: 'cv-input', value: local.videoBaseUrl || '', placeholder: local.baseUrl || 'https://api.kling.ai', onChange: e => setF('videoBaseUrl', e.target.value) })),
            h('div', { className: 'cv-field', style: { marginBottom: 8 } }, h('label', null, '视频 API Key（留空则复用生图 Key）'), h('input', { className: 'cv-input', type: 'password', value: local.videoApiKey || '', placeholder: '留空则复用主 Key', onChange: e => setF('videoApiKey', e.target.value) })),
            h('div', { className: 'cv-field' }, h('label', null, '默认视频模型'), h('input', { className: 'cv-input', value: local.videoModel || '', placeholder: 'kling-v1 / fal-ai/kling-video/…', onChange: e => setF('videoModel', e.target.value) })),
          ),
          h('div', { className: 'cv-settings-section' },
            h('div', { className: 'cv-settings-section-title' }, '画布设置'),
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: 8 } },
              h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 } }, h('input', { type: 'checkbox', checked: !!local.snapToGrid, onChange: e => setF('snapToGrid', e.target.checked) }), '启用网格吸附'),
              h('label', { style: { display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12 } }, h('input', { type: 'checkbox', checked: local.showGrid !== false, onChange: e => setF('showGrid', e.target.checked) }), '显示背景网格点'),
            ),
          ),
        ),
        h('div', { className: 'cv-modal-footer' },
          h('button', { className: 'cv-btn ghost', onClick: onClose }, '取消'),
          h('button', { className: 'cv-btn primary', onClick: handleSave }, Icon('Check', 13), ' 保存设置'),
        ),
      ),
    );
  }

  /* ── Toast container ─────────────────────────────────────────────── */
  function CvToastContainer() {
    const toasts = useToastStore(s => s.toasts);
    if (!toasts.length) return null;
    return React.createElement('div', { className: 'cv-toast-container' },
      toasts.map(t =>
        React.createElement('div', { key: t.id, className: 'cv-toast ' + (t.type || '') },
          t.type === 'error'   ? Icon('AlertCircle', 14) :
          t.type === 'success' ? Icon('CheckCircle', 14) :
          Icon('Info', 14),
          React.createElement('span', null, t.message),
          React.createElement('button', { className: 'cv-btn icon ghost', style: { marginLeft: 'auto', flexShrink: 0 }, onClick: () => useToastStore.getState().remove(t.id) }, Icon('X', 11)),
        ),
      ),
    );
  }

  /* ── DetailViewModal — full-screen image/video viewer ────────────── */
  function DetailViewModal() {
    const detail = usePanelStore(s => s.detailView);
    if (!detail) return null;

    const isVideo = !!(detail.videoUrl);
    const src = detail.videoUrl || detail.imageUrl;

    return React.createElement('div', {
      className: 'cv-modal-overlay',
      onClick: () => usePanelStore.getState().closeDetailView(),
      style: { alignItems: 'stretch', padding: 20 },
    },
      React.createElement('div', {
        style: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' },
        onClick: e => e.stopPropagation(),
      },
        isVideo
          ? React.createElement('video', { src, controls: true, loop: true, style: { maxWidth: '100%', maxHeight: '100%', borderRadius: 12 } })
          : React.createElement('img', { src, alt: '', style: { maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 12 } }),
        React.createElement('button', {
          className: 'cv-btn icon', style: { position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,.5)', border: 'none', borderRadius: 8, color: '#fff' },
          onClick: () => usePanelStore.getState().closeDetailView(),
        }, Icon('X', 18)),
        React.createElement('div', { style: { position: 'absolute', bottom: 16, right: 16, display: 'flex', gap: 8 } },
          React.createElement('button', {
            className: 'cv-btn', style: { background: 'rgba(0,0,0,.6)', border: 'none', color: '#fff' },
            onClick: () => window.Cv.downloadFile(src, isVideo ? 'canvas-video.mp4' : 'canvas-image.png'),
          }, Icon('Download', 14), ' 下载'),
          !isVideo && React.createElement('button', {
            className: 'cv-btn', style: { background: 'rgba(0,0,0,.6)', border: 'none', color: '#fff' },
            onClick: () => window.Cv.api.saveImageToLibrary(src, detail.data),
          }, Icon('FolderPlus', 14), ' 存库'),
        ),
      ),
    );
  }

  /* ── Zoom constants ─────────────────────────────────────────────── */
  const CANVAS_MIN_ZOOM = 0.25;
  const CANVAS_MAX_ZOOM = 2;

  /* ── CanvasControls SVG icons ────────────────────────────────────── */
  function MapLocateIcon({ size = 16 }) {
    return h('svg', { viewBox: '0 0 1024 1024', width: size, height: size, fill: 'currentColor' },
      h('path', { d: 'M512 659.093c32 0 211.307-224.427 211.307-341.333a211.307 211.307 0 0 0-422.614 0c0 116.907 179.307 341.333 211.307 341.333zm-136.64-341.333a136.64 136.64 0 0 1 273.28 0c0 22.773-17.867 76.64-68.16 153.547a814.827 814.827 0 0 1-68.48 90.666 814.827 814.827 0 0 1-68.48-90.666C393.227 394.667 375.36 340.747 375.36 317.973z' }),
      h('path', { d: 'M512 306.187a53.333 53.333 0 1 0 0 106.666 53.333 53.333 0 0 0 0-106.666z' }),
      h('path', { d: 'M771.467 405.707l33.333 42.933a5.333 5.333 0 0 0 7.573.8l21.6-17.867a5.333 5.333 0 0 1 8.694 4.107v268.96a5.333 5.333 0 0 1-2.4 4.48l-187.254 122.187a5.333 5.333 0 0 1-5.333 0l-281.12-162.134a5.333 5.333 0 0 0-5.333 0L189.6 784.747a5.333 5.333 0 0 1-8.267-4.374V510.72a5.333 5.333 0 0 1 1.867-4.107l69.333-58.186a5.333 5.333 0 0 0 .96-7.04l-33.44-49.654a5.333 5.333 0 0 0-7.466-1.386L108.96 462.72a5.333 5.333 0 0 0-2.293 4.373v440.534a5.333 5.333 0 0 0 8.16 4.48L362.667 753.76a5.333 5.333 0 0 1 5.333 0l280.533 162.133a5.333 5.333 0 0 0 5.334 0l260.533-162.08a5.333 5.333 0 0 0 2.507-4.48V309.333a5.333 5.333 0 0 0-8.32-4.373l-135.947 93.12a5.333 5.333 0 0 0-1.173 7.627z' }),
    );
  }

  function GridDotsIcon({ size = 16 }) {
    return h('svg', { xmlns: 'http://www.w3.org/2000/svg', width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: '2', strokeLinecap: 'round', strokeLinejoin: 'round' },
      h('circle', { cx: 5, cy: 5, r: 1 }), h('circle', { cx: 12, cy: 5, r: 1 }), h('circle', { cx: 19, cy: 5, r: 1 }),
      h('circle', { cx: 5, cy: 12, r: 1 }), h('circle', { cx: 12, cy: 12, r: 1 }), h('circle', { cx: 19, cy: 12, r: 1 }),
      h('circle', { cx: 5, cy: 19, r: 1 }), h('circle', { cx: 12, cy: 19, r: 1 }), h('circle', { cx: 19, cy: 19, r: 1 }),
    );
  }

  /* ── MultiDragLines ──────────────────────────────────────────────── */
  function MultiDragLinesComponent() {
    const isDragging = useMultiDragStore(s => s.isDragging);
    const isPinned = useMultiDragStore(s => s.isPinned);
    const sourceNodeIds = useMultiDragStore(s => s.sourceNodeIds);
    const cursorX = useMultiDragStore(s => s.cursorX);
    const cursorY = useMultiDragStore(s => s.cursorY);
    const hoveredNodeId = useMultiDragStore(s => s.hoveredNodeId);
    const nodes = useCanvasStore(s => s.nodes);
    const { flowToScreenPosition } = useReactFlow();

    if ((!isDragging && !isPinned) || sourceNodeIds.length === 0) return null;

    const lines = [];
    for (const nodeId of sourceNodeIds) {
      const node = nodes.find(n => n.id === nodeId);
      if (!node) continue;
      const w = Number(node.style?.width ?? node.width ?? 280);
      const nh = Number(node.style?.height ?? node.height ?? 200);
      const screen = flowToScreenPosition({ x: node.position.x + w, y: node.position.y + nh / 2 });
      lines.push({ sx: screen.x, sy: screen.y, tx: cursorX, ty: cursorY });
    }

    let snapTarget = null;
    if (isDragging && hoveredNodeId) {
      const hNode = nodes.find(n => n.id === hoveredNodeId);
      if (hNode) {
        const hh = Number(hNode.style?.height ?? hNode.height ?? 200);
        const sp = flowToScreenPosition({ x: hNode.position.x, y: hNode.position.y + hh / 2 });
        snapTarget = { x: sp.x, y: sp.y };
      }
    }

    return h('svg', { style: { position: 'fixed', inset: 0, zIndex: 999, pointerEvents: 'none', width: '100vw', height: '100vh' } },
      ...lines.map((l, i) => {
        const tx = snapTarget ? snapTarget.x : l.tx;
        const ty = snapTarget ? snapTarget.y : l.ty;
        const dx = tx - l.sx;
        const cpOffset = Math.min(Math.abs(dx) * 0.6, 150);
        const d = `M ${l.sx} ${l.sy} C ${l.sx + cpOffset} ${l.sy}, ${tx - cpOffset} ${ty}, ${tx} ${ty}`;
        return h('path', { key: i, d, fill: 'none', stroke: snapTarget ? 'rgba(59,130,246,0.5)' : 'rgba(255,255,255,0.35)', strokeWidth: 2, strokeDasharray: snapTarget ? 'none' : '6 4' });
      }),
      isDragging && snapTarget && h('circle', { cx: snapTarget.x, cy: snapTarget.y, r: 6, fill: 'rgba(59,130,246,0.8)', stroke: 'white', strokeWidth: 2 }),
      isDragging && !snapTarget && h(React.Fragment, null,
        h('circle', { cx: cursorX, cy: cursorY, r: 14, fill: 'rgba(100,100,100,0.8)', stroke: 'rgba(255,255,255,0.5)', strokeWidth: 2 }),
        h('line', { x1: cursorX - 6, y1: cursorY, x2: cursorX + 6, y2: cursorY, stroke: 'white', strokeWidth: 2, strokeLinecap: 'round' }),
        h('line', { x1: cursorX, y1: cursorY - 6, x2: cursorX, y2: cursorY + 6, stroke: 'white', strokeWidth: 2, strokeLinecap: 'round' }),
      ),
    );
  }
  const MultiDragLines = memo(MultiDragLinesComponent);

  /* ── CanvasControls ──────────────────────────────────────────────── */
  const zoomLevelSelector = s => s.transform[2];

  function CanvasControls({ showGrid, snapToGrid, showMiniMap, onToggleGrid, onToggleMiniMap, interactionMode, onToggleInteractionMode, onShowShortcuts }) {
    const { fitView, zoomTo } = useReactFlow();
    const zoom = useRFStore(zoomLevelSelector);
    const [showHelpMenu, setShowHelpMenu] = useState(false);
    const helpMenuRef = useRef(null);

    const sliderValue = Math.max(0, Math.min(100, ((zoom - CANVAS_MIN_ZOOM) / (CANVAS_MAX_ZOOM - CANVAS_MIN_ZOOM)) * 100));

    const handleSliderChange = e => {
      const pct = Number(e.target.value) / 100;
      zoomTo(CANVAS_MIN_ZOOM + pct * (CANVAS_MAX_ZOOM - CANVAS_MIN_ZOOM));
    };

    useEffect(() => {
      if (!showHelpMenu) return;
      const handler = e => { if (helpMenuRef.current && !helpMenuRef.current.contains(e.target)) setShowHelpMenu(false); };
      document.addEventListener('mousedown', handler);
      return () => document.removeEventListener('mousedown', handler);
    }, [showHelpMenu]);

    const pillBtn = (active, onClick, title, child) => h('button', {
      onClick, title,
      style: { width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer', margin: '0 1px', transition: 'background 0.15s,color 0.15s', background: active ? ACCENT : 'transparent', color: active ? '#000' : '#71717a' },
    }, child);

    return h('div', { style: { position: 'absolute', bottom: 12, left: 12, zIndex: 50, display: 'flex', flexDirection: 'column', gap: 8 } },
      showMiniMap && h('div', { style: { position: 'relative', width: 200, height: 150, borderRadius: 8, overflow: 'hidden', border: '1px solid rgba(63,63,70,0.5)' } },
        h(MiniMap, { pannable: true, zoomable: true, maskColor: 'rgba(0,0,0,0.22)', maskStrokeColor: 'rgba(255,255,255,0.8)', maskStrokeWidth: 1.5, nodeColor: 'rgba(90,90,99,0.5)', nodeStrokeColor: 'rgba(255,255,255,0.6)', nodeStrokeWidth: 1, nodeBorderRadius: 4, bgColor: 'rgba(24,24,27,0.92)' }),
      ),
      h('div', { style: { display: 'flex', alignItems: 'center', gap: 8 } },
        h('div', { style: { height: 32, padding: '0 4px', background: '#1a1a1a', display: 'flex', alignItems: 'center', borderRadius: 999 } },
          pillBtn(interactionMode === 'select', onToggleInteractionMode, interactionMode === 'select' ? '选择模式' : '平移模式', interactionMode === 'select' ? Icon('MousePointer2', 14) : Icon('Hand', 14)),
          pillBtn(showMiniMap, onToggleMiniMap, showMiniMap ? '隐藏小地图' : '显示小地图', h(MapLocateIcon, { size: 14 })),
          pillBtn(showGrid && snapToGrid, onToggleGrid, snapToGrid ? '禁用网格吸附' : '启用网格吸附', h(GridDotsIcon, { size: 14 })),
          h('button', { onClick: () => fitView({ padding: 0.2 }), title: '适应屏幕', style: { padding: '0 6px', marginRight: 4, display: 'flex', alignItems: 'center', color: '#71717a', background: 'transparent', border: 'none', cursor: 'pointer' } }, Icon('Focus', 18)),
          h('div', { style: { display: 'flex', width: 70, alignItems: 'center', paddingRight: 8 } },
            h('input', { type: 'range', min: 0, max: 100, value: sliderValue, onChange: handleSliderChange, title: Math.round(zoom * 100) + '%', style: { width: '100%', height: 6, appearance: 'none', WebkitAppearance: 'none', background: '#3f3f46', borderRadius: 999, cursor: 'pointer', outline: 'none' } }),
          ),
        ),
        h('div', { ref: helpMenuRef, style: { position: 'relative' } },
          h('button', { onClick: () => setShowHelpMenu(v => !v), title: '帮助', style: { width: 32, height: 32, borderRadius: '50%', background: '#1a1a1a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#71717a', border: 'none', cursor: 'pointer' } }, Icon('HelpCircle', 20)),
          showHelpMenu && h('div', { style: { position: 'absolute', bottom: '100%', marginBottom: 8, left: '50%', transform: 'translateX(-50%)', background: 'rgba(26,26,26,0.85)', backdropFilter: 'blur(20px)', border: '1px solid rgba(63,63,70,0.6)', borderRadius: 16, padding: 4, minWidth: 160, boxShadow: '0 16px 48px rgba(0,0,0,0.6)', zIndex: 50 } },
            h('button', { onClick: () => { setShowHelpMenu(false); onShowShortcuts && onShowShortcuts(); }, style: { width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: 12, fontSize: 14, color: '#e4e4e7', background: 'transparent', border: 'none', cursor: 'pointer', borderRadius: 8 } }, Icon('Search', 20), ' 快捷键'),
          ),
        ),
      ),
    );
  }

  /* ── Export ──────────────────────────────────────────────────────── */
  window.Cv = window.Cv || {};
  Object.assign(window.Cv, {
    CanvasTopBar,
    DockToolbar,
    ContextMenu,
    ConnectionDropMenu,
    HandleMenu,
    ShortcutsHelp,
    SelectionToolbar,
    MultiDragLines,
    CanvasControls,
    AlignmentGuides,
    CanvasSettingsModal,
    CvToastContainer,
    DetailViewModal,
  });

})();
