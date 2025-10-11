/**
 * 视频质量服务模块
 * 负责视频卡片的质量标记和片段标签显示
 */

import { SPONSORBLOCK } from '../constants.js';
import sponsorBlockConfig from '../config/SponsorBlockConfigManager.js';

class VideoQualityService {
  constructor(sponsorBlockAPI) {
    this.sponsorAPI = sponsorBlockAPI;
    this.observer = null;
    this.statsCache = new Map();
    this.pendingRequests = new Map();
    this.abortController = new AbortController();
    this.processQueue = new Set();
    this.isProcessing = false;
  }

  /**
   * 启动服务
   */
  start() {
    setTimeout(() => {
      this.initScrollHandler();
      this.initObserver();
      this.checkNewCards();
    }, 800);
  }

  /**
   * 初始化滚动处理器
   */
  initScrollHandler() {
    let timeout;
    window.addEventListener('scroll', () => {
      clearTimeout(timeout);
      timeout = setTimeout(() => this.checkNewCards(), 200);
    }, { signal: this.abortController.signal });
  }

  /**
   * 检查新卡片
   */
  checkNewCards() {
    if (document.visibilityState === 'hidden') return;

    const cards = document.querySelectorAll(`
      .bili-video-card:not([data-quality-checked]),
      .video-page-card-small:not([data-quality-checked]),
      .video-page-card:not([data-quality-checked]),
      .up-main-video-card:not([data-quality-checked]),
      .small-item:not([data-quality-checked])
    `);

    cards.forEach(card => {
      if (!card.dataset.qualityChecked) {
        this.processQueue.add(card);
      }
    });

    this.processNextBatch();
  }

  /**
   * 处理下一批卡片
   */
  async processNextBatch() {
    if (this.isProcessing || this.processQueue.size === 0) return;

    this.isProcessing = true;
    const batchSize = 5;
    const batch = Array.from(this.processQueue).slice(0, batchSize);

    try {
      await Promise.all(batch.map(card => this.processCard(card)));
    } catch (error) {
      // 静默处理错误
    }

    batch.forEach(card => this.processQueue.delete(card));
    this.isProcessing = false;

    if (this.processQueue.size > 0) {
      setTimeout(() => this.processNextBatch(), 100);
    }
  }

  /**
   * 处理单个卡片
   */
  async processCard(card) {
    if (card.dataset.qualityChecked === 'true') return;
    if (!document.body.contains(card)) return;

    card.dataset.qualityChecked = 'processing';

    const link = card.querySelector('a[href*="/video/BV"]');
    if (!link) {
      card.dataset.qualityChecked = 'true';
      return;
    }

    const bvid = this.extractBVID(link.href);
    if (!bvid) {
      card.dataset.qualityChecked = 'true';
      return;
    }

    const container = this.findBadgeContainer(card);
    if (!container) {
      card.dataset.qualityChecked = 'true';
      return;
    }

    try {
      // 并行获取视频统计和广告片段
      const [stats, segments] = await Promise.all([
        this.fetchVideoStats(bvid).catch(() => null),
        this.sponsorAPI.fetchSegments(bvid).catch(() => [])
      ]);

      if (!document.body.contains(card)) return;

      // 创建标签容器
      const existingContainer = container.querySelector('.bili-tags-container');
      if (existingContainer) {
        existingContainer.remove();
      }

      const tagsContainer = document.createElement('div');
      tagsContainer.className = 'bili-tags-container';

      // 先收集所有标签
      const allBadges = [];
      
      // 添加优质视频标签
      if (sponsorBlockConfig.get('showQualityBadge') && stats && this.isHighQuality(stats)) {
        allBadges.push(this.createQualityBadge(stats));
      }

      // 添加片段标签
      if (sponsorBlockConfig.get('showAdBadge') && segments && segments.length > 0) {
        const segmentBadges = this.createSegmentBadges(segments);
        allBadges.push(...segmentBadges);
      }

      // 如果标签数量 >= 3，设置为只显示emoji模式
      const emojiOnly = allBadges.length >= 3;
      
      allBadges.forEach(badge => {
        if (emojiOnly && badge.dataset.emoji && badge.dataset.text) {
          badge.textContent = badge.dataset.emoji;
          badge.classList.add('emoji-only');
        }
        tagsContainer.appendChild(badge);
      });

      // 如果有标签，插入到容器中
      if (tagsContainer.children.length > 0) {
        if (container.firstChild) {
          container.insertBefore(tagsContainer, container.firstChild);
        } else {
          container.appendChild(tagsContainer);
        }
      }
    } catch (error) {
      // 静默处理错误
    } finally {
      if (document.body.contains(card)) {
        card.dataset.qualityChecked = 'true';
      }
    }
  }

  /**
   * 查找标签容器
   */
  findBadgeContainer(card) {
    // UP主主页视频卡片
    if (card.classList.contains('up-main-video-card') || card.classList.contains('small-item')) {
      return card.querySelector('.cover-container, .cover, .pic-box') || card;
    }

    // 其他页面视频卡片
    if (card.classList.contains('video-page-card-small')) {
      return card.querySelector('.pic-box');
    }
    if (card.classList.contains('video-page-card')) {
      return card.querySelector('.pic');
    }
    return card.querySelector('.bili-video-card__cover, .cover, .pic, .bili-video-card__info') ||
           card.closest('.bili-video-card')?.querySelector('.bili-video-card__cover');
  }

  /**
   * 判断是否高质量
   */
  isHighQuality(stats) {
    return stats?.view >= SPONSORBLOCK.MIN_VIEWS && 
           stats.like / stats.view >= SPONSORBLOCK.MIN_SCORE;
  }

