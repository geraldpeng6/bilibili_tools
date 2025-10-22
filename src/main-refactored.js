/**
 * B站字幕提取器 - 主入口文件（重构版）
 * 使用模块化架构，提高代码复用性
 * 模块化重构版本 v5.0.0
 */

// 导入样式
import { injectStyles } from './ui/styles.js';

// 导入核心模块
import state from './state/StateManager.js';
import eventBus from './utils/EventBus.js';
import config from './config/ConfigManager.js';
import shortcutManager from './config/ShortcutManager.js';

// 导入重构的服务
import subtitleService from './services/SubtitleServiceV2.js';
import aiService from './services/AIService.js';
import notionService from './services/NotionService.js';
import notesService from './services/NotesService.js';
import speedControlService from './services/SpeedControlService.js';
import sponsorBlockService from './services/SponsorBlockService.js';
import screenshotService from './services/ScreenshotService.js';
import { createVideoQualityService } from './services/VideoQualityService.js';

// 导入重构的UI模块
import notification from './ui/Notification.js';
import uiRenderer from './ui/UIRenderer.js';
import eventHandlers from './ui/EventHandlersV2.js';
import notesPanel from './ui/NotesPanel.js';
import helpModal from './ui/HelpModal.js';
import sponsorBlockModal from './ui/SponsorBlockModal.js';
import modalEventHandler from './ui/events/ModalEventHandler.js';

// 导入工具
import { getVideoInfo, delay } from './utils/helpers.js';
import performanceMonitor from './utils/PerformanceMonitor.js';
import resourceManager from './utils/ResourceManager.js';
import audioContextPool from './utils/AudioContextPool.js';
import logger from './utils/DebugLogger.js';

// 导入常量
import { EVENTS, TIMING, SELECTORS, BALL_STATUS } from './constants.js';

const IS_BILIBILI = location.hostname.endsWith('bilibili.com');

/**
 * 应用主类（重构版）
 * 使用组合模式和依赖注入
 */
class BilibiliSubtitleExtractorRefactored {
  constructor() {
    this.initialized = false;
    this.ball = null;
    this.container = null;
    this.videoQualityService = null;
    this.isBilibili = IS_BILIBILI;
    
    // 服务映射
    this.services = {
      subtitle: subtitleService,
      ai: aiService,
      notion: notionService,
      notes: notesService,
      speedControl: speedControlService,
      sponsorBlock: sponsorBlockService,
      screenshot: screenshotService
    };
    
    // UI组件映射
    this.uiComponents = {
      notification,
      renderer: uiRenderer,
      eventHandlers,
      notesPanel,
      helpModal,
      sponsorBlockModal,
      modalEventHandler
    };
  }

  /**
   * 初始化应用
   */
  async init() {
    if (this.initialized) return;

    logger.info('Main', '开始初始化应用...');
    
    try {
      // 注入样式
      injectStyles();
      
      // 等待页面加载
      await this.waitForPageReady();
      
      // 初始化配置
      await this.initializeConfig();
      
      // 初始化服务
      await this.initializeServices();
      
      // 初始化UI
      if (this.isBilibili) {
        await this.initializeUI();
      }
      
      // 绑定事件
      this.bindGlobalEvents();
      
      // 设置自动化
      if (this.isBilibili) {
        this.setupAutomation();
      }
      
      // 注册扩展功能
      this.registerExtensions();
      
      this.initialized = true;
      logger.info('Main', '✅ 应用初始化完成');
      
    } catch (error) {
      logger.error('Main', '初始化失败:', error);
      notification.error(`初始化失败: ${error.message}`);
    }
  }

  /**
   * 初始化配置
   */
  async initializeConfig() {
    // 修复已存在的配置中错误的prompt2
    config.fixExistingConfigPrompts();
    
    // 加载用户配置
    await config.loadUserPreferences();
    
    logger.info('Main', '配置初始化完成');
  }

  /**
   * 初始化服务
   */
  async initializeServices() {
    // 初始化笔记服务
    this.services.notes.init();
    
    // 初始化速度控制服务
    this.services.speedControl.init();
    
    // B站专属服务
    if (this.isBilibili) {
      await this.services.sponsorBlock.init();
      this.videoQualityService = createVideoQualityService(this.services.sponsorBlock.getAPI());
      this.videoQualityService.start();
    }
    
    logger.info('Main', '服务初始化完成');
  }

