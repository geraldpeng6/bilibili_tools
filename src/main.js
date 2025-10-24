/**
 * B站字幕提取器 - 主入口文件
 * 模块化重构版本 v4.0.0
 */

// 导入样式
import { injectStyles } from './ui/styles.js';

// 导入核心模块
import state from './state/StateManager.js';
import eventBus from './utils/EventBus.js';
import config from './config/ConfigManager.js';
import shortcutManager from './config/ShortcutManager.js';

// 导入服务
import subtitleService from './services/SubtitleService.js';
import aiService from './services/AIService.js';
import notionService from './services/NotionService.js';
import notesService from './services/NotesService.js';
import speedControlService from './services/SpeedControlService.js';
import sponsorBlockService from './services/SponsorBlockService.js';
import screenshotService from './services/ScreenshotService.js';
import { createVideoQualityService } from './services/VideoQualityService.js';

// 导入UI模块
import notification from './ui/Notification.js';
import uiRenderer from './ui/UIRenderer.js';
import eventHandlers from './ui/EventHandlers.js';
import notesPanel from './ui/NotesPanel.js';
import helpModal from './ui/HelpModal.js';
import sponsorBlockModal from './ui/SponsorBlockModal.js';

// 导入工具
import { getVideoInfo, delay } from './utils/helpers.js';
import performanceMonitor from './utils/PerformanceMonitor.js';
import resourceManager from './utils/ResourceManager.js';
// import audioContextPool from './utils/AudioContextPool.js'; // Not implemented yet
import logger from './utils/DebugLogger.js';

// 导入常量
import { EVENTS, TIMING, SELECTORS, BALL_STATUS } from './constants.js';

const IS_BILIBILI = location.hostname.endsWith('bilibili.com');

/**
 * 应用主类
 */
class BilibiliSubtitleExtractor {
  constructor() {
    this.initialized = false;
    this.ball = null;
    this.container = null;
    this.videoQualityService = null;
    this.isBilibili = IS_BILIBILI;
  }

  /**
   * 设置全局错误处理器
   * 隔离其他扩展的错误，防止影响本脚本运行
   */
  setupErrorHandler() {
    // 保存原始的错误处理器
    const originalErrorHandler = window.onerror;
    
    // 设置新的错误处理器
    window.onerror = (message, source, lineno, colno, error) => {
      // 安全地转换message为字符串
      const messageStr = String(message || '');
      const sourceStr = String(source || '');
      
      // 检查错误是否来自其他扩展
      if (sourceStr && (sourceStr.includes('extension://') || sourceStr.includes('content.js'))) {
        // 忽略来自其他扩展的错误
        logger.debug('Main', '忽略来自其他扩展的错误:', messageStr);
        return true; // 阻止错误继续传播
      }
      
      // 忽略nc-loader（阿里云验证码）的错误
      if (sourceStr.includes('nc-loader') || messageStr.includes('addIceCandidate')) {
        logger.debug('Main', '忽略第三方组件错误');
        return true;
      }
      
      // 对于Extension context invalidated错误，直接忽略
      if (messageStr.includes('Extension context invalidated')) {
        logger.debug('Main', '忽略扩展上下文失效错误');
        return true;
      }
      
      // 对于其他错误，调用原始处理器（如果存在）
      if (originalErrorHandler) {
        return originalErrorHandler(message, source, lineno, colno, error);
      }
      return false;
    };
    
    // 处理未捕获的Promise错误
    window.addEventListener('unhandledrejection', (event) => {
      // 安全地获取错误信息
      const reason = event.reason;
      const reasonMessage = reason ? String(reason.message || reason) : '';
      
      // 忽略扩展上下文失效错误
      if (reasonMessage.includes('Extension context invalidated')) {
        event.preventDefault(); // 阻止错误显示在控制台
        logger.debug('Main', '忽略Promise中的扩展上下文失效错误');
        return;
      }
      
      // 忽略第三方组件错误
      if (reasonMessage.includes('addIceCandidate') || reasonMessage.includes('nc-loader')) {
        event.preventDefault();
        logger.debug('Main', '忽略Promise中的第三方组件错误');
        return;
      }
    });
    
    logger.info('Main', '全局错误处理器已设置');
  }

