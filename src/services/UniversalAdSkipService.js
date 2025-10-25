/**
 * 通用广告跳过服务
 * 支持多平台的广告检测和跳过功能
 */

import YouTubeAdapter from './adapters/YouTubeAdapter.js';
import BilibiliAdapter from './adapters/BilibiliAdapter.js';
import DeArrowAPI from './DeArrowAPI.js';
import logger from '../utils/DebugLogger.js';

export default class UniversalAdSkipService {
  constructor(config) {
    this.config = config;
    this.adapter = null;
    this.deArrowAPI = new DeArrowAPI();
    this.segments = [];
    this.nativeAdMarkers = [];
    this.skipHistory = new Set();
    this.ignoredSegments = new Set();
    this.isMonitoring = false;
    this.monitoringInterval = null;
    this.lastSkipTime = 0;
    this.currentVideoId = null;
    
    // 缓存机制
    this.segmentsCache = new Map(); // 缓存已获取的段落
    this.cacheTimeout = 1800000; // 30分钟缓存有效期
    this.lastNativeAdCheck = 0; // 上次原生广告检测时间
    this.nativeAdCheckInterval = 5000; // 原生广告检测间隔（5秒）
    
    // 配置选项
    this.options = {
      autoSkip: config.get('autoSkip') !== false,
      skipCategories: config.get('skipCategories') || ['sponsor', 'selfpromo'],
      showNotifications: config.get('showNotifications') !== false,
      showProgressMarkers: config.get('showProgressMarkers') !== false,
      detectNativeAds: config.get('detectNativeAds') !== false,
      skipDelay: config.get('skipDelay') || 0,
      muteInsteadOfSkip: config.get('muteInsteadOfSkip') || false
    };
  }

  /**
   * 初始化服务
   */
  async init() {
    // 检测当前平台并创建对应的适配器
    // 尝试多种方式检测真实的页面 URL
    let realHostname = location.hostname;
    try {
      // 尝试获取顶层窗口的 hostname，如果有权限的话
      if (window.top && window.top !== window) {
        realHostname = window.top.location.hostname;
      }
    } catch (e) {
      // 跨域访问会抛出异常，使用当前 hostname
      logger.debug('UniversalAdSkipService', '无法访问 top window，使用当前 hostname');
    }
    
    // 检查是否通过 URL 参数或其他方式能检测到实际网站
    // Tampermonkey/Violentmonkey 通常会保留原始 URL 信息
    const urlParams = new URLSearchParams(window.location.search);
    const referrer = document.referrer;
    
    logger.debug('UniversalAdSkipService', `检测平台 - hostname: ${realHostname}, referrer: ${referrer}`);
    
    // 更宽松的检测逻辑
    const isYouTube = realHostname.includes('youtube.com') || 
                      referrer.includes('youtube.com') ||
                      document.querySelector('ytd-app') !== null;
                      
    const isBilibili = realHostname.includes('bilibili.com') || 
                       referrer.includes('bilibili.com') ||
                       document.querySelector('.bili-header') !== null ||
                       document.querySelector('.bpx-player-container') !== null;
    
    if (isYouTube) {
      this.adapter = new YouTubeAdapter();
      logger.debug('UniversalAdSkipService', '创建YouTube适配器');
    } else if (isBilibili) {
      this.adapter = new BilibiliAdapter();
      logger.debug('UniversalAdSkipService', '创建Bilibili适配器');
    } else {
      logger.debug('UniversalAdSkipService', `无法检测到支持的网站，跳过初始化`);
      return;
    }

    // 检查是否在视频页面
    if (!this.adapter.isVideoPage()) {
      logger.debug('UniversalAdSkipService', '不是视频页面，跳过初始化');
      return;
    }

    // 获取视频ID
    this.currentVideoId = this.adapter.getVideoId();
    if (!this.currentVideoId) {
      logger.warn('UniversalAdSkipService', '无法获取视频ID');
      return;
    }

    logger.info('UniversalAdSkipService', `初始化: ${this.adapter.platform} - ${this.currentVideoId}`);

    // 等待视频加载
    await this.adapter.waitForVideo();

    // 加载广告段落
    await this.loadSegments();

    // 开始监控
    this.startMonitoring();

    // 监听URL变化
    this.setupUrlMonitor();
    
    // 定期清理缓存（每10分钟）
    if (!this.cacheCleanupInterval) {
      this.cacheCleanupInterval = setInterval(() => {
        this.cleanupCache();
      }, 600000); // 10分钟
    }
  }

