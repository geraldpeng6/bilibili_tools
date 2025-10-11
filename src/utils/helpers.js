/**
 * 辅助函数模块
 * 提供各种通用的辅助功能
 */

import { REGEX, SELECTORS } from '../constants.js';

/**
 * 格式化时间（秒转为 MM:SS 格式）
 * @param {number} seconds - 秒数
 * @returns {string} - 格式化后的时间
 */
export function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 从URL中提取BV号
 * @param {string} url - URL字符串
 * @returns {string|null} - BV号或null
 */
export function extractBvidFromUrl(url = window.location.href) {
  // 方法1: 从路径中精确提取
  const pathMatch = url.match(REGEX.BVID_FROM_PATH);
  if (pathMatch) {
    return pathMatch[1];
  }
  
  // 方法2: 使用通用正则
  const bvMatch = url.match(REGEX.BVID_FROM_URL);
  return bvMatch ? bvMatch[0] : null;
}

/**
 * 获取视频信息
 * @returns {{bvid: string|null, cid: string|number|null, aid: string|number|null}}
 */
export function getVideoInfo() {
  let bvid = null;
  let cid = null;
  let aid = null;

  // 从URL提取BV号
  bvid = extractBvidFromUrl();

  // 尝试从页面数据中获取CID和AID
  try {
    const initialState = unsafeWindow.__INITIAL_STATE__;
    if (initialState && initialState.videoData) {
      bvid = bvid || initialState.videoData.bvid;
      cid = initialState.videoData.cid || initialState.videoData.pages?.[0]?.cid;
      aid = initialState.videoData.aid;
    }
  } catch (e) {
    // Silently ignore
  }

  return { bvid, cid, aid };
}

/**
 * 获取视频标题
 * @returns {string} - 视频标题
 */
export function getVideoTitle() {
  let title = '';
  
  // 方法1: 从__INITIAL_STATE__获取
  try {
    const initialState = unsafeWindow.__INITIAL_STATE__;
    if (initialState && initialState.videoData && initialState.videoData.title) {
      title = initialState.videoData.title;
    }
  } catch (e) {
    // Silently ignore
  }

  // 方法2: 从h1标签获取
  if (!title) {
    const h1 = document.querySelector(SELECTORS.VIDEO_TITLE_H1);
    if (h1) {
      title = h1.textContent.trim();
    }
  }

  // 方法3: 从document.title提取
  if (!title) {
    title = document.title
      .replace(/_哔哩哔哩.*$/, '')
      .replace(/_bilibili.*$/i, '')
      .trim();
  }

  return title || '未知视频';
}

/**
 * 获取视频创作者信息
 * @returns {string} - 创作者名称
 */
export function getVideoCreator() {
  try {
    const initialState = unsafeWindow.__INITIAL_STATE__;
    if (initialState && initialState.videoData && initialState.videoData.owner) {
      return initialState.videoData.owner.name;
    }
  } catch (e) {
    // Silently ignore
  }
  
  return '未知';
}

/**
 * 获取视频URL（去除查询参数）
 * @returns {string} - 清理后的视频URL
 */
export function getVideoUrl() {
  return window.location.href.split('?')[0];
}

/**
 * 延迟执行
 * @param {number} ms - 延迟时间（毫秒）
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 带超时的Promise
 * @param {Promise} promise - 原始Promise
 * @param {number} timeout - 超时时间（毫秒）
 * @param {string} errorMessage - 超时错误信息
 * @returns {Promise}
 */
export function withTimeout(promise, timeout, errorMessage = '操作超时') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(errorMessage)), timeout)
    )
  ]);
}

/**
 * 安全地解析JSON
 * @param {string} text - JSON字符串
 * @param {any} defaultValue - 解析失败时的默认值
 * @returns {any}
 */
export function safeJsonParse(text, defaultValue = null) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return defaultValue;
  }
}

/**
 * 下载文本文件
 * @param {string} content - 文件内容
 * @param {string} filename - 文件名
 * @param {string} mimeType - MIME类型
 */
