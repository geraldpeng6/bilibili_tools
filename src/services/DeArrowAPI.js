/**
 * DeArrow API服务
 * 用于获取YouTube视频的社区提交的广告段落和标题缩略图改进
 * API文档: https://wiki.sponsor.ajay.app/w/API_Docs/DeArrow
 */

import logger from '../utils/DebugLogger.js';

export default class DeArrowAPI {
  constructor() {
    this.baseUrl = 'https://sponsor.ajay.app/api';
    this.deArrowUrl = 'https://dearrow.ajay.app/api';
    this.cache = new Map();
    this.pendingRequests = new Map();
    
    // 缓存时间：10分钟
    this.cacheExpiry = 10 * 60 * 1000;
  }

  /**
   * 获取视频的广告段落（SponsorBlock API）
   * @param {string} videoId - YouTube视频ID
   * @param {Array} categories - 要获取的类别
   * @returns {Promise<Array>}
   */
  async getSegments(videoId, categories = ['sponsor', 'selfpromo', 'interaction', 'intro', 'outro']) {
    if (!videoId) {
      logger.warn('DeArrowAPI', '缺少视频ID');
      return [];
    }

    const cacheKey = `segments_${videoId}_${categories.join(',')}`;
    
    // 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      logger.debug('DeArrowAPI', `使用缓存的段落数据: ${videoId}`);
      return cached.data;
    }

    // 检查是否有正在进行的请求
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    // 创建请求
    const promise = this._fetchSegments(videoId, categories);
    this.pendingRequests.set(cacheKey, promise);

