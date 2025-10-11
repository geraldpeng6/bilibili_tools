/**
 * SponsorBlock服务模块
 * 处理视频片段跳过、进度条标记、提示框等核心功能
 */

import { SPONSORBLOCK, SELECTORS } from '../constants.js';
import sponsorBlockConfig from '../config/SponsorBlockConfigManager.js';
import { formatTime } from '../utils/helpers.js';

/**
 * SponsorBlock API类
 * 负责API请求和缓存管理
 */
class SponsorBlockAPI {
  constructor() {
    this.cache = new Map();
    this.pendingRequests = new Map();
  }

  /**
   * 获取视频片段数据
   * @param {string} bvid - 视频BV号
   * @returns {Promise<Array>}
   */
  async fetchSegments(bvid) {
    // 检查缓存
    const cached = this.cache.get(bvid);
    if (cached && Date.now() - cached.timestamp < SPONSORBLOCK.CACHE_EXPIRY) {
      return cached.data;
    }

    // 检查是否有正在进行的请求
    if (this.pendingRequests.has(bvid)) {
      return this.pendingRequests.get(bvid);
    }

    const promise = new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: `${SPONSORBLOCK.API_URL}?videoID=${bvid}`,
        headers: {
          "origin": "userscript-bilibili-sponsor-skip",
          "x-ext-version": "1.0.0"
        },
        timeout: 5000,
        onload: (response) => {
          try {
            if (response.status === 404) {
              const result = [];
              this.cache.set(bvid, { data: result, timestamp: Date.now() });
              resolve(result);
            } else if (response.status === 200) {
              const data = JSON.parse(response.responseText);
              this.cache.set(bvid, { data, timestamp: Date.now() });
              resolve(data);
            } else if (response.status === 400) {
              console.error('[SponsorBlock] 参数错误 (400)');
              reject(new Error('Bad request'));
            } else if (response.status === 429) {
              console.error('[SponsorBlock] 请求频繁 (429)');
              reject(new Error('Rate limited'));
            } else {
              reject(new Error(`HTTP ${response.status}`));
            }
          } catch (error) {
            reject(error);
          }
        },
        onerror: reject,
        ontimeout: () => reject(new Error('Timeout'))
      });
    });

    this.pendingRequests.set(bvid, promise);
    promise.finally(() => {
      this.pendingRequests.delete(bvid);
    });

    return promise;
  }

  /**
   * 检查是否有片段
   * @param {string} bvid
   * @returns {boolean|null}
   */
  hasSegments(bvid) {
    const cached = this.cache.get(bvid);
    if (cached && Date.now() - cached.timestamp < SPONSORBLOCK.CACHE_EXPIRY) {
      return cached.data.length > 0;
    }
    return null;
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
  }
}

/**
 * 视频播放器控制器类
 * 负责片段跳过、进度条标记、提示框显示
 */
class VideoPlayerController {
  constructor(api, config) {
    this.api = api;
    this.config = config;
    this.video = null;
    this.segments = [];
    this.currentBVID = null;
    this.lastSkipTime = 0;
    this.checkInterval = null;
    this.currentPrompt = null;
    this.promptedSegments = new Set();
    this.ignoredSegments = new Set();
    this.progressBar = null;
    this.markerContainer = null;
    this.playerObserver = null;
  }

  /**
   * 初始化播放器控制器
   */
  async init() {
    // 检查是否在视频播放页
    if (!location.pathname.includes('/video/')) {
      return;
    }

    // 提取BVID
    this.currentBVID = location.pathname.match(/video\/(BV\w+)/)?.[1];
    if (!this.currentBVID) {
      return;
    }

    // 等待视频元素加载
    await this.waitForVideo();
    
    // 获取片段数据
    try {
      this.segments = await this.api.fetchSegments(this.currentBVID);
      
      if (this.segments.length > 0) {
        // 渲染进度条标记
        this.renderProgressMarkers();
      }
    } catch (error) {
      console.error('[SponsorBlock] 获取片段失败:', error);
      this.segments = [];
    }

    // 开始监听
    this.startMonitoring();
    
    // 添加播放器观察器
    this.setupPlayerObserver();
  }

  /**
   * 设置播放器观察器
   */
  setupPlayerObserver() {
    const playerContainer = document.querySelector('.bpx-player-video-wrap') || 
                           document.querySelector('.bpx-player-container');
    
    if (!playerContainer) return;

    this.playerObserver = new MutationObserver(() => {
      if (this.segments.length > 0 && !document.querySelector('#sponsorblock-preview-bar')) {
        this.renderProgressMarkers();
      }
    });

    this.playerObserver.observe(playerContainer, {
      childList: true,
      subtree: true
    });
  }

