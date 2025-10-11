/**
 * DOM缓存管理器
 * 减少重复的DOM查询，提升性能
 */

class DOMCache {
  constructor() {
    this.cache = new Map();
    this.cacheTimeout = 5000; // 5秒缓存过期
  }

  /**
   * 获取DOM元素（带缓存）
   * @param {string} selector - CSS选择器
   * @param {boolean} forceRefresh - 是否强制刷新缓存
   * @returns {Element|null}
   */
  get(selector, forceRefresh = false) {
    const cached = this.cache.get(selector);
    
    // 检查缓存是否有效
    if (!forceRefresh && cached && cached.timestamp > Date.now() - this.cacheTimeout) {
      // 验证元素是否还在DOM中
      if (cached.element && document.contains(cached.element)) {
        return cached.element;
      }
    }
    
    // 重新查询
    const element = document.querySelector(selector);
    if (element) {
      this.cache.set(selector, { 
        element, 
        timestamp: Date.now() 
      });
    }
    
    return element;
  }

  /**
   * 获取多个DOM元素（带缓存）
   * @param {string} selector - CSS选择器
   * @param {boolean} forceRefresh - 是否强制刷新缓存
   * @returns {NodeList|Array}
   */
  getAll(selector, forceRefresh = false) {
    const cacheKey = `all:${selector}`;
    const cached = this.cache.get(cacheKey);
    
    if (!forceRefresh && cached && cached.timestamp > Date.now() - this.cacheTimeout) {
      return cached.elements;
    }
    
    const elements = Array.from(document.querySelectorAll(selector));
    this.cache.set(cacheKey, { 
      elements, 
      timestamp: Date.now() 
    });
    
    return elements;
  }

  /**
   * 清除指定选择器的缓存
   * @param {string} selector - CSS选择器
   */
  clear(selector) {
    if (selector) {
      this.cache.delete(selector);
      this.cache.delete(`all:${selector}`);
    } else {
      this.cache.clear();
    }
  }

  /**
   * 清除所有过期缓存
   */
  clearExpired() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (value.timestamp <= now - this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * 预加载常用选择器
   * @param {Array<string>} selectors - 选择器数组
   */
  preload(selectors) {
    selectors.forEach(selector => {
      this.get(selector, true);
    });
  }
}

// 创建全局单例
export const domCache = new DOMCache();
export default domCache;