    try {
      const result = await promise;
      this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
      return result;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  /**
   * 实际获取段落的方法
   */
  async _fetchSegments(videoId, categories) {
    // 正确的方式：使用多个category参数
    const categoryParams = categories.map(c => `category=${encodeURIComponent(c)}`).join('&');
    const url = `${this.baseUrl}/skipSegments?videoID=${encodeURIComponent(videoId)}&${categoryParams}&service=YouTube`;

    try {
      return await new Promise((resolve, reject) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: url,
          headers: {
            'User-Agent': 'Bilibili-Tools/1.0',
            'Accept': 'application/json'
          },
          timeout: 10000,
          onload: (response) => {
            if (response.status === 404) {
              // 没有找到段落，这是正常的
              logger.debug('DeArrowAPI', `视频 ${videoId} 没有广告段落`);
              resolve([]);
            } else if (response.status === 200) {
              try {
                const data = JSON.parse(response.responseText);
                const segments = this._normalizeSegments(data);
                logger.info('DeArrowAPI', `获取到 ${segments.length} 个广告段落`);
                resolve(segments);
              } catch (e) {
                logger.error('DeArrowAPI', '解析响应失败:', e);
                resolve([]);
              }
            } else {
              logger.warn('DeArrowAPI', `HTTP ${response.status}: ${response.statusText}`);
              resolve([]);
            }
          },
          onerror: (error) => {
            logger.error('DeArrowAPI', '请求失败:', error);
            resolve([]);
          },
          ontimeout: () => {
            logger.warn('DeArrowAPI', '请求超时');
            resolve([]);
          }
        });
      });
    } catch (error) {
      logger.error('DeArrowAPI', '获取段落失败:', error);
      return [];
    }
  }

  /**
   * 获取改进的视频标题（DeArrow API）
   * @param {string} videoId
   * @returns {Promise<Object|null>}
   */
  async getBrandingData(videoId) {
    if (!videoId) return null;

    const cacheKey = `branding_${videoId}`;
    
    // 检查缓存
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
      return cached.data;
    }

    const url = `${this.deArrowUrl}/branding?videoID=${videoId}`;

    try {
      return await new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: 'GET',
          url: url,
          headers: {
            'User-Agent': 'Bilibili-Tools/1.0',
            'Accept': 'application/json'
          },
          timeout: 5000,
          onload: (response) => {
            if (response.status === 200) {
              try {
                const data = JSON.parse(response.responseText);
                const result = {
                  title: data.titles?.[0]?.title,
                  thumbnail: data.thumbnails?.[0]?.timestamp,
                  randomTime: data.randomTime,
                  videoDuration: data.videoDuration
                };
                this.cache.set(cacheKey, { data: result, timestamp: Date.now() });
                resolve(result);
              } catch (e) {
                resolve(null);
              }
            } else {
              resolve(null);
            }
          },
          onerror: () => resolve(null),
          ontimeout: () => resolve(null)
        });
      });
    } catch (error) {
      logger.error('DeArrowAPI', '获取品牌数据失败:', error);
      return null;
    }
  }

  /**
   * 提交新的广告段落
   * @param {Object} segment
   * @returns {Promise<boolean>}
   */
  async submitSegment(segment) {
    const { videoId, startTime, endTime, category } = segment;
    
    if (!videoId || startTime === undefined || endTime === undefined) {
      logger.error('DeArrowAPI', '提交段落缺少必要参数');
      return false;
    }

    const url = `${this.baseUrl}/skipSegments`;
    const userID = this._getUserId();

    const body = JSON.stringify({
      videoID: videoId,
      userID: userID,
      segments: [{
        segment: [startTime, endTime],
        category: category || 'sponsor'
      }]
    });

    try {
      return await new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: 'POST',
          url: url,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Bilibili-Tools/1.0'
          },
          data: body,
          timeout: 10000,
          onload: (response) => {
            if (response.status === 200 || response.status === 201) {
              logger.info('DeArrowAPI', '成功提交广告段落');
              // 清除缓存
              this._clearVideoCache(videoId);
              resolve(true);
            } else {
              logger.error('DeArrowAPI', `提交失败: HTTP ${response.status}`);
              resolve(false);
            }
          },
          onerror: (error) => {
            logger.error('DeArrowAPI', '提交失败:', error);
            resolve(false);
          },
          ontimeout: () => {
            logger.error('DeArrowAPI', '提交超时');
            resolve(false);
          }
        });
      });
    } catch (error) {
      logger.error('DeArrowAPI', '提交段落异常:', error);
      return false;
    }
  }

  /**
   * 对段落投票
   * @param {string} uuid - 段落UUID
   * @param {number} type - 投票类型 (1=支持, 0=反对)
   * @returns {Promise<boolean>}
   */
  async voteOnSegment(uuid, type = 1) {
    const url = `${this.baseUrl}/api/voteOnSponsorTime`;
    const userID = this._getUserId();

    try {
      return await new Promise((resolve) => {
        GM_xmlhttpRequest({
          method: 'POST',
          url: url,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'Bilibili-Tools/1.0'
          },
          data: JSON.stringify({
            UUID: uuid,
            userID: userID,
            type: type
          }),
          timeout: 5000,
          onload: (response) => {
            if (response.status === 200) {
              logger.info('DeArrowAPI', `投票成功: ${type === 1 ? '支持' : '反对'}`);
              resolve(true);
            } else {
              resolve(false);
            }
          },
          onerror: () => resolve(false),
          ontimeout: () => resolve(false)
        });
      });
    } catch (error) {
      logger.error('DeArrowAPI', '投票失败:', error);
      return false;
    }
  }

  /**
   * 标准化段落格式
   */
  _normalizeSegments(data) {
    if (!Array.isArray(data)) return [];

    return data.map(item => ({
      UUID: item.UUID,
      segment: item.segment || [item.startTime, item.endTime],
      start: item.segment ? item.segment[0] : item.startTime,
      end: item.segment ? item.segment[1] : item.endTime,
      category: item.category,
      actionType: item.actionType || 'skip',
      description: item.description || '',
      votes: item.votes || 0,
      locked: item.locked || 0,
      userID: item.userID,
      videoDuration: item.videoDuration
    }));
  }

  /**
   * 获取或生成用户ID
   */
  _getUserId() {
    let userId = localStorage.getItem('dearrow_user_id');
    if (!userId) {
      // 生成一个随机的用户ID
      userId = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now().toString(36);
      localStorage.setItem('dearrow_user_id', userId);
    }
    return userId;
  }

  /**
   * 清除特定视频的缓存
   */
  _clearVideoCache(videoId) {
    for (const [key] of this.cache) {
      if (key.includes(videoId)) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 清除所有缓存
   */
  clearCache() {
    this.cache.clear();
    logger.info('DeArrowAPI', '已清除所有缓存');
  }
}