  /**
   * 初始化应用
   */
  async init() {
    if (this.initialized) return;

    // 设置全局错误处理，防止其他扩展的错误影响本脚本
    this.setupErrorHandler();

    // 注入样式
    injectStyles();

    // 等待页面加载
    await this.waitForPageReady();

    // 修复已存在的配置中错误的prompt2
    config.fixExistingConfigPrompts();

    // 初始化笔记服务
    notesService.init();

    // 初始化速度控制服务
    speedControlService.init();

    if (this.isBilibili) {
      await sponsorBlockService.init();
      this.videoQualityService = createVideoQualityService(sponsorBlockService.getAPI());
      this.videoQualityService.start();
    }

    // 创建UI元素（仅 B 站）
    if (this.isBilibili) {
      this.createUI();
    }

    // 绑定事件
    this.bindEvents();

    // 设置自动化逻辑（仅 B 站）
    if (this.isBilibili) {
      this.setupAutomation();
    }

    // 注册油猴菜单
    this.registerMenuCommands();

    // 注册快捷键
    this.registerShortcuts();

    if (this.isBilibili) {
      subtitleService.checkSubtitleButton();
      this.observeVideoChange();
    }

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

    // 切换笔记面板（全站可用）
    shortcutManager.register('toggleNotesPanel', () => {
      notesPanel.togglePanel();
    });

    // 视频截图（自动保存到笔记）
    shortcutManager.register('takeScreenshot', async () => {
      try {
        // 检查是否需要发送到Notion
        const videoInfo = state.getVideoInfo();
        const bvid = videoInfo?.bvid;
        const notionConfig = config.getNotionConfig();
        
        // 如果有Notion配置且有页面ID，则发送到Notion
        const shouldSendToNotion = notionConfig.apiKey && bvid && state.getNotionPageId(bvid);
        
        // 截图并自动保存到本地笔记
        const note = await screenshotService.captureAndSave(shouldSendToNotion);
        if (note) {
          notification.success(shouldSendToNotion ? '截图已保存到笔记和Notion' : '截图已保存到笔记');
          
          // 刷新笔记面板（如果存在）
          const notesPanel = document.querySelector('.notes-panel');
          if (notesPanel && notesPanel.style.display !== 'none') {
            window.notesPanel?.render();
          }
        }
      } catch (error) {
        console.error('[Main] 截图失败:', error);
        notification.error('截图失败: ' + error.message);
      }
    });

    // 增加播放速度
    shortcutManager.register('speedIncrease', () => {
      speedControlService.adjustBaseSpeed(0.1);
    });

    // 减少播放速度
    shortcutManager.register('speedDecrease', () => {
      speedControlService.adjustBaseSpeed(-0.1);
    });

    // 重置播放速度（双击逗号键）
    shortcutManager.register('speedReset', () => {
      speedControlService.resetToNormalSpeed();
    });

    // 2倍速（双击句号键）
    shortcutManager.register('speedDouble', () => {
      speedControlService.setToDoubleSpeed();
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

    if (this.isBilibili) {
      GM_registerMenuCommand('AI配置', () => {
        eventHandlers.showAIConfigModal();
      });

      GM_registerMenuCommand('Notion配置', () => {
        eventHandlers.showNotionConfigModal();
      });
    }

    GM_registerMenuCommand('笔记管理', () => {
      notesPanel.togglePanel();
    });

    // 快捷键设置 - 全局可用
    GM_registerMenuCommand('⌨️ 快捷键设置', () => {
      logger.debug('Main', '快捷键设置菜单被点击');
      logger.debug('Main', 'eventHandlers 是否存在:', !!eventHandlers);
      logger.debug('Main', 'showShortcutConfigModal 是否存在:', !!eventHandlers?.showShortcutConfigModal);
      
      if (!eventHandlers || !eventHandlers.showShortcutConfigModal) {
        console.error('[Main] eventHandlers 或其方法未正确加载');
        notification.error('快捷键设置功能未正确加载');
        return;
      }
      
      eventHandlers.showShortcutConfigModal();
    });

    if (this.isBilibili) {
      // 字幕面板位置重置
      GM_registerMenuCommand('🔄 重置字幕面板位置', () => {
        const container = document.getElementById('subtitle-container');
        if (container) {
          eventHandlers.resetContainerPosition(container);
          // 不自动显示面板，让用户自己决定
        } else {
          notification.warning('字幕面板未初始化，请先加载视频');
        }
      });
      
      GM_registerMenuCommand('SponsorBlock 设置', () => {
        sponsorBlockModal.show();
      });
    }

    GM_registerMenuCommand('使用帮助', () => {
      helpModal.show();
    });

    // 调试模式切换
    GM_registerMenuCommand(`🔧 调试模式 (${logger.isDebugMode() ? '开启' : '关闭'})`, () => {
      const newState = logger.toggleDebugMode();
      notification.info(`调试模式已${newState ? '开启' : '关闭'}`);
      if (newState) {
        notification.info('调试模式已开启，控制台将输出详细日志');
      }
    });
  }

  /**
   * 等待页面元素加载完成
   */
  async waitForPageReady() {
    if (this.isBilibili) {
      return new Promise((resolve) => {
        const checkInterval = setInterval(() => {
          const videoContainer = document.querySelector(SELECTORS.VIDEO_CONTAINER);
          if (videoContainer) {
            clearInterval(checkInterval);
            resolve();
          }
        }, TIMING.CHECK_SUBTITLE_INTERVAL);
      });
    } else {
      return new Promise((resolve) => {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
        } else {
          resolve();
        }
      });
    }
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
      // 构建搜索索引（性能优化）
      eventHandlers.initializeSearchIndex(data);
    });

