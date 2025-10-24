/**
 * 常量定义模块
 * 集中管理所有魔法数字和配置常量
 */

// ==================== 时间相关常量 ====================
export const TIMING = {
  // 检测间隔
  CHECK_SUBTITLE_INTERVAL: 500,        // 检测字幕按钮的间隔 (ms)
  CHECK_MAX_ATTEMPTS: 20,              // 最多检测次数（10秒）
  
  // 延迟时间
  SUBTITLE_ACTIVATION_DELAY: 1500,    // 激活字幕的延迟
  SUBTITLE_CAPTURE_DELAY: 500,        // 捕获字幕的延迟
  MENU_OPEN_DELAY: 500,               // 打开菜单的延迟
  CLOSE_SUBTITLE_DELAY: 2000,         // 关闭字幕显示的延迟（延长以保证切换成功）
  VIDEO_SWITCH_DELAY: 2000,           // 视频切换后的延迟
  AUTO_ACTIONS_DELAY: 500,            // 自动操作的延迟
  
  // 超时时间
  AI_SUMMARY_TIMEOUT: 120000,         // AI总结超时 (2分钟)
  NOTION_SEND_TIMEOUT: 30000,         // Notion发送超时 (30秒)
  
  // Toast显示时间
  TOAST_DURATION: 2000,               // Toast默认显示时间
};

// ==================== 文本长度限制 ====================
export const LIMITS = {
  NOTION_TEXT_CHUNK: 1900,            // Notion单个text对象的最大长度（留安全余量）
  NOTION_TEXT_MAX: 2000,              // Notion官方限制
  NOTION_PAGE_ID_LENGTH: 32,          // Notion Page ID的标准长度
};

// ==================== 状态类型 ====================
export const BALL_STATUS = {
  IDLE: 'idle',                       // 初始状态
  LOADING: 'loading',                 // 加载中
  ACTIVE: 'active',                   // 有字幕，可点击
  NO_SUBTITLE: 'no-subtitle',         // 无字幕
  ERROR: 'error',                     // 错误
};

// ==================== 事件类型 ====================
export const EVENTS = {
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
// 第一个AI请求的默认提示词 - Markdown格式总结
const DEFAULT_PROMPT_1 = `请用中文总结以下视频字幕内容，使用Markdown格式输出。

要求：
1. 在开头提供TL;DR（不超过50字的核心摘要）
2. 使用标题、列表等Markdown格式组织内容
3. 突出关键信息和要点
4. 总结的整体结构要组织良好

字幕内容：
`;

// 第二个AI请求的默认提示词 - JSON格式段落
const DEFAULT_PROMPT_2 = `分析以下带时间戳的字幕，提取5-8个关键段落。

重要：你的回复必须只包含JSON，不要有任何其他文字、解释或markdown标记。
直接以{开始，以}结束。

JSON格式要求：
{"segments":[
  {"timestamp":"分钟:秒","title":"标题(10字内)","summary":"内容总结(30-50字)"}
]}

示例（你的回复应该像这样）：
{"segments":[{"timestamp":"00:15","title":"开场介绍","summary":"主持人介绍今天的主题和嘉宾背景"},{"timestamp":"02:30","title":"核心观点","summary":"讨论技术发展趋势和未来展望"}]}

字幕内容：
`;

// AI服务商API Key获取链接
export const AI_API_KEY_URLS = {
  'openrouter': 'https://openrouter.ai/keys',
  'openai': 'https://platform.openai.com/api-keys',
  'siliconflow': 'https://cloud.siliconflow.cn/account/ak',
  'deepseek': 'https://platform.deepseek.com/api_keys',
  'moonshot': 'https://platform.moonshot.cn/console/api-keys',
  'zhipu': 'https://open.bigmodel.cn/usercenter/apikeys',
  'yi': 'https://platform.lingyiwanwu.com/apikeys',
  'dashscope': 'https://bailian.console.aliyun.com/',
  'gemini': 'https://aistudio.google.com/app/apikey'
};

export const AI_DEFAULT_CONFIGS = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/chat/completions',
    apiKey: '',
    model: 'alibaba/tongyi-deepresearch-30b-a3b:free',
    prompt1: DEFAULT_PROMPT_1,
    prompt2: DEFAULT_PROMPT_2,
    isOpenRouter: true
  },
  {
    id: 'openai',
    name: 'OpenAI',
    url: 'https://api.openai.com/v1/chat/completions',
    apiKey: '',
    model: 'gpt-3.5-turbo',
    prompt1: DEFAULT_PROMPT_1,
    prompt2: DEFAULT_PROMPT_2,
    isOpenRouter: false
  },
  {
    id: 'siliconflow',
    name: '硅基流动',
    url: 'https://api.siliconflow.cn/v1/chat/completions',
    apiKey: '',
    model: 'Qwen/Qwen2.5-7B-Instruct',
    prompt1: DEFAULT_PROMPT_1,
    prompt2: DEFAULT_PROMPT_2,
    isOpenRouter: false
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    url: 'https://api.deepseek.com/v1/chat/completions',
    apiKey: '',
    model: 'deepseek-chat',
    prompt1: DEFAULT_PROMPT_1,
    prompt2: DEFAULT_PROMPT_2,
    isOpenRouter: false
  },
  {
    id: 'moonshot',
    name: '月之暗面 Kimi',
    url: 'https://api.moonshot.cn/v1/chat/completions',
    apiKey: '',
    model: 'moonshot-v1-8k',
    prompt1: DEFAULT_PROMPT_1,
    prompt2: DEFAULT_PROMPT_2,
    isOpenRouter: false
  },
  {
    id: 'zhipu',
    name: '智谱清言',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    apiKey: '',
    model: 'glm-4-flash',
    prompt1: DEFAULT_PROMPT_1,
    prompt2: DEFAULT_PROMPT_2,
    isOpenRouter: false
  },
  {
    id: 'yi',
    name: '零一万物',
    url: 'https://api.lingyiwanwu.com/v1/chat/completions',
    apiKey: '',
    model: 'yi-large',
    prompt1: DEFAULT_PROMPT_1,
    prompt2: DEFAULT_PROMPT_2,
    isOpenRouter: false
  },
  {
    id: 'dashscope',
    name: '通义千问',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    apiKey: '',
    model: 'qwen-plus',
    prompt1: DEFAULT_PROMPT_1,
    prompt2: DEFAULT_PROMPT_2,
    isOpenRouter: false
  },
  {
    id: 'gemini',
    name: 'Google Gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    apiKey: '',
    model: 'gemini-1.5-flash',
    prompt1: DEFAULT_PROMPT_1,
    prompt2: DEFAULT_PROMPT_2,
    isOpenRouter: false
  }
];

