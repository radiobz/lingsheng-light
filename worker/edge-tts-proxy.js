// 灵声 Light · Edge TTS 在线合成代理（Cloudflare Worker）
// 用途：浏览器直连微软 Edge 语音端点被风控（403）时，由本 Worker 在服务器端
//       携带 Sec-MS-GEC 签名头转发，恢复高质量在线合成。
// 部署：1. 打开 https://dash.cloudflare.com（免费注册）→ Workers → 创建 Worker
//       2. 把本文件内容整体粘贴到编辑器 → 右上角「部署」
//       3. 部署后得到 https://<你的子域>.workers.dev 域名
//       4. 把域名发给助手，由助手配置到页面 EDGE_PROXY 并推送上线
// 说明：免费版每天 10 万次请求，个人使用完全够；无需信用卡。

import { connect } from 'cloudflare:workers';

const EDGE_VERSION = '130.0.2849.68';

// 计算 Sec-MS-GEC 签名（与 edge-tts 社区实现一致；时间戳按 100 秒窗口对齐）
async function secMsGec() {
  const ticks = (Math.floor(Date.now() / 100000) + 1) * 100000;
  const raw = `Drm1.0.0_Edg/${EDGE_VERSION}|${ticks}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return btoa(hex.match(/../g).map(h => String.fromCharCode(parseInt(h, 16))).join(''));
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/ws') {
      return new Response('灵声 Light Edge-TTS 代理运行中。请把页面中的 EDGE_PROXY 指向本 Worker。', {
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    // 浏览器 WebSocket 握手 → 代理到微软 Edge 语音端点
    const edgeUrl = new URL('wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1');
    edgeUrl.search = url.search; // 透传 TrustedClientToken 与 ConnectionId

    const headers = {
      'Origin': 'https://speech.platform.bing.com',
      'Sec-MS-GEC': await secMsGec(),
      'Sec-MS-GEC-Version': `1-${EDGE_VERSION}`,
      'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/${EDGE_VERSION}`
    };

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    server.accept();

    const upstream = connect(edgeUrl.toString(), { headers });
    await new Promise((resolve, reject) => {
      upstream.addEventListener('open', resolve);
      upstream.addEventListener('error', reject);
    });

    upstream.addEventListener('message', (ev) => server.send(ev.data));
    upstream.addEventListener('close', () => server.close(1000, 'upstream closed'));
    upstream.addEventListener('error', () => { try { server.close(1011, 'upstream error'); } catch (e) {} });

    server.addEventListener('message', (ev) => upstream.send(ev.data));
    server.addEventListener('close', () => { try { upstream.close(1000, 'client closed'); } catch (e) {} });

    return new Response(null, { status: 101, webSocket: client });
  }
};
