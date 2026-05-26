const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const captured = [];

  page.on('response', async (response) => {
    const url = response.url();
    const ct = response.headers()['content-type'] || '';
    const status = response.status();

    // 捕获所有可能是视频的响应
    const isMedia =
      /\.(m3u8|mpd|mp4|ts|flv|webm|mov)([?#]|$)/i.test(url) ||
      /video|audio|mpegurl|m3u8|mpd|octet-stream/i.test(ct) ||
      /stream|hls|dash/i.test(url);

    if (isMedia && status < 400) {
      const entry = { url: url.slice(0, 200), ct, status, type: 'response' };
      if (!captured.some(c => c.url === entry.url)) {
        captured.push(entry);
        console.log(`\n[VIDEO RESPONSE]`);
        console.log(`  URL: ${url.slice(0, 200)}`);
        console.log(`  Content-Type: ${ct}`);
        console.log(`  Status: ${status}`);
      }
    }
  });

  // 也监听所有请求，找视频相关
  page.on('request', (request) => {
    const url = request.url();
    const rt = request.resourceType();
    if (rt === 'media' || /\.(m3u8|mpd|ts|flv)([?#]|$)/i.test(url)) {
      console.log(`\n[MEDIA REQUEST] type=${rt}`);
      console.log(`  URL: ${url.slice(0, 200)}`);
    }
  });

  console.log('正在打开新片场...');
  await page.goto('https://www.xinpianchang.com/a12090881?searchKw=%E9%AD%94%E6%96%B9&from=search_post', {
    waitUntil: 'domcontentloaded',
    timeout: 30000
  });

  console.log('\n页面加载完成，检查视频元素...');
  
  // 等待一下让页面完全加载
  await page.waitForTimeout(3000);

  // 查找 video 元素
  const videoInfo = await page.evaluate(() => {
    const videos = document.querySelectorAll('video');
    return Array.from(videos).map(v => ({
      src: v.src || '',
      currentSrc: v.currentSrc || '',
      tagName: v.tagName,
      readyState: v.readyState,
      paused: v.paused,
      rect: v.getBoundingClientRect()
    }));
  });

  console.log('\n[VIDEO ELEMENTS IN DOM]:', JSON.stringify(videoInfo, null, 2));

  // 查找 iframe
  const iframes = await page.evaluate(() => {
    return Array.from(document.querySelectorAll('iframe')).map(f => ({
      src: f.src,
      id: f.id,
      className: f.className
    }));
  });
  console.log('\n[IFRAMES]:', JSON.stringify(iframes, null, 2));

  // 尝试点击播放
  console.log('\n尝试点击播放按钮...');
  try {
    await page.click('video', { timeout: 3000 });
    await page.waitForTimeout(2000);
    console.log('点击了 video 元素');
  } catch (e) {
    console.log('没有直接的 video 元素，尝试找播放按钮...');
    try {
      // 常见播放按钮选择器
      await page.click('.play-btn, .player-btn, [class*="play"], .vjs-play-control', { timeout: 3000 });
      await page.waitForTimeout(2000);
      console.log('点击了播放按钮');
    } catch (e2) {
      console.log('找不到播放按钮:', e2.message);
    }
  }

  await page.waitForTimeout(3000);

  console.log('\n=== 捕获到的视频相关 URL ===');
  captured.forEach((c, i) => {
    console.log(`\n[${i+1}] ${c.url}`);
    console.log(`     CT: ${c.ct}`);
  });

  if (captured.length === 0) {
    console.log('没有捕获到任何视频 URL！');
    console.log('\n尝试扫描页面源码找 m3u8/mp4...');
    const pageContent = await page.content();
    const m3u8Matches = pageContent.match(/https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*/g) || [];
    const mp4Matches = pageContent.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/g) || [];
    console.log('m3u8 URLs in source:', m3u8Matches.slice(0, 5));
    console.log('mp4 URLs in source:', mp4Matches.slice(0, 5));
  }

  console.log('\n浏览器保持打开，请手动播放视频后按 Ctrl+C 结束...');
  await page.waitForTimeout(15000);
  await browser.close();
})();
