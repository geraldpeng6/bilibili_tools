// ==UserScript==
// @name         Bilibili Tools
// @namespace    http://tampermonkey.net/
// @version      6.0.1
// @author       geraldpeng & claude 4.5 sonnet
// @description  字幕提取、AI总结、Notion集成、笔记保存、播放速度控制、SponsorBlock广告跳过 - 六合一工具集
// @license      MIT
// @match        *://www.bilibili.com/*
// @match        *://search.bilibili.com/*
// @match        *://space.bilibili.com/*
// @match        *://*/*
// @require      https://cdn.jsdelivr.net/npm/marked@11.1.0/marked.min.js
// @connect      api.bilibili.com
// @connect      aisubtitle.hdslb.com
// @connect      api.notion.com
// @connect      openrouter.ai
// @connect      bsbsb.top
// @connect      *
// @grant        GM_addStyle
// @grant        GM_getValue
// @grant        GM_registerMenuCommand
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  /**
   * 常量定义模块
   * 集中管理所有魔法数字和配置常量
   */

  // ==================== 时间相关常量 ====================
  const TIMING = {
    // 检测间隔
    CHECK_SUBTITLE_INTERVAL: 500,        // 检测字幕按钮的间隔 (ms)
    CHECK_MAX_ATTEMPTS: 20,              // 最多检测次数（10秒）
    
    // 延迟时间
    SUBTITLE_ACTIVATION_DELAY: 1500,    // 激活字幕的延迟
    SUBTITLE_CAPTURE_DELAY: 500,        // 捕获字幕的延迟
    MENU_OPEN_DELAY: 500,               // 打开菜单的延迟
    CLOSE_SUBTITLE_DELAY: 100,          // 关闭字幕显示的延迟
    VIDEO_SWITCH_DELAY: 2000,           // 视频切换后的延迟
    AUTO_ACTIONS_DELAY: 500,            // 自动操作的延迟
    
    // 超时时间
    AI_SUMMARY_TIMEOUT: 120000,         // AI总结超时 (2分钟)
    NOTION_SEND_TIMEOUT: 30000,         // Notion发送超时 (30秒)
    
    // Toast显示时间
    TOAST_DURATION: 2000,               // Toast默认显示时间
  };

  // ==================== 文本长度限制 ====================
  const LIMITS = {
    NOTION_TEXT_CHUNK: 1900,            // Notion单个text对象的最大长度（留安全余量）
    NOTION_TEXT_MAX: 2000,              // Notion官方限制
    NOTION_PAGE_ID_LENGTH: 32,          // Notion Page ID的标准长度
  };

  // ==================== 状态类型 ====================
  const BALL_STATUS = {
    IDLE: 'idle',                       // 初始状态
    LOADING: 'loading',                 // 加载中
    ACTIVE: 'active',                   // 有字幕，可点击
    NO_SUBTITLE: 'no-subtitle',         // 无字幕
    ERROR: 'error',                     // 错误
  };

  // ==================== 事件类型 ====================
  const EVENTS = {
    // 字幕相关
    SUBTITLE_LOADED: 'subtitle:loaded',
    SUBTITLE_FAILED: 'subtitle:failed',
    SUBTITLE_REQUESTED: 'subtitle:requested',
    
    // AI相关
    AI_SUMMARY_START: 'ai:summary:start',
    AI_SUMMARY_COMPLETE: 'ai:summary:complete',
    AI_SUMMARY_FAILED: 'ai:summary:failed',
    AI_SUMMARY_CHUNK: 'ai:summary:chunk',
    
    // Notion相关
    NOTION_SEND_START: 'notion:send:start',
    NOTION_SEND_COMPLETE: 'notion:send:complete',
    NOTION_SEND_FAILED: 'notion:send:failed',
    
    // UI相关
    UI_PANEL_TOGGLE: 'ui:panel:toggle',
    UI_BALL_STATUS_CHANGE: 'ui:ball:status:change',
    
    // 视频相关
    VIDEO_CHANGED: 'video:changed',
  };

  // ==================== AI默认配置 ====================
  const DEFAULT_PROMPT = `请用中文总结以下视频字幕内容，使用Markdown格式输出。

要求：
1. 在开头提供TL;DR（不超过50字的核心摘要）
2. 使用标题、列表等Markdown格式组织内容
3. 突出关键信息和要点

字幕内容：
`;

  const AI_DEFAULT_CONFIGS = [
    {
      id: 'openrouter',
      name: 'OpenRouter',
      url: 'https://openrouter.ai/api/v1/chat/completions',
      apiKey: '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',
      model: 'alibaba/tongyi-deepresearch-30b-a3b:free',
      prompt: DEFAULT_PROMPT,
      isOpenRouter: true
    },
    {
      id: 'openai',
      name: 'OpenAI',
      url: 'https://api.openai.com/v1/chat/completions',
      apiKey: '',
      model: 'gpt-3.5-turbo',
      prompt: DEFAULT_PROMPT,
      isOpenRouter: false
    },
    {
      id: 'siliconflow',
      name: '硅基流动',
      url: 'https://api.siliconflow.cn/v1/chat/completions',
      apiKey: '',
      model: 'Qwen/Qwen2.5-7B-Instruct',
      prompt: DEFAULT_PROMPT,
      isOpenRouter: false
    },
    {
      id: 'deepseek',
      name: 'DeepSeek',
      url: 'https://api.deepseek.com/v1/chat/completions',
      apiKey: '',
      model: 'deepseek-chat',
      prompt: DEFAULT_PROMPT,
      isOpenRouter: false
    },
    {
      id: 'moonshot',
      name: '月之暗面 Kimi',
      url: 'https://api.moonshot.cn/v1/chat/completions',
      apiKey: '',
      model: 'moonshot-v1-8k',
      prompt: DEFAULT_PROMPT,
      isOpenRouter: false
    },
    {
      id: 'zhipu',
      name: '智谱AI',
      url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
      apiKey: '',
      model: 'glm-4-flash',
      prompt: DEFAULT_PROMPT,
      isOpenRouter: false
    },
    {
      id: 'yi',
      name: '零一万物',
      url: 'https://api.lingyiwanwu.com/v1/chat/completions',
      apiKey: '',
      model: 'yi-large',
      prompt: DEFAULT_PROMPT,
      isOpenRouter: false
    },
    {
      id: 'dashscope',
      name: '阿里云百炼',
      url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      apiKey: '',
      model: 'qwen-plus',
      prompt: DEFAULT_PROMPT,
      isOpenRouter: false
    },
    {
      id: 'gemini',
      name: 'Google Gemini',
      url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      apiKey: '',
      model: 'gemini-1.5-flash',
      prompt: DEFAULT_PROMPT,
      isOpenRouter: false
    }
  ];

  // ==================== 存储键名 ====================
  const STORAGE_KEYS = {
    AI_CONFIGS: 'ai_configs',
    AI_SELECTED_ID: 'selected_ai_config_id',
    AI_AUTO_SUMMARY: 'ai_auto_summary_enabled',
    
    NOTION_API_KEY: 'notion_api_key',
    NOTION_PARENT_PAGE_ID: 'notion_parent_page_id',
    NOTION_DATABASE_ID: 'notion_database_id',
    NOTION_AUTO_SEND: 'notion_auto_send_enabled',
  };

  // ==================== Z-Index层级 ====================
  const Z_INDEX = {
    BALL: 2147483647,                   // 最高层
    CONTAINER: 2147483646,              // 次高层
    TOAST: 2147483645,                  // Toast层
    AI_MODAL: 2147483643,               // AI模态框
  };

  // ==================== API相关 ====================
  const API = {
    NOTION_VERSION: '2022-06-28',
    NOTION_BASE_URL: 'https://api.notion.com/v1',
  };

  // ==================== 正则表达式 ====================
  const REGEX = {
    BVID_FROM_PATH: /\/video\/(BV[1-9A-Za-z]{10})/,
    BVID_FROM_URL: /BV[1-9A-Za-z]{10}/,
    NOTION_PAGE_ID: /([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i,
  };

  // ==================== 选择器 ====================
  const SELECTORS = {
    VIDEO: 'video',
    VIDEO_CONTAINER: '.bpx-player-container, #bilibili-player',
    SUBTITLE_BUTTON: '.bpx-player-ctrl-subtitle-result',
    SUBTITLE_CLOSE_SWITCH: '.bpx-player-ctrl-subtitle-close-switch[data-action="close"]',
    VIDEO_TITLE_H1: 'h1.video-title',
  };

  // ==================== SponsorBlock 配置 ====================
  const SPONSORBLOCK = {
    // API配置
    API_URL: 'https://bsbsb.top/api/skipSegments',
    CACHE_EXPIRY: 1800000, // 30分钟
    
    // 视频质量配置
    MIN_SCORE: 0.06,
    MIN_VIEWS: 1000,
    TAG_COLOR: 'linear-gradient(135deg, #FF6B6B, #FF4D4D)',
    TAG_TEXT: '🔥 精选',
    TOP_TAG_COLOR: 'linear-gradient(135deg, #FFD700, #FFA500)',
    TOP_TAG_TEXT: '🏆 顶级',
    // 片段类别配置
    CATEGORIES: {
      'sponsor': { name: '广告', color: '#00d400' },
      'selfpromo': { name: '无偿/自我推广', color: '#ffff00' },
      'interaction': { name: '三连/订阅提醒', color: '#cc00ff' },
      'poi_highlight': { name: '精彩时刻/重点', color: '#ff1684' },
      'intro': { name: '过场/开场动画', color: '#00ffff' },
      'outro': { name: '鸣谢/结束画面', color: '#0202ed' },
      'preview': { name: '回顾/概要', color: '#008fd6' },
      'filler': { name: '离题闲聊/玩笑', color: '#7300FF' },
      'music_offtopic': { name: '音乐:非音乐部分', color: '#ff9900' },
      'exclusive_access': { name: '柔性推广/品牌合作', color: '#008a5c' },
      'mute': { name: '静音片段', color: '#B54D4B' }
    },
    
    // 默认设置
    DEFAULT_SETTINGS: {
      skipCategories: ['sponsor'],
      showAdBadge: true,
      showQualityBadge: true,
      showProgressMarkers: true
    }
  };

  /**
   * 样式模块
   * 集中管理所有CSS样式
   */


  const CSS_STYLES = `
  /* ==================== 小球样式 ==================== */
  #subtitle-ball {
    position: absolute;
    right: -30px;
    top: 50%;
    transform: translateY(-50%);
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background-color: #999;
    cursor: pointer;
    z-index: ${Z_INDEX.BALL};
    box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    transition: all 0.3s ease;
    animation: breath-ball-normal 2s ease-in-out infinite;
  }

  #subtitle-ball:hover {
    transform: translateY(-50%) scale(1.2);
    box-shadow: 0 3px 10px rgba(0,0,0,0.35);
  }

  #subtitle-ball.active {
    background-color: #feebea;
    cursor: pointer;
  }

  #subtitle-ball.loading {
    background-color: #3b82f6;
    animation: breath-ball 1.2s ease-in-out infinite;
  }

  #subtitle-ball.no-subtitle {
    background-color: #999;
    cursor: default;
    opacity: 0.6;
  }

  #subtitle-ball.error {
    background-color: #ff0000;
    cursor: default;
  }

  @keyframes breath-ball-normal {
    0%, 100% { transform: translateY(-50%) scale(1); }
    50% { transform: translateY(-50%) scale(1.05); }
  }

  @keyframes breath-ball {
    0%, 100% { transform: translateY(-50%) scale(1); opacity: 1; }
    50% { transform: translateY(-50%) scale(1.15); opacity: 0.7; }
  }

  /* ==================== 字幕容器样式 ==================== */
  #subtitle-container {
    position: absolute;
    top: 0;
    left: 100%;
    width: 420px;
    height: 100%;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(12px);
    color: #fff;
    border-radius: 16px;
    font-size: 14px;
    line-height: 1.8;
    display: none;
    flex-direction: column;
    overflow: hidden;
    box-shadow: -4px 0 24px rgba(0,0,0,0.5);
    border: 1px solid rgba(254, 235, 234, 0.2);
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    z-index: ${Z_INDEX.CONTAINER - 1};
    margin-left: 10px;
  }

  #subtitle-container.show {
    display: flex;
  }

  /* ==================== 头部样式 ==================== */
  .subtitle-header {
    font-size: 16px;
    font-weight: 700;
    padding: 20px;
    border-bottom: 1px solid rgba(254, 235, 234, 0.2);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
    background: rgba(254, 235, 234, 0.15);
    color: #fff;
    border-radius: 16px 16px 0 0;
    user-select: none;
  }

  .subtitle-header-actions {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .subtitle-close {
    cursor: pointer;
    font-size: 24px;
    line-height: 1;
    color: rgba(255, 255, 255, 0.6);
    opacity: 0.7;
    transition: all 0.2s;
  }

  .subtitle-close:hover {
    opacity: 1;
    color: #fff;
    transform: scale(1.1);
  }

  /* ==================== 内容区域样式 ==================== */
  .subtitle-content {
    flex: 1;
    overflow-y: auto;
    padding: 15px 20px 20px 20px;
    background-color: transparent;
  }

  .subtitle-content::-webkit-scrollbar {
    width: 6px;
  }

  .subtitle-content::-webkit-scrollbar-thumb {
    background-color: rgba(254, 235, 234, 0.4);
    border-radius: 3px;
  }
  
  .subtitle-content::-webkit-scrollbar-thumb:hover {
    background-color: rgba(254, 235, 234, 0.6);
  }
  
  .subtitle-content::-webkit-scrollbar-track {
    background-color: rgba(255, 255, 255, 0.05);
  }

  /* ==================== 字幕列表样式 ==================== */
  .subtitle-toggle-btn {
    padding: 8px 12px;
    margin-bottom: 15px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(254, 235, 234, 0.3);
    border-radius: 8px;
    color: #fff;
    cursor: pointer;
    font-size: 16px;
    transition: all 0.2s;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    width: 100%;
    height: auto;
  }

  .subtitle-toggle-btn:hover {
    background: rgba(254, 235, 234, 0.2);
    border-color: #feebea;
    transform: scale(1.05);
  }

  .subtitle-toggle-icon {
    transition: transform 0.3s ease;
    display: inline-block;
    font-size: 12px;
  }

  .subtitle-toggle-btn.expanded .subtitle-toggle-icon {
    transform: rotate(90deg);
  }

  .subtitle-list-container {
    display: none;
  }

  .subtitle-list-container.expanded {
    display: block;
  }

  .subtitle-item {
    margin-bottom: 6px;
    padding: 10px 12px;
    border-radius: 8px;
    transition: all 0.2s;
    cursor: pointer;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(254, 235, 234, 0.2);
  }

  .subtitle-item:hover {
    background: rgba(254, 235, 234, 0.15);
    border-color: #feebea;
    transform: translateX(4px);
    box-shadow: 0 2px 8px rgba(254, 235, 234, 0.2);
  }

  .subtitle-item.current {
    background: rgba(254, 235, 234, 0.25);
    border-color: #feebea;
    box-shadow: 0 2px 12px rgba(254, 235, 234, 0.3);
  }

  .subtitle-time {
    color: rgba(255, 255, 255, 0.6);
    font-size: 11px;
    margin-bottom: 4px;
    font-weight: 600;
  }

  .subtitle-text {
    color: #e5e7eb;
    font-size: 14px;
    line-height: 1.6;
  }

  /* ==================== AI图标样式 ==================== */
  .ai-icon {
    cursor: pointer;
    width: 24px;
    height: 24px;
    opacity: 0.7;
    transition: opacity 0.2s, transform 0.2s;
  }

  .ai-icon:hover {
    opacity: 1;
    transform: scale(1.1);
  }

  .ai-icon.loading {
    animation: breath-ai 1.2s ease-in-out infinite;
    pointer-events: none;
  }

  .ai-icon.disabled {
    opacity: 0.3;
    pointer-events: none;
    cursor: not-allowed;
  }

  @keyframes breath-ai {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.2); opacity: 0.6; }
  }

  /* ==================== 下载图标样式 ==================== */
  .download-icon {
    cursor: pointer;
    width: 20px;
    height: 20px;
    opacity: 0.7;
    transition: opacity 0.2s, transform 0.2s;
  }

  .download-icon:hover {
    opacity: 1;
    transform: scale(1.1);
  }

  /* ==================== Notion图标样式 ==================== */
  .notion-icon {
    cursor: pointer;
    width: 24px;
    height: 24px;
    opacity: 0.7;
    transition: opacity 0.2s, transform 0.2s;
  }

  .notion-icon:hover {
    opacity: 1;
    transform: scale(1.1);
  }

  .notion-icon.loading {
    animation: breath-notion 1.2s ease-in-out infinite;
  }

  @keyframes breath-notion {
    0%, 100% { transform: scale(1); opacity: 1; }
    50% { transform: scale(1.2); opacity: 0.6; }
  }

  /* ==================== Toast提示样式 ==================== */
  .notion-toast {
    position: fixed;
    top: 80px;
    left: 50%;
    transform: translateX(-50%);
    background-color: rgba(0, 0, 0, 0.85);
    color: white;
    padding: 12px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: ${Z_INDEX.TOAST};
    opacity: 0;
    transition: opacity 0.3s;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }

  .notion-toast.show {
    opacity: 1;
  }

  /* ==================== AI总结样式 ==================== */
  .ai-summary-section {
    padding: 15px;
    margin-bottom: 15px;
    background: rgba(254, 235, 234, 0.1);
    border-radius: 12px;
    border: 1px solid rgba(254, 235, 234, 0.3);
  }

  .ai-summary-title {
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(254, 235, 234, 0.3);
  }

  .ai-summary-content {
    color: #e5e7eb;
    font-size: 14px;
    line-height: 1.7;
    word-wrap: break-word;
  }

  .ai-summary-loading {
    color: rgba(255, 255, 255, 0.6);
    font-style: italic;
  }

  /* ==================== Markdown样式 ==================== */
  .ai-summary-content h1,
  .ai-summary-content h2,
  .ai-summary-content h3 {
    color: #fff;
    margin-top: 12px;
    margin-bottom: 8px;
    font-weight: 700;
  }

  .ai-summary-content h1 { font-size: 17px; }
  .ai-summary-content h2 { font-size: 16px; }
  .ai-summary-content h3 { font-size: 15px; }

  .ai-summary-content ul,
  .ai-summary-content ol {
    margin: 8px 0;
    padding-left: 20px;
  }

  .ai-summary-content li {
    margin: 4px 0;
  }

  .ai-summary-content p {
    margin: 8px 0;
  }

  .ai-summary-content code {
    background: rgba(255, 255, 255, 0.1);
    color: #feebea;
    padding: 3px 6px;
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 13px;
    border: 1px solid rgba(254, 235, 234, 0.2);
  }

  .ai-summary-content pre {
    background: rgba(0, 0, 0, 0.5);
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
    margin: 10px 0;
    border: 1px solid rgba(254, 235, 234, 0.2);
  }

  .ai-summary-content pre code {
    background-color: transparent;
    padding: 0;
    border: none;
  }

  .ai-summary-content blockquote {
    border-left: 4px solid #feebea;
    background: rgba(254, 235, 234, 0.1);
    padding: 12px;
    padding-left: 16px;
    margin: 10px 0;
    border-radius: 4px;
  }

  .ai-summary-content strong {
    color: #fff;
    font-weight: 700;
  }

  .ai-summary-content a {
    color: #feebea;
    text-decoration: underline;
    font-weight: 600;
  }
  
  .ai-summary-content a:hover {
    color: #fff;
  }

  /* ==================== 配置模态框样式 ==================== */
  .config-modal {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: rgba(0, 0, 0, 0.7);
    z-index: ${Z_INDEX.AI_MODAL};
    display: none;
    align-items: center;
    justify-content: center;
  }

  .config-modal.show {
    display: flex;
  }

  .config-modal-content {
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(12px);
    border-radius: 16px;
    padding: 0;
    width: 700px;
    max-width: 90%;
    max-height: 85vh;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    color: #fff;
    display: flex;
    flex-direction: column;
    border: 1px solid rgba(254, 235, 234, 0.2);
  }

  .config-modal-header {
    font-size: 24px;
    font-weight: 700;
    padding: 30px 30px 20px 30px;
    display: flex;
    align-items: center;
    gap: 12px;
    background: rgba(254, 235, 234, 0.15);
    color: white;
    border-radius: 16px 16px 0 0;
    border-bottom: 1px solid rgba(254, 235, 234, 0.2);
  }
  
  .config-modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 30px;
    background-color: transparent;
  }

  .config-field {
    margin-bottom: 20px;
  }

  .config-field label {
    display: block;
    margin-bottom: 10px;
    font-weight: 600;
    color: #e5e7eb;
    font-size: 14px;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  
  .config-field label::before {
    content: '•';
    color: #feebea;
    font-size: 18px;
    font-weight: bold;
  }

  .config-field input,
  .config-field textarea {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid rgba(254, 235, 234, 0.3);
    border-radius: 10px;
    font-size: 14px;
    box-sizing: border-box;
    transition: all 0.2s;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .config-field input:hover,
  .config-field textarea:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(254, 235, 234, 0.5);
  }

  .config-field input:focus,
  .config-field textarea:focus {
    outline: none;
    border-color: #feebea;
    box-shadow: 0 0 0 3px rgba(254, 235, 234, 0.15);
    background: rgba(255, 255, 255, 0.15);
  }

  .config-field input::placeholder,
  .config-field textarea::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  .config-field textarea {
    font-family: inherit;
    resize: vertical;
    min-height: 120px;
    line-height: 1.6;
  }
  
  .config-field input[type="checkbox"] {
    width: auto;
    margin-right: 8px;
    cursor: pointer;
  }

  .config-help {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.6);
    margin-top: 5px;
  }

  .config-help a {
    color: #feebea;
    text-decoration: underline;
  }

  .config-help code {
    background-color: rgba(255, 255, 255, 0.1);
    padding: 2px 6px;
    border-radius: 3px;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #fff;
  }

  .config-help strong {
    color: #feebea;
  }

  .config-footer {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
    padding: 20px 30px;
    background-color: rgba(0, 0, 0, 0.3);
    border-top: 1px solid rgba(254, 235, 234, 0.2);
    border-radius: 0 0 16px 16px;
  }

  .config-btn {
    padding: 12px 24px;
    border: none;
    border-radius: 10px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    position: relative;
    overflow: hidden;
  }

  .config-btn::before {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    width: 0;
    height: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.3);
    transform: translate(-50%, -50%);
    transition: width 0.6s, height 0.6s;
  }

  .config-btn:hover::before {
    width: 300px;
    height: 300px;
  }

  .config-btn-primary {
    background: linear-gradient(135deg, #feebea 0%, #2d2d2d 100%);
    color: #fff;
    box-shadow: 0 4px 12px rgba(254, 235, 234, 0.3);
  }

  .config-btn-primary:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(254, 235, 234, 0.4);
  }

  .config-btn-primary:active {
    transform: translateY(0);
  }

  .config-btn-secondary {
    background-color: #f3f4f6;
    color: #6b7280;
    border: 2px solid #e5e7eb;
  }

  .config-btn-secondary:hover {
    background-color: #e5e7eb;
    color: #374151;
    border-color: #d1d5db;
  }

  .config-btn-danger {
    background-color: #fee2e2;
    color: #dc2626;
    border: 2px solid #fecaca;
  }

  .config-btn-danger:hover {
    background-color: #dc2626;
    color: white;
    border-color: #dc2626;
  }

  .config-status {
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 12px;
    margin-top: 10px;
  }

  .config-status.success {
    background-color: #d4edda;
    color: #155724;
  }

  .config-status.error {
    background-color: #f8d7da;
    color: #721c24;
  }

  /* ==================== AI配置列表样式 ==================== */
  .ai-config-list {
    margin-bottom: 25px;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .ai-config-item {
    padding: 10px 14px;
    border: 1px solid rgba(254, 235, 234, 0.3);
    border-radius: 10px;
    margin-bottom: 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    background: rgba(255, 255, 255, 0.05);
    position: relative;
    overflow: hidden;
  }

  .ai-config-item::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    height: 100%;
    width: 4px;
    background: linear-gradient(135deg, #feebea 0%, #ffdbdb 100%);
    transform: scaleY(0);
    transition: transform 0.3s ease;
  }

  .ai-config-item:hover {
    background: rgba(254, 235, 234, 0.15);
    border-color: #feebea;
    transform: translateX(4px);
    box-shadow: 0 4px 12px rgba(254, 235, 234, 0.2);
  }

  .ai-config-item:hover::before {
    transform: scaleY(1);
  }

  .ai-config-item.selected {
    border-color: #feebea;
    background: rgba(254, 235, 234, 0.2);
    box-shadow: 0 4px 16px rgba(254, 235, 234, 0.3);
  }

  .ai-config-item.selected::before {
    transform: scaleY(1);
    width: 4px;
  }

  .ai-config-item-name {
    font-weight: 600;
    font-size: 14px;
    color: #e5e7eb;
  }

  .ai-config-item.selected .ai-config-item-name {
    color: #fff;
    font-weight: 700;
  }

  .ai-config-item-actions {
    display: flex;
    gap: 8px;
    z-index: 1;
  }

  .ai-config-btn-small {
    padding: 4px 12px;
    font-size: 12px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s;
    font-weight: 500;
  }

  .ai-config-btn-small:hover {
    transform: translateY(-1px);
    box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  }

  .ai-config-btn-small.config-btn-primary {
    background: linear-gradient(135deg, #feebea 0%, #2d2d2d 100%);
    color: white;
  }

  .ai-config-btn-small.config-btn-secondary {
    background-color: #f3f4f6;
    color: #6b7280;
  }

  .ai-config-btn-small.config-btn-secondary:hover {
    background-color: #fee2e2;
    color: #dc2626;
  }

  .ai-config-form {
    border-top: 1px solid rgba(254, 235, 234, 0.2);
    padding-top: 25px;
    margin-top: 10px;
    background: rgba(0, 0, 0, 0.3);
    padding: 25px;
    border-radius: 12px;
    border: 1px solid rgba(254, 235, 234, 0.2);
  }

  .ai-config-form.hidden {
    display: none;
  }

  .ai-config-form .config-field {
    margin-bottom: 20px;
  }

  /* ==================== 模型选择器样式 ==================== */
  .model-select-wrapper {
    margin-top: 8px;
    position: relative;
  }

  .model-search-input {
    width: 100%;
    padding: 10px;
    border: 1px solid rgba(254, 235, 234, 0.3);
    border-radius: 6px;
    font-size: 14px;
    box-sizing: border-box;
    margin-bottom: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .model-search-input:focus {
    outline: none;
    border-color: #feebea;
    box-shadow: 0 0 0 3px rgba(254, 235, 234, 0.15);
    background: rgba(255, 255, 255, 0.15);
  }

  .model-search-input::placeholder {
    color: rgba(255, 255, 255, 0.5);
  }

  .model-select-wrapper select {
    width: 100%;
    padding: 10px;
    border: 1px solid rgba(254, 235, 234, 0.3);
    border-radius: 6px;
    font-size: 14px;
    box-sizing: border-box;
    max-height: 200px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }

  .model-select-wrapper select option {
    padding: 8px;
    background: rgba(0, 0, 0, 0.9);
    color: #fff;
  }

  .model-count-badge {
    display: inline-block;
    background: #feebea;
    color: #1a1a1a;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    margin-left: 8px;
    font-weight: 600;
  }

  .model-field-with-button {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .model-field-with-button input {
    flex: 1;
  }

  .fetch-models-btn {
    padding: 12px 20px;
    font-size: 14px;
    font-weight: 600;
    border: none;
    border-radius: 10px;
    background: linear-gradient(135deg, #feebea 0%, #2d2d2d 100%);
    color: white;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s;
    box-shadow: 0 2px 8px rgba(254, 235, 234, 0.3);
  }

  .fetch-models-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(254, 235, 234, 0.4);
  }

  .fetch-models-btn:active {
    transform: translateY(0);
  }

  .fetch-models-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none !important;
    box-shadow: none;
  }

  /* ==================== 速度控制样式 ==================== */
  .speed-control-section {
    padding: 12px;
    margin-bottom: 15px;
    background: linear-gradient(135deg, #fff5f5 0%, #ffe5e5 100%);
    border-radius: 12px;
    border: 2px solid rgba(254, 235, 234, 0.5);
  }

  .speed-control-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 10px;
    padding-bottom: 8px;
    border-bottom: 2px solid rgba(254, 235, 234, 0.5);
  }

  .speed-control-title {
    font-size: 14px;
    font-weight: 700;
    color: #2d2d2d;
  }

  .speed-control-display {
    font-size: 16px;
    font-weight: 700;
    color: #1a1a1a;
    font-family: monospace;
  }

  .speed-control-buttons {
    display: flex;
    gap: 8px;
    margin-bottom: 10px;
  }

  .speed-btn {
    flex: 1;
    padding: 8px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    background: white;
    color: #1a1a1a;
    cursor: pointer;
    font-size: 14px;
    font-weight: 600;
    transition: all 0.2s;
  }

  .speed-btn:hover {
    background: #feebea;
    border-color: #feebea;
    transform: translateY(-1px);
  }

  .speed-btn-small {
    flex: 0 0 40px;
    font-size: 18px;
  }

  .speed-control-advanced {
    margin-top: 8px;
  }

  .speed-toggle-volume-btn {
    width: 100%;
    padding: 8px;
    border: 2px solid #e5e7eb;
    border-radius: 8px;
    background: white;
    color: #6b7280;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
  }

  .speed-toggle-volume-btn:hover {
    background: #fff5f5;
    border-color: #ffe5e5;
  }

  /* ==================== 笔记面板样式 ==================== */
  .notes-panel {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 600px;
    max-width: 90%;
    max-height: 80vh;
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(12px);
    border-radius: 12px;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
    z-index: 2147483640;
    display: none;
    flex-direction: column;
    overflow: hidden;
    border: 1px solid rgba(254, 235, 234, 0.2);
  }

  .notes-panel.show {
    display: flex;
  }

  .notes-panel-content {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .notes-panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 20px;
    border-bottom: 1px solid rgba(254, 235, 234, 0.2);
    background: rgba(254, 235, 234, 0.15);
  }

  .notes-panel-header h2 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
    color: #fff;
  }

  .notes-panel-close {
    background: none;
    border: none;
    font-size: 24px;
    color: rgba(255, 255, 255, 0.6);
    cursor: pointer;
    padding: 0;
    width: 30px;
    height: 30px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .notes-panel-close:hover {
    background: rgba(255,255,255,0.1);
    color: #fff;
  }

  .notes-panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px;
  }

  .notes-empty-state {
    text-align: center;
    padding: 60px 20px;
    color: rgba(255, 255, 255, 0.6);
  }

  .notes-empty-icon {
    font-size: 48px;
    margin-bottom: 16px;
  }

  .notes-empty-hint {
    font-size: 14px;
    margin-top: 8px;
  }

  .note-group {
    margin-bottom: 24px;
  }

  .note-group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid rgba(254, 235, 234, 0.2);
  }

  .note-group-title {
    font-size: 14px;
    font-weight: 600;
    color: #e5e7eb;
  }

  .note-group-actions {
    display: flex;
    gap: 8px;
  }

  .note-group-copy-btn,
  .note-group-delete-btn {
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;
    transition: all 0.2s;
    border: 1px solid;
  }

  .note-group-copy-btn {
    background: none;
    border-color: #4A90E2;
    color: #4A90E2;
  }

  .note-group-copy-btn:hover {
    background: #4A90E2;
    color: white;
  }

  .note-group-delete-btn {
    background: none;
    border-color: #e74c3c;
    color: #e74c3c;
  }

  .note-group-delete-btn:hover {
    background: #e74c3c;
    color: white;
  }

  .note-item {
    background: rgba(255, 255, 255, 0.05);
    padding: 12px;
    border-radius: 8px;
    margin-bottom: 8px;
    transition: background-color 0.2s;
    border: 1px solid rgba(254, 235, 234, 0.1);
  }

  .note-item:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(254, 235, 234, 0.3);
  }

  .note-content {
    color: #e5e7eb;
    font-size: 14px;
    line-height: 1.6;
    margin-bottom: 8px;
    word-break: break-word;
    white-space: pre-wrap;
  }

  .note-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .note-time {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }

  .note-actions {
    display: flex;
    gap: 8px;
  }

  .note-copy-btn,
  .note-delete-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 12px;
    padding: 4px 8px;
    transition: color 0.2s;
  }

  .note-copy-btn {
    color: #4A90E2;
  }

  .note-copy-btn:hover {
    color: #357ABD;
  }

  .note-delete-btn {
    color: #e74c3c;
  }

  .note-delete-btn:hover {
    color: #c0392b;
  }

  /* ==================== 字幕项保存按钮样式 ==================== */
  .subtitle-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .save-subtitle-note-btn {
    background: linear-gradient(135deg, #feebea 0%, #2d2d2d 100%);
    color: white;
    border: none;
    padding: 2px 8px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    transition: all 0.2s;
    opacity: 0;
  }

  .subtitle-item:hover .save-subtitle-note-btn {
    opacity: 1;
  }

  .save-subtitle-note-btn:hover {
    transform: scale(1.05);
  }

  /* ==================== 快捷键配置样式 ==================== */
  .shortcut-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .shortcut-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border: 1px solid rgba(254, 235, 234, 0.2);
  }

  .shortcut-label {
    font-size: 14px;
    color: #e5e7eb;
    font-weight: 500;
  }

  .shortcut-input-wrapper {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .shortcut-input {
    padding: 6px 12px;
    border: 1px solid rgba(254, 235, 234, 0.3);
    border-radius: 6px;
    font-size: 13px;
    min-width: 180px;
    text-align: center;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    cursor: pointer;
    transition: all 0.2s;
  }

  .shortcut-input:focus {
    outline: none;
    border-color: #feebea;
    box-shadow: 0 0 0 3px rgba(254, 235, 234, 0.15);
    background: rgba(255, 255, 255, 0.15);
  }

  .shortcut-input.capturing {
    border-color: #feebea;
    background: rgba(254, 235, 234, 0.2);
    animation: pulse-border 1s infinite;
  }

  @keyframes pulse-border {
    0%, 100% {
      border-color: #feebea;
      box-shadow: 0 0 0 3px rgba(254, 235, 234, 0.15);
    }
    50% {
      border-color: #ffc9c9;
      box-shadow: 0 0 0 3px rgba(254, 235, 234, 0.3);
    }
  }

  .shortcut-clear-btn {
    background: none;
    border: none;
    color: #999;
    font-size: 18px;
    cursor: pointer;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    transition: all 0.2s;
  }

  .shortcut-clear-btn:hover {
    background: #fee2e2;
    color: #dc2626;
  }

  /* ==================== 调整大小手柄样式 ==================== */
  .subtitle-resize-handle {
    position: absolute;
    bottom: 0;
    right: 0;
    width: 20px;
    height: 20px;
    cursor: nwse-resize;
    z-index: 10;
  }

  .subtitle-resize-handle::after {
    content: '';
    position: absolute;
    bottom: 4px;
    right: 4px;
    width: 12px;
    height: 12px;
    border-right: 3px solid rgba(254, 235, 234, 0.6);
    border-bottom: 3px solid rgba(254, 235, 234, 0.6);
    border-radius: 0 0 4px 0;
  }

  .subtitle-resize-handle:hover::after {
    border-color: #feebea;
  }

  /* ==================== 速度控制模态框样式 ==================== */
  .speed-control-section-large {
    padding: 20px;
    background: rgba(254, 235, 234, 0.1);
    border-radius: 12px;
    border: 1px solid rgba(254, 235, 234, 0.3);
    margin-bottom: 20px;
  }

  .speed-control-header-large {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(254, 235, 234, 0.3);
  }

  .speed-control-display-large {
    font-size: 32px;
    font-weight: 700;
    color: #fff;
    font-family: monospace;
  }

  .speed-control-buttons-large {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }

  .speed-btn-large {
    padding: 16px;
    border: 1px solid rgba(254, 235, 234, 0.3);
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    cursor: pointer;
    font-weight: 600;
    transition: all 0.2s;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
  }

  .speed-btn-large:hover {
    background: rgba(254, 235, 234, 0.2);
    border-color: #feebea;
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(254, 235, 234, 0.3);
  }

  .speed-btn-large:active {
    transform: translateY(0);
  }

  .speed-status-info {
    margin-top: 12px;
    padding: 10px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 8px;
    min-height: 40px;
    border: 1px solid rgba(254, 235, 234, 0.2);
  }

  .speed-status-item {
    font-size: 12px;
    color: #4CAF50;
    font-weight: 600;
    padding: 4px 0;
  }

  .sponsor-switch {
    position: relative;
    width: 48px;
    height: 24px;
  }

  .sponsor-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .sponsor-switch-slider {
    position: absolute;
    cursor: pointer;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background-color: #cbd5e1;
    transition: 0.3s;
    border-radius: 24px;
  }

  .sponsor-switch-slider:before {
    position: absolute;
    content: "";
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.3s;
    border-radius: 50%;
  }

  .sponsor-switch input:checked + .sponsor-switch-slider {
    background-color: #feebea;
  }

  .sponsor-switch input:checked + .sponsor-switch-slider:before {
    transform: translateX(24px);
  }

  /* ==================== SponsorBlock 标签样式 ==================== */
  .bili-quality-tag, .bili-ad-tag {
    display: inline-flex !important;
    align-items: center;
    color: white !important;
    padding: 3px 10px !important;
    border-radius: 15px !important;
    margin-right: 6px !important;
    font-size: 12px !important;
    animation: badgeSlideIn 0.3s ease-out !important;
    position: relative;
    z-index: 2;
    font-weight: 500;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
  }

  /* 视频卡片标签位置 */
  .video-page-card-small .bili-quality-tag,
  .video-page-card-small .bili-ad-tag,
  .bili-video-card__wrap .bili-quality-tag,
  .bili-video-card__wrap .bili-ad-tag {
    position: absolute;
    left: 8px;
    top: 8px;
    transform: scale(0.9);
  }

  /* UP主主页视频卡片 */
  .up-main-video-card .bili-quality-tag,
  .up-main-video-card .bili-ad-tag,
  .small-item .bili-quality-tag,
  .small-item .bili-ad-tag {
    position: absolute !important;
    left: 8px !important;
    top: 8px !important;
    z-index: 10 !important;
    transform: scale(0.9);
  }

  .up-main-video-card .cover-container,
  .up-main-video-card .cover,
  .small-item .cover {
    position: relative !important;
  }

  /* 多标签容器 */
  .bili-tags-container {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  @keyframes badgeSlideIn {
    0% { opacity: 0; transform: translateX(-15px) scale(0.9); }
    100% { opacity: 1; transform: translateX(0) scale(0.9); }
  }

  /* 跳过提示Toast - 视频右下角，绿色 */
  .skip-toast {
    position: absolute;
    bottom: 60px;
    right: 20px;
    background: rgba(0, 212, 0, 0.15);
    color: #00d400;
    padding: 8px 16px;
    border-radius: 4px;
    font-size: 14px;
    z-index: 10000;
    animation: fadeIn 0.3s ease-out;
    font-weight: 500;
    backdrop-filter: blur(4px);
    pointer-events: auto !important;
    user-select: none;
  }

  .skip-toast.hiding {
    animation: fadeOut 0.3s ease-out forwards;
  }

  /* 手动跳过提示 - 视频右下角 */
  .skip-prompt {
    position: absolute;
    bottom: 80px;
    right: 20px;
    background: rgba(0, 0, 0, 0.9);
    color: white;
    border-radius: 8px;
    padding: 12px 16px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.4);
    z-index: 10000;
    min-width: 280px;
    animation: fadeIn 0.3s ease-out;
    pointer-events: auto !important;
    user-select: none;
  }

  .skip-prompt-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 10px;
    font-size: 14px;
    font-weight: 500;
  }

  .skip-prompt-icon {
    width: 20px;
    height: 20px;
    flex-shrink: 0;
  }

  .skip-prompt-icon svg {
    width: 100%;
    height: 100%;
  }

  .skip-prompt-message {
    flex: 1;
  }

  .skip-prompt-buttons {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .skip-prompt-btn {
    padding: 6px 14px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 13px;
    transition: all 0.2s;
  }

  .skip-prompt-btn-primary {
    background: #00a1d6;
    color: white;
  }

  .skip-prompt-btn-primary:hover {
    background: #0087b3;
  }

  .skip-prompt-btn-secondary {
    background: rgba(255, 255, 255, 0.1);
    color: white;
  }

  .skip-prompt-btn-secondary:hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .skip-prompt-close {
    background: none;
    border: none;
    color: #999;
    cursor: pointer;
    font-size: 18px;
    padding: 0;
    width: 20px;
    height: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-left: 8px;
  }

  .skip-prompt-close:hover {
    color: white;
  }

  .skip-prompt.hiding {
    animation: fadeOut 0.3s ease-out forwards;
  }

  /* 进度条片段标记 */
  #sponsorblock-preview-bar {
    overflow: hidden;
    padding: 0;
    margin: 0;
    position: absolute;
    width: 100%;
    height: 100%;
    z-index: 1;
    pointer-events: none;
  }

  .sponsorblock-segment {
    display: inline-block;
    height: 100%;
    position: absolute;
    min-width: 1px;
    opacity: 0.7;
    transition: all 0.2s ease;
    pointer-events: auto;
    cursor: pointer;
  }

  .sponsorblock-segment:hover {
    opacity: 0.95;
    transform: scaleY(1.5);
    z-index: 100;
  }

  /* 片段详情弹窗 */
  .segment-details-popup {
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.95);
    color: white;
    border-radius: 12px;
    padding: 24px;
    min-width: 350px;
    max-width: 500px;
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    z-index: 10002;
    animation: popupFadeIn 0.2s ease-out;
  }

  @keyframes popupFadeIn {
    from {
      opacity: 0;
      transform: translate(-50%, -45%);
    }
    to {
      opacity: 1;
      transform: translate(-50%, -50%);
    }
  }

  .segment-details-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 16px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255,255,255,0.2);
  }

  .segment-details-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 18px;
    font-weight: 500;
  }

  .segment-details-close {
    background: none;
    border: none;
    color: #999;
    font-size: 24px;
    cursor: pointer;
    padding: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: all 0.2s;
  }

  .segment-details-close:hover {
    background: rgba(255,255,255,0.1);
    color: white;
  }

  .segment-details-content {
    margin-bottom: 16px;
  }

  .segment-details-row {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
    font-size: 14px;
  }

  .segment-details-label {
    color: #999;
  }

  .segment-details-value {
    color: white;
    font-weight: 500;
  }

  .segment-details-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }

  .segment-details-btn {
    padding: 8px 16px;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    transition: all 0.2s;
  }

  .segment-details-btn-primary {
    background: #00a1d6;
    color: white;
  }

  .segment-details-btn-primary:hover {
    background: #0087b3;
  }

  .segment-details-btn-secondary {
    background: rgba(255,255,255,0.1);
    color: white;
  }

  .segment-details-btn-secondary:hover {
    background: rgba(255,255,255,0.2);
  }

  .segment-details-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.3);
    z-index: 10001;
  }

  /* SponsorBlock 设置面板样式 */
  .sponsor-settings-section {
    margin-bottom: 24px;
  }

  .sponsor-settings-section h3 {
    font-size: 16px;
    color: #e5e7eb;
    margin: 0 0 12px 0;
  }

  .sponsor-checkbox-group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .sponsor-checkbox-item {
    display: flex;
    align-items: center;
    padding: 8px;
    border-radius: 6px;
    transition: background 0.2s;
  }

  .sponsor-checkbox-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .sponsor-checkbox-item input[type="checkbox"] {
    margin-right: 10px;
    cursor: pointer;
    width: 18px;
    height: 18px;
  }

  .sponsor-checkbox-item label {
    cursor: pointer;
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    color: #e5e7eb;
  }

  .category-color-dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    display: inline-block;
  }

  .sponsor-switch-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(254, 235, 234, 0.2);
    margin-bottom: 8px;
    color: #e5e7eb;
  }
`;

  /**
   * 注入样式到页面
   */
  function injectStyles() {
    const style = document.createElement('style');
    style.textContent = CSS_STYLES;
    document.head.appendChild(style);
  }

  // SVG图标
  const ICONS = {
    AI: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 21L12 12L12.2 6.2L11 5M15 4V2M15 16V14M8 9H10M20 9H22M17.8 11.8L19 13M17.8 6.2L19 5" stroke="#2d2d2d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="12" cy="12" r="1.5" fill="#2d2d2d"/>
    <path d="M17 7L12 12L7 7" stroke="#2d2d2d" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.5"/>
  </svg>`,
    
    DOWNLOAD: `<svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 3V16M12 16L7 11M12 16L17 11" stroke="#2d2d2d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M3 17V19C3 20.1046 3.89543 21 5 21H19C20.1046 21 21 20.1046 21 19V17" stroke="#2d2d2d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`,
    
    NOTION: `<svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M6.017 4.313l55.333 -4.087c6.797 -0.583 8.543 -0.19 12.817 2.917l17.663 12.443c2.913 2.14 3.883 2.723 3.883 5.053v68.243c0 4.277 -1.553 6.807 -6.99 7.193L24.467 99.967c-4.08 0.193 -6.023 -0.39 -8.16 -3.113L3.3 79.94c-2.333 -3.113 -3.3 -5.443 -3.3 -8.167V11.113c0 -3.497 1.553 -6.413 6.017 -6.8z" fill="#fff"/>
    <path fill-rule="evenodd" clip-rule="evenodd" d="M61.35 0.227l-55.333 4.087C1.553 4.7 0 7.617 0 11.113v60.66c0 2.724 0.967 5.053 3.3 8.167l13.007 16.913c2.137 2.723 4.08 3.307 8.16 3.113l64.257 -3.89c5.433 -0.387 6.99 -2.917 6.99 -7.193V20.64c0 -2.21 -0.873 -2.847 -3.443 -4.733L74.167 3.143c-4.273 -3.107 -6.02 -3.5 -12.817 -2.917zM25.92 19.523c-5.247 0.353 -6.437 0.433 -9.417 -1.99L8.927 11.507c-0.77 -0.78 -0.383 -1.753 1.557 -1.947l53.193 -3.887c4.467 -0.39 6.793 1.167 8.54 2.527l9.123 6.61c0.39 0.197 1.36 1.36 0.193 1.36l-54.933 3.307 -0.68 0.047zM19.803 88.3V30.367c0 -2.53 0.777 -3.697 3.103 -3.893L86 22.78c2.14 -0.193 3.107 1.167 3.107 3.693v57.547c0 2.53 -0.39 4.67 -3.883 4.863l-60.377 3.5c-3.493 0.193 -5.043 -0.97 -5.043 -4.083zm59.6 -54.827c0.387 1.75 0 3.5 -1.75 3.7l-2.91 0.577v42.773c-2.527 1.36 -4.853 2.137 -6.797 2.137 -3.107 0 -3.883 -0.973 -6.21 -3.887l-19.03 -29.94v28.967l6.02 1.363s0 3.5 -4.857 3.5l-13.39 0.777c-0.39 -0.78 0 -2.723 1.357 -3.11l3.497 -0.97v-38.3L30.48 40.667c-0.39 -1.75 0.58 -4.277 3.3 -4.473l14.367 -0.967 19.8 30.327v-26.83l-5.047 -0.58c-0.39 -2.143 1.163 -3.7 3.103 -3.89l13.4 -0.78z" fill="#000"/>
  </svg>`};

  /**
   * 验证工具模块
   * 提供各种输入验证和格式检查功能
   */


  /**
   * 验证Notion Page ID格式
   * @param {string} pageId - Page ID
   * @returns {{valid: boolean, cleaned: string|null, error: string|null}}
   */
  function validateNotionPageId(pageId) {
    if (!pageId || typeof pageId !== 'string') {
      return { valid: false, cleaned: null, error: 'Page ID不能为空' };
    }

    // 移除URL，只保留ID
    let cleanedId = pageId.split('?')[0].split('#')[0];
    
    // 提取32位ID
    const match = cleanedId.match(REGEX.NOTION_PAGE_ID);
    if (!match) {
      return { valid: false, cleaned: null, error: 'Page ID格式错误，应为32位十六进制字符' };
    }
    
    // 移除横线，统一格式
    cleanedId = match[1].replace(/-/g, '');
    
    // 验证长度
    if (cleanedId.length !== LIMITS.NOTION_PAGE_ID_LENGTH) {
      return { valid: false, cleaned: null, error: `Page ID长度错误，需要${LIMITS.NOTION_PAGE_ID_LENGTH}位字符` };
    }
    
    return { valid: true, cleaned: cleanedId, error: null };
  }

  /**
   * 验证API URL格式
   * @param {string} url - API URL
   * @returns {{valid: boolean, error: string|null}}
   */
  function validateApiUrl(url) {
    if (!url || typeof url !== 'string') {
      return { valid: false, error: 'URL不能为空' };
    }
    
    // 检查是否以http或https开头
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      return { valid: false, error: 'URL必须以 http:// 或 https:// 开头' };
    }
    
    // 尝试解析URL
    try {
      new URL(url);
      return { valid: true, error: null };
    } catch (e) {
      return { valid: false, error: 'URL格式无效' };
    }
  }

  /**
   * 验证API Key格式
   * @param {string} apiKey - API Key
   * @returns {{valid: boolean, error: string|null}}
   */
  function validateApiKey(apiKey) {
    if (!apiKey || typeof apiKey !== 'string') {
      return { valid: false, error: 'API Key不能为空' };
    }
    
    if (apiKey.trim().length === 0) {
      return { valid: false, error: 'API Key不能为空' };
    }
    
    // 基本长度检查（大多数API Key至少10个字符）
    if (apiKey.length < 10) {
      return { valid: false, error: 'API Key长度过短，请检查是否完整' };
    }
    
    return { valid: true, error: null };
  }

  /**
   * 验证视频信息
   * @param {{bvid: string, cid: string|number}} videoInfo - 视频信息
   * @returns {{valid: boolean, error: string|null}}
   */
  function validateVideoInfo(videoInfo) {
    if (!videoInfo) {
      return { valid: false, error: '视频信息为空' };
    }
    
    if (!videoInfo.bvid || !videoInfo.bvid.match(/^BV[1-9A-Za-z]{10}$/)) {
      return { valid: false, error: 'BV号格式错误' };
    }
    
    if (!videoInfo.cid) {
      return { valid: false, error: 'CID为空' };
    }
    
    return { valid: true, error: null };
  }

  /**
   * 验证字幕数据
   * @param {Array} subtitleData - 字幕数据数组
   * @returns {{valid: boolean, error: string|null}}
   */
  function validateSubtitleData(subtitleData) {
    if (!Array.isArray(subtitleData)) {
      return { valid: false, error: '字幕数据格式错误' };
    }
    
    if (subtitleData.length === 0) {
      return { valid: false, error: '字幕数据为空' };
    }
    
    // 检查第一条字幕的格式
    const first = subtitleData[0];
    if (!first.from || !first.to || !first.content) {
      return { valid: false, error: '字幕数据格式不完整' };
    }
    
    return { valid: true, error: null };
  }

  /**
   * 安全地生成缓存键
   * @param {{bvid: string, cid: string|number}} videoInfo - 视频信息
   * @returns {string|null} - 缓存键，如果无效返回null
   */
  function generateCacheKey(videoInfo) {
    const validation = validateVideoInfo(videoInfo);
    if (!validation.valid) {
      return null;
    }
    
    return `${videoInfo.bvid}-${videoInfo.cid}`;
  }

  /**
   * 事件总线模块
   * 用于解耦不同模块之间的通信
   */

  class EventBus {
    constructor() {
      this.events = new Map();
    }

    /**
     * 订阅事件
     * @param {string} event - 事件名称
     * @param {Function} handler - 事件处理函数
     * @returns {Function} - 取消订阅的函数
     */
    on(event, handler) {
      if (!this.events.has(event)) {
        this.events.set(event, []);
      }
      
      this.events.get(event).push(handler);
      
      // 返回取消订阅的函数
      return () => this.off(event, handler);
    }

    /**
     * 订阅一次性事件
     * @param {string} event - 事件名称
     * @param {Function} handler - 事件处理函数
     */
    once(event, handler) {
      const onceHandler = (...args) => {
        handler(...args);
        this.off(event, onceHandler);
      };
      
      this.on(event, onceHandler);
    }

    /**
     * 取消订阅事件
     * @param {string} event - 事件名称
     * @param {Function} handler - 事件处理函数
     */
    off(event, handler) {
      if (!this.events.has(event)) return;
      
      const handlers = this.events.get(event);
      const index = handlers.indexOf(handler);
      
      if (index > -1) {
        handlers.splice(index, 1);
      }
      
      // 如果没有处理函数了，删除整个事件
      if (handlers.length === 0) {
        this.events.delete(event);
      }
    }

    /**
     * 触发事件
     * @param {string} event - 事件名称
     * @param {...any} args - 传递给处理函数的参数
     */
    emit(event, ...args) {
      if (!this.events.has(event)) return;
      
      const handlers = [...this.events.get(event)]; // 复制数组，避免在遍历时被修改
      
      for (const handler of handlers) {
        try {
          handler(...args);
        } catch (error) {
          console.error(`[EventBus] 事件 "${event}" 处理出错:`, error);
        }
      }
    }

    /**
     * 清空所有事件监听器
     */
    clear() {
      this.events.clear();
    }

    /**
     * 获取某个事件的监听器数量
     * @param {string} event - 事件名称
     * @returns {number}
     */
    listenerCount(event) {
      return this.events.has(event) ? this.events.get(event).length : 0;
    }
  }

  // 创建全局单例
  const eventBus = new EventBus();

  /**
   * 状态管理模块
   * 集中管理应用的所有状态，解决全局变量散乱和竞态条件问题
   */


  class StateManager {
    constructor() {
      this.reset();
    }

    /**
     * 重置所有状态
     * 解决"状态重置不完整"的问题
     */
    reset() {
      // 字幕相关状态
      this.subtitle = {
        data: null,                    // 当前字幕数据
        cache: {},                     // 字幕缓存 {videoKey: subtitleData}
        capturedUrl: null,             // 捕获到的字幕URL
      };

      // 请求相关状态（解决竞态条件）
      this.request = {
        isRequesting: false,           // 是否正在请求
        currentRequestKey: null,       // 当前请求的视频key
        requestPromise: null,          // 当前请求的Promise
        abortController: null,         // 用于取消请求
      };

      // AI相关状态
      this.ai = {
        isSummarizing: false,          // 是否正在生成总结
        currentSummary: null,          // 当前总结内容
        summaryPromise: null,          // 总结Promise
        abortController: null,         // 用于取消AI总结
      };

      // Notion相关状态
      this.notion = {
        isSending: false,              // 是否正在发送
        sendPromise: null,             // 发送Promise
      };

      // UI相关状态
      this.ui = {
        ballStatus: BALL_STATUS.IDLE,  // 小球状态
        panelVisible: false,           // 面板是否可见
        isDragging: false,             // 是否正在拖拽
        dragStart: { x: 0, y: 0 },     // 拖拽起始位置
        panelStart: { x: 0, y: 0 },    // 面板起始位置
      };

      // 视频相关状态
      this.video = {
        bvid: null,                    // 当前视频BV号
        cid: null,                     // 当前视频CID
        aid: null,                     // 当前视频AID
      };
    }

    /**
     * 更新视频信息
     * @param {{bvid: string, cid: string|number, aid: string|number}} videoInfo
     */
    setVideoInfo(videoInfo) {
      const validation = validateVideoInfo(videoInfo);
      if (!validation.valid) {
        return false;
      }

      this.video.bvid = videoInfo.bvid;
      this.video.cid = videoInfo.cid;
      this.video.aid = videoInfo.aid;

      return true;
    }

    /**
     * 获取当前视频信息
     * @returns {{bvid: string, cid: string|number, aid: string|number}}
     */
    getVideoInfo() {
      return { ...this.video };
    }

    /**
     * 生成当前视频的缓存键
     * @returns {string|null}
     */
    getVideoKey() {
      return generateCacheKey(this.video);
    }

    /**
     * 设置字幕数据（同时更新缓存）
     * @param {Array} data - 字幕数据
     */
    setSubtitleData(data) {
      this.subtitle.data = data;
      
      // 更新缓存
      const videoKey = this.getVideoKey();
      if (videoKey) {
        this.subtitle.cache[videoKey] = data;
      }
      
      // 触发事件
      if (data && data.length > 0) {
        eventBus.emit(EVENTS.SUBTITLE_LOADED, data, videoKey);
      }
    }

    /**
     * 获取字幕数据（优先从缓存）
     * @param {string|null} videoKey - 视频键，不传则使用当前视频
     * @returns {Array|null}
     */
    getSubtitleData(videoKey = null) {
      const key = videoKey || this.getVideoKey();
      
      if (!key) {
        return this.subtitle.data;
      }
      
      // 优先从缓存获取
      if (this.subtitle.cache[key]) {
        return this.subtitle.cache[key];
      }
      
      // 如果是当前视频，返回当前数据
      if (key === this.getVideoKey()) {
        return this.subtitle.data;
      }
      
      return null;
    }

    /**
     * 开始请求（原子操作，解决竞态条件）
     * @returns {{success: boolean, reason: string|null}}
     */
    startRequest() {
      const videoKey = this.getVideoKey();
      
      if (!videoKey) {
        return { success: false, reason: '视频信息无效' };
      }

      // 检查是否正在请求相同的视频
      if (this.request.isRequesting && this.request.currentRequestKey === videoKey) {
        return { success: false, reason: '已有相同视频的请求在进行中' };
      }

      // 检查缓存
      if (this.subtitle.cache[videoKey]) {
        return { success: false, reason: '已有缓存' };
      }

      // 如果正在请求其他视频，取消旧请求
      if (this.request.isRequesting) {
        this.cancelRequest();
      }

      // 开始新请求
      this.request.isRequesting = true;
      this.request.currentRequestKey = videoKey;
      
      return { success: true, reason: null };
    }

    /**
     * 完成请求
     */
    finishRequest() {
      this.request.isRequesting = false;
      this.request.currentRequestKey = null;
      this.request.requestPromise = null;
      this.request.abortController = null;
    }

    /**
     * 取消当前请求
     */
    cancelRequest() {
      if (this.request.abortController) {
        this.request.abortController.abort();
      }
      this.finishRequest();
    }

    /**
     * 开始AI总结
     * @returns {boolean}
     */
    startAISummary() {
      if (this.ai.isSummarizing) {
        return false;
      }

      this.ai.isSummarizing = true;
      this.ai.abortController = new AbortController();
      eventBus.emit(EVENTS.AI_SUMMARY_START);
      
      return true;
    }

    /**
     * 完成AI总结
     * @param {string} summary - 总结内容
     */
    finishAISummary(summary) {
      this.ai.isSummarizing = false;
      this.ai.currentSummary = summary;
      this.ai.summaryPromise = null;
      this.ai.abortController = null;
      
      // 保存到sessionStorage
      const videoKey = this.getVideoKey();
      if (videoKey && summary) {
        sessionStorage.setItem(`ai-summary-${videoKey}`, summary);
      }
      
      eventBus.emit(EVENTS.AI_SUMMARY_COMPLETE, summary, videoKey);
    }

    /**
     * 取消AI总结
     */
    cancelAISummary() {
      if (this.ai.abortController) {
        this.ai.abortController.abort();
      }
      this.ai.isSummarizing = false;
      this.ai.summaryPromise = null;
      this.ai.abortController = null;
    }

    /**
     * 获取AI总结（优先从缓存）
     * @param {string|null} videoKey - 视频键
     * @returns {string|null}
     */
    getAISummary(videoKey = null) {
      const key = videoKey || this.getVideoKey();
      
      if (!key) {
        return this.ai.currentSummary;
      }
      
      // 从sessionStorage获取
      const cached = sessionStorage.getItem(`ai-summary-${key}`);
      if (cached) {
        return cached;
      }
      
      // 如果是当前视频，返回当前总结
      if (key === this.getVideoKey()) {
        return this.ai.currentSummary;
      }
      
      return null;
    }

    /**
     * 更新小球状态
     * @param {string} status - 状态值
     */
    setBallStatus(status) {
      if (this.ui.ballStatus !== status) {
        this.ui.ballStatus = status;
        eventBus.emit(EVENTS.UI_BALL_STATUS_CHANGE, status);
      }
    }

    /**
     * 获取小球状态
     * @returns {string}
     */
    getBallStatus() {
      return this.ui.ballStatus;
    }

    /**
     * 切换面板显示状态
     */
    togglePanel() {
      this.ui.panelVisible = !this.ui.panelVisible;
      eventBus.emit(EVENTS.UI_PANEL_TOGGLE, this.ui.panelVisible);
    }

    /**
     * 设置面板显示状态
     * @param {boolean} visible
     */
    setPanelVisible(visible) {
      if (this.ui.panelVisible !== visible) {
        this.ui.panelVisible = visible;
        eventBus.emit(EVENTS.UI_PANEL_TOGGLE, visible);
      }
    }
  }

  // 创建全局单例
  const state = new StateManager();

  /**
   * 配置管理模块
   * 统一管理AI和Notion的配置，避免重复代码
   */


  class ConfigManager {
    /**
     * 获取AI配置列表
     * @returns {Array}
     */
    getAIConfigs() {
      const configs = GM_getValue(STORAGE_KEYS.AI_CONFIGS, []);
      if (configs.length === 0) {
        return [...AI_DEFAULT_CONFIGS]; // 返回默认配置的副本
      }
      return configs;
    }

    /**
     * 保存AI配置列表
     * @param {Array} configs
     */
    saveAIConfigs(configs) {
      GM_setValue(STORAGE_KEYS.AI_CONFIGS, configs);
    }

    /**
     * 获取当前选中的AI配置ID
     * @returns {string}
     */
    getSelectedAIConfigId() {
      return GM_getValue(STORAGE_KEYS.AI_SELECTED_ID, 'openrouter');
    }

    /**
     * 设置当前选中的AI配置ID
     * @param {string} id
     */
    setSelectedAIConfigId(id) {
      GM_setValue(STORAGE_KEYS.AI_SELECTED_ID, id);
    }

    /**
     * 获取当前选中的AI配置
     * @returns {Object|null}
     */
    getSelectedAIConfig() {
      const configs = this.getAIConfigs();
      const selectedId = this.getSelectedAIConfigId();
      return configs.find(c => c.id === selectedId) || configs[0] || null;
    }

    /**
     * 添加AI配置
     * @param {Object} config
     * @returns {{success: boolean, error: string|null}}
     */
    addAIConfig(config) {
      // 验证必填字段
      if (!config.name || !config.url || !config.apiKey || !config.model) {
        return { success: false, error: '所有字段都是必填的' };
      }

      // 验证URL
      const urlValidation = validateApiUrl(config.url);
      if (!urlValidation.valid) {
        return { success: false, error: urlValidation.error };
      }

      // 验证API Key
      const keyValidation = validateApiKey(config.apiKey);
      if (!keyValidation.valid) {
        return { success: false, error: keyValidation.error };
      }

      const configs = this.getAIConfigs();
      const newConfig = {
        id: Date.now().toString(),
        name: config.name.trim(),
        url: config.url.trim(),
        apiKey: config.apiKey.trim(),
        model: config.model.trim(),
        prompt: config.prompt || '根据以下视频字幕，用中文总结视频内容：\n\n',
        isOpenRouter: config.isOpenRouter || false
      };

      configs.push(newConfig);
      this.saveAIConfigs(configs);
      this.setSelectedAIConfigId(newConfig.id);

      return { success: true, error: null, config: newConfig };
    }

    /**
     * 更新AI配置
     * @param {string} id
     * @param {Object} updates
     * @returns {{success: boolean, error: string|null}}
     */
    updateAIConfig(id, updates) {
      const configs = this.getAIConfigs();
      const index = configs.findIndex(c => c.id === id);
      
      if (index === -1) {
        return { success: false, error: '配置不存在' };
      }

      // 验证更新的字段
      if (updates.url) {
        const urlValidation = validateApiUrl(updates.url);
        if (!urlValidation.valid) {
          return { success: false, error: urlValidation.error };
        }
      }

      if (updates.apiKey) {
        const keyValidation = validateApiKey(updates.apiKey);
        if (!keyValidation.valid) {
          return { success: false, error: keyValidation.error };
        }
      }

      configs[index] = { ...configs[index], ...updates };
      this.saveAIConfigs(configs);

      return { success: true, error: null };
    }

    /**
     * 删除AI配置
     * @param {string} id
     * @returns {{success: boolean, error: string|null}}
     */
    deleteAIConfig(id) {
      // 不允许删除预设配置
      if (id === 'openrouter' || id === 'openai') {
        return { success: false, error: '预设配置不能删除' };
      }

      let configs = this.getAIConfigs();
      configs = configs.filter(c => c.id !== id);
      this.saveAIConfigs(configs);

      // 如果删除的是当前选中的配置，切换到默认配置
      if (this.getSelectedAIConfigId() === id) {
        this.setSelectedAIConfigId('openrouter');
      }

      return { success: true, error: null };
    }

    /**
     * 获取AI自动总结开关状态
     * @returns {boolean}
     */
    getAIAutoSummaryEnabled() {
      return GM_getValue(STORAGE_KEYS.AI_AUTO_SUMMARY, true);
    }

    /**
     * 设置AI自动总结开关状态
     * @param {boolean} enabled
     */
    setAIAutoSummaryEnabled(enabled) {
      GM_setValue(STORAGE_KEYS.AI_AUTO_SUMMARY, enabled);
    }

    /**
     * 获取Notion配置
     * @returns {{apiKey: string, parentPageId: string, databaseId: string}}
     */
    getNotionConfig() {
      return {
        apiKey: GM_getValue(STORAGE_KEYS.NOTION_API_KEY, ''),
        parentPageId: GM_getValue(STORAGE_KEYS.NOTION_PARENT_PAGE_ID, ''),
        databaseId: GM_getValue(STORAGE_KEYS.NOTION_DATABASE_ID, '')
      };
    }

    /**
     * 保存Notion配置
     * @param {Object} config
     * @returns {{success: boolean, error: string|null}}
     */
    saveNotionConfig(config) {
      // 验证API Key
      if (config.apiKey) {
        const keyValidation = validateApiKey(config.apiKey);
        if (!keyValidation.valid) {
          return { success: false, error: keyValidation.error };
        }
        GM_setValue(STORAGE_KEYS.NOTION_API_KEY, config.apiKey.trim());
      }

      // 验证Page ID
      if (config.parentPageId) {
        const pageIdValidation = validateNotionPageId(config.parentPageId);
        if (!pageIdValidation.valid) {
          return { success: false, error: pageIdValidation.error };
        }
        GM_setValue(STORAGE_KEYS.NOTION_PARENT_PAGE_ID, pageIdValidation.cleaned);
      }

      // 保存Database ID
      if (config.databaseId !== undefined) {
        GM_setValue(STORAGE_KEYS.NOTION_DATABASE_ID, config.databaseId);
      }

      return { success: true, error: null };
    }

    /**
     * 获取Notion自动发送开关状态
     * @returns {boolean}
     */
    getNotionAutoSendEnabled() {
      return GM_getValue(STORAGE_KEYS.NOTION_AUTO_SEND, false);
    }

    /**
     * 设置Notion自动发送开关状态
     * @param {boolean} enabled
     */
    setNotionAutoSendEnabled(enabled) {
      GM_setValue(STORAGE_KEYS.NOTION_AUTO_SEND, enabled);
    }
  }

  // 创建全局单例
  const config = new ConfigManager();

  /**
   * 辅助函数模块
   * 提供各种通用的辅助功能
   */


  /**
   * 格式化时间（秒转为 MM:SS 格式）
   * @param {number} seconds - 秒数
   * @returns {string} - 格式化后的时间
   */
  function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * 从URL中提取BV号
   * @param {string} url - URL字符串
   * @returns {string|null} - BV号或null
   */
  function extractBvidFromUrl(url = window.location.href) {
    // 方法1: 从路径中精确提取
    const pathMatch = url.match(REGEX.BVID_FROM_PATH);
    if (pathMatch) {
      return pathMatch[1];
    }
    
    // 方法2: 使用通用正则
    const bvMatch = url.match(REGEX.BVID_FROM_URL);
    return bvMatch ? bvMatch[0] : null;
  }

  /**
   * 获取视频信息
   * @returns {{bvid: string|null, cid: string|number|null, aid: string|number|null}}
   */
  function getVideoInfo() {
    let bvid = null;
    let cid = null;
    let aid = null;

    // 从URL提取BV号
    bvid = extractBvidFromUrl();

    // 尝试从页面数据中获取CID和AID
    try {
      const initialState = unsafeWindow.__INITIAL_STATE__;
      if (initialState && initialState.videoData) {
        bvid = bvid || initialState.videoData.bvid;
        cid = initialState.videoData.cid || initialState.videoData.pages?.[0]?.cid;
        aid = initialState.videoData.aid;
      }
    } catch (e) {
      // Silently ignore
    }

    return { bvid, cid, aid };
  }

  /**
   * 获取视频标题
   * @returns {string} - 视频标题
   */
  function getVideoTitle() {
    let title = '';
    
    // 方法1: 从__INITIAL_STATE__获取
    try {
      const initialState = unsafeWindow.__INITIAL_STATE__;
      if (initialState && initialState.videoData && initialState.videoData.title) {
        title = initialState.videoData.title;
      }
    } catch (e) {
      // Silently ignore
    }

    // 方法2: 从h1标签获取
    if (!title) {
      const h1 = document.querySelector(SELECTORS.VIDEO_TITLE_H1);
      if (h1) {
        title = h1.textContent.trim();
      }
    }

    // 方法3: 从document.title提取
    if (!title) {
      title = document.title
        .replace(/_哔哩哔哩.*$/, '')
        .replace(/_bilibili.*$/i, '')
        .trim();
    }

    return title || '未知视频';
  }

  /**
   * 获取视频创作者信息
   * @returns {string} - 创作者名称
   */
  function getVideoCreator() {
    try {
      const initialState = unsafeWindow.__INITIAL_STATE__;
      if (initialState && initialState.videoData && initialState.videoData.owner) {
        return initialState.videoData.owner.name;
      }
    } catch (e) {
      // Silently ignore
    }
    
    return '未知';
  }

  /**
   * 获取视频URL（去除查询参数）
   * @returns {string} - 清理后的视频URL
   */
  function getVideoUrl() {
    return window.location.href.split('?')[0];
  }

  /**
   * 延迟执行
   * @param {number} ms - 延迟时间（毫秒）
   * @returns {Promise<void>}
   */
  function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 带超时的Promise
   * @param {Promise} promise - 原始Promise
   * @param {number} timeout - 超时时间（毫秒）
   * @param {string} errorMessage - 超时错误信息
   * @returns {Promise}
   */
  function withTimeout(promise, timeout, errorMessage = '操作超时') {
    return Promise.race([
      promise,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error(errorMessage)), timeout)
      )
    ]);
  }

  /**
   * 下载文本文件
   * @param {string} content - 文件内容
   * @param {string} filename - 文件名
   * @param {string} mimeType - MIME类型
   */
  function downloadFile(content, filename, mimeType = 'text/plain;charset=utf-8') {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * 字幕服务模块
   * 处理字幕获取、拦截、下载等逻辑
   */


  class SubtitleService {
    constructor() {
      this.capturedSubtitleUrl = null;
      this.setupInterceptor();
    }

    /**
     * 设置字幕请求拦截器
     */
    setupInterceptor() {
      const originalOpen = unsafeWindow.XMLHttpRequest.prototype.open;
      const originalSend = unsafeWindow.XMLHttpRequest.prototype.send;

      unsafeWindow.XMLHttpRequest.prototype.open = function(method, url) {
        this._url = url;
        return originalOpen.apply(this, arguments);
      };

      unsafeWindow.XMLHttpRequest.prototype.send = function() {
        if (this._url && this._url.includes('aisubtitle.hdslb.com')) {
          subtitleService.capturedSubtitleUrl = this._url;
          state.subtitle.capturedUrl = this._url;

          // 捕获到请求后尝试下载
          setTimeout(() => {
            subtitleService.downloadCapturedSubtitle();
          }, TIMING.SUBTITLE_CAPTURE_DELAY);
        }
        return originalSend.apply(this, arguments);
      };
    }

    /**
     * 下载捕获到的字幕
     */
    async downloadCapturedSubtitle() {
      if (!this.capturedSubtitleUrl) {
        return;
      }

      const videoInfo = getVideoInfo();
      state.setVideoInfo(videoInfo);

      // 开始请求（使用状态管理器的原子操作）
      const result = state.startRequest();
      if (!result.success) {
        // 如果是因为已有缓存，直接使用缓存
        if (result.reason === '已有缓存') {
          const cachedData = state.getSubtitleData();
          if (cachedData) {
            state.setBallStatus(BALL_STATUS.ACTIVE);
            eventBus.emit(EVENTS.SUBTITLE_LOADED, cachedData, state.getVideoKey());
          }
        }
        return;
      }

      state.setBallStatus(BALL_STATUS.LOADING);
      eventBus.emit(EVENTS.SUBTITLE_REQUESTED, videoInfo);

      try {
        const subtitleData = await this._fetchSubtitle(this.capturedSubtitleUrl, videoInfo);
        
        // 验证字幕数据
        const validation = validateSubtitleData(subtitleData);
        if (!validation.valid) {
          throw new Error(validation.error);
        }

        // 保存字幕数据（自动更新缓存）
        state.setSubtitleData(subtitleData);
        state.setBallStatus(BALL_STATUS.ACTIVE);

      } catch (error) {
        console.error('[SubtitleService] 字幕获取失败:', error);
        state.setBallStatus(BALL_STATUS.ERROR);
        eventBus.emit(EVENTS.SUBTITLE_FAILED, error.message);
      } finally {
        state.finishRequest();
      }
    }

    /**
     * 获取字幕内容
     * @private
     * @param {string} url - 字幕URL
     * @param {Object} videoInfo - 视频信息
     * @returns {Promise<Array>}
     */
    _fetchSubtitle(url, videoInfo) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: url,
          headers: {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            'Cache-Control': 'no-cache',
            'Origin': 'https://www.bilibili.com',
            'Referer': `https://www.bilibili.com/video/${videoInfo.bvid}/`,
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'cross-site',
            'User-Agent': navigator.userAgent
          },
          anonymous: false,
          onload: (response) => {
            // 验证视频是否切换
            const currentVideoInfo = getVideoInfo();
            if (currentVideoInfo.bvid !== videoInfo.bvid || currentVideoInfo.cid !== videoInfo.cid) {
              reject(new Error('视频已切换'));
              return;
            }

            if (response.status !== 200) {
              reject(new Error(`请求失败: ${response.status}`));
              return;
            }

            // 检查是否返回HTML而非JSON
            if (response.responseText.trim().startsWith('<!DOCTYPE') || 
                response.responseText.trim().startsWith('<html')) {
              reject(new Error('服务器返回HTML而非JSON，可能被重定向'));
              return;
            }

            try {
              const data = JSON.parse(response.responseText);
              
              if (data.body && data.body.length > 0) {
                resolve(data.body);
              } else {
                reject(new Error('字幕内容为空'));
              }
            } catch (e) {
              reject(new Error('解析字幕数据失败'));
            }
          },
          onerror: () => {
            reject(new Error('网络请求失败'));
          }
        });
      });
    }

    /**
     * 检测字幕按钮
     */
    async checkSubtitleButton() {
      let checkCount = 0;
      
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          checkCount++;

          const subtitleButton = document.querySelector(SELECTORS.SUBTITLE_BUTTON);

          if (subtitleButton) {
            clearInterval(checkInterval);
            this.tryActivateSubtitle();
            resolve(true);
          } else if (checkCount >= TIMING.CHECK_MAX_ATTEMPTS) {
            clearInterval(checkInterval);
            state.setBallStatus(BALL_STATUS.NO_SUBTITLE);
            resolve(false);
          }
        }, TIMING.CHECK_SUBTITLE_INTERVAL);
      });
    }

    /**
     * 尝试激活字幕
     */
    async tryActivateSubtitle() {
      await delay(TIMING.SUBTITLE_ACTIVATION_DELAY);

      if (this.capturedSubtitleUrl) {
        this.downloadCapturedSubtitle();
      } else {
        this.triggerSubtitleSelection();
      }
    }

    /**
     * 触发字幕选择
     */
    async triggerSubtitleSelection() {
      const subtitleResultBtn = document.querySelector(SELECTORS.SUBTITLE_BUTTON);

      if (!subtitleResultBtn) {
        state.setBallStatus(BALL_STATUS.NO_SUBTITLE);
        return;
      }

      // 点击字幕按钮
      subtitleResultBtn.click();

      await delay(TIMING.MENU_OPEN_DELAY);

      // 查找中文字幕选项
      let chineseOption = document.querySelector('.bpx-player-ctrl-subtitle-language-item[data-lan="ai-zh"]');

      if (!chineseOption) {
        chineseOption = document.querySelector('.bpx-player-ctrl-subtitle-language-item[data-lan*="zh"]');
      }

      if (!chineseOption) {
        const allOptions = document.querySelectorAll('.bpx-player-ctrl-subtitle-language-item');
        for (let option of allOptions) {
          const text = option.querySelector('.bpx-player-ctrl-subtitle-language-item-text');
          if (text && text.textContent.includes('中文')) {
            chineseOption = option;
            break;
          }
        }
      }

      if (chineseOption) {
        chineseOption.click();

        // 立即关闭字幕显示（无感操作）
        await delay(TIMING.CLOSE_SUBTITLE_DELAY);
        const closeBtn = document.querySelector(SELECTORS.SUBTITLE_CLOSE_SWITCH);
        if (closeBtn) {
          closeBtn.click();
        }

        // 等待字幕请求被捕获
        await delay(TIMING.SUBTITLE_ACTIVATION_DELAY);
        
        if (this.capturedSubtitleUrl) {
          this.downloadCapturedSubtitle();
        } else {
          state.setBallStatus(BALL_STATUS.ERROR);
        }
      } else {
        // 尝试第一个选项
        const firstOption = document.querySelector('.bpx-player-ctrl-subtitle-language-item');
        if (firstOption) {
          firstOption.click();
          await delay(TIMING.CLOSE_SUBTITLE_DELAY);
          
          const closeBtn = document.querySelector(SELECTORS.SUBTITLE_CLOSE_SWITCH);
          if (closeBtn) closeBtn.click();
          
          await delay(TIMING.SUBTITLE_ACTIVATION_DELAY);
          
          if (this.capturedSubtitleUrl) {
            this.downloadCapturedSubtitle();
          } else {
            state.setBallStatus(BALL_STATUS.ERROR);
          }
        } else {
          subtitleResultBtn.click();
          state.setBallStatus(BALL_STATUS.NO_SUBTITLE);
        }
      }
    }

    /**
     * 下载字幕文件
     */
    downloadSubtitleFile() {
      const subtitleData = state.getSubtitleData();
      
      if (!subtitleData || subtitleData.length === 0) {
        throw new Error('没有字幕数据可下载');
      }

      const videoInfo = state.getVideoInfo();
      const videoTitle = getVideoTitle();
      const content = subtitleData.map(item => item.content).join('\n');
      const filename = `${videoTitle}_${videoInfo.bvid}_字幕.txt`;

      downloadFile(content, filename);
    }

    /**
     * 重置状态（用于视频切换）
     */
    reset() {
      this.capturedSubtitleUrl = null;
      state.subtitle.capturedUrl = null;
    }
  }

  // 创建全局单例
  const subtitleService = new SubtitleService();

  /**
   * AI服务模块
   * 处理AI总结相关的所有逻辑，修复内存泄漏问题
   */


  class AIService {
    /**
     * 获取OpenRouter模型列表
     * @param {string} apiKey - API Key
     * @param {string} url - API URL
     * @returns {Promise<Array>}
     */
    async fetchOpenRouterModels(apiKey, url) {
      const modelsUrl = url.replace('/chat/completions', '/models');
      
      const response = await fetch(modelsUrl, {
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      });

      if (!response.ok) {
        throw new Error(`获取模型列表失败: ${response.status}`);
      }

      const data = await response.json();
      return data.data || [];
    }

    /**
     * 生成AI总结
     * @param {Array} subtitleData - 字幕数据
     * @param {boolean} isAuto - 是否自动触发
     * @returns {Promise<string>}
     */
    async summarize(subtitleData, isAuto = false) {
      // 检查是否正在总结
      if (!state.startAISummary()) {
        throw new Error('已有总结任务在进行中');
      }

      try {
        const aiConfig = config.getSelectedAIConfig();
        
        if (!aiConfig || !aiConfig.apiKey) {
          throw new Error('请先配置 AI API Key');
        }

        // 验证配置
        if (!aiConfig.url || !aiConfig.url.startsWith('http')) {
          throw new Error('API URL格式错误');
        }

        if (!aiConfig.model) {
          throw new Error('未配置模型');
        }

        // 生成字幕文本
        const subtitleText = subtitleData.map(item => item.content).join('\n');

        // 构建请求头
        const headers = {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aiConfig.apiKey}`
        };

        // OpenRouter需要额外的headers
        if (aiConfig.isOpenRouter) {
          headers['HTTP-Referer'] = window.location.origin;
          headers['X-Title'] = 'Bilibili Subtitle Extractor';
        }

        const requestBody = {
          model: aiConfig.model,
          messages: [
            {
              role: 'user',
              content: aiConfig.prompt + subtitleText
            }
          ],
          stream: true
        };

        // 使用超时机制发起请求（修复内存泄漏问题）
        const summaryPromise = this._streamingRequest(aiConfig.url, headers, requestBody);
        
        // 添加超时保护
        const summary = await withTimeout(
          summaryPromise,
          TIMING.AI_SUMMARY_TIMEOUT,
          'AI总结超时，请稍后重试'
        );

        // 完成总结
        state.finishAISummary(summary);
        
        return summary;

      } catch (error) {
        // 发生错误时，确保状态正确重置
        state.cancelAISummary();
        eventBus.emit(EVENTS.AI_SUMMARY_FAILED, error.message);
        throw error;
      }
    }

    /**
     * 流式请求处理
     * @private
     * @param {string} url - API URL
     * @param {Object} headers - 请求头
     * @param {Object} body - 请求体
     * @returns {Promise<string>}
     */
    async _streamingRequest(url, headers, body) {
      const response = await fetch(url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
        signal: state.ai.abortController?.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[AIService] API错误响应:', errorText);
        throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;

              try {
                const json = JSON.parse(data);
                const content = json.choices[0]?.delta?.content;
                if (content) {
                  accumulatedText += content;
                  // 触发chunk事件，供UI实时更新
                  eventBus.emit(EVENTS.AI_SUMMARY_CHUNK, accumulatedText);
                }
              } catch (e) {
                // 跳过解析错误
              }
            }
          }
        }

        return accumulatedText;

      } finally {
        reader.releaseLock();
      }
    }

    /**
     * 取消当前的AI总结
     */
    cancelCurrentSummary() {
      state.cancelAISummary();
    }
  }

  // 创建全局单例
  const aiService = new AIService();

  /**
   * Notion服务模块
   * 处理Notion集成相关的所有逻辑，使用Promise替代回调地狱
   */


  class NotionService {
    /**
     * 发送字幕到Notion
     * @param {Array} subtitleData - 字幕数据
     * @param {boolean} isAuto - 是否自动发送
     * @returns {Promise<void>}
     */
    async sendSubtitle(subtitleData, isAuto = false) {
      const notionConfig = config.getNotionConfig();

      if (!notionConfig.apiKey) {
        throw new Error('请先配置 Notion API Key');
      }

      if (!subtitleData || subtitleData.length === 0) {
        throw new Error('没有字幕数据可发送');
      }

      state.notion.isSending = true;
      eventBus.emit(EVENTS.NOTION_SEND_START);

      try {
        const videoInfo = state.getVideoInfo();
        const videoTitle = getVideoTitle();
        const videoUrl = getVideoUrl();
        const creator = getVideoCreator();

        // 构建页面内容
        const pageChildren = this._buildPageContent(videoInfo, videoTitle, videoUrl, subtitleData);

        // 根据配置决定使用数据库ID还是页面ID
        let databaseId = notionConfig.databaseId;

        if (!databaseId) {
          // 首次使用，尝试识别是Database ID还是Page ID
          if (!notionConfig.parentPageId) {
            throw new Error('请先配置目标位置（Page ID 或 Database ID）');
          }

          // 尝试作为Database ID使用
          databaseId = notionConfig.parentPageId;
        }

        // 获取数据库结构并填充数据
        const schema = await this._getDatabaseSchema(notionConfig.apiKey, databaseId);
        const properties = this._buildProperties(schema, videoInfo, videoTitle, videoUrl, creator, subtitleData);

        // 创建页面
        await this._createPage(notionConfig.apiKey, databaseId, properties, pageChildren);

        // 保存database ID（如果是首次使用）
        if (!notionConfig.databaseId) {
          config.saveNotionConfig({ databaseId });
        }

        state.notion.isSending = false;
        eventBus.emit(EVENTS.NOTION_SEND_COMPLETE);

      } catch (error) {
        state.notion.isSending = false;
        eventBus.emit(EVENTS.NOTION_SEND_FAILED, error.message);
        throw error;
      }
    }

    /**
     * 创建Bilibili数据库
     * @param {string} apiKey - API Key
     * @param {string} parentPageId - 父页面ID
     * @returns {Promise<string>} - 返回创建的数据库ID
     */
    async createDatabase(apiKey, parentPageId) {
      const databaseData = {
        parent: {
          type: 'page_id',
          page_id: parentPageId
        },
        title: [
          {
            type: 'text',
            text: { content: '📺 Bilibili 字幕收藏' }
          }
        ],
        properties: {
          '标题': { title: {} },
          'BV号': { rich_text: {} },
          '创作者': { rich_text: {} },
          '视频链接': { url: {} },
          '收藏时间': { date: {} },
          '字幕条数': { number: {} },
          '状态': { select: { options: [
            { name: '未总结', color: 'gray' },
            { name: '已总结', color: 'green' }
          ]}},
          '总结': { rich_text: {} }
        }
      };

      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'POST',
          url: `${API.NOTION_BASE_URL}/databases`,
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Notion-Version': API.NOTION_VERSION
          },
          data: JSON.stringify(databaseData),
          onload: (response) => {
            if (response.status === 200) {
              const data = JSON.parse(response.responseText);
              resolve(data.id);
            } else {
              const error = this._parseNotionError(response);
              reject(error);
            }
          },
          onerror: (error) => {
            reject(new Error('网络请求失败'));
          }
        });
      });
    }

    /**
     * 获取数据库结构
     * @private
     * @param {string} apiKey - API Key
     * @param {string} databaseId - 数据库ID
     * @returns {Promise<Object>}
     */
    _getDatabaseSchema(apiKey, databaseId) {
      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: `${API.NOTION_BASE_URL}/databases/${databaseId}`,
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Notion-Version': API.NOTION_VERSION
          },
          onload: (response) => {
            if (response.status === 200) {
              const data = JSON.parse(response.responseText);
              resolve(data.properties);
            } else {
              const error = this._parseNotionError(response);
              reject(error);
            }
          },
          onerror: () => {
            reject(new Error('获取数据库结构失败'));
          }
        });
      });
    }

    /**
     * 创建页面
     * @private
     * @param {string} apiKey - API Key
     * @param {string} databaseId - 数据库ID
     * @param {Object} properties - 页面属性
     * @param {Array} children - 页面内容
     * @returns {Promise<Object>}
     */
    _createPage(apiKey, databaseId, properties, children) {
      const pageData = {
        parent: { database_id: databaseId },
        properties: properties,
        children: children
      };

      return new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'POST',
          url: `${API.NOTION_BASE_URL}/pages`,
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
            'Notion-Version': API.NOTION_VERSION
          },
          data: JSON.stringify(pageData),
          onload: (response) => {
            if (response.status === 200) {
              const data = JSON.parse(response.responseText);
              resolve(data);
            } else {
              const error = this._parseNotionError(response);
              reject(error);
            }
          },
          onerror: () => {
            reject(new Error('创建页面失败'));
          }
        });
      });
    }

    /**
     * 构建页面内容
     * @private
     * @param {Object} videoInfo - 视频信息
     * @param {string} videoTitle - 视频标题
     * @param {string} videoUrl - 视频URL
     * @param {Array} subtitleData - 字幕数据
     * @returns {Array}
     */
    _buildPageContent(videoInfo, videoTitle, videoUrl, subtitleData) {
      const children = [
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: '📹 视频信息' } }]
          }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: `视频标题：${videoTitle}` } }]
          }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: `BV号：${videoInfo.bvid}` } }]
          }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: `视频链接：${videoUrl}` } }]
          }
        },
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ type: 'text', text: { content: `字幕总数：${subtitleData.length} 条` } }]
          }
        },
        {
          object: 'block',
          type: 'divider',
          divider: {}
        },
        {
          object: 'block',
          type: 'heading_2',
          heading_2: {
            rich_text: [{ type: 'text', text: { content: '📝 字幕内容' } }]
          }
        }
      ];

      // 构建字幕rich_text数组
      const subtitleRichTextArray = [];
      let currentText = '';
      const maxTextLength = LIMITS.NOTION_TEXT_CHUNK;

      for (let item of subtitleData) {
        const line = `${item.content}\n`;

        if (currentText.length + line.length > maxTextLength) {
          if (currentText) {
            subtitleRichTextArray.push({
              type: 'text',
              text: { content: currentText }
            });
          }
          currentText = line;
        } else {
          currentText += line;
        }
      }

      // 添加最后一段
      if (currentText) {
        subtitleRichTextArray.push({
          type: 'text',
          text: { content: currentText }
        });
      }

      // 添加字幕代码块
      children.push({
        object: 'block',
        type: 'code',
        code: {
          rich_text: subtitleRichTextArray,
          language: 'plain text'
        }
      });

      return children;
    }

    /**
     * 构建数据库属性
     * @private
     * @param {Object} schema - 数据库结构
     * @param {Object} videoInfo - 视频信息
     * @param {string} videoTitle - 视频标题
     * @param {string} videoUrl - 视频URL
     * @param {string} creator - 创作者
     * @param {Array} subtitleData - 字幕数据
     * @returns {Object}
     */
    _buildProperties(schema, videoInfo, videoTitle, videoUrl, creator, subtitleData) {
      const properties = {};

      // 查找title类型的字段（必须存在）
      const titleField = Object.keys(schema).find(key => schema[key].type === 'title');
      if (titleField) {
        properties[titleField] = {
          title: [{ text: { content: videoTitle } }]
        };
      }

      // 智能匹配其他字段
      Object.keys(schema).forEach(fieldName => {
        const fieldType = schema[fieldName].type;
        const lowerFieldName = fieldName.toLowerCase().replace(/\s+/g, '');

        // BV号字段
        if (lowerFieldName.includes('bv') && (fieldType === 'rich_text' || fieldType === 'text')) {
          properties[fieldName] = {
            rich_text: [{ text: { content: videoInfo.bvid || '' } }]
          };
        }

        // 创作者字段
        if ((lowerFieldName.includes('创作') || lowerFieldName.includes('作者') || 
             lowerFieldName.includes('creator') || lowerFieldName.includes('up主')) &&
            (fieldType === 'rich_text' || fieldType === 'text')) {
          properties[fieldName] = {
            rich_text: [{ text: { content: creator } }]
          };
        }

        // 视频链接字段
        if (lowerFieldName.includes('链接') && fieldType === 'url') {
          properties[fieldName] = { url: videoUrl };
        }

        // 日期字段
        if (fieldType === 'date' && (
          lowerFieldName === '日期' ||
          lowerFieldName.includes('收藏') ||
          lowerFieldName.includes('添加') ||
          lowerFieldName.includes('创建'))) {
          properties[fieldName] = {
            date: { start: new Date().toISOString() }
          };
        }

        // 数量字段
        if ((lowerFieldName.includes('条数') || lowerFieldName.includes('数量')) && 
            fieldType === 'number') {
          properties[fieldName] = { number: subtitleData.length };
        }

        // 状态字段
        if (lowerFieldName === '状态' || lowerFieldName === 'status') {
          const videoKey = state.getVideoKey();
          const hasSummary = videoKey ? state.getAISummary(videoKey) : null;
          
          if (fieldType === 'select' || fieldType === 'status') {
            properties[fieldName] = {
              [fieldType]: { name: hasSummary ? '已总结' : '未总结' }
            };
          } else if (fieldType === 'rich_text') {
            properties[fieldName] = {
              rich_text: [{ text: { content: hasSummary ? '已总结' : '未总结' } }]
            };
          }
        }

        // 总结字段
        if (lowerFieldName === '总结' || lowerFieldName === 'summary') {
          const videoKey = state.getVideoKey();
          const summary = videoKey ? state.getAISummary(videoKey) : null;
          
          if (fieldType === 'rich_text' && summary) {
            properties[fieldName] = {
              rich_text: [{ text: { content: summary.substring(0, LIMITS.NOTION_TEXT_MAX) } }]
            };
          }
        }
      });

      return properties;
    }

    /**
     * 解析Notion错误响应
     * @private
     * @param {Object} response - 响应对象
     * @returns {Error}
     */
    _parseNotionError(response) {
      try {
        const error = JSON.parse(response.responseText);
        
        // 特殊处理常见错误
        if (error.code === 'object_not_found' || error.message?.includes('Could not find')) {
          return new Error('找不到指定的Notion页面或数据库，请检查：\n1. ID是否正确\n2. 是否已在Notion中授权该Integration');
        }
        
        return new Error(error.message || '未知错误');
      } catch (e) {
        return new Error(`请求失败: ${response.status}`);
      }
    }
  }

  // 创建全局单例
  const notionService = new NotionService();

  /**
   * 笔记服务模块
   * 管理用户选中文字的笔记保存和管理
   */

  const NOTES_CONFIG = {
    STORAGE_KEY: 'bilibili_subtitle_notes',
    BLUE_DOT_SIZE: 14,
    BLUE_DOT_COLOR: '#feebea',
    BLUE_DOT_HIDE_TIMEOUT: 5000,
  };

  class NotesService {
    constructor() {
      this.blueDot = null;
      this.blueDotHideTimeout = null;
      this.savedSelectionText = '';
      this.selectionTimeout = null;
    }

    /**
     * 初始化笔记服务
     */
    init() {
      this.createBlueDot();
      this.initSelectionListener();
    }

    /**
     * 获取所有笔记数据
     * @returns {Array} 笔记数组
     */
    getAllNotes() {
      try {
        const data = localStorage.getItem(NOTES_CONFIG.STORAGE_KEY);
        return data ? JSON.parse(data) : [];
      } catch (error) {
        console.error('读取笔记数据失败:', error);
        return [];
      }
    }

    /**
     * 保存笔记数据
     * @param {Array} notes - 笔记数组
     */
    saveNotes(notes) {
      try {
        localStorage.setItem(NOTES_CONFIG.STORAGE_KEY, JSON.stringify(notes));
      } catch (error) {
        console.error('保存笔记数据失败:', error);
      }
    }

    /**
     * 添加新笔记
     * @param {string} content - 笔记内容
     * @param {string} url - 来源URL
     * @returns {Object} 新添加的笔记对象
     */
    addNote(content, url) {
      const note = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        content: content.trim(),
        url: url,
        timestamp: Date.now()
      };

      const notes = this.getAllNotes();
      notes.unshift(note);
      this.saveNotes(notes);
      return note;
    }

    /**
     * 删除指定笔记
     * @param {string} noteId - 笔记ID
     */
    deleteNote(noteId) {
      const notes = this.getAllNotes();
      const filtered = notes.filter(note => note.id !== noteId);
      this.saveNotes(filtered);
    }

    /**
     * 批量删除笔记
     * @param {Array<string>} noteIds - 笔记ID数组
     */
    deleteNotes(noteIds) {
      const notes = this.getAllNotes();
      const filtered = notes.filter(note => !noteIds.includes(note.id));
      this.saveNotes(filtered);
    }

    /**
     * 按日期分组笔记
     * @returns {Array} 分组后的笔记数组 [{date, notes}, ...]
     */
    getGroupedNotes() {
      const notes = this.getAllNotes();
      const groups = {};

      notes.forEach(note => {
        const date = this.formatDate(note.timestamp);
        if (!groups[date]) {
          groups[date] = [];
        }
        groups[date].push(note);
      });

      return Object.keys(groups)
        .sort((a, b) => {
          const dateA = groups[a][0].timestamp;
          const dateB = groups[b][0].timestamp;
          return dateB - dateA;
        })
        .map(date => ({
          date,
          notes: groups[date]
        }));
    }

    /**
     * 格式化时间戳为日期字符串
     * @param {number} timestamp - 时间戳
     * @returns {string} 格式化的日期字符串
     */
    formatDate(timestamp) {
      const date = new Date(timestamp);
      const today = new Date();
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      if (date.toDateString() === today.toDateString()) {
        return '今天';
      } else if (date.toDateString() === yesterday.toDateString()) {
        return '昨天';
      } else {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
      }
    }

    /**
     * 格式化时间戳为完整时间字符串
     * @param {number} timestamp - 时间戳
     * @returns {string} 格式化的时间字符串
     */
    formatTime(timestamp) {
      const date = new Date(timestamp);
      const hours = String(date.getHours()).padStart(2, '0');
      const minutes = String(date.getMinutes()).padStart(2, '0');
      return `${hours}:${minutes}`;
    }

    /**
     * 创建钢笔保存点元素
     */
    createBlueDot() {
      if (this.blueDot) {
        return this.blueDot;
      }

      this.blueDot = document.createElement('div');
      this.blueDot.id = 'note-saver-blue-dot';
      this.blueDot.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
        <path d="M20.7 5.2c.4.4.4 1.1 0 1.6l-1 1-3.3-3.3 1-1c.4-.4 1.1-.4 1.6 0l1.7 1.7zm-3.3 2.3L6.7 18.2c-.2.2-.4.3-.7.3H3c-.6 0-1-.4-1-1v-3c0-.3.1-.5.3-.7L13 3.1l3.3 3.3z" stroke="#feebea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="rgba(0,0,0,0.7)"/>
      </svg>
    `;
      this.blueDot.style.cssText = `
      position: absolute;
      cursor: pointer;
      z-index: 999999;
      display: none;
      transition: transform 0.2s, filter 0.2s;
    `;

      this.blueDot.addEventListener('mouseenter', () => {
        this.blueDot.style.transform = 'scale(1.15)';
        this.blueDot.style.filter = 'drop-shadow(0 2px 4px rgba(254, 235, 234, 0.5))';
      });

      this.blueDot.addEventListener('mouseleave', () => {
        this.blueDot.style.transform = 'scale(1)';
        this.blueDot.style.filter = 'none';
      });

      this.blueDot.addEventListener('click', (e) => this.handleBlueDotClick(e));

      document.body.appendChild(this.blueDot);
      return this.blueDot;
    }

    /**
     * 显示蓝点在指定位置
     * @param {number} x - X坐标
     * @param {number} y - Y坐标
     */
    showBlueDot(x, y) {
      const dot = this.createBlueDot();
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      dot.style.display = 'block';

      if (this.blueDotHideTimeout) {
        clearTimeout(this.blueDotHideTimeout);
      }

      this.blueDotHideTimeout = setTimeout(() => {
        this.hideBlueDot();
        this.savedSelectionText = '';
      }, NOTES_CONFIG.BLUE_DOT_HIDE_TIMEOUT);
    }

    /**
     * 隐藏蓝点
     */
    hideBlueDot() {
      if (this.blueDot) {
        this.blueDot.style.display = 'none';
      }
      if (this.blueDotHideTimeout) {
        clearTimeout(this.blueDotHideTimeout);
        this.blueDotHideTimeout = null;
      }
    }

    /**
     * 处理蓝点点击事件
     */
    handleBlueDotClick(e) {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (this.savedSelectionText) {
        this.addNote(this.savedSelectionText, window.location.href);
        this.savedSelectionText = '';

        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          selection.removeAllRanges();
        }
      }

      this.hideBlueDot();
    }

    /**
     * 监听文本选择事件
     */
    initSelectionListener() {
      document.addEventListener('mouseup', (e) => {
        if (this.selectionTimeout) {
          clearTimeout(this.selectionTimeout);
        }

        this.selectionTimeout = setTimeout(() => {
          const selection = window.getSelection();
          const selectedText = selection.toString().trim();

          if (selectedText && selection.rangeCount > 0) {
            this.savedSelectionText = selectedText;

            const range = selection.getRangeAt(0);
            const rects = range.getClientRects();
            
            if (rects.length === 0) {
              this.hideBlueDot();
              return;
            }

            // 判断选择方向
            const anchorNode = selection.anchorNode;
            const focusNode = selection.focusNode;
            const anchorOffset = selection.anchorOffset;
            const focusOffset = selection.focusOffset;
            
            let isForward = true;
            if (anchorNode === focusNode) {
              isForward = anchorOffset <= focusOffset;
            } else {
              const position = anchorNode.compareDocumentPosition(focusNode);
              isForward = (position & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
            }
            
            let x, y;
            if (isForward) {
              // 从上往下选中 → 显示在最后一个字右下角
              const lastRect = rects[rects.length - 1];
              x = lastRect.right + window.scrollX + 5;
              y = lastRect.bottom + window.scrollY + 5;
            } else {
              // 从下往上选中 → 显示在第一个字左上角
              const firstRect = rects[0];
              x = firstRect.left + window.scrollX - 35;
              y = firstRect.top + window.scrollY - 35;
            }

            this.showBlueDot(x, y);
          } else {
            this.savedSelectionText = '';
            this.hideBlueDot();
          }
        }, 100);
      });

      document.addEventListener('mousedown', (e) => {
        // 如果点击的是蓝点或其子元素，不清空
        if (this.blueDot && (e.target === this.blueDot || this.blueDot.contains(e.target))) {
          return;
        }
        this.savedSelectionText = '';
        this.hideBlueDot();
      });
    }

    /**
     * 保存当前选中的字幕文本
     * @param {string} content - 字幕内容
     */
    saveSubtitleNote(content) {
      const note = this.addNote(content, window.location.href);
      return note;
    }
  }

  // 创建全局单例
  const notesService = new NotesService();

  /**
   * 媒体速度控制服务模块
   * 提供媒体播放速度控制和响度检测功能
   */

  const SPEED_CONFIG = {
    speedStep: 0.1,
    boostMultiplier: 1.5,
    doubleClickDelay: 200,
    displayDuration: 1000,
    maxSpeed: 10,
    volumeThresholdStep: 1,
    volumeCheckInterval: 100,
  };

  class SpeedControlService {
    constructor() {
      this.state = {
        baseSpeed: 1.0,
        isRightOptionPressed: false,
        isTempBoosted: false,
        lastKeyPressTime: { comma: 0, period: 0 },
        lastOptionPressTime: 0,
        optionDoubleClickTimer: null,
        volumeDetectionEnabled: false,
        currentVolumeThreshold: -40,
        isVolumeBoosted: false,
        mediaAnalyzers: new Map(),
        commaPressed: false,
        periodPressed: false,
        volumeHistory: [],
        maxHistoryLength: 100,
        volumeChart: null,
      };
      this.observer = null;
    }

    /**
     * 初始化速度控制服务
     */
    init() {
      this.bindKeyboardEvents();
      this.observeMediaElements();
      this.applySpeedToExistingMedia();
    }

    /**
     * 获取当前所有媒体元素
     */
    getMediaElements() {
      return Array.from(document.querySelectorAll('video, audio'));
    }

    /**
     * 应用速度到所有媒体元素
     */
    applySpeed(speed) {
      const mediaElements = this.getMediaElements();
      
      mediaElements.forEach(media => {
        media.playbackRate = speed;
        this.showSpeedIndicator(media, speed);
      });
    }

    /**
     * 显示速度指示器
     */
    showSpeedIndicator(media, speed) {
      const oldIndicator = media.parentElement?.querySelector('.speed-indicator');
      if (oldIndicator) {
        oldIndicator.remove();
      }

      const indicator = document.createElement('div');
      indicator.className = 'speed-indicator';
      indicator.textContent = `${speed.toFixed(2)}x`;
      indicator.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.7);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 14px;
      font-family: monospace;
      z-index: 999999;
      pointer-events: none;
      transition: opacity 0.3s;
    `;

      if (media.parentElement) {
        const parentPosition = window.getComputedStyle(media.parentElement).position;
        if (parentPosition === 'static') {
          media.parentElement.style.position = 'relative';
        }
        media.parentElement.appendChild(indicator);

        setTimeout(() => {
          indicator.style.opacity = '0';
          setTimeout(() => {
            indicator.remove();
          }, 300);
        }, SPEED_CONFIG.displayDuration);
      }
    }

    /**
     * 调整基础速度
     */
    adjustBaseSpeed(delta) {
      this.state.baseSpeed = Math.max(0.1, Math.min(SPEED_CONFIG.maxSpeed, this.state.baseSpeed + delta));
      this.applySpeed(this.calculateFinalSpeed());
    }

    /**
     * 设置基础速度
     */
    setBaseSpeed(speed) {
      this.state.baseSpeed = Math.max(0.1, Math.min(SPEED_CONFIG.maxSpeed, speed));
      this.applySpeed(this.calculateFinalSpeed());
    }

    /**
     * 应用临时加速（长按option）
     */
    applyTemporaryBoost() {
      this.state.isTempBoosted = true;
      this.applySpeed(this.calculateFinalSpeed());
    }

    /**
     * 移除临时加速（松开option）
     */
    removeTemporaryBoost() {
      this.state.isTempBoosted = false;
      this.applySpeed(this.calculateFinalSpeed());
    }

    /**
     * 应用永久加速（双击option）
     */
    applyPermanentBoost() {
      this.state.baseSpeed = Math.min(SPEED_CONFIG.maxSpeed, this.state.baseSpeed * SPEED_CONFIG.boostMultiplier);
      this.applySpeed(this.calculateFinalSpeed());
    }

    /**
     * 重置为1倍速
     */
    resetToNormalSpeed() {
      this.state.baseSpeed = 1.0;
      this.applySpeed(this.calculateFinalSpeed());
    }

    /**
     * 设置为2倍速
     */
    setToDoubleSpeed() {
      this.state.baseSpeed = 2.0;
      this.applySpeed(this.calculateFinalSpeed());
    }

    /**
     * 检测双击
     */
    detectDoubleClick(keyType) {
      const now = Date.now();
      const lastTime = this.state.lastKeyPressTime[keyType];
      this.state.lastKeyPressTime[keyType] = now;

      if (now - lastTime < SPEED_CONFIG.doubleClickDelay) {
        return true;
      }
      return false;
    }

    /**
     * 计算最终速度（考虑所有加速因素）
     */
    calculateFinalSpeed() {
      let speed = this.state.baseSpeed;
      
      if (this.state.isTempBoosted) {
        speed *= SPEED_CONFIG.boostMultiplier;
      }
      
      if (this.state.isVolumeBoosted) {
        speed *= SPEED_CONFIG.boostMultiplier;
      }
      
      return Math.min(SPEED_CONFIG.maxSpeed, speed);
    }

    /**
     * 为媒体元素创建音频分析器
     */
    setupVolumeAnalyzer(media) {
      try {
        if (this.state.mediaAnalyzers.has(media)) {
          return this.state.mediaAnalyzers.get(media);
        }

        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 256;
        
        const source = audioContext.createMediaElementSource(media);
        source.connect(analyser);
        analyser.connect(audioContext.destination);

        const analyzer = {
          context: audioContext,
          analyser: analyser,
          dataArray: new Uint8Array(analyser.frequencyBinCount),
          intervalId: null
        };

        this.state.mediaAnalyzers.set(media, analyzer);
        return analyzer;
      } catch (error) {
        console.error('创建音频分析器失败:', error);
        return null;
      }
    }

    /**
     * 计算当前响度（dB）
     */
    getVolumeLevel(analyzer) {
      analyzer.analyser.getByteFrequencyData(analyzer.dataArray);
      
      let sum = 0;
      for (let i = 0; i < analyzer.dataArray.length; i++) {
        sum += analyzer.dataArray[i];
      }
      const average = sum / analyzer.dataArray.length;
      
      if (average === 0) return -Infinity;
      const db = 20 * Math.log10(average / 255);
      
      return db;
    }

    /**
     * 开始监测特定媒体元素的响度
     */
    startVolumeDetection(media) {
      const analyzer = this.setupVolumeAnalyzer(media);
      if (!analyzer) return;

      if (analyzer.intervalId) {
        clearInterval(analyzer.intervalId);
      }

      this.createVolumeChart(media);

      analyzer.intervalId = setInterval(() => {
        if (!this.state.volumeDetectionEnabled || media.paused) {
          return;
        }

        const volumeDb = this.getVolumeLevel(analyzer);
        const shouldBoost = volumeDb < this.state.currentVolumeThreshold;

        this.updateVolumeChart(volumeDb);

        if (shouldBoost && !this.state.isVolumeBoosted) {
          this.state.isVolumeBoosted = true;
          this.applySpeed(this.calculateFinalSpeed());
        } else if (!shouldBoost && this.state.isVolumeBoosted) {
          this.state.isVolumeBoosted = false;
          this.applySpeed(this.calculateFinalSpeed());
        }
      }, SPEED_CONFIG.volumeCheckInterval);
    }

    /**
     * 停止监测并清理资源
     */
    stopVolumeDetection(media) {
      const analyzer = this.state.mediaAnalyzers.get(media);
      if (!analyzer) return;

      if (analyzer.intervalId) {
        clearInterval(analyzer.intervalId);
        analyzer.intervalId = null;
      }

      if (analyzer.context) {
        analyzer.context.close();
      }

      this.state.mediaAnalyzers.delete(media);

      if (this.state.volumeChart) {
        this.state.volumeChart.remove();
        this.state.volumeChart = null;
      }
      this.state.volumeHistory = [];
    }

    /**
     * 切换响度检测功能
     */
    toggleVolumeDetection() {
      this.state.volumeDetectionEnabled = !this.state.volumeDetectionEnabled;
      
      if (this.state.volumeDetectionEnabled) {
        const mediaElements = this.getMediaElements();
        mediaElements.forEach(media => {
          this.startVolumeDetection(media);
        });
      } else {
        const mediaElements = this.getMediaElements();
        mediaElements.forEach(media => {
          this.stopVolumeDetection(media);
        });
        
        if (this.state.isVolumeBoosted) {
          this.state.isVolumeBoosted = false;
          this.applySpeed(this.calculateFinalSpeed());
        }
      }
    }

    /**
     * 调整响度阈值
     */
    adjustVolumeThreshold(delta) {
      this.state.currentVolumeThreshold += delta;
      this.state.currentVolumeThreshold = Math.max(-100, Math.min(0, this.state.currentVolumeThreshold));
      
      // 显示图表
      if (this.state.volumeChart) {
        this.state.volumeChart.style.opacity = '1';
        
        // 清除旧定时器
        if (this.hideChartTimer) {
          clearTimeout(this.hideChartTimer);
        }
        
        // 5秒后重新隐藏
        this.hideChartTimer = setTimeout(() => {
          if (this.state.volumeChart) {
            this.state.volumeChart.style.opacity = '0';
          }
        }, 5000);
      }
    }

    /**
     * 创建响度图表
     */
    createVolumeChart(media) {
      if (this.state.volumeChart) {
        this.state.volumeChart.remove();
      }

      const canvas = document.createElement('canvas');
      canvas.className = 'volume-chart';
      canvas.width = 300;
      canvas.height = 150;
      canvas.style.cssText = `
      position: absolute;
      top: 10px;
      left: 10px;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(12px);
      border: 2px solid #feebea;
      border-radius: 8px;
      z-index: 999999;
      pointer-events: none;
      opacity: 1;
      transition: opacity 0.3s;
    `;

      if (media.parentElement) {
        const parentPosition = window.getComputedStyle(media.parentElement).position;
        if (parentPosition === 'static') {
          media.parentElement.style.position = 'relative';
        }
        media.parentElement.appendChild(canvas);
      }

      this.state.volumeChart = canvas;
      this.state.volumeHistory = [];
      
      // 5秒后隐藏
      this.hideChartTimer = setTimeout(() => {
        if (canvas) {
          canvas.style.opacity = '0';
        }
      }, 5000);
      
      return canvas;
    }

    /**
     * 更新响度图表
     */
    updateVolumeChart(volumeDb) {
      if (!this.state.volumeChart) return;

      const canvas = this.state.volumeChart;
      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;

      this.state.volumeHistory.push(volumeDb);
      if (this.state.volumeHistory.length > this.state.maxHistoryLength) {
        this.state.volumeHistory.shift();
      }

      ctx.clearRect(0, 0, width, height);

      const padding = 30;
      const chartWidth = width - 2 * padding;
      const chartHeight = height - 2 * padding;
      
      const minDb = -60;
      const maxDb = 0;

      const dbToY = (db) => {
        const clampedDb = Math.max(minDb, Math.min(maxDb, db));
        const ratio = (clampedDb - minDb) / (maxDb - minDb);
        return height - padding - ratio * chartHeight;
      };

      // 绘制坐标轴
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padding, padding);
      ctx.lineTo(padding, height - padding);
      ctx.lineTo(width - padding, height - padding);
      ctx.stroke();

      // 绘制刻度和标签
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'right';
      
      for (let db = minDb; db <= maxDb; db += 20) {
        const y = dbToY(db);
        ctx.fillText(`${db}dB`, padding - 5, y + 3);
        
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
      }

      // 绘制红色阈值线
      ctx.strokeStyle = '#FF5252';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      const thresholdY = dbToY(this.state.currentVolumeThreshold);
      ctx.beginPath();
      ctx.moveTo(padding, thresholdY);
      ctx.lineTo(width - padding, thresholdY);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#FF5252';
      ctx.textAlign = 'left';
      ctx.fillText(`阈值: ${this.state.currentVolumeThreshold.toFixed(0)}dB`, width - padding + 5, thresholdY + 3);

      // 绘制绿色响度曲线
      if (this.state.volumeHistory.length > 1) {
        ctx.strokeStyle = '#4CAF50';
        ctx.lineWidth = 2;
        ctx.beginPath();

        const xStep = chartWidth / (this.state.maxHistoryLength - 1);
        
        this.state.volumeHistory.forEach((db, index) => {
          const x = padding + index * xStep;
          const y = dbToY(db);
          
          if (index === 0) {
            ctx.moveTo(x, y);
          } else {
            ctx.lineTo(x, y);
          }
        });

        ctx.stroke();

        const lastDb = this.state.volumeHistory[this.state.volumeHistory.length - 1];
        const lastX = padding + (this.state.volumeHistory.length - 1) * xStep;
        const lastY = dbToY(lastDb);
        
        ctx.fillStyle = '#4CAF50';
        ctx.beginPath();
        ctx.arc(lastX, lastY, 3, 0, 2 * Math.PI);
        ctx.fill();
        
        ctx.fillText(`${lastDb.toFixed(1)}dB`, lastX + 5, lastY - 5);
      }

      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = '12px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('响度检测', width / 2, 15);
    }

    /**
     * 绑定键盘事件
     */
    bindKeyboardEvents() {
      document.addEventListener('keydown', (event) => this.handleKeyDown(event), true);
      document.addEventListener('keyup', (event) => this.handleKeyUp(event), true);
    }

    /**
     * 键盘按下事件处理
     */
    handleKeyDown(event) {
      // 检测右侧Option键
      if (event.code === 'AltRight' && event.location === 2) {
        if (!this.state.isRightOptionPressed) {
          this.state.isRightOptionPressed = true;
          
          const now = Date.now();
          if (now - this.state.lastOptionPressTime < SPEED_CONFIG.doubleClickDelay) {
            this.applyPermanentBoost();
            
            if (this.state.optionDoubleClickTimer) {
              clearTimeout(this.state.optionDoubleClickTimer);
              this.state.optionDoubleClickTimer = null;
            }
          } else {
            this.applyTemporaryBoost();
          }
          
          this.state.lastOptionPressTime = now;
        }
        return;
      }

      // 忽略在输入框中的按键
      if (event.target.tagName === 'INPUT' || 
          event.target.tagName === 'TEXTAREA' || 
          event.target.isContentEditable) {
        return;
      }

      // 检测句号键 (.)
      if (event.code === 'Period') {
        if (event.altKey) {
          event.preventDefault();
          this.adjustVolumeThreshold(SPEED_CONFIG.volumeThresholdStep);
          return;
        }
        
        if (!this.state.periodPressed) {
          this.state.periodPressed = true;
          
          if (this.state.commaPressed) {
            event.preventDefault();
            this.toggleVolumeDetection();
            return;
          }
        }
        
        event.preventDefault();
        
        if (this.detectDoubleClick('period')) {
          this.setToDoubleSpeed();
        } else {
          this.adjustBaseSpeed(SPEED_CONFIG.speedStep);
        }
        return;
      }

      // 检测逗号键 (,)
      if (event.code === 'Comma') {
        if (event.altKey) {
          event.preventDefault();
          this.adjustVolumeThreshold(-1);
          return;
        }
        
        if (!this.state.commaPressed) {
          this.state.commaPressed = true;
          
          if (this.state.periodPressed) {
            event.preventDefault();
            this.toggleVolumeDetection();
            return;
          }
        }
        
        event.preventDefault();
        
        if (this.detectDoubleClick('comma')) {
          this.resetToNormalSpeed();
        } else {
          this.adjustBaseSpeed(-0.1);
        }
        return;
      }
    }

    /**
     * 键盘释放事件处理
     */
    handleKeyUp(event) {
      if (event.code === 'AltRight' && event.location === 2) {
        if (this.state.isRightOptionPressed) {
          this.state.isRightOptionPressed = false;
          
          this.state.optionDoubleClickTimer = setTimeout(() => {
            if (!this.state.isRightOptionPressed && this.state.isTempBoosted) {
              this.removeTemporaryBoost();
            }
          }, SPEED_CONFIG.doubleClickDelay);
        }
        return;
      }

      if (event.code === 'Period') {
        this.state.periodPressed = false;
        return;
      }

      if (event.code === 'Comma') {
        this.state.commaPressed = false;
        return;
      }
    }

    /**
     * 监听新添加的媒体元素
     */
    observeMediaElements() {
      this.observer = new MutationObserver(() => {
        const mediaElements = this.getMediaElements();
        mediaElements.forEach(media => {
          const currentSpeed = this.calculateFinalSpeed();
          if (Math.abs(media.playbackRate - currentSpeed) > 0.01) {
            media.playbackRate = currentSpeed;
          }
          
          if (this.state.volumeDetectionEnabled && !this.state.mediaAnalyzers.has(media)) {
            this.startVolumeDetection(media);
          }
        });
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    /**
     * 对已存在的媒体元素应用初始速度
     */
    applySpeedToExistingMedia() {
      const mediaElements = this.getMediaElements();
      mediaElements.forEach(media => {
        media.playbackRate = this.state.baseSpeed;
      });
    }

    /**
     * 获取当前速度
     */
    getCurrentSpeed() {
      return this.calculateFinalSpeed();
    }

    /**
     * 获取当前状态（用于UI显示）
     */
    getState() {
      return {
        baseSpeed: this.state.baseSpeed,
        finalSpeed: this.calculateFinalSpeed(),
        isTempBoosted: this.state.isTempBoosted,
        isVolumeBoosted: this.state.isVolumeBoosted,
        volumeDetectionEnabled: this.state.volumeDetectionEnabled,
        currentVolumeThreshold: this.state.currentVolumeThreshold,
      };
    }

    /**
     * 清理资源
     */
    destroy() {
      if (this.observer) {
        this.observer.disconnect();
      }
      
      this.getMediaElements().forEach(media => {
        this.stopVolumeDetection(media);
      });
    }
  }

  // 创建全局单例
  const speedControlService = new SpeedControlService();

  /**
   * SponsorBlock配置管理模块
   * 管理SponsorBlock相关的所有配置
   */


  const STORAGE_KEY$1 = 'sponsorblock_settings';

  class SponsorBlockConfigManager {
    constructor() {
      this.settings = this.loadSettings();
    }

    /**
     * 加载设置
     * @returns {Object}
     */
    loadSettings() {
      const saved = GM_getValue(STORAGE_KEY$1, null);
      return saved ? JSON.parse(saved) : { ...SPONSORBLOCK.DEFAULT_SETTINGS };
    }

    /**
     * 保存设置
     * @param {Object} settings
     */
    saveSettings(settings) {
      this.settings = settings;
      GM_setValue(STORAGE_KEY$1, JSON.stringify(settings));
    }

    /**
     * 获取单个设置
     * @param {string} key
     * @returns {any}
     */
    get(key) {
      return this.settings[key];
    }

    /**
     * 设置单个值
     * @param {string} key
     * @param {any} value
     */
    set(key, value) {
      this.settings[key] = value;
      this.saveSettings(this.settings);
    }

    /**
     * 获取所有设置
     * @returns {Object}
     */
    getAll() {
      return { ...this.settings };
    }

    /**
     * 设置所有设置
     * @param {Object} settings
     */
    setAll(settings) {
      this.saveSettings(settings);
    }

    /**
     * 重置为默认设置
     */
    resetToDefaults() {
      this.saveSettings({ ...SPONSORBLOCK.DEFAULT_SETTINGS });
    }
  }

  // 创建全局单例
  const sponsorBlockConfig = new SponsorBlockConfigManager();

  /**
   * SponsorBlock服务模块
   * 处理视频片段跳过、进度条标记、提示框等核心功能
   */


  /**
   * SponsorBlock API类
   * 负责API请求和缓存管理
   */
  class SponsorBlockAPI {
    constructor() {
      this.cache = new Map();
      this.pendingRequests = new Map();
    }

    /**
     * 获取视频片段数据
     * @param {string} bvid - 视频BV号
     * @returns {Promise<Array>}
     */
    async fetchSegments(bvid) {
      // 检查缓存
      const cached = this.cache.get(bvid);
      if (cached && Date.now() - cached.timestamp < SPONSORBLOCK.CACHE_EXPIRY) {
        return cached.data;
      }

      // 检查是否有正在进行的请求
      if (this.pendingRequests.has(bvid)) {
        return this.pendingRequests.get(bvid);
      }

      const promise = new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: `${SPONSORBLOCK.API_URL}?videoID=${bvid}`,
          headers: {
            "origin": "userscript-bilibili-sponsor-skip",
            "x-ext-version": "1.0.0"
          },
          timeout: 5000,
          onload: (response) => {
            try {
              if (response.status === 404) {
                const result = [];
                this.cache.set(bvid, { data: result, timestamp: Date.now() });
                resolve(result);
              } else if (response.status === 200) {
                const data = JSON.parse(response.responseText);
                this.cache.set(bvid, { data, timestamp: Date.now() });
                resolve(data);
              } else if (response.status === 400) {
                console.error('[SponsorBlock] 参数错误 (400)');
                reject(new Error('Bad request'));
              } else if (response.status === 429) {
                console.error('[SponsorBlock] 请求频繁 (429)');
                reject(new Error('Rate limited'));
              } else {
                reject(new Error(`HTTP ${response.status}`));
              }
            } catch (error) {
              reject(error);
            }
          },
          onerror: reject,
          ontimeout: () => reject(new Error('Timeout'))
        });
      });

      this.pendingRequests.set(bvid, promise);
      promise.finally(() => {
        this.pendingRequests.delete(bvid);
      });

      return promise;
    }

    /**
     * 检查是否有片段
     * @param {string} bvid
     * @returns {boolean|null}
     */
    hasSegments(bvid) {
      const cached = this.cache.get(bvid);
      if (cached && Date.now() - cached.timestamp < SPONSORBLOCK.CACHE_EXPIRY) {
        return cached.data.length > 0;
      }
      return null;
    }

    /**
     * 清除缓存
     */
    clearCache() {
      this.cache.clear();
    }
  }

  /**
   * 视频播放器控制器类
   * 负责片段跳过、进度条标记、提示框显示
   */
  class VideoPlayerController {
    constructor(api, config) {
      this.api = api;
      this.config = config;
      this.video = null;
      this.segments = [];
      this.currentBVID = null;
      this.lastSkipTime = 0;
      this.checkInterval = null;
      this.currentPrompt = null;
      this.promptedSegments = new Set();
      this.ignoredSegments = new Set();
      this.progressBar = null;
      this.markerContainer = null;
      this.playerObserver = null;
    }

    /**
     * 初始化播放器控制器
     */
    async init() {
      // 检查是否在视频播放页
      if (!location.pathname.includes('/video/')) {
        return;
      }

      // 提取BVID
      this.currentBVID = location.pathname.match(/video\/(BV\w+)/)?.[1];
      if (!this.currentBVID) {
        return;
      }

      // 等待视频元素加载
      await this.waitForVideo();
      
      // 获取片段数据
      try {
        this.segments = await this.api.fetchSegments(this.currentBVID);
        
        if (this.segments.length > 0) {
          // 渲染进度条标记
          this.renderProgressMarkers();
        }
      } catch (error) {
        console.error('[SponsorBlock] 获取片段失败:', error);
        this.segments = [];
      }

      // 开始监听
      this.startMonitoring();
      
      // 添加播放器观察器
      this.setupPlayerObserver();
    }

    /**
     * 设置播放器观察器
     */
    setupPlayerObserver() {
      const playerContainer = document.querySelector('.bpx-player-video-wrap') || 
                             document.querySelector('.bpx-player-container');
      
      if (!playerContainer) return;

      this.playerObserver = new MutationObserver(() => {
        if (this.segments.length > 0 && !document.querySelector('#sponsorblock-preview-bar')) {
          this.renderProgressMarkers();
        }
      });

      this.playerObserver.observe(playerContainer, {
        childList: true,
        subtree: true
      });
    }

    /**
     * 等待视频元素加载
     */
    async waitForVideo() {
      return new Promise((resolve) => {
        const check = () => {
          this.video = document.querySelector(SELECTORS.VIDEO);
          if (this.video) {
            resolve();
          } else {
            setTimeout(check, 500);
          }
        };
        check();
      });
    }

    /**
     * 渲染进度条标记
     */
    renderProgressMarkers() {
      if (!this.config.get('showProgressMarkers')) {
        return;
      }

      const tryRender = (retryCount = 0) => {
        const targetContainer = document.querySelector('.bpx-player-progress-schedule');
        
        if (!targetContainer) {
          if (retryCount < 10) {
            setTimeout(() => tryRender(retryCount + 1), 1000);
          }
          return;
        }

        this.progressBar = targetContainer;

        // 移除旧标记
        document.querySelectorAll('#sponsorblock-preview-bar').forEach(el => el.remove());

        // 创建标记容器
        this.markerContainer = document.createElement('ul');
        this.markerContainer.id = 'sponsorblock-preview-bar';
        
        targetContainer.prepend(this.markerContainer);

        // 等待视频时长
        if (this.video.duration && this.video.duration > 0) {
          this.createSegmentMarkers();
        } else {
          this.video.addEventListener('loadedmetadata', () => {
            this.createSegmentMarkers();
          }, { once: true });
        }
      };

      tryRender();
    }

    /**
     * 创建片段标记
     */
    createSegmentMarkers() {
      if (!this.markerContainer || !this.video.duration || this.video.duration <= 0) {
        return;
      }

      this.markerContainer.innerHTML = '';
      const videoDuration = this.video.duration;

      // 排序：长片段先渲染
      const sortedSegments = [...this.segments].sort((a, b) => {
        return (b.segment[1] - b.segment[0]) - (a.segment[1] - a.segment[0]);
      });

      // 为每个片段创建标记
      sortedSegments.forEach((segment, index) => {
        const startTime = Math.min(videoDuration, segment.segment[0]);
        const endTime = Math.min(videoDuration, segment.segment[1]);
        
        const leftPercent = (startTime / videoDuration) * 100;
        const rightPercent = (1 - endTime / videoDuration) * 100;

        const marker = document.createElement('li');
        marker.className = 'sponsorblock-segment';
        marker.dataset.segmentIndex = index.toString();
        
        const categoryInfo = SPONSORBLOCK.CATEGORIES[segment.category] || 
                           { name: segment.category, color: '#999' };
        
        marker.style.position = 'absolute';
        marker.style.left = `${leftPercent}%`;
        marker.style.right = `${rightPercent}%`;
        marker.style.backgroundColor = categoryInfo.color;

        const duration = endTime - startTime;
        marker.title = `${categoryInfo.name}\n${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s (${duration.toFixed(1)}s)`;

        // 点击事件
        marker.addEventListener('click', (e) => {
          e.stopPropagation();
          this.showSegmentDetails(segment);
        });

        this.markerContainer.appendChild(marker);
      });
    }

    /**
     * 显示片段详情
     */
    showSegmentDetails(segment) {
      // 移除已有弹窗
      const existingPopup = document.querySelector('.segment-details-popup');
      if (existingPopup) {
        existingPopup.remove();
        document.querySelector('.segment-details-overlay')?.remove();
      }

      const categoryInfo = SPONSORBLOCK.CATEGORIES[segment.category] || 
                         { name: segment.category, color: '#999' };
      
      const duration = segment.segment[1] - segment.segment[0];
      const startTime = formatTime(segment.segment[0]);
      const endTime = formatTime(segment.segment[1]);

      // 创建遮罩层
      const overlay = document.createElement('div');
      overlay.className = 'segment-details-overlay';
      overlay.onclick = () => this.closeSegmentDetails();

      // 创建弹窗
      const popup = document.createElement('div');
      popup.className = 'segment-details-popup';
      popup.onclick = (e) => e.stopPropagation();

      popup.innerHTML = `
      <div class="segment-details-header">
        <div class="segment-details-title">
          <div style="width: 16px; height: 16px; background: ${categoryInfo.color}; border-radius: 3px;"></div>
          <span>${categoryInfo.name}</span>
        </div>
        <button class="segment-details-close">×</button>
      </div>
      <div class="segment-details-content">
        <div class="segment-details-row">
          <span class="segment-details-label">开始时间</span>
          <span class="segment-details-value">${startTime}</span>
        </div>
        <div class="segment-details-row">
          <span class="segment-details-label">结束时间</span>
          <span class="segment-details-value">${endTime}</span>
        </div>
        <div class="segment-details-row">
          <span class="segment-details-label">时长</span>
          <span class="segment-details-value">${duration.toFixed(1)} 秒</span>
        </div>
        <div class="segment-details-row">
          <span class="segment-details-label">投票数</span>
          <span class="segment-details-value">${segment.votes}</span>
        </div>
        <div class="segment-details-row">
          <span class="segment-details-label">UUID</span>
          <span class="segment-details-value" style="font-size: 11px; font-family: monospace;">${segment.UUID.substring(0, 20)}...</span>
        </div>
      </div>
      <div class="segment-details-actions">
        <button class="segment-details-btn segment-details-btn-secondary" data-action="close">
          关闭
        </button>
        <button class="segment-details-btn segment-details-btn-primary" data-action="jump">
          跳转到此片段
        </button>
      </div>
    `;

      document.body.appendChild(overlay);
      document.body.appendChild(popup);

      // 绑定事件
      popup.querySelector('.segment-details-close').onclick = () => this.closeSegmentDetails();
      popup.querySelector('[data-action="close"]').onclick = () => this.closeSegmentDetails();
      popup.querySelector('[data-action="jump"]').onclick = () => {
        if (this.video) {
          this.video.currentTime = segment.segment[0];
        }
        this.closeSegmentDetails();
      };

      // Esc键关闭
      const keyHandler = (e) => {
        if (e.key === 'Escape') {
          this.closeSegmentDetails();
          document.removeEventListener('keydown', keyHandler);
        }
      };
      document.addEventListener('keydown', keyHandler);
    }

    /**
     * 关闭片段详情
     */
    closeSegmentDetails() {
      document.querySelector('.segment-details-popup')?.remove();
      document.querySelector('.segment-details-overlay')?.remove();
    }

    /**
     * 开始监控
     */
    startMonitoring() {
      if (!this.video) {
        return;
      }

      // 使用轮询方式检查
      this.checkInterval = setInterval(() => {
        this.checkAndSkip();
      }, 200);

      // 页面卸载时清理
      window.addEventListener('beforeunload', () => {
        if (this.checkInterval) {
          clearInterval(this.checkInterval);
        }
      });
    }

    /**
     * 检查并跳过
     */
    checkAndSkip() {
      if (!this.video || this.video.paused) {
        return;
      }

      const currentTime = this.video.currentTime;
      const skipCategories = this.config.get('skipCategories') || [];

      for (const segment of this.segments) {
        // 检查是否在片段范围内
        if (currentTime >= segment.segment[0] && currentTime < segment.segment[1]) {
          const segmentKey = `${segment.UUID}`;
          
          // 如果用户选择不跳过此片段，则忽略
          if (this.ignoredSegments.has(segmentKey)) {
            continue;
          }

          // 判断是否勾选了此类别
          if (skipCategories.includes(segment.category)) {
            // 自动跳过
            if (Date.now() - this.lastSkipTime < 1000) {
              continue;
            }

            const skipTo = segment.segment[1];
            this.video.currentTime = skipTo;
            this.lastSkipTime = Date.now();

            // 显示Toast提示
            this.showSkipToast(segment);
            break;
          } else {
            // 显示手动提示
            if (!this.promptedSegments.has(segmentKey)) {
              this.showSkipPrompt(segment);
              this.promptedSegments.add(segmentKey);
            }
            continue;
          }
        }
      }
    }

    /**
     * 显示跳过Toast
     */
    showSkipToast(segment) {
      const categoryInfo = SPONSORBLOCK.CATEGORIES[segment.category] || 
                         { name: segment.category};
      
      const toast = document.createElement('div');
      toast.className = 'skip-toast';
      toast.textContent = `已跳过 ${categoryInfo.name}`;
      
      toast.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
      });
      
      toast.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
      });
      
      const playerContainer = document.querySelector('.bpx-player-video-wrap') || 
                             document.querySelector('.bpx-player-container') ||
                             document.body;
      playerContainer.appendChild(toast);

      setTimeout(() => {
        toast.classList.add('hiding');
        setTimeout(() => {
          toast.remove();
        }, 300);
      }, 3000);
    }

    /**
     * 显示跳过提示
     */
    showSkipPrompt(segment) {
      // 如果已有提示，先清理
      this.closePrompt();

      const categoryInfo = SPONSORBLOCK.CATEGORIES[segment.category] || 
                         { name: segment.category, color: '#999' };
      
      const prompt = document.createElement('div');
      prompt.className = 'skip-prompt';
      
      const duration = segment.segment[1] - segment.segment[0];
      const startTime = formatTime(segment.segment[0]);
      const endTime = formatTime(segment.segment[1]);
      
      prompt.innerHTML = `
      <div class="skip-prompt-header">
        <div class="skip-prompt-icon">
          <svg viewBox="0 0 24 24" fill="${categoryInfo.color}">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
        <div class="skip-prompt-message">
          跳过${categoryInfo.name}？<br>
          <small style="color: #999; font-size: 11px;">${startTime} - ${endTime}</small>
        </div>
        <button class="skip-prompt-close" title="关闭">×</button>
      </div>
      <div class="skip-prompt-buttons">
        <button class="skip-prompt-btn skip-prompt-btn-secondary" data-action="ignore">
          不跳过
        </button>
        <button class="skip-prompt-btn skip-prompt-btn-primary" data-action="skip">
          跳过 (${duration.toFixed(0)}秒)
        </button>
      </div>
    `;

      prompt.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      
      prompt.addEventListener('mousedown', (e) => {
        e.stopPropagation();
      });

      const playerContainer = document.querySelector('.bpx-player-video-wrap') || 
                             document.querySelector('.bpx-player-container') ||
                             document.body;
      playerContainer.appendChild(prompt);
      this.currentPrompt = prompt;

      // 绑定事件
      const skipBtn = prompt.querySelector('[data-action="skip"]');
      const ignoreBtn = prompt.querySelector('[data-action="ignore"]');
      const closeBtn = prompt.querySelector('.skip-prompt-close');

      const handleSkip = () => {
        this.video.currentTime = segment.segment[1];
        this.lastSkipTime = Date.now();
        this.closePrompt();
      };

      const handleIgnore = () => {
        const segmentKey = `${segment.UUID}`;
        this.ignoredSegments.add(segmentKey);
        this.closePrompt();
      };

      const handleClose = () => {
        this.closePrompt();
      };

      skipBtn.onclick = handleSkip;
      ignoreBtn.onclick = handleIgnore;
      closeBtn.onclick = handleClose;

      // 键盘快捷键
      const keyHandler = (e) => {
        if (e.key === 'Enter') {
          handleSkip();
          document.removeEventListener('keydown', keyHandler);
        } else if (e.key === 'Escape') {
          handleClose();
          document.removeEventListener('keydown', keyHandler);
        }
      };
      document.addEventListener('keydown', keyHandler);

      // 片段结束后自动关闭提示
      const checkEnd = () => {
        if (this.video && this.video.currentTime >= segment.segment[1]) {
          this.closePrompt();
          clearInterval(endCheckInterval);
        }
      };
      const endCheckInterval = setInterval(checkEnd, 500);

      // 5秒后自动淡出关闭
      const autoCloseTimer = setTimeout(() => {
        if (this.currentPrompt === prompt) {
          this.closePrompt();
        }
      }, 5000);

      // 保存清理函数
      prompt._cleanup = () => {
        clearInterval(endCheckInterval);
        clearTimeout(autoCloseTimer);
        document.removeEventListener('keydown', keyHandler);
      };
    }

    /**
     * 关闭提示
     */
    closePrompt() {
      if (this.currentPrompt) {
        if (this.currentPrompt._cleanup) {
          this.currentPrompt._cleanup();
        }
        
        this.currentPrompt.classList.add('hiding');
        setTimeout(() => {
          if (this.currentPrompt) {
            this.currentPrompt.remove();
            this.currentPrompt = null;
          }
        }, 300);
      }
    }

    /**
     * 销毁控制器
     */
    destroy() {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
      }
      this.closePrompt();
      this.closeSegmentDetails();
      
      if (this.markerContainer) {
        this.markerContainer.remove();
        this.markerContainer = null;
      }
      
      if (this.playerObserver) {
        this.playerObserver.disconnect();
        this.playerObserver = null;
      }
    }
  }

  /**
   * SponsorBlock服务类
   * 统一管理API和播放器控制器
   */
  class SponsorBlockService {
    constructor() {
      this.api = new SponsorBlockAPI();
      this.playerController = null;
      this.currentURL = location.href;
    }

    /**
     * 初始化服务
     */
    async init() {
      // 初始化播放器控制器（仅视频页）
      if (location.pathname.includes('/video/')) {
        this.playerController = new VideoPlayerController(this.api, sponsorBlockConfig);
        await this.playerController.init();
      }

      // 监听URL变化
      this.setupURLMonitor();
    }

    /**
     * 设置URL监听
     */
    setupURLMonitor() {
      // 监听popstate事件
      window.addEventListener('popstate', () => {
        this.handleURLChange();
      });

      // 监听pushState和replaceState
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;

      history.pushState = (...args) => {
        originalPushState.apply(history, args);
        this.handleURLChange();
      };

      history.replaceState = (...args) => {
        originalReplaceState.apply(history, args);
        this.handleURLChange();
      };
    }

    /**
     * 处理URL变化
     */
    handleURLChange() {
      const newURL = location.href;
      if (newURL !== this.currentURL) {
        this.currentURL = newURL;
        
        // 清理旧的控制器
        this.playerController?.destroy();
        this.playerController = null;

        // 如果是视频页，重新初始化
        if (location.pathname.includes('/video/')) {
          setTimeout(async () => {
            this.playerController = new VideoPlayerController(this.api, sponsorBlockConfig);
            await this.playerController.init();
          }, 1000);
        }
      }
    }

    /**
     * 获取API实例
     */
    getAPI() {
      return this.api;
    }
  }

  // 创建全局单例
  const sponsorBlockService = new SponsorBlockService();

  /**
   * 视频质量服务模块
   * 负责视频卡片的质量标记和片段标签显示
   */


  class VideoQualityService {
    constructor(sponsorBlockAPI) {
      this.sponsorAPI = sponsorBlockAPI;
      this.observer = null;
      this.statsCache = new Map();
      this.pendingRequests = new Map();
      this.abortController = new AbortController();
      this.processQueue = new Set();
      this.isProcessing = false;
    }

    /**
     * 启动服务
     */
    start() {
      setTimeout(() => {
        this.initScrollHandler();
        this.initObserver();
        this.checkNewCards();
      }, 800);
    }

    /**
     * 初始化滚动处理器
     */
    initScrollHandler() {
      let timeout;
      window.addEventListener('scroll', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => this.checkNewCards(), 200);
      }, { signal: this.abortController.signal });
    }

    /**
     * 检查新卡片
     */
    checkNewCards() {
      if (document.visibilityState === 'hidden') return;

      const cards = document.querySelectorAll(`
      .bili-video-card:not([data-quality-checked]),
      .video-page-card-small:not([data-quality-checked]),
      .video-page-card:not([data-quality-checked]),
      .up-main-video-card:not([data-quality-checked]),
      .small-item:not([data-quality-checked])
    `);

      cards.forEach(card => {
        if (!card.dataset.qualityChecked) {
          this.processQueue.add(card);
        }
      });

      this.processNextBatch();
    }

    /**
     * 处理下一批卡片
     */
    async processNextBatch() {
      if (this.isProcessing || this.processQueue.size === 0) return;

      this.isProcessing = true;
      const batchSize = 5;
      const batch = Array.from(this.processQueue).slice(0, batchSize);

      try {
        await Promise.all(batch.map(card => this.processCard(card)));
      } catch (error) {
        // 静默处理错误
      }

      batch.forEach(card => this.processQueue.delete(card));
      this.isProcessing = false;

      if (this.processQueue.size > 0) {
        setTimeout(() => this.processNextBatch(), 100);
      }
    }

    /**
     * 处理单个卡片
     */
    async processCard(card) {
      if (card.dataset.qualityChecked === 'true') return;
      if (!document.body.contains(card)) return;

      card.dataset.qualityChecked = 'processing';

      const link = card.querySelector('a[href*="/video/BV"]');
      if (!link) {
        card.dataset.qualityChecked = 'true';
        return;
      }

      const bvid = this.extractBVID(link.href);
      if (!bvid) {
        card.dataset.qualityChecked = 'true';
        return;
      }

      const container = this.findBadgeContainer(card);
      if (!container) {
        card.dataset.qualityChecked = 'true';
        return;
      }

      try {
        // 并行获取视频统计和广告片段
        const [stats, segments] = await Promise.all([
          this.fetchVideoStats(bvid).catch(() => null),
          this.sponsorAPI.fetchSegments(bvid).catch(() => [])
        ]);

        if (!document.body.contains(card)) return;

        // 创建标签容器
        const existingContainer = container.querySelector('.bili-tags-container');
        if (existingContainer) {
          existingContainer.remove();
        }

        const tagsContainer = document.createElement('div');
        tagsContainer.className = 'bili-tags-container';

        // 添加优质视频标签
        if (sponsorBlockConfig.get('showQualityBadge') && stats && this.isHighQuality(stats)) {
          const qualityBadge = this.createQualityBadge(stats);
          tagsContainer.appendChild(qualityBadge);
        }

        // 添加片段标签
        if (sponsorBlockConfig.get('showAdBadge') && segments && segments.length > 0) {
          const badges = this.createSegmentBadges(segments);
          badges.forEach(badge => tagsContainer.appendChild(badge));
        }

        // 如果有标签，插入到容器中
        if (tagsContainer.children.length > 0) {
          if (container.firstChild) {
            container.insertBefore(tagsContainer, container.firstChild);
          } else {
            container.appendChild(tagsContainer);
          }
        }
      } catch (error) {
        // 静默处理错误
      } finally {
        if (document.body.contains(card)) {
          card.dataset.qualityChecked = 'true';
        }
      }
    }

    /**
     * 查找标签容器
     */
    findBadgeContainer(card) {
      // UP主主页视频卡片
      if (card.classList.contains('up-main-video-card') || card.classList.contains('small-item')) {
        return card.querySelector('.cover-container, .cover, .pic-box') || card;
      }

      // 其他页面视频卡片
      if (card.classList.contains('video-page-card-small')) {
        return card.querySelector('.pic-box');
      }
      if (card.classList.contains('video-page-card')) {
        return card.querySelector('.pic');
      }
      return card.querySelector('.bili-video-card__cover, .cover, .pic, .bili-video-card__info') ||
             card.closest('.bili-video-card')?.querySelector('.bili-video-card__cover');
    }

    /**
     * 判断是否高质量
     */
    isHighQuality(stats) {
      return stats?.view >= SPONSORBLOCK.MIN_VIEWS && 
             stats.like / stats.view >= SPONSORBLOCK.MIN_SCORE;
    }

    /**
     * 判断是否顶级质量
     */
    isTopQuality(stats) {
      return stats?.coin >= stats?.like;
    }

    /**
     * 创建质量标签
     */
    createQualityBadge(stats) {
      const badge = document.createElement('span');
      badge.className = 'bili-quality-tag';
      if (this.isTopQuality(stats)) {
        badge.style.background = SPONSORBLOCK.TOP_TAG_COLOR;
        badge.textContent = SPONSORBLOCK.TOP_TAG_TEXT;
      } else {
        badge.style.background = SPONSORBLOCK.TAG_COLOR;
        badge.textContent = SPONSORBLOCK.TAG_TEXT;
      }
      return badge;
    }

    /**
     * 创建片段标签
     */
    createSegmentBadges(segments) {
      // 统计各类别的片段
      const categoryCount = {};
      segments.forEach(seg => {
        categoryCount[seg.category] = (categoryCount[seg.category] || 0) + 1;
      });

      // 为每个类别创建标签
      const badges = [];
      
      // 定义类别图标和颜色映射
      const categoryStyles = {
        'sponsor': { icon: '⚠️', text: '广告', color: 'linear-gradient(135deg, #FF8C00, #FF6347)' },
        'selfpromo': { icon: '📢', text: '推广', color: 'linear-gradient(135deg, #FFD700, #FFA500)' },
        'interaction': { icon: '👆', text: '三连', color: 'linear-gradient(135deg, #9C27B0, #E91E63)' },
        'poi_highlight': { icon: '⭐', text: '高光', color: 'linear-gradient(135deg, #FF1493, #FF69B4)' },
        'intro': { icon: '▶️', text: '开场', color: 'linear-gradient(135deg, #00CED1, #00BFFF)' },
        'outro': { icon: '🎬', text: '结尾', color: 'linear-gradient(135deg, #1E90FF, #4169E1)' },
        'preview': { icon: '🔄', text: '回顾', color: 'linear-gradient(135deg, #00A1D6, #0087B3)' },
        'filler': { icon: '💬', text: '闲聊', color: 'linear-gradient(135deg, #9370DB, #8A2BE2)' },
        'music_offtopic': { icon: '🎵', text: '非音乐', color: 'linear-gradient(135deg, #FF8C00, #FF7F50)' },
        'exclusive_access': { icon: '🤝', text: '合作', color: 'linear-gradient(135deg, #2E8B57, #3CB371)' },
        'mute': { icon: '🔇', text: '静音', color: 'linear-gradient(135deg, #DC143C, #C71585)' }
      };

      Object.entries(categoryCount).forEach(([category, count]) => {
        const style = categoryStyles[category] || 
                    { icon: '📍', text: category, color: 'linear-gradient(135deg, #888, #666)' };
        
        const badge = document.createElement('span');
        badge.className = 'bili-ad-tag';
        badge.style.background = style.color;
        badge.textContent = `${style.icon} ${style.text}`;
        if (count > 1) {
          badge.textContent += ` (${count})`;
        }
        badge.title = `包含 ${count} 个${style.text}片段`;
        badges.push(badge);
      });

      return badges;
    }

    /**
     * 提取BVID
     */
    extractBVID(url) {
      try {
        return new URL(url).pathname.match(/video\/(BV\w+)/)?.[1];
      } catch {
        return null;
      }
    }

    /**
     * 获取视频统计
     */
    async fetchVideoStats(bvid) {
      // 检查缓存
      if (this.statsCache.has(bvid)) {
        return this.statsCache.get(bvid);
      }

      if (this.pendingRequests.has(bvid)) {
        return this.pendingRequests.get(bvid);
      }

      const promise = new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: "GET",
          url: `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
          timeout: 5000,
          onload: (res) => {
            try {
              const data = JSON.parse(res.responseText);
              if (data?.code === 0 && data?.data?.stat) {
                this.statsCache.set(bvid, data.data.stat);
                resolve(data.data.stat);
              } else {
                reject(new Error('Invalid API response'));
              }
            } catch (error) {
              reject(error);
            }
          },
          onerror: reject,
          ontimeout: () => reject(new Error('Timeout'))
        });
      });

      this.pendingRequests.set(bvid, promise);
      return promise.finally(() => {
        this.pendingRequests.delete(bvid);
      });
    }

    /**
     * 初始化观察器
     */
    initObserver() {
      this.observer = new MutationObserver((mutations) => {
        let shouldCheck = false;
        for (const mutation of mutations) {
          if (mutation.addedNodes.length > 0) {
            shouldCheck = true;
            break;
          }
        }
        if (shouldCheck) {
          this.checkNewCards();
        }
      });

      this.observer.observe(document.body, {
        childList: true,
        subtree: true
      });
    }

    /**
     * 销毁服务
     */
    destroy() {
      this.observer?.disconnect();
      this.abortController.abort();
      this.processQueue.clear();
      this.pendingRequests.clear();
      this.statsCache.clear();
    }
  }

  // 创建全局单例（需要传入API实例）
  let videoQualityServiceInstance = null;

  function createVideoQualityService(sponsorBlockAPI) {
    if (!videoQualityServiceInstance) {
      videoQualityServiceInstance = new VideoQualityService(sponsorBlockAPI);
    }
    return videoQualityServiceInstance;
  }

  /**
   * 通知模块
   * 统一的错误处理和用户提示机制
   */


  class Notification {
    constructor() {
      this.toastElement = null;
      this.init();
    }

    /**
     * 初始化Toast元素
     */
    init() {
      this.toastElement = document.createElement('div');
      this.toastElement.className = 'notion-toast';
    }

    /**
     * 显示Toast提示
     * @param {string} message - 消息内容
     * @param {number} duration - 显示时长（毫秒）
     */
    showToast(message, duration = TIMING.TOAST_DURATION) {
      this.toastElement.textContent = message;
      document.body.appendChild(this.toastElement);
      
      setTimeout(() => this.toastElement.classList.add('show'), 10);

      setTimeout(() => {
        this.toastElement.classList.remove('show');
        setTimeout(() => {
          if (this.toastElement.parentNode) {
            document.body.removeChild(this.toastElement);
          }
        }, 300);
      }, duration);
    }

    /**
     * 显示成功消息
     * @param {string} message
     */
    success(message) {
      this.showToast(message);
    }

    /**
     * 显示警告消息
     * @param {string} message
     */
    warning(message) {
      this.showToast(message);
    }

    /**
     * 显示错误消息
     * @param {string} message
     * @param {boolean} useAlert - 是否同时使用alert（用于重要错误）
     */
    error(message, useAlert = false) {
      this.showToast(message, 3000);
      
      if (useAlert) {
        alert(message);
      }
    }

    /**
     * 显示信息消息
     * @param {string} message
     */
    info(message) {
      this.showToast(message);
    }

    /**
     * 处理错误（统一的错误处理逻辑）
     * @param {Error|string} error - 错误对象或错误信息
     * @param {string} context - 错误上下文（用于日志）
     * @param {boolean} silent - 是否静默处理（不显示给用户）
     * @param {boolean} useAlert - 是否使用alert
     */
    handleError(error, context = '', silent = false, useAlert = false) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      // 记录到控制台
      console.error(`[Error] ${context}:`, error);
      
      // 显示给用户（如果不是静默模式）
      if (!silent) {
        this.error(errorMessage, useAlert);
      }
    }

    /**
     * 确认对话框
     * @param {string} message - 确认消息
     * @returns {boolean}
     */
    confirm(message) {
      return window.confirm(message);
    }
  }

  // 创建全局单例
  const notification = new Notification();

  /**
   * UI渲染模块
   * 负责生成所有UI元素的HTML
   */


  class UIRenderer {
    /**
     * 渲染字幕面板
     * @param {Array} subtitleData - 字幕数据
     * @returns {string} - HTML字符串
     */
    renderSubtitlePanel(subtitleData) {
      const videoKey = state.getVideoKey();
      videoKey ? state.getAISummary(videoKey) : null;

      let html = `
      <div class="subtitle-header">
        <span>视频字幕</span>
        <div class="subtitle-header-actions">
          <span class="ai-icon ${state.ai.isSummarizing ? 'loading' : ''}" title="AI 总结">
            ${ICONS.AI}
          </span>
          <span class="download-icon" title="下载字幕">
            ${ICONS.DOWNLOAD}
          </span>
          <span class="notion-icon ${state.notion.isSending ? 'loading' : ''}" title="发送到 Notion">
            ${ICONS.NOTION}
          </span>
          <span class="subtitle-close">×</span>
        </div>
      </div>
      <div class="subtitle-content">
        <button class="subtitle-toggle-btn" id="subtitle-toggle-btn" title="展开/收起字幕列表 (${subtitleData.length}条)">
          <span class="subtitle-toggle-icon">►</span>
        </button>
        <div class="subtitle-list-container" id="subtitle-list-container">
    `;

      // 渲染字幕列表
      subtitleData.forEach((item, index) => {
        const startTime = formatTime(item.from);
        html += `
        <div class="subtitle-item" data-index="${index}" data-from="${item.from}" data-to="${item.to}">
          <div class="subtitle-item-header">
            <div class="subtitle-time">${startTime}</div>
            <button class="save-subtitle-note-btn" data-content="${this.escapeHtml(item.content)}" title="保存为笔记">保存</button>
          </div>
          <div class="subtitle-text">${item.content}</div>
        </div>
      `;
      });

      html += `
        </div>
      </div>
    `;

      return html;
    }

    /**
     * HTML转义
     * @param {string} text - 要转义的文本
     * @returns {string} 转义后的文本
     */
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    /**
     * 渲染AI总结区域
     * @param {string} summary - 总结内容（Markdown格式）
     * @param {boolean} isLoading - 是否正在加载
     * @returns {HTMLElement} - DOM元素
     */
    renderAISummarySection(summary = null, isLoading = false) {
      const section = document.createElement('div');
      section.className = 'ai-summary-section';

      if (isLoading) {
        section.innerHTML = `
        <div class="ai-summary-title">
          <span>✨ AI 视频总结</span>
        </div>
        <div class="ai-summary-content ai-summary-loading">正在生成总结...</div>
      `;
      } else if (summary) {
        section.innerHTML = `
        <div class="ai-summary-title">
          <span>✨ AI 视频总结</span>
        </div>
        <div class="ai-summary-content">${marked.parse(summary)}</div>
      `;
      }

      return section;
    }

    /**
     * 更新AI总结内容
     * @param {HTMLElement} container - 字幕容器元素
     * @param {string} summary - 总结内容
     */
    updateAISummary(container, summary) {
      const contentDiv = container.querySelector('.subtitle-content');
      if (!contentDiv) return;

      let summarySection = contentDiv.querySelector('.ai-summary-section');

      if (!summarySection) {
        summarySection = this.renderAISummarySection(summary);
        contentDiv.insertBefore(summarySection, contentDiv.firstChild);
      } else {
        const summaryContent = summarySection.querySelector('.ai-summary-content');
        if (summaryContent) {
          summaryContent.classList.remove('ai-summary-loading');
          summaryContent.innerHTML = marked.parse(summary);
        }
      }
    }

    /**
     * 创建Notion配置模态框
     * @returns {HTMLElement}
     */
    createNotionConfigModal() {
      const modal = document.createElement('div');
      modal.id = 'notion-config-modal';
      modal.className = 'config-modal';
      modal.innerHTML = `
      <div class="config-modal-content">
        <div class="config-modal-header">
          <span>Notion 集成配置</span>
        </div>
        <div class="config-modal-body">
          <div class="config-field">
            <label>1️⃣ Notion API Key</label>
            <input type="password" id="notion-api-key" placeholder="输入你的 Integration Token">
            <div class="config-help">
              访问 <a href="https://www.notion.so/my-integrations" target="_blank">Notion Integrations</a> 创建 Integration 并复制 Token
            </div>
          </div>
          <div class="config-field">
            <label>2️⃣ 目标位置（二选一）</label>
            <input type="text" id="notion-parent-page-id" placeholder="Page ID 或 Database ID">
            <div class="config-help">
              <strong>方式A - 使用已有数据库：</strong><br>
              从数据库 URL 中获取：<code>notion.so/<strong>abc123...</strong>?v=...</code><br>
              脚本会直接向该数据库添加记录
            </div>
            <div class="config-help" style="margin-top: 8px;">
              <strong>方式B - 自动创建数据库：</strong><br>
              从页面 URL 中获取：<code>notion.so/My-Page-<strong>abc123...</strong></code><br>
              首次使用会在此页面下创建数据库
            </div>
            <div class="config-help" style="margin-top: 8px; color: #f59e0b;">
              ⚠️ 重要：需要在「Share」中邀请你的 Integration
            </div>
          </div>
        <div class="config-field">
          <label>
            <input type="checkbox" id="notion-auto-send-enabled">
            自动发送（获取字幕后自动发送到Notion）
          </label>
        </div>
          <div id="notion-status-message"></div>
        </div>
        <div class="config-footer">
          <button class="config-btn config-btn-secondary" id="notion-cancel-btn">取消</button>
          <button class="config-btn config-btn-primary" id="notion-save-btn">保存配置</button>
        </div>
      </div>
    `;

      return modal;
    }

    /**
     * 创建AI配置模态框
     * @returns {HTMLElement}
     */
    createAIConfigModal() {
      const modal = document.createElement('div');
      modal.id = 'ai-config-modal';
      modal.className = 'config-modal';
      modal.innerHTML = `
      <div class="config-modal-content">
        <div class="config-modal-header">
          <span>AI 配置管理</span>
        </div>
        <div class="config-modal-body">
          <div style="margin-bottom: 20px; padding: 15px; background: rgba(254, 235, 234, 0.1); border-radius: 10px; border-left: 4px solid #feebea;">
            <div style="font-size: 13px; color: #fff; font-weight: 600; margin-bottom: 4px;">使用提示</div>
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); line-height: 1.5;">
              点击配置卡片直接查看和编辑，修改后保存即更新。点击「新建配置」创建新配置。
            </div>
          </div>
          <div class="ai-config-list" id="ai-config-list"></div>
          <div style="margin-bottom: 15px; text-align: center;">
            <button class="config-btn config-btn-secondary" id="ai-new-config-btn" style="padding: 8px 16px; font-size: 13px;">新建配置</button>
          </div>
          <div class="ai-config-form hidden">
          <div class="config-field">
            <label>配置名称</label>
            <input type="text" id="ai-config-name" placeholder="例如：OpenAI GPT-4">
          </div>
          <div class="config-field">
            <label>API URL</label>
            <input type="text" id="ai-config-url" placeholder="https://api.openai.com/v1/chat/completions">
          </div>
          <div class="config-field">
            <label>API Key</label>
            <input type="password" id="ai-config-apikey" placeholder="sk-...">
          </div>
          <div class="config-field">
            <label>模型</label>
            <div class="model-field-with-button">
              <input type="text" id="ai-config-model" placeholder="手动输入或点击获取模型">
              <button class="fetch-models-btn" id="fetch-models-btn">获取模型</button>
            </div>
            <div class="model-select-wrapper" id="model-select-wrapper" style="display:none;">
              <input type="text" id="model-search-input" class="model-search-input" placeholder="🔍 搜索模型...">
              <select id="model-select" size="8"></select>
            </div>
          </div>
          <div class="config-field">
            <label>
              <input type="checkbox" id="ai-config-is-openrouter">
              使用OpenRouter (支持获取模型列表)
            </label>
          </div>
          <div class="config-field">
            <label>提示词 (Prompt)</label>
            <textarea id="ai-config-prompt" placeholder="根据以下视频字幕，用中文总结视频内容："></textarea>
          </div>
          <div class="config-field">
            <label>
              <input type="checkbox" id="ai-auto-summary-enabled">
              自动总结（获取字幕后自动触发AI总结）
            </label>
          </div>
          </div>
        </div>
        <div class="config-footer">
          <button class="config-btn config-btn-danger" id="ai-delete-current-btn" style="display:none;">删除此配置</button>
          <div style="flex: 1;"></div>
          <button class="config-btn config-btn-secondary" id="ai-cancel-btn">取消</button>
          <button class="config-btn config-btn-primary" id="ai-save-new-btn">添加新配置</button>
          <button class="config-btn config-btn-primary" id="ai-update-btn" style="display:none;">更新配置</button>
        </div>
      </div>
    `;

      return modal;
    }

    /**
     * 渲染AI配置列表
     * @param {HTMLElement} listElement - 列表容器元素
     */
    renderAIConfigList(listElement) {
      const configs = config.getAIConfigs();
      const selectedId = config.getSelectedAIConfigId();

      listElement.innerHTML = configs.map(cfg => `
      <div class="ai-config-item ${cfg.id === selectedId ? 'selected' : ''}" data-id="${cfg.id}">
        <div class="ai-config-item-name">${cfg.name}</div>
        <div class="ai-config-item-actions">
          <button class="ai-config-btn-small config-btn-primary ai-edit-btn" data-id="${cfg.id}">编辑</button>
        </div>
      </div>
    `).join('');
    }

    /**
     * 显示Notion配置状态
     * @param {string} message - 消息内容
     * @param {boolean} isError - 是否为错误
     */
    showNotionStatus(message, isError = false) {
      const statusEl = document.getElementById('notion-status-message');
      if (statusEl) {
        statusEl.className = `config-status ${isError ? 'error' : 'success'}`;
        statusEl.textContent = message;
      }
    }
  }

  // 创建全局单例
  const uiRenderer = new UIRenderer();

  /**
   * 笔记面板UI模块
   * 负责渲染笔记管理界面
   */


  class NotesPanel {
    constructor() {
      this.panel = null;
      this.isPanelVisible = false;
    }

    /**
     * 创建笔记面板元素
     */
    createPanel() {
      if (this.panel) {
        return this.panel;
      }

      this.panel = document.createElement('div');
      this.panel.id = 'notes-panel';
      this.panel.className = 'notes-panel';
      
      document.body.appendChild(this.panel);
      return this.panel;
    }

    /**
     * 显示笔记面板
     */
    showPanel() {
      const panel = this.createPanel();
      this.renderPanel();
      panel.classList.add('show');
      this.isPanelVisible = true;
    }

    /**
     * 隐藏笔记面板
     */
    hidePanel() {
      if (this.panel) {
        this.panel.classList.remove('show');
      }
      this.isPanelVisible = false;
    }

    /**
     * 切换笔记面板显示/隐藏
     */
    togglePanel() {
      if (this.isPanelVisible) {
        this.hidePanel();
      } else {
        this.showPanel();
      }
    }

    /**
     * 渲染笔记面板内容
     */
    renderPanel() {
      const panel = this.createPanel();
      const groupedNotes = notesService.getGroupedNotes();

      const html = `
      <div class="notes-panel-content">
        <div class="notes-panel-header">
          <h2>我的笔记</h2>
          <button class="notes-panel-close">×</button>
        </div>
        <div class="notes-panel-body">
          ${groupedNotes.length === 0 ? this.renderEmptyState() : groupedNotes.map(group => this.renderGroup(group)).join('')}
        </div>
      </div>
    `;

      panel.innerHTML = html;
      this.bindPanelEvents();
    }

    /**
     * 渲染空状态
     */
    renderEmptyState() {
      return `
      <div class="notes-empty-state">
        <div class="notes-empty-icon">📝</div>
        <div>还没有保存任何笔记</div>
        <div class="notes-empty-hint">选中文字后点击粉色点即可保存</div>
      </div>
    `;
    }

    /**
     * 渲染笔记分组
     * @param {Object} group - 分组对象 {date, notes}
     */
    renderGroup(group) {
      return `
      <div class="note-group">
        <div class="note-group-header">
          <div class="note-group-title">
            ${group.date} (${group.notes.length}条)
          </div>
          <div class="note-group-actions">
            <button class="note-group-copy-btn" data-date="${group.date}">
              批量复制
            </button>
            <button class="note-group-delete-btn" data-date="${group.date}">
              批量删除
            </button>
          </div>
        </div>
        <div class="note-group-items">
          ${group.notes.map(note => this.renderNote(note)).join('')}
        </div>
      </div>
    `;
    }

    /**
     * 渲染单条笔记
     * @param {Object} note - 笔记对象
     */
    renderNote(note) {
      const displayContent = note.content.length > 200 
        ? note.content.substring(0, 200) + '...' 
        : note.content;

      return `
      <div class="note-item" data-note-id="${note.id}">
        <div class="note-content">${this.escapeHtml(displayContent)}</div>
        <div class="note-footer">
          <div class="note-time">${notesService.formatTime(note.timestamp)}</div>
          <div class="note-actions">
            <button class="note-copy-btn" data-note-id="${note.id}">复制</button>
            <button class="note-delete-btn" data-note-id="${note.id}">删除</button>
          </div>
        </div>
      </div>
    `;
    }

    /**
     * HTML转义
     * @param {string} text - 要转义的文本
     * @returns {string} 转义后的文本
     */
    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    /**
     * 复制文本到剪贴板
     * @param {string} text - 要复制的文本
     */
    async copyToClipboard(text) {
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(text);
        } else {
          const textarea = document.createElement('textarea');
          textarea.value = text;
          textarea.style.position = 'fixed';
          textarea.style.opacity = '0';
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand('copy');
          document.body.removeChild(textarea);
        }
      } catch (error) {
        console.error('复制失败:', error);
      }
    }

    /**
     * 绑定面板事件
     */
    bindPanelEvents() {
      // 关闭按钮
      const closeBtn = this.panel.querySelector('.notes-panel-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.hidePanel());
      }

      // 复制单条笔记
      this.panel.querySelectorAll('.note-copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const noteId = e.target.getAttribute('data-note-id');
          const note = notesService.getAllNotes().find(n => n.id === noteId);
          if (note) {
            await this.copyToClipboard(note.content);
            const originalText = e.target.textContent;
            e.target.textContent = '✓';
            setTimeout(() => {
              e.target.textContent = originalText;
            }, 1000);
          }
        });
      });

      // 删除单条笔记
      this.panel.querySelectorAll('.note-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const noteId = e.target.getAttribute('data-note-id');
          notesService.deleteNote(noteId);
          this.renderPanel();
        });
      });

      // 批量复制
      this.panel.querySelectorAll('.note-group-copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const date = e.target.getAttribute('data-date');
          const groupedNotes = notesService.getGroupedNotes();
          const group = groupedNotes.find(g => g.date === date);
          
          if (group) {
            const contents = group.notes.map(note => note.content).join('\n\n');
            await this.copyToClipboard(contents);
            const originalText = e.target.textContent;
            e.target.textContent = '✓';
            setTimeout(() => {
              e.target.textContent = originalText;
            }, 1000);
          }
        });
      });

      // 批量删除
      this.panel.querySelectorAll('.note-group-delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const date = e.target.getAttribute('data-date');
          const groupedNotes = notesService.getGroupedNotes();
          const group = groupedNotes.find(g => g.date === date);
          
          if (group && confirm(`确定要删除 ${date} 的 ${group.notes.length} 条笔记吗？`)) {
            const noteIds = group.notes.map(note => note.id);
            notesService.deleteNotes(noteIds);
            this.renderPanel();
          }
        });
      });
    }

    /**
     * 在字幕项中添加保存按钮
     * @param {HTMLElement} subtitleItem - 字幕项元素
     */
    addSaveButton(subtitleItem) {
      if (subtitleItem.querySelector('.save-subtitle-note-btn')) {
        return;
      }

      const content = subtitleItem.querySelector('.subtitle-text')?.textContent;
      if (!content) return;

      const saveBtn = document.createElement('button');
      saveBtn.className = 'save-subtitle-note-btn';
      saveBtn.textContent = '保存';
      saveBtn.title = '保存此字幕为笔记';
      
      saveBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notesService.saveSubtitleNote(content);
        saveBtn.textContent = '✓';
        setTimeout(() => {
          saveBtn.textContent = '保存';
        }, 1000);
      });

      const footer = subtitleItem.querySelector('.subtitle-time');
      if (footer) {
        footer.appendChild(saveBtn);
      }
    }

    /**
     * 为所有字幕项添加保存按钮
     * @param {HTMLElement} container - 字幕容器
     */
    addSaveButtonsToSubtitles(container) {
      const subtitleItems = container.querySelectorAll('.subtitle-item');
      subtitleItems.forEach(item => this.addSaveButton(item));
    }
  }

  // 创建全局单例
  const notesPanel = new NotesPanel();

  /**
   * 事件处理模块
   * 负责所有UI事件的绑定和处理
   */


  class EventHandlers {
    constructor() {
      this.isDragging = false;
      this.dragStartX = 0;
      this.dragStartY = 0;
      this.translateX = 0;
      this.translateY = 0;
      this.isResizing = false;
      this.resizeStartX = 0;
      this.resizeStartY = 0;
      this.resizeStartWidth = 0;
      this.resizeStartHeight = 0;
    }

    /**
     * 绑定字幕面板事件
     * @param {HTMLElement} container - 字幕容器
     */
    bindSubtitlePanelEvents(container) {
      // 关闭按钮
      const closeBtn = container.querySelector('.subtitle-close');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => {
          state.setPanelVisible(false);
          container.classList.remove('show');
        });
      }

      // AI总结按钮
      const aiIcon = container.querySelector('.ai-icon');
      if (aiIcon) {
        aiIcon.addEventListener('click', async (e) => {
          e.stopPropagation();
          const subtitleData = state.getSubtitleData();
          if (subtitleData) {
            try {
              await aiService.summarize(subtitleData, false);
            } catch (error) {
              notification.handleError(error, 'AI总结');
            }
          }
        });
      }

      // 下载按钮
      const downloadIcon = container.querySelector('.download-icon');
      if (downloadIcon) {
        downloadIcon.addEventListener('click', (e) => {
          e.stopPropagation();
          try {
            subtitleService.downloadSubtitleFile();
            notification.success('字幕文件已下载');
          } catch (error) {
            notification.handleError(error, '下载字幕');
          }
        });
      }

      // Notion发送按钮
      const notionIcon = container.querySelector('.notion-icon');
      if (notionIcon) {
        notionIcon.addEventListener('click', async (e) => {
          e.stopPropagation();
          const subtitleData = state.getSubtitleData();
          if (subtitleData) {
            try {
              await notionService.sendSubtitle(subtitleData, false);
            } catch (error) {
              notification.handleError(error, 'Notion发送');
            }
          }
        });
      }

      // 展开/收起按钮
      const toggleBtn = container.querySelector('#subtitle-toggle-btn');
      const listContainer = container.querySelector('#subtitle-list-container');
      if (toggleBtn && listContainer) {
        toggleBtn.addEventListener('click', () => {
          listContainer.classList.toggle('expanded');
          toggleBtn.classList.toggle('expanded');
        });
      }

      // 字幕项点击跳转
      const subtitleItems = container.querySelectorAll('.subtitle-item');
      subtitleItems.forEach(item => {
        item.addEventListener('click', () => {
          const video = document.querySelector(SELECTORS.VIDEO);
          if (video) {
            const startTime = parseFloat(item.dataset.from);
            
            // 先移除所有高亮
            container.querySelectorAll('.subtitle-item').forEach(i => {
              i.classList.remove('current');
            });
            
            // 只高亮当前点击的
            item.classList.add('current');
            
            // 跳转视频
            video.currentTime = startTime;
          }
        });
      });

      // 保存笔记按钮
      const saveButtons = container.querySelectorAll('.save-subtitle-note-btn');
      saveButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const content = btn.getAttribute('data-content');
          if (content) {
            notesService.saveSubtitleNote(content);
            btn.textContent = '✓';
            setTimeout(() => {
              btn.textContent = '保存';
            }, 1000);
          }
        });
      });

      // 同步字幕高亮
      this.syncSubtitleHighlight(container);
    }

    /**
     * 设置拖拽功能
     * @param {HTMLElement} container - 字幕容器
     */
    setupDragging(container) {
      const header = container.querySelector('.subtitle-header');
      if (!header) return;

      header.addEventListener('mousedown', (e) => {
        // 如果点击的是按钮，不触发拖拽
        if (e.target.closest('.subtitle-close') || 
            e.target.closest('.ai-icon') || 
            e.target.closest('.download-icon') || 
            e.target.closest('.notion-icon')) {
          return;
        }

        this.isDragging = true;
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        
        // 启用GPU加速
        container.style.willChange = 'transform';
        
        e.preventDefault();
      });

      document.addEventListener('mousemove', (e) => {
        if (!this.isDragging) return;
        
        requestAnimationFrame(() => {
          const deltaX = e.clientX - this.dragStartX;
          const deltaY = e.clientY - this.dragStartY;
          
          this.translateX += deltaX;
          this.translateY += deltaY;
          
          this.dragStartX = e.clientX;
          this.dragStartY = e.clientY;
          
          container.style.transform = `translate(${this.translateX}px, ${this.translateY}px)`;
        });
      });

      document.addEventListener('mouseup', () => {
        if (this.isDragging) {
          this.isDragging = false;
          container.style.willChange = 'auto';
          this.savePanelPosition(container);
        }
      });
    }

    /**
     * 设置大小调整功能
     * @param {HTMLElement} container - 字幕容器
     */
    setupResize(container) {
      const resizeHandle = container.querySelector('.subtitle-resize-handle');
      if (!resizeHandle) return;

      resizeHandle.addEventListener('mousedown', (e) => {
        this.isResizing = true;
        this.resizeStartX = e.clientX;
        this.resizeStartY = e.clientY;
        this.resizeStartWidth = container.offsetWidth;
        this.resizeStartHeight = container.offsetHeight;
        
        e.preventDefault();
        e.stopPropagation();
      });

      document.addEventListener('mousemove', (e) => {
        if (!this.isResizing) return;
        
        requestAnimationFrame(() => {
          const deltaX = e.clientX - this.resizeStartX;
          const deltaY = e.clientY - this.resizeStartY;
          
          const newWidth = this.resizeStartWidth + deltaX;
          const newHeight = this.resizeStartHeight + deltaY;
          
          // 限制尺寸范围
          const constrainedWidth = Math.max(300, Math.min(800, newWidth));
          const maxHeight = window.innerHeight * 0.9;
          const constrainedHeight = Math.max(400, Math.min(maxHeight, newHeight));
          
          container.style.width = `${constrainedWidth}px`;
          container.style.maxHeight = `${constrainedHeight}px`;
        });
      });

      document.addEventListener('mouseup', () => {
        if (this.isResizing) {
          this.isResizing = false;
          this.savePanelDimensions(container);
        }
      });
    }

    /**
     * 保存面板位置
     */
    savePanelPosition(container) {
      try {
        localStorage.setItem('subtitle_panel_position', JSON.stringify({
          translateX: this.translateX,
          translateY: this.translateY
        }));
      } catch (error) {
        console.error('保存面板位置失败:', error);
      }
    }

    /**
     * 保存面板尺寸
     */
    savePanelDimensions(container) {
      try {
        localStorage.setItem('subtitle_panel_dimensions', JSON.stringify({
          width: container.offsetWidth,
          height: container.offsetHeight
        }));
      } catch (error) {
        console.error('保存面板尺寸失败:', error);
      }
    }

    /**
     * 加载面板尺寸和位置
     */
    loadPanelDimensions(container) {
      try {
        // 加载尺寸
        const savedDimensions = localStorage.getItem('subtitle_panel_dimensions');
        if (savedDimensions) {
          const { width, height } = JSON.parse(savedDimensions);
          container.style.width = `${width}px`;
          container.style.maxHeight = `${height}px`;
        }

        // 加载位置
        const savedPosition = localStorage.getItem('subtitle_panel_position');
        if (savedPosition) {
          const { translateX, translateY } = JSON.parse(savedPosition);
          this.translateX = translateX;
          this.translateY = translateY;
          container.style.transform = `translate(${translateX}px, ${translateY}px)`;
        }
      } catch (error) {
        console.error('加载面板设置失败:', error);
      }
    }

    /**
     * 同步字幕高亮
     * @param {HTMLElement} container - 字幕容器
     */
    syncSubtitleHighlight(container) {
      const video = document.querySelector(SELECTORS.VIDEO);

      if (video) {
        video.addEventListener('timeupdate', () => {
          const currentTime = video.currentTime;
          const items = container.querySelectorAll('.subtitle-item');

          // 找到第一个匹配的字幕（按顺序）
          let foundMatch = false;
          items.forEach(item => {
            const from = parseFloat(item.dataset.from);
            const to = parseFloat(item.dataset.to);

            if (!foundMatch && currentTime >= from && currentTime <= to) {
              item.classList.add('current');
              foundMatch = true;
            } else {
              item.classList.remove('current');
            }
          });
        });
      }
    }

    /**
     * 显示AI配置模态框
     */
    showAIConfigModal() {
      const modal = document.getElementById('ai-config-modal');
      if (!modal) return;

      // 渲染配置列表
      const listEl = document.getElementById('ai-config-list');
      if (listEl) {
        uiRenderer.renderAIConfigList(listEl);
      }

      // 清空表单并隐藏
      this.clearAIConfigForm();
      const formEl = modal.querySelector('.ai-config-form');
      if (formEl) {
        formEl.classList.add('hidden');
      }

      // 加载自动总结开关
      document.getElementById('ai-auto-summary-enabled').checked = config.getAIAutoSummaryEnabled();

      modal.classList.add('show');
    }

    /**
     * 隐藏AI配置模态框
     */
    hideAIConfigModal() {
      const modal = document.getElementById('ai-config-modal');
      if (!modal) return;

      // 保存自动总结开关
      const autoSummaryEnabled = document.getElementById('ai-auto-summary-enabled').checked;
      config.setAIAutoSummaryEnabled(autoSummaryEnabled);

      modal.classList.remove('show');
      this.clearAIConfigForm();
    }

    /**
     * 清空AI配置表单
     */
    clearAIConfigForm() {
      const nameEl = document.getElementById('ai-config-name');
      const urlEl = document.getElementById('ai-config-url');
      const apikeyEl = document.getElementById('ai-config-apikey');
      const modelEl = document.getElementById('ai-config-model');
      const promptEl = document.getElementById('ai-config-prompt');
      const openrouterEl = document.getElementById('ai-config-is-openrouter');
      const saveNewBtn = document.getElementById('ai-save-new-btn');
      const updateBtn = document.getElementById('ai-update-btn');
      const modelSelectWrapper = document.getElementById('model-select-wrapper');

      if (nameEl) nameEl.value = '';
      if (urlEl) urlEl.value = 'https://openrouter.ai/api/v1/chat/completions';
      if (apikeyEl) apikeyEl.value = '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';
      if (modelEl) modelEl.value = 'alibaba/tongyi-deepresearch-30b-a3b:free';
      if (promptEl) promptEl.value = `请用中文总结以下视频字幕内容，使用Markdown格式输出。

要求：
1. 在开头提供TL;DR（不超过50字的核心摘要）
2. 使用标题、列表等Markdown格式组织内容
3. 突出关键信息和要点

字幕内容：
`;
      if (openrouterEl) openrouterEl.checked = true;
      if (saveNewBtn) saveNewBtn.style.display = '';
      if (updateBtn) updateBtn.style.display = 'none';
      if (modelSelectWrapper) modelSelectWrapper.style.display = 'none';
    }

    /**
     * 显示Notion配置模态框
     */
    showNotionConfigModal() {
      const modal = document.getElementById('notion-config-modal');
      if (!modal) return;

      const notionConfig = config.getNotionConfig();
      document.getElementById('notion-api-key').value = notionConfig.apiKey;
      document.getElementById('notion-parent-page-id').value = notionConfig.parentPageId;
      document.getElementById('notion-auto-send-enabled').checked = config.getNotionAutoSendEnabled();
      
      const statusEl = document.getElementById('notion-status-message');
      if (statusEl) statusEl.innerHTML = '';

      modal.classList.add('show');
    }

    /**
     * 隐藏Notion配置模态框
     */
    hideNotionConfigModal() {
      const modal = document.getElementById('notion-config-modal');
      if (modal) {
        modal.classList.remove('show');
      }
    }

    /**
     * 绑定AI配置模态框事件
     * @param {HTMLElement} modal - AI配置模态框
     */
    bindAIConfigModalEvents(modal) {
      // 点击背景关闭
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideAIConfigModal();
        }
      });

      // 绑定配置列表事件（选择、编辑）
      const listEl = document.getElementById('ai-config-list');
      if (listEl) {
        listEl.addEventListener('click', (e) => {
          const item = e.target.closest('.ai-config-item');
          const editBtn = e.target.closest('.ai-edit-btn');

          if (editBtn) {
            const id = editBtn.dataset.id;
            // 显示表单并加载配置
            const formEl = modal.querySelector('.ai-config-form');
            if (formEl) {
              formEl.classList.remove('hidden');
            }
            this.loadConfigToForm(id);
          } else if (item && !editBtn) {
            const id = item.dataset.id;
            config.setSelectedAIConfigId(id);
            uiRenderer.renderAIConfigList(listEl);
            const cfg = config.getAIConfigs().find(c => c.id === id);
            notification.success(`已选择配置: ${cfg.name}`);
            // 显示表单并加载配置
            const formEl = modal.querySelector('.ai-config-form');
            if (formEl) {
              formEl.classList.remove('hidden');
            }
            this.loadConfigToForm(id);
          }
        });
      }

      // 新建配置按钮
      document.getElementById('ai-new-config-btn').addEventListener('click', () => {
        this.clearAIConfigForm();
        // 显示表单
        const formEl = modal.querySelector('.ai-config-form');
        if (formEl) {
          formEl.classList.remove('hidden');
          // 滚动到表单
          setTimeout(() => {
            formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          }, 100);
        }
        notification.info('请填写新配置信息');
      });

      // 保存/添加按钮
      document.getElementById('ai-save-new-btn').addEventListener('click', () => {
        this.saveNewAIConfig();
      });

      document.getElementById('ai-update-btn').addEventListener('click', () => {
        this.updateAIConfig();
      });

      // 取消按钮
      document.getElementById('ai-cancel-btn').addEventListener('click', () => {
        this.hideAIConfigModal();
      });

      // 删除配置按钮
      document.getElementById('ai-delete-current-btn').addEventListener('click', () => {
        const deleteBtn = document.getElementById('ai-delete-current-btn');
        const id = deleteBtn?.dataset.deleteId;
        if (!id) return;

        if (notification.confirm('确定要删除这个配置吗？')) {
          const result = config.deleteAIConfig(id);
          if (result.success) {
            notification.success('配置已删除');
            const listEl = document.getElementById('ai-config-list');
            if (listEl) uiRenderer.renderAIConfigList(listEl);
            // 隐藏表单
            const formEl = document.querySelector('.ai-config-form');
            if (formEl) {
              formEl.classList.add('hidden');
            }
            // 隐藏删除按钮
            deleteBtn.style.display = 'none';
          } else {
            notification.error(result.error);
          }
        }
      });

      // 获取模型按钮
      document.getElementById('fetch-models-btn').addEventListener('click', async () => {
        await this.fetchModels();
      });
    }

    /**
     * 加载配置到表单（选择配置时使用）
     * @param {string} id - 配置ID
     */
    loadConfigToForm(id) {
      const configs = config.getAIConfigs();
      const cfg = configs.find(c => c.id === id);
      if (!cfg) return;

      const nameEl = document.getElementById('ai-config-name');
      const urlEl = document.getElementById('ai-config-url');
      const apikeyEl = document.getElementById('ai-config-apikey');
      const modelEl = document.getElementById('ai-config-model');
      const promptEl = document.getElementById('ai-config-prompt');
      const openrouterEl = document.getElementById('ai-config-is-openrouter');
      const saveNewBtn = document.getElementById('ai-save-new-btn');
      const updateBtn = document.getElementById('ai-update-btn');
      const modelSelectWrapper = document.getElementById('model-select-wrapper');

      if (nameEl) nameEl.value = cfg.name;
      if (urlEl) urlEl.value = cfg.url;
      if (apikeyEl) apikeyEl.value = cfg.apiKey;
      if (modelEl) modelEl.value = cfg.model;
      if (promptEl) promptEl.value = cfg.prompt;
      if (openrouterEl) openrouterEl.checked = cfg.isOpenRouter || false;

      // 显示更新按钮
      if (saveNewBtn) saveNewBtn.style.display = 'none';
      if (updateBtn) {
        updateBtn.style.display = '';
        updateBtn.dataset.editId = id;
      }
      if (modelSelectWrapper) modelSelectWrapper.style.display = 'none';

      // 显示/隐藏删除按钮（非预设配置显示）
      const deleteBtn = document.getElementById('ai-delete-current-btn');
      if (deleteBtn) {
        if (id === 'openrouter' || id === 'openai' || id === 'siliconflow' || 
            id === 'deepseek' || id === 'moonshot' || id === 'zhipu' || 
            id === 'yi' || id === 'dashscope' || id === 'gemini') {
          deleteBtn.style.display = 'none';
        } else {
          deleteBtn.style.display = '';
          deleteBtn.dataset.deleteId = id;
        }
      }

      // 滚动到表单
      setTimeout(() => {
        const formEl = document.querySelector('.ai-config-form');
        if (formEl) {
          formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }
      }, 100);
    }

    /**
     * 编辑AI配置（与loadConfigToForm相同，保持兼容）
     * @param {string} id - 配置ID
     */
    editAIConfig(id) {
      this.loadConfigToForm(id);
    }

    /**
     * 保存新的AI配置
     */
    saveNewAIConfig() {
      const newConfig = {
        name: document.getElementById('ai-config-name').value.trim(),
        url: document.getElementById('ai-config-url').value.trim(),
        apiKey: document.getElementById('ai-config-apikey').value.trim(),
        model: document.getElementById('ai-config-model').value.trim(),
        prompt: document.getElementById('ai-config-prompt').value,
        isOpenRouter: document.getElementById('ai-config-is-openrouter').checked
      };

      const result = config.addAIConfig(newConfig);
      if (result.success) {
        notification.success(`配置"${newConfig.name}"已添加`);
        const listEl = document.getElementById('ai-config-list');
        if (listEl) uiRenderer.renderAIConfigList(listEl);
        this.clearAIConfigForm();
      } else {
        notification.error(result.error);
      }
    }

    /**
     * 更新AI配置
     */
    updateAIConfig() {
      const id = document.getElementById('ai-update-btn').dataset.editId;
      if (!id) return;

      const updates = {
        name: document.getElementById('ai-config-name').value.trim(),
        url: document.getElementById('ai-config-url').value.trim(),
        apiKey: document.getElementById('ai-config-apikey').value.trim(),
        model: document.getElementById('ai-config-model').value.trim(),
        prompt: document.getElementById('ai-config-prompt').value,
        isOpenRouter: document.getElementById('ai-config-is-openrouter').checked
      };

      const result = config.updateAIConfig(id, updates);
      if (result.success) {
        notification.success(`配置"${updates.name}"已更新`);
        const listEl = document.getElementById('ai-config-list');
        if (listEl) uiRenderer.renderAIConfigList(listEl);
        this.clearAIConfigForm();
      } else {
        notification.error(result.error);
      }
    }

    /**
     * 获取OpenRouter模型列表
     */
    async fetchModels() {
      const apiKey = document.getElementById('ai-config-apikey').value.trim();
      const url = document.getElementById('ai-config-url').value.trim();
      const isOpenRouter = document.getElementById('ai-config-is-openrouter').checked;

      if (!apiKey) {
        notification.error('请先填写 API Key');
        return;
      }

      if (!isOpenRouter) {
        notification.error('仅OpenRouter支持获取模型列表');
        return;
      }

      const btn = document.getElementById('fetch-models-btn');
      btn.disabled = true;
      btn.textContent = '获取中...';

      try {
        const models = await aiService.fetchOpenRouterModels(apiKey, url);
        const selectWrapper = document.getElementById('model-select-wrapper');
        const select = document.getElementById('model-select');
        const searchInput = document.getElementById('model-search-input');

        if (!select) {
          notification.error('模型选择器未找到');
          return;
        }

        // 保存完整模型列表
        this.allModels = models;

        // 渲染所有模型
        select.innerHTML = '';
        models.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = `${model.name || model.id} (${model.context_length || 'N/A'} tokens)`;
          option.title = model.id;
          select.appendChild(option);
        });

        if (selectWrapper) selectWrapper.style.display = 'block';

        // 绑定选择事件
        select.onchange = () => {
          document.getElementById('ai-config-model').value = select.value;
        };

        // 双击选择事件
        select.ondblclick = () => {
          document.getElementById('ai-config-model').value = select.value;
          notification.success('已选择模型');
        };

        // 绑定搜索事件
        if (searchInput) {
          searchInput.value = '';
          searchInput.oninput = (e) => {
            this.filterModels(e.target.value);
          };

          searchInput.onkeydown = (e) => {
            if (e.key === 'Enter' && select.options.length > 0) {
              select.selectedIndex = 0;
              document.getElementById('ai-config-model').value = select.options[0].value;
              notification.success('已选择: ' + select.options[0].text);
            }
          };
        }

        notification.success(`已获取 ${models.length} 个模型`);
      } catch (error) {
        notification.error(`获取模型列表失败: ${error.message}`);
      } finally {
        btn.disabled = false;
        btn.textContent = '获取模型';
      }
    }

    /**
     * 过滤模型列表（模糊搜索）
     * @param {string} searchTerm - 搜索词
     */
    filterModels(searchTerm) {
      if (!this.allModels) return;

      const select = document.getElementById('model-select');
      if (!select) return;

      const term = searchTerm.toLowerCase().trim();
      
      if (!term) {
        // 搜索为空，显示所有模型
        select.innerHTML = '';
        this.allModels.forEach(model => {
          const option = document.createElement('option');
          option.value = model.id;
          option.textContent = `${model.name || model.id} (${model.context_length || 'N/A'} tokens)`;
          option.title = model.id;
          select.appendChild(option);
        });
        return;
      }

      // 模糊搜索
      const filtered = this.allModels.filter(model => {
        const id = (model.id || '').toLowerCase();
        const name = (model.name || '').toLowerCase();
        return id.includes(term) || name.includes(term);
      });

      select.innerHTML = '';
      filtered.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = `${model.name || model.id} (${model.context_length || 'N/A'} tokens)`;
        option.title = model.id;
        select.appendChild(option);
      });

      const searchInput = document.getElementById('model-search-input');
      if (searchInput) {
        searchInput.placeholder = filtered.length > 0 
          ? `找到 ${filtered.length} 个模型`
          : `未找到匹配的模型`;
      }
    }

    /**
     * 绑定Notion配置模态框事件
     * @param {HTMLElement} modal - Notion配置模态框
     */
    bindNotionConfigModalEvents(modal) {
      // 点击背景关闭
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.hideNotionConfigModal();
        }
      });

      // 保存按钮
      document.getElementById('notion-save-btn').addEventListener('click', () => {
        const apiKey = document.getElementById('notion-api-key').value.trim();
        const parentPageId = document.getElementById('notion-parent-page-id').value.trim();
        const autoSendEnabled = document.getElementById('notion-auto-send-enabled').checked;

        if (!apiKey) {
          uiRenderer.showNotionStatus('请输入 API Key', true);
          return;
        }

        if (!parentPageId) {
          uiRenderer.showNotionStatus('请输入目标位置（Page ID 或 Database ID）', true);
          return;
        }

        const result = config.saveNotionConfig({ apiKey, parentPageId });
        if (result.success) {
          config.setNotionAutoSendEnabled(autoSendEnabled);
          uiRenderer.showNotionStatus('配置已保存');
          setTimeout(() => {
            this.hideNotionConfigModal();
          }, 1500);
        } else {
          uiRenderer.showNotionStatus(result.error, true);
        }
      });

      // 取消按钮
      document.getElementById('notion-cancel-btn').addEventListener('click', () => {
        this.hideNotionConfigModal();
      });
    }
  }

  // 创建全局单例
  const eventHandlers = new EventHandlers();

  /**
   * 快捷键管理模块
   * 管理全局快捷键配置和绑定
   */

  const STORAGE_KEY = 'bilibili_shortcuts_config';

  // 默认快捷键配置
  const DEFAULT_SHORTCUTS = {
    toggleSubtitlePanel: { key: 'b', ctrl: true, alt: false, shift: false, description: '切换字幕面板' },
    toggleNotesPanel: { key: 'l', ctrl: true, alt: false, shift: false, description: '切换笔记面板' },
    saveNote: { key: 's', ctrl: true, alt: false, shift: false, description: '保存选中文本为笔记' },
    speedIncrease: { key: 'Period', ctrl: false, alt: false, shift: false, description: '增加播放速度' },
    speedDecrease: { key: 'Comma', ctrl: false, alt: false, shift: false, description: '减少播放速度' },
    speedReset: { key: 'Comma', ctrl: false, alt: false, shift: false, doubleClick: true, description: '重置播放速度(双击)' },
    speedDouble: { key: 'Period', ctrl: false, alt: false, shift: false, doubleClick: true, description: '2倍速(双击)' },
  };

  class ShortcutManager {
    constructor() {
      this.shortcuts = this.loadShortcuts();
      this.handlers = new Map();
      this.isListening = false;
    }

    /**
     * 加载快捷键配置
     */
    loadShortcuts() {
      try {
        const saved = GM_getValue(STORAGE_KEY, null);
        return saved ? JSON.parse(saved) : { ...DEFAULT_SHORTCUTS };
      } catch (error) {
        console.error('加载快捷键配置失败:', error);
        return { ...DEFAULT_SHORTCUTS };
      }
    }

    /**
     * 保存快捷键配置
     */
    saveShortcuts(shortcuts) {
      try {
        this.shortcuts = shortcuts;
        GM_setValue(STORAGE_KEY, JSON.stringify(shortcuts));
        return { success: true, error: null };
      } catch (error) {
        console.error('保存快捷键配置失败:', error);
        return { success: false, error: error.message };
      }
    }

    /**
     * 重置为默认快捷键
     */
    resetToDefaults() {
      this.shortcuts = { ...DEFAULT_SHORTCUTS };
      return this.saveShortcuts(this.shortcuts);
    }

    /**
     * 获取所有快捷键
     */
    getAllShortcuts() {
      return { ...this.shortcuts };
    }

    /**
     * 更新单个快捷键
     */
    updateShortcut(name, config) {
      if (!this.shortcuts[name]) {
        return { success: false, error: '快捷键不存在' };
      }

      // 检查冲突
      const conflict = this.checkConflict(name, config);
      if (conflict) {
        return { success: false, error: `与"${conflict}"冲突` };
      }

      this.shortcuts[name] = { ...this.shortcuts[name], ...config };
      return this.saveShortcuts(this.shortcuts);
    }

    /**
     * 检查快捷键冲突
     */
    checkConflict(excludeName, config) {
      for (const [name, shortcut] of Object.entries(this.shortcuts)) {
        if (name === excludeName) continue;

        if (shortcut.key === config.key &&
            shortcut.ctrl === config.ctrl &&
            shortcut.alt === config.alt &&
            shortcut.shift === config.shift &&
            shortcut.doubleClick === config.doubleClick) {
          return shortcut.description;
        }
      }
      return null;
    }

    /**
     * 注册快捷键处理器
     */
    register(name, handler) {
      this.handlers.set(name, handler);
    }

    /**
     * 检查事件是否匹配快捷键
     */
    matches(event, shortcut) {
      const ctrlPressed = event.ctrlKey || event.metaKey;
      
      return event.code === shortcut.key &&
             ctrlPressed === shortcut.ctrl &&
             event.altKey === shortcut.alt &&
             event.shiftKey === shortcut.shift;
    }

    /**
     * 开始监听快捷键
     */
    startListening() {
      if (this.isListening) return;

      document.addEventListener('keydown', (e) => this.handleKeyDown(e), true);
      this.isListening = true;
    }

    /**
     * 处理键盘事件
     */
    handleKeyDown(event) {
      // 忽略在输入框中的按键（除了特定的全局快捷键）
      const isInputField = event.target.tagName === 'INPUT' || 
                          event.target.tagName === 'TEXTAREA' || 
                          event.target.isContentEditable;

      for (const [name, shortcut] of Object.entries(this.shortcuts)) {
        // 跳过双击类型的快捷键（由SpeedControlService处理）
        if (shortcut.doubleClick) continue;

        // 全局快捷键（Ctrl/Cmd组合键）允许在任何地方触发
        const isGlobalShortcut = shortcut.ctrl || shortcut.alt;
        
        if (this.matches(event, shortcut)) {
          // 如果是输入框且不是全局快捷键，跳过
          if (isInputField && !isGlobalShortcut) {
            continue;
          }

          const handler = this.handlers.get(name);
          if (handler) {
            event.preventDefault();
            handler(event);
          }
        }
      }
    }

    /**
     * 格式化快捷键为显示文本
     */
    formatShortcut(shortcut) {
      const parts = [];
      
      if (shortcut.ctrl) {
        parts.push(navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl');
      }
      if (shortcut.alt) {
        parts.push('Alt');
      }
      if (shortcut.shift) {
        parts.push('Shift');
      }
      
      // 格式化按键名
      let keyName = shortcut.key;
      if (keyName === 'Period') keyName = '.';
      if (keyName === 'Comma') keyName = ',';
      if (keyName.length === 1) keyName = keyName.toUpperCase();
      
      parts.push(keyName);
      
      if (shortcut.doubleClick) {
        parts.push('(双击)');
      }
      
      return parts.join(' + ');
    }

    /**
     * 验证快捷键配置
     */
    validateConfig(config) {
      if (!config.key || typeof config.key !== 'string') {
        return { valid: false, error: '按键不能为空' };
      }

      if (typeof config.ctrl !== 'boolean' ||
          typeof config.alt !== 'boolean' ||
          typeof config.shift !== 'boolean') {
        return { valid: false, error: '修饰键配置错误' };
      }

      return { valid: true, error: null };
    }
  }

  // 创建全局单例
  const shortcutManager = new ShortcutManager();

  /**
   * 快捷键配置模态框模块
   * 提供快捷键自定义界面
   */


  class ShortcutConfigModal {
    constructor() {
      this.modal = null;
      this.isCapturing = false;
      this.currentCapturingField = null;
    }

    /**
     * 创建快捷键配置模态框
     */
    createModal() {
      if (this.modal) {
        return this.modal;
      }

      this.modal = document.createElement('div');
      this.modal.id = 'shortcut-config-modal';
      this.modal.className = 'config-modal';
      
      document.body.appendChild(this.modal);
      return this.modal;
    }

    /**
     * 显示模态框
     */
    show() {
      const modal = this.createModal();
      this.renderModal();
      modal.classList.add('show');
    }

    /**
     * 隐藏模态框
     */
    hide() {
      if (this.modal) {
        this.modal.classList.remove('show');
      }
      this.isCapturing = false;
      this.currentCapturingField = null;
    }

    /**
     * 渲染模态框内容
     */
    renderModal() {
      const shortcuts = shortcutManager.getAllShortcuts();

      this.modal.innerHTML = `
      <div class="config-modal-content">
        <div class="config-modal-header">
          <span>快捷键设置</span>
        </div>
        <div class="config-modal-body">
          <div style="margin-bottom: 20px; padding: 15px; background: rgba(254, 235, 234, 0.1); border-radius: 10px; border-left: 4px solid #feebea;">
            <div style="font-size: 13px; color: #fff; font-weight: 600; margin-bottom: 4px;">使用说明</div>
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); line-height: 1.5;">
              点击快捷键输入框，然后按下你想要的按键组合。支持 Ctrl/Cmd、Alt、Shift 修饰键。
            </div>
          </div>
          
          <div class="shortcut-list">
            ${Object.entries(shortcuts).map(([name, config]) => 
              this.renderShortcutItem(name, config)
            ).join('')}
          </div>
        </div>
        <div class="config-footer">
          <button class="config-btn config-btn-secondary" id="shortcut-reset-btn">重置默认</button>
          <button class="config-btn config-btn-secondary" id="shortcut-cancel-btn">取消</button>
          <button class="config-btn config-btn-primary" id="shortcut-save-btn">保存</button>
        </div>
      </div>
    `;

      this.bindEvents();
    }

    /**
     * 渲染单个快捷键项
     */
    renderShortcutItem(name, config) {
      const displayText = shortcutManager.formatShortcut(config);
      
      return `
      <div class="shortcut-item">
        <div class="shortcut-label">${config.description}</div>
        <div class="shortcut-input-wrapper">
          <input type="text" 
                 class="shortcut-input" 
                 data-shortcut-name="${name}"
                 value="${displayText}" 
                 readonly
                 placeholder="点击设置快捷键">
          <button class="shortcut-clear-btn" data-shortcut-name="${name}" title="清除">×</button>
        </div>
      </div>
    `;
    }

    /**
     * 绑定事件
     */
    bindEvents() {
      // 点击背景关闭
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) {
          this.hide();
        }
      });

      // 快捷键输入框点击事件
      const inputs = this.modal.querySelectorAll('.shortcut-input');
      inputs.forEach(input => {
        input.addEventListener('click', () => {
          this.startCapture(input);
        });
      });

      // 清除按钮
      const clearButtons = this.modal.querySelectorAll('.shortcut-clear-btn');
      clearButtons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const name = btn.getAttribute('data-shortcut-name');
          const input = this.modal.querySelector(`input[data-shortcut-name="${name}"]`);
          if (input) {
            input.value = '';
          }
        });
      });

      // 保存按钮
      document.getElementById('shortcut-save-btn')?.addEventListener('click', () => {
        this.saveShortcuts();
      });

      // 取消按钮
      document.getElementById('shortcut-cancel-btn')?.addEventListener('click', () => {
        this.hide();
      });

      // 重置按钮
      document.getElementById('shortcut-reset-btn')?.addEventListener('click', () => {
        if (confirm('确定要重置为默认快捷键吗？')) {
          const result = shortcutManager.resetToDefaults();
          if (result.success) {
            notification.success('已重置为默认快捷键');
            this.renderModal();
          } else {
            notification.error('重置失败');
          }
        }
      });
    }

    /**
     * 开始捕获快捷键
     */
    startCapture(input) {
      if (this.currentCapturingField) {
        this.currentCapturingField.classList.remove('capturing');
      }

      this.isCapturing = true;
      this.currentCapturingField = input;
      input.classList.add('capturing');
      input.value = '请按下快捷键...';

      const keydownHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();

        // 忽略单独的修饰键
        if (['Control', 'Meta', 'Alt', 'Shift'].includes(e.key)) {
          return;
        }

        // 构建快捷键配置
        const config = {
          key: e.code || e.key,
          ctrl: e.ctrlKey || e.metaKey,
          alt: e.altKey,
          shift: e.shiftKey,
          doubleClick: false
        };

        // 显示快捷键
        const displayText = this.formatCapturedKey(config);
        input.value = displayText;

        // 清理
        input.classList.remove('capturing');
        this.isCapturing = false;
        this.currentCapturingField = null;
        document.removeEventListener('keydown', keydownHandler, true);
      };

      document.addEventListener('keydown', keydownHandler, true);

      // 失焦时取消捕获
      input.addEventListener('blur', () => {
        if (this.isCapturing && this.currentCapturingField === input) {
          input.classList.remove('capturing');
          this.isCapturing = false;
          this.currentCapturingField = null;
          document.removeEventListener('keydown', keydownHandler, true);
          
          // 恢复原值
          const name = input.getAttribute('data-shortcut-name');
          const shortcut = shortcutManager.getAllShortcuts()[name];
          if (shortcut) {
            input.value = shortcutManager.formatShortcut(shortcut);
          }
        }
      }, { once: true });
    }

    /**
     * 格式化捕获的按键
     */
    formatCapturedKey(config) {
      const parts = [];
      
      if (config.ctrl) {
        parts.push(navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl');
      }
      if (config.alt) {
        parts.push('Alt');
      }
      if (config.shift) {
        parts.push('Shift');
      }
      
      let keyName = config.key;
      if (keyName === 'Period') keyName = '.';
      if (keyName === 'Comma') keyName = ',';
      if (keyName.length === 1) keyName = keyName.toUpperCase();
      
      parts.push(keyName);
      
      return parts.join(' + ');
    }

    /**
     * 保存所有快捷键
     */
    saveShortcuts() {
      const inputs = this.modal.querySelectorAll('.shortcut-input');
      const newShortcuts = {};

      for (const input of inputs) {
        const name = input.getAttribute('data-shortcut-name');
        const value = input.value.trim();

        if (!value || value === '请按下快捷键...') {
          notification.error(`请为"${shortcutManager.getAllShortcuts()[name].description}"设置快捷键`);
          return;
        }

        // 解析快捷键
        const config = this.parseShortcutString(value);
        if (!config) {
          notification.error(`快捷键"${value}"格式错误`);
          return;
        }

        // 保留原有的description和doubleClick设置
        const originalConfig = shortcutManager.getAllShortcuts()[name];
        newShortcuts[name] = {
          ...config,
          description: originalConfig.description,
          doubleClick: originalConfig.doubleClick || false
        };
      }

      // 检查冲突
      const conflicts = this.findConflicts(newShortcuts);
      if (conflicts.length > 0) {
        notification.error(`快捷键冲突: ${conflicts.join(', ')}`);
        return;
      }

      // 保存
      const result = shortcutManager.saveShortcuts(newShortcuts);
      if (result.success) {
        notification.success('快捷键已保存');
        setTimeout(() => this.hide(), 1000);
      } else {
        notification.error(`保存失败: ${result.error}`);
      }
    }

    /**
     * 解析快捷键字符串
     */
    parseShortcutString(str) {
      const parts = str.split('+').map(p => p.trim());
      
      const config = {
        key: '',
        ctrl: false,
        alt: false,
        shift: false
      };

      for (const part of parts) {
        const lower = part.toLowerCase();
        if (lower === 'ctrl' || lower === 'cmd') {
          config.ctrl = true;
        } else if (lower === 'alt') {
          config.alt = true;
        } else if (lower === 'shift') {
          config.shift = true;
        } else {
          // 这是按键
          if (part === '.') {
            config.key = 'Period';
          } else if (part === ',') {
            config.key = 'Comma';
          } else if (part.length === 1) {
            config.key = part.toLowerCase();
          } else {
            config.key = part;
          }
        }
      }

      if (!config.key) {
        return null;
      }

      return config;
    }

    /**
     * 查找所有冲突
     */
    findConflicts(shortcuts) {
      const conflicts = [];
      const keys = Object.keys(shortcuts);

      for (let i = 0; i < keys.length; i++) {
        for (let j = i + 1; j < keys.length; j++) {
          const name1 = keys[i];
          const name2 = keys[j];
          const sc1 = shortcuts[name1];
          const sc2 = shortcuts[name2];

          if (sc1.key === sc2.key &&
              sc1.ctrl === sc2.ctrl &&
              sc1.alt === sc2.alt &&
              sc1.shift === sc2.shift &&
              sc1.doubleClick === sc2.doubleClick) {
            conflicts.push(`${sc1.description} 与 ${sc2.description}`);
          }
        }
      }

      return conflicts;
    }
  }

  // 创建全局单例
  const shortcutConfigModal = new ShortcutConfigModal();

  /**
   * 速度控制模态框模块
   * 提供播放速度控制的独立界面
   */


  class SpeedControlModal {
    constructor() {
      this.modal = null;
      this.updateInterval = null;
    }

    /**
     * 创建模态框
     */
    createModal() {
      if (this.modal) {
        return this.modal;
      }

      this.modal = document.createElement('div');
      this.modal.id = 'speed-control-modal';
      this.modal.className = 'config-modal';
      
      document.body.appendChild(this.modal);
      return this.modal;
    }

    /**
     * 显示模态框
     */
    show() {
      const modal = this.createModal();
      this.renderModal();
      modal.classList.add('show');
      
      // 开始定期更新速度显示
      this.startUpdateLoop();
    }

    /**
     * 隐藏模态框
     */
    hide() {
      if (this.modal) {
        this.modal.classList.remove('show');
      }
      
      // 停止更新
      this.stopUpdateLoop();
    }

    /**
     * 渲染模态框内容
     */
    renderModal() {
      const state = speedControlService.getState();

      this.modal.innerHTML = `
      <div class="config-modal-content">
        <div class="config-modal-header">
          <span>播放速度控制</span>
        </div>
        <div class="config-modal-body">
          <div style="margin-bottom: 20px; padding: 15px; background: rgba(254, 235, 234, 0.1); border-radius: 10px; border-left: 4px solid #feebea;">
            <div style="font-size: 13px; color: #fff; font-weight: 600; margin-bottom: 4px;">快捷键说明</div>
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); line-height: 1.5;">
              <strong>,</strong> 减速 | <strong>.</strong> 加速 | <strong>,,</strong> 重置1x | <strong>..</strong> 2倍速<br>
              <strong>右Option</strong> 临时加速 | <strong>右Option双击</strong> 永久加速<br>
              <strong>, + .</strong> 同时按切换响度检测
            </div>
          </div>

          <div class="speed-control-section-large">
            <div class="speed-control-header-large">
              <span class="speed-control-title">当前速度</span>
              <span class="speed-control-display-large" id="speed-display-modal">${state.finalSpeed.toFixed(2)}x</span>
            </div>
            
            <div class="speed-control-buttons-large">
              <button class="speed-btn-large" data-action="decrease">
                <span style="font-size: 24px;">−</span>
                <span style="font-size: 11px;">减速</span>
              </button>
              <button class="speed-btn-large" data-action="reset">
                <span style="font-size: 18px;">1x</span>
                <span style="font-size: 11px;">重置</span>
              </button>
              <button class="speed-btn-large" data-action="double">
                <span style="font-size: 18px;">2x</span>
                <span style="font-size: 11px;">2倍速</span>
              </button>
              <button class="speed-btn-large" data-action="increase">
                <span style="font-size: 24px;">+</span>
                <span style="font-size: 11px;">加速</span>
              </button>
            </div>

            <div class="speed-status-info">
              ${state.isTempBoosted ? '<div class="speed-status-item">临时加速中 (右Option)</div>' : ''}
              ${state.isVolumeBoosted ? '<div class="speed-status-item">响度加速中</div>' : ''}
            </div>
          </div>

          <div class="config-field" style="margin-top: 20px;">
            <label style="display: flex; align-items: center; justify-content: space-between;">
              <span>响度检测自动加速</span>
              <label class="sponsor-switch">
                <input type="checkbox" id="volume-detection-toggle" ${state.volumeDetectionEnabled ? 'checked' : ''}>
                <span class="sponsor-switch-slider"></span>
              </label>
            </label>
            <div class="config-help" style="margin-top: 8px;">
              开启后，当检测到音量低于阈值时自动提速 ${speedControlService.state.boostMultiplier}x
            </div>
          </div>

          ${state.volumeDetectionEnabled ? `
            <div class="config-field">
              <label>响度阈值 (dB)</label>
              <div style="display: flex; gap: 8px; align-items: center;">
                <button class="config-btn config-btn-secondary" style="padding: 8px 16px;" id="threshold-decrease">-</button>
                <input type="number" 
                       id="volume-threshold-input" 
                       value="${state.currentVolumeThreshold}" 
                       min="-100" 
                       max="0" 
                       step="1"
                       style="flex: 1; text-align: center;">
                <button class="config-btn config-btn-secondary" style="padding: 8px 16px;" id="threshold-increase">+</button>
              </div>
              <div class="config-help">
                当前阈值: ${state.currentVolumeThreshold}dB (低于此值触发加速)
              </div>
            </div>
          ` : ''}
        </div>
        <div class="config-footer">
          <button class="config-btn config-btn-secondary" id="speed-close-btn">关闭</button>
        </div>
      </div>
    `;

      this.bindEvents();
    }

    /**
     * 绑定事件
     */
    bindEvents() {
      // 点击背景关闭
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) {
          this.hide();
        }
      });

      // 速度按钮
      const speedButtons = this.modal.querySelectorAll('.speed-btn-large');
      speedButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const action = btn.getAttribute('data-action');
          this.handleSpeedAction(action);
        });
      });

      // 响度检测开关
      const volumeToggle = document.getElementById('volume-detection-toggle');
      if (volumeToggle) {
        volumeToggle.addEventListener('change', () => {
          speedControlService.toggleVolumeDetection();
          this.renderModal();
        });
      }

      // 阈值调整
      const thresholdDecrease = document.getElementById('threshold-decrease');
      const thresholdIncrease = document.getElementById('threshold-increase');
      const thresholdInput = document.getElementById('volume-threshold-input');

      if (thresholdDecrease) {
        thresholdDecrease.addEventListener('click', () => {
          speedControlService.adjustVolumeThreshold(-1);
          this.updateThresholdDisplay();
        });
      }

      if (thresholdIncrease) {
        thresholdIncrease.addEventListener('click', () => {
          speedControlService.adjustVolumeThreshold(1);
          this.updateThresholdDisplay();
        });
      }

      if (thresholdInput) {
        thresholdInput.addEventListener('change', (e) => {
          const value = parseInt(e.target.value);
          if (!isNaN(value)) {
            speedControlService.state.currentVolumeThreshold = Math.max(-100, Math.min(0, value));
            this.updateThresholdDisplay();
          }
        });
      }

      // 关闭按钮
      const closeBtn = document.getElementById('speed-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.hide());
      }
    }

    /**
     * 处理速度操作
     */
    handleSpeedAction(action) {
      switch (action) {
        case 'increase':
          speedControlService.adjustBaseSpeed(0.1);
          break;
        case 'decrease':
          speedControlService.adjustBaseSpeed(-0.1);
          break;
        case 'reset':
          speedControlService.resetToNormalSpeed();
          break;
        case 'double':
          speedControlService.setToDoubleSpeed();
          break;
      }
      this.updateSpeedDisplay();
    }

    /**
     * 更新速度显示
     */
    updateSpeedDisplay() {
      const speedDisplay = document.getElementById('speed-display-modal');
      if (speedDisplay) {
        const speed = speedControlService.getCurrentSpeed();
        speedDisplay.textContent = `${speed.toFixed(2)}x`;
      }
    }

    /**
     * 更新阈值显示
     */
    updateThresholdDisplay() {
      const input = document.getElementById('volume-threshold-input');
      if (input) {
        input.value = speedControlService.state.currentVolumeThreshold;
      }
    }

    /**
     * 开始更新循环
     */
    startUpdateLoop() {
      this.updateInterval = setInterval(() => {
        this.updateSpeedDisplay();
      }, 200);
    }

    /**
     * 停止更新循环
     */
    stopUpdateLoop() {
      if (this.updateInterval) {
        clearInterval(this.updateInterval);
        this.updateInterval = null;
      }
    }
  }

  // 创建全局单例
  const speedControlModal = new SpeedControlModal();

  /**
   * 使用帮助模态框模块
   * 显示工具的使用说明和快捷键
   */

  class HelpModal {
    constructor() {
      this.modal = null;
    }

    /**
     * 创建帮助模态框
     */
    createModal() {
      if (this.modal) {
        return this.modal;
      }

      this.modal = document.createElement('div');
      this.modal.id = 'help-modal';
      this.modal.className = 'config-modal';
      
      document.body.appendChild(this.modal);
      return this.modal;
    }

    /**
     * 显示模态框
     */
    show() {
      const modal = this.createModal();
      this.renderModal();
      modal.classList.add('show');
    }

    /**
     * 隐藏模态框
     */
    hide() {
      if (this.modal) {
        this.modal.classList.remove('show');
      }
    }

    /**
     * 渲染模态框内容
     */
    renderModal() {
      this.modal.innerHTML = `
      <div class="config-modal-content">
        <div class="config-modal-header">
          <span>使用帮助</span>
        </div>
        <div class="config-modal-body">
          <div style="margin-bottom: 20px;">
            <h3 style="color: #fff; margin-bottom: 10px; font-size: 16px;">功能特性</h3>
            <ul style="line-height: 1.8; color: #e5e7eb;">
              <li><strong>字幕提取</strong> - 自动检测并提取B站AI字幕和人工字幕</li>
              <li><strong>AI智能总结</strong> - 支持OpenAI、OpenRouter等多种AI服务</li>
              <li><strong>Notion集成</strong> - 一键发送字幕和总结到Notion数据库</li>
              <li><strong>笔记保存</strong> - 选中任意文字显示粉色钢笔图标保存笔记</li>
              <li><strong>播放速度控制</strong> - 键盘快捷键控制速度和响度检测自动加速</li>
            </ul>
          </div>

          <div style="margin-bottom: 20px;">
            <h3 style="color: #fff; margin-bottom: 10px; font-size: 16px;">快捷键</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="background: rgba(255, 255, 255, 0.1); border-bottom: 1px solid rgba(254, 235, 234, 0.2);">
                  <th style="padding: 8px; text-align: left; font-weight: 600; color: #fff;">功能</th>
                  <th style="padding: 8px; text-align: left; font-weight: 600; color: #fff;">快捷键</th>
                  <th style="padding: 8px; text-align: left; font-weight: 600; color: #fff;">说明</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid rgba(254, 235, 234, 0.1);">
                  <td style="padding: 8px; color: #e5e7eb;">切换字幕面板</td>
                  <td style="padding: 8px;"><code style="background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 3px; color: #feebea;">Cmd/Ctrl + B</code></td>
                  <td style="padding: 8px; color: rgba(255, 255, 255, 0.7);">显示/隐藏字幕面板</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 8px;">切换笔记面板</td>
                  <td style="padding: 8px;"><code style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">Cmd/Ctrl + L</code></td>
                  <td style="padding: 8px; color: #6b7280;">显示/隐藏笔记管理</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 8px;">保存笔记</td>
                  <td style="padding: 8px;"><code style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">Cmd/Ctrl + S</code></td>
                  <td style="padding: 8px; color: #6b7280;">保存选中文字或打开笔记面板</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 8px;">增加速度</td>
                  <td style="padding: 8px;"><code style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">.</code></td>
                  <td style="padding: 8px; color: #6b7280;">每次增加0.1x</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 8px;">减少速度</td>
                  <td style="padding: 8px;"><code style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">,</code></td>
                  <td style="padding: 8px; color: #6b7280;">每次减少0.1x</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 8px;">2倍速</td>
                  <td style="padding: 8px;"><code style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">.. (双击)</code></td>
                  <td style="padding: 8px; color: #6b7280;">直接设为2倍速</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 8px;">重置速度</td>
                  <td style="padding: 8px;"><code style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">,, (双击)</code></td>
                  <td style="padding: 8px; color: #6b7280;">重置为1倍速</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 8px;">临时加速</td>
                  <td style="padding: 8px;"><code style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">右Option键</code></td>
                  <td style="padding: 8px; color: #6b7280;">按住时1.5x加速</td>
                </tr>
                <tr style="border-bottom: 1px solid #e5e7eb;">
                  <td style="padding: 8px;">响度检测</td>
                  <td style="padding: 8px;"><code style="background: #f3f4f6; padding: 2px 6px; border-radius: 3px;">, + . (同时按)</code></td>
                  <td style="padding: 8px; color: #6b7280;">开启/关闭自动加速</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style="margin-bottom: 20px;">
            <h3 style="color: #2d2d2d; margin-bottom: 10px; font-size: 16px;">使用说明</h3>
            <div style="line-height: 1.8; color: #374151;">
              <p style="margin: 8px 0;"><strong>字幕提取：</strong>打开B站视频，等待几秒，字幕面板自动出现在右侧</p>
              <p style="margin: 8px 0;"><strong>AI总结：</strong>配置AI服务（菜单 → AI配置），点击魔法棒图标 ✨</p>
              <p style="margin: 8px 0;"><strong>笔记保存：</strong>选中任意文字，点击粉色钢笔图标</p>
              <p style="margin: 8px 0;"><strong>速度控制：</strong>使用 , 和 . 键调整速度，同时按切换响度检测</p>
              <p style="margin: 8px 0;"><strong>快捷键自定义：</strong>菜单 → 快捷键设置，点击输入框后按下想要的按键组合</p>
            </div>
          </div>

          <div style="padding: 15px; background: rgba(254, 235, 234, 0.1); border-radius: 10px; border-left: 4px solid #feebea;">
            <div style="font-size: 13px; color: #fff; font-weight: 600; margin-bottom: 4px;">提示</div>
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); line-height: 1.5;">
              • 所有快捷键均可通过"快捷键设置"自定义<br>
              • AI配置支持多个提供商，可自由切换<br>
              • 笔记保存在本地，按日期自动分组
            </div>
          </div>
        </div>
        <div class="config-footer">
          <button class="config-btn config-btn-primary" id="help-close-btn">知道了</button>
        </div>
      </div>
    `;

      this.bindEvents();
    }

    /**
     * 绑定事件
     */
    bindEvents() {
      // 点击背景关闭
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) {
          this.hide();
        }
      });

      // 关闭按钮
      const closeBtn = document.getElementById('help-close-btn');
      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.hide());
      }
    }
  }

  // 创建全局单例
  const helpModal = new HelpModal();

  /**
   * SponsorBlock配置模态框模块
   * 提供SponsorBlock设置界面
   */


  class SponsorBlockModal {
    constructor() {
      this.modal = null;
    }

    /**
     * 创建模态框
     */
    createModal() {
      if (this.modal) {
        return this.modal;
      }

      this.modal = document.createElement('div');
      this.modal.id = 'sponsorblock-modal';
      this.modal.className = 'config-modal';
      
      document.body.appendChild(this.modal);
      return this.modal;
    }

    /**
     * 显示模态框
     */
    show() {
      const modal = this.createModal();
      this.renderModal();
      modal.classList.add('show');
    }

    /**
     * 隐藏模态框
     */
    hide() {
      if (this.modal) {
        this.modal.classList.remove('show');
      }
    }

    /**
     * 渲染模态框内容
     */
    renderModal() {
      const currentSettings = sponsorBlockConfig.getAll();

      this.modal.innerHTML = `
      <div class="config-modal-content">
        <div class="config-modal-header">
          <span>SponsorBlock 设置</span>
        </div>
        <div class="config-modal-body">
          <div style="margin-bottom: 20px; padding: 15px; background: rgba(254, 235, 234, 0.1); border-radius: 10px; border-left: 4px solid #feebea;">
            <div style="font-size: 13px; color: #fff; font-weight: 600; margin-bottom: 4px;">使用说明</div>
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); line-height: 1.5;">
              <strong>勾选的类别</strong> → 自动跳过<br>
              <strong>未勾选的类别</strong> → 显示手动提示（5秒后自动消失）<br>
              在进度条上会显示彩色标记，点击可查看详情
            </div>
          </div>

          <div class="sponsor-settings-section">
            <h3>片段类别（勾选=自动跳过，未勾选=手动提示）</h3>
            <div class="sponsor-checkbox-group">
              ${Object.entries(SPONSORBLOCK.CATEGORIES).map(([key, info]) => `
                <div class="sponsor-checkbox-item">
                  <input type="checkbox" 
                         id="category-${key}" 
                         value="${key}"
                         ${currentSettings.skipCategories.includes(key) ? 'checked' : ''}>
                  <label for="category-${key}">
                    <span class="category-color-dot" style="background: ${info.color}"></span>
                    <span>${info.name}</span>
                  </label>
                </div>
              `).join('')}
            </div>
          </div>

          <div class="sponsor-settings-section">
            <h3>显示选项</h3>
            <div class="sponsor-switch-item">
              <span>显示片段标签（视频卡片）</span>
              <label class="sponsor-switch">
                <input type="checkbox" id="showAdBadge" 
                       ${currentSettings.showAdBadge ? 'checked' : ''}>
                <span class="sponsor-switch-slider"></span>
              </label>
            </div>
            <div class="sponsor-switch-item">
              <span>显示优质视频标签</span>
              <label class="sponsor-switch">
                <input type="checkbox" id="showQualityBadge" 
                       ${currentSettings.showQualityBadge ? 'checked' : ''}>
                <span class="sponsor-switch-slider"></span>
              </label>
            </div>
            <div class="sponsor-switch-item">
              <span>进度条显示片段标记</span>
              <label class="sponsor-switch">
                <input type="checkbox" id="showProgressMarkers" 
                       ${currentSettings.showProgressMarkers ? 'checked' : ''}>
                <span class="sponsor-switch-slider"></span>
              </label>
            </div>
          </div>
        </div>
        <div class="config-footer">
          <button class="config-btn config-btn-secondary" id="sponsorblock-cancel-btn">取消</button>
          <button class="config-btn config-btn-primary" id="sponsorblock-save-btn">保存</button>
        </div>
      </div>
    `;

      this.bindEvents();
    }

    /**
     * 绑定事件
     */
    bindEvents() {
      // 点击背景关闭
      this.modal.addEventListener('click', (e) => {
        if (e.target === this.modal) {
          this.hide();
        }
      });

      // 保存按钮
      const saveBtn = document.getElementById('sponsorblock-save-btn');
      if (saveBtn) {
        saveBtn.addEventListener('click', () => this.saveSettings());
      }

      // 取消按钮
      const cancelBtn = document.getElementById('sponsorblock-cancel-btn');
      if (cancelBtn) {
        cancelBtn.addEventListener('click', () => this.hide());
      }
    }

    /**
     * 保存设置
     */
    saveSettings() {
      const newSettings = {
        skipCategories: Array.from(
          this.modal.querySelectorAll('.sponsor-checkbox-item input[type="checkbox"]:checked')
        ).map(cb => cb.value),
        showAdBadge: this.modal.querySelector('#showAdBadge').checked,
        showQualityBadge: this.modal.querySelector('#showQualityBadge').checked,
        showProgressMarkers: this.modal.querySelector('#showProgressMarkers').checked
      };

      sponsorBlockConfig.setAll(newSettings);
      this.hide();

      // 提示保存成功并刷新页面
      notification.info('设置已保存！\n\n✅ 勾选的类别 → 自动跳过\n⏸️ 未勾选的类别 → 手动提示（5秒）\n\n页面将刷新以应用新设置。');
      
      setTimeout(() => {
        location.reload();
      }, 2000);
    }
  }

  // 创建全局单例
  const sponsorBlockModal = new SponsorBlockModal();

  /**
   * B站字幕提取器 - 主入口文件
   * 模块化重构版本 v4.0.0
   */


  /**
   * 应用主类
   */
  class BilibiliSubtitleExtractor {
    constructor() {
      this.initialized = false;
      this.ball = null;
      this.container = null;
      this.videoQualityService = null;
    }

    /**
     * 初始化应用
     */
    async init() {
      if (this.initialized) return;

      // 注入样式
      injectStyles();

      // 等待页面加载
      await this.waitForPageReady();

      // 初始化笔记服务
      notesService.init();

      // 初始化速度控制服务
      speedControlService.init();

      // 初始化 SponsorBlock 服务
      await sponsorBlockService.init();

      // 初始化视频质量服务
      this.videoQualityService = createVideoQualityService(sponsorBlockService.getAPI());
      this.videoQualityService.start();

      // 创建UI元素
      this.createUI();

      // 绑定事件
      this.bindEvents();

      // 设置自动化逻辑
      this.setupAutomation();

      // 注册油猴菜单
      this.registerMenuCommands();

      // 注册快捷键
      this.registerShortcuts();

      // 开始检测字幕
      subtitleService.checkSubtitleButton();

      // 监听视频切换
      this.observeVideoChange();

      this.initialized = true;
    }

    /**
     * 注册全局快捷键
     */
    registerShortcuts() {
      // 切换字幕面板
      shortcutManager.register('toggleSubtitlePanel', () => {
        state.togglePanel();
      });

      // 切换笔记面板
      shortcutManager.register('toggleNotesPanel', () => {
        notesPanel.togglePanel();
      });

      // 保存选中文本为笔记
      shortcutManager.register('saveNote', () => {
        if (notesService.savedSelectionText) {
          notesService.addNote(notesService.savedSelectionText, window.location.href);
          
          const selection = window.getSelection();
          if (selection.rangeCount > 0) {
            selection.removeAllRanges();
          }
          
          notesService.hideBlueDot();
          notesService.savedSelectionText = '';
          
          if (notesPanel.isPanelVisible) {
            notesPanel.renderPanel();
          }
        } else {
          notesPanel.togglePanel();
        }
      });

      // 开始监听
      shortcutManager.startListening();
    }

    /**
     * 注册油猴菜单命令
     */
    registerMenuCommands() {
      if (typeof GM_registerMenuCommand === 'undefined') {
        return;
      }

      GM_registerMenuCommand('AI配置', () => {
        eventHandlers.showAIConfigModal();
      });

      GM_registerMenuCommand('Notion配置', () => {
        eventHandlers.showNotionConfigModal();
      });

      GM_registerMenuCommand('笔记管理', () => {
        notesPanel.togglePanel();
      });

      GM_registerMenuCommand('速度控制', () => {
        speedControlModal.show();
      });

      GM_registerMenuCommand('SponsorBlock 设置', () => {
        sponsorBlockModal.show();
      });

      GM_registerMenuCommand('快捷键设置', () => {
        shortcutConfigModal.show();
      });

      GM_registerMenuCommand('使用帮助', () => {
        helpModal.show();
      });

      GM_registerMenuCommand('关于', () => {
        notification.info('Bilibili Tools v6.0.0 - by geraldpeng & claude 4.5 sonnet');
      });
    }

    /**
     * 等待页面元素加载完成
     */
    async waitForPageReady() {
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          const videoContainer = document.querySelector(SELECTORS.VIDEO_CONTAINER);
          if (videoContainer) {
            clearInterval(checkInterval);
            resolve();
          }
        }, TIMING.CHECK_SUBTITLE_INTERVAL);
      });
    }

    /**
     * 创建UI元素
     */
    createUI() {
      // 创建小球
      this.ball = document.createElement('div');
      this.ball.id = 'subtitle-ball';
      this.ball.title = '字幕提取器';
      
      const videoContainer = document.querySelector(SELECTORS.VIDEO_CONTAINER);
      if (videoContainer) {
        if (videoContainer.style.position !== 'relative' &&
            videoContainer.style.position !== 'absolute') {
          videoContainer.style.position = 'relative';
        }
        videoContainer.appendChild(this.ball);
      }
      
      // 创建字幕容器并嵌入到页面
      this.createEmbeddedContainer();
      
      // 创建Notion配置模态框
      const notionModal = uiRenderer.createNotionConfigModal();
      document.body.appendChild(notionModal);
      eventHandlers.bindNotionConfigModalEvents(notionModal);
      
      // 创建AI配置模态框
      const aiModal = uiRenderer.createAIConfigModal();
      document.body.appendChild(aiModal);
      eventHandlers.bindAIConfigModalEvents(aiModal);
    }

    /**
     * 创建嵌入式字幕容器
     */
    createEmbeddedContainer() {
      // 创建字幕容器
      this.container = document.createElement('div');
      this.container.id = 'subtitle-container';
      
      // 添加到视频容器
      const videoContainer = document.querySelector(SELECTORS.VIDEO_CONTAINER);
      if (videoContainer) {
        // 确保视频容器使用相对定位
        if (videoContainer.style.position !== 'relative' &&
            videoContainer.style.position !== 'absolute') {
          videoContainer.style.position = 'relative';
        }
        videoContainer.appendChild(this.container);
      } else {
        // 降级方案：添加到body
        document.body.appendChild(this.container);
      }
    }

    /**
     * 绑定事件监听器
     */
    bindEvents() {
      // 监听字幕加载完成事件
      eventBus.on(EVENTS.SUBTITLE_LOADED, (data, videoKey) => {
        this.renderSubtitles(data);
      });

      // 监听AI总结chunk更新
      eventBus.on(EVENTS.AI_SUMMARY_CHUNK, (summary) => {
        if (this.container) {
          uiRenderer.updateAISummary(this.container, summary);
        }
      });

      // 监听AI总结完成事件
      eventBus.on(EVENTS.AI_SUMMARY_COMPLETE, (summary, videoKey) => {
        notification.success('AI总结完成');
        if (this.container) {
          uiRenderer.updateAISummary(this.container, summary);
        }
        // 更新AI图标状态
        const aiIcon = this.container?.querySelector('.ai-icon');
        if (aiIcon) {
          aiIcon.classList.remove('loading');
        }
      });

      // 监听Notion发送完成事件
      eventBus.on(EVENTS.NOTION_SEND_COMPLETE, () => {
        notification.success('字幕已成功发送到 Notion');
        // 更新Notion图标状态
        const notionIcon = this.container?.querySelector('.notion-icon');
        if (notionIcon) {
          notionIcon.classList.remove('loading');
        }
      });

      // 监听错误事件
      eventBus.on(EVENTS.SUBTITLE_FAILED, (error) => {
        notification.handleError(error, '字幕获取');
      });

      eventBus.on(EVENTS.AI_SUMMARY_FAILED, (error) => {
        notification.handleError(error, 'AI总结');
      });

      eventBus.on(EVENTS.NOTION_SEND_FAILED, (error) => {
        notification.handleError(error, 'Notion发送');
      });

      // 监听小球状态变化
      eventBus.on(EVENTS.UI_BALL_STATUS_CHANGE, (status) => {
        this.updateBallStatus(status);
      });

      // 监听面板显示/隐藏
      eventBus.on(EVENTS.UI_PANEL_TOGGLE, (visible) => {
        if (this.container) {
          if (visible) {
            this.container.classList.add('show');
          } else {
            this.container.classList.remove('show');
          }
        }
      });

      // 键盘快捷键（Command+B 或 Ctrl+B）
      document.addEventListener('keydown', (e) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
          e.preventDefault();
          state.togglePanel();
        }
      });
    }

    /**
     * 渲染字幕面板
     * @param {Array} subtitleData - 字幕数据
     */
    renderSubtitles(subtitleData) {
      if (!this.container || !subtitleData) return;

      // 渲染HTML
      this.container.innerHTML = uiRenderer.renderSubtitlePanel(subtitleData);

      // 检查是否有缓存的AI总结
      const videoKey = state.getVideoKey();
      const cachedSummary = videoKey ? state.getAISummary(videoKey) : null;
      
      if (cachedSummary) {
        uiRenderer.updateAISummary(this.container, cachedSummary);
      } else if (state.ai.isSummarizing) {
        // 如果正在总结，显示加载状态
        const contentDiv = this.container.querySelector('.subtitle-content');
        if (contentDiv) {
          const summarySection = uiRenderer.renderAISummarySection(null, true);
          contentDiv.insertBefore(summarySection, contentDiv.firstChild);
        }
      }

      // 绑定事件
      eventHandlers.bindSubtitlePanelEvents(this.container);

      console.log('[App] 字幕面板已渲染');
    }

    /**
     * 设置自动化逻辑（解耦AI和Notion）
     */
    setupAutomation() {
      // 字幕加载完成后，检查是否需要自动总结
      eventBus.on(EVENTS.SUBTITLE_LOADED, async (data) => {
        await delay(TIMING.AUTO_ACTIONS_DELAY);

        const aiAutoEnabled = config.getAIAutoSummaryEnabled();
        const aiConfig = config.getSelectedAIConfig();
        const videoKey = state.getVideoKey();
        const cachedSummary = videoKey ? state.getAISummary(videoKey) : null;

        // 如果启用自动总结，且有API Key，且没有缓存
        if (aiAutoEnabled && aiConfig && aiConfig.apiKey && !cachedSummary) {
          try {
            await aiService.summarize(data, true);
          } catch (error) {
            console.error('[App] 自动总结失败:', error);
          }
        }
      });

      // AI总结完成后，检查是否需要自动发送Notion
      eventBus.on(EVENTS.AI_SUMMARY_COMPLETE, async () => {
        const notionAutoEnabled = config.getNotionAutoSendEnabled();
        const notionConfig = config.getNotionConfig();

        if (notionAutoEnabled && notionConfig.apiKey) {
          const subtitleData = state.getSubtitleData();
          if (subtitleData) {
            try {
              await notionService.sendSubtitle(subtitleData, true);
            } catch (error) {
              console.error('[App] 自动发送失败:', error);
            }
          }
        }
      });

      // 字幕加载完成后，如果没有启用AI自动总结，直接检查Notion自动发送
      eventBus.on(EVENTS.SUBTITLE_LOADED, async (data) => {
        await delay(TIMING.AUTO_ACTIONS_DELAY);

        const aiAutoEnabled = config.getAIAutoSummaryEnabled();
        const notionAutoEnabled = config.getNotionAutoSendEnabled();
        const notionConfig = config.getNotionConfig();

        // 如果没有启用AI自动总结，但启用了Notion自动发送
        if (!aiAutoEnabled && notionAutoEnabled && notionConfig.apiKey) {
          try {
            await notionService.sendSubtitle(data, true);
          } catch (error) {
            console.error('[App] 自动发送失败:', error);
          }
        }
      });
    }

    /**
     * 更新小球状态
     */
    updateBallStatus(status) {
      if (!this.ball) return;

      // 移除所有状态类
      this.ball.classList.remove('loading', 'active', 'no-subtitle', 'error');

      switch (status) {
        case BALL_STATUS.ACTIVE:
          this.ball.classList.add('active');
          this.ball.style.cursor = 'pointer';
          this.ball.onclick = () => state.togglePanel();
          this.ball.title = '字幕提取器 - 点击查看字幕';
          break;
        case BALL_STATUS.NO_SUBTITLE:
          this.ball.classList.add('no-subtitle');
          this.ball.style.cursor = 'default';
          this.ball.onclick = null;
          this.ball.title = '该视频无字幕';
          break;
        case BALL_STATUS.ERROR:
          this.ball.classList.add('error');
          this.ball.style.cursor = 'default';
          this.ball.onclick = null;
          this.ball.title = '字幕加载失败';
          break;
        case BALL_STATUS.LOADING:
          this.ball.classList.add('loading');
          this.ball.style.cursor = 'default';
          this.ball.onclick = null;
          this.ball.title = '正在加载字幕...';
          break;
      }
    }

    /**
     * 监听视频切换
     */
    observeVideoChange() {
      if (!document.body) {
        setTimeout(() => this.observeVideoChange(), 100);
        return;
      }

      let lastUrl = location.href;
      let lastBvid = location.href.match(/BV[1-9A-Za-z]{10}/)?.[0];
      let lastCid = null;

      // 获取当前CID
      const getCurrentCid = () => {
        try {
          const initialState = unsafeWindow.__INITIAL_STATE__;
          return initialState?.videoData?.cid || initialState?.videoData?.pages?.[0]?.cid;
        } catch (e) {
          return null;
        }
      };

      lastCid = getCurrentCid();

      new MutationObserver(() => {
        const url = location.href;
        const currentBvid = url.match(/BV[1-9A-Za-z]{10}/)?.[0];
        const currentCid = getCurrentCid();

        // 当BV号或CID改变时重新初始化
        if (url !== lastUrl && (currentBvid !== lastBvid || currentCid !== lastCid)) {
          lastUrl = url;
          lastBvid = currentBvid;
          lastCid = currentCid;

          // 重置所有状态
          state.reset();
          subtitleService.reset();

          // 触发视频切换事件
          eventBus.emit(EVENTS.VIDEO_CHANGED, { bvid: currentBvid, cid: currentCid });

          // 等待后重新检测字幕
          setTimeout(() => {
            const videoInfo = getVideoInfo();
            state.setVideoInfo(videoInfo);
            subtitleService.checkSubtitleButton();
          }, TIMING.VIDEO_SWITCH_DELAY);
        }
      }).observe(document.body, { subtree: true, childList: true });
    }
  }

  // 创建应用实例并初始化
  const app = new BilibiliSubtitleExtractor();

  // 等待DOM加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => app.init());
  } else {
    app.init();
  }

})();