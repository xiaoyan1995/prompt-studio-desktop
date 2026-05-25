/* canvas.js — Main App: ReactFlow canvas wiring, keyboard shortcuts, drag & drop
   Mounts into #cv-root replacing the loading state.
*/
(function() {
  'use strict';

  const RF = window.ReactFlow;
  const { ReactFlow, useReactFlow } = RF;

  const {
    useCanvasStore, useEdgeHoverStore, useHandleProximityStore,
    useCanvasDragStore, useConnectionDragStore, useCommentModeStore,
    useCanvasConfigStore, usePanelStore, useToastStore,
    AnimatedEdge, GroupNode, CommentNode, NodeShell, CssDotsBackground,
    isConnectionAllowed,
    CanvasTopBar, DockToolbar, ContextMenu, ConnectionDropMenu, HandleMenu,
    ShortcutsHelp, SelectionToolbar, MultiDragLines, CanvasControls,
    AlignmentGuides, CvToastContainer,
    DetailViewModal, RightPanel, ModalHost,
    nanoid,
  } = window.Cv;

  const EDGE_HOVER_DELAY = 600;
  const HANDLE_PROXIMITY_PX = 40;
  const CANVAS_MIN_ZOOM = 0.25;
  const CANVAS_MAX_ZOOM = 2;
  const SNAP_GRID = [20, 20];
  const SELECTION_KEY_CODE = ['Shift', 'Meta', 'Control'];
  const DEFAULT_EDGE_OPTIONS = { type: 'default' };
  const PRO_OPTIONS = { hideAttribution: true };

  /* ── Edge types ─────────────────────────────────────────────────── */
  const edgeTypes = { animated: AnimatedEdge, default: AnimatedEdge };

  /* ── Node types ─────────────────────────────────────────────────── */
  const nodeTypes = {
    default: NodeShell, text: NodeShell, prompt: NodeShell,
    'source-image': NodeShell, 'source-audio': NodeShell,
    'image-gen': NodeShell, 'video-gen': NodeShell,
    note: NodeShell, upscale: NodeShell, 'video-upscale': NodeShell,
    rembg: NodeShell, 'audio-gen': NodeShell, storyboard: NodeShell,
    group: GroupNode, comment: CommentNode,
  };

  function isTypingContext(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') return true;
    if (target.isContentEditable) return true;
    if (target.closest && target.closest("[contenteditable='true']")) return true;
    return false;
  }

  /* ── Main Canvas component ──────────────────────────────────────── */
  function CanvasApp() {
    const wrapperRef = React.useRef(null);
    const [rfInstance, setRfInstance] = React.useState(null);
    const [isDragOver, setIsDragOver] = React.useState(false);
    const [interactionMode, setInteractionMode] = React.useState('select');
    const [showMiniMap, setShowMiniMap] = React.useState(true);
    const connectSourceRef = React.useRef(null);
    const lastPaneClickRef = React.useRef(0);
    const edgeHoverTimerRef = React.useRef(null);
    const proximityRafRef = React.useRef(0);

    // Store slices
    const nodes = useCanvasStore(s => s.nodes);
    const edges = useCanvasStore(s => s.edges);
    const projectName = useCanvasStore(s => s.projectName);
    const isDirty = useCanvasStore(s => s.isDirty);
    const focusEditActive = useCanvasStore(s => s.focusEditState.active);
    const hasSelectedTextNode = useCanvasStore(s => s.hasSelectedTextNode);
    const commentMode = useCommentModeStore(s => s.active);
    const contextMenu = usePanelStore(s => s.contextMenu);
    const connectionDropMenu = usePanelStore(s => s.connectionDropMenu);
    const handleMenu = usePanelStore(s => s.handleMenu);
    const shortcutsOpen = usePanelStore(s => s.shortcutsOpen);
    const rightPanelTab = usePanelStore(s => s.rightPanelTab);
    const rightPanelOpen = usePanelStore(s => s.rightPanelOpen);
    const config = useCanvasConfigStore(s => s.config);

    /* ── ReactFlow callbacks ── */
    const handleNodesChange = React.useCallback(changes => {
      if (focusEditActive) {
        const filtered = changes.filter(c => c.type !== 'select');
        if (filtered.length > 0) useCanvasStore.getState().onNodesChange(filtered);
        return;
      }
      useCanvasStore.getState().onNodesChange(changes);
    }, [focusEditActive]);

    const handleEdgesChange = React.useCallback(changes => {
      useCanvasStore.getState().onEdgesChange(changes);
    }, []);

    const handleConnect = React.useCallback(connection => {
      useCanvasStore.getState().onConnect(connection);
      useConnectionDragStore.getState().setSourceNodeType(null);
    }, []);

    const isValidConnection = React.useCallback(connection => {
      const { source, target } = connection;
      if (!source || !target) return false;
      const nodeMap = useCanvasStore.getState()._nodeMap;
      const srcNode = nodeMap.get(source);
      const tgtNode = nodeMap.get(target);
      if (!srcNode || !tgtNode) return false;
      return isConnectionAllowed(srcNode.data?.nodeType, tgtNode.data?.nodeType);
    }, []);

    const handleConnectStart = React.useCallback((_, params) => {
      connectSourceRef.current = params?.nodeId ?? null;
      if (params?.nodeId) {
        const node = useCanvasStore.getState()._nodeMap.get(params.nodeId);
        if (node) useConnectionDragStore.getState().setSourceNodeType(node.data?.nodeType);
      }
    }, []);

    const handleConnectEnd = React.useCallback((event, connectionState) => {
      const sourceId = connectSourceRef.current;
      connectSourceRef.current = null;
      useConnectionDragStore.getState().setSourceNodeType(null);
      if (!sourceId) return;
      if (connectionState?.isValid) return;
      const clientX = event.clientX ?? event.changedTouches?.[0]?.clientX;
      const clientY = event.clientY ?? event.changedTouches?.[0]?.clientY;
      if (clientX == null) return;
      usePanelStore.getState().openConnectionDrop(clientX, clientY, sourceId);
    }, []);

    const handleConnectionDropSelect = React.useCallback((type, srcId) => {
      const menu = usePanelStore.getState().connectionDropMenu;
      if (!menu || !rfInstance) return;
      const pos = rfInstance.screenToFlowPosition({ x: menu.x, y: menu.y });
      const newId = useCanvasStore.getState().addNodeWithData(type, pos.x, pos.y, {});
      if (srcId) useCanvasStore.getState().addEdgeById(srcId, newId);
      usePanelStore.getState().closeConnectionDrop();
    }, [rfInstance]);

    const handleHandleMenuSelect = React.useCallback((type) => {
      const menu = usePanelStore.getState().handleMenu;
      if (!menu || !rfInstance) return;
      const sourceNode = useCanvasStore.getState()._nodeMap.get(menu.nodeId);
      const x = sourceNode ? sourceNode.position.x + (sourceNode.width || 300) + 60 : rfInstance.screenToFlowPosition({ x: menu.x, y: menu.y }).x;
      const y = sourceNode ? sourceNode.position.y : rfInstance.screenToFlowPosition({ x: menu.x, y: menu.y }).y;
      const newId = useCanvasStore.getState().addNodeWithData(type, x, y, {});
      if (menu.nodeId) useCanvasStore.getState().addEdgeById(menu.nodeId, newId);
      usePanelStore.getState().closeHandleMenu();
    }, [rfInstance]);

    const handleProjectRename = React.useCallback((name) => {
      useCanvasStore.getState().setProjectName(name);
    }, []);

    const handleNodeDragStart = React.useCallback((_, node, draggedNodes) => {
      useCanvasDragStore.getState().setNodeDragging(true);
      useCanvasStore.getState().captureDragStart((draggedNodes || [node]).map(n => n.id));
    }, []);

    const handleNodeDragStop = React.useCallback(() => {
      useCanvasDragStore.getState().setNodeDragging(false);
      useCanvasStore.getState().commitDragEnd();
    }, []);

    const handleMoveStart = React.useCallback(() => {
      useCanvasDragStore.getState().setViewportMoving(true);
    }, []);

    const handleMoveEnd = React.useCallback((_, vp) => {
      useCanvasDragStore.getState().setViewportMoving(false);
    }, []);

    const handleMove = React.useCallback(() => {}, []);

    // Pane click with double-click detection (via timeRef like source)
    const handlePaneClick = React.useCallback((event) => {
      if (commentMode) {
        if (!rfInstance) return;
        const flow = rfInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
        useCanvasStore.getState().addNode('comment', flow.x - 90, flow.y - 40);
        useCommentModeStore.getState().exit();
        return;
      }
      const now = Date.now();
      if (now - lastPaneClickRef.current < 300) {
        // double-click: add text node
        if (rfInstance) {
          const flow = rfInstance.screenToFlowPosition({ x: event.clientX, y: event.clientY });
          useCanvasStore.getState().addNode('text', flow.x - 150, flow.y - 90);
        }
        lastPaneClickRef.current = 0;
      } else {
        lastPaneClickRef.current = now;
        usePanelStore.getState().closeContextMenu();
        usePanelStore.getState().closeConnectionDrop();
        usePanelStore.getState().closeHandleMenu();
      }
    }, [commentMode, rfInstance]);

    const handlePaneContextMenu = React.useCallback((e) => {
      e.preventDefault();
      usePanelStore.getState().openContextMenu(e.clientX, e.clientY, 'canvas', null);
    }, []);

    const handleNodeContextMenu = React.useCallback((e, node) => {
      e.preventDefault();
      usePanelStore.getState().openContextMenu(e.clientX, e.clientY, 'node', node.id);
    }, []);

    const handleSelectionContextMenu = React.useCallback((e) => {
      e.preventDefault();
      usePanelStore.getState().openContextMenu(e.clientX, e.clientY, 'node', null);
    }, []);

    const handleEdgeContextMenu = React.useCallback((e, edge) => {
      e.preventDefault();
      usePanelStore.getState().openContextMenu(e.clientX, e.clientY, 'edge', edge.id);
    }, []);

    // Edge hover with delay timer (matches source EDGE_HOVER_DELAY pattern)
    const handleEdgeMouseEnter = React.useCallback((event, edge) => {
      useEdgeHoverStore.getState().setHover(edge.id, event.clientX, event.clientY);
      if (edgeHoverTimerRef.current) clearTimeout(edgeHoverTimerRef.current);
      edgeHoverTimerRef.current = setTimeout(() => {
        const { edgeId } = useEdgeHoverStore.getState();
        if (edgeId === edge.id) useEdgeHoverStore.getState().showScissor();
      }, EDGE_HOVER_DELAY);
    }, []);

    const handleEdgeMouseMove = React.useCallback((event) => {
      useEdgeHoverStore.getState().updatePos(event.clientX, event.clientY);
    }, []);

    const handleEdgeMouseLeave = React.useCallback(() => {
      if (edgeHoverTimerRef.current) { clearTimeout(edgeHoverTimerRef.current); edgeHoverTimerRef.current = null; }
      useEdgeHoverStore.getState().clear();
    }, []);

    // Proximity detection with rAF throttle (matches source)
    const handlePointerMove = React.useCallback((e) => {
      if (!rfInstance) return;
      if (proximityRafRef.current) return;
      proximityRafRef.current = requestAnimationFrame(() => {
        proximityRafRef.current = 0;
        const flow = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const allNodes = useCanvasStore.getState().nodes;
        const vpEl = document.querySelector('.react-flow__viewport');
        const zoomMatch = vpEl?.style?.transform?.match(/scale\(([^)]+)\)/);
        const z = zoomMatch ? parseFloat(zoomMatch[1]) : 1;
        const threshold = HANDLE_PROXIMITY_PX / Math.max(z, 0.15);

        let nearest = null, bestDist = Infinity;
        for (const node of allNodes) {
          const nw = node.measured?.width ?? (node.width ?? 300);
          const nh = node.measured?.height ?? (node.height ?? 200);
          if (flow.y < node.position.y - threshold || flow.y > node.position.y + nh + threshold) continue;
          const distLeft = Math.abs(flow.x - node.position.x);
          const distRight = Math.abs(flow.x - (node.position.x + nw));
          const dist = Math.min(distLeft, distRight);
          if (dist <= threshold && dist < bestDist) { bestDist = dist; nearest = node.id; }
        }
        useHandleProximityStore.getState().setNear(nearest);
      });
    }, [rfInstance]);

    const handlePointerLeave = React.useCallback(() => {
      useHandleProximityStore.getState().setNear(null);
    }, []);

    /* ── Keyboard shortcuts ── */
    React.useEffect(() => {
      const handler = (e) => {
        if (e.key === 'Escape' && useCommentModeStore.getState().active) {
          useCommentModeStore.getState().exit();
          return;
        }
        if (isTypingContext(e.target)) return;
        const mod = e.metaKey || e.ctrlKey;
        const store = useCanvasStore.getState();
        if (mod && e.key === 'z' && !e.shiftKey) { e.preventDefault(); store.undo(); return; }
        if (mod && (e.key === 'y' || (e.shiftKey && e.key === 'z'))) { e.preventDefault(); store.redo(); return; }
        if (mod && e.key === 'a') { e.preventDefault(); store.selectAll(); return; }
        if (mod && e.key === 'c') { e.preventDefault(); store.copySelected(); return; }
        if (mod && e.shiftKey && e.key === 'v') { e.preventDefault(); store.duplicateSelected(); return; }
        if (mod && e.key === 'v') {
          const clip = store.clipboard;
          if (clip && clip.nodes.length > 0) { e.preventDefault(); store.pasteClipboard(); }
          return;
        }
        if (mod && e.key === 'd') { e.preventDefault(); store.duplicateSelected(); return; }
        if (mod && e.key === 'g') { e.preventDefault(); store.groupSelected(); return; }
        if (mod && e.shiftKey && e.key === 'F') { e.preventDefault(); rfInstance?.fitView({ padding: 0.1, duration: 400 }); return; }
        if (e.key === 'Escape') { usePanelStore.getState().closeContextMenu(); return; }
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        if (e.key === 'Backspace' && useCanvasStore.getState().hasSelectedTextNode) return;
        e.preventDefault();
        store.deleteSelected();
      };
      window.addEventListener('keydown', handler);
      return () => window.removeEventListener('keydown', handler);
    }, [rfInstance]);


    /* ── Handle + click → HandleMenu ── */
    React.useEffect(() => {
      const handler = e => {
        const { nodeId, screenX, screenY } = e.detail;
        usePanelStore.getState().openHandleMenu(screenX, screenY - 20, nodeId, 'right');
      };
      window.addEventListener('cv:handle-plus-click', handler);
      return () => window.removeEventListener('cv:handle-plus-click', handler);
    }, []);

    /* ── Focus node event ── */
    React.useEffect(() => {
      const handler = e => {
        const { nodeId } = e.detail;
        const node = useCanvasStore.getState()._nodeMap.get(nodeId);
        if (!node || !rfInstance) return;
        rfInstance.setCenter(
          node.position.x + (node.width || 300) / 2,
          node.position.y + (node.height || 240) / 2,
          { zoom: 1, duration: 400 },
        );
        useCanvasStore.getState().onNodesChange([{ id: nodeId, type: 'select', selected: true }]);
      };
      window.addEventListener('cv:focus-node', handler);
      return () => window.removeEventListener('cv:focus-node', handler);
    }, [rfInstance]);

    /* ── Insert asset from parent (postMessage) ── */
    React.useEffect(() => {
      const handler = e => {
        const asset = e.detail;
        if (!asset || !rfInstance) return;
        const rect = wrapperRef.current?.getBoundingClientRect() || { width: 800, height: 600 };
        const flow = rfInstance.screenToFlowPosition({ x: rect.width / 2, y: rect.height / 2 });
        const type = asset.type === 'video' ? 'source-image' : asset.type === 'audio' ? 'source-audio' : 'source-image';
        useCanvasStore.getState().addNodeWithData(type, flow.x - 150, flow.y - 120, {
          imageUrl: asset.url, dataUrl: asset.url, audioUrl: asset.audioUrl,
          label: asset.label || '素材',
        });
      };
      window.addEventListener('cv:insert-asset', handler);
      return () => window.removeEventListener('cv:insert-asset', handler);
    }, [rfInstance]);

    /* ── Drag-drop files onto canvas ── */
    const handleDragOver = React.useCallback((e) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setIsDragOver(true);
    }, []);

    const handleDragLeave = React.useCallback(() => setIsDragOver(false), []);

    const handleDrop = React.useCallback(async (e) => {
      e.preventDefault();
      setIsDragOver(false);
      if (!rfInstance) return;
      const files = Array.from(e.dataTransfer.files);
      if (files.length > 0) {
        const flow = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const store = useCanvasStore.getState();
        let offsetX = 0;
        for (const file of files) {
          if (file.type.startsWith('image/')) {
            const reader = new FileReader();
            reader.onload = ev => store.addNodeWithData('source-image', flow.x + offsetX, flow.y, { dataUrl: ev.target.result, label: file.name });
            reader.readAsDataURL(file);
            offsetX += 340;
          } else if (file.type.startsWith('video/')) {
            store.addNodeWithData('video-gen', flow.x + offsetX, flow.y, { videoUrl: URL.createObjectURL(file), label: file.name });
            offsetX += 500;
          } else if (file.type.startsWith('audio/')) {
            store.addNodeWithData('source-audio', flow.x + offsetX, flow.y, { audioUrl: URL.createObjectURL(file), label: file.name });
            offsetX += 310;
          }
        }
        return;
      }
      // Dropped URL
      const url = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
      if (url && url.startsWith('http')) {
        const flow = rfInstance.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        const store = useCanvasStore.getState();
        const ext = url.split('?')[0].split('.').pop().toLowerCase();
        if (['jpg','jpeg','png','gif','webp','avif','bmp'].includes(ext)) {
          store.addNodeWithData('source-image', flow.x, flow.y, { imageUrl: url, label: url.split('/').pop() });
        } else if (['mp4','webm','mov'].includes(ext)) {
          store.addNodeWithData('video-gen', flow.x, flow.y, { videoUrl: url, label: url.split('/').pop() });
        }
      }
    }, [rfInstance]);

    /* ── Load persisted canvas on mount ── */
    React.useEffect(() => {
      try {
        const saved = localStorage.getItem('ps_canvas_current');
        if (saved) {
          const data = JSON.parse(saved);
          useCanvasStore.getState().loadFromSerialized(data);
          if (rfInstance && data.viewport) {
            setTimeout(() => rfInstance.setViewport(data.viewport, { duration: 0 }), 100);
          }
        }
      } catch(e) {}
    }, [rfInstance]);

    /* ── Auto-save ── */
    React.useEffect(() => {
      const save = () => {
        if (!rfInstance) return;
        const state = useCanvasStore.getState().getSerializableState(rfInstance.getViewport());
        try { localStorage.setItem('ps_canvas_current', JSON.stringify(state)); } catch(e) {}
      };
      const interval = setInterval(save, 15000);
      window.addEventListener('beforeunload', save);
      return () => { clearInterval(interval); window.removeEventListener('beforeunload', save); };
    }, [rfInstance]);

    /* ── Paste images from clipboard ── */
    React.useEffect(() => {
      const el = wrapperRef.current;
      if (!el) return;
      const handler = (e) => {
        if (isTypingContext(e.target)) return;
        const items = e.clipboardData?.items;
        if (!items) return;
        const files = [];
        for (let i = 0; i < items.length; i++) {
          const item = items[i];
          if (item.kind === 'file' && item.type.startsWith('image/')) {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
        if (files.length > 0) {
          e.preventDefault();
          for (const file of files) {
            const reader = new FileReader();
            reader.onload = ev => {
              const flow = rfInstance ? rfInstance.screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 }) : { x: 0, y: 0 };
              useCanvasStore.getState().addNodeWithData('source-image', flow.x - 150, flow.y - 120, { dataUrl: ev.target.result, label: '粘贴图片' });
            };
            reader.readAsDataURL(file);
          }
        }
      };
      el.addEventListener('paste', handler);
      return () => el.removeEventListener('paste', handler);
    }, [rfInstance]);

    const showGrid = config.showGrid !== false;
    const snapToGrid = !!config.snapToGrid;

    return React.createElement('div', {
      style: { display: 'flex', flexDirection: 'column', width: '100%', height: '100%', position: 'relative' },
    },
      React.createElement(CanvasTopBar, {
        projectName,
        saveStatus: isDirty ? 'unsaved' : 'saved',
        onRename: handleProjectRename,
      }),

      React.createElement('div', { className: 'cv-body' },
        React.createElement('div', {
          ref: wrapperRef,
          className: 'cv-canvas-area' + (commentMode ? ' cv-comment-mode-active' : ''),
          onPointerMove: handlePointerMove,
          onPointerLeave: handlePointerLeave,
          onDragOver: handleDragOver,
          onDragLeave: handleDragLeave,
          onDrop: handleDrop,
        },
          React.createElement(ReactFlow, {
            nodes, edges,
            nodeTypes, edgeTypes,
            onNodesChange: handleNodesChange,
            onEdgesChange: handleEdgesChange,
            onConnect: handleConnect,
            isValidConnection,
            onConnectStart: handleConnectStart,
            onConnectEnd: handleConnectEnd,
            onNodeDragStart: handleNodeDragStart,
            onNodeDragStop: handleNodeDragStop,
            onMoveStart: handleMoveStart,
            onMove: handleMove,
            onMoveEnd: handleMoveEnd,
            onPaneClick: handlePaneClick,
            onPaneContextMenu: handlePaneContextMenu,
            onNodeContextMenu: handleNodeContextMenu,
            onSelectionContextMenu: handleSelectionContextMenu,
            onEdgeContextMenu: handleEdgeContextMenu,
            onEdgeMouseEnter: handleEdgeMouseEnter,
            onEdgeMouseMove: handleEdgeMouseMove,
            onEdgeMouseLeave: handleEdgeMouseLeave,
            onInit: inst => { setRfInstance(inst); },
            colorMode: 'dark',
            snapToGrid,
            snapGrid: SNAP_GRID,
            defaultEdgeOptions: DEFAULT_EDGE_OPTIONS,
            connectionLineStyle: { stroke: '#CCFF00', strokeWidth: 1.5 },
            deleteKeyCode: null,
            selectionKeyCode: SELECTION_KEY_CODE,
            multiSelectionKeyCode: SELECTION_KEY_CODE,
            selectionOnDrag: interactionMode === 'select',
            panOnDrag: interactionMode === 'select' ? [1, 2] : true,
            zoomOnDoubleClick: false,
            fitView: false,
            connectionRadius: 80,
            onlyRenderVisibleElements: true,
            minZoom: CANVAS_MIN_ZOOM,
            maxZoom: CANVAS_MAX_ZOOM,
            proOptions: PRO_OPTIONS,
          },
            showGrid && React.createElement(CssDotsBackground, { gap: 20, size: 1.2, color: 'rgba(255,255,255,0.12)' }),
            snapToGrid && React.createElement(AlignmentGuides),
            React.createElement(SelectionToolbar),
            React.createElement(MultiDragLines),
            React.createElement(CanvasControls, {
              showGrid,
              snapToGrid,
              showMiniMap,
              onToggleGrid: () => useCanvasConfigStore.getState().patchConfig({ snapToGrid: !snapToGrid, showGrid: !snapToGrid ? true : showGrid }),
              onToggleMiniMap: () => setShowMiniMap(v => !v),
              interactionMode,
              onToggleInteractionMode: () => setInteractionMode(m => m === 'select' ? 'pan' : 'select'),
              onShowShortcuts: () => usePanelStore.getState().openShortcuts(),
            }),
            React.createElement(ShortcutsHelp, {
              open: shortcutsOpen,
              onClose: () => usePanelStore.getState().closeShortcuts(),
            }),
          ),

          contextMenu && React.createElement(ContextMenu, {
            x: contextMenu.x, y: contextMenu.y,
            target: { type: contextMenu.type, id: contextMenu.nodeId },
            onClose: () => usePanelStore.getState().closeContextMenu(),
            onDelete: (id) => useCanvasStore.getState().deleteNodeById(id),
            onDeleteSelected: () => useCanvasStore.getState().deleteSelected(),
            onDuplicate: () => useCanvasStore.getState().duplicateSelected(),
            onDuplicateSelected: () => useCanvasStore.getState().duplicateSelected(),
            onCopy: () => useCanvasStore.getState().copySelected(),
            onPaste: () => useCanvasStore.getState().pasteClipboard(),
            onOpenAddNodeMenu: () => {
              const cm = usePanelStore.getState().contextMenu;
              if (cm) usePanelStore.getState().openHandleMenu(cm.x, cm.y, null, 'right');
            },
          }),
          connectionDropMenu && React.createElement(ConnectionDropMenu, {
            x: connectionDropMenu.x, y: connectionDropMenu.y,
            sourceNodeId: connectionDropMenu.sourceNodeId,
            onSelect: handleConnectionDropSelect,
            onClose: () => usePanelStore.getState().closeConnectionDrop(),
          }),
          handleMenu && React.createElement(HandleMenu, {
            x: handleMenu.x, y: handleMenu.y,
            onSelect: handleHandleMenuSelect,
            onClose: () => usePanelStore.getState().closeHandleMenu(),
          }),

          isDragOver && React.createElement('div', { style: { position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' } },
            React.createElement('div', { style: { position: 'absolute', inset: 16, borderRadius: 16, border: '2px dashed rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.03)' } }),
          ),
        ),

        React.createElement(RightPanel),
      ),

      React.createElement(DockToolbar, {
        onOpenAddMenu: (x, y) => usePanelStore.getState().openHandleMenu(x, y, null, 'right'),
        onToggleAssets: () => {
          if (rightPanelOpen && rightPanelTab === 'asset') usePanelStore.getState().closeRightPanel();
          else usePanelStore.getState().setRightPanelTab('asset');
        },
        assetsOpen: rightPanelOpen && rightPanelTab === 'asset',
        onToggleMaterials: () => {
          if (rightPanelOpen && rightPanelTab === 'material') usePanelStore.getState().closeRightPanel();
          else usePanelStore.getState().setRightPanelTab('material');
        },
        materialsOpen: rightPanelOpen && rightPanelTab === 'material',
        onToggleStoryboard: () => {
          if (rightPanelOpen && rightPanelTab === 'storyboard') usePanelStore.getState().closeRightPanel();
          else usePanelStore.getState().setRightPanelTab('storyboard');
        },
        storyboardOpen: rightPanelOpen && rightPanelTab === 'storyboard',
      }),

      React.createElement(DetailViewModal),
      React.createElement(ModalHost),
      React.createElement(CvToastContainer),
    );
  }

  /* ── Bootstrap ──────────────────────────────────────────────────── */
  function bootstrap() {
    const root = document.getElementById('cv-root');
    if (!root) { console.error('canvas: #cv-root not found'); return; }

    // Load API config from PS server on startup
    window.Cv.api.loadCanvasSettingsFromPS().then(serverConfig => {
      if (serverConfig) {
        const existing = useCanvasConfigStore.getState().config;
        // Only inherit PS config if user hasn't configured their own yet
        if (!existing.baseUrl && serverConfig.baseUrl) {
          useCanvasConfigStore.getState().patchConfig(serverConfig);
        }
      }
    }).catch(() => {});

    ReactDOM.createRoot(root).render(
      React.createElement(React.StrictMode, null,
        React.createElement(CanvasApp),
      ),
    );
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrap);
  } else {
    bootstrap();
  }

})();