  /**
   * 加载广告段落
   */
  async loadSegments() {
    // 检查缓存
    const cacheKey = `${this.adapter?.platform}_${this.currentVideoId}`;
    const cached = this.segmentsCache.get(cacheKey);
    const now = Date.now();
    
    // 如果有有效缓存，直接使用
    if (cached && (now - cached.timestamp < this.cacheTimeout)) {
      logger.debug('UniversalAdSkipService', `使用缓存的广告段落 (${cached.segments.length} 个)`);
      this.segments = [...cached.segments]; // 使用副本避免修改缓存
      
      // 显示进度条标记
      if (this.options.showProgressMarkers && this.segments.length > 0) {
        await this.showProgressMarkers();
      }
      return;
    }
    
    this.segments = [];
    
    // 添加调试日志
    logger.debug('UniversalAdSkipService', `获取广告段落 - 平台: ${this.adapter?.platform}, 视频ID: ${this.currentVideoId}`);
    
    // 对于YouTube，从DeArrow API获取社区段落
    if (this.adapter?.platform === 'youtube') {
      try {
        const communitySegments = await this.deArrowAPI.getSegments(
          this.currentVideoId, 
          this.options.skipCategories
        );
        this.segments = this.segments.concat(communitySegments);
        logger.info('UniversalAdSkipService', `加载了 ${communitySegments.length} 个社区广告段落`);
      } catch (error) {
        logger.error('UniversalAdSkipService', '加载社区段落失败:', error);
      }

      // 检测原生广告标记（带频率限制）
      if (this.options.detectNativeAds) {
        this.detectNativeAds();
      }
    }
    
    // 对于Bilibili，从SponsorBlock API获取段落
    else if (this.adapter?.platform === 'bilibili') {
      try {
        const bilibiliSegments = await this.fetchBilibiliSegments(this.currentVideoId);
        this.segments = this.segments.concat(bilibiliSegments);
        logger.info('UniversalAdSkipService', `加载了 ${bilibiliSegments.length} 个Bilibili广告段落`);
      } catch (error) {
        logger.error('UniversalAdSkipService', '加载Bilibili段落失败:', error);
      }
    }
    
    // 缓存结果（不包含原生广告，因为它们是动态的）
    const nonNativeSegments = this.segments.filter(s => !s.isNative);
    this.segmentsCache.set(cacheKey, {
      segments: nonNativeSegments,
      timestamp: now
    });

    // 显示进度条标记
    if (this.options.showProgressMarkers && this.segments.length > 0) {
      await this.showProgressMarkers();
    }
  }

