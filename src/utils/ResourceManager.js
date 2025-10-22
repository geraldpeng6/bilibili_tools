/**
 * 资源管理器
 * 统一管理定时器、事件监听器等资源
 */

import logger from './DebugLogger.js';

class ResourceManager {
  constructor() {
    this.resources = {
      eventBusSubscriptions: new Map(), // EventBus订阅
      domListeners: new Map(),          // DOM事件监听器
      mutationObservers: new Set(),     // MutationObserver
      intervals: new Map(),             // setInterval IDs (改为Map存储创建时间)
      timeouts: new Set(),              // setTimeout IDs
      rafIds: new Set(),                // requestAnimationFrame IDs
      audioContexts: new Set(),         // AudioContext实例
      customCleanups: new Set(),        // 自定义清理函数
    };
    this.isDestroyed = false;
    this.maxIntervalDuration = 300000; // 5分钟最大运行时间
    
    // 启动定期清理过期资源
    this.startAutoCleanup();
  }

  /**
   * 追踪 EventBus 订阅
   * @param {string} event - 事件名称
   * @param {Function} unsubscribe - 取消订阅函数
   * @param {string} module - 模块名称（用于分组清理）
   */
  trackEventBusSubscription(event, unsubscribe, module = 'default') {
    if (!this.resources.eventBusSubscriptions.has(module)) {
      this.resources.eventBusSubscriptions.set(module, []);
    }
    this.resources.eventBusSubscriptions.get(module).push({ event, unsubscribe });
  }

  /**
   * 追踪 DOM 事件监听器
   * @param {Element} element - DOM元素
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   * @param {Object} options - 事件选项
   */
  trackDOMListener(element, event, handler, options) {
    const key = Symbol('listener');
    this.resources.domListeners.set(key, { element, event, handler, options });
    element.addEventListener(event, handler, options);
    return key; // 返回key用于单独清理
  }

  /**
   * 移除特定的 DOM 监听器
   * @param {Symbol} key - 监听器key
   */
  removeDOMListener(key) {
    const listener = this.resources.domListeners.get(key);
    if (listener) {
      listener.element.removeEventListener(listener.event, listener.handler, listener.options);
      this.resources.domListeners.delete(key);
    }
  }

  /**
   * 追踪 MutationObserver
   * @param {MutationObserver} observer - MutationObserver实例
   */
  trackMutationObserver(observer) {
    this.resources.mutationObservers.add(observer);
    return observer;
  }

  /**
   * 追踪 setInterval（增强版：自动超时清理）
   * @param {Function} callback - 回调函数
   * @param {number} delay - 延迟
   * @param {number} maxDuration - 最大运行时间（毫秒），默认5分钟
   * @returns {number} - interval ID
   */
  trackInterval(callback, delay, maxDuration = this.maxIntervalDuration) {
    const startTime = Date.now();
    const id = setInterval(() => {
      // 检查是否超时
      if (Date.now() - startTime > maxDuration) {
        logger.warn('ResourceManager', `定时器${id}运行超过${maxDuration}ms，自动清理`);
        this.clearTrackedInterval(id);
        return;
      }
      callback();
    }, delay);
    
    this.resources.intervals.set(id, {
      startTime,
      maxDuration,
      delay
    });
    return id;
  }

  /**
   * 清除特定 interval
   * @param {number} id - interval ID
   */
  clearTrackedInterval(id) {
    clearInterval(id);
    this.resources.intervals.delete(id);
  }

  /**
   * 追踪 setTimeout
   * @param {Function} callback - 回调函数
   * @param {number} delay - 延迟
   * @returns {number} - timeout ID
   */
  trackTimeout(callback, delay) {
    const id = setTimeout(() => {
      callback();
      this.resources.timeouts.delete(id);
    }, delay);
    this.resources.timeouts.add(id);
    return id;
  }

  /**
   * 清除特定 timeout
   * @param {number} id - timeout ID
   */
  clearTrackedTimeout(id) {
    clearTimeout(id);
    this.resources.timeouts.delete(id);
  }

  /**
   * 追踪 requestAnimationFrame
   * @param {Function} callback - 回调函数
   * @returns {number} - RAF ID
   */
  trackRAF(callback) {
    const id = requestAnimationFrame(callback);
    this.resources.rafIds.add(id);
    return id;
  }

  /**
   * 取消特定 RAF
   * @param {number} id - RAF ID
   */
  cancelTrackedRAF(id) {
    cancelAnimationFrame(id);
    this.resources.rafIds.delete(id);
  }

  /**
   * 追踪 AudioContext
   * @param {AudioContext} context - AudioContext实例
   */
  trackAudioContext(context) {
    this.resources.audioContexts.add(context);
    return context;
  }

  /**
   * 添加自定义清理函数
   * @param {Function} cleanup - 清理函数
   */
  addCleanup(cleanup) {
    this.resources.customCleanups.add(cleanup);
  }

  /**
   * 启动自动清理（定期检查并清理过期资源）
   */
  startAutoCleanup() {
    // 每30秒检查一次过期的interval
    this.autoCleanupInterval = setInterval(() => {
      this.cleanupExpiredIntervals();
    }, 30000);
  }

