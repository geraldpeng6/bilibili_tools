/**
 * 任务管理器
 * 用于管理后台任务，确保视频切换时数据正确绑定
 */

import logger from './DebugLogger.js';
import { STORAGE_KEYS } from '../constants.js';
import { generateCacheKey } from './validators.js';

class TaskManager {
  constructor() {
    // 存储正在进行的任务
    this.activeTasks = new Map();
    
    // 已处理视频记录（避免重复自动处理）
    this.processedVideos = this._loadProcessedVideos();
    
    // 任务队列
    this.taskQueue = [];
    
    // 监听页面卸载，保存状态
    window.addEventListener('beforeunload', () => {
      this._saveProcessedVideos();
    });
  }
  
  /**
   * 加载已处理的视频记录
   * @private
   * @returns {Set}
   */
  _loadProcessedVideos() {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.PROCESSED_VIDEOS);
      if (stored) {
        const data = JSON.parse(stored);
        // 只保留最近30天的记录
        const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const filtered = Object.entries(data)
          .filter(([, timestamp]) => timestamp > thirtyDaysAgo)
          .map(([videoKey]) => videoKey);
        return new Set(filtered);
      }
    } catch (error) {
      logger.error('TaskManager', '加载已处理视频记录失败:', error);
    }
    return new Set();
  }
  
  /**
   * 保存已处理的视频记录
   * @private
   */
  _saveProcessedVideos() {
    try {
      const data = {};
      this.processedVideos.forEach(videoKey => {
        data[videoKey] = Date.now();
      });
      localStorage.setItem(STORAGE_KEYS.PROCESSED_VIDEOS, JSON.stringify(data));
    } catch (error) {
      logger.error('TaskManager', '保存已处理视频记录失败:', error);
    }
  }
  
  /**
   * 检查视频是否已经自动处理过
   * @param {string|Object} videoKeyOrInfo - 视频缓存键或视频信息对象
   * @returns {boolean}
   */
  isVideoProcessed(videoKeyOrInfo) {
    // 如果传入的是对象，生成缓存键
    const videoKey = typeof videoKeyOrInfo === 'string' 
      ? videoKeyOrInfo 
      : generateCacheKey(videoKeyOrInfo);
    
    if (!videoKey) return false;
    return this.processedVideos.has(videoKey);
  }
  
  /**
   * 标记视频为已处理
   * @param {string|Object} videoKeyOrInfo - 视频缓存键或视频信息对象
   */
  markVideoProcessed(videoKeyOrInfo) {
    // 如果传入的是对象，生成缓存键
    const videoKey = typeof videoKeyOrInfo === 'string' 
      ? videoKeyOrInfo 
      : generateCacheKey(videoKeyOrInfo);
    
    if (!videoKey) return;
    this.processedVideos.add(videoKey);
    this._saveProcessedVideos();
  }
  
  /**
   * 清除视频的处理记录（用于手动操作时）
   * @param {string|Object} videoKeyOrInfo - 视频缓存键或视频信息对象
   */
  clearVideoProcessed(videoKeyOrInfo) {
    // 如果传入的是对象，生成缓存键
    const videoKey = typeof videoKeyOrInfo === 'string' 
      ? videoKeyOrInfo 
      : generateCacheKey(videoKeyOrInfo);
    
    if (!videoKey) return;
    this.processedVideos.delete(videoKey);
    this._saveProcessedVideos();
  }
  
  /**
   * 创建一个新任务
   * @param {string} type - 任务类型（ai_summary, notion_send等）
   * @param {Object} videoInfo - 视频信息{bvid, cid, aid, title, url}
   * @param {Function} executor - 任务执行函数
   * @param {boolean} isManual - 是否手动触发
   * @returns {string} 任务ID
   */
  createTask(type, videoInfo, executor, isManual = false) {
    const videoKey = generateCacheKey(videoInfo);
    if (!videoKey) {
      logger.error('TaskManager', '无效的视频信息，无法创建任务');
      return null;
    }
    
    const taskId = `${type}_${videoKey}_${Date.now()}`;
    
    // 如果是自动任务，检查是否已处理过
    if (!isManual && this.isVideoProcessed(videoInfo)) {
      const p = videoInfo.p || 1;
      logger.debug('TaskManager', `视频 ${videoInfo.bvid} P${p} 已自动处理过，跳过自动任务`);
      return null;
    }
    
    const task = {
      id: taskId,
      type,
      videoInfo: { ...videoInfo },  // 深拷贝，避免引用问题
      status: 'pending',
      createdAt: Date.now(),
      isManual,
      abortController: new AbortController(),
      result: null,
      error: null
    };
    
    this.activeTasks.set(taskId, task);
    
    // 执行任务
    this._executeTask(task, executor);
    
    return taskId;
  }
  
  /**
   * 执行任务
   * @private
   * @param {Object} task - 任务对象
   * @param {Function} executor - 执行函数
   */
  async _executeTask(task, executor) {
    try {
      task.status = 'running';
      logger.info('TaskManager', `开始执行任务 ${task.id}，视频: ${task.videoInfo.bvid}`);
      
      // 执行任务，传入任务上下文
      const result = await executor({
        videoInfo: task.videoInfo,
        signal: task.abortController.signal,
        taskId: task.id
      });
      
      task.result = result;
      task.status = 'completed';
      
      // 如果是自动任务且成功完成，标记视频为已处理
      if (!task.isManual && task.type === 'ai_summary') {
        this.markVideoProcessed(task.videoInfo);
      }
      
      logger.success('TaskManager', `任务 ${task.id} 完成`);
      
      // 清理已完成的任务（保留一段时间供查询）
      setTimeout(() => {
        this.activeTasks.delete(task.id);
      }, 60000); // 1分钟后清理
      
    } catch (error) {
      task.error = error;
      task.status = 'failed';
      
      if (error.name === 'AbortError') {
        logger.info('TaskManager', `任务 ${task.id} 被取消`);
      } else {
        logger.error('TaskManager', `任务 ${task.id} 失败:`, error);
      }
      
      // 失败的任务也要清理
      setTimeout(() => {
        this.activeTasks.delete(task.id);
      }, 60000);
    }
  }
  
  /**
   * 取消指定视频的所有任务
   * @param {string|Object} videoKeyOrInfo - 视频缓存键或视频信息对象
   */
  cancelVideoTasks(videoKeyOrInfo) {
    // 如果传入的是对象，生成缓存键
    const videoKey = typeof videoKeyOrInfo === 'string' 
      ? videoKeyOrInfo 
      : generateCacheKey(videoKeyOrInfo);
    
    if (!videoKey) return 0;
    
    let canceledCount = 0;
    
    this.activeTasks.forEach((task, taskId) => {
      const taskVideoKey = generateCacheKey(task.videoInfo);
      if (taskVideoKey === videoKey && task.status === 'running') {
        task.abortController.abort();
        task.status = 'canceled';
        canceledCount++;
        logger.info('TaskManager', `取消任务 ${taskId}`);
      }
    });
    
    if (canceledCount > 0) {
      logger.info('TaskManager', `已取消视频 ${videoKey} 的 ${canceledCount} 个任务`);
    }
    
    return canceledCount;
  }
  
  /**
   * 取消指定类型的所有任务
   * @param {string} type - 任务类型
   */
  cancelTypeTasks(type) {
    let canceledCount = 0;
    
    this.activeTasks.forEach((task, taskId) => {
      if (task.type === type && task.status === 'running') {
        task.abortController.abort();
        task.status = 'canceled';
        canceledCount++;
      }
    });
    
    return canceledCount;
  }
  
  /**
   * 获取指定视频的活动任务
   * @param {string|Object} videoKeyOrInfo - 视频缓存键或视频信息对象
   * @returns {Array}
   */
  getVideoTasks(videoKeyOrInfo) {
    // 如果传入的是对象，生成缓存键
    const videoKey = typeof videoKeyOrInfo === 'string' 
      ? videoKeyOrInfo 
      : generateCacheKey(videoKeyOrInfo);
    
    if (!videoKey) return [];
    
    const tasks = [];
    this.activeTasks.forEach(task => {
      const taskVideoKey = generateCacheKey(task.videoInfo);
      if (taskVideoKey === videoKey) {
        tasks.push(task);
      }
    });
    return tasks;
  }
  
  /**
   * 检查是否有指定类型的任务在运行
   * @param {string} type - 任务类型
   * @param {string|Object} videoKeyOrInfo - 视频缓存键或视频信息对象（可选）
   * @returns {boolean}
   */
  hasRunningTask(type, videoKeyOrInfo = null) {
    // 如果提供了视频信息，生成缓存键
    let videoKey = null;
    if (videoKeyOrInfo !== null) {
      videoKey = typeof videoKeyOrInfo === 'string' 
        ? videoKeyOrInfo 
        : generateCacheKey(videoKeyOrInfo);
    }
    
    for (const task of this.activeTasks.values()) {
      if (task.type === type && task.status === 'running') {
        if (videoKey === null) {
          return true;
        }
        const taskVideoKey = generateCacheKey(task.videoInfo);
        if (taskVideoKey === videoKey) {
          return true;
        }
      }
    }
    return false;
  }
  
  /**
   * 清理所有已完成和失败的任务
   */
  cleanup() {
    const toDelete = [];
    this.activeTasks.forEach((task, taskId) => {
      if (task.status === 'completed' || task.status === 'failed' || task.status === 'canceled') {
        toDelete.push(taskId);
      }
    });
    
    toDelete.forEach(taskId => {
      this.activeTasks.delete(taskId);
    });
    
    logger.debug('TaskManager', `清理了 ${toDelete.length} 个已完成任务`);
  }
  
  /**
   * 重置所有任务（用于页面刷新等场景）
   */
  reset() {
    // 取消所有运行中的任务
    this.activeTasks.forEach(task => {
      if (task.status === 'running') {
        task.abortController.abort();
      }
    });
    
    this.activeTasks.clear();
    this.taskQueue = [];
    
    logger.info('TaskManager', '任务管理器已重置');
  }
  
  /**
   * 获取任务统计信息
   * @returns {Object}
   */
  getStats() {
    const stats = {
      total: this.activeTasks.size,
      running: 0,
      completed: 0,
      failed: 0,
      canceled: 0,
      processedVideos: this.processedVideos.size
    };
    
    this.activeTasks.forEach(task => {
      if (task.status === 'running') stats.running++;
      else if (task.status === 'completed') stats.completed++;
      else if (task.status === 'failed') stats.failed++;
      else if (task.status === 'canceled') stats.canceled++;
    });
    
    return stats;
  }
}

// 导出单例
export default new TaskManager();
