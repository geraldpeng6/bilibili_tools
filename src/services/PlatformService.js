/**
 * 平台检测和管理服务
 * 自动识别当前视频平台并提供相应的服务
 */

import logger from '../utils/DebugLogger.js';
import BilibiliAdapter from './adapters/BilibiliAdapter.js';
import YouTubeAdapter from './adapters/YouTubeAdapter.js';
import subtitleService from './SubtitleService.js';
import youtubeSubtitleService from './YouTubeSubtitleService.js';

class PlatformService {
  constructor() {
    this.currentPlatform = null;
    this.adapter = null;
    this.subtitleService = null;
  }

  /**
   * 初始化平台服务
   */
  init() {
    this.detectPlatform();
    this.setupAdapter();
    this.setupSubtitleService();
    
    logger.info('PlatformService', `当前平台: ${this.currentPlatform}`);
    return this;
  }

  /**
   * 检测当前平台
   */
  detectPlatform() {
    const hostname = window.location.hostname;
    
    if (hostname.includes('bilibili.com')) {
      this.currentPlatform = 'bilibili';
    } else if (hostname.includes('youtube.com')) {
      this.currentPlatform = 'youtube';
    } else if (hostname.includes('youtu.be')) {
      this.currentPlatform = 'youtube';
    } else {
      this.currentPlatform = 'unknown';
    }
    
    return this.currentPlatform;
  }

  /**
   * 设置平台适配器
   */
  setupAdapter() {
    switch (this.currentPlatform) {
      case 'bilibili':
        this.adapter = new BilibiliAdapter();
        break;
      case 'youtube':
        this.adapter = new YouTubeAdapter();
        break;
      default:
        logger.warn('PlatformService', '未知平台，使用默认适配器');
        this.adapter = null;
    }
  }

  /**
   * 设置字幕服务
   */
  setupSubtitleService() {
    switch (this.currentPlatform) {
      case 'bilibili':
        this.subtitleService = subtitleService;
        break;
      case 'youtube':
        this.subtitleService = youtubeSubtitleService;
        break;
      default:
        this.subtitleService = null;
    }
  }

  /**
   * 获取当前平台名称
   */
  getPlatform() {
    return this.currentPlatform;
  }

  /**
   * 获取平台适配器
   */
  getAdapter() {
    return this.adapter;
  }

  /**
   * 获取字幕服务
   */
  getSubtitleService() {
    return this.subtitleService;
  }

  /**
   * 检查是否为支持的平台
   */
  isSupported() {
    return this.currentPlatform !== 'unknown' && this.adapter !== null;
  }

  /**
   * 检查是否为视频页面
   */
  isVideoPage() {
    if (!this.adapter) return false;
    return this.adapter.isVideoPage();
  }

  /**
   * 获取视频ID
   */
  getVideoId() {
    if (!this.adapter) return null;
    
    if (this.currentPlatform === 'bilibili') {
      return this.adapter.getBvid();
    } else if (this.currentPlatform === 'youtube') {
      return this.adapter.getVideoId();
    }
    
    return null;
  }

  /**
   * 获取统一的视频信息
   */
  getVideoInfo() {
    const videoId = this.getVideoId();
    const videoElement = document.querySelector('video');
    
    let title = '';
    let url = window.location.href;
    let creator = '';
    
    if (this.currentPlatform === 'bilibili') {
      // B站视频信息
      title = document.querySelector('h1.video-title')?.textContent ||
              document.querySelector('.video-info-title')?.textContent ||
              document.title;
      
      creator = document.querySelector('.up-name')?.textContent ||
                document.querySelector('.username')?.textContent || '';
                
    } else if (this.currentPlatform === 'youtube') {
      // YouTube视频信息
      title = document.querySelector('h1.title yt-formatted-string')?.textContent ||
              document.querySelector('#title h1')?.textContent ||
              document.title.replace(' - YouTube', '');
      
      creator = document.querySelector('#channel-name yt-formatted-string')?.textContent ||
                document.querySelector('.ytd-channel-name a')?.textContent || '';
    }
    
    return {
      platform: this.currentPlatform,
      videoId: videoId,
      bvid: this.currentPlatform === 'bilibili' ? videoId : `${this.currentPlatform}_${videoId}`,
      cid: videoId,
      aid: videoId,
      title: title.trim(),
      creator: creator.trim(),
      url: url,
      duration: videoElement?.duration || 0,
      currentTime: videoElement?.currentTime || 0
    };
  }

