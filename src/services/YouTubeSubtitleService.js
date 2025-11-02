/**
 * YouTube字幕服务
 * 处理YouTube字幕的拦截、解析和转换
 */

import BaseService from './BaseService.js';
import state from '../state/StateManager.js';
import logger from '../utils/DebugLogger.js';
import eventBus from '../utils/EventBus.js';
import { EVENTS, TIMING, BALL_STATUS } from '../constants.js';
import performanceMonitor from '../utils/PerformanceMonitor.js';
import { getVideoTitle, getVideoUrl, delay } from '../utils/helpers.js';

class YouTubeSubtitleService extends BaseService {
  constructor() {
    super('YouTubeSubtitleService');
    this.capturedSubtitleUrl = null;
    this.isVideoPage = false;
    this.interceptorSetup = false;  // 拦截器设置标志
    this.initializeService();
  }

  /**
   * 初始化服务（延迟初始化拦截器）
   */
  initializeService() {
    // 检查是否在YouTube播放页面
    if (this.checkIsVideoPage()) {
      logger.info('YouTubeSubtitleService', '检测到YouTube播放页面，准备字幕拦截');
      // 延迟初始化拦截器，防止在非必要时设置
      this.ensureInterceptorSetup();
    } else {
      logger.debug('YouTubeSubtitleService', '非YouTube播放页面，跳过字幕拦截');
    }

    // 监听页面变化（YouTube是SPA）
    this.observePageChanges();
  }

  /**
   * 确保拦截器已设置（懒加载）
   */
  ensureInterceptorSetup() {
    if (!this.interceptorSetup && this.checkIsVideoPage()) {
      logger.debug('YouTubeSubtitleService', '首次设置字幕拦截器');
      this.setupInterceptor();
      this.interceptorSetup = true;
    }
  }

  /**
   * 检查是否为YouTube视频播放页面
   */
  checkIsVideoPage() {
    this.isVideoPage = location.hostname.includes('youtube.com') && 
                       location.pathname === '/watch';
    return this.isVideoPage;
  }

  /**
   * 监听页面变化
   */
  observePageChanges() {
    // YouTube使用History API进行导航
    let lastUrl = location.href;

    // 监听YouTube导航事件
    document.addEventListener('yt-navigate-finish', () => {
      const currentUrl = location.href;
      if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        const wasVideoPage = this.isVideoPage;
        const isNowVideoPage = this.checkIsVideoPage();
        
        if (!wasVideoPage && isNowVideoPage) {
          logger.info('YouTubeSubtitleService', '进入YouTube播放页面，启动字幕拦截');
          // 由于拦截器可能已设置，不需要重复设置
        } else if (wasVideoPage && !isNowVideoPage) {
          logger.info('YouTubeSubtitleService', '离开YouTube播放页面');
          // 清理已捕获的数据
          this.capturedSubtitleUrl = null;
          state.subtitle.capturedUrl = null;
          state.subtitle.data = null;
        }
      }
    });

