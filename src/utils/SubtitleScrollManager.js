/**
 * 字幕自动滚动管理器
 * 独立管理字幕列表的自动滚动功能
 */
export class SubtitleScrollManager {
  constructor() {
    this.container = null;
    this.video = null;
    this.isFollowing = true;
    this.scrollTimer = null;
    this.followInterval = null;
    this.userScrollTimeout = null;
    this.lastScrollTime = 0;
    this.lastHighlightedItem = null;
    
    // 配置选项
    this.config = {
      followIntervalMs: 200,      // 跟随检查间隔（毫秒）
      userScrollDetectMs: 300,    // 用户滚动检测延迟（毫秒）
      scrollBehavior: 'smooth',    // 滚动行为：smooth | auto
      scrollPosition: 'start',    // 滚动位置：center | start | end - 改为start让字幕显示在顶部
      highlightClass: 'current'  // 高亮CSS类
    };
    
    // 回调函数
    this.callbacks = {
      onFollowStatusChange: null,  // 跟随状态改变回调
      onSubtitleHighlight: null    // 字幕高亮回调
    };
  }
  
  /**
   * 初始化滚动管理器
   * @param {HTMLElement} container - 字幕列表容器
   * @param {Object} options - 配置选项
   */
  init(container, options = {}) {
    if (!container) {
      console.warn('SubtitleScrollManager: 容器不存在');
      return;
    }
    
    this.container = container;
    this.video = document.querySelector('video');
    
    if (!this.video) {
      console.warn('SubtitleScrollManager: 未找到视频元素');
      return;
    }
    
    // 合并配置
    this.config = { ...this.config, ...options };
    
    // 设置滚动监听
    this.setupScrollListener();
    
    // 开始自动跟随
    this.startAutoFollow();
  }
  
  /**
   * 设置滚动监听
   */
  setupScrollListener() {
    if (!this.container) return;
    
    // 监听用户滚动
    this.container.addEventListener('scroll', () => {
      this.handleUserScroll();
    }, { passive: true });
  }
  
  /**
   * 处理用户滚动
   */
  handleUserScroll() {
    const now = Date.now();
    
    // 如果是程序触发的滚动，忽略
    if (now - this.lastScrollTime < 50) {
      return;
    }
    
    // 清除之前的定时器
    if (this.userScrollTimeout) {
      clearTimeout(this.userScrollTimeout);
    }
    
    // 设置用户正在滚动标志
    const wasFollowing = this.isFollowing;
    
    // 延迟判断是否停止跟随
    this.userScrollTimeout = setTimeout(() => {
      if (this.isFollowing) {
        this.isFollowing = false;
        this.triggerFollowStatusChange(false);
      }
    }, this.config.userScrollDetectMs);
  }
  
  /**
   * 开始自动跟随
   */
  startAutoFollow() {
    // 清理旧的定时器
    this.stopAutoFollow();
    
    this.isFollowing = true;
    this.triggerFollowStatusChange(true);
    
    // 立即执行一次
    this.updateScroll();
    
    // 设置定时器
    this.followInterval = setInterval(() => {
      if (this.isFollowing) {
        this.updateScroll();
      }
    }, this.config.followIntervalMs);
  }
  
  /**
   * 停止自动跟随
   */
  stopAutoFollow() {
    if (this.followInterval) {
      clearInterval(this.followInterval);
      this.followInterval = null;
    }
    
    this.isFollowing = false;
    this.triggerFollowStatusChange(false);
  }
  
  /**
   * 恢复自动跟随
   */
  resumeAutoFollow() {
    this.startAutoFollow();
    // 立即滚动到当前位置
    this.scrollToCurrentSubtitle(true);
  }
  
  /**
   * 更新滚动位置
   */
  updateScroll() {
    if (!this.video || !this.container) return;
    
    const currentTime = this.video.currentTime;
    const subtitleItems = this.container.querySelectorAll('.subtitle-item');
    
    if (subtitleItems.length === 0) return;
    
    let currentItem = null;
    
    // 找到当前时间对应的字幕
    for (let i = 0; i < subtitleItems.length; i++) {
      const item = subtitleItems[i];
      const startTime = parseFloat(item.dataset.startTime || 0);
      const endTime = parseFloat(item.dataset.endTime || 0);
      
      if (currentTime >= startTime && currentTime <= endTime) {
        currentItem = item;
        break;
      } else if (i < subtitleItems.length - 1) {
        const nextStartTime = parseFloat(subtitleItems[i + 1].dataset.startTime || 0);
        if (currentTime >= startTime && currentTime < nextStartTime) {
          currentItem = item;
          break;
        }
      }
    }
    
    // 如果没有找到精确匹配，找最接近的
    if (!currentItem) {
      let minDiff = Infinity;
      for (const item of subtitleItems) {
        const startTime = parseFloat(item.dataset.startTime || 0);
        const diff = Math.abs(currentTime - startTime);
        if (diff < minDiff) {
          minDiff = diff;
          currentItem = item;
        }
      }
    }
    
    if (currentItem && currentItem !== this.lastHighlightedItem) {
      // 更新高亮
      this.updateHighlight(currentItem);
      
      // 滚动到当前字幕
      if (this.isFollowing) {
        this.scrollToElement(currentItem);
      }
    }
  }
  