  /**
   * 初始化UI
   */
  async initializeUI() {
    // 创建悬浮球
    this.createFloatingBall();
    
    // 创建字幕容器
    this.createSubtitleContainer();
    
    // 创建笔记面板
    this.uiComponents.notesPanel.init();
    
    logger.info('Main', 'UI初始化完成');
  }

  /**
   * 创建悬浮球
   */
  createFloatingBall() {
    this.ball = this.uiComponents.renderer.createFloatingBall();
    document.body.appendChild(this.ball);
    
    // 绑定点击事件
    this.ball.addEventListener('click', () => {
      if (state.subtitle.hasData) {
        this.toggleSubtitlePanel();
      } else {
        notification.info('正在获取字幕，请稍候...');
      }
    });
  }

  /**
   * 创建字幕容器
   */
  createSubtitleContainer() {
    this.container = this.uiComponents.renderer.createSubtitleContainer();
    document.body.appendChild(this.container);
  }

  /**
   * 切换字幕面板
   */
  toggleSubtitlePanel() {
    const isVisible = this.container.classList.contains('show');
    
    if (isVisible) {
      this.container.classList.remove('show');
      state.setPanelVisible(false);
    } else {
      this.showSubtitlePanel();
    }
  }

  /**
   * 显示字幕面板
   */
  async showSubtitlePanel() {
    // 更新内容
    const subtitleData = state.getSubtitleData();
    const aiSummary = state.getAISummary(state.getVideoKey());
    const notes = this.services.notes.getGroupedNotes();
    
    // 渲染内容
    const content = await this.uiComponents.renderer.renderSubtitlePanel(
      subtitleData,
      aiSummary,
      notes
    );
    
    this.container.querySelector('.subtitle-content').innerHTML = content;
    
    // 绑定事件
    this.uiComponents.eventHandlers.bindSubtitlePanelEvents(this.container);
    
    // 显示面板
    this.container.classList.add('show');
    state.setPanelVisible(true);
  }

  /**
   * 绑定全局事件
   */
  bindGlobalEvents() {
    // 监听字幕加载
    eventBus.on(EVENTS.SUBTITLE_LOADED, (data) => {
      if (this.ball) {
        this.ball.classList.add('has-data');
      }
      notification.success('字幕加载完成');
    });
    
    // 监听AI总结完成
    eventBus.on(EVENTS.AI_SUMMARY_COMPLETE, (summary) => {
      this.updateAISummaryDisplay(summary);
    });
    
    // 监听错误
    eventBus.on(EVENTS.ERROR_OCCURRED, (error) => {
      logger.error('Main', 'Error occurred:', error);
      notification.error(error.message);
    });
  }

  /**
   * 设置自动化逻辑
   */
  setupAutomation() {
    // 监听URL变化
    this.observeUrlChange();
    
    // 监听视频变化
    this.observeVideoChange();
    
    // 自动获取字幕
    if (config.getAutoFetchSubtitle()) {
      this.services.subtitle.checkSubtitleButton();
    }
  }

  /**
   * 注册扩展功能
   */
  registerExtensions() {
    // 注册油猴菜单
    this.registerMenuCommands();
    
    // 注册快捷键
    this.registerShortcuts();
  }

  /**
   * 注册油猴菜单命令
   */
  registerMenuCommands() {
    // AI配置
    GM_registerMenuCommand('⚙️ AI配置', () => {
      modalEventHandler.showModal('ai-config-modal');
    });
    
    // Notion配置
    GM_registerMenuCommand('📝 Notion配置', () => {
      modalEventHandler.showModal('notion-config-modal');
    });
    
    // 快捷键设置
    GM_registerMenuCommand('⌨️ 快捷键设置', () => {
      modalEventHandler.showModal('shortcut-config-modal');
    });
    
    // 帮助文档
    GM_registerMenuCommand('❓ 帮助文档', () => {
      this.uiComponents.helpModal.show();
    });
    
    // 清理缓存
    GM_registerMenuCommand('🗑️ 清理缓存', () => {
      state.clearAllCache();
      localStorage.clear();
      notification.success('缓存已清理');
    });
    
    // 调试模式
    GM_registerMenuCommand('🐛 切换调试模式', () => {
      const enabled = logger.toggleDebug();
      notification.info(`调试模式已${enabled ? '开启' : '关闭'}`);
    });
  }

