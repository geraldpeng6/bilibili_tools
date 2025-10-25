/**
 * Bilibili平台适配器
 * 提供Bilibili特定的播放器控制功能
 */
import VideoPlayerAdapter from './VideoPlayerAdapter.js';
import logger from '../../utils/DebugLogger.js';

export default class BilibiliAdapter extends VideoPlayerAdapter {
  constructor() {
    super();
    this.platform = 'bilibili';
  }

  /**
   * 检测是否为Bilibili视频页面
   */
  isVideoPage() {
    return location.hostname.includes('bilibili.com') && 
           location.pathname.includes('/video/');
  }

  /**
   * 获取Bilibili视频ID (BV号)
   */
  getVideoId() {
    return location.pathname.match(/video\/(BV\w+)/)?.[1];
  }

  /**
   * 获取视频元素
   */
  getVideoElement() {
    return document.querySelector('video') || 
           document.querySelector('.bpx-player-video-wrap video');
  }

  /**
   * 获取Bilibili进度条容器
   */
  getProgressBar() {
    return document.querySelector('.bpx-player-progress-schedule');
  }

  /**
   * Bilibili暂时没有原生广告进度条
   */
  getAdProgressBar() {
    return null;
  }

  /**
   * 获取播放器容器
   */
  getPlayerContainer() {
    return document.querySelector('.bpx-player-video-wrap') || 
           document.querySelector('.bpx-player-container');
  }

  /**
   * 在Bilibili播放器上显示提示
   */
  showNotification(message, options = {}) {
    const {
      duration = 3000,
      type = 'info',
      position = 'top-right'
    } = options;

    // 创建提示元素
    const notification = document.createElement('div');
    notification.className = 'bilibili-skip-notification';
    notification.textContent = message;
    
    // 根据类型设置颜色
    const bgColor = type === 'warning' ? '#ff9800' : 
                   type === 'success' ? '#4caf50' : 
                   type === 'error' ? '#f44336' : '#2196f3';
    
    notification.style.cssText = `
      position: absolute;
      ${position.includes('top') ? 'top: 70px' : 'bottom: 70px'};
      ${position.includes('right') ? 'right: 12px' : 'left: 12px'};
      background: ${bgColor};
      color: white;
      padding: 12px 20px;
      border-radius: 4px;
      font-size: 14px;
      font-weight: 500;
      box-shadow: 0 2px 5px rgba(0,0,0,0.3);
      z-index: 1000;
      animation: fadeIn 0.3s ease;
      pointer-events: none;
    `;

    const container = this.getPlayerContainer();
    if (container) {
      container.appendChild(notification);

      // 添加动画
      if (!document.querySelector('#bilibili-notification-styles')) {
        const style = document.createElement('style');
        style.id = 'bilibili-notification-styles';
        style.textContent = `
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(-10px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @keyframes fadeOut {
            from { opacity: 1; transform: translateY(0); }
            to { opacity: 0; transform: translateY(-10px); }
          }
        `;
        document.head.appendChild(style);
      }

      // 自动移除
      setTimeout(() => {
        notification.style.animation = 'fadeOut 0.3s ease';
        setTimeout(() => notification.remove(), 300);
      }, duration);
    }
  }

  /**
   * 在Bilibili进度条上添加标记
   */
  addProgressMarkers(segments, options = {}) {
    const {
      containerId = 'sponsorblock-preview-bar',
      className = 'sponsorblock-segment',
      defaultColor = '#ff0000',
      opacity = 0.7
    } = options;

    const progressBar = this.getProgressBar();
    if (!progressBar || !this.video) return;

    // 移除旧标记
    document.querySelectorAll(`#${containerId}`).forEach(el => el.remove());

    // 创建标记容器
    const container = document.createElement('ul');
    container.id = containerId;
    container.style.cssText = `
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      z-index: 10;
    `;

    const duration = this.video.duration;

    // 排序：长片段先渲染（避免覆盖）
    const sortedSegments = [...segments].sort((a, b) => {
      const aLength = (a.end || a.segment?.[1] || 0) - (a.start || a.segment?.[0] || 0);
      const bLength = (b.end || b.segment?.[1] || 0) - (b.start || b.segment?.[0] || 0);
      return bLength - aLength;
    });

    // 为每个片段创建标记
    sortedSegments.forEach((segment, index) => {
      const start = segment.start || segment.segment?.[0] || 0;
      const end = segment.end || segment.segment?.[1] || 0;
      
      const leftPercent = (start / duration) * 100;
      const rightPercent = (1 - end / duration) * 100;

      const marker = document.createElement('li');
      marker.className = className;
      marker.dataset.segmentIndex = index.toString();
      
      // 使用段落的颜色或默认颜色
      const color = segment.color || this.getCategoryColor(segment.category) || defaultColor;
      
      marker.style.cssText = `
        position: absolute;
        left: ${leftPercent}%;
        right: ${rightPercent}%;
        height: 100%;
        background: ${color};
        opacity: ${opacity};
        pointer-events: auto;
        cursor: pointer;
        transition: opacity 0.2s ease;
      `;

      // 鼠标悬停效果
      marker.addEventListener('mouseenter', () => {
        marker.style.opacity = '1';
      });
      
      marker.addEventListener('mouseleave', () => {
        marker.style.opacity = opacity.toString();
      });

      // 显示详情
      const segmentDuration = end - start;
      const categoryName = this.getCategoryName(segment.category);
      marker.title = `${categoryName}\n${this.formatTime(start)} - ${this.formatTime(end)} (${segmentDuration.toFixed(1)}秒)`;

      // 点击事件
      marker.addEventListener('click', (e) => {
        e.stopPropagation();
        if (segment.actionType !== 'mute') {
          this.seekTo(end);
          this.showNotification(`已跳过 ${categoryName}`, { type: 'success' });
        }
      });

      container.appendChild(marker);
    });

    // 插入到进度条
    progressBar.prepend(container);
  }

  /**
   * 获取类别颜色
   */
  getCategoryColor(category) {
    const colors = {
      'sponsor': '#00d400',      // 赞助商
      'selfpromo': '#ffff00',    // 自我推广
      'interaction': '#cc00ff',  // 互动提醒
      'intro': '#00ffff',        // 开场动画
      'outro': '#0202ed',        // 结尾推荐
      'preview': '#008fd6',      // 预告
      'filler': '#7300ff',       // 无关内容
      'music_offtopic': '#ff9900' // 非音乐部分
    };
    return colors[category] || '#ff0000';
  }

  /**
   * 获取类别名称
   */
  getCategoryName(category) {
    const names = {
      'sponsor': '赞助商',
      'selfpromo': '自我推广',
      'interaction': '互动提醒',
      'intro': '开场动画',
      'outro': '结尾推荐',
      'preview': '预告',
      'filler': '无关内容',
      'music_offtopic': '非音乐部分'
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
   * 检查是否为大会员
   */
  isVIPUser() {
    // 检查大会员标识
    const vipBadge = document.querySelector('.bili-avatar-pendent-dom');
    const vipIcon = document.querySelector('.bpx-player-video-info-vip');
    
    // 检查localStorage
    const vipStatus = localStorage.getItem('bili_vip_status');
    
    return !!(vipBadge || vipIcon || vipStatus === 'true');
  }

  /**
   * 清理资源
   */
  destroy() {
    super.destroy();
  }
}