  /**
   * 获取Bilibili广告段落
   */
  async fetchBilibiliSegments(bvid) {
    // 复用现有的SponsorBlock API，传递categories参数
    const categories = this.options.skipCategories || ['sponsor', 'intro', 'outro', 'selfpromo'];
    const categoryParams = categories.map(c => `category=${encodeURIComponent(c)}`).join('&');
    
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: `https://sponsor.ajay.app/api/skipSegments?videoID=${encodeURIComponent(bvid)}&${categoryParams}`,
        headers: {
          "origin": "userscript-bilibili-sponsor-skip",
          "x-ext-version": "1.0.0"
        },
        timeout: 10000,
        onload: (response) => {
          if (response.status === 200) {
            try {
              const data = JSON.parse(response.responseText);
              resolve(data);
            } catch (e) {
              resolve([]);
            }
          } else {
            resolve([]);
          }
        },
        onerror: () => resolve([]),
        ontimeout: () => resolve([])
      });
    });
  }

  /**
   * 检测YouTube原生广告
   */
  detectNativeAds() {
    if (this.adapter.platform !== 'youtube') return;
    
    // 频率限制：避免太频繁的检测
    const now = Date.now();
    if (now - this.lastNativeAdCheck < this.nativeAdCheckInterval) {
      return;
    }
    this.lastNativeAdCheck = now;

    // 初始检测
    const markers = this.adapter.detectNativeAdMarkers();
    
    // 比较是否有变化（避免重复日志）
    const markersChanged = JSON.stringify(markers) !== JSON.stringify(this.nativeAdMarkers);
    
    if (markersChanged) {
      this.nativeAdMarkers = markers;
      
      if (markers.length > 0) {
        logger.info('UniversalAdSkipService', `检测到 ${markers.length} 个原生广告标记`);
      }
      
      // 移除旧的原生广告段落
      this.segments = this.segments.filter(s => !s.isNative);
      
      // 将原生广告标记转换为段落格式
      markers.forEach((marker, index) => {
        this.segments.push({
          UUID: `native-ad-${index}`,
          segment: [marker.start, marker.end],
          start: marker.start,
          end: marker.end,
          category: 'sponsor',
          actionType: 'skip',
          description: '原生广告',
          isNative: true
        });
      });
      
      // 更新进度条标记
      if (this.options.showProgressMarkers) {
        this.showProgressMarkers();
      }
    }

    // 只设置一次监听器
    if (!this.adObserverSetup) {
      this.adObserverSetup = true;
      
      // 使用防抖来限制更新频率
      let updateTimer = null;
      this.adapter.observeAdChanges((newMarkers) => {
        clearTimeout(updateTimer);
        updateTimer = setTimeout(() => {
          const changed = JSON.stringify(newMarkers) !== JSON.stringify(this.nativeAdMarkers);
          
          if (changed) {
            this.nativeAdMarkers = newMarkers;
            
            // 只在有实际变化时记录
            if (newMarkers.length > 0 || this.segments.some(s => s.isNative)) {
              logger.debug('UniversalAdSkipService', `广告标记变化: ${newMarkers.length} 个`);
            }
            
            // 移除旧的原生广告段落
            this.segments = this.segments.filter(s => !s.isNative);
            
            // 添加新的原生广告段落
            newMarkers.forEach((marker, index) => {
              this.segments.push({
                UUID: `native-ad-${index}`,
                segment: [marker.start, marker.end],
                start: marker.start,
                end: marker.end,
                category: 'sponsor',
                actionType: 'skip',
                description: '原生广告',
                isNative: true
              });
            });
            
            // 更新进度条标记
            if (this.options.showProgressMarkers) {
              this.showProgressMarkers();
            }
          }
        }, 500); // 500ms防抖延迟
      });
    }
  }

  /**
   * 显示进度条标记
   */
  async showProgressMarkers() {
    // 等待进度条加载
    await this.adapter.waitForProgressBar();

    // 根据平台使用不同的样式
    const options = this.adapter.platform === 'youtube' ? {
      containerId: 'universal-ad-markers',
      className: 'universal-ad-marker',
      color: '#ff0000',
      opacity: 0.6
    } : {
      containerId: 'sponsorblock-preview-bar',
      className: 'sponsorblock-segment',
      opacity: 0.7
    };

    // 添加标记
    this.adapter.addProgressMarkers(this.segments, options);
  }

  /**
   * 开始监控播放进度
   */
  startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    
    // 使用requestAnimationFrame获得更流畅的性能
    const monitor = () => {
      if (!this.isMonitoring) return;
      
      this.checkAndSkipAds();
      requestAnimationFrame(monitor);
    };
    
    requestAnimationFrame(monitor);
    logger.info('UniversalAdSkipService', '开始监控广告');
  }

  /**
   * 停止监控
   */
  stopMonitoring() {
    this.isMonitoring = false;
    logger.info('UniversalAdSkipService', '停止监控');
  }

  /**
   * 检查并跳过广告
   */
  checkAndSkipAds() {
    if (!this.adapter.isPlaying()) return;

    const currentTime = this.adapter.getCurrentTime();
    
    for (const segment of this.segments) {
      const start = segment.start || segment.segment[0];
      const end = segment.end || segment.segment[1];
      
      // 检查是否在广告段落内
      if (currentTime >= start && currentTime < end) {
        const segmentId = segment.UUID || `${start}-${end}`;
        
        // 检查是否已跳过或被忽略
        if (this.skipHistory.has(segmentId) || this.ignoredSegments.has(segmentId)) {
          continue;
        }
        
        // 检查是否应该自动跳过
        if (this.options.autoSkip && this.shouldAutoSkip(segment)) {
          // 防止频繁跳过
          if (Date.now() - this.lastSkipTime < 1000) {
            continue;
          }
          
          // 执行跳过或静音
          if (this.options.muteInsteadOfSkip || segment.actionType === 'mute') {
            this.muteSegment(segment);
          } else {
            this.skipSegment(segment);
          }
        } else {
          // 显示手动跳过提示
          this.showSkipPrompt(segment);
        }
        
        break; // 一次只处理一个段落
      }
    }
  }

  /**
   * 判断是否应该自动跳过
   */
  shouldAutoSkip(segment) {
    // 检查类别是否在自动跳过列表中
    return this.options.skipCategories.includes(segment.category);
  }

  /**
   * 跳过广告段落
   */
  skipSegment(segment) {
    const end = segment.end || segment.segment[1];
    const segmentId = segment.UUID || `${segment.start}-${end}`;
    
    // 添加延迟（如果配置了）
    setTimeout(() => {
      this.adapter.seekTo(end);
      this.lastSkipTime = Date.now();
      this.skipHistory.add(segmentId);
      
      if (this.options.showNotifications) {
        const categoryName = this.getCategoryName(segment.category);
        this.adapter.showNotification(`已跳过 ${categoryName}`, {
          type: 'success',
          duration: 2000
        });
      }
      
      logger.info('UniversalAdSkipService', `跳过广告: ${segmentId}`);
    }, this.options.skipDelay * 1000);
  }

  /**
   * 静音广告段落
   */
  muteSegment(segment) {
    const video = this.adapter.video;
    if (!video) return;
    
    const originalVolume = video.volume;
    video.volume = 0;
    
    const segmentId = segment.UUID || `${segment.start}-${segment.end}`;
    this.skipHistory.add(segmentId);
    
    if (this.options.showNotifications) {
      const categoryName = this.getCategoryName(segment.category);
      this.adapter.showNotification(`已静音 ${categoryName}`, {
        type: 'info',
        duration: 2000
      });
    }
    
    // 监听段落结束后恢复音量
    const checkEnd = setInterval(() => {
      const currentTime = this.adapter.getCurrentTime();
      const end = segment.end || segment.segment[1];
      
      if (currentTime >= end) {
        video.volume = originalVolume;
        clearInterval(checkEnd);
        logger.info('UniversalAdSkipService', `恢复音量: ${segmentId}`);
      }
    }, 100);
  }

  /**
   * 显示手动跳过提示
   */
  showSkipPrompt(segment) {
    const segmentId = segment.UUID || `${segment.start}-${segment.end}`;
    
    // 避免重复显示
    if (this.skipHistory.has(segmentId)) return;
    
    const prompt = document.createElement('div');
    prompt.className = 'universal-skip-prompt';
    
    const categoryName = this.getCategoryName(segment.category);
    const duration = (segment.end || segment.segment[1]) - (segment.start || segment.segment[0]);
    
    prompt.innerHTML = `
      <div class="skip-prompt-content">
        <div class="skip-prompt-message">
          跳过 ${categoryName}？
          <span class="skip-prompt-duration">(${duration.toFixed(0)}秒)</span>
        </div>
        <div class="skip-prompt-buttons">
          <button class="skip-btn skip-btn-ignore">不跳过</button>
          <button class="skip-btn skip-btn-confirm">跳过</button>
        </div>
      </div>
    `;

    // 添加样式
    this.addPromptStyles();
    
    // 添加到播放器
    const container = this.adapter.getPlayerContainer();
    if (container) {
      container.appendChild(prompt);
    }
    
    // 标记为已显示
    this.skipHistory.add(segmentId);
    
    // 绑定事件
    const confirmBtn = prompt.querySelector('.skip-btn-confirm');
    const ignoreBtn = prompt.querySelector('.skip-btn-ignore');
    
    confirmBtn.onclick = () => {
      this.skipSegment(segment);
      prompt.remove();
    };
    
    ignoreBtn.onclick = () => {
      this.ignoredSegments.add(segmentId);
      prompt.remove();
    };
    
    // 5秒后自动隐藏
    setTimeout(() => {
      prompt.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => prompt.remove(), 300);
    }, 5000);
  }

  /**
   * 添加提示框样式
   */
  addPromptStyles() {
    if (document.querySelector('#universal-skip-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'universal-skip-styles';
    style.textContent = `
      .universal-skip-prompt {
        position: absolute;
        top: 70px;
        right: 12px;
        background: rgba(0, 0, 0, 0.9);
        color: white;
        padding: 12px 16px;
        border-radius: 4px;
        font-size: 14px;
        z-index: 10000;
        animation: slideIn 0.3s ease;
      }
      
      .skip-prompt-message {
        margin-bottom: 10px;
      }
      
      .skip-prompt-duration {
        color: #999;
        font-size: 12px;
        margin-left: 4px;
      }
      
      .skip-prompt-buttons {
        display: flex;
        gap: 8px;
      }
      
      .skip-btn {
        padding: 4px 12px;
        border: none;
        border-radius: 2px;
        cursor: pointer;
        font-size: 13px;
        transition: opacity 0.2s;
      }
      
      .skip-btn:hover {
        opacity: 0.8;
      }
      
      .skip-btn-confirm {
        background: #ff0000;
        color: white;
      }
      
      .skip-btn-ignore {
        background: #666;
        color: white;
      }
      
      @keyframes slideIn {
        from { transform: translateX(20px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
      
      @keyframes fadeOut {
        from { opacity: 1; }
        to { opacity: 0; }
      }
    `;
    
    document.head.appendChild(style);
  }

  /**
   * 获取类别名称
   */
  getCategoryName(category) {
    const names = {
      'sponsor': '赞助商',
      'selfpromo': '自我推广',
      'interaction': '互动提醒',
      'intro': '开场',
      'outro': '片尾',
      'preview': '预告',
      'filler': '填充内容',
      'music_offtopic': '非音乐部分'
    };
    return names[category] || category || '广告';
  }

  /**
   * 监听URL变化
   */
  setupUrlMonitor() {
    let lastUrl = location.href;
    
    const checkUrl = () => {
      if (location.href !== lastUrl) {
        lastUrl = location.href;
        this.handleUrlChange();
      }
    };
    
    // 使用MutationObserver监听URL变化（更可靠）
    const observer = new MutationObserver(checkUrl);
    observer.observe(document.body, { childList: true, subtree: true });
    
    // 也监听popstate事件
    window.addEventListener('popstate', checkUrl);
    
    // 监听YouTube的导航事件
    if (this.adapter.platform === 'youtube') {
      document.addEventListener('yt-navigate-finish', checkUrl);
    }
  }

  /**
   * 处理URL变化
   */
  async handleUrlChange() {
    // 检查是否真的是视频页面变化
    const newVideoId = this.adapter?.getVideoId();
    
    if (newVideoId === this.currentVideoId) {
      // 同一个视频，不需要重新初始化
      logger.debug('UniversalAdSkipService', '同一视频，跳过重新初始化');
      return;
    }
    
    if (!newVideoId || !this.adapter?.isVideoPage()) {
      // 不是视频页面
      logger.debug('UniversalAdSkipService', '不是视频页面，停止服务');
      this.destroy();
      return;
    }
    
    logger.info('UniversalAdSkipService', `视频变化: ${this.currentVideoId} -> ${newVideoId}`);
    
    // 停止当前监控
    this.stopMonitoring();
    
    // 更新视频ID
    this.currentVideoId = newVideoId;
    
    // 清理旧的状态
    this.segments = [];
    this.nativeAdMarkers = [];
    this.skipHistory.clear();
    this.ignoredSegments.clear();
    this.adObserverSetup = false;
    
    // 等待视频元素加载
    await this.adapter.waitForVideo();
    
    // 加载新视频的广告段落
    await this.loadSegments();
    
    // 开始监控
    this.startMonitoring();
  }

  /**
   * 更新配置
   */
  updateConfig(newConfig) {
    this.options = {
      ...this.options,
      ...newConfig
    };
    
    logger.info('UniversalAdSkipService', '配置已更新', this.options);
    
    // 重新加载段落和标记
    if (this.currentVideoId) {
      this.loadSegments();
    }
  }

  /**
   * 清理过期缓存
   */
  cleanupCache() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [key, value] of this.segmentsCache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.segmentsCache.delete(key);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug('UniversalAdSkipService', `清理了 ${cleanedCount} 个过期缓存`);
    }
  }
  
  /**
   * 清理资源
   */
  destroy() {
    this.stopMonitoring();
    this.segments = [];
    this.nativeAdMarkers = [];
    this.skipHistory.clear();
    this.ignoredSegments.clear();
    this.currentVideoId = null;
    this.adObserverSetup = false;
    
    // 清理定时器
    if (this.cacheCleanupInterval) {
      clearInterval(this.cacheCleanupInterval);
      this.cacheCleanupInterval = null;
    }
    
    // 清理缓存
    this.segmentsCache.clear();
    
    if (this.adapter) {
      this.adapter.destroy();
      this.adapter = null;
    }
    
    logger.info('UniversalAdSkipService', '已清理资源');
  }
}
