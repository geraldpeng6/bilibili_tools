/**
 * 状态管理模块
 * 集中管理应用的所有状态，解决全局变量散乱和竞态条件问题
 */

import { BALL_STATUS } from '../constants.js';
import { generateCacheKey, validateVideoInfo } from '../utils/validators.js';
import eventBus from '../utils/EventBus.js';
import { EVENTS } from '../constants.js';
import taskManager from '../utils/TaskManager.js';
import logger from '../utils/DebugLogger.js';

class StateManager {
  constructor() {
    this.reset();
  }

  /**
   * 重置所有状态
   * 解决"状态重置不完整"的问题
   */
  reset() {
    // 字幕相关状态
    this.subtitle = {
      data: null,                    // 当前字幕数据
      cache: {},                     // 字幕缓存 {videoKey: subtitleData}
      capturedUrl: null,             // 捕获到的字幕URL
    };

    // 请求相关状态（解决竞态条件）
    this.request = {
      isRequesting: false,           // 是否正在请求
      currentRequestKey: null,       // 当前请求的视频key
      requestPromise: null,          // 当前请求的Promise
      abortController: null,         // 用于取消请求
    };

    // AI相关状态
    this.ai = {
      isSummarizing: false,          // 是否正在生成总结
      currentSummary: null,          // 当前总结内容
      summaryPromise: null,          // 总结Promise
      abortController: null,         // 用于取消AI总结
    };

    // Notion相关状态
    this.notion = {
      isSending: false,              // 是否正在发送
      sendPromise: null,             // 发送Promise
      pageIds: {},                   // 视频对应的Notion页面ID {bvid: pageId}
    };

    // UI相关状态
    this.ui = {
      ballStatus: BALL_STATUS.IDLE,  // 小球状态
      panelVisible: false,           // 面板是否可见
      isDragging: false,             // 是否正在拖拽
      dragStart: { x: 0, y: 0 },     // 拖拽起始位置
      panelStart: { x: 0, y: 0 },    // 面板起始位置
    };

    // 视频相关状态
    this.video = {
      bvid: null,                    // 当前视频BV号
      cid: null,                     // 当前视频CID
      aid: null,                     // 当前视频AID
      p: null,                        // 当前视频分P号（多P视频）
    };
  }

  /**
   * 更新视频信息
   * @param {{bvid: string, cid: string|number, aid: string|number, p: number}} videoInfo
   */
  setVideoInfo(videoInfo) {
    const validation = validateVideoInfo(videoInfo);
    if (!validation.valid) {
      return false;
    }
    
    // 检测视频切换（包括不同分P的切换）
    const oldBvid = this.video.bvid;
    const oldP = this.video.p || 1;
    const newBvid = videoInfo.bvid;
    const newP = videoInfo.p || 1;
    
    // 如果BV号不同，或者同一个视频但分P不同，都视为视频切换
    if (oldBvid && (oldBvid !== newBvid || oldP !== newP)) {
      logger.info('StateManager', `检测到视频切换: ${oldBvid}-P${oldP} -> ${newBvid}-P${newP}`);
      
      // 取消旧视频的所有运行中任务
      const oldVideoKey = generateCacheKey({ bvid: oldBvid, cid: this.video.cid, p: oldP });
      taskManager.cancelVideoTasks(oldVideoKey);
      
      // 发送视频切换事件
      eventBus.emit(EVENTS.VIDEO_CHANGED, {
        oldBvid,
        newBvid,
        oldP,
        newP,
        oldVideoInfo: { ...this.video },
        newVideoInfo: videoInfo
      });
    }

    this.video.bvid = videoInfo.bvid;
    this.video.cid = videoInfo.cid;
    this.video.aid = videoInfo.aid;
    this.video.p = videoInfo.p || 1;

    return true;
  }

  /**
   * 获取当前视频信息
   * @returns {{bvid: string, cid: string|number, aid: string|number, p: number}}
   */
  getVideoInfo() {
    return { ...this.video };
  }

  /**
   * 生成当前视频的缓存键
   * @returns {string|null}
   */
  getVideoKey() {
    return generateCacheKey(this.video);
  }

  /**
   * 设置字幕数据（同时更新缓存）
   * @param {Array} data - 字幕数据
   * 注意：此方法只保存数据，不触发事件。事件应由SubtitleService统一触发，避免重复
   */
  setSubtitleData(data) {
    this.subtitle.data = data;
    
    // 更新缓存
    const videoKey = this.getVideoKey();
    if (videoKey) {
      this.subtitle.cache[videoKey] = data;
    }
    
    // 不再触发事件 - 避免重复触发（SubtitleService已经触发了）
    // 如果data存在，事件应由调用方（SubtitleService）触发
  }

  /**
   * 获取字幕数据（优先从缓存）
   * @param {string|null} videoKey - 视频键，不传则使用当前视频
   * @returns {Array|null}
   */
  getSubtitleData(videoKey = null) {
    const key = videoKey || this.getVideoKey();
    
    if (!key) {
      return this.subtitle.data;
    }
    
    // 优先从缓存获取
    if (this.subtitle.cache[key]) {
      return this.subtitle.cache[key];
    }
    
    // 如果是当前视频，返回当前数据
    if (key === this.getVideoKey()) {
      return this.subtitle.data;
    }
    
    return null;
  }

