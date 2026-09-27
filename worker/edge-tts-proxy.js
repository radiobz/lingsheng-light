// 灵声 Light 可选加速通道：Cloudflare Worker 代理
// 用途：当浏览器直连微软 Edge 语音端点被网络/风控拦截（403）时，
//       通过这个 Worker 中转（服务器端可携带 Sec-MS-GEC 签名头），恢复在线合成。
// 部署：1. 在 https://dash.cloudflare.com 创建 Worker，粘贴本文件
//       2. 部署后得到 https://<你的子域>.workers.dev
//       3. 打开 index.html，把末尾 S.EDGE_PROXY = "https://你的子域.workers.dev" 填上即可
// 说明：Cloudflare Workers 免费版每天 10 万请求，个人使用完全够；无需信用卡。

'use strict';

// 计算 Sec-MS-GEC 签名（与 edge-tts 社区实现一致）
async function sha256Hex(str) {
  const data = new TextEncoder().encode(str);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

async function handleRequest(request, ctx) {
  const url = new URL(request.url);
  const isWs = url.pathname === '/ws';
  if (isWs) {
    // 浏览器 WebSocket 握手 → 代理到微软端点
    return handleWs(request, url);
  }
  return new Response('灵声 Light Edge-TTS 代理：请将 index.html 中 S.EDGE_PROXY 指向本 Worker 的 /ws 路径', {
    headers: { 'content-type': 'text/plain; charset=utf-8' }
  });
}

async function handleWs(request, url) {
  const edgeUrl = new URL('wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1');
  edgeUrl.search = url.search; // 透传 TrustedClientToken 与 ConnectionId

  const ms = Date.now();
  const secMsGecRaw = `Drm1.0.0_Edg/130.0.2849.68|${ms}`;
  const secMsGec = btoa(String.fromCharCode(...(await sha256Hex(secMsGecRaw)).match(/../g).map(h => parseInt(h, 16))));

  const headers = {
    'Origin': 'https://speech.platform.bing.com',
    'Sec-MS-GEC': secMsGec,
    'Sec-MS-GEC-Version': '1-130.0.2849.68',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.68'
  };

  // 建立到微软的上游 WebSocket
  const pair = new WebSocketPair();
  const client = pair[0];
  const upstream = new WebSocket(edgeUrl.toString(), [], { headers });
  const ready = new Promise((res, rej) => {
    upstream.addEventListener('open', () => res());
    upstream.addEventListener('error', (e) => rej(new Error('upstream error')));
  });
  await ready;

  upstream.addEventListener('message', (ev) => client.send(ev.data));
  upstream.addEventListener('close', () => client.close(1000, 'upstream closed'));
  upstream.addEventListener('error', () => client.close(1011, 'upstream error'));

  client.addEventListener('message', (ev) => upstream.send(ev.data));
  client.addEventListener('close', () => { try { upstream.close(1000, 'client closed'); } catch (e) {} });

  return new Response(null, { status: 101, webSocket: client });
}

export default {
  fetch: handleRequest
};
