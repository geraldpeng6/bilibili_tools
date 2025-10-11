/**
 * 事件总线模块
 * 用于解耦不同模块之间的通信
 */

class EventBus {
  constructor() {
    this.events = new Map();
  }

  /**
   * 订阅事件
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   * @returns {Function} - 取消订阅的函数
   */
  on(event, handler) {
    if (!this.events.has(event)) {
      this.events.set(event, []);
    }
    
    this.events.get(event).push(handler);
    
    // 返回取消订阅的函数
    return () => this.off(event, handler);
  }

  /**
   * 订阅一次性事件
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   */
  once(event, handler) {
    const onceHandler = (...args) => {
      handler(...args);
      this.off(event, onceHandler);
    };
    
    this.on(event, onceHandler);
  }

  /**
   * 取消订阅事件
   * @param {string} event - 事件名称
   * @param {Function} handler - 事件处理函数
   */
  off(event, handler) {
    if (!this.events.has(event)) return;
    
    const handlers = this.events.get(event);
    const index = handlers.indexOf(handler);
    
    if (index > -1) {
      handlers.splice(index, 1);
    }
    
    // 如果没有处理函数了，删除整个事件
    if (handlers.length === 0) {
      this.events.delete(event);
    }
  }

  /**
   * 触发事件
   * @param {string} event - 事件名称
   * @param {...any} args - 传递给处理函数的参数
   */
  emit(event, ...args) {
    if (!this.events.has(event)) return;
    
    const handlers = [...this.events.get(event)]; // 复制数组，避免在遍历时被修改
    
    for (const handler of handlers) {
      try {
        handler(...args);
      } catch (error) {
        console.error(`[EventBus] 事件 "${event}" 处理出错:`, error);
      }
    }
  }

  /**
   * 清空所有事件监听器
   */
  clear() {
    this.events.clear();
  }

  /**
   * 获取某个事件的监听器数量
   * @param {string} event - 事件名称
   * @returns {number}
   */
  listenerCount(event) {
    return this.events.has(event) ? this.events.get(event).length : 0;
  }
}

// 创建全局单例
export const eventBus = new EventBus();
export default eventBus;

