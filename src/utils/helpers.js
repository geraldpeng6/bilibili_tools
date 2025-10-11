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

