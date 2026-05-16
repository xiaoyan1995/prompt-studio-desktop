// Prompt Studio Desktop Companion – Content Script
// Shows a floating toolbar on hover over images/videos
(function () {
  'use strict';
  if (window.__pscInjected) return;
  window.__pscInjected = true;

  // ── Styles ────────────────────────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    #psc-bar {
      position: fixed;
      z-index: 2147483647;
      display: none;
      align-items: center;
      gap: 3px;
      padding: 4px 5px;
      background: rgba(15, 23, 42, 0.82);
      border-radius: 9px;
      backdrop-filter: blur(10px);
      box-shadow: 0 3px 14px rgba(0,0,0,.35);
      pointer-events: auto;
      transition: opacity .15s;
    }
    #psc-bar.visible { display: flex; }
    .psc-btn {
      width: 28px; height: 28px;
      border: none;
      background: transparent;
      border-radius: 6px;
      cursor: pointer;
      font-size: 15px;
      display: flex; align-items: center; justify-content: center;
      transition: background .12s;
      line-height: 1;
    }
    .psc-btn:hover { background: rgba(255,255,255,.18); }
    .psc-sep { width: 1px; height: 16px; background: rgba(255,255,255,.18); margin: 0 1px; }
    .psc-label {
      font-size: 10px; font-weight: 700; color: rgba(255,255,255,.5);
      font-family: Inter, system-ui, sans-serif;
      padding: 0 3px 0 1px; letter-spacing: .04em;
    }
  `;
  document.head.appendChild(style);

  // ── Toolbar Element ────────────────────────────────────────────────────────
  const bar = document.createElement('div');
  bar.id = 'psc-bar';
  bar.innerHTML = `
    <button class="psc-btn" data-mode="save"    title="💾 保存到 Prompt Studio Desktop">💾</button>
    <button class="psc-btn" data-mode="reverse" title="✨ 反推提示词">✨</button>
  `;
  document.body.appendChild(bar);

  // ── Domain Blacklist ────────────────────────────────────────────────────────
  let blockedDomains = [];
  function isHostBlocked() {
    const host = location.hostname.toLowerCase();
    return blockedDomains.some(d => host === d || host.endsWith('.' + d));
  }
  chrome.storage.sync.get({ domainBlacklist: '' }, s => {
    blockedDomains = (s.domainBlacklist || '').split('\n').map(d => d.trim().toLowerCase()).filter(Boolean);
  });
  chrome.storage.onChanged.addListener(changes => {
    if (changes.domainBlacklist) {
      blockedDomains = (changes.domainBlacklist.newValue || '').split('\n').map(d => d.trim().toLowerCase()).filter(Boolean);
      if (isHostBlocked() && bar.classList.contains('visible')) { bar.classList.remove('visible'); currentEl = null; }
    }
  });

  // ── State ──────────────────────────────────────────────────────────────────
  let currentEl    = null;
  let hideTimer    = null;
  let showTimer    = null;
  let cardAnalysis  = '';
  let cardAnchorEl  = null;

  function bgMsg(msg) {
    return new Promise(resolve => {
      let done = false;
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        resolve({});
      }, 900);
      try {
        chrome.runtime.sendMessage(msg, res => {
          if (done) return;
          done = true;
          clearTimeout(timer);
          if (chrome.runtime.lastError) resolve({});
          else resolve(res || {});
        });
      } catch {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({});
      }
    });
  }

  async function resolveMedia(mediaUrl, mediaType) {
    if (mediaType !== 'video') {
      return { mediaUrl, referer: location.href, cookie: '' };
    }
    try {
      const res = await bgMsg({
        type: 'resolve-media-url',
        mediaUrl,
        mediaType,
        referer: location.href
      });
      return {
        mediaUrl: res.mediaUrl || mediaUrl,
        referer: res.referer || location.href,
        cookie: res.cookie || ''
      };
    } catch {
      return { mediaUrl, referer: location.href, cookie: '' };
    }
  }

  function clearTimers() {
    clearTimeout(hideTimer);
    clearTimeout(showTimer);
  }

  function isBlocked(left, top, w, h) {
    const pts = [
      [left + w/2, top + h/2], [left+6, top+6], [left+w-6, top+6],
      [left+6, top+h-6], [left+w-6, top+h-6]
    ];
    for (const [x, y] of pts) {
      const hit = document.elementFromPoint(x, y);
      if (!hit) continue;
      if (hit === bar || bar.contains(hit)) continue;
      if (currentEl && (hit === currentEl || currentEl.contains(hit) || hit.contains(currentEl))) continue;
      return true;
    }
    return false;
  }

  function positionBar(el) {
    const r  = el.getBoundingClientRect();
    const BW = bar.offsetWidth  || 72;
    const BH = bar.offsetHeight || 38;
    const PAD = Math.max(8, Math.min(16, r.width * 0.03));
    function clamp(p) {
      return {
        left: Math.max(4, Math.min(window.innerWidth  - BW - 4, p.left)),
        top:  Math.max(4, Math.min(window.innerHeight - BH - 4, p.top))
      };
    }
    const candidates = [
      clamp({ left: r.right - BW - PAD, top: r.top    + PAD }),      // top-right  ← preferred
      clamp({ left: r.left  + PAD,      top: r.top    + PAD }),      // top-left
      clamp({ left: r.right - BW - PAD, top: r.bottom - BH - PAD }), // bottom-right
      clamp({ left: r.left  + PAD,      top: r.bottom - BH - PAD }), // bottom-left
    ];
    const chosen = candidates.find(p => !isBlocked(p.left, p.top, BW, BH)) || candidates[0];
    bar.style.left = `${Math.round(chosen.left)}px`;
    bar.style.top  = `${Math.round(chosen.top)}px`;
  }

  function showBar(el) {
    if (isHostBlocked()) return;
    clearTimers();
    // Re-inject bar if detached (SPA navigation edge case, e.g. Twitter/X)
    if (!bar.isConnected) (document.body || document.documentElement).appendChild(bar);
    currentEl = el;
    positionBar(el);
    bar.classList.add('visible');
  }

  function scheduleHide() {
    clearTimers();
    hideTimer = setTimeout(() => {
      bar.classList.remove('visible');
      currentEl = null;
    }, 320);
  }

  // ── Toolbar Clicks ─────────────────────────────────────────────────────────
  bar.addEventListener('mouseenter', clearTimers);
  bar.addEventListener('mouseleave', scheduleHide);

  bar.addEventListener('click', async (e) => {
    const btn = e.target.closest('.psc-btn');
    if (!btn || !currentEl) return;
    e.stopPropagation();
    e.preventDefault();
    bar.classList.remove('visible');

    const src = currentEl.currentSrc || currentEl.src || currentEl.getAttribute('src') || currentEl.getAttribute('data-src') || '';
    // Try to resolve relative URLs
    let mediaUrl = src;
    try { mediaUrl = new URL(src, location.href).href; } catch {}

    const mediaType = currentEl.tagName.toLowerCase() === 'video' ? 'video' : 'image';
    const resolved = await resolveMedia(mediaUrl, mediaType);
    mediaUrl = resolved.mediaUrl;
    if (btn.dataset.mode === 'reverse') {
      showCard(mediaUrl, mediaType, currentEl, resolved.referer, resolved.cookie);
    } else {
      chrome.runtime.sendMessage({
        type: 'open-dialog', mediaUrl, mediaType, mode: 'save',
        pageUrl: location.href, pageTitle: document.title,
        referer: resolved.referer, cookie: resolved.cookie
      });
    }
  });

  // ── Message Handler ───────────────────────────────────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === 'get-selection') sendResponse(window.getSelection().toString());
    if (msg.type === 'psc-show-panel') {
      resolveMedia(msg.mediaUrl, msg.mediaType).then(res => {
        showCard(res.mediaUrl, msg.mediaType, null, res.referer || msg.referer, res.cookie || msg.cookie);
      });
    }
    if (msg.type === 'psc-reverse-result') deliverResult(msg);
    if (msg.type === 'scan-images') {
      sendResponse({ images: scanPageImages() });
      return true;
    }
  });

  // ── Batch Scan ────────────────────────────────────────────────────────────
  function getBestUrl(img) {
    // 1. srcset — pick highest declared width
    const srcset = img.getAttribute('srcset') || img.getAttribute('data-srcset') || '';
    if (srcset) {
      const entries = srcset.split(',').map(s => s.trim().split(/\s+/)).filter(p => p[0]);
      if (entries.length) {
        entries.sort((a, b) => {
          const wA = parseFloat((a[1] || '0').replace(/[wx]/i, '')) || 0;
          const wB = parseFloat((b[1] || '0').replace(/[wx]/i, '')) || 0;
          return wB - wA;
        });
        const best = entries[0][0];
        try { return new URL(best, location.href).href; } catch {}
      }
    }
    // 2. data-* lazy-load attributes (common frameworks)
    const dataAttrs = ['data-src','data-original','data-lazy-src','data-full',
                       'data-large','data-hi-res','data-image','data-url'];
    for (const attr of dataAttrs) {
      const v = img.getAttribute(attr);
      if (v && v.startsWith('http')) return v;
    }
    // 3. currentSrc (respects srcset already chosen by browser)
    if (img.currentSrc) {
      try { return new URL(img.currentSrc, location.href).href; } catch {}
    }
    // 4. plain src
    const src = img.getAttribute('src') || '';
    if (!src) return null;
    try { return new URL(src, location.href).href; } catch { return null; }
  }

  function cleanCdnUrl(url) {
    try {
      const u = new URL(url);
      const host = u.hostname;

      // ── 小红书 xhscdn.com ──────────────────────────────────────────────
      // https://sns-img-bd.xhscdn.com/abc?imageView2/2/w/300/format/webp
      if (host.includes('xhscdn.com') || host.includes('xiaohongshu.com')) {
        u.search = '';
        return u.href;
      }

      // ── 微博 sinaimg.cn ────────────────────────────────────────────────
      // /thumb180/ /thumb300/ /orj360/ /orj480/ → /large/
      if (host.includes('sinaimg.cn') || host.includes('weibo.com')) {
        u.pathname = u.pathname.replace(/\/(thumb\d+|orj\d+|woriginal|mw\d+)\//, '/large/');
        u.search = '';
        return u.href;
      }

      // ── B站 hdslb.com / biliimg.com ────────────────────────────────────
      // image.jpg@200w_200h_1c.webp  →  image.jpg
      if (host.includes('hdslb.com') || host.includes('biliimg.com') || host.includes('bilibili.com')) {
        u.pathname = u.pathname.replace(/@[^/]*$/, '');
        u.search = '';
        return u.href;
      }

      // ── 抖音 / TikTok douyinpic.com ───────────────────────────────────
      // ~tplv-dy-resize-originx:0:0:q75.jpeg  →  strip tplv suffix
      if (host.includes('douyinpic.com') || host.includes('tiktokcdn.com') || host.includes('byteimg.com')) {
        u.pathname = u.pathname.replace(/~tplv-[^.]+(\.[a-z]+)$/i, '$1');
        u.search = '';
        return u.href;
      }

      // ── 通用：去掉常见尺寸查询参数 ────────────────────────────────────
      // ?w=300&h=300  ?width=400  ?size=small  ?imageView...  ?x-oss-process=...
      const sizeParams = ['w','h','width','height','size','quality','q',
                          'imageview','imagemogr','x-oss-process','x-image-process',
                          'format','thumb','resize','crop','scale'];
      let stripped = false;
      sizeParams.forEach(p => {
        if (u.searchParams.has(p)) { u.searchParams.delete(p); stripped = true; }
      });
      // If URL path has thumbnail indicators like /s/ /thumb/ /small/
      const thumbPath = u.pathname.replace(/\/(s|sm|thumb|thumbnail|small|preview|mini|icon)(\/|_)/, '/');
      if (thumbPath !== u.pathname) { u.pathname = thumbPath; stripped = true; }

      return stripped ? u.href : url;
    } catch {
      return url;
    }
  }

  function scanPageImages() {
    const seen = new Set();
    const results = [];
    document.querySelectorAll('img').forEach(img => {
      if (img.naturalWidth < 2 || img.naturalHeight < 2) return;
      const raw = getBestUrl(img);
      if (!raw) return;
      const url = cleanCdnUrl(raw);
      const key = url;
      if (seen.has(key)) return;
      seen.add(key);
      results.push({
        url,
        width:  img.naturalWidth,
        height: img.naturalHeight,
      });
    });
    return results;
  }

  // ── Floating Reverse Card ─────────────────────────────────────────────────────
  let cardHost = null;

  function removeCard() {
    if (cardHost) { cardHost.remove(); cardHost = null; }
  }

  function deliverResult(msg) {
    if (!cardHost) return;
    const s = cardHost.shadowRoot;
    s.getElementById('loading').style.display = 'none';
    if (msg.error) {
      const err = s.getElementById('error');
      err.style.display = 'flex';
      err.querySelector('.emsg').textContent = msg.error;
    } else {
      const res = s.getElementById('result');
      res.style.display = 'flex';
      res.querySelector('textarea').value = msg.prompt || '';
      cardAnalysis = msg.analysis || '';
      // Pre-fill title if AI returned one
      if (msg.title) {
        const titleIn = s.getElementById('titleIn');
        if (titleIn && !titleIn.value.trim()) titleIn.value = msg.title;
      }
    }
  }

  const REVERSE_MODES = {
    auto:    { label: '全面', instruction: null },
    outfit:  { label: '服装', instruction: '请仔细分析图片中人物的穿着，【必须从头到脚逐部位覆盖，画面内可见的部位一个不能漏】：头饰/帽子→发型→颈部装饰/颈甲→上衣/外套/内搭（款式/面料/颜色/图案）→手套/臂甲/手部装饰→下装（裤子/裙子款式/长度）→腰部/腰带→袜子/腿部（丝袜/过膝袜/腿甲等）→鞋子（款式/颜色/鞋跟）。同时注明：①各部位露肤程度（如实描述）②面料质感（棉/丝绸/皮革/蕾丝/透明纱等）③整体穿搭风格与叠穿层次。直接输出描述词，不要解释。' },
    char:    { label: '人物', instruction: '请仔细分析图片中所有人物，每个人物单独描述，覆盖以下全部内容：①画面中的位置（画面左/中/右、前景/中景/背景）②面朝方向（正面朝向镜头/斜45°小侧脸/正侧面/斜45°背面/完全背对镜头）③若多人则描述站位关系及相互朝向④外貌特征（发型发色/脸部特征/肤色/表情/体型）⑤姿态与动作——【重要：描述四肢位置时必须用画面方位而非人体左右，例如"画面右侧的手握着…""画面左侧的腿踩在…"，禁止直接说"左手""右脚"，因为角色面对镜头时人体左右与画面左右相反，AI容易判断错误】⑥【服装从头到脚逐部位，不得遗漏】：头饰→颈部→上衣/外套/内搭→手部/臂部→下装→腰带→袜子/腿部→鞋子，每部位描述款式/颜色/图案/材质⑦【铁律：画面中所有道具/物品必须描述，一个不漏】：人物手持/接触/身旁的每一件物品都要写清楚——物品名称、颜色、款式、上面的文字或标识、放置位置（握在画面某侧手中/靠在某处/踩在某物上/放置于旁边等），不得以"滑板""水壶"等一笔带过，必须描述完整细节⑧整体人物气质。直接输出描述词，不要解释。' },
    scene:   { label: '场景', instruction: '请仔细分析图片场景，按以下顺序输出：【第一步：先综合判断场所类型】不要只说「室外楼梯」这种表面信息，必须根据所有视觉线索（建筑结构/地面质地/周围设施/文化背景等）判断具体地点类型（如：滑板公园/地铁入口楼梯/商展中心外境/学校进入口/城市广场/天台山小道等），越具体越好。【第二步：层次描述】前景/中景/背景的具体元素、空间纵深感、背景与主体的距离关系。【第三步：氛围与时间】时间（日间/夜晚/黄昏等）、天气、季节、整体地点文化属性。直接输出描述词，不要解释。' },
    style:   { label: '画风', instruction: '请仔细分析图片画风，按以下顺序判断：【第一步：先判断渲染真实度】是否存在真实皮肤质感（毛孔/血管/次表面散射）、真实布料纹理、真实环境光源？→若是：这是【超写实/写实动漯风格】，应输出 hyperrealistic anime / photorealistic anime illustration，渲染技术为 PBR-based rendering + anime aesthetics，不得证写赛璐璐/厚涂。【第二步：检查描线】富有明显黑色描边→ thick outlines/lineart，无描边→ no outlines (painterly/realistic)。【第三步：着色风格】是平涂（cel-shading/flat shading）还是厂涂（painterly）还是写实（PBR/photo-real）。【第四步：作品引用】仅当痛痛识别时才引用具体作品/艺术家，不確定则写通用风格描述，不得猜测。最终输出英文关键词，不要解释。' },
    cam:     { label: '运镜', instruction: '请仔细分析图片的镜头语言，输出完整的镜头/运镜提示词。必须覆盖：①景别（大远景/远景/全景/中景/中近景/近景/特写/大特写）②垂直视角（仰视感→低角度仰拍；俯视感→高角度俯拍；否则→平视，描述倾斜程度）③水平视角（正面/正侧面/斜45°/背面/过肩）④焦距感（鱼眼/超广角/广角/标准/中长焦/长焦/超长焦）⑤景深与散景（浅/中/深，虚化程度）⑥透视感（强透视/正常/压缩透视）⑦构图方式（居中/三分/对角线/框架/引导线等）⑧画幅（竖/横/方/宽银幕及比例）⑨推荐镜头运动方式（推/拉/摇/移/跟/环绕/固定等）⑩镜头特效（光晕/眩光/色散/暗角，有则描述）。直接输出描述词，不要解释。' },
  };

  function showCard(mediaUrl, mediaType, anchorEl, referer = '', cookie = '') {
    cardAnalysis = '';
    cardAnchorEl = anchorEl || null;
    const mediaReferer = referer || location.href;
    const mediaCookie = cookie || '';
    removeCard();

    // Position
    const W = 290, PAD = 10;
    let left = 0, top = 0;
    if (anchorEl) {
      const r = anchorEl.getBoundingClientRect();
      left = r.right + PAD;
      top  = r.top;
      if (left + W > window.innerWidth - PAD) left = r.left - W - PAD;
      if (left < PAD) { left = r.left; top = r.bottom + PAD; }
      top = Math.max(PAD, Math.min(top, window.innerHeight - 320));
    } else {
      left = window.innerWidth - W - PAD;
      top  = 80;
    }

    cardHost = document.createElement('div');
    cardHost.style.cssText = 'position:fixed;top:0;left:0;width:0;height:0;z-index:2147483647';
    document.documentElement.appendChild(cardHost);

    const shadow = cardHost.attachShadow({ mode: 'open' });
    const isVideo = mediaType === 'video';
    const chipCls = isVideo ? 'chip-video' : 'chip-img';
    const chipTxt = isVideo ? '🎬 视频' : '🖼️ 图片';

    shadow.innerHTML = `
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  :host{all:initial}
  .card{
    position:fixed;left:${left}px;top:${top}px;width:${W}px;
    background:#fff;border-radius:14px;
    box-shadow:0 8px 32px rgba(0,0,0,.18),0 2px 8px rgba(0,0,0,.08);
    font-family:Inter,system-ui,sans-serif;font-size:13px;color:#1a2340;
    display:flex;flex-direction:column;overflow:hidden;
    animation:pop .15s cubic-bezier(.34,1.56,.64,1);
    pointer-events:all;
  }
  @keyframes pop{from{opacity:0;transform:scale(.9)}to{opacity:1;transform:scale(1)}}
  .head{
    display:flex;align-items:center;gap:6px;
    padding:10px 12px 8px;
    border-bottom:1px solid #f0f0f0;
    background:linear-gradient(135deg,#1d4ed8,#6d28d9);
    color:#fff;
  }
  .head-title{font-size:12px;font-weight:700;flex:1}
  .chip{padding:2px 7px;border-radius:99px;font-size:10px;font-weight:700}
  .chip-img{background:rgba(255,255,255,.2)}
  .chip-video{background:rgba(255,255,255,.2)}
  .close-btn{
    background:rgba(255,255,255,.15);border:none;color:#fff;
    width:20px;height:20px;border-radius:50%;cursor:pointer;
    font-size:12px;display:flex;align-items:center;justify-content:center;
  }
  .close-btn:hover{background:rgba(255,255,255,.3)}
  .body{padding:12px;display:flex;flex-direction:column;gap:10px;max-height:420px;overflow-y:auto}
  /* loading */
  #loading{display:flex;flex-direction:column;align-items:center;gap:8px;padding:16px 0}
  .spin{
    width:24px;height:24px;border:3px solid #e0e7ff;border-top-color:#1b67da;
    border-radius:50%;animation:spin .7s linear infinite;
  }
  @keyframes spin{to{transform:rotate(360deg)}}
  .lmsg{font-size:11px;color:#6b7a99;text-align:center}
  /* error */
  #error{display:none;flex-direction:column;gap:8px;align-items:center}
  .emsg{font-size:12px;color:#dc2626;line-height:1.5;text-align:center}
  /* result */
  #result{display:none;flex-direction:column;gap:8px}
  textarea{
    width:100%;min-height:130px;border:1px solid #e4e8ef;border-radius:8px;
    padding:8px;font-size:12px;font-family:'Consolas',monospace;
    line-height:1.6;resize:vertical;outline:none;color:#1a2340;
    background:#fafbff;
  }
  textarea:focus{border-color:#1b67da}
  .row{display:flex;gap:6px}
  .btn{
    flex:1;padding:7px 10px;border-radius:7px;border:none;
    font-size:12px;font-weight:600;cursor:pointer;
    font-family:inherit;transition:all .12s;
  }
  .btn-copy{background:#f1f5f9;color:#334155}
  .btn-copy:hover{background:#e2e8f0}
  .btn-save{background:#1b67da;color:#fff}
  .btn-save:hover{background:#1558c0}
  .btn-retry{background:#fef2f2;color:#dc2626;border:1px solid #fecaca}
  .btn-retry:hover{background:#fee2e2}
  .btn-start{background:#1b67da;color:#fff;width:100%;border-radius:7px;padding:8px}
  .btn-start:hover{background:#1558c0}
  .copied{font-size:11px;color:#16a34a;text-align:center;height:14px}
  /* save form */
  #saveForm{display:none;flex-direction:column;gap:8px;border-top:1px solid #f0f0f0;padding-top:8px}
  label{font-size:11px;font-weight:600;color:#6b7a99}
  select,input{
    width:100%;border:1px solid #e4e8ef;border-radius:7px;
    padding:7px 8px;font-size:12px;font-family:inherit;
    color:#1a2340;outline:none;background:#fff;
  }
  select:focus,input:focus{border-color:#1b67da}
  .cats{display:flex;gap:5px;flex-wrap:wrap}
  .cat{
    flex:1;min-width:60px;padding:5px 6px;border:1px solid #e4e8ef;border-radius:6px;
    background:#fff;cursor:pointer;text-align:center;font-size:11px;
    font-weight:600;color:#6b7a99;transition:all .12s;
  }
  .cat.on{border-color:#1b67da;background:#eef4ff;color:#1b67da}
  .btn-confirm{background:#16a34a;color:#fff;border:none;border-radius:7px;
    padding:7px 10px;width:100%;font-size:12px;font-weight:600;
    cursor:pointer;font-family:inherit;transition:background .12s;}
  .btn-confirm:hover{background:#15803d}
  .btn-confirm:disabled{opacity:.5;cursor:default}
  /* mode chips */
  .modes{display:flex;gap:4px;padding:8px 12px 0;flex-wrap:wrap}
  .mode-btn{
    padding:3px 10px;border-radius:99px;border:1px solid #e4e8ef;
    background:#f8faff;color:#6b7a99;font-size:11px;font-weight:600;
    cursor:pointer;transition:all .12s;font-family:inherit;
  }
  .mode-btn.on{border-color:#1b67da;background:#eef4ff;color:#1b67da}
  .mode-btn:hover:not(.on){background:#f0f4ff}
</style>
<div class="card">
  <div class="head">
    <span>✨</span>
    <span class="head-title">反推提示词</span>
    <span class="chip ${chipCls}">${chipTxt}</span>
    <button class="close-btn" id="closeBtn">×</button>
  </div>
  <div class="modes" id="modeRow"></div>
  <div class="body">
    <div id="idle" style="display:flex;flex-direction:column;align-items:center;padding:12px 0 4px;gap:8px">
      <div style="font-size:11px;color:#6b7a99">选择模式后点击开始分析</div>
      <button class="btn btn-start" id="startBtn">🔍 开始分析</button>
    </div>
    <div id="loading" style="display:none"><div class="spin"></div><div class="lmsg">AI 分析中…</div></div>
    <div id="error"><div class="emsg"></div><button class="btn btn-retry" id="retryBtn">重试</button></div>
    <div id="result">
      <textarea id="promptTa" spellcheck="false"></textarea>
      <div class="row">
        <button class="btn btn-copy" id="copyBtn">📋 复制</button>
        <button class="btn btn-save" id="saveBtn">💾 保存…</button>
      </div>
      <div class="copied" id="copiedHint"></div>
      <div id="saveForm">
        <label>项目</label>
        <select id="projSel"><option value="">加载中…</option></select>
        <label>分类</label>
        <div class="cats" id="catRow"></div>
        <label>标题（选填）</label>
        <input id="titleIn" placeholder="留空自动生成">
        <button class="btn-confirm" id="confirmBtn">✔ 确认保存</button>
      </div>
    </div>
  </div>
</div>`;

    // ── Wiring ──────────────────────────────────────────────────────────────────
    const s = shadow;
    let selectedMode = 'auto';

    // Mode chips
    const modeRow = s.getElementById('modeRow');
    Object.entries(REVERSE_MODES).forEach(([key, m]) => {
      const b = document.createElement('button');
      b.className = 'mode-btn' + (key === 'auto' ? ' on' : '');
      b.textContent = m.label;
      b.onclick = () => {
        selectedMode = key;
        modeRow.querySelectorAll('.mode-btn').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      };
      modeRow.appendChild(b);
    });

    s.getElementById('closeBtn').onclick = removeCard;

    // Start button
    s.getElementById('startBtn').onclick = () => {
      s.getElementById('idle').style.display = 'none';
      s.getElementById('loading').style.display = 'flex';
      doReverse();
    };

    // Retry
    s.getElementById('retryBtn').onclick = () => {
      s.getElementById('error').style.display = 'none';
      s.getElementById('result').style.display = 'none';
      s.getElementById('loading').style.display = 'flex';
      doReverse();
    };

    // Copy
    s.getElementById('copyBtn').onclick = () => {
      const txt = s.getElementById('promptTa').value;
      navigator.clipboard.writeText(txt).then(() => {
        const h = s.getElementById('copiedHint');
        h.textContent = '✅ 已复制';
        setTimeout(() => { h.textContent = ''; }, 1800);
      });
    };

    // Save toggle
    let selectedCat = isVideo ? 'video_prompts' : 'image_prompts';
    s.getElementById('saveBtn').onclick = async () => {
      const form = s.getElementById('saveForm');
      if (form.style.display === 'flex') { form.style.display = 'none'; return; }
      form.style.display = 'flex';
      // Load projects
      try {
        const cfg = await new Promise(r => chrome.storage.sync.get({ serverUrl: 'http://127.0.0.1:8767' }, r));
        const res = await fetch(`${cfg.serverUrl}/api/projects`);
        const projects = await res.json();
        const sel = s.getElementById('projSel');
        sel.innerHTML = projects.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
      } catch { s.getElementById('projSel').innerHTML = '<option value="">⚠️ 连接失败</option>'; }
      // Categories
      const catRow = s.getElementById('catRow');
      catRow.innerHTML = '';
      [{ id:'image_prompts',l:'🖼️ 图片' },{ id:'video_prompts',l:'🎬 视频' },{ id:'skill_prompts',l:'🤖 Skills' }].forEach(c => {
        const b = document.createElement('button');
        b.className = 'cat' + (c.id === selectedCat ? ' on' : '');
        b.textContent = c.l;
        b.onclick = () => {
          selectedCat = c.id;
          catRow.querySelectorAll('.cat').forEach(x => x.classList.remove('on'));
          b.classList.add('on');
        };
        catRow.appendChild(b);
      });
    };

    // Confirm save
    s.getElementById('confirmBtn').onclick = async () => {
      const projectId = s.getElementById('projSel').value;
      if (!projectId) { alert('请选择项目'); return; }
      const prompt = s.getElementById('promptTa').value.trim();
      const title  = s.getElementById('titleIn').value.trim();
      const conf   = s.getElementById('confirmBtn');
      conf.disabled = true; conf.textContent = '保存中…';
      try {
        const cfg = await new Promise(r => chrome.storage.sync.get({ serverUrl:'http://127.0.0.1:8767' }, r));
        const r = await fetch(`${cfg.serverUrl}/api/save-media`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify((() => {
            const MODE_FIELD = { auto:'prompt', outfit:'outfit_prompt', char:'char_prompt', scene:'scene_prompt', style:'style_prompt', cam:'cam_prompt' };
            const field = MODE_FIELD[selectedMode] || 'prompt';
            const payload = {
              url: mediaUrl, mediaType, projectId, category: selectedCat, title, tags: [],
              referer: mediaReferer, pageUrl: location.href, cookie: mediaCookie,
              [field]: prompt
            };
            if (selectedMode === 'auto') { payload.prompt = prompt; payload.analysis = cardAnalysis; }
            return payload;
          })())
        });
        const d = await r.json();
        if (!d.ok) throw new Error(d.error);
        conf.textContent = '✅ 已保存！'; conf.style.background = '#16a34a';
        setTimeout(removeCard, 1200);
      } catch(e) {
        conf.disabled = false; conf.textContent = '✔ 确认保存';
        alert('保存失败：' + e.message);
      }
    };

    // Kick off reverse – call server directly from content script (avoids SW timeout)
    async function doReverse() {
      try {
        const cfg = await new Promise(r =>
          chrome.runtime.sendMessage({ type: 'get-settings' }, res => r(res?.settings || {
            serverUrl: 'http://127.0.0.1:8767',
            imageApiBase: 'https://api.openai.com/v1', imageApiKey: '', imageModel: 'gpt-4o',
            videoApiBase: 'https://generativelanguage.googleapis.com/v1beta', videoApiKey: '', videoModel: 'gemini-2.5-pro',
            imageReverseInstruction: '', videoReverseInstruction: ''
          }))
        );
        // Determine instruction: preset mode overrides custom setting
        const modeInstr = REVERSE_MODES[selectedMode]?.instruction;
        const customInstr = modeInstr ||
          (isVideo ? cfg.videoReverseInstruction : cfg.imageReverseInstruction) || undefined;
        const res = await fetch(`${cfg.serverUrl}/api/reverse-prompt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            url: mediaUrl, mediaType,
            referer: mediaReferer,
            pageUrl: location.href,
            cookie: mediaCookie,
            apiKey:  isVideo ? cfg.videoApiKey  : cfg.imageApiKey,
            apiBase: isVideo ? cfg.videoApiBase : cfg.imageApiBase,
            model:   isVideo ? cfg.videoModel   : cfg.imageModel,
            lang: 'zh',
            customInstruction: customInstr,
            imgWidth:  cardAnchorEl?.naturalWidth  || cardAnchorEl?.videoWidth  || 0,
            imgHeight: cardAnchorEl?.naturalHeight || cardAnchorEl?.videoHeight || 0,
          })
        });
        const data = await res.json();
        deliverResult(data.ok ? { prompt: data.prompt, title: data.title || '', analysis: data.analysis || '' } : { error: data.error || '反推失败' });
      } catch(e) {
        deliverResult({ error: e.message });
      }
    }
    // Don't auto-start – user picks mode first
  }

  // ── Mouse Tracking ─────────────────────────────────────────────────────────
  const HIT_SLOP = 64; // px – keep toolbar visible while cursor is within this zone
  let _scanTime = 0; let _scanCache = null;

  function isEligible(el) {
    if (!el || !el.isConnected) return false;
    const tag = el.tagName;
    if (tag !== 'IMG' && tag !== 'VIDEO') return false;
    const src = el.currentSrc || el.src || el.getAttribute('src') || el.getAttribute('data-src') || '';
    const hasSrcset = !!el.getAttribute('srcset');
    if (!src && !hasSrcset) return false;
    if (src && (src.startsWith('data:') || src.startsWith('blob:chrome-extension'))) return false;
    // Reject bare page URLs (img with empty src resolves to page URL)
    if (src && (src === location.href || src === location.origin + '/') && !hasSrcset) return false;
    const cs = window.getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden' || parseFloat(cs.opacity || '1') < 0.01) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 40) return false;
    if (r.bottom < 8 || r.right < 8 || r.top > window.innerHeight - 8 || r.left > window.innerWidth - 8) return false;
    return true;
  }

  function isEligibleRelaxed(el) {
    if (!el || !el.isConnected || (el.tagName !== 'IMG' && el.tagName !== 'VIDEO')) return false;
    const src = el.currentSrc || el.src || el.getAttribute('src') || el.getAttribute('data-src') || '';
    const hasSrcset = !!el.getAttribute('srcset');
    if (!src && !hasSrcset) return false;
    if (src && (src.startsWith('data:') || src.startsWith('blob:chrome-extension'))) return false;
    const r = el.getBoundingClientRect();
    return r.width >= 8 && r.height >= 8;
  }

  function eligibleAncestor(target, cx, cy) {
    let el = target;
    while (el && el !== document.documentElement) {
      if (isEligible(el)) return el;
      el = el.parentElement;
    }
    // Fallback 1: scan all elements under cursor
    if (cx !== undefined && cy !== undefined) {
      for (const h of document.elementsFromPoint(cx, cy)) {
        if (h === bar || bar.contains(h)) continue;
        if (isEligible(h)) return h;
      }
      // Fallback 2: direct coordinate scan of all imgs/videos (throttled 100ms)
      // handles visibility:hidden, heavy overlays, etc. (e.g. Twitter/X)
      const now = Date.now();
      if (_scanCache) {
        const r = _scanCache.getBoundingClientRect();
        if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom) return _scanCache;
        _scanCache = null;
      }
      if (now - _scanTime > 100) {
        _scanTime = now;
        for (const m of document.querySelectorAll('img,video')) {
          if (m === bar || bar.contains(m)) continue;
          const r = m.getBoundingClientRect();
          if (cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom && isEligibleRelaxed(m)) {
            _scanCache = m; break;
          }
        }
        if (_scanCache) return _scanCache;
      }
    }
    return null;
  }

  function isInHitSlop(x, y) {
    if (!currentEl) return false;
    const r = currentEl.getBoundingClientRect();
    return x >= r.left - HIT_SLOP && x <= r.right  + HIT_SLOP
        && y >= r.top  - HIT_SLOP && y <= r.bottom + HIT_SLOP;
  }

  document.addEventListener('pointermove', (e) => {
    if (isHostBlocked()) return;
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    // Over the bar itself – cancel any pending hide
    if (bar.contains(target)) { clearTimers(); return; }
    // Within hit-slop zone of current image – stay visible
    if (currentEl && bar.classList.contains('visible') && isInHitSlop(e.clientX, e.clientY)) {
      clearTimers(); return;
    }
    const el = eligibleAncestor(target, e.clientX, e.clientY);
    if (el) {
      clearTimers();
      if (el !== currentEl) showTimer = setTimeout(() => showBar(el), 100);
    } else {
      scheduleHide();
    }
  }, { capture: true, passive: true });

  document.addEventListener('pointerleave', scheduleHide, true);

  // Reposition on scroll
  window.addEventListener('scroll', () => {
    if (currentEl && bar.classList.contains('visible')) positionBar(currentEl);
  }, { passive: true });

})();