  /**
   * 获取平台特定的功能配置
   */
  getFeatures() {
    const baseFeatures = {
      subtitle: true,      // 字幕提取
      ai: true,           // AI总结
      notion: true,       // Notion集成
      screenshot: true,   // 截图
      notes: true,       // 笔记
      speed: true        // 速度控制
    };
    
    const platformFeatures = {
      bilibili: {
        ...baseFeatures,
        quality: true,     // 画质增强
        widescreen: true,  // 宽屏模式
        danmaku: true      // 弹幕控制
      },
      youtube: {
        ...baseFeatures,
        sponsorblock: true, // SponsorBlock集成
        adblock: true,      // 广告跳过
        chapters: true      // 章节支持
      },
      unknown: {
        subtitle: false,
        ai: false,
        notion: false,
        screenshot: true,
        notes: true,
        speed: true
      }
    };
    
    return platformFeatures[this.currentPlatform] || platformFeatures.unknown;
  }

  /**
   * 检查功能是否可用
   */
  isFeatureAvailable(feature) {
    const features = this.getFeatures();
    return features[feature] === true;
  }

  /**
   * 获取平台特定的选择器
   */
  getSelectors() {
    const selectors = {
      bilibili: {
        video: 'video',
        subtitleButton: '.bpx-player-ctrl-subtitle',
        settingsButton: '.bpx-player-ctrl-setting',
        speedButton: '.bpx-player-ctrl-playbackrate',
        fullscreenButton: '.bpx-player-ctrl-full',
        progressBar: '.bpx-player-progress-wrap',
        currentTime: '.bpx-player-ctrl-time-current',
        duration: '.bpx-player-ctrl-time-duration'
      },
      youtube: {
        video: 'video.html5-main-video',
        subtitleButton: '.ytp-subtitles-button',
        settingsButton: '.ytp-settings-button',
        speedButton: '.ytp-playback-speed-button',
        fullscreenButton: '.ytp-fullscreen-button',
        progressBar: '.ytp-progress-bar',
        currentTime: '.ytp-time-current',
        duration: '.ytp-time-duration'
      }
    };
    
    return selectors[this.currentPlatform] || {};
  }

  /**
   * 执行平台特定的初始化
   */
  async platformInit() {
    if (this.currentPlatform === 'youtube') {
      // YouTube特定初始化
      await this.initYouTube();
    } else if (this.currentPlatform === 'bilibili') {
      // B站特定初始化
      await this.initBilibili();
    }
  }

  /**
   * YouTube平台初始化
   */
  async initYouTube() {
    logger.info('PlatformService', '初始化YouTube平台功能');
    
    // 等待页面加载
    await this.waitForElement('.ytp-subtitles-button', 5000);
    
    // 自动启用字幕（如果需要）
    if (this.subtitleService) {
      const hasSubtitles = await this.subtitleService.checkSubtitleAvailability();
      if (hasSubtitles) {
        logger.info('PlatformService', 'YouTube视频有字幕可用');
      }
    }
  }

  /**
   * B站平台初始化
   */
  async initBilibili() {
    logger.info('PlatformService', '初始化B站平台功能');
    
    // 等待播放器加载
    await this.waitForElement('.bpx-player-ctrl-subtitle', 5000);
  }

  /**
   * 等待元素出现
   */
  async waitForElement(selector, timeout = 5000) {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      const element = document.querySelector(selector);
      if (element) {
        return element;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    return null;
  }

  /**
   * 监听平台切换（SPA导航）
   */
  observePlatformChange(callback) {
    // 监听URL变化
    let lastUrl = window.location.href;
    
    const observer = new MutationObserver(() => {
      const currentUrl = window.location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        const oldPlatform = this.currentPlatform;
        this.init();
        
        if (oldPlatform !== this.currentPlatform) {
          logger.info('PlatformService', `平台切换: ${oldPlatform} -> ${this.currentPlatform}`);
          callback(this.currentPlatform, oldPlatform);
        }
      }
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
    
    // YouTube特定的导航事件
    if (this.currentPlatform === 'youtube') {
      document.addEventListener('yt-navigate-finish', () => {
        this.init();
        callback(this.currentPlatform);
      });
    }
  }
}

// 创建全局单例
export const platformService = new PlatformService();
export default platformService;
