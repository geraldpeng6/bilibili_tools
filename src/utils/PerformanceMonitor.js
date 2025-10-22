/**
 * 性能监控模块
 * 用于监控和分析各个模块的性能
 */

import logger from './DebugLogger.js';

class PerformanceMonitor {
  constructor() {
    this.enabled = true;
  }

  /**
   * 测量函数执行时间
   * @param {string} name - 操作名称
   * @param {Function} fn - 要执行的函数
   * @returns {*} - 函数返回值
   */
  measure(name, fn) {
    if (!this.enabled) {
      return fn();
    }

    const start = performance.now();
    let result;
    let error;

    try {
      result = fn();
    } catch (e) {
      error = e;
    }

    const duration = performance.now() - start;
    logger.debug('计时', `${name}: ${duration.toFixed(2)}ms`);

    if (error) {
      throw error;
    }

    return result;
  }

  /**
   * 测量异步函数执行时间
   * @param {string} name - 操作名称
   * @param {Function} fn - 要执行的异步函数
   * @returns {Promise<*>}
   */
  async measureAsync(name, fn) {
    if (!this.enabled) {
      return await fn();
    }

    const start = performance.now();
    let result;
    let error;

    try {
      result = await fn();
    } catch (e) {
      error = e;
    }

    const duration = performance.now() - start;
    logger.debug('计时', `${name}: ${duration.toFixed(2)}ms`);

    if (error) {
      throw error;
    }

    return result;
  }

  /**
   * 清理资源（占位方法）
   */
  destroy() {
    // 简化版本无需清理
  }
}

// 创建全局单例
export const performanceMonitor = new PerformanceMonitor();
export default performanceMonitor;