  /**
   * 开始请求（原子操作，解决竞态条件）
   * @returns {{success: boolean, reason: string|null}}
   */
  startRequest() {
    const videoKey = this.getVideoKey();
    
    if (!videoKey) {
      return { success: false, reason: '视频信息无效' };
    }

    // 检查是否正在请求相同的视频
    if (this.request.isRequesting && this.request.currentRequestKey === videoKey) {
      return { success: false, reason: '已有相同视频的请求在进行中' };
    }

    // 检查缓存
    if (this.subtitle.cache[videoKey]) {
      return { success: false, reason: '已有缓存' };
    }

    // 如果正在请求其他视频，取消旧请求
    if (this.request.isRequesting) {
      this.cancelRequest();
    }

    // 开始新请求
    this.request.isRequesting = true;
    this.request.currentRequestKey = videoKey;
    
    return { success: true, reason: null };
  }

  /**
   * 完成请求
   */
  finishRequest() {
    this.request.isRequesting = false;
    this.request.currentRequestKey = null;
    this.request.requestPromise = null;
    this.request.abortController = null;
  }

  /**
   * 取消当前请求
   */
  cancelRequest() {
    if (this.request.abortController) {
      this.request.abortController.abort();
    }
    this.finishRequest();
  }

  /**
   * 开始AI总结
   * @returns {boolean}
   */
  startAISummary() {
    if (this.ai.isSummarizing) {
      return false;
    }

    this.ai.isSummarizing = true;
    this.ai.abortController = new AbortController();
    
    return true;
  }

  /**
   * 完成AI总结
   * @param {Object|string} summary - 总结内容（新格式为对象，包含markdown和segments）
   */
  finishAISummary(summary) {
    this.ai.isSummarizing = false;
    this.ai.currentSummary = summary;
    this.ai.summaryPromise = null;
    this.ai.abortController = null;
    
    // 保存到sessionStorage
    const videoKey = this.getVideoKey();
    if (videoKey && summary) {
      // 如果是对象，则序列化为JSON字符串
      const summaryToStore = typeof summary === 'object' ? JSON.stringify(summary) : summary;
      sessionStorage.setItem(`ai-summary-${videoKey}`, summaryToStore);
    }
    
    eventBus.emit(EVENTS.AI_SUMMARY_COMPLETE, summary, videoKey);
  }

  /**
   * 取消AI总结
   */
  cancelAISummary() {
    if (this.ai.abortController) {
      this.ai.abortController.abort();
    }
    this.ai.isSummarizing = false;
    this.ai.summaryPromise = null;
    this.ai.abortController = null;
  }

  /**
   * 获取AI总结（优先从缓存）
   * @param {string|null} videoKey - 视频键
   * @returns {Object|string|null}
   */
  getAISummary(videoKey = null) {
    const key = videoKey || this.getVideoKey();
    
    if (!key) {
      return this.ai.currentSummary;
    }
    
    // 仞sessionStorage获取
    const cached = sessionStorage.getItem(`ai-summary-${key}`);
    if (cached) {
      // 尝试解析JSON，如果失败则返回原始字符串
      try {
        return JSON.parse(cached);
      } catch (e) {
        return cached;
      }
    }
    
    return null;
  }

  /**
   * 更新小球状态
   * @param {string} status - 状态值
   */
  setBallStatus(status) {
    if (this.ui.ballStatus !== status) {
      this.ui.ballStatus = status;
      eventBus.emit(EVENTS.UI_BALL_STATUS_CHANGE, status);
    }
  }

  /**
   * 获取小球状态
   * @returns {string}
   */
  getBallStatus() {
    return this.ui.ballStatus;
  }

  /**
   * 切换面板显示状态
   */
  togglePanel() {
    this.ui.panelVisible = !this.ui.panelVisible;
    eventBus.emit(EVENTS.UI_PANEL_TOGGLE, this.ui.panelVisible);
  }

  /**
   * 设置Notion页面ID
   * @param {string} videoKey - 视频键（包含分P信息）
   * @param {string} pageId - Notion页面ID
   */
  setNotionPageId(videoKey, pageId) {
    // videoKey 格式: BVxxxx-cid-p1
    this.notion.pageIds[videoKey] = pageId;
  }

  /**
   * 获取Notion页面ID
   * @param {string} videoKey - 视频键（包含分P信息）
   * @returns {string|null}
   */
  getNotionPageId(videoKey) {
    // videoKey 格式: BVxxxx-cid-p1
    return this.notion.pageIds[videoKey] || null;
  }

  /**
   * 设置面板显示状态
   * @param {boolean} visible
   */
  setPanelVisible(visible) {
    if (this.ui.panelVisible !== visible) {
      this.ui.panelVisible = visible;
      eventBus.emit(EVENTS.UI_PANEL_TOGGLE, visible);
    }
  }
}

// 创建全局单例
export const state = new StateManager();
export default state;

