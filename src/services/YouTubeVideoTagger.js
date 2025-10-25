/**
 * YouTube视频标签服务
 * 在视频列表中为含有广告的视频添加标签
 */
import logger from '../utils/DebugLogger.js';
import DeArrowAPI from './DeArrowAPI.js';

class YouTubeVideoTagger {
  constructor() {
    this.deArrowAPI = new DeArrowAPI();
    this.processedElements = new WeakSet(); // 使用WeakSet避免内存泄漏
    this.processingQueue = new Set(); // 正在处理的视频ID
    this.observer = null;
    this.tagCache = new Map(); // 缓存视频的广告信息
    this.concurrentLimit = 3; // 同时处理的最大数量
    this.requestDelay = 100; // 请求之间的最小延迟
    this.lastRequestTime = 0; // 上次请求的时间戳
    this.pendingScans = []; // 待处理的扫描任务
    this.cacheTTL = 1800000; // 缓存生存时间：30分钟
    this.scanTimer = null; // 扫描定时器
  }

  /**
   * 初始化服务
   */
  async init() {
    if (!location.hostname.includes('youtube.com')) {
      return;
    }

    logger.info('YouTubeVideoTagger', '初始化YouTube视频标签服务');
    
    // 初次扫描页面上的视频
    await this.scanAndTagVideos();
    
    // 监听DOM变化，处理新加载的视频
    this.setupObserver();
    
    // 监听页面导航（YouTube使用SPA）
    this.setupNavigationListener();
  }

  /**
   * 扫描并标记页面上的所有视频
   */
  async scanAndTagVideos() {
    // 防抖：如果有待处理的扫描，取消它
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
    }
    
