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
    this.ball = null;
    this.container = null;
    this.videoQualityService = null;
    this.universalAdSkipService = null;
    this.isBilibili = IS_BILIBILI;
    this.isYouTube = IS_YOUTUBE;
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

    // 初始化平台服务
    platformService.init();
    const currentSubtitleService = platformService.getSubtitleService();

    // 注入样式
    injectStyles();

    // 等待页面加载
    await this.waitForPageReady();

    // 修复已存在的配置中错误的prompt2（仅B站需要）
    if (this.isBilibili) {
      config.fixExistingConfigPrompts();
    }

    // === 通用功能初始化 - 所有网站都可用 ===
    // 初始化笔记服务 - 所有网站都可以选中文字保存笔记
    notesService.init();

    // 初始化速度控制服务 - 所有网站的视频都可以控制速度
    speedControlService.init();

    // 初始化截图服务 - 所有网站的视频都可以截图
    // screenshotService 已在导入时初始化

    if (this.isBilibili) {
      // SponsorBlock 初始化（非关键功能，错误不影响主流程）
      try {
        await sponsorBlockService.init();
      } catch (error) {
        logger.warn('Main', 'SponsorBlock 初始化失败:', error.message);
      }
      
      // 视频质量徽章服务
      this.videoQualityService = createVideoQualityService(sponsorBlockService.getAPI());
      this.videoQualityService.start();
    }

    // 初始化通用广告跳过服务（支持YouTube和Bilibili）
    if (this.isBilibili || this.isYouTube) {
      try {
        // 为两个平台都创建配置包装器
        const adSkipConfig = this.isYouTube ? {
          get: (key) => {
            const configs = {
              autoSkip: localStorage.getItem('youtube_auto_skip') !== 'false',
              skipCategories: JSON.parse(localStorage.getItem('youtube_skip_categories') || '["sponsor", "selfpromo"]'),
              showNotifications: localStorage.getItem('youtube_show_notifications') !== 'false',
              showProgressMarkers: localStorage.getItem('youtube_show_markers') !== 'false',
              detectNativeAds: localStorage.getItem('youtube_detect_native') !== 'false',
              skipDelay: parseInt(localStorage.getItem('youtube_skip_delay') || '0'),
              muteInsteadOfSkip: localStorage.getItem('youtube_mute_instead') === 'true'
            };
            return configs[key];
          },
          set: (key, value) => {
            localStorage.setItem(`youtube_${key}`, JSON.stringify(value));
          }
        } : {
          // Bilibili配置包装器
          get: (key) => {
            const configs = {
              autoSkip: localStorage.getItem('bilibili_auto_skip') !== 'false',
              skipCategories: JSON.parse(localStorage.getItem('bilibili_skip_categories') || '["sponsor", "selfpromo"]'),
              showNotifications: localStorage.getItem('bilibili_show_notifications') !== 'false',
              showProgressMarkers: localStorage.getItem('bilibili_show_markers') !== 'false',
              detectNativeAds: localStorage.getItem('bilibili_detect_native') !== 'false',
              skipDelay: parseInt(localStorage.getItem('bilibili_skip_delay') || '0'),
              muteInsteadOfSkip: localStorage.getItem('bilibili_mute_instead') === 'true'
            };
            return configs[key];
          },
          set: (key, value) => {
            localStorage.setItem(`bilibili_${key}`, JSON.stringify(value));
          }
        };
        
        this.universalAdSkipService = new UniversalAdSkipService(adSkipConfig);
        await this.universalAdSkipService.init();
        logger.info('Main', '通用广告跳过服务已初始化');
      } catch (error) {
        logger.warn('Main', '通用广告跳过服务初始化失败:', error.message);
      }
    }

    // 初始化YouTube视频标签服务（在视频列表中显示广告标签）
    if (this.isYouTube) {
      try {
        await youTubeVideoTagger.init();
        logger.info('Main', 'YouTube视频标签服务已初始化');
      } catch (error) {
        logger.warn('Main', 'YouTube视频标签服务初始化失败:', error.message);
      }
    }

    // 创建UI元素
    // B站和YouTube需要完整UI（字幕面板等）
    if (this.isBilibili || (this.isYouTube && location.pathname === '/watch')) {
      this.createUI();
    }
    // 其他网站创建基础UI（快速操作按钮等）
    else {
      this.createBasicUI();
    }

    // 绑定事件
    this.bindEvents();

    // 设置自动化逻辑
    if (this.isBilibili || (this.isYouTube && location.pathname === '/watch')) {
      this.setupAutomation();
    }

    // 注册油猴菜单
    this.registerMenuCommands();

    // 注册快捷键 - 所有网站都可用
    this.registerShortcuts();

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

    // YouTube广告跳过设置
    if (this.isYouTube) {
      GM_registerMenuCommand('🚫 YouTube广告设置', () => {
        this.showYouTubeAdSettings();
      });
    }

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

  /**
   * 创建基础UI - 用于其他网站
   * 提供笔记、截图、速度控制等基础功能
   */
  createBasicUI() {
    // 创建一个简单的控制按钮
    const controlButton = document.createElement('div');
    controlButton.id = 'universal-control-button';
    controlButton.innerHTML = '🎬';
    controlButton.title = '视频工具';
    controlButton.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 50px;
      height: 50px;
      border-radius: 50%;
      background: linear-gradient(135deg, #feebea 0%, #ffdbdb 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 24px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(254, 235, 234, 0.5);
      z-index: 999999;
      transition: all 0.3s ease;
    `;

    // 悬停效果
    controlButton.addEventListener('mouseenter', () => {
      controlButton.style.transform = 'scale(1.1)';
    });
    controlButton.addEventListener('mouseleave', () => {
      controlButton.style.transform = 'scale(1)';
    });

    // 点击显示快捷菜单
    controlButton.addEventListener('click', () => {
      this.showQuickMenu();
    });

    document.body.appendChild(controlButton);
    logger.info('Main', '基础UI已创建 - 适用于所有网站');
  }

  /**
   * 显示快捷菜单
   */
  showQuickMenu() {
    // 如果已存在，先移除
    const existingMenu = document.getElementById('universal-quick-menu');
    if (existingMenu) {
      existingMenu.remove();
      return;
    }

    const menu = document.createElement('div');
    menu.id = 'universal-quick-menu';
    menu.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      background: white;
      border-radius: 8px;
      padding: 10px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.15);
      z-index: 999998;
      min-width: 150px;
    `;

    // 检测是否有视频
    const videos = document.querySelectorAll('video');
    const hasVideo = videos.length > 0;

    const menuItems = [
      { 
        icon: '📝', 
        text: '笔记管理', 
        action: () => notesPanel.togglePanel() 
      }
    ];

    if (hasVideo) {
      menuItems.push(
        { 
          icon: '⏩', 
          text: '速度 +0.1', 
          action: () => speedControlService.adjustBaseSpeed(0.1) 
        },
        { 
          icon: '⏪', 
          text: '速度 -0.1', 
          action: () => speedControlService.adjustBaseSpeed(-0.1) 
        },
        { 
          icon: '⏯', 
          text: '重置速度', 
          action: () => speedControlService.resetToNormalSpeed() 
        },
        { 
          icon: '📸', 
          text: '截图', 
          action: async () => {
            try {
              const note = await screenshotService.captureAndSave(false);
              if (note) {
                notification.success('截图已保存到笔记');
                const notesPanel = document.querySelector('.notes-panel');
                if (notesPanel && notesPanel.style.display !== 'none') {
                  window.notesPanel?.render();
                }
              }
            } catch (error) {
              notification.error('截图失败: ' + error.message);
            }
          }
        }
      );
    }

    menuItems.push(
      { 
        icon: '⚙️', 
        text: '快捷键设置', 
        action: () => {
          eventHandlers.showShortcutConfigModal();
          menu.remove();
        } 
      }
    );

    // 创建菜单项
    menuItems.forEach(item => {
      const menuItem = document.createElement('div');
      menuItem.style.cssText = `
        padding: 8px 12px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 8px;
        transition: background 0.2s;
        border-radius: 4px;
      `;
      menuItem.innerHTML = `<span>${item.icon}</span><span style="font-size: 14px;">${item.text}</span>`;
      
      menuItem.addEventListener('mouseenter', () => {
        menuItem.style.background = '#f0f0f0';
      });
      menuItem.addEventListener('mouseleave', () => {
        menuItem.style.background = 'transparent';
      });
      
      menuItem.addEventListener('click', () => {
        item.action();
        menu.remove();
      });
      
      menu.appendChild(menuItem);
    });

    document.body.appendChild(menu);

    // 点击其他地方关闭菜单
    setTimeout(() => {
      document.addEventListener('click', function closeMenu(e) {
        if (!menu.contains(e.target) && e.target.id !== 'universal-control-button') {
          menu.remove();
          document.removeEventListener('click', closeMenu);
        }
      });
    }, 0);
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
          // 直接发送到Notion（包含字幕，不包含AI总结）
          const videoInfo = state.getVideoInfo();
          await notionService.sendToNotion({
            videoInfo,
            aiSummary: cachedSummary, // 如果有缓存的AI总结也会发送
            subtitleData: data,
            isAuto: true
          });
          logger.debug('App', '字幕已自动发送到Notion');
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

// 创建应用实例并初始化
const app = new BilibiliSubtitleExtractor();

// 等待DOM加载完成后初始化
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => app.init());
} else {
  app.init();
}

