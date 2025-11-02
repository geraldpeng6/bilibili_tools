/**
 * 字幕服务模块
 * 处理字幕获取、拦截、下载等逻辑
 */

import state from '../state/StateManager.js';
import logger from '../utils/DebugLogger.js';
import LogDecorator from '../utils/LogDecorator.js';
import eventBus from '../utils/EventBus.js';
import performanceMonitor from '../utils/PerformanceMonitor.js';
import { EVENTS, TIMING, SELECTORS, BALL_STATUS } from '../constants.js';
import { getVideoInfo, delay, downloadFile, getVideoTitle } from '../utils/helpers.js';
import { validateSubtitleData } from '../utils/validators.js';

class SubtitleService {
  constructor() {
    // 创建模块专用日志记录器
    this.log = LogDecorator.createModuleLogger('SubtitleService');
    this.interceptorSetup = false;  // 拦截器设置标志
    this.setupInterceptor();
  }

  /**
   * 设置字幕请求拦截器
   */
  setupInterceptor() {
    // 防止重复设置拦截器
    if (this.interceptorSetup) {
      logger.debug('SubtitleService', '拦截器已设置，跳过重复设置');
      return;
    }
    this.interceptorSetup = true;
    const originalOpen = unsafeWindow.XMLHttpRequest.prototype.open;
    const originalSend = unsafeWindow.XMLHttpRequest.prototype.send;

    unsafeWindow.XMLHttpRequest.prototype.open = function(method, url) {
      this._url = url;
      return originalOpen.apply(this, arguments);
    };

    unsafeWindow.XMLHttpRequest.prototype.send = function() {
      const xhr = this;
      
      if (xhr._url && xhr._url.includes('aisubtitle.hdslb.com')) {
        subtitleService.log.trace('拦截到字幕请求:', xhr._url);
        
        // 拦截响应数据而不是重新发送请求
        const originalOnLoad = xhr.onload;
        xhr.onload = function(event) {
          try {
            // 获取响应内容
            const responseText = xhr.responseText;
            if (responseText && xhr.status === 200) {
              subtitleService.log.debug('拦截到字幕响应数据');
              // 直接处理响应数据，避免重复请求
              subtitleService.processCapturedSubtitle(responseText);
            }
          } catch (error) {
            subtitleService.log.error('处理拦截的字幕响应失败:', error);
          }
          
          // 调用原始的onload
          if (originalOnLoad) {
            originalOnLoad.call(this, event);
          }
        };
      }
      
      return originalSend.apply(this, arguments);
    };
  }