    // 监听AI总结开始事件
    eventBus.on(EVENTS.AI_SUMMARY_START, () => {
      logger.debug('App', 'AI总结开始，小球进入AI总结状态');
      // 小球进入AI总结状态（更大幅度呼吸）
      if (this.ball) {
        this.ball.classList.remove('loading', 'active', 'no-subtitle', 'error');
        this.ball.classList.add('ai-summarizing');
        this.ball.title = '正在AI总结...';
      }
      // AI图标进入加载状态
      const aiIcon = this.container?.querySelector('.ai-icon');
      if (aiIcon) {
        aiIcon.classList.add('loading');
      }
    });

    // 监听AI总结chunk更新
    eventBus.on(EVENTS.AI_SUMMARY_CHUNK, (summary) => {
      if (this.container) {
        uiRenderer.updateAISummary(this.container, summary);
      }
    });

    // 监听AI总结完成事件
    eventBus.on(EVENTS.AI_SUMMARY_COMPLETE, (summary, videoKey) => {
      logger.debug('App', 'AI总结完成，恢复小球正常状态');
      notification.success('AI总结完成');
      if (this.container) {
        uiRenderer.updateAISummary(this.container, summary);
      }
      // 恢复小球正常状态
      if (this.ball) {
        this.ball.classList.remove('ai-summarizing', 'loading');
        this.ball.classList.add('active');
        this.ball.title = '字幕提取器 - 点击查看字幕';
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
      logger.debug('App', 'AI总结失败，恢复小球正常状态');
      notification.handleError(error, 'AI总结');
      // 恢复小球正常状态
      if (this.ball) {
        this.ball.classList.remove('ai-summarizing', 'loading');
        this.ball.classList.add('active');
        this.ball.title = '字幕提取器 - 点击查看字幕';
      }
      // 更新AI图标状态
      const aiIcon = this.container?.querySelector('.ai-icon');
      if (aiIcon) {
        aiIcon.classList.remove('loading');
      }
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
    }
    // 不再显示加载状态，移除原来的else if分支

    // 绑定事件
    eventHandlers.bindSubtitlePanelEvents(this.container);

    logger.debug('App', '字幕面板已渲染');
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
    eventBus.on(EVENTS.AI_SUMMARY_COMPLETE, async (summary) => {
      const notionAutoEnabled = config.getNotionAutoSendEnabled();
      const notionConfig = config.getNotionConfig();

      if (notionAutoEnabled && notionConfig.apiKey && summary) {
        try {
          logger.debug('App', '开始自动发送AI总结到Notion');
          await notionService.sendAISummary(summary);
          notification.success('已自动发送AI总结到Notion');
        } catch (error) {
          console.error('[App] 自动发送AI总结到Notion失败:', error);
          notification.error('自动发送Notion失败: ' + error.message);
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
   * 监听视频切换（优化：使用 History API 劫持替代 MutationObserver）
   */
  observeVideoChange() {
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

    // 处理URL变化的函数
    const handleUrlChange = () => {
      const url = location.href;
      const currentBvid = url.match(/BV[1-9A-Za-z]{10}/)?.[0];
      const currentCid = getCurrentCid();

      // 当BV号或CID改变时重新初始化
      if (url !== lastUrl && (currentBvid !== lastBvid || currentCid !== lastCid)) {
        logger.debug('App', '检测到视频切换:', { from: lastBvid, to: currentBvid });
        
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
    };

    // 方法1：劫持 pushState 和 replaceState（B站使用这些API进行路由切换）
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = function(...args) {
      originalPushState.apply(this, args);
      handleUrlChange();
    };

    history.replaceState = function(...args) {
      originalReplaceState.apply(this, args);
      handleUrlChange();
    };

    // 方法2：监听 popstate 事件（浏览器前进/后退）
    window.addEventListener('popstate', handleUrlChange);

    // 方法3：定期检查（降级方案，1秒检查一次）
    const checkInterval = setInterval(handleUrlChange, 1000);

    // 保存清理函数
    this.urlChangeCleanup = () => {
      history.pushState = originalPushState;
      history.replaceState = originalReplaceState;
      window.removeEventListener('popstate', handleUrlChange);
      clearInterval(checkInterval);
    };

    logger.debug('App', '视频切换监听已启动（使用 History API 劫持）');
  }

  /**
   * 清理应用资源（增强版：清理所有性能优化模块）
   */
  cleanup() {
    logger.debug('App', '开始清理应用资源');
    
    // 清理 URL 监听
    if (this.urlChangeCleanup) {
      this.urlChangeCleanup();
    }
    
    // 清理视频质量服务
    if (this.videoQualityService) {
      this.videoQualityService.stop();
    }
    
    // 清理 SponsorBlock 服务
    if (sponsorBlockService.playerController) {
      sponsorBlockService.playerController.destroy();
    }
    
    // 清理速度控制服务
    speedControlService.destroy();
    
    // 清理AudioContext池
    // audioContextPool.clear(); // Not implemented yet
    
    // 清理搜索索引
    searchIndex.clear();
    
    // 清理性能监控
    performanceMonitor.destroy();
    
    // 清理资源管理器
    resourceManager.cleanup();
    
    logger.debug('App', '应用资源清理完成');
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

