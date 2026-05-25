/* canvas-api.js — API service layer for the canvas
   Mirrors infinite-canvas/web/src/services/api/image.ts + video support.
   Exposed on window.Cv.api
*/
(function() {
  'use strict';

  /* ── URL builder ──────────────────────────────────────────────────────── */
  function buildApiUrl(baseUrl, path) {
    const base = (baseUrl || '').trim().replace(/\/+$/, '');
    const withV1 = base.endsWith('/v1') ? base : base + '/v1';
    return withV1 + path;
  }

  function aiHeaders(config, contentType) {
    const h = { 'Authorization': 'Bearer ' + config.apiKey };
    if (contentType) h['Content-Type'] = contentType;
    return h;
  }

  function readFetchError(err, fallback) {
    if (err && err.message) return err.message;
    return fallback;
  }

  async function readResponseError(res, fallback) {
    try {
      const json = await res.json();
      return json?.error?.message || json?.msg || (fallback + ': ' + res.status);
    } catch(e) {
      return fallback + ': ' + res.status;
    }
  }

  /* ── Image generation — POST /v1/images/generations ─────────────────── */
  async function generateImage(config, prompt, opts) {
    opts = opts || {};
    const body = {
      model: opts.model || config.imageModel,
      prompt: prompt,
      n: Math.max(1, Math.min(15, parseInt(opts.count || config.count || '1', 10))),
      response_format: 'b64_json',
    };
    if (opts.quality || config.quality) body.quality = opts.quality || config.quality;
    if (opts.size || config.size) body.size = opts.size || config.size;

    const res = await fetch(buildApiUrl(config.baseUrl, '/images/generations'), {
      method: 'POST',
      headers: aiHeaders(config, 'application/json'),
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(await readResponseError(res, '生图失败'));
    const json = await res.json();
    if (json.code !== undefined && json.code !== 0) throw new Error(json.msg || '生图失败');
    return parseImagePayload(json);
  }

  /* ── Image edit (img2img) — POST /v1/images/edits ───────────────────── */
  async function editImage(config, prompt, referenceImages, opts) {
    opts = opts || {};
    const formData = new FormData();
    formData.set('model', opts.model || config.imageModel);
    formData.set('prompt', prompt);
    formData.set('n', String(Math.max(1, Math.min(15, parseInt(opts.count || config.count || '1', 10)))));
    formData.set('response_format', 'b64_json');
    if (opts.quality || config.quality) formData.set('quality', opts.quality || config.quality);
    if (opts.size || config.size) formData.set('size', opts.size || config.size);

    for (const ref of (referenceImages || [])) {
      const file = await dataUrlToFile(ref.dataUrl || ref.url, ref.name || 'ref.png');
      formData.append('image', file);
    }

    const res = await fetch(buildApiUrl(config.baseUrl, '/images/edits'), {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + config.apiKey },
      body: formData,
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(await readResponseError(res, '图片编辑失败'));
    const json = await res.json();
    if (json.code !== undefined && json.code !== 0) throw new Error(json.msg || '图片编辑失败');
    return parseImagePayload(json);
  }

  /* ── Chat completion (streaming) — POST /v1/chat/completions ─────────── */
  async function chatCompletion(config, messages, onDelta, opts) {
    opts = opts || {};
    const body = {
      model: opts.model || config.textModel || config.imageModel,
      messages: config.systemPrompt
        ? [{ role: 'system', content: config.systemPrompt }, ...messages]
        : messages,
      stream: true,
    };

    const res = await fetch(buildApiUrl(config.baseUrl, '/chat/completions'), {
      method: 'POST',
      headers: aiHeaders(config, 'application/json'),
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(await readResponseError(res, '对话失败'));

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let answer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const delta = JSON.parse(data)?.choices?.[0]?.delta?.content || '';
          if (delta) { answer += delta; onDelta && onDelta(answer); }
        } catch(e) {}
      }
    }
    return answer || '（没有返回内容）';
  }

  /* ── Fetch models — GET /v1/models ──────────────────────────────────── */
  async function fetchModels(config) {
    const res = await fetch(buildApiUrl(config.baseUrl, '/models'), {
      headers: { 'Authorization': 'Bearer ' + config.apiKey },
    });
    if (!res.ok) throw new Error('读取模型列表失败: ' + res.status);
    const json = await res.json();
    return (json.data || [])
      .map(m => typeof m === 'string' ? m : m.id)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));
  }

  /* ── Video generation (async job, provider-agnostic) ────────────────── */
  /* Supports fal.ai, Replicate, Kling, and generic async poll patterns.
     config.videoApiType: 'openai-async' | 'fal' | 'kling' | 'replicate'  */
  async function generateVideo(config, prompt, opts, onProgress) {
    opts = opts || {};
    const apiType = config.videoApiType || 'openai-async';

    if (apiType === 'fal') return _generateVideoFal(config, prompt, opts, onProgress);
    if (apiType === 'kling') return _generateVideoKling(config, prompt, opts, onProgress);
    if (apiType === 'replicate') return _generateVideoReplicate(config, prompt, opts, onProgress);
    if (apiType === 'jimeng-cli') return _generateVideoJimengCli(config, prompt, opts, onProgress);
    return _generateVideoOpenAIAsync(config, prompt, opts, onProgress);
  }

  async function _generateVideoJimengCli(config, prompt, opts, onProgress) {
    const submitBody = {
      prompt,
      model_id: opts.model || config.videoModel || 'seedance-2-fast-cli',
      aspect_ratio: opts.aspect_ratio || '16:9',
      duration_s: Number(opts.duration || 5),
      resolution: opts.resolution || '720p',
      generate_audio: opts.generate_audio !== false,
      video_ref_mode: opts.video_ref_mode || 'imageRef',
      start_image_url: opts.start_image_url,
      end_image_url: opts.end_image_url,
      element_images: opts.element_images,
      ref_video_urls: opts.ref_video_urls,
      ref_audio_urls: opts.ref_audio_urls,
      project_id: opts.project_id || '',
    };

    const res = await fetch('/api/jimeng-cli/generate-video', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(submitBody),
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(await readResponseError(res, '即梦 CLI 提交失败'));
    const json = await res.json();
    const submitId = json.submit_id || json.jobId || json.id;
    if (!submitId) throw new Error('即梦 CLI 未返回任务ID');

    return _pollJimengCliJob(submitId, opts, onProgress);
  }

  async function _pollJimengCliJob(submitId, opts, onProgress) {
    const maxAttempts = 120, interval = 5000;
    for (let i = 0; i < maxAttempts; i++) {
      if (opts.signal?.aborted) throw new Error('已取消');
      await sleep(interval);
      const res = await fetch('/api/jimeng-cli/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submit_id: submitId, project_id: opts.project_id || '' }),
        signal: opts.signal,
      });
      if (!res.ok) continue;
      const json = await res.json();
      onProgress && onProgress(Math.min(90, (i / maxAttempts) * 100));
      const status = String(json.status || 'RUNNING').toUpperCase();
      if (status === 'SUCCEEDED' || status === 'SUCCESS') {
        const videoUrl = json.videoUrl || json.originalVideoUrl || json.url;
        if (!videoUrl) throw new Error('即梦 CLI 未返回视频URL');
        return [{ url: videoUrl, type: 'video' }];
      }
      if (status === 'FAILED' || status === 'ERROR') throw new Error(json.error || '即梦 CLI 生成失败');
    }
    throw new Error('即梦 CLI 视频生成超时');
  }
  async function _generateVideoOpenAIAsync(config, prompt, opts, onProgress) {
    // POST /v1/video/generations → { id } → poll /v1/video/generations/{id}
    const body = {
      model: opts.model || config.videoModel,
      prompt,
      n: 1,
    };
    if (opts.duration) body.duration = opts.duration;
    if (opts.aspect_ratio) body.aspect_ratio = opts.aspect_ratio;
    if (opts.referenceImageUrl) body.image = opts.referenceImageUrl;

    const res = await fetch(buildApiUrl(config.baseUrl, '/video/generations'), {
      method: 'POST',
      headers: aiHeaders(config, 'application/json'),
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(await readResponseError(res, '视频生成提交失败'));
    const json = await res.json();
    const jobId = json.id || json.job_id;
    if (!jobId) throw new Error('视频生成未返回任务ID');

    return _pollVideoJob(config, jobId, opts.signal, onProgress, '/video/generations/');
  }

  async function _generateVideoFal(config, prompt, opts, onProgress) {
    const modelId = opts.model || config.videoModel || 'fal-ai/kling-video/v1.6/pro/text-to-video';
    const res = await fetch(buildApiUrl(config.baseUrl, '/fal/queue/submit'), {
      method: 'POST',
      headers: aiHeaders(config, 'application/json'),
      body: JSON.stringify({ model: modelId, input: { prompt, ...opts.params } }),
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(await readResponseError(res, '视频生成提交失败'));
    const json = await res.json();
    const requestId = json.request_id;
    if (!requestId) throw new Error('未获取到任务ID');

    return _pollFalJob(config, modelId, requestId, opts.signal, onProgress);
  }

  async function _generateVideoKling(config, prompt, opts, onProgress) {
    const body = {
      model_name: opts.model || config.videoModel || 'kling-v1',
      prompt,
      negative_prompt: opts.negativePrompt || '',
      cfg_scale: opts.cfgScale || 0.5,
      mode: opts.mode || 'std',
      duration: String(opts.duration || 5),
      aspect_ratio: opts.aspect_ratio || '16:9',
    };
    if (opts.referenceImageUrl) body.image = opts.referenceImageUrl;

    const res = await fetch((config.baseUrl || '').replace(/\/+$/, '') + '/v1/videos/text2video', {
      method: 'POST',
      headers: aiHeaders(config, 'application/json'),
      body: JSON.stringify(body),
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(await readResponseError(res, '视频生成提交失败'));
    const json = await res.json();
    const taskId = json?.data?.task_id;
    if (!taskId) throw new Error('未获取到任务ID: ' + JSON.stringify(json));

    return _pollKlingJob(config, taskId, opts.signal, onProgress);
  }

  async function _generateVideoReplicate(config, prompt, opts, onProgress) {
    const versionOrModel = opts.model || config.videoModel;
    const res = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + config.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ version: versionOrModel, input: { prompt, ...opts.params } }),
      signal: opts.signal,
    });
    if (!res.ok) throw new Error(await readResponseError(res, '视频生成提交失败'));
    const json = await res.json();
    const predId = json.id;
    if (!predId) throw new Error('未获取到预测ID');

    return _pollReplicateJob(config, predId, opts.signal, onProgress);
  }

  /* ── Polling helpers ─────────────────────────────────────────────────── */
  async function _pollVideoJob(config, jobId, signal, onProgress, basePath) {
    const maxAttempts = 120, interval = 3000;
    for (let i = 0; i < maxAttempts; i++) {
      if (signal?.aborted) throw new Error('已取消');
      await sleep(interval);
      const res = await fetch(buildApiUrl(config.baseUrl, basePath + jobId), {
        headers: aiHeaders(config),
        signal,
      });
      if (!res.ok) continue;
      const json = await res.json();
      onProgress && onProgress(Math.min(90, (i / maxAttempts) * 100));
      const status = json.status || json.state;
      if (status === 'succeeded' || status === 'completed' || status === 'done') {
        const videoUrl = json.output?.[0] || json.data?.[0]?.url || json.url;
        if (!videoUrl) throw new Error('视频生成完成但未返回URL');
        return [{ url: videoUrl, type: 'video' }];
      }
      if (status === 'failed' || status === 'error') throw new Error(json.error || '视频生成失败');
    }
    throw new Error('视频生成超时');
  }

  async function _pollFalJob(config, modelId, requestId, signal, onProgress) {
    const maxAttempts = 120, interval = 3000;
    for (let i = 0; i < maxAttempts; i++) {
      if (signal?.aborted) throw new Error('已取消');
      await sleep(interval);
      const res = await fetch(buildApiUrl(config.baseUrl, '/fal/queue/status/' + requestId), {
        headers: aiHeaders(config), signal,
      });
      if (!res.ok) continue;
      const json = await res.json();
      onProgress && onProgress(json.progress || Math.min(90, (i / maxAttempts) * 100));
      if (json.status === 'COMPLETED') {
        const result = json.output || {};
        const videoUrl = result.video?.url || result.video || (Array.isArray(result) && result[0]?.url);
        if (!videoUrl) throw new Error('fal.ai 未返回视频URL');
        return [{ url: videoUrl, type: 'video' }];
      }
      if (json.status === 'FAILED') throw new Error(json.error || 'fal.ai 生成失败');
    }
    throw new Error('视频生成超时');
  }

  async function _pollKlingJob(config, taskId, signal, onProgress) {
    const maxAttempts = 120, interval = 5000;
    const base = (config.baseUrl || '').replace(/\/+$/, '');
    for (let i = 0; i < maxAttempts; i++) {
      if (signal?.aborted) throw new Error('已取消');
      await sleep(interval);
      const res = await fetch(base + '/v1/videos/text2video/' + taskId, {
        headers: aiHeaders(config), signal,
      });
      if (!res.ok) continue;
      const json = await res.json();
      onProgress && onProgress(Math.min(90, (i / maxAttempts) * 100));
      const status = json?.data?.task_status;
      if (status === 'succeed') {
        const videoUrl = json?.data?.task_result?.videos?.[0]?.url;
        if (!videoUrl) throw new Error('Kling 未返回视频URL');
        return [{ url: videoUrl, type: 'video' }];
      }
      if (status === 'failed') throw new Error(json?.data?.task_status_msg || 'Kling 生成失败');
    }
    throw new Error('视频生成超时');
  }

  async function _pollReplicateJob(config, predId, signal, onProgress) {
    const maxAttempts = 120, interval = 3000;
    for (let i = 0; i < maxAttempts; i++) {
      if (signal?.aborted) throw new Error('已取消');
      await sleep(interval);
      const res = await fetch('https://api.replicate.com/v1/predictions/' + predId, {
        headers: { 'Authorization': 'Bearer ' + config.apiKey }, signal,
      });
      if (!res.ok) continue;
      const json = await res.json();
      onProgress && onProgress(Math.min(90, (i / maxAttempts) * 100));
      if (json.status === 'succeeded') {
        const out = json.output;
        const videoUrl = Array.isArray(out) ? out[0] : out;
        if (!videoUrl) throw new Error('Replicate 未返回视频URL');
        return [{ url: videoUrl, type: 'video' }];
      }
      if (json.status === 'failed') throw new Error(json.error || 'Replicate 生成失败');
    }
    throw new Error('视频生成超时');
  }

  async function jimengCliLoginHeadless(relogin) {
    const res = await fetch('/api/jimeng-cli/login/headless', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relogin: relogin !== false }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) throw new Error(json.error || json.raw || ('登录初始化失败: ' + res.status));
    return json;
  }

  async function jimengCliLoginCheck(deviceCode, poll) {
    const res = await fetch('/api/jimeng-cli/login/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device_code: deviceCode, poll: Number(poll || 5) }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || json.raw || ('登录状态检查失败: ' + res.status));
    return json;
  }

  async function jimengCliUserCredit() {
    const res = await fetch('/api/jimeng-cli/user-credit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.ok === false) throw new Error(json.error || json.raw || ('查询额度失败: ' + res.status));
    return json;
  }
  /* ── Canvas settings ↔ Prompt Studio desktopSettings ────────────────── */
  async function loadCanvasSettingsFromPS() {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return null;
      const settings = await res.json();
      if (settings.canvasConfig) return settings.canvasConfig;
      // Inherit from main PS API config if no canvas-specific config
      return {
        baseUrl: settings.apiBase || '',
        apiKey:  settings.apiKey  || '',
        imageModel: settings.imageModel || settings.model || '',
        textModel:  settings.textModel  || settings.model || '',
        videoModel: '',
      };
    } catch(e) { return null; }
  }

  async function saveCanvasSettingsToPS(patch) {
    try {
      const res = await fetch('/api/settings');
      if (!res.ok) return;
      const settings = await res.json();
      settings.canvasConfig = Object.assign(settings.canvasConfig || {}, patch);
      await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
    } catch(e) {}
  }

  /* ── Image save to Prompt Studio library ─────────────────────────────── */
  async function saveImageToLibrary(dataUrl, meta) {
    try {
      meta = meta || {};
      const blob = dataUrlToBlob(dataUrl);
      const fd = new FormData();
      fd.append('file', blob, 'canvas-gen-' + Date.now() + '.png');
      if (meta.prompt) fd.append('prompt', meta.prompt);
      if (meta.model) fd.append('model', meta.model);
      const res = await fetch('/api/upload', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('保存失败: ' + res.status);
      return await res.json();
    } catch(e) {
      // Fallback: try postMessage to parent
      try {
        window.parent.postMessage({ type: 'SAVE_ASSET', dataUrl, meta }, '*');
      } catch(pe) {}
      throw e;
    }
  }

  /* ── Helpers ─────────────────────────────────────────────────────────── */
  function parseImagePayload(payload) {
    if (payload.code !== undefined && payload.code !== 0) throw new Error(payload.msg || '生图失败');
    const images = (payload.data || []).map(item => {
      if (item.b64_json) return { dataUrl: 'data:image/png;base64,' + item.b64_json, type: 'image' };
      if (item.url) return { url: item.url, type: 'image' };
      return null;
    }).filter(Boolean);
    if (!images.length) throw new Error('接口未返回图片');
    return images;
  }

  async function dataUrlToFile(dataUrl, filename) {
    if (!dataUrl.startsWith('data:')) {
      // It's a URL, fetch it
      const res = await fetch(dataUrl);
      const blob = await res.blob();
      return new File([blob], filename || 'image.png', { type: blob.type });
    }
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
    return new File([u8arr], filename || 'image.png', { type: mime });
  }

  function dataUrlToBlob(dataUrl) {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    const u8arr = new Uint8Array(bstr.length);
    for (let i = 0; i < bstr.length; i++) u8arr[i] = bstr.charCodeAt(i);
    return new Blob([u8arr], { type: mime });
  }

  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ── Export ──────────────────────────────────────────────────────────── */
  window.Cv = window.Cv || {};
  window.Cv.api = {
    buildApiUrl,
    generateImage,
    editImage,
    chatCompletion,
    fetchModels,
    generateVideo,
    jimengCliLoginHeadless,
    jimengCliLoginCheck,
    jimengCliUserCredit,
    saveImageToLibrary,
    loadCanvasSettingsFromPS,
    saveCanvasSettingsToPS,
    dataUrlToFile,
    dataUrlToBlob,
  };

})();