  /**
   * 处理拦截到的字幕响应数据
   * @param {string} responseText - 响应文本
   */
  async processCapturedSubtitle(responseText) {
    // 性能监控：测量字幕处理耗时
    await performanceMonitor.measureAsync('字幕处理', async () => {
      const videoInfo = getVideoInfo();
      state.setVideoInfo(videoInfo);

      // 检查缓存：如果已有字幕缓存，直接使用缓存，不处理新请求
      const videoKey = state.getVideoKey();
      if (videoKey) {
        const cachedSubtitle = state.getSubtitleData(videoKey);
        if (cachedSubtitle && cachedSubtitle.length > 0) {
          this.log.info('检测到字幕缓存，跳过拦截处理，直接使用缓存');
          state.setSubtitleData(cachedSubtitle);
          state.setBallStatus(BALL_STATUS.ACTIVE);
          eventBus.emit(EVENTS.SUBTITLE_LOADED, cachedSubtitle, videoKey);
          return;
        }
      }

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
        // 解析响应数据
        const data = JSON.parse(responseText);
        
        if (!data.body || data.body.length === 0) {
          throw new Error('字幕内容为空');
        }
        
        const subtitleData = data.body;
        
        // 验证字幕数据
        const validation = validateSubtitleData(subtitleData);
        if (!validation.valid) {
          if (validation.details) {
            logger.error('SubtitleService', '验证详情:', validation.details);
          }
          throw new Error(validation.error);
        }
        
        this.log.success(`字幕捕获成功，共 ${subtitleData.length} 条`);
        this.log.trace('字幕数据示例:', subtitleData.slice(0, 3));

        // 保存字幕数据（自动更新缓存）
        state.setSubtitleData(subtitleData);
        state.setBallStatus(BALL_STATUS.ACTIVE);
        
        // 触发字幕加载完成事件，通知UI更新
        eventBus.emit(EVENTS.SUBTITLE_LOADED, subtitleData, state.getVideoKey());

      } catch (error) {
        this.log.error('字幕下载失败:', error);
        this.log.error('错误详情:', {
          message: error.message,
          stack: error.stack,
          videoInfo: getVideoInfo()
        });
        state.setBallStatus(BALL_STATUS.ERROR);
        eventBus.emit(EVENTS.SUBTITLE_FAILED, error.message);
      } finally {
        state.finishRequest();
      }
    });
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
          'Referer': `https://www.bilibili.com/video/${videoInfo.bvid}/${videoInfo.p && videoInfo.p > 1 ? `?p=${videoInfo.p}` : ''}`,
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'cross-site',
          'User-Agent': navigator.userAgent
        },
        anonymous: false,
        onload: (response) => {
          // 验证视频是否切换（包括分P切换）
          const currentVideoInfo = getVideoInfo();
          if (currentVideoInfo.bvid !== videoInfo.bvid || 
              currentVideoInfo.cid !== videoInfo.cid || 
              currentVideoInfo.p !== videoInfo.p) {
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
    // 检查缓存：如果已有字幕缓存，直接返回，不触发按钮
    const videoKey = state.getVideoKey();
    if (videoKey) {
      const cachedSubtitle = state.getSubtitleData(videoKey);
      if (cachedSubtitle && cachedSubtitle.length > 0) {
        this.log.info('检测到字幕缓存，跳过按钮触发和拦截操作');
        state.setSubtitleData(cachedSubtitle); // 设置当前字幕数据
        state.setBallStatus(BALL_STATUS.ACTIVE);
        eventBus.emit(EVENTS.SUBTITLE_LOADED, cachedSubtitle, videoKey);
        return true;
      }
    }

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
    // 检查缓存：如果已有字幕缓存，直接返回，不触发按钮
    const videoKey = state.getVideoKey();
    if (videoKey) {
      const cachedSubtitle = state.getSubtitleData(videoKey);
      if (cachedSubtitle && cachedSubtitle.length > 0) {
        this.log.info('检测到字幕缓存，跳过字幕按钮触发');
        state.setSubtitleData(cachedSubtitle); // 设置当前字幕数据
        state.setBallStatus(BALL_STATUS.ACTIVE);
        eventBus.emit(EVENTS.SUBTITLE_LOADED, cachedSubtitle, videoKey);
        return;
      }
    }

    await delay(TIMING.SUBTITLE_ACTIVATION_DELAY);

    // 延迟后再次检查：拦截器可能已经在延迟期间捕获了字幕
    const videoKeyAfterDelay = state.getVideoKey();
    if (videoKeyAfterDelay) {
      const cachedSubtitleAfterDelay = state.getSubtitleData(videoKeyAfterDelay);
      if (cachedSubtitleAfterDelay && cachedSubtitleAfterDelay.length > 0) {
        this.log.info('延迟后检测到字幕数据（拦截器已捕获），跳过按钮触发');
        state.setSubtitleData(cachedSubtitleAfterDelay);
        state.setBallStatus(BALL_STATUS.ACTIVE);
        eventBus.emit(EVENTS.SUBTITLE_LOADED, cachedSubtitleAfterDelay, videoKeyAfterDelay);
        return;
      }
    }

    // 如果还没有捕获到字幕，尝试触发字幕选择
    // 注意：字幕响应会在拦截器中自动处理，不需要手动调用
    if (!state.getSubtitleData()) {
      this.triggerSubtitleSelection();
    }
  }

  /**
   * 触发字幕选择
   */
  async triggerSubtitleSelection() {
    // 再次检查：拦截器可能已经捕获了字幕（竞态条件保护）
    const videoKey = state.getVideoKey();
    if (videoKey) {
      const cachedSubtitle = state.getSubtitleData(videoKey);
      if (cachedSubtitle && cachedSubtitle.length > 0) {
        this.log.info('触发字幕选择前检测到字幕数据（拦截器已捕获），跳过按钮点击');
        state.setSubtitleData(cachedSubtitle);
        state.setBallStatus(BALL_STATUS.ACTIVE);
        eventBus.emit(EVENTS.SUBTITLE_LOADED, cachedSubtitle, videoKey);
        return;
      }
    }

    const subtitleResultBtn = document.querySelector(SELECTORS.SUBTITLE_BUTTON);

    if (!subtitleResultBtn) {
      state.setBallStatus(BALL_STATUS.NO_SUBTITLE);
      return;
    }

    // 点击字幕按钮
    subtitleResultBtn.click();

    await delay(TIMING.MENU_OPEN_DELAY);

    // 点击按钮后再次检查：拦截器可能在点击时捕获了字幕
    const videoKeyAfterClick = state.getVideoKey();
    if (videoKeyAfterClick) {
      const cachedSubtitleAfterClick = state.getSubtitleData(videoKeyAfterClick);
      if (cachedSubtitleAfterClick && cachedSubtitleAfterClick.length > 0) {
        this.log.info('点击按钮后检测到字幕数据（拦截器已捕获），跳过后续操作');
        // 关闭菜单（如果已打开）
        const closeBtn = document.querySelector(SELECTORS.SUBTITLE_CLOSE_SWITCH);
        if (closeBtn) {
          closeBtn.click();
        }
        state.setSubtitleData(cachedSubtitleAfterClick);
        state.setBallStatus(BALL_STATUS.ACTIVE);
        eventBus.emit(EVENTS.SUBTITLE_LOADED, cachedSubtitleAfterClick, videoKeyAfterClick);
        return;
      }
    }

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
      
      // 检查拦截器是否已经捕获了字幕数据（而不是URL）
      const videoKeyAfterWait = state.getVideoKey();
      if (videoKeyAfterWait) {
        const cachedSubtitleAfterWait = state.getSubtitleData(videoKeyAfterWait);
        if (cachedSubtitleAfterWait && cachedSubtitleAfterWait.length > 0) {
          this.log.info('等待后检测到字幕数据（拦截器已捕获），跳过URL检查');
          state.setSubtitleData(cachedSubtitleAfterWait);
          state.setBallStatus(BALL_STATUS.ACTIVE);
          eventBus.emit(EVENTS.SUBTITLE_LOADED, cachedSubtitleAfterWait, videoKeyAfterWait);
          return;
        }
      }
      
      if (this.capturedSubtitleUrl) {
        this.downloadCapturedSubtitle();
      } else {
        const errorMsg = '字幕激活失败：未捕获到字幕URL';
        this.log.error(errorMsg);
        this.log.error('错误详情:', {
          videoInfo: getVideoInfo(),
          subtitleButton: !!subtitleResultBtn,
          chineseOption: !!chineseOption,
          hasSubtitleData: !!state.getSubtitleData()
        });
        state.setBallStatus(BALL_STATUS.ERROR);
        eventBus.emit(EVENTS.SUBTITLE_FAILED, errorMsg);
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
        
        // 检查拦截器是否已经捕获了字幕数据
        const videoKeyAfterFirstOption = state.getVideoKey();
        if (videoKeyAfterFirstOption) {
          const cachedSubtitleAfterFirstOption = state.getSubtitleData(videoKeyAfterFirstOption);
          if (cachedSubtitleAfterFirstOption && cachedSubtitleAfterFirstOption.length > 0) {
            this.log.info('选择第一个选项后检测到字幕数据（拦截器已捕获），跳过URL检查');
            state.setSubtitleData(cachedSubtitleAfterFirstOption);
            state.setBallStatus(BALL_STATUS.ACTIVE);
            eventBus.emit(EVENTS.SUBTITLE_LOADED, cachedSubtitleAfterFirstOption, videoKeyAfterFirstOption);
            return;
          }
        }
        
        if (this.capturedSubtitleUrl) {
          this.downloadCapturedSubtitle();
        } else {
          const errorMsg = '字幕激活失败：选择第一个选项后未捕获到字幕URL';
          this.log.error(errorMsg);
          this.log.error('错误详情:', {
            videoInfo: getVideoInfo(),
            subtitleButton: !!subtitleResultBtn,
            firstOption: !!firstOption,
            hasSubtitleData: !!state.getSubtitleData()
          });
          state.setBallStatus(BALL_STATUS.ERROR);
          eventBus.emit(EVENTS.SUBTITLE_FAILED, errorMsg);
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
export const subtitleService = new SubtitleService();
export default subtitleService;

