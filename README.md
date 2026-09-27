# 灵声 Light（Lingsheng Light）

纯前端 · 在线文字转语音 + 音色匹配

- 文本输入 → 微软 Edge 在线语音免费合成（浏览器直连，无需后端）
- 50+ 音色（中/英/日/韩/法/德/西/俄/葡/粤语/台湾腔）
- 情绪韵律（开心/悲伤/愤怒/惊喜/恐惧/平静 + 强度）
- 音色匹配：上传真人语音，自动分析基频/亮度/语速并推荐最接近音色
- 输出 MP3 / WAV / SRT 字幕

访问：https://radiobz.github.io/lingsheng-light/

## 在线合成被限制时（403 / 连接失败）

页面已内置「内置语音播放」兜底（系统语音，无需联网）。
如需恢复高质量在线合成，可部署免费的 Cloudflare Worker 代理（见 worker/edge-tts-proxy.js，
README 下方有部署步骤；免费额度每天 10 万请求，无需信用卡）。
### Cloudflare Worker 代理部署（可选，恢复高质量在线合成）

1. 打开 https://dash.cloudflare.com → Workers → 创建 Worker
2. 把 `worker/edge-tts-proxy.js` 内容粘贴进去 → 部署
3. 复制部署后的域名，如 `https://xxx.workers.dev`
4. 编辑 `index.html`：在 `const EDGE_TOKEN` 下方加一行
   `S.EDGE_PROXY = 'https://xxx.workers.dev/ws';`（可选，不配置则保持直连）