  /**
   * 判断是否顶级质量
   */
  isTopQuality(stats) {
    return stats?.coin >= stats?.like;
  }

  /**
   * 创建质量标签
   */
  createQualityBadge(stats) {
    const badge = document.createElement('span');
    badge.className = 'bili-quality-tag';
    if (this.isTopQuality(stats)) {
      badge.style.background = SPONSORBLOCK.TOP_TAG_COLOR;
      badge.textContent = SPONSORBLOCK.TOP_TAG_TEXT;
      badge.dataset.emoji = '🏆';
      badge.dataset.text = '顶级';
      badge.title = '顶级优质视频';
    } else {
      badge.style.background = SPONSORBLOCK.TAG_COLOR;
      badge.textContent = SPONSORBLOCK.TAG_TEXT;
      badge.dataset.emoji = '🔥';
      badge.dataset.text = '精选';
      badge.title = '精选优质视频';
    }
    return badge;
  }

  /**
   * 创建片段标签
   */
  createSegmentBadges(segments) {
    // 统计各类别的片段
    const categoryCount = {};
    segments.forEach(seg => {
      categoryCount[seg.category] = (categoryCount[seg.category] || 0) + 1;
    });

    // 为每个类别创建标签
    const badges = [];
    
    // 定义类别图标和颜色映射
    const categoryStyles = {
      'sponsor': { icon: '⚠️', text: '广告', color: 'linear-gradient(135deg, #FF8C00, #FF6347)' },
      'selfpromo': { icon: '📢', text: '推广', color: 'linear-gradient(135deg, #FFD700, #FFA500)' },
      'interaction': { icon: '👆', text: '三连', color: 'linear-gradient(135deg, #9C27B0, #E91E63)' },
      'poi_highlight': { icon: '⭐', text: '高光', color: 'linear-gradient(135deg, #FF1493, #FF69B4)' },
      'intro': { icon: '▶️', text: '开场', color: 'linear-gradient(135deg, #00CED1, #00BFFF)' },
      'outro': { icon: '🎬', text: '结尾', color: 'linear-gradient(135deg, #1E90FF, #4169E1)' },
      'preview': { icon: '🔄', text: '回顾', color: 'linear-gradient(135deg, #00A1D6, #0087B3)' },
      'filler': { icon: '💬', text: '闲聊', color: 'linear-gradient(135deg, #9370DB, #8A2BE2)' },
      'music_offtopic': { icon: '🎵', text: '非音乐', color: 'linear-gradient(135deg, #FF8C00, #FF7F50)' },
      'exclusive_access': { icon: '🤝', text: '合作', color: 'linear-gradient(135deg, #2E8B57, #3CB371)' },
      'mute': { icon: '🔇', text: '静音', color: 'linear-gradient(135deg, #DC143C, #C71585)' }
    };

    Object.entries(categoryCount).forEach(([category, count]) => {
      const style = categoryStyles[category] || 
                  { icon: '📍', text: category, color: 'linear-gradient(135deg, #888, #666)' };
      
      const badge = document.createElement('span');
      badge.className = 'bili-ad-tag';
      badge.style.background = style.color;
      
      // 保存emoji和文本信息，用于后续判断是否只显示emoji
      badge.dataset.emoji = count > 1 ? `${style.icon}×${count}` : style.icon;
      badge.dataset.text = style.text;
      
      // 默认显示完整内容
      badge.textContent = `${style.icon} ${style.text}`;
      if (count > 1) {
        badge.textContent += ` (${count})`;
      }
      
      badge.title = `包含 ${count} 个${style.text}片段`;
      badges.push(badge);
    });

    return badges;
  }

  /**
   * 提取BVID
   */
  extractBVID(url) {
    try {
      return new URL(url).pathname.match(/video\/(BV\w+)/)?.[1];
    } catch {
      return null;
    }
  }

  /**
   * 获取视频统计
   */
  async fetchVideoStats(bvid) {
    // 检查缓存
    if (this.statsCache.has(bvid)) {
      return this.statsCache.get(bvid);
    }

    if (this.pendingRequests.has(bvid)) {
      return this.pendingRequests.get(bvid);
    }

    const promise = new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: "GET",
        url: `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`,
        timeout: 5000,
        onload: (res) => {
          try {
            const data = JSON.parse(res.responseText);
            if (data?.code === 0 && data?.data?.stat) {
              this.statsCache.set(bvid, data.data.stat);
              resolve(data.data.stat);
            } else {
              reject(new Error('Invalid API response'));
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
    return promise.finally(() => {
      this.pendingRequests.delete(bvid);
    });
  }

  /**
   * 初始化观察器
   */
  initObserver() {
    this.observer = new MutationObserver((mutations) => {
      let shouldCheck = false;
      for (const mutation of mutations) {
        if (mutation.addedNodes.length > 0) {
          shouldCheck = true;
          break;
        }
      }
      if (shouldCheck) {
        this.checkNewCards();
      }
    });

    this.observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * 销毁服务
   */
  destroy() {
    this.observer?.disconnect();
    this.abortController.abort();
    this.processQueue.clear();
    this.pendingRequests.clear();
    this.statsCache.clear();
  }
}

// 创建全局单例（需要传入API实例）
let videoQualityServiceInstance = null;

export function createVideoQualityService(sponsorBlockAPI) {
  if (!videoQualityServiceInstance) {
    videoQualityServiceInstance = new VideoQualityService(sponsorBlockAPI);
  }
  return videoQualityServiceInstance;
}

export default VideoQualityService;

