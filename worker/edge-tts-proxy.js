// 灵声 Light · Edge TTS 在线合成代理（Cloudflare Worker）
// 用途：浏览器直连微软 Edge 语音端点被网络/风控拦截时，由本 Worker 在服务器端
//       携带新协议签名（Sec-MS-GEC v2026.09，与 edge-tts 7.2.8 一致）转发，恢复高质量在线合成。
// 部署：1. 打开 https://dash.cloudflare.com（免费注册）→ Workers & Pages → 创建 → 创建 Worker
//       2. 把本文件内容整体粘贴到编辑器（覆盖 Hello World）→ 右上角「部署」
//       3. 部署后得到 https://<你的子域>.workers.dev 域名
//       4. 把域名发给助手，由助手配置到页面 EDGE_PROXY 并推送上线
// 说明：免费版每天 10 万次请求，个人使用完全够；无需信用卡。

import { connect } from 'cloudflare:sockets';

const EDGE_VERSION = '143.0.3650.75';
const EDGE_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4';

// Sec-MS-GEC：Windows 文件时间(1601)+5分钟对齐+拼接 TOKEN，SHA-256 大写 hex
async function secMsGec() {
  const ticks = (BigInt(Math.floor(Date.now() / 1000)) + 11644473600n) / 300n * 300n * 10000000n;
  const raw = `${ticks}${EDGE_TOKEN}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== '/ws') {
      return new Response('灵声 Light Edge-TTS 代理运行中。请把页面中的 EDGE_PROXY 指向本 Worker 的 /ws 路径。', {
        headers: { 'content-type': 'text/plain; charset=utf-8' }
      });
    }

    // 上游端点：签名放 URL query（微软新协议要求），ConnectionId 沿用浏览器传入值
    const connId = (url.searchParams.get('ConnectionId') || crypto.randomUUID().replace(/-/g, '').toUpperCase());
    const edgeUrl = new URL('wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1');
    edgeUrl.searchParams.set('TrustedClientToken', EDGE_TOKEN);
    edgeUrl.searchParams.set('ConnectionId', connId);
    edgeUrl.searchParams.set('Sec-MS-GEC', await secMsGec());
    edgeUrl.searchParams.set('Sec-MS-GEC-Version', `1-${EDGE_VERSION}`);

    const headers = {
      'Pragma': 'no-cache',
      'Cache-Control': 'no-cache',
      'Origin': 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
      'Sec-WebSocket-Version': '13',
      'Cookie': `muid=${crypto.randomUUID().replace(/-/g, '').toUpperCase()};`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36 Edg/143.0.0.0'
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
