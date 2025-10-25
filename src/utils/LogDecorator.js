/**
 * 日志装饰器工具
 * 提供方法级别的自动日志记录功能
 */

import logger from './DebugLogger.js';

/**
 * 日志装饰器类
 * 用于自动记录方法的调用、参数、返回值和执行时间
 */
class LogDecorator {
  /**
   * 装饰一个类，为其所有方法添加日志
   * @param {Class} targetClass - 目标类
   * @param {string} moduleName - 模块名称
   * @param {Object} options - 选项
   * @returns {Class} 装饰后的类
   */
  static decorateClass(targetClass, moduleName, options = {}) {
    const {
      includeMethods = [],  // 指定要装饰的方法，空数组表示全部
      excludeMethods = [],  // 排除的方法
      logLevel = 'trace',   // 日志级别
      logArgs = true,       // 是否记录参数
      logReturn = true,     // 是否记录返回值
      logTime = true        // 是否记录执行时间
    } = options;

    const prototype = targetClass.prototype;
    const methodNames = Object.getOwnPropertyNames(prototype);

    methodNames.forEach(methodName => {
      // 跳过构造函数和私有方法
      if (methodName === 'constructor' || methodName.startsWith('_')) {
        return;
      }

      // 检查是否应该装饰这个方法
      if (excludeMethods.includes(methodName)) {
        return;
      }
      if (includeMethods.length > 0 && !includeMethods.includes(methodName)) {
        return;
      }

      const originalMethod = prototype[methodName];
      
      // 只装饰函数
      if (typeof originalMethod !== 'function') {
        return;
      }

      // 替换为装饰后的方法
      prototype[methodName] = function(...args) {
        const startTime = logTime ? performance.now() : 0;
        
        // 记录方法调用
        if (logger.isDebugMode()) {
          logger.trace(moduleName, `→ ${methodName}()${logArgs && args.length > 0 ? ' with args:' : ''}`);
          if (logArgs && args.length > 0) {
            args.forEach((arg, index) => {
              logger.trace(moduleName, `  [${index}]:`, this._formatArgument(arg));
            });
          }
        }

        try {
          // 调用原始方法
          const result = originalMethod.apply(this, args);

          // 处理Promise
          if (result instanceof Promise) {
            return result.then(value => {
              if (logger.isDebugMode()) {
                const duration = logTime ? (performance.now() - startTime).toFixed(2) : 0;
                logger.trace(moduleName, `← ${methodName}() async completed${logTime ? ` in ${duration}ms` : ''}`);
                if (logReturn && value !== undefined) {
                  logger.trace(moduleName, `  Return:`, this._formatArgument(value));
                }
              }
              return value;
            }).catch(error => {
              if (logger.isDebugMode()) {
                const duration = logTime ? (performance.now() - startTime).toFixed(2) : 0;
                logger.error(moduleName, `✗ ${methodName}() failed${logTime ? ` after ${duration}ms` : ''}:`, error);
              }
              throw error;
            });
          }

          // 同步方法
          if (logger.isDebugMode()) {
            const duration = logTime ? (performance.now() - startTime).toFixed(2) : 0;
            logger.trace(moduleName, `← ${methodName}()${logTime ? ` in ${duration}ms` : ''}`);
            if (logReturn && result !== undefined) {
              logger.trace(moduleName, `  Return:`, this._formatArgument(result));
            }
          }

          return result;
        } catch (error) {
          if (logger.isDebugMode()) {
            const duration = logTime ? (performance.now() - startTime).toFixed(2) : 0;
            logger.error(moduleName, `✗ ${methodName}() failed${logTime ? ` after ${duration}ms` : ''}:`, error);
          }
          throw error;
        }
      };

      // 保留原始方法的名称
      Object.defineProperty(prototype[methodName], 'name', {
        value: methodName,
        configurable: true
      });
    });

    // 添加格式化参数的辅助方法
    prototype._formatArgument = function(arg) {
      if (arg === null) return 'null';
      if (arg === undefined) return 'undefined';
      
      const type = typeof arg;
      
      if (type === 'string') {
        return arg.length > 100 ? `"${arg.substring(0, 100)}..."` : `"${arg}"`;
      }
      
      if (type === 'number' || type === 'boolean') {
        return arg;
      }
      
      if (type === 'function') {
        return `[Function: ${arg.name || 'anonymous'}]`;
      }
      
      if (Array.isArray(arg)) {
        return `[Array(${arg.length})]`;
      }
      
      if (arg instanceof Error) {
        return `[Error: ${arg.message}]`;
      }
      
      if (type === 'object') {
        const keys = Object.keys(arg);
        if (keys.length <= 3) {
          return JSON.stringify(arg);
        }
        return `{${keys.slice(0, 3).join(', ')}...}`;
      }
      
      return String(arg);
    };

    return targetClass;
  }

