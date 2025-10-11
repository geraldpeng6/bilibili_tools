import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.js',
      userscript: {
        name: 'Bilibili Tools',
        namespace: 'http://tampermonkey.net/',
        version: '6.0.0',
        description: '字幕提取、AI总结、Notion集成、笔记保存、播放速度控制、SponsorBlock广告跳过 - 六合一工具集',
        author: 'geraldpeng & claude 4.5 sonnet',
        license: 'MIT',
        match: [
          '*://www.bilibili.com/*',
          '*://search.bilibili.com/*',
          '*://space.bilibili.com/*',
          '*://*/*'
        ],
        grant: [
          'GM_xmlhttpRequest',
          'GM_setValue',
          'GM_getValue',
          'unsafeWindow',
          'GM_registerMenuCommand',
          'GM_addStyle'
        ],
        connect: [
          'api.bilibili.com',
          'aisubtitle.hdslb.com',
          'api.notion.com',
          'openrouter.ai',
          'bsbsb.top',
          '*'
        ],
        require: [
          'https://cdn.jsdelivr.net/npm/marked@11.1.0/marked.min.js'
        ],
        'run-at': 'document-start'
      },
      build: {
        fileName: 'bilibili_tools.user.js'
      }
    })
  ],
  build: {
    target: 'esnext',
    minify: false // 保持代码可读性，方便调试
  }
});