export function downloadFile(content, filename, mimeType = 'text/plain;charset=utf-8') {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 防抖函数
 * @param {Function} func - 要防抖的函数
 * @param {number} wait - 等待时间（毫秒）
 * @returns {Function}
 */
export function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * 节流函数
 * @param {Function} func - 要节流的函数
 * @param {number} limit - 时间限制（毫秒）
 * @returns {Function}
 */
export function throttle(func, limit) {
  let inThrottle;
  return function executedFunction(...args) {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

/**
 * 使用 requestAnimationFrame 的节流函数（性能更优）
 * @param {Function} func - 要节流的函数
 * @returns {Function}
 */
export function throttleRAF(func) {
  let rafId = null;
  return function executedFunction(...args) {
    if (rafId === null) {
      rafId = requestAnimationFrame(() => {
        func.apply(this, args);
        rafId = null;
      });
    }
  };
}

/**
 * 函数结果缓存（记忆化）
 * @param {Function} func - 要缓存的函数
 * @param {Function} keyGenerator - 生成缓存key的函数
 * @returns {Function}
 */
export function memoize(func, keyGenerator = (...args) => JSON.stringify(args)) {
  const cache = new Map();
  return function memoized(...args) {
    const key = keyGenerator(...args);
    if (cache.has(key)) {
      return cache.get(key);
    }
    const result = func.apply(this, args);
    cache.set(key, result);
    return result;
  };
}

/**
 * 二分查找
 * @param {Array} arr - 已排序的数组
 * @param {*} target - 目标值
 * @param {Function} compareFn - 比较函数，返回负数、0或正数
 * @returns {number} - 找到的索引，或应该插入的位置（负数）
 */
export function binarySearch(arr, target, compareFn = (a, b) => a - b) {
  let left = 0;
  let right = arr.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const comparison = compareFn(arr[mid], target);
    
    if (comparison === 0) {
      return mid;
    } else if (comparison < 0) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }
  
  return -(left + 1); // 返回负数表示未找到，绝对值-1是插入位置
}

/**
 * 查找字幕索引（针对时间范围优化的二分查找）
 * @param {Array} subtitles - 字幕数组 [{from, to, content}, ...]
 * @param {number} currentTime - 当前时间（秒）
 * @returns {number} - 当前时间对应的字幕索引，未找到返回-1
 */
export function findSubtitleIndex(subtitles, currentTime) {
  if (!subtitles || subtitles.length === 0) return -1;
  
  // 线性查找（如果数组很小）
  if (subtitles.length < 50) {
    for (let i = 0; i < subtitles.length; i++) {
      if (currentTime >= subtitles[i].from && currentTime <= subtitles[i].to) {
        return i;
      }
    }
    return -1;
  }
  
  // 二分查找起始点
  let left = 0;
  let right = subtitles.length - 1;
  
  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const subtitle = subtitles[mid];
    
    if (currentTime >= subtitle.from && currentTime <= subtitle.to) {
      return mid;
    } else if (currentTime < subtitle.from) {
      right = mid - 1;
    } else {
      left = mid + 1;
    }
  }
  
  return -1;
}

/**
 * DOM 元素池（复用 DOM 元素，减少创建/销毁开销）
 * @param {string} tagName - 元素标签名
 * @param {number} initialSize - 初始池大小
 * @returns {Object} - 包含 acquire() 和 release() 方法的对象
 */
export function createDOMPool(tagName, initialSize = 10) {
  const pool = [];
  const inUse = new Set();
  
  // 初始化池
  for (let i = 0; i < initialSize; i++) {
    pool.push(document.createElement(tagName));
  }
  
  return {
    /**
     * 获取一个元素
     * @returns {Element}
     */
    acquire() {
      let element;
      if (pool.length > 0) {
        element = pool.pop();
      } else {
        element = document.createElement(tagName);
      }
      inUse.add(element);
      return element;
    },
    
    /**
     * 释放一个元素
     * @param {Element} element
     */
    release(element) {
      if (!inUse.has(element)) return;
      
      // 清理元素状态
      element.className = '';
      element.textContent = '';
      element.removeAttribute('style');
      
      inUse.delete(element);
      pool.push(element);
    },
    
    /**
     * 获取统计信息
     * @returns {Object}
     */
    getStats() {
      return {
        poolSize: pool.length,
        inUse: inUse.size,
        total: pool.length + inUse.size
      };
    },
    
    /**
     * 清空池
     */
    clear() {
      pool.length = 0;
      inUse.clear();
    }
  };
}