  /**
   * 清理超时运行的intervals
   */
  cleanupExpiredIntervals() {
    const now = Date.now();
    const toDelete = [];
    
    this.resources.intervals.forEach((info, id) => {
      if (now - info.startTime > info.maxDuration) {
        logger.warn('ResourceManager', `清理超时interval: ${id}, 运行了${((now - info.startTime) / 1000).toFixed(1)}秒`);
        clearInterval(id);
        toDelete.push(id);
      }
    });
    
    toDelete.forEach(id => this.resources.intervals.delete(id));
    
    if (toDelete.length > 0) {
      logger.debug('ResourceManager', `已清理${toDelete.length}个超时定时器`);
    }
  }

  /**
   * 获取资源统计信息
   */
  getStats() {
    return {
      intervals: this.resources.intervals.size,
      timeouts: this.resources.timeouts.size,
      rafIds: this.resources.rafIds.size,
      audioContexts: this.resources.audioContexts.size,
      domListeners: this.resources.domListeners.size,
      mutationObservers: this.resources.mutationObservers.size,
      eventBusSubscriptions: Array.from(this.resources.eventBusSubscriptions.values())
        .reduce((sum, subs) => sum + subs.length, 0)
    };
  }

  /**
   * 清理特定模块的 EventBus 订阅
   * @param {string} module - 模块名称
   */
  cleanupModule(module) {
    const subscriptions = this.resources.eventBusSubscriptions.get(module);
    if (subscriptions) {
      subscriptions.forEach(({ unsubscribe }) => {
        try {
          unsubscribe();
        } catch (error) {
          console.error(`[ResourceManager] 清理模块 "${module}" 订阅失败:`, error);
        }
      });
      this.resources.eventBusSubscriptions.delete(module);
    }
  }

  /**
   * 清理所有资源
   */
  cleanup() {
    if (this.isDestroyed) {
      logger.warn('ResourceManager', '已经销毁，跳过清理');
      return;
    }

    logger.debug('ResourceManager', '开始清理资源...');

    // 清理 EventBus 订阅
    this.resources.eventBusSubscriptions.forEach((subscriptions, module) => {
      subscriptions.forEach(({ event, unsubscribe }) => {
        try {
          unsubscribe();
        } catch (error) {
          console.error(`[ResourceManager] 清理 EventBus 订阅失败 (${module}.${event}):`, error);
        }
      });
    });
    this.resources.eventBusSubscriptions.clear();

    // 清理 DOM 事件监听器
    this.resources.domListeners.forEach(({ element, event, handler, options }) => {
      try {
        element.removeEventListener(event, handler, options);
      } catch (error) {
        console.error('[ResourceManager] 清理 DOM 监听器失败:', error);
      }
    });
    this.resources.domListeners.clear();

    // 清理 MutationObserver
    this.resources.mutationObservers.forEach(observer => {
      try {
        observer.disconnect();
      } catch (error) {
        console.error('[ResourceManager] 清理 MutationObserver 失败:', error);
      }
    });
    this.resources.mutationObservers.clear();

    // 清理 intervals (更新为Map结构)
    this.resources.intervals.forEach((info, id) => {
      try {
        clearInterval(id);
      } catch (error) {
        console.error('[ResourceManager] 清理 interval 失败:', error);
      }
    });
    this.resources.intervals.clear();
    
    // 清理自动清理定时器
    if (this.autoCleanupInterval) {
      clearInterval(this.autoCleanupInterval);
      this.autoCleanupInterval = null;
    }

    // 清理 timeouts
    this.resources.timeouts.forEach(id => {
      try {
        clearTimeout(id);
      } catch (error) {
        console.error('[ResourceManager] 清理 timeout 失败:', error);
      }
    });
    this.resources.timeouts.clear();

    // 清理 RAF
    this.resources.rafIds.forEach(id => {
      try {
        cancelAnimationFrame(id);
      } catch (error) {
        console.error('[ResourceManager] 清理 RAF 失败:', error);
      }
    });
    this.resources.rafIds.clear();

    // 清理 AudioContext
    this.resources.audioContexts.forEach(context => {
      try {
        if (context.state !== 'closed') {
          context.close();
        }
      } catch (error) {
        console.error('[ResourceManager] 关闭 AudioContext 失败:', error);
      }
    });
    this.resources.audioContexts.clear();

    // 执行自定义清理函数
    this.resources.customCleanups.forEach(cleanup => {
      try {
        cleanup();
      } catch (error) {
        console.error('[ResourceManager] 执行自定义清理失败:', error);
      }
    });
    this.resources.customCleanups.clear();

    this.isDestroyed = true;
    logger.debug('ResourceManager', '资源清理完成');
  }

  /**
   * 获取资源统计信息
   * @returns {Object} - 资源统计
   */
  getStats() {
    return {
      eventBusSubscriptions: Array.from(this.resources.eventBusSubscriptions.entries()).reduce(
        (acc, [module, subs]) => {
          acc[module] = subs.length;
          return acc;
        }, 
        {}
      ),
      domListeners: this.resources.domListeners.size,
      mutationObservers: this.resources.mutationObservers.size,
      intervals: this.resources.intervals.size,
      timeouts: this.resources.timeouts.size,
      rafIds: this.resources.rafIds.size,
      audioContexts: this.resources.audioContexts.size,
      customCleanups: this.resources.customCleanups.size,
    };
  }
}

// 创建全局单例
export const resourceManager = new ResourceManager();
export default resourceManager;

