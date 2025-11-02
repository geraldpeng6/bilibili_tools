/**
 * LRU缓存管理器
 * 用于缓存字幕、AI总结等数据，避免重复请求
 */

import logger from './DebugLogger.js';

/**
 * LRU缓存类
 * 使用Map保持插入顺序，实现LRU淘汰策略
 */
class LRUCache {
  /**
   * @param {number} maxSize - 最大缓存数量
   * @param {string} cacheName - 缓存名称（用于日志）
   */
  constructor(maxSize = 10, cacheName = 'LRUCache') {
    this.maxSize = maxSize;
    this.cacheName = cacheName;
    this.cache = new Map();
    logger.debug('LRUCache', `初始化 ${cacheName}，最大容量: ${maxSize}`);
  }

  /**
   * 获取缓存值
   * 如果存在，将其移到最后（最近使用）
   * @param {string} key - 缓存键
   * @returns {*} 缓存值，不存在返回undefined
   */
  get(key) {
    if (!this.cache.has(key)) {
      return undefined;
    }

    // 获取值并删除旧位置
    const value = this.cache.get(key);
    this.cache.delete(key);
    
    // 重新插入到最后（最近使用）
    this.cache.set(key, value);
    
    logger.debug('LRUCache', `${this.cacheName} 缓存命中: ${key}`);
    return value;
  }

  /**
   * 设置缓存值
   * 如果超过最大容量，删除最久未使用的项（Map的第一个）
   * @param {string} key - 缓存键
   * @param {*} value - 缓存值
   */
  set(key, value) {
    // 如果已存在，先删除（稍后重新插入到最后）
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }

    // 如果达到最大容量，删除最久未使用的项（第一个）
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
      logger.debug('LRUCache', `${this.cacheName} LRU淘汰: ${firstKey}`);
    }

    // 插入新值到最后
    this.cache.set(key, value);
    logger.debug('LRUCache', `${this.cacheName} 缓存保存: ${key}，当前数量: ${this.cache.size}/${this.maxSize}`);
  }

  /**
   * 检查缓存是否存在
   * @param {string} key - 缓存键
   * @returns {boolean}
   */
  has(key) {
    return this.cache.has(key);
  }

  /**
   * 删除缓存
   * @param {string} key - 缓存键
   * @returns {boolean} 是否成功删除
   */
  delete(key) {
    const deleted = this.cache.delete(key);
    if (deleted) {
      logger.debug('LRUCache', `${this.cacheName} 缓存删除: ${key}`);
    }
    return deleted;
  }

  /**
   * 清空所有缓存
   */
  clear() {
    const size = this.cache.size;
    this.cache.clear();
    logger.info('LRUCache', `${this.cacheName} 缓存已清空，删除了 ${size} 个项`);
  }

  /**
   * 获取当前缓存数量
   * @returns {number}
   */
  size() {
    return this.cache.size;
  }

  /**
   * 获取所有缓存键
   * @returns {Array<string>}
   */
  keys() {
    return Array.from(this.cache.keys());
  }

  /**
   * 获取缓存统计信息
   * @returns {Object}
   */
  getStats() {
    return {
      name: this.cacheName,
      size: this.cache.size,
      maxSize: this.maxSize,
      usage: `${this.cache.size}/${this.maxSize}`,
      keys: this.keys()
    };
  }
}

// 创建4个独立的LRU缓存实例

/**
 * 字幕数据缓存
 * 缓存键格式: BVxxxx-cid-p1
 */
export const subtitleCache = new LRUCache(10, '字幕缓存');

/**
 * AI Markdown总结缓存
 * 缓存键格式: BVxxxx-cid-p1
 */
export const aiMarkdownCache = new LRUCache(10, 'AI-Markdown缓存');

/**
 * AI段落总结+广告分析缓存
 * 缓存键格式: BVxxxx-cid-p1
 * 缓存值格式: {segments: Array, ads: Array}
 */
export const aiSegmentsCache = new LRUCache(10, 'AI-段落缓存');

/**
 * Notion页面ID映射缓存
 * 缓存键格式: BVxxxx-cid-p1
 * 缓存值格式: pageId字符串
 */
export const notionPageCache = new LRUCache(10, 'Notion页面缓存');

/**
 * 获取所有缓存的统计信息
 * @returns {Array<Object>}
 */
export function getAllCacheStats() {
  return [
    subtitleCache.getStats(),
    aiMarkdownCache.getStats(),
    aiSegmentsCache.getStats(),
    notionPageCache.getStats()
  ];
}

/**
 * 清空所有缓存
 */
export function clearAllCaches() {
  subtitleCache.clear();
  aiMarkdownCache.clear();
  aiSegmentsCache.clear();
  notionPageCache.clear();
  logger.info('LRUCache', '所有缓存已清空');
}

export default LRUCache;