    // 备用：监听URL变化
    const setupMutationObserver = () => {
      // 确保document.body存在
      if (!document.body) {
        // 如果body还不存在，等待DOM加载完成
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            setupMutationObserver();
          });
        }
        return;
      }

      const observer = new MutationObserver(() => {
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          this.checkIsVideoPage();
        }
      });

      try {
        observer.observe(document.body, {
          childList: true,
          subtree: true
        });
      } catch (error) {
        logger.warn('YouTubeSubtitleService', '无法设置MutationObserver:', error);
      }
    };

    // 启动观察器
    setupMutationObserver();
  }

  /**
   * 设置YouTube字幕请求拦截器
   */
  setupInterceptor() {
    const originalOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    const originalSend = unsafeWindow.XMLHttpRequest.prototype.send;
    const originalFetch = unsafeWindow.fetch;

    // 拦截XMLHttpRequest
    unsafeWindow.XMLHttpRequest.prototype.open = function(method, url) {
      this._url = url;
      this._method = method;
      return originalOpen.apply(this, arguments);
    };

    unsafeWindow.XMLHttpRequest.prototype.send = function() {
      const url = this._url;
      const method = this._method;
      
      // 只在视频页面拦截YouTube字幕请求
      if (url && url.includes('/api/timedtext') && youtubeSubtitleService.isVideoPage) {
        logger.info('YouTubeSubtitleService', '拦截到YouTube字幕请求:', url);
        
        // 添加响应拦截
        this.addEventListener('load', function() {
          if (this.responseText) {
            try {
              const data = JSON.parse(this.responseText);
              if (data.events) {
                logger.info('YouTubeSubtitleService', '成功捕获字幕数据');
                youtubeSubtitleService.handleSubtitleResponse(url, data);
              }
            } catch (e) {
              logger.debug('YouTubeSubtitleService', '非JSON响应');
            }
          }
        });
      }
      
      return originalSend.apply(this, arguments);
    };

    // 拦截fetch请求
    unsafeWindow.fetch = async function(url, options) {
      if (typeof url === 'string' && url.includes('/api/timedtext') && youtubeSubtitleService.isVideoPage) {
        logger.info('YouTubeSubtitleService', '拦截到YouTube字幕fetch请求:', url);
        
        // 执行原始请求
        const response = await originalFetch.apply(this, arguments);
        
        // 克隆响应以便读取
        const clonedResponse = response.clone();
        
        try {
          const data = await clonedResponse.json();
          if (data.events) {
            logger.info('YouTubeSubtitleService', '成功捕获字幕数据(fetch)');
            youtubeSubtitleService.handleSubtitleResponse(url, data);
          }
        } catch (e) {
          logger.debug('YouTubeSubtitleService', '非JSON响应(fetch)');
        }
        
        return response;
      }
      
      return originalFetch.apply(this, arguments);
    };
  }

  /**
   * 处理字幕响应数据
   */
  async handleSubtitleResponse(url, data) {
    this.capturedSubtitleUrl = url;
    state.subtitle.capturedUrl = url;
    
    // 直接处理已经捕获的数据
    await this.processSubtitleData(data);
  }

  /**
   * 处理字幕请求（备用）
   */
  async handleSubtitleRequest(url) {
    this.capturedSubtitleUrl = url;
    state.subtitle.capturedUrl = url;

    // 延迟下载，确保页面稳定
    setTimeout(() => {
      this.downloadCapturedSubtitle();
    }, TIMING.SUBTITLE_CAPTURE_DELAY || 1000);
  }

  /**
   * 处理字幕数据
   */
  async processSubtitleData(data) {
    await performanceMonitor.measureAsync('YouTube字幕处理', async () => {
      try {
        // 获取视频信息
        const videoInfo = this.getVideoInfo();
        state.setVideoInfo(videoInfo);

        // 检查缓存
        const result = state.startRequest();
        if (!result.success) {
          if (result.reason === '已有缓存') {
            this.useCachedData();
          }
          return;
        }

        // 开始处理
        state.setBallStatus('loading');
        eventBus.emit(EVENTS.SUBTITLE_REQUESTED, videoInfo);

        // 解析字幕数据
        const subtitleData = this.parseYouTubeSubtitle(data);
        
        if (subtitleData.length === 0) {
          throw new Error('解析出的字幕为空');
        }

        // 保存数据
        state.setSubtitleData(subtitleData);
        state.setBallStatus(BALL_STATUS.ACTIVE);
        eventBus.emit(EVENTS.SUBTITLE_LOADED, subtitleData, state.getVideoKey());

        logger.success('YouTubeSubtitleService', `字幕处理成功，共 ${subtitleData.length} 条`);

      } catch (error) {
        logger.error('YouTubeSubtitleService', '字幕处理失败:', error);
        state.setBallStatus(BALL_STATUS.ERROR);
        eventBus.emit(EVENTS.SUBTITLE_FAILED, error.message);
      } finally {
        state.finishRequest();
      }
    });
  }

  /**
   * 下载并解析YouTube字幕
   */
  async downloadCapturedSubtitle() {
    if (!this.capturedSubtitleUrl) {
      return;
    }

    await performanceMonitor.measureAsync('YouTube字幕下载', async () => {
      try {
        // 获取视频信息
        const videoInfo = this.getVideoInfo();
        state.setVideoInfo(videoInfo);

        // 检查缓存
        const result = state.startRequest();
        if (!result.success) {
          if (result.reason === '已有缓存') {
            this.useCachedData();
          }
          return;
        }

        // 开始下载
        state.setBallStatus('loading');
        eventBus.emit(EVENTS.SUBTITLE_REQUESTED, videoInfo);

        // 获取字幕数据
        const response = await this.fetchSubtitle(this.capturedSubtitleUrl);
        const subtitleData = this.parseYouTubeSubtitle(response);

        // 保存数据
        state.setSubtitleData(subtitleData);
        state.setBallStatus(BALL_STATUS.ACTIVE);
        eventBus.emit(EVENTS.SUBTITLE_LOADED, subtitleData, state.getVideoKey());

        logger.success('YouTubeSubtitleService', `字幕获取成功，共 ${subtitleData.length} 条`);

      } catch (error) {
        logger.error('YouTubeSubtitleService', '字幕获取失败:', error);
        state.setBallStatus(BALL_STATUS.ERROR);
        eventBus.emit(EVENTS.SUBTITLE_FAILED, error.message);
      } finally {
        state.finishRequest();
      }
    });
  }

  /**
   * 获取YouTube视频信息
   */
  getVideoInfo() {
    const urlParams = new URLSearchParams(window.location.search);
    const videoId = urlParams.get('v');
    const videoElement = document.querySelector('video');
    
    // 获取视频标题
    let title = document.querySelector('h1.title yt-formatted-string')?.textContent ||
                document.querySelector('h1 yt-formatted-string')?.textContent ||
                document.title.replace(' - YouTube', '');

    return {
      platform: 'youtube',
      videoId: videoId,
      bvid: `yt_${videoId}`, // 兼容B站的bvid格式
      cid: videoId,
      aid: videoId,
      title: title,
      url: window.location.href,
      duration: videoElement?.duration || 0
    };
  }

  /**
   * 获取字幕内容
   */
  async fetchSubtitle(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: url,
        headers: {
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
          'User-Agent': navigator.userAgent
        },
        onload: (response) => {
          if (response.status !== 200) {
            reject(new Error(`请求失败: ${response.status}`));
            return;
          }

          try {
            const data = JSON.parse(response.responseText);
            resolve(data);
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
   * 解析YouTube字幕格式
   * @param {Object} data - YouTube字幕原始数据
   * @returns {Array} 标准化的字幕数组
   */
  parseYouTubeSubtitle(data) {
    const subtitles = [];
    
    if (!data) {
      logger.warn('YouTubeSubtitleService', '字幕数据为空');
      return subtitles;
    }

    // 处理YouTube的JSON3格式
    if (data.wireMagic === 'pb3' && data.events) {
      return this.parseJSON3Format(data);
    }
    
    // 处理普通格式
    if (data.events) {
      return this.parseEventsFormat(data.events);
    }

    logger.warn('YouTubeSubtitleService', '未知的字幕格式');
    return subtitles;
  }

  /**
   * 解析JSON3格式（YouTube新格式）
   */
  parseJSON3Format(data) {
    const subtitles = [];
    const events = data.events || [];
    
    // 构建连续的字幕文本
    let currentSubtitle = null;
    
    events.forEach((event) => {
      // 跳过窗口定义事件
      if (event.id === 1 && !event.segs) {
        return;
      }
      
      // 处理字幕文本事件
      if (event.segs && event.segs.length > 0) {
        // 提取文本内容
        const text = event.segs
          .map(seg => seg.utf8 || '')
          .join('')
          .replace(/\n/g, ' ')
          .trim();
        
        // 跳过空文本或纯音效标记
        if (!text || this.isSkippableText(text)) {
          return;
        }
        
        // 处理追加事件
        if (event.aAppend === 1 && currentSubtitle) {
          // 追加到当前字幕
          currentSubtitle.content += ' ' + text;
          currentSubtitle.to = (event.tStartMs + (event.dDurationMs || 0)) / 1000;
        } else {
          // 创建新字幕条目
          if (currentSubtitle) {
            subtitles.push(currentSubtitle);
          }
          
          currentSubtitle = {
            index: subtitles.length,
            from: (event.tStartMs || 0) / 1000,
            to: ((event.tStartMs || 0) + (event.dDurationMs || 5000)) / 1000,
            content: text,
            raw: event
          };
        }
      }
    });
    
    // 添加最后一条字幕
    if (currentSubtitle) {
      subtitles.push(currentSubtitle);
    }
    
    // 按时间排序
    subtitles.sort((a, b) => a.from - b.from);
    
    // 重新编号
    subtitles.forEach((subtitle, index) => {
      subtitle.index = index;
    });
    
    logger.debug('YouTubeSubtitleService', `解析JSON3格式，共 ${subtitles.length} 条字幕`);
    return subtitles;
  }

  /**
   * 解析普通events格式
   */
  parseEventsFormat(events) {
    const subtitles = [];
    
    events.forEach((event, index) => {
      if (!event.segs || event.segs.length === 0) {
        return;
      }
      
      // 提取文本内容
      const text = event.segs
        .map(seg => seg.utf8 || seg.text || '')
        .join('')
        .trim();

      // 跳过空文本或音效标记
      if (!text || this.isSkippableText(text)) {
        return;
      }

      // 计算时间
      const startMs = event.tStartMs || event.start || 0;
      const durationMs = event.dDurationMs || event.duration || 5000;
      const endMs = startMs + durationMs;

      subtitles.push({
        index: index,
        from: startMs / 1000, // 转换为秒
        to: endMs / 1000,
        content: text,
        raw: event
      });
    });

    // 按时间排序并重新编号
    subtitles.sort((a, b) => a.from - b.from);
    subtitles.forEach((subtitle, index) => {
      subtitle.index = index;
    });

    logger.debug('YouTubeSubtitleService', `解析Events格式，共 ${subtitles.length} 条字幕`);
    return subtitles;
  }

  /**
   * 检查是否为可跳过的文本
   */
  isSkippableText(text) {
    const skippablePatterns = [
      /^\[.*\]$/,           // [音乐], [Applause]等
      /^\(.*\)$/,           // (Music), (Laughter)等
      /^♪+$/,               // 音符
      /^\.{3,}$/            // 省略号
    ];
    
    return skippablePatterns.some(pattern => pattern.test(text));
  }

  /**
   * 使用缓存的字幕数据
   */
  useCachedData() {
    const cachedData = state.getSubtitleData();
    if (cachedData) {
      state.setBallStatus('active');
      eventBus.emit(EVENTS.SUBTITLE_LOADED, cachedData, state.getVideoKey());
      logger.info('YouTubeSubtitleService', '使用缓存的字幕数据');
    }
  }

  /**
   * 手动触发字幕获取（用于UI按钮）
   */
  async manualFetchSubtitle() {
    const videoId = new URLSearchParams(window.location.search).get('v');
    if (!videoId) {
      throw new Error('无法获取视频ID');
    }

    // 尝试多种语言
    const languages = ['zh-Hans', 'zh-CN', 'zh', 'en', 'en-US'];
    
    for (const lang of languages) {
      try {
        const url = `https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`;
        const response = await this.fetchSubtitle(url);
        
        if (response && response.events) {
          const subtitleData = this.parseYouTubeSubtitle(response);
          if (subtitleData.length > 0) {
            state.setSubtitleData(subtitleData);
            state.setBallStatus('active');
            eventBus.emit(EVENTS.SUBTITLE_LOADED, subtitleData, state.getVideoKey());
            logger.success('YouTubeSubtitleService', `成功获取${lang}字幕`);
            return subtitleData;
          }
        }
      } catch (error) {
        logger.debug('YouTubeSubtitleService', `尝试获取${lang}字幕失败`);
      }
    }

    throw new Error('无法获取任何语言的字幕');
  }

  /**
   * 检测是否有字幕可用
   */
  async checkSubtitleAvailability() {
    // YouTube字幕按钮选择器
    const subtitleButton = document.querySelector('.ytp-subtitles-button');
    
    if (subtitleButton) {
      // 检查按钮是否被禁用
      const isDisabled = subtitleButton.getAttribute('aria-disabled') === 'true';
      const isPressed = subtitleButton.getAttribute('aria-pressed') === 'true';
      
      if (!isDisabled) {
        logger.info('YouTubeSubtitleService', '检测到字幕按钮可用');
        return true;
      }
    }
    
    logger.info('YouTubeSubtitleService', '未检测到可用字幕');
    return false;
  }

  /**
   * 自动启用字幕
   */
  async autoEnableSubtitle() {
    const subtitleButton = document.querySelector('.ytp-subtitles-button');
    
    if (subtitleButton) {
      const isPressed = subtitleButton.getAttribute('aria-pressed') === 'true';
      
      if (!isPressed) {
        // 点击启用字幕
        subtitleButton.click();
        logger.info('YouTubeSubtitleService', '已自动启用字幕');
        
        // 等待字幕加载
        await delay(1000);
        
        // 选择中文字幕（如果有）
        await this.selectChineseSubtitle();
      }
    }
  }

  /**
   * 选择中文字幕
   */
  async selectChineseSubtitle() {
    // 打开字幕设置菜单
    const settingsButton = document.querySelector('.ytp-settings-button');
    if (settingsButton) {
      settingsButton.click();
      await delay(300);
      
      // 查找字幕菜单项
      const subtitleMenuItem = Array.from(document.querySelectorAll('.ytp-menuitem'))
        .find(item => item.textContent.includes('字幕') || item.textContent.includes('Subtitle'));
      
      if (subtitleMenuItem) {
        subtitleMenuItem.click();
        await delay(300);
        
        // 查找中文选项
        const chineseOption = Array.from(document.querySelectorAll('.ytp-menuitem'))
          .find(item => 
            item.textContent.includes('中文') || 
            item.textContent.includes('Chinese') ||
            item.textContent.includes('简体')
          );
        
        if (chineseOption) {
          chineseOption.click();
          logger.info('YouTubeSubtitleService', '已选择中文字幕');
        }
        
        // 关闭设置菜单
        settingsButton.click();
      }
    }
  }

  /**
   * 重置状态
   */
  reset() {
    this.capturedSubtitleUrl = null;
    state.subtitle.capturedUrl = null;
    logger.info('YouTubeSubtitleService', '字幕服务已重置');
  }
}

// 创建全局单例
export const youtubeSubtitleService = new YouTubeSubtitleService();
export default youtubeSubtitleService;
