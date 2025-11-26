import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/main.js',
      userscript: {
        name: 'Bilibili & YouTube Tools',
        namespace: 'http://tampermonkey.net/',
        version: '1.3.7',
        description: '跨平台视频工具集：字幕提取、AI总结、Notion集成、笔记保存、播放速度控制、广告跳过 - 支持B站和YouTube',
        author: 'geraldpeng & claude 4.5 sonnet',
        license: 'MIT',
        match: [
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
    minify: 'terser', // 启用代码压缩
    terserOptions: {
      compress: {
        drop_console: false, // 保留 console（用于调试）
        drop_debugger: true,  // 移除 debugger
        pure_funcs: [], // 不移除任何函数调用
      },
      format: {
        comments: false, // 移除注释
      }
    },
    // 优化依赖打包
    rollupOptions: {
      output: {
        // 手动代码分割（为未来模块化做准备）
        manualChunks: {
          // 可以在此定义代码分割策略
        }
      }
    }
  }
});