    // 延迟执行，合并多次调用
    this.scanTimer = setTimeout(async () => {
      await this.performScan();
    }, 200);
  }

  /**
   * 执行实际的扫描
   */
  async performScan() {
    try {
      const videoItems = this.findVideoItems();
      const newItems = videoItems.filter(item => {
        // 过滤已处理的元素和正在处理的视频
        return !this.processedElements.has(item.element) && 
               !this.processingQueue.has(item.videoId);
      });
      
      if (newItems.length === 0) {
        return;
      }
      
      logger.debug('YouTubeVideoTagger', `发现 ${newItems.length} 个新视频需要处理`);
      
      // 使用并发池处理视频
      await this.processVideoConcurrently(newItems);
    } catch (error) {
      logger.error('YouTubeVideoTagger', '扫描视频时出错:', error);
    }
  }

  /**
   * 并发处理视频项
   */
  async processVideoConcurrently(items) {
    const queue = [...items];
    const activePromises = [];
    
    while (queue.length > 0 || activePromises.length > 0) {
      // 填充活动队列至并发限制
      while (activePromises.length < this.concurrentLimit && queue.length > 0) {
        const item = queue.shift();
        
        // 标记元素为已处理（立即标记，避免重复）
        this.processedElements.add(item.element);
        this.processingQueue.add(item.videoId);
        
        // 创建处理任务
        const promise = this.processVideoItemWithRateLimit(item)
          .finally(() => {
            // 处理完成后从处理队列移除
            this.processingQueue.delete(item.videoId);
            // 从活动promise列表中移除
            const index = activePromises.indexOf(promise);
            if (index > -1) {
              activePromises.splice(index, 1);
            }
          });
        
        activePromises.push(promise);
      }
      
      // 等待至少一个任务完成
      if (activePromises.length > 0) {
        await Promise.race(activePromises);
      }
    }
  }

  /**
   * 带速率限制的视频处理
   */
  async processVideoItemWithRateLimit(item) {
    // 计算需要等待的时间
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    const waitTime = Math.max(0, this.requestDelay - timeSinceLastRequest);
    
    if (waitTime > 0) {
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
    
    this.lastRequestTime = Date.now();
    
    try {
      await this.processVideoItem(item);
    } catch (error) {
      logger.error('YouTubeVideoTagger', `处理视频 ${item.videoId} 失败:`, error);
    }
  }

  /**
   * 查找页面上的视频项
   */
  findVideoItems() {
    const selectors = [
      // 首页和搜索结果
      'ytd-video-renderer',
      'ytd-rich-item-renderer',
      
      // 频道页
      'ytd-grid-video-renderer',
      
      // 播放页侧边栏和推荐
      'ytd-compact-video-renderer',
      'ytd-video-preview',
      
      // 播放列表
      'ytd-playlist-video-renderer',
      
      // Shorts
      'ytd-reel-item-renderer',
      
      // 新YouTube布局（2024+）
      'yt-lockup-view-model',
      '.yt-lockup-view-model__content-image:has(yt-thumbnail-view-model)',
      
      // 通用缩略图容器
      'ytd-thumbnail:has(a[href*="/watch"])',
      'div:has(> a#thumbnail[href*="/watch"])'
    ];
    
    const items = [];
    const foundVideos = new Map(); // 使用Map存储视频ID和元素的对应关系
    
    // 使用更高效的选择器组合
    const combinedSelector = selectors.join(',');
    const elements = document.querySelectorAll(combinedSelector);
    
    elements.forEach(element => {
      // 跳过已经有标签的元素
      if (element.querySelector('.youtube-ad-tag')) {
        return;
      }
      
      const videoInfo = this.extractVideoInfo(element);
      if (videoInfo && videoInfo.videoId) {
        // 如果是同一个视频的不同元素，选择更完整的那个
        if (!foundVideos.has(videoInfo.videoId) || 
            (videoInfo.thumbnailContainer && !foundVideos.get(videoInfo.videoId).thumbnailContainer)) {
          foundVideos.set(videoInfo.videoId, {
            element,
            ...videoInfo
          });
        }
      }
    });
    
    return Array.from(foundVideos.values());
  }

  /**
   * 从元素中提取视频信息
   */
  extractVideoInfo(element) {
    let videoId = null;
    let title = '';
    let duration = '';
    let thumbnailContainer = null;
    
    // 方法1：从链接href提取
    const links = element.querySelectorAll('a[href*="/watch?v="]');
    if (links.length > 0) {
      const match = links[0].href.match(/[?&]v=([^&]+)/);
      if (match) {
        videoId = match[1];
      }
    }
    
    // 方法2：从data属性提取
    if (!videoId) {
      const videoIdAttr = element.querySelector('[data-video-id]');
      if (videoIdAttr) {
        videoId = videoIdAttr.dataset.videoId;
      }
    }
    
    // 方法3：从父元素的链接提取
    if (!videoId && element.closest('a[href*="/watch?v="]')) {
      const match = element.closest('a[href*="/watch?v="]').href.match(/[?&]v=([^&]+)/);
      if (match) {
        videoId = match[1];
      }
    }
    
    if (!videoId) return null;
    
    // 获取标题
    const titleElement = element.querySelector('#video-title') ||
                        element.querySelector('h3') ||
                        element.querySelector('[title]');
    if (titleElement) {
      title = titleElement.textContent || titleElement.title || '';
    }
    
    // 获取时长
    const durationElement = element.querySelector('ytd-thumbnail-overlay-time-status-renderer') ||
                           element.querySelector('.ytd-thumbnail-overlay-time-status-renderer') ||
                           element.querySelector('span.style-scope.ytd-thumbnail-overlay-time-status-renderer') ||
                           element.querySelector('.yt-badge-shape__text') ||  // 新布局的时长元素
                           element.querySelector('yt-thumbnail-overlay-badge-view-model .yt-badge-shape__text');
    if (durationElement) {
      duration = durationElement.textContent?.trim() || '';
    }
    
    // 找到缩略图容器（用于添加标签）
    thumbnailContainer = element.querySelector('yt-thumbnail-view-model') ||  // 新YouTube布局
                        element.querySelector('.ytThumbnailViewModelImage') ||  // 新布局的图片容器
                        element.querySelector('ytd-thumbnail') ||
                        element.querySelector('#thumbnail') ||
                        element.querySelector('.yt-core-image') ||
                        element.querySelector('img')?.closest('div');
    
    return {
      videoId,
      title: title.trim(),
      duration,
      thumbnailContainer
    };
  }

  /**
   * 处理单个视频项
   */
  async processVideoItem(item) {
    const { videoId, title, thumbnailContainer, element } = item;
    
    // 再次检查是否已经有标签（双重保险）
    if (element.querySelector('.youtube-ad-tag')) {
      return;
    }
    
    try {
      // 检查缓存（包含TTL检查）
      let hasAds = false;
      let segments = [];
      const now = Date.now();
      
      if (this.tagCache.has(videoId)) {
        const cached = this.tagCache.get(videoId);
        // 检查缓存是否过期
        if (now - cached.timestamp < this.cacheTTL) {
          hasAds = cached.hasAds;
          segments = cached.segments;
          logger.debug('YouTubeVideoTagger', `使用缓存数据: ${videoId}`);
        } else {
          // 缓存过期，删除它
          this.tagCache.delete(videoId);
        }
      }
      
      // 如果没有缓存或缓存过期，获取新数据
      if (!this.tagCache.has(videoId)) {
        // 获取视频的广告段落信息
        segments = await this.deArrowAPI.getSegments(videoId);
        hasAds = segments && segments.length > 0;
        
        // 缓存结果（包含时间戳）
        this.tagCache.set(videoId, { 
          hasAds, 
          segments,
          timestamp: now
        });
      }
      
      // 如果有广告，添加标签
      if (hasAds) {
        this.addAdTag(element, thumbnailContainer, segments);
        logger.debug('YouTubeVideoTagger', `为视频 ${title || videoId} 添加广告标签`);
      }
    } catch (error) {
      logger.error('YouTubeVideoTagger', `处理视频 ${videoId} 时出错:`, error);
    }
  }

  /**
   * 为视频添加广告标签
   */
  addAdTag(element, thumbnailContainer, segments) {
    if (!thumbnailContainer) {
      // 如果没有找到缩略图容器，尝试在元素本身添加
      thumbnailContainer = element;
    }
    
    // 检查是否已有标签
    if (thumbnailContainer.querySelector('.youtube-ad-tag')) {
      return;
    }
    
    // 计算广告信息
    const adCount = segments.length;
    const categories = [...new Set(segments.map(s => s.category))];
    const mainCategory = this.getMainCategory(categories);
    
    // 创建标签容器（类似B站风格）
    const tagWrapper = document.createElement('div');
    tagWrapper.className = 'youtube-ad-tag-wrapper';
    tagWrapper.style.cssText = `
      position: absolute;
      top: 6px;
      left: 6px;
      display: flex;
      flex-direction: column;
      gap: 4px;
      align-items: flex-start;
      z-index: 1000;
      pointer-events: none;
    `;
    
    // 创建主标签元素
    const tag = document.createElement('div');
    tag.className = 'youtube-ad-tag';
    // 使用DOM方法添加内容，避免innerHTML安全问题
    const tagContent = this.createTagContent(mainCategory, adCount);
    tag.appendChild(tagContent);
    tag.title = `包含 ${adCount} 个广告段落: ${categories.join(', ')}`;
    
    // 设置B站风格样式（精细化）
    const { background, color } = this.getTagStyle(mainCategory);
    tag.style.cssText = `
      display: inline-flex;
      align-items: center;
      gap: 2px;
      background: ${background};
      color: ${color};
      padding: 3px 7px 3px 5px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
      font-family: "PingFang SC", "Helvetica Neue", "Microsoft YaHei", sans-serif;
      line-height: 18px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15), inset 0 1px 0 rgba(255,255,255,0.15);
      backdrop-filter: blur(10px) saturate(180%);
      -webkit-backdrop-filter: blur(10px) saturate(180%);
      white-space: nowrap;
      transform-origin: left top;
      transform: scale(0.9);
      opacity: 0.95;
      animation: slideInScale 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
      transition: all 0.2s ease;
      cursor: default;
    `;
    
    // 如果有多个类别，添加额外的小标签
    if (categories.length > 1) {
      const extraTag = document.createElement('div');
      extraTag.className = 'youtube-ad-extra-tag';
      extraTag.textContent = `+${categories.length - 1}`;
      extraTag.style.cssText = `
        display: inline-flex;
        align-items: center;
        justify-content: center;
        background: rgba(0, 0, 0, 0.5);
        color: #ffffff;
        padding: 2px 5px;
        border-radius: 3px;
        font-size: 10px;
        font-weight: bold;
        margin-left: 3px;
        backdrop-filter: blur(5px);
      `;
      tag.appendChild(extraTag);
    }
    
    // 添加动画样式
    const style = document.createElement('style');
    style.textContent = `
      @keyframes slideInScale {
        from {
          opacity: 0;
          transform: scale(0.7) translateY(-5px);
        }
        to {
          opacity: 0.95;
          transform: scale(0.9) translateY(0);
        }
      }
      
      @keyframes shimmer {
        0% {
          background-position: -200% center;
        }
        100% {
          background-position: 200% center;
        }
      }
      
      .youtube-ad-tag:hover {
        transform: scale(0.95) !important;
        opacity: 1 !important;
        box-shadow: 0 3px 12px rgba(0,0,0,0.2) !important;
        transition: all 0.2s ease;
      }
      
      .youtube-ad-tag-wrapper:hover .youtube-ad-tag {
        pointer-events: auto;
      }
      
      /* B站风格的高亮效果 */
      .youtube-ad-tag::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent);
        background-size: 200% 100%;
        border-radius: inherit;
        opacity: 0;
        transition: opacity 0.3s;
      }
      
      .youtube-ad-tag:hover::before {
        opacity: 1;
        animation: shimmer 1s ease-in-out;
      }
    `;
    if (!document.querySelector('#youtube-ad-tag-styles')) {
      style.id = 'youtube-ad-tag-styles';
      document.head.appendChild(style);
    }
    
    // 确保容器有相对定位
    const containerStyle = window.getComputedStyle(thumbnailContainer);
    if (containerStyle.position === 'static') {
      thumbnailContainer.style.position = 'relative';
    }
    
    // 添加标签到容器
    tagWrapper.appendChild(tag);
    thumbnailContainer.appendChild(tagWrapper);
  }

  /**
   * 获取主要的广告类别
   */
  getMainCategory(categories) {
    // 优先级顺序
    const priority = ['sponsor', 'selfpromo', 'intro', 'outro', 'interaction', 'preview', 'filler'];
    
    for (const cat of priority) {
      if (categories.includes(cat)) {
        return cat;
      }
    }
    
    return categories[0] || 'ad';
  }

  /**
   * 创建带emoji的标签内容（DOM方式）
   */
  createTagContent(category, count) {
    const categoryInfo = {
      'sponsor': { emoji: '💰', text: '赞助' },
      'selfpromo': { emoji: '📢', text: '推广' },
      'intro': { emoji: '🎬', text: '片头' },
      'outro': { emoji: '🎭', text: '片尾' },
      'interaction': { emoji: '👍', text: '互动' },
      'preview': { emoji: '👀', text: '预览' },
      'filler': { emoji: '⏸️', text: '填充' },
      'ad': { emoji: '📺', text: '广告' }
    };
    
    const info = categoryInfo[category] || categoryInfo.ad;
    
    // 创建容器
    const container = document.createElement('span');
    container.style.display = 'inline-flex';
    container.style.alignItems = 'center';
    container.style.gap = '3px';
    
    // 创建emoji元素
    const emojiSpan = document.createElement('span');
    emojiSpan.textContent = info.emoji;
    emojiSpan.style.fontSize = '14px';
    emojiSpan.style.lineHeight = '1';
    emojiSpan.style.display = 'inline-block';
    emojiSpan.style.verticalAlign = 'middle';
    emojiSpan.style.filter = 'drop-shadow(0 1px 1px rgba(0,0,0,0.2))';
    
    // 创建文本元素
    const textSpan = document.createElement('span');
    textSpan.textContent = info.text;
    textSpan.style.fontSize = '12px';
    textSpan.style.letterSpacing = '0.3px';
    textSpan.style.verticalAlign = 'middle';
    
    // 添加到容器
    container.appendChild(emojiSpan);
    container.appendChild(textSpan);
    
    // 如果数量大于1，添加数量标记
    if (count > 1) {
      const countSpan = document.createElement('span');
      countSpan.textContent = `×${count}`;
      countSpan.style.marginLeft = '2px';
      countSpan.style.opacity = '0.9';
      countSpan.style.fontSize = '11px';
      container.appendChild(countSpan);
    }
    
    return container;
  }

  /**
   * 获取标签样式（B站风格）
   */
  getTagStyle(category) {
    const styles = {
      'sponsor': {
        background: 'linear-gradient(135deg, #00c851 0%, #00a040 100%)',
        color: '#ffffff'
      },
      'selfpromo': {
        background: 'linear-gradient(135deg, #ffc107 0%, #ff9800 100%)',
        color: '#ffffff'
      },
      'intro': {
        background: 'linear-gradient(135deg, #00bcd4 0%, #0097a7 100%)',
        color: '#ffffff'
      },
      'outro': {
        background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)',
        color: '#ffffff'
      },
      'interaction': {
        background: 'linear-gradient(135deg, #e91e63 0%, #c2185b 100%)',
        color: '#ffffff'
      },
      'preview': {
        background: 'linear-gradient(135deg, #9c27b0 0%, #7b1fa2 100%)',
        color: '#ffffff'
      },
      'filler': {
        background: 'linear-gradient(135deg, #795548 0%, #5d4037 100%)',
        color: '#ffffff'
      },
      'ad': {
        background: 'linear-gradient(135deg, #f44336 0%, #d32f2f 100%)',
        color: '#ffffff'
      }
    };
    
    return styles[category] || styles.ad;
  }

  /**
   * 获取标签文字（旧方法，保留兼容性）
   */
  getTagText(category, count) {
    const texts = {
      'sponsor': '赞助',
      'selfpromo': '推广',
      'intro': '片头',
      'outro': '片尾',
      'interaction': '互动',
      'preview': '预览',
      'filler': '填充',
      'ad': '广告'
    };
    
    const text = texts[category] || '广告';
    return count > 1 ? `${text} ×${count}` : text;
  }

  /**
   * 获取标签颜色（旧方法，保留兼容性）
   */
  getTagColor(category) {
    const colors = {
      'sponsor': '#00d400',     // 绿色 - 赞助商
      'selfpromo': '#ffcc00',   // 黄色 - 自我推广
      'intro': '#00bcd4',       // 青色 - 片头
      'outro': '#ff9100',       // 橙色 - 片尾
      'interaction': '#ff00ff', // 粉色 - 互动提醒
      'preview': '#7c4dff',     // 紫色 - 预览
      'filler': '#795548',      // 棕色 - 填充内容
      'ad': '#f44336'           // 红色 - 通用广告
    };
    
    return colors[category] || colors.ad;
  }

  /**
   * 设置DOM观察器
   */
  setupObserver() {
    // 观察器配置
    const config = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['href', 'src'] // 监听链接和图片变化
    };
    
    // 创建智能检测函数
    const shouldTriggerScan = (mutations) => {
      for (const mutation of mutations) {
        // 检查新增节点
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              // 检查是否包含视频相关元素
              if (this.isVideoRelatedElement(node)) {
                return true;
              }
            }
          }
        }
        
        // 检查属性变化（如href改变）
        if (mutation.type === 'attributes') {
          const element = mutation.target;
          if (element.nodeType === Node.ELEMENT_NODE && 
              element.tagName === 'A' && 
              element.href && 
              element.href.includes('/watch')) {
            return true;
          }
        }
        
        // 检查移除的节点（页面刷新/切换）
        if (mutation.type === 'childList' && mutation.removedNodes.length > 10) {
          return true;
        }
      }
      return false;
    };
    
    // 创建观察器
    this.observer = new MutationObserver((mutations) => {
      if (shouldTriggerScan(mutations)) {
        this.scanAndTagVideos();
      }
    });
    
    // 开始观察多个容器
    const containers = [
      document.querySelector('ytd-app'),
      document.querySelector('#content'),
      document.querySelector('#contents'),
      document.body
    ].filter(Boolean);
    
    // 观察第一个存在的容器
    if (containers.length > 0) {
      this.observer.observe(containers[0], config);
      logger.debug('YouTubeVideoTagger', `DOM观察器已启动，观察 ${containers[0].tagName}`);
    }
    
    // 定期检查（作为备用方案）
    this.startPeriodicCheck();
  }
  
  /**
   * 检查是否是视频相关元素
   */
  isVideoRelatedElement(element) {
    if (!element.matches) return false;
    
    const videoSelectors = [
      'ytd-video-renderer',
      'ytd-rich-item-renderer',
      'ytd-grid-video-renderer',
      'ytd-compact-video-renderer',
      'ytd-playlist-video-renderer',
      'ytd-thumbnail',
      '[href*="/watch"]'
    ];
    
    // 检查元素本身
    if (videoSelectors.some(selector => element.matches(selector))) {
      return true;
    }
    
    // 检查元素内部是否包含视频相关内容
    if (element.querySelector && element.querySelector(videoSelectors.join(','))) {
      return true;
    }
    
    return false;
  }
  
  /**
   * 定期检查新视频
   */
  startPeriodicCheck() {
    // 每10秒检查一次，作为备用方案
    setInterval(() => {
      // 只在没有正在处理的任务时执行
      if (this.processingQueue.size === 0) {
        this.scanAndTagVideos();
      }
    }, 10000);
    
    // 每5分钟清理一次过期缓存
    setInterval(() => {
      this.cleanupCache();
    }, 300000);
  }
  
  /**
   * 清理过期的缓存
   */
  cleanupCache() {
    const now = Date.now();
    let cleanedCount = 0;
    
    for (const [videoId, cached] of this.tagCache.entries()) {
      if (now - cached.timestamp > this.cacheTTL) {
        this.tagCache.delete(videoId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.debug('YouTubeVideoTagger', `清理了 ${cleanedCount} 个过期缓存项`);
    }
  }

  /**
   * 监听页面导航
   */
  setupNavigationListener() {
    // YouTube SPA导航事件
    window.addEventListener('yt-navigate-finish', () => {
      logger.debug('YouTubeVideoTagger', '页面导航完成，重新扫描视频');
      // 导航时不清理WeakSet（自动垃圾回收）
      // 只是触发新的扫描
      setTimeout(() => this.scanAndTagVideos(), 500);
    });
    
    // 监听URL变化
    let lastUrl = location.href;
    const checkUrlChange = () => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        logger.debug('YouTubeVideoTagger', 'URL变化，触发扫描');
        this.scanAndTagVideos();
      }
    };
    
    // 使用轻量级的定时器检查URL
    setInterval(checkUrlChange, 1000);
    
    // 监听浏览器前进/后退
    window.addEventListener('popstate', () => {
      this.scanAndTagVideos();
    });
    
    // 监听YouTube特有的事件
    document.addEventListener('yt-action', (e) => {
      // 只对特定动作响应
      if (e.detail && (
        e.detail.actionName === 'yt-append-continuation-items-action' ||
        e.detail.actionName === 'ytd-update-grid-items-action'
      )) {
        this.scanAndTagVideos();
      }
    });
  }

  /**
   * 清理资源
   */
  destroy() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    
    // 清理定时器
    if (this.scanTimer) {
      clearTimeout(this.scanTimer);
      this.scanTimer = null;
    }
    
    // 移除所有标签
    document.querySelectorAll('.youtube-ad-tag').forEach(tag => tag.remove());
    
    // 清理缓存
    this.processingQueue.clear();
    this.tagCache.clear();
    
    // WeakSet会自动垃圾回收，不需要手动清理
    
    logger.info('YouTubeVideoTagger', '服务已销毁');
  }
}

// 导出单例
export default new YouTubeVideoTagger();