  /**
   * 装饰单个方法
   * @param {Function} method - 要装饰的方法
   * @param {string} moduleName - 模块名称
   * @param {string} methodName - 方法名称
   * @param {Object} options - 选项
   * @returns {Function} 装饰后的方法
   */
  static decorateMethod(method, moduleName, methodName, options = {}) {
    const {
      logLevel = 'trace',
      logArgs = true,
      logReturn = true,
      logTime = true
    } = options;

    return function(...args) {
      const startTime = logTime ? performance.now() : 0;
      
      // 记录方法调用
      if (logger.isDebugMode()) {
        logger.trace(moduleName, `→ ${methodName}()${logArgs && args.length > 0 ? ' with args:' : ''}`);
        if (logArgs && args.length > 0) {
          args.forEach((arg, index) => {
            logger.trace(moduleName, `  [${index}]:`, LogDecorator.formatArgument(arg));
          });
        }
      }

      try {
        const result = method.apply(this, args);

        // 处理Promise
        if (result instanceof Promise) {
          return result.then(value => {
            if (logger.isDebugMode()) {
              const duration = logTime ? (performance.now() - startTime).toFixed(2) : 0;
              logger.trace(moduleName, `← ${methodName}() async completed${logTime ? ` in ${duration}ms` : ''}`);
              if (logReturn && value !== undefined) {
                logger.trace(moduleName, `  Return:`, LogDecorator.formatArgument(value));
              }
            }
            return value;
          }).catch(error => {
            if (logger.isDebugMode()) {
              const duration = logTime ? (performance.now() - startTime).toFixed(2) : 0;
              logger.error(moduleName, `✗ ${methodName}() failed${logTime ? ` after ${duration}ms` : ''}:`, error);
            }
            throw error;
          });
        }

        // 同步方法
        if (logger.isDebugMode()) {
          const duration = logTime ? (performance.now() - startTime).toFixed(2) : 0;
          logger.trace(moduleName, `← ${methodName}()${logTime ? ` in ${duration}ms` : ''}`);
          if (logReturn && result !== undefined) {
            logger.trace(moduleName, `  Return:`, LogDecorator.formatArgument(result));
          }
        }

        return result;
      } catch (error) {
        if (logger.isDebugMode()) {
          const duration = logTime ? (performance.now() - startTime).toFixed(2) : 0;
          logger.error(moduleName, `✗ ${methodName}() failed${logTime ? ` after ${duration}ms` : ''}:`, error);
        }
        throw error;
      }
    };
  }

  /**
   * 格式化参数（静态方法版本）
   */
  static formatArgument(arg) {
    if (arg === null) return 'null';
    if (arg === undefined) return 'undefined';
    
    const type = typeof arg;
    
    if (type === 'string') {
      return arg.length > 100 ? `"${arg.substring(0, 100)}..."` : `"${arg}"`;
    }
    
    if (type === 'number' || type === 'boolean') {
      return arg;
    }
    
    if (type === 'function') {
      return `[Function: ${arg.name || 'anonymous'}]`;
    }
    
    if (Array.isArray(arg)) {
      return `[Array(${arg.length})]`;
    }
    
    if (arg instanceof Error) {
      return `[Error: ${arg.message}]`;
    }
    
    if (type === 'object') {
      const keys = Object.keys(arg);
      if (keys.length <= 3) {
        try {
          return JSON.stringify(arg);
        } catch {
          return `{${keys.slice(0, 3).join(', ')}...}`;
        }
      }
      return `{${keys.slice(0, 3).join(', ')}...}`;
    }
    
    return String(arg);
  }

  /**
   * 创建一个带模块名称的日志记录器
   * @param {string} moduleName - 模块名称
   * @returns {Object} 日志记录器对象
   */
  static createModuleLogger(moduleName) {
    return {
      trace: (...args) => logger.trace(moduleName, ...args),
      debug: (...args) => logger.debug(moduleName, ...args),
      info: (...args) => logger.info(moduleName, ...args),
      success: (...args) => logger.success(moduleName, ...args),
      warn: (...args) => logger.warn(moduleName, ...args),
      error: (...args) => logger.error(moduleName, ...args),
      group: (title) => logger.group(moduleName, title),
      groupEnd: () => logger.groupEnd(),
      table: (data) => logger.table(moduleName, data),
      time: (label) => logger.time(`${moduleName}-${label}`),
      timeEnd: (label) => logger.timeEnd(`${moduleName}-${label}`)
    };
  }
}

export default LogDecorator;
