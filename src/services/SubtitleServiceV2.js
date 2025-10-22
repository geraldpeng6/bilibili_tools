/**
 * 字幕服务模块（重构版）
 * 使用BaseService基类，减少代码重复
 */

import BaseService from './BaseService.js';
import RequestFactory from './RequestFactory.js';
import state from '../state/StateManager.js';
import logger from '../utils/DebugLogger.js';
import eventBus from '../utils/EventBus.js';
import performanceMonitor from '../utils/PerformanceMonitor.js';
import { EVENTS, TIMING, SELECTORS, BALL_STATUS } from '../constants.js';
import { getVideoInfo, delay, downloadFile, getVideoTitle } from '../utils/helpers.js';
import { validateSubtitleData } from '../utils/validators.js';

class SubtitleServiceV2 extends BaseService {
  constructor() {
    super('SubtitleService');
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

    await performanceMonitor.measureAsync('字幕下载', async () => {
      const videoInfo = getVideoInfo();
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
      state.setBallStatus(BALL_STATUS.LOADING);
      eventBus.emit(EVENTS.SUBTITLE_REQUESTED, videoInfo);

      try {
        const subtitleData = await this.fetchSubtitle(this.capturedSubtitleUrl, videoInfo);
        
        // 验证数据
        this.validateData(subtitleData);
        
        // 保存数据
        state.setSubtitleData(subtitleData);
        state.setBallStatus(BALL_STATUS.ACTIVE);
        eventBus.emit(EVENTS.SUBTITLE_LOADED, subtitleData, state.getVideoKey());

      } catch (error) {
        this.handleDownloadError(error);
      } finally {
        state.finishRequest();
      }
    });
  }

  /**
   * 获取字幕内容
   * @private
   */
  async fetchSubtitle(url, videoInfo) {
    const config = RequestFactory.createSubtitleRequest(url, videoInfo);
    
    const data = await this.request({
      ...config,
      validateResponse: (response) => {
        // 检查视频是否切换
        const currentVideoInfo = getVideoInfo();
        if (currentVideoInfo.bvid !== videoInfo.bvid || currentVideoInfo.cid !== videoInfo.cid) {
          throw new Error('视频已切换');
        }

        // 检查是否返回HTML
        if (response.responseText?.trim().startsWith('<!DOCTYPE') || 
            response.responseText?.trim().startsWith('<html')) {
          throw new Error('服务器返回HTML而非JSON，可能被重定向');
        }

        return true;
      }
    });

    if (!data.body || data.body.length === 0) {
      throw new Error('字幕内容为空');
    }

    return data.body;
  }

  /**
   * 验证字幕数据
   * @private
   */
  validateData(subtitleData) {
    const validation = validateSubtitleData(subtitleData);
    if (!validation.valid) {
      logger.error(this.serviceName, '字幕验证失败:', validation.error);
      if (validation.details) {
        logger.error(this.serviceName, '验证详情:', validation.details);
      }
      throw new Error(validation.error);
    }
  }

  /**
   * 使用缓存的字幕数据
   * @private
   */
  useCachedData() {
    const cachedData = state.getSubtitleData();
    if (cachedData) {
      state.setBallStatus(BALL_STATUS.ACTIVE);
      eventBus.emit(EVENTS.SUBTITLE_LOADED, cachedData, state.getVideoKey());
      logger.info(this.serviceName, '使用缓存的字幕数据');
    }
  }

  /**
   * 处理下载错误
   * @private
   */
  handleDownloadError(error) {
    logger.error(this.serviceName, '字幕获取失败:', error);
    state.setBallStatus(BALL_STATUS.ERROR);
    eventBus.emit(EVENTS.SUBTITLE_FAILED, error.message);
  }

  /**
   * 检测字幕按钮
   */
  async checkSubtitleButton() {
    const maxAttempts = TIMING.CHECK_MAX_ATTEMPTS;
    const interval = TIMING.CHECK_SUBTITLE_INTERVAL;
    
    for (let i = 0; i < maxAttempts; i++) {
      const subtitleButton = document.querySelector(SELECTORS.SUBTITLE_BUTTON);
      
      if (subtitleButton) {
        await this.tryActivateSubtitle();
        return true;
      }
      
      await delay(interval);
    }
    
    state.setBallStatus(BALL_STATUS.NO_SUBTITLE);
    return false;
  }

  /**
   * 尝试激活字幕
   */
  async tryActivateSubtitle() {
    await delay(TIMING.SUBTITLE_ACTIVATION_DELAY);

    if (this.capturedSubtitleUrl) {
      this.downloadCapturedSubtitle();
    } else {
      await this.triggerSubtitleSelection();
    }
  }

  /**
   * 触发字幕选择
   */
  async triggerSubtitleSelection() {
    const subtitleBtn = document.querySelector(SELECTORS.SUBTITLE_BUTTON);
    if (!subtitleBtn) {
      state.setBallStatus(BALL_STATUS.NO_SUBTITLE);
      return;
    }

    // 点击字幕按钮
    subtitleBtn.click();
    await delay(TIMING.MENU_OPEN_DELAY);

    // 查找并选择中文字幕
    const chineseOption = this.findChineseOption();
    
    if (chineseOption) {
      await this.selectSubtitleOption(chineseOption);
    } else {
      // 尝试第一个选项
      const firstOption = document.querySelector('.bpx-player-ctrl-subtitle-language-item');
      if (firstOption) {
        await this.selectSubtitleOption(firstOption);
      } else {
        subtitleBtn.click(); // 关闭菜单
        state.setBallStatus(BALL_STATUS.NO_SUBTITLE);
      }
    }
  }

  /**
   * 查找中文字幕选项
   * @private
   */
  findChineseOption() {
    // 优先查找AI中文
    let option = document.querySelector('.bpx-player-ctrl-subtitle-language-item[data-lan="ai-zh"]');
    
    if (!option) {
      // 查找其他中文选项
      option = document.querySelector('.bpx-player-ctrl-subtitle-language-item[data-lan*="zh"]');
    }
    
    if (!option) {
      // 通过文本内容查找
      const allOptions = document.querySelectorAll('.bpx-player-ctrl-subtitle-language-item');
      for (let opt of allOptions) {
        const text = opt.querySelector('.bpx-player-ctrl-subtitle-language-item-text');
        if (text && text.textContent.includes('中文')) {
          option = opt;
          break;
        }
      }
    }
    
    return option;
  }

  /**
   * 选择字幕选项
   * @private
   */
  async selectSubtitleOption(option) {
    option.click();
    
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
   * 重置状态
   */
  reset() {
    this.capturedSubtitleUrl = null;
    state.subtitle.capturedUrl = null;
    logger.info(this.serviceName, '字幕服务已重置');
  }
}

// 创建全局单例
export const subtitleService = new SubtitleServiceV2();
export default subtitleService;
