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
import { subtitleCache, aiMarkdownCache, aiSegmentsCache, notionPageCache } from '../utils/LRUCache.js';

class StateManager {
  constructor() {
    this.reset();
  }

  /**
   * 重置所有状态
   * 解决"状态重置不完整"的问题
   * 注意：不清除LRU缓存，LRU缓存由LRUCache自动管理
   */
  reset() {
    // 字幕相关状态（移除cache字段，使用LRU缓存）
    this.subtitle = {
      data: null,                    // 当前字幕数据
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
   * 设置字幕数据
   * @param {Array} data - 字幕数据
   * 注意：此方法只保存数据到当前状态，不触发事件，不保存到LRU缓存
   * LRU缓存由SubtitleService统一管理
   */
  setSubtitleData(data) {
    this.subtitle.data = data;
    // 不再更新缓存 - 字幕缓存由SubtitleService通过LRU缓存管理
    // 不再触发事件 - 避免重复触发（SubtitleService已经触发了）
  }

  /**
   * 获取字幕数据
   * @param {string|null} videoKey - 视频键，不传则使用当前视频
   * @returns {Array|null}
   * 注意：如果需要从缓存获取，请直接使用 subtitleCache.get(videoKey)
   */
  getSubtitleData(videoKey = null) {
    // 如果指定了videoKey且不是当前视频，从LRU缓存获取
    if (videoKey && videoKey !== this.getVideoKey()) {
      return subtitleCache.get(videoKey);
    }
    
    // 返回当前视频的数据
    return this.subtitle.data;
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

    // 检查LRU缓存
    if (subtitleCache.has(videoKey)) {
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
   * 注意：AI总结缓存由AIService通过LRU缓存管理，这里只保存当前状态
   */
  finishAISummary(summary) {
    this.ai.isSummarizing = false;
    this.ai.currentSummary = summary;
    this.ai.summaryPromise = null;
    this.ai.abortController = null;
    
    // 不再保存到sessionStorage - AI总结由LRU缓存管理
    // 分别保存到aiMarkdownCache和aiSegmentsCache
    
    const videoKey = this.getVideoKey();
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
   * 获取AI总结
   * @param {string|null} videoKey - 视频键
   * @returns {Object|null}
   * 注意：如果需要从缓存获取，请直接使用 aiMarkdownCache 和 aiSegmentsCache
   */
  getAISummary(videoKey = null) {
    const key = videoKey || this.getVideoKey();
    
    if (!key) {
      return this.ai.currentSummary;
    }
    
    // 从LRU缓存获取
    const cachedMarkdown = aiMarkdownCache.get(key);
    const cachedSegments = aiSegmentsCache.get(key);
    
    // 如果都有缓存，组合返回
    if (cachedMarkdown && cachedSegments) {
      return {
        markdown: cachedMarkdown,
        segments: cachedSegments.segments || [],
        ads: cachedSegments.ads || []
      };
    }
    
    // 如果只有部分缓存，返回null（不完整）
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
   * 注意：同时保存到LRU缓存和sessionStorage
   */
  setNotionPageId(videoKey, pageId) {
    // videoKey 格式: BVxxxx-cid-p1
    this.notion.pageIds[videoKey] = pageId;
    
    // 同步到LRU缓存和sessionStorage
    if (pageId) {
      notionPageCache.set(videoKey, pageId);
      sessionStorage.setItem(`notion-page-${videoKey}`, pageId);
    } else {
      // 如果pageId为null，清除缓存
      notionPageCache.delete(videoKey);
      sessionStorage.removeItem(`notion-page-${videoKey}`);
    }
  }

  /**
   * 获取Notion页面ID
   * @param {string} videoKey - 视频键（包含分P信息）
   * @returns {string|null}
   * 注意：优先从LRU缓存获取
   */
  getNotionPageId(videoKey) {
    // videoKey 格式: BVxxxx-cid-p1
    
    // 1. 从LRU缓存获取
    const cachedPageId = notionPageCache.get(videoKey);
    if (cachedPageId) {
      return cachedPageId;
    }
    
    // 2. 从本地状态获取
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