  /**
   * 更新字幕高亮
   * @param {HTMLElement} currentItem - 当前字幕元素
   */
  updateHighlight(currentItem) {
    // 移除旧的高亮
    if (this.lastHighlightedItem) {
      this.lastHighlightedItem.classList.remove(this.config.highlightClass);
    }
    
    // 添加新的高亮
    if (currentItem) {
      currentItem.classList.add(this.config.highlightClass);
      this.lastHighlightedItem = currentItem;
      
      // 触发高亮回调
      if (this.callbacks.onSubtitleHighlight) {
        this.callbacks.onSubtitleHighlight(currentItem);
      }
    }
  }
  
  /**
   * 滚动到指定元素
   * @param {HTMLElement} element - 目标元素
   * @param {boolean} forceCenter - 是否强制居中
   */
  scrollToElement(element, forceCenter = false) {
    if (!element || !this.container) return;
    
    const containerRect = this.container.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    
    // 计算滚动位置
    let scrollTop;
    
    if (forceCenter || this.config.scrollPosition === 'center') {
      // 居中显示
      const containerCenter = containerRect.height / 2;
      const elementCenter = elementRect.height / 2;
      const relativeTop = elementRect.top - containerRect.top + this.container.scrollTop;
      scrollTop = relativeTop - containerCenter + elementCenter;
    } else if (this.config.scrollPosition === 'start') {
      // 顶部对齐，保留20px的边距以便更好地显示
      scrollTop = element.offsetTop - 20;
      // 确保不会滚动到负值
      scrollTop = Math.max(0, scrollTop);
    } else {
      // 底部对齐
      scrollTop = element.offsetTop - containerRect.height + elementRect.height;
    }
    
    // 记录滚动时间
    this.lastScrollTime = Date.now();
    
    // 执行滚动
    this.container.scrollTo({
      top: scrollTop,
      behavior: this.isFollowing ? this.config.scrollBehavior : 'auto'
    });
  }
  
  /**
   * 滚动到当前播放的字幕
   * @param {boolean} forceCenter - 是否强制居中
   */
  scrollToCurrentSubtitle(forceCenter = false) {
    if (!this.video || !this.container) return;
    
    const currentTime = this.video.currentTime;
    const subtitleItems = this.container.querySelectorAll('.subtitle-item');
    
    for (const item of subtitleItems) {
      const startTime = parseFloat(item.dataset.startTime || 0);
      const endTime = parseFloat(item.dataset.endTime || 0);
      
      if (currentTime >= startTime && currentTime <= endTime) {
        this.updateHighlight(item);
        this.scrollToElement(item, forceCenter);
        break;
      }
    }
  }
  
  /**
   * 触发跟随状态改变回调
   * @param {boolean} isFollowing - 是否正在跟随
   */
  triggerFollowStatusChange(isFollowing) {
    if (this.callbacks.onFollowStatusChange) {
      this.callbacks.onFollowStatusChange(isFollowing);
    }
  }
  
  /**
   * 设置回调函数
   * @param {string} name - 回调名称
   * @param {Function} callback - 回调函数
   */
  on(name, callback) {
    if (this.callbacks.hasOwnProperty(name)) {
      this.callbacks[name] = callback;
    }
  }
  
  /**
   * 更新配置
   * @param {Object} config - 新配置
   */
  updateConfig(config) {
    this.config = { ...this.config, ...config };
  }
  
  /**
   * 获取当前跟随状态
   * @returns {boolean}
   */
  isAutoFollowing() {
    return this.isFollowing;
  }
  
  /**
   * 销毁滚动管理器
   */
  destroy() {
    this.stopAutoFollow();
    
    if (this.userScrollTimeout) {
      clearTimeout(this.userScrollTimeout);
      this.userScrollTimeout = null;
    }
    
    // 移除高亮
    if (this.lastHighlightedItem) {
      this.lastHighlightedItem.classList.remove(this.config.highlightClass);
      this.lastHighlightedItem = null;
    }
    
    this.container = null;
    this.video = null;
    this.callbacks = {
      onFollowStatusChange: null,
      onSubtitleHighlight: null
    };
  }
}

// 导出单例
export const subtitleScrollManager = new SubtitleScrollManager();
