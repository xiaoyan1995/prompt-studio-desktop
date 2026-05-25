/* canvas-store.js — Full canvas state management (Zustand-like, no build step)
   Mirrors xinyu-app/src/stores/canvas-store.ts + all mini stores.
   Exposed on window.Cv.store, window.Cv.useCanvasStore, etc.
*/
(function() {
  'use strict';

  const { applyNodeChanges, applyEdgeChanges, addEdge: rfAddEdge } = window.ReactFlow;

  /* ─────────────────────────────────────────────────────────────────────────
     Lightweight Zustand-like create()
  ───────────────────────────────────────────────────────────────────────── */
  function create(initializer) {
    let state;
    const listeners = new Set();

    const getState = () => state;
    const setState = (partial, replace) => {
      const next = typeof partial === 'function' ? partial(state) : partial;
      const nextState = replace ? next : Object.assign({}, state, next);
      if (nextState !== state) {
        const prev = state;
        state = nextState;
        listeners.forEach(l => l(state, prev));
      }
    };
    const subscribe = (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    };

    const api = { getState, setState, subscribe };
    state = initializer(setState, getState, api);

    const useStore = (selector) => {
      const sel = selector || (s => s);
      const [slice, setSlice] = React.useState(() => sel(state));
      const sliceRef = React.useRef(slice);
      sliceRef.current = slice;
      React.useLayoutEffect(() => {
        const check = (nextState) => {
          const next = sel(nextState);
          if (next !== sliceRef.current) setSlice(next);
        };
        listeners.add(check);
        check(state);
        return () => listeners.delete(check);
      }, []);
      return slice;
    };
    useStore.getState  = getState;
    useStore.setState  = setState;
    useStore.subscribe = subscribe;
    return useStore;
  }

  /* ─────────────────────────────────────────────────────────────────────────
     Node type configs (sizes, labels, icons)
  ───────────────────────────────────────────────────────────────────────── */
  const NODE_W  = 300;
  const NODE_H  = 240;
  const NODE_SHORT = 280;
  const NODE_MAX   = 560;
  const NODE_MIN   = 140;

  const NODE_TYPE_CONFIGS = {
    'text':         { label: '文本',   defaultW: NODE_SHORT, defaultH: 180, icon: 'AlignLeft' },
    'prompt':       { label: '提示词', defaultW: NODE_SHORT, defaultH: 200, icon: 'FileText' },
    'source-image': { label: '源图片', defaultW: NODE_W,     defaultH: NODE_H, icon: 'Image' },
    'source-audio': { label: '源音频', defaultW: NODE_SHORT, defaultH: 160, icon: 'Music' },
    'image-gen':    { label: '生成图', defaultW: NODE_W,     defaultH: NODE_H + 80, icon: 'ImagePlus' },
    'video-gen':    { label: '生成视频', defaultW: NODE_MAX,  defaultH: NODE_H + 120, icon: 'Video' },
    'note':         { label: '便签',   defaultW: NODE_SHORT, defaultH: 160, icon: 'StickyNote' },
    'upscale':      { label: '超分辨', defaultW: NODE_W,     defaultH: NODE_H, icon: 'Expand' },
    'video-upscale':{ label: '视频超分', defaultW: NODE_W,   defaultH: NODE_H + 40, icon: 'Expand' },
    'rembg':        { label: '去背景', defaultW: NODE_W,     defaultH: NODE_H, icon: 'Scissors' },
    'audio-gen':    { label: '生成音频', defaultW: NODE_SHORT, defaultH: 200, icon: 'Music' },
    'storyboard':   { label: '分镜',   defaultW: NODE_MAX,   defaultH: NODE_H + 80, icon: 'Clapperboard' },
    'group':        { label: '分组',   defaultW: 400,        defaultH: 300, icon: 'Group' },
    'comment':      { label: '评论',   defaultW: 180,        defaultH: 80,  icon: 'MessageCircle' },
  };

  function isConnectionAllowed(sourceType, targetType) {
    const rules = {
      'text':         ['image-gen', 'video-gen', 'prompt', 'audio-gen'],
      'prompt':       ['image-gen', 'video-gen', 'audio-gen'],
      'source-image': ['image-gen', 'video-gen', 'upscale', 'rembg'],
      'source-audio': ['video-gen', 'audio-gen'],
      'image-gen':    ['image-gen', 'video-gen', 'upscale', 'rembg', 'storyboard'],
      'video-gen':    ['video-gen', 'video-upscale', 'storyboard'],
      'upscale':      ['image-gen', 'storyboard'],
      'video-upscale':['storyboard'],
      'rembg':        ['image-gen', 'storyboard'],
      'audio-gen':    ['video-gen', 'storyboard'],
      'storyboard':   [],
      'note':         [],
      'comment':      [],
      'group':        [],
    };
    const allowed = rules[sourceType] || [];
    return allowed.includes(targetType);
  }

  /* ─────────────────────────────────────────────────────────────────────────
     Serialization helpers
  ───────────────────────────────────────────────────────────────────────── */
  function toReactFlowNode(n) {
    return {
      id:       n.id,
      type:     n.nodeType === 'group' ? 'group' : (n.nodeType === 'comment' ? 'comment' : 'default'),
      position: { x: n.x, y: n.y },
      data:     Object.assign({}, n),
      width:    n.width || NODE_TYPE_CONFIGS[n.nodeType]?.defaultW || NODE_W,
      height:   n.height || NODE_TYPE_CONFIGS[n.nodeType]?.defaultH || NODE_H,
      selected: false,
    };
  }

  function toSerializedNode(rfNode) {
    return Object.assign({}, rfNode.data, {
      x: rfNode.position.x,
      y: rfNode.position.y,
      width:  rfNode.width  || rfNode.measured?.width,
      height: rfNode.height || rfNode.measured?.height,
      selected: false,
    });
  }

  function toReactFlowEdge(e) {
    return { id: e.id, source: e.source, target: e.target, type: 'animated', data: e };
  }

  function toSerializedEdge(rfEdge) {
    return Object.assign({}, rfEdge.data, { id: rfEdge.id, source: rfEdge.source, target: rfEdge.target });
  }

  /* ─────────────────────────────────────────────────────────────────────────
     ID generator
  ───────────────────────────────────────────────────────────────────────── */
  function nanoid(len) {
    len = len || 12;
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let r = '';
    for (let i = 0; i < len; i++) r += chars[Math.floor(Math.random() * chars.length)];
    return r;
  }

  const UNDO_STACK_LIMIT = 50;

  /* ─────────────────────────────────────────────────────────────────────────
     Main canvas store
  ───────────────────────────────────────────────────────────────────────── */
  const useCanvasStore = create((set, get) => ({
    projectId: null,
    projectName: '未命名画布',
    nodes: [],
    edges: [],
    _nodeMap: new Map(),
    _edgesByTarget: new Map(),
    isDirty: false,
    _mutationVersion: 0,
    clipboard: null,
    lastSettings: {},

    _undoStack: [],
    _redoStack: [],

    _dragStartPositions: null,

    focusEditState: { active: false, sourceNodeId: null },

    hasSelectedTextNode: false,
    selectedNodeIds: new Set(),
    lastSavedSnapshot: null,

    /* ── Project ── */
    setProjectId(id) { set({ projectId: id }); },
    setProjectName(name) { set({ projectName: name }); },

    /* ── Undo / Redo ── */
    pushCommand(cmd) {
      set(state => {
        const stack = [...state._undoStack, cmd];
        return {
          _undoStack: stack.slice(-UNDO_STACK_LIMIT),
          _redoStack: [],
        };
      });
    },
    undo() {
      const { _undoStack, _redoStack } = get();
      if (!_undoStack.length) return;
      const cmd = _undoStack[_undoStack.length - 1];
      const { nodes, edges } = cmd.before;
      set({
        nodes,
        edges,
        _nodeMap: new Map(nodes.map(n => [n.id, n])),
        _edgesByTarget: buildEdgesByTarget(edges),
        _undoStack: _undoStack.slice(0, -1),
        _redoStack: [..._redoStack, cmd],
        isDirty: true,
        _mutationVersion: get()._mutationVersion + 1,
      });
    },
    redo() {
      const { _undoStack, _redoStack } = get();
      if (!_redoStack.length) return;
      const cmd = _redoStack[_redoStack.length - 1];
      const { nodes, edges } = cmd.after;
      set({
        nodes,
        edges,
        _nodeMap: new Map(nodes.map(n => [n.id, n])),
        _edgesByTarget: buildEdgesByTarget(edges),
        _undoStack: [..._undoStack, cmd],
        _redoStack: _redoStack.slice(0, -1),
        isDirty: true,
        _mutationVersion: get()._mutationVersion + 1,
      });
    },
    canUndo() { return get()._undoStack.length > 0; },
    canRedo() { return get()._redoStack.length > 0; },

    /* ── Drag positions ── */
    captureDragStart(nodeIds) {
      const { _nodeMap } = get();
      const map = new Map();
      for (const id of nodeIds) {
        const n = _nodeMap.get(id);
        if (n) map.set(id, { x: n.position.x, y: n.position.y });
      }
      set({ _dragStartPositions: map });
    },
    commitDragEnd() {
      const { _dragStartPositions, nodes, edges } = get();
      if (!_dragStartPositions || !_dragStartPositions.size) return;
      const beforeNodes = nodes.map(n => {
        const startPos = _dragStartPositions.get(n.id);
        if (!startPos) return n;
        return Object.assign({}, n, { position: startPos });
      });
      _pushUndoCmd(get, set, { nodes: beforeNodes, edges }, { nodes, edges });
      set({ _dragStartPositions: null });
    },

    /* ── Focus edit ── */
    enterFocusEdit(sourceNodeId) { set({ focusEditState: { active: true, sourceNodeId } }); },
    exitFocusEdit()               { set({ focusEditState: { active: false, sourceNodeId: null } }); },

    /* ── ReactFlow handlers ── */
    onNodesChange(changes) {
      set(state => {
        const nodes = applyNodeChanges(changes, state.nodes);
        const hasSelectedTextNode = nodes.some(n => n.selected && ['text','prompt','note'].includes(n.data?.nodeType));
        const selectedNodeIds = new Set(nodes.filter(n => n.selected).map(n => n.id));
        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        return { nodes, _nodeMap: nodeMap, hasSelectedTextNode, selectedNodeIds };
      });
    },
    onEdgesChange(changes) {
      set(state => {
        const edges = applyEdgeChanges(changes, state.edges);
        return { edges, _edgesByTarget: buildEdgesByTarget(edges) };
      });
    },
    onConnect(connection) {
      const { nodes, edges } = get();
      const newEdge = Object.assign({}, connection, { id: 'e-' + nanoid(), type: 'animated' });
      const next = rfAddEdge(newEdge, edges);
      _pushUndoCmd(get, set, { nodes, edges }, { nodes, edges: next });
      set(state => {
        const edges = rfAddEdge(newEdge, state.edges);
        return { edges, _edgesByTarget: buildEdgesByTarget(edges), isDirty: true, _mutationVersion: state._mutationVersion + 1 };
      });
    },

    /* ── Node CRUD ── */
    addNode(type, x, y) {
      get().addNodeWithData(type, x, y, {});
    },
    addNodeWithData(type, x, y, data, size) {
      const cfg = NODE_TYPE_CONFIGS[type] || {};
      const id = 'n-' + nanoid();
      const w = size?.w || cfg.defaultW || NODE_W;
      const h = size?.h || cfg.defaultH || NODE_H;
      const nodeData = Object.assign({ nodeType: type, id }, data);
      const rfNode = {
        id,
        type: type === 'group' ? 'group' : type === 'comment' ? 'comment' : 'default',
        position: { x, y },
        data: nodeData,
        width: w,
        height: h,
        selected: false,
      };
      const { nodes, edges } = get();
      const next = [...nodes, rfNode];
      _pushUndoCmd(get, set, { nodes, edges }, { nodes: next, edges });
      set(state => {
        const nodes = [...state.nodes, rfNode];
        return { nodes, _nodeMap: new Map(nodes.map(n => [n.id, n])), isDirty: true, _mutationVersion: state._mutationVersion + 1 };
      });
      return id;
    },
    addEdgeById(sourceId, targetId) {
      const { nodes, edges } = get();
      const id = 'e-' + nanoid();
      const newEdge = { id, source: sourceId, target: targetId, type: 'animated' };
      const next = rfAddEdge(newEdge, edges);
      _pushUndoCmd(get, set, { nodes, edges }, { nodes, edges: next });
      set(state => {
        const edges = rfAddEdge(newEdge, state.edges);
        return { edges, _edgesByTarget: buildEdgesByTarget(edges), isDirty: true, _mutationVersion: state._mutationVersion + 1 };
      });
    },
    updateNodeData(id, data) {
      set(state => {
        const nodes = state.nodes.map(n =>
          n.id === id ? Object.assign({}, n, { data: Object.assign({}, n.data, data) }) : n
        );
        return { nodes, _nodeMap: new Map(nodes.map(n => [n.id, n])), isDirty: true };
      });
    },
    updateNodeSize(id, width, height) {
      set(state => {
        const nodes = state.nodes.map(n =>
          n.id === id ? Object.assign({}, n, { width, height }) : n
        );
        return { nodes, _nodeMap: new Map(nodes.map(n => [n.id, n])), isDirty: true };
      });
    },
    deleteSelected() {
      const { nodes, edges } = get();
      const selectedIds = new Set(nodes.filter(n => n.selected).map(n => n.id));
      if (!selectedIds.size) return;
      const nextNodes = nodes.filter(n => !selectedIds.has(n.id));
      const nextEdges = edges.filter(e => !selectedIds.has(e.source) && !selectedIds.has(e.target));
      _pushUndoCmd(get, set, { nodes, edges }, { nodes: nextNodes, edges: nextEdges });
      set({ nodes: nextNodes, edges: nextEdges, _nodeMap: new Map(nextNodes.map(n=>[n.id,n])), _edgesByTarget: buildEdgesByTarget(nextEdges), isDirty: true, _mutationVersion: get()._mutationVersion + 1 });
    },
    deleteNodeById(nodeId) {
      const { nodes, edges } = get();
      const nextNodes = nodes.filter(n => n.id !== nodeId);
      const nextEdges = edges.filter(e => e.source !== nodeId && e.target !== nodeId);
      _pushUndoCmd(get, set, { nodes, edges }, { nodes: nextNodes, edges: nextEdges });
      set({ nodes: nextNodes, edges: nextEdges, _nodeMap: new Map(nextNodes.map(n=>[n.id,n])), _edgesByTarget: buildEdgesByTarget(nextEdges), isDirty: true, _mutationVersion: get()._mutationVersion + 1 });
    },
    deleteEdgeById(edgeId) {
      const { nodes, edges } = get();
      const nextEdges = edges.filter(e => e.id !== edgeId);
      _pushUndoCmd(get, set, { nodes, edges }, { nodes, edges: nextEdges });
      set({ edges: nextEdges, _edgesByTarget: buildEdgesByTarget(nextEdges), isDirty: true });
    },
    selectAll() {
      set(state => ({
        nodes: state.nodes.map(n => Object.assign({}, n, { selected: true })),
      }));
    },
    copySelected() {
      const { nodes, edges } = get();
      const selected = nodes.filter(n => n.selected);
      if (!selected.length) return;
      const selectedIds = new Set(selected.map(n => n.id));
      const externalEdges = edges.filter(e => selectedIds.has(e.source) !== selectedIds.has(e.target));
      const internalEdges = edges.filter(e => selectedIds.has(e.source) && selectedIds.has(e.target));
      set({ clipboard: { nodes: selected, edges: internalEdges, externalEdges } });
    },
    pasteClipboard() {
      const { clipboard, nodes, edges } = get();
      if (!clipboard || !clipboard.nodes.length) return;
      const idMap = new Map();
      clipboard.nodes.forEach(n => idMap.set(n.id, 'n-' + nanoid()));
      const offsetX = 40, offsetY = 40;
      const newNodes = clipboard.nodes.map(n => {
        const newId = idMap.get(n.id);
        return Object.assign({}, n, {
          id: newId,
          data: Object.assign({}, n.data, { id: newId, nodeType: n.data.nodeType }),
          position: { x: n.position.x + offsetX, y: n.position.y + offsetY },
          selected: true,
        });
      });
      const newEdges = clipboard.edges.map(e => ({
        id: 'e-' + nanoid(), source: idMap.get(e.source) || e.source,
        target: idMap.get(e.target) || e.target, type: 'animated',
      }));
      const deselectedNodes = nodes.map(n => Object.assign({}, n, { selected: false }));
      const nextNodes = [...deselectedNodes, ...newNodes];
      const nextEdges = [...edges, ...newEdges];
      _pushUndoCmd(get, set, { nodes, edges }, { nodes: nextNodes, edges: nextEdges });
      set({ nodes: nextNodes, edges: nextEdges, _nodeMap: new Map(nextNodes.map(n=>[n.id,n])), _edgesByTarget: buildEdgesByTarget(nextEdges), isDirty: true, _mutationVersion: get()._mutationVersion + 1 });
    },
    duplicateSelected() {
      get().copySelected();
      get().pasteClipboard();
    },

    /* ── Group ── */
    groupSelected() {
      const { nodes, edges } = get();
      const selected = nodes.filter(n => n.selected && n.data?.nodeType !== 'group');
      if (selected.length < 2) return;
      const minX = Math.min(...selected.map(n => n.position.x)) - 24;
      const minY = Math.min(...selected.map(n => n.position.y)) - 40;
      const maxX = Math.max(...selected.map(n => n.position.x + (n.width || 300))) + 24;
      const maxY = Math.max(...selected.map(n => n.position.y + (n.height || 240))) + 24;
      const groupId = 'n-' + nanoid();
      const groupNode = {
        id: groupId, type: 'group',
        position: { x: minX, y: minY },
        data: { id: groupId, nodeType: 'group', label: '分组' },
        width: maxX - minX, height: maxY - minY,
        selected: false,
      };
      const movedNodes = selected.map(n => Object.assign({}, n, {
        parentId: groupId,
        position: { x: n.position.x - minX, y: n.position.y - minY },
        selected: false,
      }));
      const otherNodes = nodes.filter(n => !n.selected || n.data?.nodeType === 'group').map(n => Object.assign({}, n, { selected: false }));
      const nextNodes = [groupNode, ...otherNodes, ...movedNodes];
      _pushUndoCmd(get, set, { nodes, edges }, { nodes: nextNodes, edges });
      set({ nodes: nextNodes, _nodeMap: new Map(nextNodes.map(n=>[n.id,n])), isDirty: true, _mutationVersion: get()._mutationVersion + 1 });
    },
    ungroupNode(groupId) {
      const { nodes, edges } = get();
      const group = nodes.find(n => n.id === groupId);
      if (!group) return;
      const children = nodes.filter(n => n.parentId === groupId);
      const ungrouped = children.map(n => Object.assign({}, n, {
        parentId: undefined,
        position: { x: n.position.x + group.position.x, y: n.position.y + group.position.y },
      }));
      const nextNodes = nodes.filter(n => n.id !== groupId && n.parentId !== groupId).concat(ungrouped);
      _pushUndoCmd(get, set, { nodes, edges }, { nodes: nextNodes, edges });
      set({ nodes: nextNodes, _nodeMap: new Map(nextNodes.map(n=>[n.id,n])), isDirty: true, _mutationVersion: get()._mutationVersion + 1 });
    },
    deleteGroup(groupId) {
      const { nodes, edges } = get();
      const toDelete = new Set([groupId, ...nodes.filter(n => n.parentId === groupId).map(n => n.id)]);
      const nextNodes = nodes.filter(n => !toDelete.has(n.id));
      const nextEdges = edges.filter(e => !toDelete.has(e.source) && !toDelete.has(e.target));
      _pushUndoCmd(get, set, { nodes, edges }, { nodes: nextNodes, edges: nextEdges });
      set({ nodes: nextNodes, edges: nextEdges, _nodeMap: new Map(nextNodes.map(n=>[n.id,n])), _edgesByTarget: buildEdgesByTarget(nextEdges), isDirty: true, _mutationVersion: get()._mutationVersion + 1 });
    },

    /* ── Align ── */
    alignSelected(direction) {
      const { nodes, edges } = get();
      const selected = nodes.filter(n => n.selected);
      if (selected.length < 2) return;
      const updated = nodes.map(n => {
        if (!n.selected) return n;
        let pos = Object.assign({}, n.position);
        const w = n.width || 300, h = n.height || 240;
        switch(direction) {
          case 'left':     pos.x = Math.min(...selected.map(s => s.position.x)); break;
          case 'right':    pos.x = Math.max(...selected.map(s => s.position.x + (s.width||300))) - w; break;
          case 'center-h': pos.x = (Math.min(...selected.map(s=>s.position.x)) + Math.max(...selected.map(s=>s.position.x+(s.width||300)))) / 2 - w / 2; break;
          case 'top':      pos.y = Math.min(...selected.map(s => s.position.y)); break;
          case 'bottom':   pos.y = Math.max(...selected.map(s => s.position.y + (s.height||240))) - h; break;
          case 'center-v': pos.y = (Math.min(...selected.map(s=>s.position.y)) + Math.max(...selected.map(s=>s.position.y+(s.height||240)))) / 2 - h / 2; break;
        }
        return Object.assign({}, n, { position: pos });
      });
      _pushUndoCmd(get, set, { nodes, edges }, { nodes: updated, edges });
      set({ nodes: updated, _nodeMap: new Map(updated.map(n=>[n.id,n])), isDirty: true });
    },
    distributeSelected(axis) {
      const { nodes, edges } = get();
      const selected = nodes.filter(n => n.selected).sort((a,b) => axis === 'horizontal' ? a.position.x - b.position.x : a.position.y - b.position.y);
      if (selected.length < 3) return;
      const first = selected[0], last = selected[selected.length - 1];
      const firstW = first.width || 280, lastW = last.width || 280;
      const firstH = first.height || 200, lastH = last.height || 200;
      const totalSpan = axis === 'horizontal'
        ? (last.position.x + lastW) - first.position.x
        : (last.position.y + lastH) - first.position.y;
      const totalNodeSize = selected.reduce((s,n) => s + (axis === 'horizontal' ? (n.width||280) : (n.height||200)), 0);
      const gap = (totalSpan - totalNodeSize) / (selected.length - 1);
      let cursor = axis === 'horizontal' ? first.position.x + firstW + gap : first.position.y + firstH + gap;
      const updated = nodes.map(n => {
        if (!n.selected) return n;
        const idx = selected.indexOf(n);
        if (idx === 0 || idx === selected.length - 1) return n;
        const pos = axis === 'horizontal' ? { x: cursor, y: n.position.y } : { x: n.position.x, y: cursor };
        cursor += (axis === 'horizontal' ? (n.width||280) : (n.height||200)) + gap;
        return Object.assign({}, n, { position: pos });
      });
      _pushUndoCmd(get, set, { nodes, edges }, { nodes: updated, edges });
      set({ nodes: updated, _nodeMap: new Map(updated.map(n=>[n.id,n])), isDirty: true });
    },
    layoutGroupHorizontal(groupId) {
      const { nodes, edges } = get();
      const children = nodes.filter(n => n.parentId === groupId);
      if (children.length === 0) return;
      const GAP = 24;
      let x = 24;
      const updated = nodes.map(n => {
        if (n.parentId !== groupId) return n;
        const idx = children.indexOf(n);
        const sorted = [...children].sort((a,b) => a.position.x - b.position.x);
        const si = sorted.indexOf(n);
        let cx = 24;
        for (let i = 0; i < si; i++) cx += (sorted[i].width || 280) + GAP;
        return Object.assign({}, n, { position: { x: cx, y: 40 } });
      });
      _pushUndoCmd(get, set, { nodes, edges }, { nodes: updated, edges });
      set({ nodes: updated, _nodeMap: new Map(updated.map(n=>[n.id,n])), isDirty: true });
    },
    layoutGroupGrid(groupId) {
      const { nodes, edges } = get();
      const children = nodes.filter(n => n.parentId === groupId);
      if (children.length === 0) return;
      const cols = Math.ceil(Math.sqrt(children.length));
      const GAP = 24;
      const sorted = [...children].sort((a,b) => a.position.x - b.position.x || a.position.y - b.position.y);
      const updated = nodes.map(n => {
        if (n.parentId !== groupId) return n;
        const idx = sorted.indexOf(n);
        const col = idx % cols, row = Math.floor(idx / cols);
        let cx = 24, cy = 40;
        for (let c = 0; c < col; c++) cx += (sorted[c]?.width || 280) + GAP;
        for (let r = 0; r < row; r++) cy += (sorted[r * cols]?.height || 200) + GAP;
        return Object.assign({}, n, { position: { x: col * (280 + GAP) + 24, y: row * (200 + GAP) + 40 } });
      });
      _pushUndoCmd(get, set, { nodes, edges }, { nodes: updated, edges });
      set({ nodes: updated, _nodeMap: new Map(updated.map(n=>[n.id,n])), isDirty: true });
    },

    /* ── Serialization ── */
    markClean(savedAtVersion) {
      set({ isDirty: false });
    },
    getSerializableState(viewport) {
      const { nodes, edges, projectId, projectName } = get();
      return {
        version: 1,
        projectId,
        projectName,
        viewport: viewport || { x: 0, y: 0, zoom: 1 },
        nodes: nodes.map(n => ({
          id: n.id, nodeType: n.data?.nodeType, x: n.position.x, y: n.position.y,
          width: n.width || n.measured?.width, height: n.height || n.measured?.height,
          parentId: n.parentId,
          ...n.data,
        })),
        edges: edges.map(e => ({ id: e.id, source: e.source, target: e.target })),
      };
    },
    loadFromSerialized(data) {
      if (!data) return;
      const nodes = (data.nodes || []).map(n => {
        const nodeType = n.nodeType || 'text';
        const cfg = NODE_TYPE_CONFIGS[nodeType] || {};
        return {
          id: n.id,
          type: nodeType === 'group' ? 'group' : nodeType === 'comment' ? 'comment' : 'default',
          position: { x: n.x || 0, y: n.y || 0 },
          data: Object.assign({}, n, { nodeType }),
          width:  n.width  || cfg.defaultW || NODE_W,
          height: n.height || cfg.defaultH || NODE_H,
          selected: false,
          parentId: n.parentId,
        };
      });
      const edges = (data.edges || []).map(e => ({
        id: e.id, source: e.source, target: e.target, type: 'animated', data: e,
      }));
      set({
        projectId: data.projectId || null,
        projectName: data.projectName || '未命名画布',
        nodes,
        edges,
        _nodeMap: new Map(nodes.map(n => [n.id, n])),
        _edgesByTarget: buildEdgesByTarget(edges),
        isDirty: false,
        _mutationVersion: 0,
        _undoStack: [],
        _redoStack: [],
      });
    },
    setLastSavedSnapshot(snapshot) { set({ lastSavedSnapshot: snapshot }); },

    /* ── Last node settings (per type) ── */
    saveLastSettings(nodeType, settings) {
      set(state => ({ lastSettings: Object.assign({}, state.lastSettings, { [nodeType]: settings }) }));
    },
    getLastSettings(nodeType) { return get().lastSettings[nodeType] || null; },
  }));

  /* ─────────────────────────────────────────────────────────────────────────
     Helpers
  ───────────────────────────────────────────────────────────────────────── */
  function buildEdgesByTarget(edges) {
    const map = new Map();
    for (const e of edges) {
      const arr = map.get(e.target) || [];
      arr.push(e);
      map.set(e.target, arr);
    }
    return map;
  }

  function _pushUndoCmd(get, set, before, after) {
    set(state => ({
      _undoStack: [...state._undoStack, { before, after }].slice(-UNDO_STACK_LIMIT),
      _redoStack: [],
    }));
  }

  /* ─────────────────────────────────────────────────────────────────────────
     Edge hover store
  ───────────────────────────────────────────────────────────────────────── */
  const useEdgeHoverStore = create((set) => ({
    edgeId: null,
    x: 0,
    y: 0,
    scissorVisible: false,
    setHover(id, x, y) { set({ edgeId: id, x, y, scissorVisible: false }); },
    updatePos(x, y)    { set({ x, y }); },
    showScissor()      { set({ scissorVisible: true }); },
    clear()            { set({ edgeId: null, scissorVisible: false }); },
  }));

  /* ─────────────────────────────────────────────────────────────────────────
     Handle proximity store
  ───────────────────────────────────────────────────────────────────────── */
  const useHandleProximityStore = create((set) => ({
    nearNodeId: null,
    setNear(id) { set({ nearNodeId: id }); },
  }));

  /* ─────────────────────────────────────────────────────────────────────────
     Canvas drag store
  ───────────────────────────────────────────────────────────────────────── */
  const useCanvasDragStore = create((set) => ({
    isViewportMoving: false,
    isNodeDragging:   false,
    setViewportMoving(v) { set({ isViewportMoving: v }); },
    setNodeDragging(v)   { set({ isNodeDragging: v }); },
  }));

  /* ─────────────────────────────────────────────────────────────────────────
     Connection drag store
  ───────────────────────────────────────────────────────────────────────── */
  const useConnectionDragStore = create((set) => ({
    sourceNodeType: null,
    setSourceNodeType(t) { set({ sourceNodeType: t }); },
  }));

  /* ─────────────────────────────────────────────────────────────────────────
     Comment mode store
  ───────────────────────────────────────────────────────────────────────── */
  const useCommentModeStore = create((set) => ({
    active: false,
    enter() { set({ active: true }); },
    exit()  { set({ active: false }); },
  }));

  /* ─────────────────────────────────────────────────────────────────────────
     Generation store  (tracks running jobs per node)
  ───────────────────────────────────────────────────────────────────────── */
  const useGenerationStore = create((set, get) => ({
    jobs: {},     // { [nodeId]: { status: 'running'|'done'|'error', progress: 0-100, error: null, abortController: null } }

    startJob(nodeId, abortController) {
      set(state => ({
        jobs: Object.assign({}, state.jobs, { [nodeId]: { status: 'running', progress: 0, error: null, abortController } }),
      }));
    },
    setProgress(nodeId, progress) {
      set(state => {
        const job = state.jobs[nodeId];
        if (!job || job.status !== 'running') return state;
        return { jobs: Object.assign({}, state.jobs, { [nodeId]: Object.assign({}, job, { progress }) }) };
      });
    },
    finishJob(nodeId) {
      set(state => {
        const jobs = Object.assign({}, state.jobs);
        delete jobs[nodeId];
        return { jobs };
      });
    },
    failJob(nodeId, error) {
      set(state => {
        const job = state.jobs[nodeId];
        return { jobs: Object.assign({}, state.jobs, { [nodeId]: Object.assign({}, job, { status: 'error', error }) }) };
      });
    },
    cancelJob(nodeId) {
      const { jobs } = get();
      const job = jobs[nodeId];
      if (job?.abortController) { try { job.abortController.abort(); } catch(e){} }
      set(state => {
        const jobs = Object.assign({}, state.jobs);
        delete jobs[nodeId];
        return { jobs };
      });
    },
    isRunning(nodeId) { return get().jobs[nodeId]?.status === 'running'; },
    getJob(nodeId) { return get().jobs[nodeId] || null; },
  }));

  /* ─────────────────────────────────────────────────────────────────────────
     Canvas config store  (API settings, persistent via localStorage)
  ───────────────────────────────────────────────────────────────────────── */
  const CONFIG_KEY = 'ps_canvas_config';

  const defaultCanvasConfig = {
    baseUrl:     '',
    apiKey:      '',
    imageModel:  '',
    textModel:   '',
    videoModel:  '',
    models:      [],
    quality:     'auto',
    size:        '1:1',
    count:       '1',
    systemPrompt: '',
    snapToGrid:  false,
    showGrid:    true,
    styleLite:   false,
  };

  function loadPersistedConfig() {
    try {
      const raw = localStorage.getItem(CONFIG_KEY);
      if (raw) return Object.assign({}, defaultCanvasConfig, JSON.parse(raw));
    } catch(e) {}
    return Object.assign({}, defaultCanvasConfig);
  }

  const useCanvasConfigStore = create((set, get) => ({
    config: loadPersistedConfig(),
    isConfigOpen: false,

    updateConfig(key, value) {
      set(state => {
        const config = Object.assign({}, state.config, { [key]: value });
        try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch(e) {}
        return { config };
      });
    },
    patchConfig(patch) {
      set(state => {
        const config = Object.assign({}, state.config, patch);
        try { localStorage.setItem(CONFIG_KEY, JSON.stringify(config)); } catch(e) {}
        return { config };
      });
    },
    openConfig()  { set({ isConfigOpen: true }); },
    closeConfig() { set({ isConfigOpen: false }); },

    isReady() {
      const { config } = get();
      return !!(config.baseUrl && config.apiKey && config.imageModel);
    },
  }));

  /* ─────────────────────────────────────────────────────────────────────────
     Toast store
  ───────────────────────────────────────────────────────────────────────── */
  const useToastStore = create((set, get) => ({
    toasts: [],
    show(message, type, duration) {
      const id = nanoid(6);
      type = type || 'info';
      duration = duration || 3000;
      set(state => ({ toasts: [...state.toasts, { id, message, type }] }));
      setTimeout(() => {
        set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }));
      }, duration);
    },
    remove(id) {
      set(state => ({ toasts: state.toasts.filter(t => t.id !== id) }));
    },
  }));

  /* ─────────────────────────────────────────────────────────────────────────
     Panel / UI state store
  ───────────────────────────────────────────────────────────────────────── */
  const usePanelStore = create((set) => ({
    rightPanelTab: 'asset',   // 'asset' | 'material' | 'storyboard' | 'history' | 'snapshot'
    rightPanelOpen: false,
    contextMenu: null,        // { x, y, type: 'node'|'canvas'|'edge', nodeId }
    connectionDropMenu: null, // { x, y, sourceNodeId }
    handleMenu: null,         // { x, y, nodeId, side }
    detailView: null,         // { imageUrl, videoUrl, nodeId, data }
    shortcutsOpen: false,
    settingsOpen: false,

    setRightPanelTab(tab) { set({ rightPanelTab: tab, rightPanelOpen: true }); },
    toggleRightPanel()    { set(state => ({ rightPanelOpen: !state.rightPanelOpen })); },
    openRightPanel(tab)   { set({ rightPanelOpen: true, ...(tab ? { rightPanelTab: tab } : {}) }); },
    closeRightPanel()     { set({ rightPanelOpen: false }); },

    openContextMenu(x, y, type, nodeId) { set({ contextMenu: { x, y, type, nodeId } }); },
    closeContextMenu()    { set({ contextMenu: null }); },

    openConnectionDrop(x, y, sourceNodeId) { set({ connectionDropMenu: { x, y, sourceNodeId } }); },
    closeConnectionDrop() { set({ connectionDropMenu: null }); },

    openHandleMenu(x, y, nodeId, side) { set({ handleMenu: { x, y, nodeId, side } }); },
    closeHandleMenu() { set({ handleMenu: null }); },

    openDetailView(payload) { set({ detailView: payload }); },
    closeDetailView() { set({ detailView: null }); },

    openShortcuts()  { set({ shortcutsOpen: true }); },
    closeShortcuts() { set({ shortcutsOpen: false }); },
    openSettings()   { set({ settingsOpen: true }); },
    closeSettings()  { set({ settingsOpen: false }); },
  }));

  /* ─────────────────────────────────────────────────────────────────────────
     Snapshot store  (canvas versions)
  ───────────────────────────────────────────────────────────────────────── */
  const SNAPSHOTS_KEY = 'ps_canvas_snapshots';
  function loadSnapshots() {
    try { return JSON.parse(localStorage.getItem(SNAPSHOTS_KEY) || '[]'); } catch(e) { return []; }
  }

  const useSnapshotStore = create((set, get) => ({
    snapshots: loadSnapshots(),

    save(label) {
      const state = useCanvasStore.getState().getSerializableState();
      const snap = { id: nanoid(), label: label || new Date().toLocaleString('zh-CN'), createdAt: Date.now(), state };
      set(s => {
        const snapshots = [snap, ...s.snapshots].slice(0, 30);
        try { localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots)); } catch(e) {}
        return { snapshots };
      });
    },
    restore(id) {
      const snap = get().snapshots.find(s => s.id === id);
      if (snap) useCanvasStore.getState().loadFromSerialized(snap.state);
    },
    remove(id) {
      set(s => {
        const snapshots = s.snapshots.filter(x => x.id !== id);
        try { localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots)); } catch(e) {}
        return { snapshots };
      });
    },
  }));

  /* ─────────────────────────────────────────────────────────────────────────
     Generation history store
  ───────────────────────────────────────────────────────────────────────── */
  const HISTORY_KEY = 'ps_canvas_history';
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]'); } catch(e) { return []; }
  }

  const useHistoryStore = create((set) => ({
    items: loadHistory(),

    add(item) {
      set(state => {
        const items = [Object.assign({ id: nanoid(), createdAt: Date.now() }, item), ...state.items].slice(0, 200);
        try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); } catch(e) {}
        return { items };
      });
    },
    clear() {
      set({ items: [] });
      try { localStorage.removeItem(HISTORY_KEY); } catch(e) {}
    },
  }));

  /* ─────────────────────────────────────────────────────────────────────────
     Multi-drag store (for SelectionToolbar + handle)
  ───────────────────────────────────────────────────────────────────────── */
  const useMultiDragStore = create((set) => ({
    isDragging: false,
    isPinned: false,
    sourceNodeIds: [],
    cursorX: 0,
    cursorY: 0,
    hoveredNodeId: null,
    startDrag: (nodeIds, x, y) => set({ isDragging: true, isPinned: false, sourceNodeIds: nodeIds, cursorX: x, cursorY: y, hoveredNodeId: null }),
    updateCursor: (x, y) => set({ cursorX: x, cursorY: y }),
    setHoveredNode: (nodeId) => set({ hoveredNodeId: nodeId }),
    pinDrag: () => set({ isDragging: false, isPinned: true }),
    endDrag: () => set({ isDragging: false, isPinned: false, sourceNodeIds: [], cursorX: 0, cursorY: 0, hoveredNodeId: null }),
  }));

  /* ─────────────────────────────────────────────────────────────────────────
     Export
  ───────────────────────────────────────────────────────────────────────── */
  window.Cv = window.Cv || {};
  Object.assign(window.Cv, {
    // Stores
    useCanvasStore,
    useEdgeHoverStore,
    useHandleProximityStore,
    useCanvasDragStore,
    useConnectionDragStore,
    useCommentModeStore,
    useGenerationStore,
    useCanvasConfigStore,
    useToastStore,
    usePanelStore,
    useSnapshotStore,
    useHistoryStore,
    useMultiDragStore,
    // Helpers
    NODE_TYPE_CONFIGS,
    NODE_W, NODE_H, NODE_SHORT, NODE_MAX, NODE_MIN,
    isConnectionAllowed,
    nanoid,
    buildEdgesByTarget,
  });

})();