  /**
   * 等待视频元素加载
   */
  async waitForVideo() {
    return new Promise((resolve) => {
      const check = () => {
        this.video = document.querySelector(SELECTORS.VIDEO);
        if (this.video) {
          resolve();
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }

  /**
   * 渲染进度条标记
   */
  renderProgressMarkers() {
    if (!this.config.get('showProgressMarkers')) {
      return;
    }

    const tryRender = (retryCount = 0) => {
      const targetContainer = document.querySelector('.bpx-player-progress-schedule');
      
      if (!targetContainer) {
        if (retryCount < 10) {
          setTimeout(() => tryRender(retryCount + 1), 1000);
        }
        return;
      }

      this.progressBar = targetContainer;

      // 移除旧标记
      document.querySelectorAll('#sponsorblock-preview-bar').forEach(el => el.remove());

      // 创建标记容器
      this.markerContainer = document.createElement('ul');
      this.markerContainer.id = 'sponsorblock-preview-bar';
      
      targetContainer.prepend(this.markerContainer);

      // 等待视频时长
      if (this.video.duration && this.video.duration > 0) {
        this.createSegmentMarkers();
      } else {
        this.video.addEventListener('loadedmetadata', () => {
          this.createSegmentMarkers();
        }, { once: true });
      }
    };

    tryRender();
  }

  /**
   * 创建片段标记
   */
  createSegmentMarkers() {
    if (!this.markerContainer || !this.video.duration || this.video.duration <= 0) {
      return;
    }

    this.markerContainer.innerHTML = '';
    const videoDuration = this.video.duration;

    // 排序：长片段先渲染
    const sortedSegments = [...this.segments].sort((a, b) => {
      return (b.segment[1] - b.segment[0]) - (a.segment[1] - a.segment[0]);
    });

    // 为每个片段创建标记
    sortedSegments.forEach((segment, index) => {
      const startTime = Math.min(videoDuration, segment.segment[0]);
      const endTime = Math.min(videoDuration, segment.segment[1]);
      
      const leftPercent = (startTime / videoDuration) * 100;
      const rightPercent = (1 - endTime / videoDuration) * 100;

      const marker = document.createElement('li');
      marker.className = 'sponsorblock-segment';
      marker.dataset.segmentIndex = index.toString();
      
      const categoryInfo = SPONSORBLOCK.CATEGORIES[segment.category] || 
                         { name: segment.category, color: '#999' };
      
      marker.style.position = 'absolute';
      marker.style.left = `${leftPercent}%`;
      marker.style.right = `${rightPercent}%`;
      marker.style.backgroundColor = categoryInfo.color;

      const duration = endTime - startTime;
      marker.title = `${categoryInfo.name}\n${startTime.toFixed(1)}s - ${endTime.toFixed(1)}s (${duration.toFixed(1)}s)`;

      // 点击事件
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        this.showSegmentDetails(segment);
      });

      this.markerContainer.appendChild(marker);
    });
  }

  /**
   * 显示片段详情
   */
  showSegmentDetails(segment) {
    // 移除已有弹窗
    const existingPopup = document.querySelector('.segment-details-popup');
    if (existingPopup) {
      existingPopup.remove();
      document.querySelector('.segment-details-overlay')?.remove();
    }

    const categoryInfo = SPONSORBLOCK.CATEGORIES[segment.category] || 
                       { name: segment.category, color: '#999' };
    
    const duration = segment.segment[1] - segment.segment[0];
    const startTime = formatTime(segment.segment[0]);
    const endTime = formatTime(segment.segment[1]);

    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.className = 'segment-details-overlay';
    overlay.onclick = () => this.closeSegmentDetails();

    // 创建弹窗
    const popup = document.createElement('div');
    popup.className = 'segment-details-popup';
    popup.onclick = (e) => e.stopPropagation();

    popup.innerHTML = `
      <div class="segment-details-header">
        <div class="segment-details-title">
          <div style="width: 16px; height: 16px; background: ${categoryInfo.color}; border-radius: 3px;"></div>
          <span>${categoryInfo.name}</span>
        </div>
        <button class="segment-details-close">×</button>
      </div>
      <div class="segment-details-content">
        <div class="segment-details-row">
          <span class="segment-details-label">开始时间</span>
          <span class="segment-details-value">${startTime}</span>
        </div>
        <div class="segment-details-row">
          <span class="segment-details-label">结束时间</span>
          <span class="segment-details-value">${endTime}</span>
        </div>
        <div class="segment-details-row">
          <span class="segment-details-label">时长</span>
          <span class="segment-details-value">${duration.toFixed(1)} 秒</span>
        </div>
        <div class="segment-details-row">
          <span class="segment-details-label">投票数</span>
          <span class="segment-details-value">${segment.votes}</span>
        </div>
        <div class="segment-details-row">
          <span class="segment-details-label">UUID</span>
          <span class="segment-details-value" style="font-size: 11px; font-family: monospace;">${segment.UUID.substring(0, 20)}...</span>
        </div>
      </div>
      <div class="segment-details-actions">
        <button class="segment-details-btn segment-details-btn-secondary" data-action="close">
          关闭
        </button>
        <button class="segment-details-btn segment-details-btn-primary" data-action="jump">
          跳转到此片段
        </button>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(popup);

    // 绑定事件
    popup.querySelector('.segment-details-close').onclick = () => this.closeSegmentDetails();
    popup.querySelector('[data-action="close"]').onclick = () => this.closeSegmentDetails();
    popup.querySelector('[data-action="jump"]').onclick = () => {
      if (this.video) {
        this.video.currentTime = segment.segment[0];
      }
      this.closeSegmentDetails();
    };

    // Esc键关闭
    const keyHandler = (e) => {
      if (e.key === 'Escape') {
        this.closeSegmentDetails();
        document.removeEventListener('keydown', keyHandler);
      }
    };
    document.addEventListener('keydown', keyHandler);
  }

  /**
   * 关闭片段详情
   */
  closeSegmentDetails() {
    document.querySelector('.segment-details-popup')?.remove();
    document.querySelector('.segment-details-overlay')?.remove();
  }

  /**
   * 开始监控
   */
  startMonitoring() {
    if (!this.video) {
      return;
    }

    // 使用轮询方式检查
    this.checkInterval = setInterval(() => {
      this.checkAndSkip();
    }, 200);

    // 页面卸载时清理
    window.addEventListener('beforeunload', () => {
      if (this.checkInterval) {
        clearInterval(this.checkInterval);
      }
    });
  }

  /**
   * 检查并跳过
   */
  checkAndSkip() {
    if (!this.video || this.video.paused) {
      return;
    }

    const currentTime = this.video.currentTime;
    const skipCategories = this.config.get('skipCategories') || [];

    for (const segment of this.segments) {
      // 检查是否在片段范围内
      if (currentTime >= segment.segment[0] && currentTime < segment.segment[1]) {
        const segmentKey = `${segment.UUID}`;
        
        // 如果用户选择不跳过此片段，则忽略
        if (this.ignoredSegments.has(segmentKey)) {
          continue;
        }

        // 判断是否勾选了此类别
        if (skipCategories.includes(segment.category)) {
          // 自动跳过
          if (Date.now() - this.lastSkipTime < 1000) {
            continue;
          }

          const skipTo = segment.segment[1];
          this.video.currentTime = skipTo;
          this.lastSkipTime = Date.now();

          // 显示Toast提示
          this.showSkipToast(segment);
          break;
        } else {
          // 显示手动提示
          if (!this.promptedSegments.has(segmentKey)) {
            this.showSkipPrompt(segment);
            this.promptedSegments.add(segmentKey);
          }
          continue;
        }
      }
    }
  }

  /**
   * 显示跳过Toast
   */
  showSkipToast(segment) {
    const categoryInfo = SPONSORBLOCK.CATEGORIES[segment.category] || 
                       { name: segment.category, color: '#999' };
    
    const toast = document.createElement('div');
    toast.className = 'skip-toast';
    toast.textContent = `已跳过 ${categoryInfo.name}`;
    
    toast.addEventListener('click', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    
    toast.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
    });
    
    const playerContainer = document.querySelector('.bpx-player-video-wrap') || 
                           document.querySelector('.bpx-player-container') ||
                           document.body;
    playerContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('hiding');
      setTimeout(() => {
        toast.remove();
      }, 300);
    }, 3000);
  }

  /**
   * 显示跳过提示
   */
  showSkipPrompt(segment) {
    // 如果已有提示，先清理
    this.closePrompt();

    const categoryInfo = SPONSORBLOCK.CATEGORIES[segment.category] || 
                       { name: segment.category, color: '#999' };
    
    const prompt = document.createElement('div');
    prompt.className = 'skip-prompt';
    
    const duration = segment.segment[1] - segment.segment[0];
    const startTime = formatTime(segment.segment[0]);
    const endTime = formatTime(segment.segment[1]);
    
    prompt.innerHTML = `
      <div class="skip-prompt-header">
        <div class="skip-prompt-icon">
          <svg viewBox="0 0 24 24" fill="${categoryInfo.color}">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
        <div class="skip-prompt-message">
          跳过${categoryInfo.name}？<br>
          <small style="color: #999; font-size: 11px;">${startTime} - ${endTime}</small>
        </div>
        <button class="skip-prompt-close" title="关闭">×</button>
      </div>
      <div class="skip-prompt-buttons">
        <button class="skip-prompt-btn skip-prompt-btn-secondary" data-action="ignore">
          不跳过
        </button>
        <button class="skip-prompt-btn skip-prompt-btn-primary" data-action="skip">
          跳过 (${duration.toFixed(0)}秒)
        </button>
      </div>
    `;

    prompt.addEventListener('click', (e) => {
      e.stopPropagation();
    });
    
    prompt.addEventListener('mousedown', (e) => {
      e.stopPropagation();
    });

    const playerContainer = document.querySelector('.bpx-player-video-wrap') || 
                           document.querySelector('.bpx-player-container') ||
                           document.body;
    playerContainer.appendChild(prompt);
    this.currentPrompt = prompt;

    // 绑定事件
    const skipBtn = prompt.querySelector('[data-action="skip"]');
    const ignoreBtn = prompt.querySelector('[data-action="ignore"]');
    const closeBtn = prompt.querySelector('.skip-prompt-close');

    const handleSkip = () => {
      this.video.currentTime = segment.segment[1];
      this.lastSkipTime = Date.now();
      this.closePrompt();
    };

    const handleIgnore = () => {
      const segmentKey = `${segment.UUID}`;
      this.ignoredSegments.add(segmentKey);
      this.closePrompt();
    };

    const handleClose = () => {
      this.closePrompt();
    };

    skipBtn.onclick = handleSkip;
    ignoreBtn.onclick = handleIgnore;
    closeBtn.onclick = handleClose;

    // 键盘快捷键
    const keyHandler = (e) => {
      if (e.key === 'Enter') {
        handleSkip();
        document.removeEventListener('keydown', keyHandler);
      } else if (e.key === 'Escape') {
        handleClose();
        document.removeEventListener('keydown', keyHandler);
      }
    };
    document.addEventListener('keydown', keyHandler);

    // 片段结束后自动关闭提示
    const checkEnd = () => {
      if (this.video && this.video.currentTime >= segment.segment[1]) {
        this.closePrompt();
        clearInterval(endCheckInterval);
      }
    };
    const endCheckInterval = setInterval(checkEnd, 500);

    // 5秒后自动淡出关闭
    const autoCloseTimer = setTimeout(() => {
      if (this.currentPrompt === prompt) {
        this.closePrompt();
      }
    }, 5000);

    // 保存清理函数
    prompt._cleanup = () => {
      clearInterval(endCheckInterval);
      clearTimeout(autoCloseTimer);
      document.removeEventListener('keydown', keyHandler);
    };
  }

  /**
   * 关闭提示
   */
  closePrompt() {
    if (this.currentPrompt) {
      if (this.currentPrompt._cleanup) {
        this.currentPrompt._cleanup();
      }
      
      this.currentPrompt.classList.add('hiding');
      setTimeout(() => {
        if (this.currentPrompt) {
          this.currentPrompt.remove();
          this.currentPrompt = null;
        }
      }, 300);
    }
  }

  /**
   * 销毁控制器
   */
  destroy() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    this.closePrompt();
    this.closeSegmentDetails();
    
    if (this.markerContainer) {
      this.markerContainer.remove();
      this.markerContainer = null;
    }
    
    if (this.playerObserver) {
      this.playerObserver.disconnect();
      this.playerObserver = null;
    }
  }
}

/**
 * SponsorBlock服务类
 * 统一管理API和播放器控制器
 */
class SponsorBlockService {
  constructor() {
    this.api = new SponsorBlockAPI();
    this.playerController = null;
    this.currentURL = location.href;
  }

  /**
   * 初始化服务
   */
  async init() {
    // 初始化播放器控制器（仅视频页）
    if (location.pathname.includes('/video/')) {
      this.playerController = new VideoPlayerController(this.api, sponsorBlockConfig);
      await this.playerController.init();
    }

    // 监听URL变化
    this.setupURLMonitor();
  }

  /**
   * 设置URL监听
   */
  setupURLMonitor() {
    // 监听popstate事件
    window.addEventListener('popstate', () => {
      this.handleURLChange();
    });

    // 监听pushState和replaceState
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;

    history.pushState = (...args) => {
      originalPushState.apply(history, args);
      this.handleURLChange();
    };

    history.replaceState = (...args) => {
      originalReplaceState.apply(history, args);
      this.handleURLChange();
    };
  }

  /**
   * 处理URL变化
   */
  handleURLChange() {
    const newURL = location.href;
    if (newURL !== this.currentURL) {
      this.currentURL = newURL;
      
      // 清理旧的控制器
      this.playerController?.destroy();
      this.playerController = null;

      // 如果是视频页，重新初始化
      if (location.pathname.includes('/video/')) {
        setTimeout(async () => {
          this.playerController = new VideoPlayerController(this.api, sponsorBlockConfig);
          await this.playerController.init();
        }, 1000);
      }
    }
  }

  /**
   * 获取API实例
   */
  getAPI() {
    return this.api;
  }
}

// 创建全局单例
export const sponsorBlockService = new SponsorBlockService();
export default sponsorBlockService;

