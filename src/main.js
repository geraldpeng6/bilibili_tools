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
import platformService from './services/PlatformService.js';
import subtitleService from './services/SubtitleService.js';
import youtubeSubtitleService from './services/YouTubeSubtitleService.js';
import aiService from './services/AIService.js';
import notionService from './services/NotionService.js';
import notesService from './services/NotesService.js';
import speedControlService from './services/SpeedControlService.js';
import sponsorBlockService from './services/SponsorBlockService.js';
import screenshotService from './services/ScreenshotService.js';
import { createVideoQualityService } from './services/VideoQualityService.js';
import UniversalAdSkipService from './services/UniversalAdSkipService.js';
import youTubeVideoTagger from './services/YouTubeVideoTagger.js';

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
const IS_YOUTUBE = location.hostname.includes('youtube.com') || location.hostname.includes('youtu.be');

/**
 * 应用主类
 */
class BilibiliSubtitleExtractor {
  constructor() {
    this.initialized = false;
    this.initializing = false;  // 并发初始化保护标志
    this.ball = null;
    this.container = null;
    this.videoQualityService = null;
    this.universalAdSkipService = null;
    this.isBilibili = IS_BILIBILI;
    this.isYouTube = IS_YOUTUBE;
    this.isPlatformSupported = false;  // 是否为支持的平台
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
   * 初始化应用（分层架构）
   * Layer 0: iframe检测（已在IIFE中完成）
   * Layer 1: 通用服务（所有网站）
   * Layer 2: 平台专属服务（B站/YouTube）
   */
  async init() {
    // 双重检查，防止重复初始化
    if (this.initialized) {
      logger.info('Main', '应用已初始化，跳过重复执行');
      return;
    }

    // 并发初始化保护
    if (this.initializing) {
      logger.warn('Main', '应用正在初始化中，跳过重复调用');
      return;
    }
    this.initializing = true;

    try {
      // 设置全局错误处理，防止其他扩展的错误影响本脚本
      this.setupErrorHandler();

      // 检测平台类型
      this.isPlatformSupported = this.isBilibili || this.isYouTube;
      logger.info('Main', `平台检测: ${this.isBilibili ? 'Bilibili' : this.isYouTube ? 'YouTube' : '通用模式'}`);

      // ========== Layer 1: 通用服务初始化（所有网站）==========
      logger.info('Main', '初始化通用服务（速度控制、笔记、截图）...');
      
      // 注入基础样式
      injectStyles();
      
      // 初始化笔记服务 - 所有网站都可以选中文字保存笔记
      notesService.init();
      
      // 初始化速度控制服务 - 所有网站的视频都可以控制速度
      speedControlService.init();
      
      // 截图服务已在导入时初始化，所有网站的视频都可以截图
      
      // 注册通用快捷键（所有网站可用）
      this.registerUniversalShortcuts();
      
      // 注册通用油猴菜单（所有网站可用）
      this.registerUniversalMenuCommands();

      // ========== Layer 2: 平台专属服务（仅B站/YouTube）==========
      if (this.isPlatformSupported) {
        logger.info('Main', `初始化平台专属服务: ${this.isBilibili ? 'Bilibili' : 'YouTube'}...`);
        
        // 初始化平台服务
        platformService.init();
        
        // 等待页面加载
        await this.waitForPageReady();
        
        // 修复已存在的配置中错误的prompt2（仅B站需要）
        if (this.isBilibili) {
          config.fixExistingConfigPrompts();
        }
        
        // 初始化平台特定服务
        await this.initPlatformServices();
        
        // 创建UI元素（字幕面板、小球等）
        if (this.isBilibili || (this.isYouTube && location.pathname === '/watch')) {
          this.createUI();
        }
        
        // 绑定事件
        this.bindEvents();
        
        // 设置自动化逻辑
        if (this.isBilibili || (this.isYouTube && location.pathname === '/watch')) {
          this.setupAutomation();
        }
        
        // 注册平台专属菜单
        this.registerPlatformMenuCommands();
        
        // 监听视频切换
        if (this.isBilibili) {
          subtitleService.checkSubtitleButton();
          this.observeVideoChange();
        } else if (this.isYouTube && location.pathname === '/watch') {
          // YouTube播放页面字幕检测
          const currentSubtitleService = platformService.getSubtitleService();
          if (currentSubtitleService) {
            setTimeout(async () => {
              await currentSubtitleService.checkSubtitleAvailability();
            }, 2000);
          }
          this.observeVideoChange();
        }
      } else {
        logger.info('Main', '通用模式：仅提供速度控制、笔记、截图功能');
      }

      this.initialized = true;
      logger.info('Main', '✅ 应用初始化完成');
      
    } catch (error) {
      logger.error('Main', '初始化失败:', error);
    } finally {
      this.initializing = false;
    }
  }

  /**
   * 初始化平台专属服务（B站和YouTube）
   * @private
   */
  async initPlatformServices() {
    if (this.isBilibili) {
      // SponsorBlock 初始化（非关键功能）
      try {
        await sponsorBlockService.init();
        this.videoQualityService = createVideoQualityService(sponsorBlockService.getAPI());
        this.videoQualityService.start();
      } catch (error) {
        logger.warn('Main', 'SponsorBlock初始化失败:', error.message);
      }
    }

    // 初始化通用广告跳过服务（支持YouTube和Bilibili）
    if (this.isBilibili || this.isYouTube) {
      try {
        const adSkipConfig = this.createAdSkipConfig();
        this.universalAdSkipService = new UniversalAdSkipService(adSkipConfig);
        await this.universalAdSkipService.init();
        logger.info('Main', '通用广告跳过服务已初始化');
      } catch (error) {
        logger.warn('Main', '通用广告跳过服务初始化失败:', error.message);
      }
    }

    // 初始化YouTube视频标签服务
    if (this.isYouTube) {
      try {
        await youTubeVideoTagger.init();
        logger.info('Main', 'YouTube视频标签服务已初始化');
      } catch (error) {
        logger.warn('Main', 'YouTube视频标签服务初始化失败:', error.message);
      }
    }
  }

  /**
   * 创建广告跳过配置（B站和YouTube）
   * @private
   * @returns {Object} 配置对象
   */
  createAdSkipConfig() {
    const platform = this.isYouTube ? 'youtube' : 'bilibili';
    return {
      get: (key) => {
        const configs = {
          autoSkip: localStorage.getItem(`${platform}_auto_skip`) !== 'false',
          skipCategories: JSON.parse(localStorage.getItem(`${platform}_skip_categories`) || '["sponsor", "selfpromo"]'),
          showNotifications: localStorage.getItem(`${platform}_show_notifications`) !== 'false',
          showProgressMarkers: localStorage.getItem(`${platform}_show_markers`) !== 'false',
          detectNativeAds: localStorage.getItem(`${platform}_detect_native`) !== 'false',
          skipDelay: parseInt(localStorage.getItem(`${platform}_skip_delay`) || '0'),
          muteInsteadOfSkip: localStorage.getItem(`${platform}_mute_instead`) === 'true'
        };
        return configs[key];
      },
      set: (key, value) => {
        localStorage.setItem(`${platform}_${key}`, JSON.stringify(value));
      }
    };
  }

  /**
   * 注册通用快捷键（所有网站可用）
   */
  registerUniversalShortcuts() {
    // 切换笔记面板
    shortcutManager.register('toggleNotesPanel', () => {
      notesPanel.togglePanel();
    });

    // 视频截图（仅发送到Notion）
    shortcutManager.register('takeScreenshot', async () => {
      try {
        // 截图并发送到Notion（不再保存到本地笔记）
        await screenshotService.captureAndSave(false);
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

    // 平台专属快捷键（字幕面板切换）
    if (this.isPlatformSupported) {
      shortcutManager.register('toggleSubtitlePanel', () => {
        state.togglePanel();
      });
    }

    // 开始监听
    shortcutManager.startListening();
  }

  /**
   * 注册通用油猴菜单（所有网站可用）
   */
  registerUniversalMenuCommands() {
    if (typeof GM_registerMenuCommand === 'undefined') {
      return;
    }

    // 笔记管理 - 全局可用
    GM_registerMenuCommand('📝 笔记管理', () => {
      notesPanel.togglePanel();
    });

    // 快捷键设置 - 全局可用
    GM_registerMenuCommand('⌨️ 快捷键设置', () => {
      if (!eventHandlers || !eventHandlers.showShortcutConfigModal) {
        console.error('[Main] eventHandlers 或其方法未正确加载');
        notification.error('快捷键设置功能未正确加载');
        return;
      }
      eventHandlers.showShortcutConfigModal();
    });

    // 使用帮助 - 全局可用
    GM_registerMenuCommand('❓ 使用帮助', () => {
      helpModal.show();
    });

    // 调试模式切换 - 全局可用
    GM_registerMenuCommand(`🔧 调试模式 (${logger.isDebugMode() ? '开启' : '关闭'})`, () => {
      const newState = logger.toggleDebugMode();
      notification.info(`调试模式已${newState ? '开启' : '关闭'}`);
      if (newState) {
        notification.info('调试模式已开启，控制台将输出详细日志');
      }
    });
  }

  /**
   * 注册平台专属菜单（仅B站/YouTube）
   */
  registerPlatformMenuCommands() {
    if (typeof GM_registerMenuCommand === 'undefined') {
      return;
    }

    if (this.isBilibili) {
      GM_registerMenuCommand('🤖 AI配置', () => {
        eventHandlers.showAIConfigModal();
      });

      GM_registerMenuCommand('📤 Notion配置', () => {
        eventHandlers.showNotionConfigModal();
      });

      GM_registerMenuCommand('🔄 重置字幕面板位置', () => {
        const container = document.getElementById('subtitle-container');
        if (container) {
          eventHandlers.resetContainerPosition(container);
        } else {
          notification.warning('字幕面板未初始化，请先加载视频');
        }
      });
      
      GM_registerMenuCommand('⚡ SponsorBlock设置', () => {
        sponsorBlockModal.show();
      });
    }

    if (this.isYouTube) {
      GM_registerMenuCommand('🚫 YouTube广告设置', () => {
        this.showYouTubeAdSettings();
      });
    }
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
      // 其他网站（包括YouTube和所有其他网站）
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
    
    // 根据平台选择容器和调整样式
    let targetContainer;
    if (this.isBilibili) {
      targetContainer = document.querySelector(SELECTORS.VIDEO_CONTAINER);
      if (targetContainer) {
        if (targetContainer.style.position !== 'relative' &&
            targetContainer.style.position !== 'absolute') {
          targetContainer.style.position = 'relative';
        }
        targetContainer.appendChild(this.ball);
      }
    } else if (this.isYouTube) {
      // YouTube：将小球放在播放器内部右上角
      targetContainer = document.querySelector('#movie_player') || 
                       document.querySelector('.html5-video-player');
      
      if (targetContainer) {
        // YouTube特定样式调整
        this.ball.style.right = '10px';  // 改为内部定位
        this.ball.style.top = '10px';
        this.ball.style.transform = 'none';
        this.ball.style.zIndex = '9999';  // 确保显示在最上层
        
        targetContainer.appendChild(this.ball);
        
        // 监听YouTube的全屏事件，调整小球位置
        const adjustBallPosition = () => {
          if (document.fullscreenElement || document.webkitFullscreenElement) {
            this.ball.style.top = '60px';  // 全屏时避开顶部控制栏
          } else {
            this.ball.style.top = '10px';
          }
        };
        
        document.addEventListener('fullscreenchange', adjustBallPosition);
        document.addEventListener('webkitfullscreenchange', adjustBallPosition);
      }
    }
    
    // 绑定小球点击事件
    if (this.ball) {
      this.ball.addEventListener('click', () => {
        // 根据小球状态决定操作
        if (this.ball.classList.contains('active') || this.ball.classList.contains('ai-summarizing')) {
          // 有字幕数据时，切换面板显示
          if (this.container) {
            this.container.classList.toggle('show');
            eventBus.emit(EVENTS.UI_PANEL_TOGGLE, this.container.classList.contains('show'));
          }
        } else if (this.ball.classList.contains('loading')) {
          // 正在加载时不响应
          logger.debug('App', '字幕正在加载中...');
        } else {
          // 尝试获取字幕
          const currentSubtitleService = platformService.getSubtitleService();
          if (currentSubtitleService) {
            if (this.isYouTube) {
              // YouTube: 手动尝试获取字幕
              youtubeSubtitleService.manualFetchSubtitle().catch(error => {
                logger.error('App', 'YouTube字幕获取失败:', error);
                notification.error('获取字幕失败: ' + error.message);
              });
            } else if (this.isBilibili) {
              // Bilibili: 使用原有逻辑
              subtitleService.toggleSubtitle();
            }
          }
        }
      });
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
    
    let targetContainer;
    
    if (this.isBilibili) {
      // B站：添加到视频容器
      targetContainer = document.querySelector(SELECTORS.VIDEO_CONTAINER);
      if (targetContainer) {
        // 确保视频容器使用相对定位
        if (targetContainer.style.position !== 'relative' &&
            targetContainer.style.position !== 'absolute') {
          targetContainer.style.position = 'relative';
        }
        targetContainer.appendChild(this.container);
      }
    } else if (this.isYouTube) {
      // YouTube：添加到侧边栏
      // 首先等待页面加载
      setTimeout(() => {
        // 优先选择侧边栏区域
        targetContainer = document.querySelector('#secondary-inner') || 
                         document.querySelector('#secondary') ||
                         document.querySelector('#related') ||
                         document.querySelector('#columns');
        
        if (targetContainer) {
          // 在YouTube侧边栏的顶部插入
          const firstChild = targetContainer.firstElementChild;
          if (firstChild) {
            targetContainer.insertBefore(this.container, firstChild);
          } else {
            targetContainer.appendChild(this.container);
          }
          
          // YouTube特定样式重置
          this.container.style.position = 'relative';  // 改为相对定位
          this.container.style.left = 'auto';          // 重置left
          this.container.style.top = 'auto';           // 重置top
          this.container.style.marginBottom = '16px';
          this.container.style.width = '100%';         // 占满侧边栏宽度
          this.container.style.maxWidth = '400px';     // 限制最大宽度
          this.container.style.height = '500px';       // 设置固定高度
          this.container.classList.add('show');        // 默认显示
        } else {
          // 降级方案
          document.body.appendChild(this.container);
        }
      }, 1000);
    } else {
      // 降级方案：添加到body
      document.body.appendChild(this.container);
    }
  }

  // 已移除 createBasicUI 方法 - 通过油猴菜单访问功能

  // 已移除 showQuickMenu 方法 - 通过油猴菜单访问功能

  /**
   * 绑定事件监听器
   */
  bindEvents() {
    // 监听视频切换事件（包括分P切换）
    eventBus.on(EVENTS.VIDEO_CHANGED, (data) => {
      logger.info('App', '监听到视频切换事件:', data);
      
      // 重置UI状态
      if (this.ball) {
        this.ball.classList.remove('has-data', 'ai-loading');
        this.updateBallStatus(BALL_STATUS.IDLE);
      }
      
      // 清空字幕和AI总结显示
      if (this.container) {
        // 清空字幕列表
        const subtitleList = this.container.querySelector('#subtitle-list-container');
        if (subtitleList) {
          subtitleList.innerHTML = '<div class="segments-header">字幕列表</div><div class="empty-state">等待加载字幕...</div>';
        }
        
        // 清空AI总结
        const summaryPanel = this.container.querySelector('#summary-panel');
        if (summaryPanel) {
          summaryPanel.innerHTML = '<div class="ai-summary-placeholder">等待字幕加载完成后生成AI总结...</div>';
        }
      }
      
      // 延迟后重新获取字幕（给页面时间加载）
      setTimeout(() => {
        logger.debug('App', '开始重新获取字幕...');
        subtitleService.checkSubtitleButton();
      }, 2000); // 等待2秒，确保页面加载完成
    });
    
    // 监听字幕加载完成事件
    eventBus.on(EVENTS.SUBTITLE_LOADED, (data, videoKey) => {
      this.renderSubtitles(data);
    });

    // 监听AI总结开始事件
    eventBus.on(EVENTS.AI_SUMMARY_START, () => {
      logger.debug('App', 'AI总结开始，小球进入AI总结状态');
      // 使用状态管理系统设置小球状态
      state.setBallStatus(BALL_STATUS.AI_SUMMARIZING);
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
      // 恢复小球正常状态（使用状态管理系统）
      state.setBallStatus(BALL_STATUS.ACTIVE);
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
      // 恢复小球正常状态（使用状态管理系统）
      state.setBallStatus(BALL_STATUS.ACTIVE);
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
   * 设置自动化流程
   */
  setupAutomation() {
    // 字幕加载完成后的处理
    eventBus.on(EVENTS.SUBTITLE_LOADED, async (data) => {
      await delay(TIMING.AUTO_ACTIONS_DELAY);

      const aiAutoEnabled = config.getAIAutoSummaryEnabled();
      const notionAutoEnabled = config.getNotionAutoSendEnabled();
      const aiConfig = config.getSelectedAIConfig();
      const notionConfig = config.getNotionConfig();
      const videoKey = state.getVideoKey();
      const cachedSummary = videoKey ? state.getAISummary(videoKey) : null;

      // 先检查是否需要自动总结
      if (aiAutoEnabled && aiConfig && aiConfig.apiKey && !cachedSummary) {
        try {
          // 自动触发AI总结（isManual=false）
          // AI总结完成后会自动检查是否需要发送到Notion
          await aiService.summarize(data, false);
        } catch (error) {
          console.error('[App] 自动总结失败:', error);
        }
      } 
      // 如果不需要AI总结，但需要自动发送到Notion
      else if (notionAutoEnabled && notionConfig.apiKey) {
        try {
          // 获取内容配置选项
          const contentOptions = config.getNotionContentOptions();
          const videoInfo = state.getVideoInfo();
          
          // 根据配置决定是否发送字幕
          // 只有当用户勾选了字幕选项时才发送字幕数据
          await notionService.sendToNotion({
            videoInfo,
            aiSummary: cachedSummary, // 如果有缓存的AI总结也会发送
            subtitleData: contentOptions.subtitles ? data : null, // 根据配置决定是否发送字幕
            isAuto: true
          });
          
          if (contentOptions.subtitles && data) {
            logger.debug('App', '字幕已自动发送到Notion');
          }
        } catch (error) {
          console.error('[App] 自动发送到Notion失败:', error);
        }
      }
    });

    // AI总结完成后的通知
    eventBus.on(EVENTS.AI_SUMMARY_COMPLETE, async (summary) => {
      // AIService已经在内部处理了Notion发送
      // 这里只用于日志记录
      logger.debug('App', 'AI总结完成，已由AIService处理Notion发送');
    });
  }

  /**
   * 更新小球状态
   */
  updateBallStatus(status) {
    if (!this.ball) return;

    // 移除所有状态类
    this.ball.classList.remove('loading', 'active', 'no-subtitle', 'error', 'ai-summarizing');

    switch (status) {
      case BALL_STATUS.ACTIVE:
        this.ball.classList.add('active');
        this.ball.style.cursor = 'pointer';
        // 不再使用onclick，由addEventListener统一处理
        this.ball.title = '字幕提取器 - 点击查看字幕';
        break;
      case BALL_STATUS.NO_SUBTITLE:
        this.ball.classList.add('no-subtitle');
        this.ball.style.cursor = 'default';
        this.ball.title = '该视频无字幕';
        break;
      case BALL_STATUS.ERROR:
        this.ball.classList.add('error');
        this.ball.style.cursor = 'default';
        this.ball.title = '字幕加载失败';
        break;
      case BALL_STATUS.LOADING:
        this.ball.classList.add('loading');
        this.ball.style.cursor = 'default';
        this.ball.title = '正在加载字幕...';
        break;
      case BALL_STATUS.AI_SUMMARIZING:
        this.ball.classList.add('ai-summarizing');
        this.ball.style.cursor = 'default';
        this.ball.title = '正在AI总结...';
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
    let lastP = parseInt(new URLSearchParams(window.location.search).get('p') || '1');

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
      // 获取分P参数
      const urlParams = new URLSearchParams(window.location.search);
      const currentP = parseInt(urlParams.get('p') || '1');

      // 当BV号、CID或分P改变时重新初始化
      if (url !== lastUrl && (currentBvid !== lastBvid || currentCid !== lastCid || currentP !== lastP)) {
        logger.debug('App', '检测到视频切换:', { 
          from: `${lastBvid}_p${lastP}`, 
          to: `${currentBvid}_p${currentP}`,
          oldCid: lastCid,
          newCid: currentCid
        });
        
        lastUrl = url;
        lastBvid = currentBvid;
        lastCid = currentCid;
        lastP = currentP;

        // 重置所有状态
        state.reset();
        subtitleService.reset();

        // 触发视频切换事件（包含分P信息）
        eventBus.emit(EVENTS.VIDEO_CHANGED, { 
          bvid: currentBvid, 
          cid: currentCid,
          p: currentP,
          oldP: lastP
        });

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
   * 显示YouTube广告跳过设置界面
   */
  showYouTubeAdSettings() {
    // 创建设置模态框
    const modal = document.createElement('div');
    modal.className = 'youtube-ad-settings-modal';
    modal.innerHTML = `
      <div class="settings-modal-overlay"></div>
      <div class="settings-modal-content">
        <div class="settings-modal-header">
          <h3>YouTube广告跳过设置</h3>
          <button class="settings-close-btn">×</button>
        </div>
        <div class="settings-modal-body">
          <div class="setting-item">
            <label>
              <input type="checkbox" id="youtube-auto-skip" ${localStorage.getItem('youtube_auto_skip') !== 'false' ? 'checked' : ''}>
              自动跳过广告
            </label>
          </div>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="youtube-native-detect" ${localStorage.getItem('youtube_detect_native') !== 'false' ? 'checked' : ''}>
              检测原生广告标记
            </label>
          </div>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="youtube-show-notifications" ${localStorage.getItem('youtube_show_notifications') !== 'false' ? 'checked' : ''}>
              显示跳过提示
            </label>
          </div>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="youtube-show-markers" ${localStorage.getItem('youtube_show_markers') !== 'false' ? 'checked' : ''}>
              显示进度条标记
            </label>
          </div>
          <div class="setting-item">
            <label>
              <input type="checkbox" id="youtube-mute-instead" ${localStorage.getItem('youtube_mute_instead') === 'true' ? 'checked' : ''}>
              静音而不是跳过
            </label>
          </div>
          <div class="setting-item">
            <label>
              跳过延迟（秒）：
              <input type="number" id="youtube-skip-delay" min="0" max="10" value="${parseInt(localStorage.getItem('youtube_skip_delay') || '0')}">
            </label>
          </div>
          <div class="setting-item">
            <label>要跳过的类别：</label>
            <div class="category-checkboxes">
              <label><input type="checkbox" class="skip-category" value="sponsor" checked> 赞助商</label>
              <label><input type="checkbox" class="skip-category" value="selfpromo"> 自我推广</label>
              <label><input type="checkbox" class="skip-category" value="interaction"> 互动提醒</label>
              <label><input type="checkbox" class="skip-category" value="intro"> 开场</label>
              <label><input type="checkbox" class="skip-category" value="outro"> 片尾</label>
            </div>
          </div>
        </div>
        <div class="settings-modal-footer">
          <button class="settings-save-btn">保存设置</button>
          <button class="settings-cancel-btn">取消</button>
        </div>
      </div>
    `;

    // 添加样式
    if (!document.querySelector('#youtube-ad-settings-styles')) {
      const style = document.createElement('style');
      style.id = 'youtube-ad-settings-styles';
      style.textContent = `
        .youtube-ad-settings-modal {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 999999;
        }
        .settings-modal-overlay {
          position: absolute;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
        }
        .settings-modal-content {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          border-radius: 8px;
          width: 500px;
          max-height: 80vh;
          overflow-y: auto;
          box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
        }
        .settings-modal-header {
          padding: 20px;
          border-bottom: 1px solid #e0e0e0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .settings-modal-header h3 {
          margin: 0;
          font-size: 18px;
        }
        .settings-close-btn {
          background: none;
          border: none;
          font-size: 24px;
          cursor: pointer;
          padding: 0;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .settings-modal-body {
          padding: 20px;
        }
        .setting-item {
          margin-bottom: 15px;
        }
        .setting-item label {
          display: block;
          cursor: pointer;
          user-select: none;
        }
        .setting-item input[type="checkbox"] {
          margin-right: 8px;
        }
        .setting-item input[type="number"] {
          width: 60px;
          padding: 4px;
          border: 1px solid #ddd;
          border-radius: 4px;
        }
        .category-checkboxes {
          margin-top: 10px;
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        .category-checkboxes label {
          display: flex;
          align-items: center;
        }
        .settings-modal-footer {
          padding: 15px 20px;
          border-top: 1px solid #e0e0e0;
          display: flex;
          justify-content: flex-end;
          gap: 10px;
        }
        .settings-modal-footer button {
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          font-size: 14px;
        }
        .settings-save-btn {
          background: #ff0000;
          color: white;
          border: none;
        }
        .settings-save-btn:hover {
          background: #cc0000;
        }
        .settings-cancel-btn {
          background: #f0f0f0;
          border: 1px solid #ddd;
          color: #333;
        }
        .settings-cancel-btn:hover {
          background: #e0e0e0;
        }
      `;
      document.head.appendChild(style);
    }

    document.body.appendChild(modal);

    // 加载保存的类别设置
    const savedCategories = JSON.parse(localStorage.getItem('youtube_skip_categories') || '["sponsor", "selfpromo"]');
    modal.querySelectorAll('.skip-category').forEach(checkbox => {
      checkbox.checked = savedCategories.includes(checkbox.value);
    });

    // 绑定事件
    const closeModal = () => modal.remove();
    
    modal.querySelector('.settings-modal-overlay').addEventListener('click', closeModal);
    modal.querySelector('.settings-close-btn').addEventListener('click', closeModal);
    modal.querySelector('.settings-cancel-btn').addEventListener('click', closeModal);
    
    modal.querySelector('.settings-save-btn').addEventListener('click', () => {
      // 保存设置
      localStorage.setItem('youtube_auto_skip', modal.querySelector('#youtube-auto-skip').checked);
      localStorage.setItem('youtube_detect_native', modal.querySelector('#youtube-native-detect').checked);
      localStorage.setItem('youtube_show_notifications', modal.querySelector('#youtube-show-notifications').checked);
      localStorage.setItem('youtube_show_markers', modal.querySelector('#youtube-show-markers').checked);
      localStorage.setItem('youtube_mute_instead', modal.querySelector('#youtube-mute-instead').checked);
      localStorage.setItem('youtube_skip_delay', modal.querySelector('#youtube-skip-delay').value);
      
      // 保存类别
      const categories = [];
      modal.querySelectorAll('.skip-category:checked').forEach(checkbox => {
        categories.push(checkbox.value);
      });
      localStorage.setItem('youtube_skip_categories', JSON.stringify(categories));
      
      // 更新服务配置
      if (this.universalAdSkipService) {
        this.universalAdSkipService.updateConfig({
          autoSkip: modal.querySelector('#youtube-auto-skip').checked,
          detectNativeAds: modal.querySelector('#youtube-native-detect').checked,
          showNotifications: modal.querySelector('#youtube-show-notifications').checked,
          showProgressMarkers: modal.querySelector('#youtube-show-markers').checked,
          muteInsteadOfSkip: modal.querySelector('#youtube-mute-instead').checked,
          skipDelay: parseInt(modal.querySelector('#youtube-skip-delay').value),
          skipCategories: categories
        });
      }
      
      notification.success('设置已保存');
      closeModal();
    });
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

// 使用立即执行函数防止重复初始化
(function() {
  'use strict';
  
  // ============ 阶段1：iframe检测（最高优先级）============
  // 防止在iframe中运行，这是导致多次初始化的根本原因
  if (window !== window.top) {
    console.log('[BilibiliTools] 检测到iframe环境，跳过初始化');
    return;
  }
  
  // 环境检查日志（用于调试）
  console.log('[BilibiliTools] 环境检查:', {
    isTopWindow: window === window.top,
    url: location.href,
    hostname: location.hostname,
    pathname: location.pathname
  });
  
  // 使用 unsafeWindow 确保在所有环境中共享
  const globalWindow = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
  
  // 使用更唯一的标记名称，包含版本号
  const INIT_FLAG = '__BILIBILI_YOUTUBE_TOOLS_V1_2_20_INITIALIZED__';
  const INSTANCE_KEY = '__BILIBILI_YOUTUBE_TOOLS_INSTANCES__';
  
  // 初始化实例计数器
  if (!globalWindow[INSTANCE_KEY]) {
    globalWindow[INSTANCE_KEY] = 0;
  }
  
  // 检查是否已经初始化
  if (globalWindow[INIT_FLAG]) {
    const existingInstance = globalWindow[INSTANCE_KEY];
    console.warn(`[BilibiliTools] 脚本已初始化（实例 #${existingInstance}），跳过重复执行 #${globalWindow[INSTANCE_KEY] + 1}`);
    return; // 直接退出
  }
  
  // 设置全局标记
  globalWindow[INIT_FLAG] = true;
  globalWindow[INSTANCE_KEY]++;
  
  const instanceId = globalWindow[INSTANCE_KEY];
  console.log(`[BilibiliTools] 初始化脚本实例 #${instanceId}`);
  
  // 创建应用实例并初始化
  const app = new BilibiliSubtitleExtractor();
  
  // 将实例ID附加到应用对象，方便调试
  app.instanceId = instanceId;
  
  // 保存初始化状态
  let initStarted = false;
  
  // 初始化函数，确保只执行一次
  const initializeApp = () => {
    if (initStarted) {
      console.log(`[BilibiliTools] 实例 #${instanceId} - 已经开始初始化，跳过重复调用`);
      return;
    }
    initStarted = true;
    console.log(`[BilibiliTools] 实例 #${instanceId} - 开始初始化`);
    app.init();
  };
  
  // 等待DOM加载完成后初始化
  if (document.readyState === 'loading') {
    // 使用once选项确保事件只触发一次
    document.addEventListener('DOMContentLoaded', initializeApp, { once: true });
  } else {
    // DOM已加载，直接初始化
    initializeApp();
  }
  
  // 将应用实例挂载到全局，方便调试
  globalWindow.__BILIBILI_TOOLS_APP__ = app;
})();

