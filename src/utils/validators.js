/**
 * 验证工具模块
 * 提供各种输入验证和格式检查功能
 */

import { REGEX, LIMITS } from '../constants.js';

/**
 * 验证Notion Page ID格式
 * @param {string} pageId - Page ID
 * @returns {{valid: boolean, cleaned: string|null, error: string|null}}
 */
export function validateNotionPageId(pageId) {
  if (!pageId || typeof pageId !== 'string') {
    return { valid: false, cleaned: null, error: 'Page ID不能为空' };
  }

  // 移除URL，只保留ID
  let cleanedId = pageId.split('?')[0].split('#')[0];
  
  // 提取32位ID
  const match = cleanedId.match(REGEX.NOTION_PAGE_ID);
  if (!match) {
    return { valid: false, cleaned: null, error: 'Page ID格式错误，应为32位十六进制字符' };
  }
  
  // 移除横线，统一格式
  cleanedId = match[1].replace(/-/g, '');
  
  // 验证长度
  if (cleanedId.length !== LIMITS.NOTION_PAGE_ID_LENGTH) {
    return { valid: false, cleaned: null, error: `Page ID长度错误，需要${LIMITS.NOTION_PAGE_ID_LENGTH}位字符` };
  }
  
  return { valid: true, cleaned: cleanedId, error: null };
}

/**
 * 验证API URL格式
 * @param {string} url - API URL
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateApiUrl(url) {
  if (!url || typeof url !== 'string') {
    return { valid: false, error: 'URL不能为空' };
  }
  
  // 检查是否以http或https开头
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    return { valid: false, error: 'URL必须以 http:// 或 https:// 开头' };
  }
  
  // 尝试解析URL
  try {
    new URL(url);
    return { valid: true, error: null };
  } catch (e) {
    return { valid: false, error: 'URL格式无效' };
  }
}

/**
 * 验证API Key格式
 * @param {string} apiKey - API Key
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateApiKey(apiKey) {
  if (!apiKey || typeof apiKey !== 'string') {
    return { valid: false, error: 'API Key不能为空' };
  }
  
  if (apiKey.trim().length === 0) {
    return { valid: false, error: 'API Key不能为空' };
  }
  
  // 基本长度检查（大多数API Key至少10个字符）
  if (apiKey.length < 10) {
    return { valid: false, error: 'API Key长度过短，请检查是否完整' };
  }
  
  return { valid: true, error: null };
}

/**
 * 验证视频信息
 * @param {{bvid: string, cid: string|number}} videoInfo - 视频信息
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateVideoInfo(videoInfo) {
  if (!videoInfo) {
    return { valid: false, error: '视频信息为空' };
  }
  
  if (!videoInfo.bvid || !videoInfo.bvid.match(/^BV[1-9A-Za-z]{10}$/)) {
    return { valid: false, error: 'BV号格式错误' };
  }
  
  if (!videoInfo.cid) {
    return { valid: false, error: 'CID为空' };
  }
  
  return { valid: true, error: null };
}

/**
 * 验证字幕数据
 * @param {Array} subtitleData - 字幕数据数组
 * @returns {{valid: boolean, error: string|null}}
 */
export function validateSubtitleData(subtitleData) {
  if (!Array.isArray(subtitleData)) {
    return { valid: false, error: '字幕数据格式错误' };
  }
  
  if (subtitleData.length === 0) {
    return { valid: false, error: '字幕数据为空' };
  }
  
  // 检查第一条字幕的格式
  const first = subtitleData[0];
  if (!first.from || !first.to || !first.content) {
    return { valid: false, error: '字幕数据格式不完整' };
  }
  
  return { valid: true, error: null };
}

/**
 * 安全地生成缓存键
 * @param {{bvid: string, cid: string|number}} videoInfo - 视频信息
 * @returns {string|null} - 缓存键，如果无效返回null
 */
export function generateCacheKey(videoInfo) {
  const validation = validateVideoInfo(videoInfo);
  if (!validation.valid) {
    return null;
  }
  
  return `${videoInfo.bvid}-${videoInfo.cid}`;
}