  /**
   * 注册快捷键
   */
  registerShortcuts() {
    shortcutManager.registerAll();
    
    // 自定义快捷键处理
    shortcutManager.on('togglePanel', () => {
      if (this.container) {
        this.toggleSubtitlePanel();
      }
    });
    
    shortcutManager.on('takeScreenshot', () => {
      this.services.screenshot.takeScreenshot();
    });
    
    shortcutManager.on('toggleSpeed', () => {
      this.services.speedControl.toggleSpeed();
    });
  }

  /**
   * 等待页面准备就绪
   */
  async waitForPageReady() {
    return new Promise((resolve) => {
      if (document.readyState === 'complete') {
        resolve();
      } else {
        window.addEventListener('load', resolve);
      }
    });
  }

  /**
   * 监听URL变化
   */
  observeUrlChange() {
    let lastUrl = location.href;
    
    const checkUrl = () => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        this.handleUrlChange(currentUrl);
      }
    };
    
    // 使用MutationObserver监听URL变化
    const observer = new MutationObserver(checkUrl);
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // 同时监听popstate事件
    window.addEventListener('popstate', checkUrl);
  }

  /**
   * 处理URL变化
   */
  handleUrlChange(url) {
    logger.info('Main', 'URL changed:', url);
    
    // 重置状态
    state.reset();
    
    // 重新检查字幕
    if (this.isBilibili && url.includes('/video/')) {
      setTimeout(() => {
        this.services.subtitle.reset();
        this.services.subtitle.checkSubtitleButton();
      }, TIMING.VIDEO_CHANGE_DELAY);
    }
  }

  /**
   * 监听视频变化
   */
  observeVideoChange() {
    const checkVideo = () => {
      const video = document.querySelector('video');
      if (video && !video._bilibili_tools_initialized) {
        video._bilibili_tools_initialized = true;
        this.initializeVideo(video);
      }
    };
    
    // 定期检查
    setInterval(checkVideo, 1000);
    
    // 立即检查一次
    checkVideo();
  }

  /**
   * 初始化视频元素
   */
  initializeVideo(video) {
    logger.info('Main', 'Video element found, initializing...');
    
    // 绑定视频事件
    video.addEventListener('timeupdate', throttle(() => {
      this.uiComponents.eventHandlers.subtitleHandler?.updateHighlight();
    }, 100));
    
    // 检查字幕
    this.services.subtitle.checkSubtitleButton();
  }

  /**
   * 更新AI总结显示
   */
  updateAISummaryDisplay(summary) {
    if (!this.container) return;
    
    const summaryPanel = this.container.querySelector('#summary-panel');
    if (summaryPanel) {
      const rendered = this.uiComponents.renderer.renderAISummary(summary);
      summaryPanel.innerHTML = rendered;
    }
  }

  /**
   * 清理资源
   */
  dispose() {
    // 清理事件监听
    eventBus.removeAllListeners();
    
    // 清理服务
    Object.values(this.services).forEach(service => {
      if (service.dispose) {
        service.dispose();
      }
    });
    
    // 清理UI组件
    Object.values(this.uiComponents).forEach(component => {
      if (component.dispose) {
        component.dispose();
      }
    });
    
    // 清理DOM
    if (this.ball) {
      this.ball.remove();
    }
    if (this.container) {
      this.container.remove();
    }
    
    logger.info('Main', '应用资源已清理');
  }
}

// 节流函数
function throttle(func, limit) {
  let inThrottle;
  return function() {
    const args = arguments;
    const context = this;
    if (!inThrottle) {
      func.apply(context, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// 创建并初始化应用
const app = new BilibiliSubtitleExtractorRefactored();

// 等待页面加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

// 导出应用实例（用于调试）
window.__bilibili_tools_app__ = app;

export default app;
