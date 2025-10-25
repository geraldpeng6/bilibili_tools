/**
 * 调试日志模块
 * 提供可控的日志输出功能
 */

class DebugLogger {
  constructor() {
    // 从GM存储读取调试模式状态
    this.debugMode = GM_getValue('debug_mode', false);
    this.prefix = '[BilibiliTools]';
    
    // 日志级别定义
    this.LOG_LEVELS = {
      TRACE: 0,    // 最详细的调试信息
      DEBUG: 1,    // 调试信息
      INFO: 2,     // 一般信息
      SUCCESS: 3,  // 成功操作
      WARN: 4,     // 警告
      ERROR: 5     // 错误
    };
    
    // 当前日志级别：调试模式下显示所有，否则只显示警告和错误
    this.currentLevel = this.debugMode ? this.LOG_LEVELS.TRACE : this.LOG_LEVELS.WARN;
  }

  /**
   * 切换调试模式
   */
  toggleDebugMode() {
    this.debugMode = !this.debugMode;
    GM_setValue('debug_mode', this.debugMode);
    // 更新日志级别
    this.currentLevel = this.debugMode ? this.LOG_LEVELS.TRACE : this.LOG_LEVELS.WARN;
    // 切换调试模式时的提示始终显示
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
   * 追踪日志（最详细，仅调试模式）
   */
  trace(module, ...args) {
    if (this.currentLevel <= this.LOG_LEVELS.TRACE) {
      console.log(`🔍 [${module}]`, ...args);
    }
  }

  /**
   * 调试日志（仅在调试模式下输出）
   */
  debug(module, ...args) {
    if (this.currentLevel <= this.LOG_LEVELS.DEBUG) {
      console.log(`🐛 [${module}]`, ...args);
    }
  }

  /**
   * 信息日志（仅在调试模式下输出）
   */
  info(module, ...args) {
    if (this.currentLevel <= this.LOG_LEVELS.INFO) {
      console.info(`ℹ️ [${module}]`, ...args);
    }
  }
  
  /**
   * 成功日志（重要操作成功，仅调试模式）
   */
  success(module, ...args) {
    if (this.currentLevel <= this.LOG_LEVELS.SUCCESS) {
      console.log(`✅ [${module}]`, ...args);
    }
  }

  /**
   * 警告日志（始终输出）
   */
  warn(module, ...args) {
    if (this.currentLevel <= this.LOG_LEVELS.WARN) {
      console.warn(`⚠️ [${module}]`, ...args);
    }
  }

  /**
   * 错误日志（始终输出）
   */
  error(module, ...args) {
    if (this.currentLevel <= this.LOG_LEVELS.ERROR) {
      console.error(`❌ [${module}]`, ...args);
    }
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
