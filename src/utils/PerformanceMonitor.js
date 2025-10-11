/**
 * 性能监控器
 * 监控关键操作耗时和资源使用
 */

class PerformanceMonitor {
  constructor() {
    this.metrics = new Map();
    this.enabled = true; // 生产环境可设为false
    this.slowOperationThreshold = 100; // 超过100ms警告
    this.memoryCheckInterval = null;
    this.lastMemoryCheck = null;
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
    this.recordMetric(name, duration);

    if (duration > this.slowOperationThreshold) {
      console.warn(`[性能] ${name} 耗时 ${duration.toFixed(2)}ms (超过阈值${this.slowOperationThreshold}ms)`);
    }

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
    this.recordMetric(name, duration);

    if (duration > this.slowOperationThreshold) {
      console.warn(`[性能] ${name} 耗时 ${duration.toFixed(2)}ms (超过阈值${this.slowOperationThreshold}ms)`);
    }

    if (error) {
      throw error;
    }

    return result;
  }

  /**
   * 记录性能指标
   * @param {string} name - 指标名称
   * @param {number} duration - 耗时（毫秒）
   */
  recordMetric(name, duration) {
    if (!this.metrics.has(name)) {
      this.metrics.set(name, {
        count: 0,
        totalTime: 0,
        minTime: Infinity,
        maxTime: 0,
        avgTime: 0
      });
    }

    const metric = this.metrics.get(name);
    metric.count++;
    metric.totalTime += duration;
    metric.minTime = Math.min(metric.minTime, duration);
    metric.maxTime = Math.max(metric.maxTime, duration);
    metric.avgTime = metric.totalTime / metric.count;
  }

  /**
   * 标记时间点
   * @param {string} markName - 标记名称
   */
  mark(markName) {
    if (this.enabled) {
      performance.mark(markName);
    }
  }

  /**
   * 测量两个标记之间的时间
   * @param {string} measureName - 测量名称
   * @param {string} startMark - 开始标记
   * @param {string} endMark - 结束标记
   */
  measureBetween(measureName, startMark, endMark) {
    if (!this.enabled) return;

    try {
      performance.measure(measureName, startMark, endMark);
      const measure = performance.getEntriesByName(measureName)[0];
      if (measure) {
        this.recordMetric(measureName, measure.duration);
        
        if (measure.duration > this.slowOperationThreshold) {
          console.warn(`[性能] ${measureName} 耗时 ${measure.duration.toFixed(2)}ms`);
        }
      }
    } catch (error) {
      console.error('[性能] 测量失败:', error);
    }
  }

  /**
   * 获取内存使用情况
   */
  getMemoryUsage() {
    if (performance.memory) {
      return {
        usedJSHeapSize: (performance.memory.usedJSHeapSize / 1048576).toFixed(2) + ' MB',
        totalJSHeapSize: (performance.memory.totalJSHeapSize / 1048576).toFixed(2) + ' MB',
        jsHeapSizeLimit: (performance.memory.jsHeapSizeLimit / 1048576).toFixed(2) + ' MB',
        usage: ((performance.memory.usedJSHeapSize / performance.memory.jsHeapSizeLimit) * 100).toFixed(2) + '%'
      };
    }
    return null;
  }

  /**
   * 启动内存监控
   */
  startMemoryMonitoring(interval = 60000) {
    if (!this.enabled || !performance.memory) return;

    this.memoryCheckInterval = setInterval(() => {
      const memory = this.getMemoryUsage();
      const usage = parseFloat(memory.usage);
      
      if (usage > 80) {
        console.warn(`[性能] 内存使用率过高: ${memory.usage}`, memory);
      }
      
      this.lastMemoryCheck = memory;
    }, interval);
  }

  /**
   * 停止内存监控
   */
  stopMemoryMonitoring() {
    if (this.memoryCheckInterval) {
      clearInterval(this.memoryCheckInterval);
      this.memoryCheckInterval = null;
    }
  }

  /**
   * 获取性能报告
   */
  getReport() {
    const report = {
      metrics: {},
      memory: this.getMemoryUsage(),
      timestamp: new Date().toISOString()
    };

    this.metrics.forEach((metric, name) => {
      report.metrics[name] = {
        调用次数: metric.count,
        总耗时: metric.totalTime.toFixed(2) + 'ms',
        平均耗时: metric.avgTime.toFixed(2) + 'ms',
        最小耗时: metric.minTime.toFixed(2) + 'ms',
        最大耗时: metric.maxTime.toFixed(2) + 'ms'
      };
    });

    return report;
  }

  /**
   * 打印性能报告到控制台
   */
  printReport() {
    if (!this.enabled) return;

    console.group('📊 性能监控报告');
    console.log('生成时间:', new Date().toLocaleString());
    
    if (this.lastMemoryCheck) {
      console.group('💾 内存使用');
      console.table(this.lastMemoryCheck);
      console.groupEnd();
    }
    
    if (this.metrics.size > 0) {
      console.group('⏱️ 性能指标');
      const report = this.getReport();
      console.table(report.metrics);
      console.groupEnd();
    }
    
    console.groupEnd();
  }

  /**
   * 重置所有指标
   */
  reset() {
    this.metrics.clear();
    this.lastMemoryCheck = null;
  }

  /**
   * 清理资源
   */
  destroy() {
    this.stopMemoryMonitoring();
    this.reset();
  }
}

// 创建全局单例
export const performanceMonitor = new PerformanceMonitor();
export default performanceMonitor;

// 在开发环境启动内存监控
if (typeof GM_info !== 'undefined' && GM_info.script.version.includes('dev')) {
  performanceMonitor.startMemoryMonitoring();
}

