/**
 * AudioContext池化管理器
 * 复用AudioContext实例，避免频繁创建和销毁
 */

class AudioContextPool {
  constructor() {
    this.pool = new Map(); // 存储 media -> AudioContext 的映射
    this.maxPoolSize = 5; // 最大池大小
    this.globalContext = null; // 全局共享的AudioContext
  }

  /**
   * 获取或创建AudioContext
   * @param {HTMLMediaElement} media - 媒体元素
   * @param {boolean} useGlobal - 是否使用全局共享Context
   * @returns {Object} - { context, source, analyzer }
   */
  getOrCreate(media, useGlobal = false) {
    // 如果使用全局Context
    if (useGlobal) {
      return this.getGlobalContext(media);
    }

    // 检查是否已有此媒体的Context
    if (this.pool.has(media)) {
      const existing = this.pool.get(media);
      // 验证Context是否还有效
      if (existing.context.state !== 'closed') {
        return existing;
      } else {
        // 如果已关闭，从池中移除
        this.pool.delete(media);
      }
    }

    // 池已满，清理最久未使用的
    if (this.pool.size >= this.maxPoolSize) {
      this.evictOldest();
    }

    // 创建新的AudioContext
    const context = new (window.AudioContext || window.webkitAudioContext)();
    const source = context.createMediaElementSource(media);
    const analyser = context.createAnalyser();
    
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyser.connect(context.destination);

    const entry = {
      context,
      source,
      analyser,
      media,
      lastUsed: Date.now()
    };

    this.pool.set(media, entry);
    return entry;
  }

  /**
   * 获取全局共享AudioContext
   * @param {HTMLMediaElement} media - 媒体元素
   */
  getGlobalContext(media) {
    if (!this.globalContext || this.globalContext.state === 'closed') {
      this.globalContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    // 为媒体创建source和analyser
    const source = this.globalContext.createMediaElementSource(media);
    const analyser = this.globalContext.createAnalyser();
    
    analyser.fftSize = 2048;
    source.connect(analyser);
    analyser.connect(this.globalContext.destination);

    return {
      context: this.globalContext,
      source,
      analyser,
      media
    };
  }

  /**
   * 断开连接但保留Context
   * @param {HTMLMediaElement} media - 媒体元素
   */
  disconnect(media) {
    const entry = this.pool.get(media);
    if (entry) {
      try {
        // 断开连接但不关闭Context，可以复用
        if (entry.source) {
          entry.source.disconnect();
        }
        if (entry.analyser) {
          entry.analyser.disconnect();
        }
      } catch (error) {
        console.warn('[AudioContextPool] 断开连接失败:', error);
      }
    }
  }

  /**
   * 移除并关闭AudioContext
   * @param {HTMLMediaElement} media - 媒体元素
   */
  remove(media) {
    const entry = this.pool.get(media);
    if (entry) {
      try {
        if (entry.context && entry.context.state !== 'closed') {
          entry.context.close();
        }
      } catch (error) {
        console.warn('[AudioContextPool] 关闭Context失败:', error);
      }
      this.pool.delete(media);
    }
  }

  /**
   * 清理最久未使用的AudioContext
   */
  evictOldest() {
    let oldest = null;
    let oldestTime = Date.now();

    this.pool.forEach((entry, media) => {
      if (entry.lastUsed < oldestTime) {
        oldestTime = entry.lastUsed;
        oldest = media;
      }
    });

    if (oldest) {
      console.log('[AudioContextPool] 池已满，清理最旧的Context');
      this.remove(oldest);
    }
  }

  /**
   * 更新最后使用时间
   * @param {HTMLMediaElement} media - 媒体元素
   */
  touch(media) {
    const entry = this.pool.get(media);
    if (entry) {
      entry.lastUsed = Date.now();
    }
  }

  /**
   * 清理所有AudioContext
   */
  clear() {
    this.pool.forEach((entry, media) => {
      try {
        if (entry.context && entry.context.state !== 'closed') {
          entry.context.close();
        }
      } catch (error) {
        console.warn('[AudioContextPool] 清理失败:', error);
      }
    });
    this.pool.clear();

    // 清理全局Context
    if (this.globalContext && this.globalContext.state !== 'closed') {
      try {
        this.globalContext.close();
      } catch (error) {
        console.warn('[AudioContextPool] 清理全局Context失败:', error);
      }
      this.globalContext = null;
    }
  }

  /**
   * 获取池统计信息
   */
  getStats() {
    return {
      poolSize: this.pool.size,
      maxPoolSize: this.maxPoolSize,
      hasGlobalContext: !!this.globalContext,
      contexts: Array.from(this.pool.entries()).map(([media, entry]) => ({
        mediaTagName: media.tagName,
        contextState: entry.context.state,
        lastUsed: new Date(entry.lastUsed).toLocaleTimeString()
      }))
    };
  }
}

// 创建全局单例
export const audioContextPool = new AudioContextPool();
export default audioContextPool;

