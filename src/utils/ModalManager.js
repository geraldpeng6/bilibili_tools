/**
 * 模态框管理器
 * 统一管理所有模态框的显示、隐藏和ESC键处理
 */

import logger from './DebugLogger.js';

class ModalManager {
  constructor() {
    this.stack = []; // 模态框堆栈
    this.escHandler = null;
    this.init();
  }

  /**
   * 初始化管理器
   */
  init() {
    // 全局ESC键处理器
    this.escHandler = (e) => {
      if (e.key === 'Escape' && this.stack.length > 0) {
        // 只关闭最顶层的模态框
        const topModal = this.stack[this.stack.length - 1];
        if (topModal && typeof topModal.hide === 'function') {
          topModal.hide();
        }
      }
    };
    
    document.addEventListener('keydown', this.escHandler);
  }

  /**
   * 注册并显示模态框
   * @param {Object} modal - 模态框实例（需有hide方法）
   */
  push(modal) {
    if (!modal || typeof modal.hide !== 'function') {
      logger.warn('ModalManager', '模态框实例必须有hide方法');
      return;
    }

    // 避免重复添加
    const index = this.stack.indexOf(modal);
    if (index === -1) {
      this.stack.push(modal);
    }
  }

  /**
   * 移除模态框
   * @param {Object} modal - 模态框实例
   */
  pop(modal) {
    const index = this.stack.indexOf(modal);
    if (index > -1) {
      this.stack.splice(index, 1);
    }
  }

  /**
   * 关闭所有模态框
   */
  closeAll() {
    // 从顶层开始关闭
    while (this.stack.length > 0) {
      const modal = this.stack.pop();
      if (modal && typeof modal.hide === 'function') {
        modal.hide();
      }
    }
  }

  /**
   * 获取当前模态框堆栈长度
   */
  getStackSize() {
    return this.stack.length;
  }

  /**
   * 检查某个模态框是否在堆栈中
   * @param {Object} modal - 模态框实例
   */
  isInStack(modal) {
    return this.stack.includes(modal);
  }

  /**
   * 清理资源
   */
  destroy() {
    if (this.escHandler) {
      document.removeEventListener('keydown', this.escHandler);
      this.escHandler = null;
    }
    this.stack = [];
  }
}

// 创建全局单例
export const modalManager = new ModalManager();
export default modalManager;

