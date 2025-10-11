/**
 * 通知模块
 * 统一的错误处理和用户提示机制
 */

import { TIMING } from '../constants.js';

class Notification {
  constructor() {
    this.toastElement = null;
    this.init();
  }

  /**
   * 初始化Toast元素
   */
  init() {
    this.toastElement = document.createElement('div');
    this.toastElement.className = 'notion-toast';
  }

  /**
   * 显示Toast提示
   * @param {string} message - 消息内容
   * @param {number} duration - 显示时长（毫秒）
   */
  showToast(message, duration = TIMING.TOAST_DURATION) {
    this.toastElement.textContent = message;
    document.body.appendChild(this.toastElement);
    
    setTimeout(() => this.toastElement.classList.add('show'), 10);

    setTimeout(() => {
      this.toastElement.classList.remove('show');
      setTimeout(() => {
        if (this.toastElement.parentNode) {
          document.body.removeChild(this.toastElement);
        }
      }, 300);
    }, duration);
  }

  /**
   * 显示成功消息
   * @param {string} message
   */
  success(message) {
    this.showToast(message);
  }

  /**
   * 显示警告消息
   * @param {string} message
   */
  warning(message) {
    this.showToast(message);
  }

  /**
   * 显示错误消息
   * @param {string} message
   * @param {boolean} useAlert - 是否同时使用alert（用于重要错误）
   */
  error(message, useAlert = false) {
    this.showToast(message, 3000);
    
    if (useAlert) {
      alert(message);
    }
  }

  /**
   * 显示信息消息
   * @param {string} message
   */
  info(message) {
    this.showToast(message);
  }

  /**
   * 处理错误（统一的错误处理逻辑）
   * @param {Error|string} error - 错误对象或错误信息
   * @param {string} context - 错误上下文（用于日志）
   * @param {boolean} silent - 是否静默处理（不显示给用户）
   * @param {boolean} useAlert - 是否使用alert
   */
  handleError(error, context = '', silent = false, useAlert = false) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // 记录到控制台
    console.error(`[Error] ${context}:`, error);
    
    // 显示给用户（如果不是静默模式）
    if (!silent) {
      this.error(errorMessage, useAlert);
    }
  }

  /**
   * 确认对话框
   * @param {string} message - 确认消息
   * @returns {boolean}
   */
  confirm(message) {
    return window.confirm(message);
  }
}

// 创建全局单例
export const notification = new Notification();
export default notification;