// ==================== 存储键名 ====================
export const STORAGE_KEYS = {
  AI_CONFIGS: 'ai_configs',
  AI_SELECTED_ID: 'selected_ai_config_id',
  AI_AUTO_SUMMARY: 'ai_auto_summary_enabled',
  
  NOTION_API_KEY: 'notion_api_key',
  NOTION_PARENT_PAGE_ID: 'notion_parent_page_id',
  NOTION_DATABASE_ID: 'notion_database_id',
  NOTION_AUTO_SEND: 'notion_auto_send_enabled',
  
  // Notion内容选项
  NOTION_CONTENT_VIDEO_INFO: 'notion_content_video_info',
  NOTION_CONTENT_SUMMARY: 'notion_content_summary',
  NOTION_CONTENT_SEGMENTS: 'notion_content_segments',
  NOTION_CONTENT_SUBTITLES: 'notion_content_subtitles',
};

// ==================== Z-Index层级 ====================
export const Z_INDEX = {
  BALL: 2147483647,                   // 最高层
  CONTAINER: 2147483646,              // 次高层
  TOAST: 2147483645,                  // Toast层
  NOTION_MODAL: 2147483644,           // Notion模态框
  AI_MODAL: 2147483643,               // AI模态框
};

// ==================== CSS类名 ====================
export const CSS_CLASSES = {
  BALL: 'subtitle-ball',
  CONTAINER: 'subtitle-container',
  LOADING: 'loading',
  ACTIVE: 'active',
  SHOW: 'show',
  EXPANDED: 'expanded',
  CURRENT: 'current',
};

// ==================== API相关 ====================
export const API = {
  NOTION_VERSION: '2022-06-28',
  NOTION_BASE_URL: 'https://api.notion.com/v1',
};

// ==================== 正则表达式 ====================
export const REGEX = {
  BVID_FROM_PATH: /\/video\/(BV[1-9A-Za-z]{10})/,
  BVID_FROM_URL: /BV[1-9A-Za-z]{10}/,
  NOTION_PAGE_ID: /([a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i,
};

// ==================== 选择器 ====================
export const SELECTORS = {
  VIDEO: 'video',
  VIDEO_CONTAINER: '.bpx-player-container, #bilibili-player',
  SUBTITLE_BUTTON: '.bpx-player-ctrl-subtitle-result',
  SUBTITLE_LANGUAGE_ITEM: '.bpx-player-ctrl-subtitle-language-item',
  SUBTITLE_CLOSE_SWITCH: '.bpx-player-ctrl-subtitle-close-switch[data-action="close"]',
  VIDEO_TITLE_H1: 'h1.video-title',
};

// ==================== SponsorBlock 配置 ====================
export const SPONSORBLOCK = {
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
  AD_TAG_COLOR: 'linear-gradient(135deg, #FF8C00, #FF6347)',
  AD_TAG_TEXT: '⚠️ 含广告',
  
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

