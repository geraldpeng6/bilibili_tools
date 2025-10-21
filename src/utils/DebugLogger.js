/**
 * 调试日志模块
 * 提供可控的日志输出功能
 */

class DebugLogger {
  constructor() {
    // 从GM存储读取调试模式状态
    this.debugMode = GM_getValue('debug_mode', false);
    this.prefix = '[BilibiliTools]';
  }

  /**
   * 切换调试模式
   */
  toggleDebugMode() {
    this.debugMode = !this.debugMode;
    GM_setValue('debug_mode', this.debugMode);
    console.log(`${this.prefix} 调试模式: ${this.debugMode ? '开启' : '关闭'}`);
    return this.debugMode;
  }

  /**
   * 获取调试模式状态
   */
  isDebugMode() {
    return this.debugMode;
  }

  /**
   * 调试日志（仅在调试模式下输出）
   */
  debug(module, ...args) {
    if (this.debugMode) {
      console.log(`[${module}]`, ...args);
    }
  }

  /**
   * 信息日志（始终输出重要信息）
   */
  info(module, ...args) {
    console.log(`[${module}]`, ...args);
  }

  /**
   * 警告日志（始终输出）
   */
  warn(module, ...args) {
    console.warn(`[${module}]`, ...args);
  }

  /**
   * 错误日志（始终输出）
   */
  error(module, ...args) {
    console.error(`[${module}]`, ...args);
  }

  /**
   * 分组日志（仅在调试模式下）
   */
  group(module, title) {
    if (this.debugMode) {
      console.group(`[${module}] ${title}`);
    }
  }

  /**
   * 结束分组
   */
  groupEnd() {
    if (this.debugMode) {
      console.groupEnd();
    }
  }

  /**
   * 表格日志（仅在调试模式下）
   */
  table(module, data) {
    if (this.debugMode) {
      console.log(`[${module}] 数据表格:`);
      console.table(data);
    }
  }

  /**
   * 性能计时开始
   */
  time(label) {
    if (this.debugMode) {
      console.time(label);
    }
  }

  /**
   * 性能计时结束
   */
  timeEnd(label) {
    if (this.debugMode) {
      console.timeEnd(label);
    }
  }
}

// 创建全局单例
export const logger = new DebugLogger();
export default logger;
