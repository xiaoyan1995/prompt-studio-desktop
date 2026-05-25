/* canvas-panels.js — Right-side panel tabs
   Components: RightPanel, AssetPanel, MaterialPanel, StoryboardPanel,
               SnapshotPanel, HistoryPanel
*/
(function() {
  'use strict';

  const {
    useCanvasStore, usePanelStore, useSnapshotStore, useHistoryStore,
    useToastStore, Icon, CvBtn, downloadFile,
  } = window.Cv;

  /* ── Panel shell ─────────────────────────────────────────────────── */
  function RightPanel() {
    const open = usePanelStore(s => s.rightPanelOpen);
    const tab  = usePanelStore(s => s.rightPanelTab);

    if (!open) return null;

    const TABS = [
      { id: 'asset',     label: '资产' },
      { id: 'material',  label: '素材' },
      { id: 'storyboard',label: '分镜' },
      { id: 'snapshot',  label: '快照' },
      { id: 'history',   label: '历史' },
    ];

    return React.createElement('div', { className: 'cv-panel-right' },
      React.createElement('div', { className: 'cv-panel-tabs' },
        TABS.map(t =>
          React.createElement('div', {
            key: t.id,
            className: 'cv-panel-tab' + (tab === t.id ? ' active' : ''),
            onClick: () => usePanelStore.getState().setRightPanelTab(t.id),
          }, t.label),
        ),
        React.createElement('div', { style: { flex: 1 } }),
        React.createElement('button', {
          className: 'cv-btn icon ghost', style: { margin: '4px 0', width: 24, height: 24 },
          onClick: () => usePanelStore.getState().closeRightPanel(),
        }, Icon('X', 12)),
      ),
      tab === 'asset'      && React.createElement(AssetPanel),
      tab === 'material'   && React.createElement(MaterialPanel),
      tab === 'storyboard' && React.createElement(StoryboardPanel),
      tab === 'snapshot'   && React.createElement(SnapshotPanel),
      tab === 'history'    && React.createElement(HistoryPanel),
    );
  }

  /* ── AssetPanel — lists nodes on canvas as assets ────────────────── */
  function AssetPanel() {
    const nodes = useCanvasStore(s => s.nodes);
    const store = useCanvasStore.getState;
    const [search, setSearch] = React.useState('');
    const [filter, setFilter] = React.useState('all');

    const FILTER_OPTS = [
      { v: 'all',        l: '全部' },
      { v: 'image-gen',  l: '生成图' },
      { v: 'video-gen',  l: '生成视频' },
      { v: 'source-image', l: '源图片' },
      { v: 'text',       l: '文本' },
    ];

    const filtered = nodes.filter(n => {
      const d = n.data || {};
      if (filter !== 'all' && d.nodeType !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        const label = (d.label || d.nodeType || '').toLowerCase();
        const prompt = (d.prompt || d.content || '').toLowerCase();
        return label.includes(q) || prompt.includes(q);
      }
      return true;
    });

    const focusNode = (node) => {
      window.dispatchEvent(new CustomEvent('cv:focus-node', { detail: { nodeId: node.id } }));
    };

    return React.createElement('div', { className: 'cv-panel-content' },
      React.createElement('div', { style: { display: 'flex', gap: 6, marginBottom: 8 } },
        React.createElement('input', {
          className: 'cv-input', placeholder: '搜索节点…', value: search,
          onChange: e => setSearch(e.target.value), style: { flex: 1 },
        }),
        React.createElement('select', { className: 'cv-select', value: filter, onChange: e => setFilter(e.target.value) },
          FILTER_OPTS.map(o => React.createElement('option', { key: o.v, value: o.v }, o.l)),
        ),
      ),
      filtered.length === 0
        ? React.createElement('div', { className: 'cv-asset-empty' }, nodes.length === 0 ? '画布上还没有节点\n从底部工具栏添加第一个节点' : '没有匹配的节点')
        : filtered.map(node => React.createElement(AssetNodeRow, { key: node.id, node, onFocus: focusNode, onDelete: () => store().deleteNodeById(node.id) })),
    );
  }

  function AssetNodeRow({ node, onFocus, onDelete }) {
    const d = node.data || {};
    const thumb = d.dataUrl || d.imageUrl || d.thumbnailUrl;
    const isVideo = !!d.videoUrl;
    const label = d.label || d.nodeType || 'node';
    const prompt = d.prompt || d.content || '';

    return React.createElement('div', {
      style: { display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer', alignItems: 'center' },
      onClick: () => onFocus(node),
    },
      React.createElement('div', { style: { width: 44, height: 44, borderRadius: 6, overflow: 'hidden', background: 'var(--surface-2)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
        thumb ? React.createElement('img', { src: thumb, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } })
              : isVideo ? Icon('Film', 20, 'var(--subtle)')
              : Icon(window.Cv.NODE_TYPE_CONFIGS[d.nodeType]?.icon || 'Box', 20, 'var(--subtle)'),
      ),
      React.createElement('div', { style: { flex: 1, minWidth: 0 } },
        React.createElement('div', { style: { fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, label),
        prompt && React.createElement('div', { style: { fontSize: 10, color: 'var(--subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 } }, prompt),
      ),
      React.createElement('button', {
        className: 'cv-btn icon ghost',
        style: { flexShrink: 0 },
        onClick: e => { e.stopPropagation(); onDelete(); },
      }, Icon('Trash2', 12)),
    );
  }

  /* ── MaterialPanel — saved assets from Prompt Studio library ─────── */
  function MaterialPanel() {
    const [items, setItems] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [search, setSearch] = React.useState('');
    const [tab, setTab] = React.useState('image');

    React.useEffect(() => {
      loadMaterials();
    }, [tab]);

    async function loadMaterials() {
      setLoading(true);
      try {
        // Try to load from parent PS server
        const res = await fetch('/api/assets?type=' + tab + '&limit=100');
        if (res.ok) {
          const data = await res.json();
          setItems(data.items || data || []);
        } else {
          setItems([]);
        }
      } catch(e) {
        setItems([]);
      } finally {
        setLoading(false);
      }
    }

    const filtered = items.filter(item => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (item.name || item.filename || '').toLowerCase().includes(q)
          || (item.prompt || '').toLowerCase().includes(q);
    });

    const handleDragToCanvas = (item) => {
      const url = item.url || item.dataUrl || item.src;
      if (!url) return;
      window.dispatchEvent(new CustomEvent('cv:insert-asset', { detail: {
        type: tab, url,
        label: item.name || item.filename || '素材',
        prompt: item.prompt || '',
      }}));
    };

    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
      React.createElement('div', { style: { padding: '8px 10px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6 } },
        ['image','video','audio'].map(t =>
          React.createElement('button', {
            key: t, className: 'cv-btn sm' + (tab === t ? ' primary' : ''),
            onClick: () => setTab(t),
          }, t === 'image' ? '图片' : t === 'video' ? '视频' : '音频'),
        ),
      ),
      React.createElement('div', { style: { padding: '8px 10px' } },
        React.createElement('input', { className: 'cv-input', placeholder: '搜索素材…', value: search, onChange: e => setSearch(e.target.value) }),
      ),
      React.createElement('div', { className: 'cv-panel-content' },
        loading ? React.createElement('div', { style: { textAlign: 'center', padding: 24 } }, React.createElement(window.Cv.Spinner))
        : filtered.length === 0
          ? React.createElement('div', { className: 'cv-asset-empty' }, '素材库为空\n生成图片后点击"存库"即可添加')
          : React.createElement('div', { className: 'cv-asset-grid' },
              filtered.map((item, i) => {
                const url = item.url || item.dataUrl || item.src || item.thumbnailUrl;
                const isVideo = tab === 'video';
                return React.createElement('div', {
                  key: i, className: 'cv-asset-card',
                  title: item.name || item.prompt || '素材',
                  onClick: () => handleDragToCanvas(item),
                },
                  url && !isVideo && React.createElement('img', { src: url, alt: '' }),
                  isVideo && React.createElement('div', { style: { width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' } },
                    Icon('Film', 24, 'var(--subtle)'),
                  ),
                  React.createElement('div', { className: 'cv-asset-overlay' },
                    Icon('Plus', 18, '#fff'),
                  ),
                );
              }),
            ),
      ),
    );
  }

  /* ── StoryboardPanel — shows storyboard nodes in order ──────────── */
  function StoryboardPanel() {
    const nodes = useCanvasStore(s => s.nodes.filter(n => n.data?.nodeType === 'storyboard' || n.data?.nodeType === 'image-gen' || n.data?.nodeType === 'video-gen'));
    const store = useCanvasStore.getState;

    if (nodes.length === 0) {
      return React.createElement('div', { className: 'cv-panel-content' },
        React.createElement('div', { className: 'cv-asset-empty' }, '画布上还没有生成节点\n添加「生成图像」或「分镜板」节点'),
      );
    }

    return React.createElement('div', { className: 'cv-panel-content' },
      React.createElement('div', { style: { fontSize: 11, color: 'var(--subtle)', marginBottom: 8, fontWeight: 600 } }, '按画布位置排列 · 点击定位'),
      [...nodes]
        .sort((a, b) => (a.position?.y || 0) - (b.position?.y || 0) || (a.position?.x || 0) - (b.position?.x || 0))
        .map((node, i) => {
          const d = node.data;
          const thumb = d.dataUrl || d.imageUrl || (d.images && d.images[0] && (d.images[0].dataUrl || d.images[0].url));
          return React.createElement('div', {
            key: node.id, className: 'cv-sb-row',
            onClick: () => window.dispatchEvent(new CustomEvent('cv:focus-node', { detail: { nodeId: node.id } })),
          },
            React.createElement('div', { className: 'cv-sb-thumb' },
              thumb && React.createElement('img', { src: thumb, alt: '' }),
              !thumb && d.videoUrl && Icon('Film', 18, 'var(--subtle)'),
            ),
            React.createElement('div', { className: 'cv-sb-meta' },
              React.createElement('div', { className: 'cv-sb-title' }, d.label || (i+1) + '. ' + (d.nodeType === 'image-gen' ? '生成图像' : d.nodeType === 'video-gen' ? '生成视频' : '分镜板')),
              React.createElement('div', { className: 'cv-sb-prompt' }, d.prompt || '（无提示词）'),
            ),
            React.createElement('button', {
              className: 'cv-btn icon ghost', style: { flexShrink: 0 },
              onClick: e => { e.stopPropagation(); store().deleteNodeById(node.id); },
            }, Icon('Trash2', 12)),
          );
        }),

      // Export all images
      nodes.some(n => n.data.imageUrl || n.data.dataUrl) && React.createElement('div', { style: { marginTop: 12 } },
        React.createElement(CvBtn, { className: 'sm', onClick: () => {
          nodes.forEach((n, i) => {
            const src = n.data.dataUrl || n.data.imageUrl;
            if (src) downloadFile(src, 'storyboard-' + (i+1) + '.png');
          });
        }}, Icon('Download', 12), ' 批量导出'),
      ),
    );
  }

  /* ── SnapshotPanel ───────────────────────────────────────────────── */
  function SnapshotPanel() {
    const snapshots = useSnapshotStore(s => s.snapshots);

    return React.createElement('div', { className: 'cv-panel-content' },
      React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 } },
        React.createElement('span', { style: { fontSize: 11, color: 'var(--subtle)', flex: 1 } }, snapshots.length + ' 个快照 (最多30个)'),
        React.createElement(CvBtn, { className: 'primary sm', onClick: () => { useSnapshotStore.getState().save(); useToastStore.getState().show('快照已保存', 'success'); } },
          Icon('Archive', 12), ' 新建快照',
        ),
      ),
      snapshots.length === 0
        ? React.createElement('div', { className: 'cv-asset-empty' }, '还没有快照\n点击「新建快照」保存当前状态')
        : snapshots.map(snap =>
            React.createElement('div', { key: snap.id, className: 'cv-snap-card' },
              React.createElement('div', { className: 'cv-snap-meta' },
                React.createElement('span', { className: 'cv-snap-time' },
                  Icon('Clock', 11), ' ',
                  new Date(snap.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
                ),
                React.createElement('span', { style: { fontSize: 10, color: 'var(--text)', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, snap.label),
                React.createElement(CvBtn, { className: 'sm', onClick: () => {
                  useSnapshotStore.getState().restore(snap.id);
                  useToastStore.getState().show('已恢复快照', 'success');
                }}, '恢复'),
                React.createElement('button', { className: 'cv-btn icon ghost sm', onClick: () => useSnapshotStore.getState().remove(snap.id) }, Icon('Trash2', 11)),
              ),
              snap.state && React.createElement('div', { style: { padding: '4px 8px 6px', fontSize: 10, color: 'var(--subtle)' } },
                snap.state.nodes?.length + ' 个节点  ' + (snap.state.edges?.length || 0) + ' 条连线',
              ),
            ),
          ),
    );
  }

  /* ── HistoryPanel — generation history log ───────────────────────── */
  function HistoryPanel() {
    const items = useHistoryStore(s => s.items);
    const [filter, setFilter] = React.useState('all');

    const filtered = items.filter(it => filter === 'all' || it.type === filter);

    return React.createElement('div', { style: { display: 'flex', flexDirection: 'column', height: '100%' } },
      React.createElement('div', { style: { padding: '6px 10px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 } },
        ['all','image','video','audio'].map(t =>
          React.createElement('button', { key: t, className: 'cv-btn sm' + (filter === t ? ' primary' : ''), onClick: () => setFilter(t) },
            t === 'all' ? '全部' : t === 'image' ? '图片' : t === 'video' ? '视频' : '音频',
          ),
        ),
        React.createElement('div', { style: { flex: 1 } }),
        items.length > 0 && React.createElement('button', {
          className: 'cv-btn sm danger',
          onClick: () => { useHistoryStore.getState().clear(); useToastStore.getState().show('历史已清空', 'success'); },
        }, Icon('Trash2', 11), ' 清空'),
      ),
      React.createElement('div', { className: 'cv-panel-content' },
        filtered.length === 0
          ? React.createElement('div', { className: 'cv-asset-empty' }, '暂无生成记录')
          : filtered.map(item =>
              React.createElement('div', { key: item.id, style: { display: 'flex', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)' } },
                // Thumbnail
                React.createElement('div', { style: { width: 44, height: 44, borderRadius: 6, overflow: 'hidden', background: 'var(--surface-2)', flexShrink: 0 } },
                  item.type === 'image' && item.images?.[0] && (
                    React.createElement('img', { src: item.images[0].dataUrl || item.images[0].url, alt: '', style: { width: '100%', height: '100%', objectFit: 'cover' } })
                  ),
                  item.type === 'video' && Icon('Film', 20, 'var(--subtle)'),
                  item.type === 'audio' && Icon('Music', 20, 'var(--subtle)'),
                ),
                React.createElement('div', { style: { flex: 1, minWidth: 0 } },
                  React.createElement('div', { style: { fontSize: 10, color: 'var(--subtle)', marginBottom: 2 } },
                    new Date(item.createdAt).toLocaleString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    ' · ', item.model || '未知模型',
                  ),
                  React.createElement('div', { style: { fontSize: 11, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } },
                    item.prompt || '（无提示词）',
                  ),
                ),
                item.type === 'image' && item.images?.[0] && React.createElement('button', {
                  className: 'cv-btn icon ghost',
                  onClick: () => {
                    const src = item.images[0].dataUrl || item.images[0].url;
                    downloadFile(src, 'history-' + item.id + '.png');
                  },
                }, Icon('Download', 12)),
              ),
            ),
      ),
    );
  }

  /* ── Export ──────────────────────────────────────────────────────── */
  window.Cv = window.Cv || {};
  Object.assign(window.Cv, {
    RightPanel,
    AssetPanel,
    MaterialPanel,
    StoryboardPanel,
    SnapshotPanel,
    HistoryPanel,
  });

})();
