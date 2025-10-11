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

// 导入服务
import subtitleService from './services/SubtitleService.js';
import aiService from './services/AIService.js';
import notionService from './services/NotionService.js';
import notesService from './services/NotesService.js';
import speedControlService from './services/SpeedControlService.js';
import sponsorBlockService from './services/SponsorBlockService.js';
import { createVideoQualityService } from './services/VideoQualityService.js';

// 导入UI模块
import notification from './ui/Notification.js';
import uiRenderer from './ui/UIRenderer.js';
import eventHandlers from './ui/EventHandlers.js';
import notesPanel from './ui/NotesPanel.js';
import shortcutConfigModal from './ui/ShortcutConfigModal.js';
import speedControlModal from './ui/SpeedControlModal.js';
import helpModal from './ui/HelpModal.js';
import sponsorBlockModal from './ui/SponsorBlockModal.js';

// 导入配置
import shortcutManager from './config/ShortcutManager.js';

// 导入工具
import { getVideoInfo, delay } from './utils/helpers.js';

// 导入常量
import { EVENTS, TIMING, SELECTORS, BALL_STATUS } from './constants.js';

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

