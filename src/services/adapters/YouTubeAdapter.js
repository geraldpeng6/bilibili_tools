/**
 * YouTube平台适配器
 * 提供YouTube特定的播放器控制功能
 */
import VideoPlayerAdapter from './VideoPlayerAdapter.js';
import logger from '../../utils/DebugLogger.js';

export default class YouTubeAdapter extends VideoPlayerAdapter {
  constructor() {
    super();
    this.platform = 'youtube';
    this.adObserver = null;
  }

  /**
   * 检测是否为YouTube视频页面
   */
  isVideoPage() {
    return location.hostname.includes('youtube.com') && 
           location.pathname.includes('/watch');
  }

  /**
   * 获取YouTube视频ID
   */
  getVideoId() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('v');
  }

  /**
   * 获取视频元素
   */
  getVideoElement() {
    return document.querySelector('video.html5-main-video') || 
           document.querySelector('video');
  }

  /**
   * 获取YouTube进度条容器
   */
  getProgressBar() {
    return document.querySelector('.ytp-progress-bar');
  }

  /**
   * 获取YouTube广告进度条
   * YouTube使用.ytp-ad-progress-list显示广告段落
   */
  getAdProgressBar() {
    return document.querySelector('.ytp-ad-progress-list');
  }

  /**
   * 获取播放器容器
   */
  getPlayerContainer() {
    return document.querySelector('#movie_player') || 
           document.querySelector('.html5-video-player');
  }

  /**
   * 检测YouTube原生广告标记
   * YouTube在进度条上用黄色标记广告段落
   */
  detectNativeAdMarkers() {
    const adMarkers = [];
    const progressBar = this.getProgressBar();
    
    if (!progressBar) return adMarkers;

    // YouTube广告标记通常在.ytp-ad-progress或.ytp-ad-progress-list中
    const adProgressElements = progressBar.querySelectorAll('.ytp-ad-progress, .ytp-play-progress');
    
    adProgressElements.forEach(element => {
      const style = window.getComputedStyle(element);
      // YouTube广告通常使用黄色 (#ffcc00 或类似颜色)
      if (style.backgroundColor.includes('255, 204') || 
          style.backgroundColor.includes('254, 205') ||
          element.classList.contains('ytp-ad-progress')) {
        
        // 解析位置和宽度来计算时间段
        const left = parseFloat(element.style.left) || 0;
        const width = parseFloat(element.style.width) || 
                     (parseFloat(element.style.transform?.match(/scaleX\(([\d.]+)\)/)?.[1]) || 0) * 100;
        
        if (width > 0 && this.video) {
          const duration = this.video.duration;
          const start = (left / 100) * duration;
          const end = ((left + width) / 100) * duration;
          
          adMarkers.push({
            start: Math.max(0, start),
            end: Math.min(duration, end),
            type: 'native_ad',
            color: '#ffcc00'
          });
        }
      }
    });

    // 检测带有特定类的进度条段落
    const adSegments = progressBar.querySelectorAll('.ytp-ad-section-marker');
    adSegments.forEach(segment => {
      const left = parseFloat(segment.style.left) || 0;
      const width = parseFloat(segment.style.width) || 0;
      
      if (width > 0 && this.video) {
        const duration = this.video.duration;
        const start = (left / 100) * duration;
        const end = ((left + width) / 100) * duration;
        
        adMarkers.push({
          start: Math.max(0, start),
          end: Math.min(duration, end),
          type: 'section_marker',
          color: '#ffcc00'
        });
      }
    });

    return adMarkers;
  }

  /**
   * 监听YouTube原生广告变化
   */
  observeAdChanges(callback) {
    const progressBar = this.getProgressBar();
    if (!progressBar) return;

    // 如果已有观察器，先断开
    if (this.adObserver) {
      this.adObserver.disconnect();
    }

    this.adObserver = new MutationObserver((mutations) => {
      let adChanged = false;
      
      mutations.forEach(mutation => {
        // 检查是否有广告相关的变化
        if (mutation.target.classList.contains('ytp-ad-progress') ||
            mutation.target.classList.contains('ytp-ad-progress-list') ||
            mutation.attributeName === 'style') {
          adChanged = true;
        }
      });

      if (adChanged) {
        const markers = this.detectNativeAdMarkers();
        callback(markers);
      }
    });

    // 观察进度条及其子元素的变化
    this.adObserver.observe(progressBar, {
      attributes: true,
      attributeFilter: ['style', 'class'],
      childList: true,
      subtree: true
    });
  }

  /**
   * 在YouTube播放器上显示提示
   */
  showNotification(message, options = {}) {
    const {
      duration = 3000,
      type = 'info', // info, warning, success
      position = 'top-right'
    } = options;

    // 创建提示元素
    const notification = document.createElement('div');
    notification.className = 'youtube-skip-notification';
    notification.textContent = message;
    notification.style.cssText = `
      position: absolute;
      ${position.includes('top') ? 'top: 70px' : 'bottom: 70px'};
      ${position.includes('right') ? 'right: 12px' : 'left: 12px'};
      background: ${type === 'warning' ? '#ff9800' : type === 'success' ? '#4caf50' : '#2196f3'};
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      z-index: 1000;
      animation: slideIn 0.3s ease;
      pointer-events: none;
    `;

    const container = this.getPlayerContainer();
    if (container) {
      container.appendChild(notification);

      // 自动移除
      setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
      }, duration);
    }
  }

  /**
   * 在YouTube进度条上添加自定义标记
   */
  addProgressMarkers(segments, options = {}) {
    const {
      containerId = 'universal-ad-markers',
      className = 'universal-ad-marker',
      color = '#ff0000',
      opacity = 0.7
    } = options;

    const progressBar = this.getProgressBar();
    if (!progressBar || !this.video) return;

    const duration = this.video.duration;
    if (!duration || duration === 0) {
      logger.debug('YouTubeAdapter', '视频时长无效，延迟添加标记');
      setTimeout(() => this.addProgressMarkers(segments, options), 1000);
      return;
    }

    // 移除旧标记容器
    const oldContainer = document.getElementById(containerId);
    if (oldContainer) {
      oldContainer.remove();
    }

    // 创建新的标记容器
    const container = document.createElement('div');
    container.id = containerId;
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 40;
      display: flex;
      align-items: center;
    `;

    // 获取不同类型的颜色
    const categoryColors = {
      'sponsor': '#00d400',
      'intro': '#00ffff',
      'outro': '#0202ed',
      'selfpromo': '#ffff00',
      'interaction': '#cc00ff',
      'preview': '#008fd6',
      'filler': '#7300ff',
      'music_offtopic': '#ff9900'
    };
    
    // 为每个段落创建标记
    segments.forEach((segment, index) => {
      const start = segment.start || segment.segment?.[0] || 0;
      const end = segment.end || segment.segment?.[1] || 0;
      
      // 跳过无效段落
      if (start >= end || start < 0 || end > duration) {
        logger.warn('YouTubeAdapter', `跳过无效段落: ${start}-${end}`);
        return;
      }
      
      const leftPercent = (start / duration) * 100;
      const widthPercent = ((end - start) / duration) * 100;

      const marker = document.createElement('div');
      marker.className = className;
      marker.dataset.segmentIndex = index.toString();
      marker.dataset.category = segment.category || 'unknown';
      
      // 获取该类别的颜色
      const segmentColor = categoryColors[segment.category] || segment.color || color;
      
      marker.style.cssText = `
        position: absolute;
        left: ${leftPercent}%;
        width: ${widthPercent}%;
        height: 100%;
        background-color: ${segmentColor};
        opacity: ${opacity};
        pointer-events: auto;
        cursor: pointer;
        box-sizing: border-box;
        transition: opacity 0.2s;
      `;

      // 鼠标悬停效果
      marker.addEventListener('mouseenter', () => {
        marker.style.opacity = '1';
      });
      
      marker.addEventListener('mouseleave', () => {
        marker.style.opacity = opacity.toString();
      });

      // 鼠标悬停提示
      const categoryName = this.getCategoryName(segment.category);
      marker.title = `${categoryName}: ${this.formatTime(start)} - ${this.formatTime(end)}`;
      
      // 点击跳过
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        if (segment.actionType !== 'mute') {
          this.seekTo(end);
          this.showNotification(`跳过了 ${categoryName}`, { type: 'success' });
        }
      });

      container.appendChild(marker);
    });

    // 找到最合适的插入位置
    // YouTube进度条有多层，我们需要插入到正确的层级
    const progressBarContainer = progressBar.querySelector('.ytp-progress-bar-container');
    const playProgress = progressBar.querySelector('.ytp-play-progress');
    const loadProgress = progressBar.querySelector('.ytp-load-progress');
    
    if (progressBarContainer) {
      // 插入到进度条容器中，在播放进度之后
      if (playProgress && playProgress.parentElement) {
        playProgress.parentElement.insertBefore(container, playProgress.nextSibling);
      } else if (loadProgress && loadProgress.parentElement) {
        loadProgress.parentElement.appendChild(container);
      } else {
        progressBarContainer.appendChild(container);
      }
    } else {
      // 备用方案：直接添加到进度条
      progressBar.appendChild(container);
    }
    
    logger.info('YouTubeAdapter', `已添加 ${segments.length} 个进度条标记`);
  }

  /**
   * 获取类别名称
   */
  getCategoryName(category) {
    const names = {
      'sponsor': '赞助商',
      'selfpromo': '自我推广',
      'interaction': '互动提醒',
      'intro': '片头',
      'outro': '片尾',
      'preview': '预告',
      'filler': '填充内容',
      'music_offtopic': '非音乐内容'
    };
    return names[category] || category || '广告';
  }

  /**
   * 格式化时间
   */
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * 检查YouTube Premium状态
   * Premium用户可能没有广告
   */
  isPremiumUser() {
    // 检查是否有Premium徽章
    const premiumBadge = document.querySelector('.ytp-premium-badge');
    // 检查URL参数
    const isPremium = new URLSearchParams(window.location.search).get('premium') === '1';
    // 检查localStorage
    const localPremium = localStorage.getItem('yt-player-premium') === 'true';
    
    return !!(premiumBadge || isPremium || localPremium);
  }

  /**
   * 清理资源
   */
  destroy() {
    if (this.adObserver) {
      this.adObserver.disconnect();
      this.adObserver = null;
    }
    super.destroy();
  }
}
