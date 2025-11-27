/**
 * 笔记服务模块
 * 管理用户选中文字的笔记保存和管理
 */
import state from '../state/StateManager.js';
import logger from '../utils/DebugLogger.js';
import LogDecorator from '../utils/LogDecorator.js';
import eventBus from '../utils/EventBus.js';
import { EVENTS, NOTES_CONFIG } from '../constants.js';
import config from '../config/ConfigManager.js';
import notionService from './NotionService.js';
import { getVideoTitle } from '../utils/helpers.js';

class NotesService {
  constructor() {
    // 单例模式：防止多次初始化
    if (NotesService.instance) {
      return NotesService.instance;
    }
    
    // 创建模块专用日志记录器
    this.log = LogDecorator.createModuleLogger('NotesService');
    this.blueDot = null;
    this.blueDotHideTimeout = null;
    this.savedSelectionText = '';
    this.selectionTimeout = null;
    this.initialized = false;
    
    // 保存实例
    NotesService.instance = this;
  }

  /**
   * 初始化笔记服务
   */
  async init() {
    if (this.initialized) {
      this.log.debug('笔记服务已初始化，跳过重复初始化');
      return;
    }

    this.log.debug('初始化笔记服务...');
    try {
      await this._migrateNotesFromLocalStorage();
      this.createBlueDot();
      this.initSelectionListener();
      this.initialized = true;
      this.log.success('笔记服务初始化成功');
    } catch (error) {
      this.log.error('初始化失败:', error);
    }
  }

  /**
   * [私有] 将 localStorage 中的笔记迁移到 GM 存储
   */
  async _migrateNotesFromLocalStorage() {
    const migrationKey = 'notes_migration_complete';
    const isMigrated = await GM.getValue(migrationKey, false);

    if (isMigrated) {
      this.log.debug('笔记迁移已完成，跳过迁移过程');
      return;
    }

    this.log.info('开始从 localStorage 迁移笔记到 GM 存储...');
    try {
      const oldNotesRaw = localStorage.getItem(NOTES_CONFIG.STORAGE_KEY);
      if (oldNotesRaw) {
        const oldNotes = JSON.parse(oldNotesRaw);
        if (Array.isArray(oldNotes) && oldNotes.length > 0) {
          this.log.debug(`发现 ${oldNotes.length} 条旧笔记，正在迁移...`);
          await this.saveNotes(oldNotes);
          this.log.success('旧笔记迁移成功！');
          localStorage.removeItem(NOTES_CONFIG.STORAGE_KEY);
          this.log.debug('已删除旧的 localStorage 笔记');
        }
      }
      await GM.setValue(migrationKey, true);
      this.log.info('笔记迁移过程完成');
    } catch (error) {
      this.log.error('迁移笔记失败:', error);
    }
  }

  /**
   * 获取所有笔记数据 (异步)
   * @returns {Promise<Array>} 笔记数组
   */
  async getAllNotes() {
    try {
      const data = await GM.getValue(NOTES_CONFIG.STORAGE_KEY, '[]');
      return data ? JSON.parse(data) : [];
    } catch (error) {
      this.log.error('读取笔记数据失败:', error);
      return [];
    }
  }

  /**
   * 保存笔记数据 (异步)
   * @param {Array} notes - 笔记数组
   */
  async saveNotes(notes) {
    try {
      // 尝试保存
      let dataStr = JSON.stringify(notes);
      const dataSize = new Blob([dataStr]).size;
      
      // 检查存储大小
      if (dataSize > NOTES_CONFIG.STORAGE_CLEANUP_SIZE) {
        this.log.warn('笔记存储空间过大，执行自动清理');
        notes = this.cleanupNotes(notes);
        dataStr = JSON.stringify(notes); // 重新序列化
      }
      
      await GM.setValue(NOTES_CONFIG.STORAGE_KEY, dataStr);

    } catch (error) {
      this.log.error('保存笔记数据失败:', error);
      // 如果是配额错误，尝试清理后重试
      if (error.name === 'QuotaExceededError' || error.message.includes('exceeded')) {
        this.log.error('存储配额已满，清理旧数据后重试');
        const cleanedNotes = this.forceCleanupNotes(notes);
        try {
          await GM.setValue(NOTES_CONFIG.STORAGE_KEY, JSON.stringify(cleanedNotes));
          this.log.success('清理后保存成功');
        } catch (retryError) {
          this.log.error('清理后仍然失败:', retryError);
          throw retryError;
        }
      } else {
        throw error;
      }
    }
  }

  /**
   * 清理笔记（保留最新的）
   */
  cleanupNotes(notes) {
    const screenshots = notes.filter(n => n.type === 'screenshot');
    const textNotes = notes.filter(n => n.type !== 'screenshot');
    
    // 限制截图数量
    const keptScreenshots = screenshots.slice(0, NOTES_CONFIG.MAX_SCREENSHOTS);
    // 限制文本笔记数量
    const keptTextNotes = textNotes.slice(0, NOTES_CONFIG.MAX_TEXT_NOTES);
    
    this.log.debug(`清理笔记: 保留 ${keptScreenshots.length}/${screenshots.length} 个截图, ${keptTextNotes.length}/${textNotes.length} 条文本`);
    
    // 合并并按时间排序
    return [...keptScreenshots, ...keptTextNotes].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 强制清理（更激进的清理）
   */
  forceCleanupNotes(notes) {
    const screenshots = notes.filter(n => n.type === 'screenshot');
    const textNotes = notes.filter(n => n.type !== 'screenshot');
    
    // 强制只保留最新的5个截图和50条文本
    const keptScreenshots = screenshots.slice(0, 5);
    const keptTextNotes = textNotes.slice(0, 50);
    
    this.log.warn(`强制清理: 保留 ${keptScreenshots.length}/${screenshots.length} 个截图, ${keptTextNotes.length}/${textNotes.length} 条文本`);
    
    return [...keptScreenshots, ...keptTextNotes].sort((a, b) => b.timestamp - a.timestamp);
  }

  /**
   * 添加新笔记 (异步)
   * @param {string|Object} contentOrOptions - 笔记内容或选项对象
   * @param {string} url - 来源URL（当第一个参数是字符串时使用）
   * @returns {Promise<Object>} 新添加的笔记对象
   */
  async addNote(contentOrOptions, url) {
    try {
      let note;
      
      if (typeof contentOrOptions === 'object') {
        const options = contentOrOptions;
        note = {
          id: Date.now() + Math.random().toString(36).substr(2, 9),
          content: options.content.trim(),
          url: options.url || window.location.href,
          hostname: window.location.hostname, // 添加来源网站域名
          createdAt: Date.now(),
          type: options.type || 'text',
          ...options
        };
        if (!note.timestamp) {
          note.timestamp = note.createdAt;
        }
        this.log.info(`添加新笔记(${note.type})，内容: ${options.content}`);
      } else {
        note = {
          id: Date.now() + Math.random().toString(36).substr(2, 9),
          content: contentOrOptions.trim(),
          url: url,
          hostname: window.location.hostname, // 添加来源网站域名
          timestamp: Date.now(),
          type: 'text'
        };
        this.log.info(`添加新笔记，内容长度: ${contentOrOptions.length}`);
      }

      let notes = await this.getAllNotes();
      
      if (note.type === 'screenshot') {
        const screenshots = notes.filter(n => n.type === 'screenshot');
        if (screenshots.length >= NOTES_CONFIG.MAX_SCREENSHOTS) {
          this.log.warn(`截图数量超过限制(${NOTES_CONFIG.MAX_SCREENSHOTS})，删除最旧的截图`);
          const oldestScreenshot = screenshots[screenshots.length - 1];
          notes = notes.filter(n => n.id !== oldestScreenshot.id);
        }
      }
      
      notes.unshift(note);
      await this.saveNotes(notes);
      
      this.log.success(`笔记已保存，当前总数: ${notes.length}`);

      if (config.getNotionNotesAutoSync() && config.isNotionConfigured()) {
        this.log.info('自动同步笔记到Notion...');
        
        const videoInfo = state.getVideoInfo();
        if (videoInfo && videoInfo.bvid) {
          if (!videoInfo.title) {
            videoInfo.title = getVideoTitle();
          }
          note.videoInfo = videoInfo;
        }

        notionService.sendNoteToNotion(note).catch(error => {
          this.log.error('自动同步到Notion失败:', error);
        });
      }

      return note;
    } catch (error) {
      this.log.error('添加笔记失败:', error);
      
      if (error.name === 'QuotaExceededError' || error.message?.includes('exceeded')) {
        this.log.error('存储空间不足，请清理部分笔记');
        if (window.notification) {
          window.notification.error('存储空间不足，已自动清理部分旧笔记');
        }
      }
      
      throw error;
    }
  }

  /**
   * 添加AI总结到笔记 (异步)
   * @param {Object} summaryData - 总结数据 {summary, segments, videoInfo}
   * @returns {Promise<Object>} 创建的笔记对象
   */
  async addAISummary(summaryData) {
    try {
      const note = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        type: 'ai-summary',
        createdAt: Date.now(),
        timestamp: Date.now(),
        summary: summaryData.summary || '',
        segments: summaryData.segments || [],
        videoInfo: summaryData.videoInfo || {},
        videoBvid: summaryData.videoBvid || ''
      };

      let notes = await this.getAllNotes();
      notes.unshift(note);
      await this.saveNotes(notes);

      this.log.success('AI总结已保存');
      return note;
    } catch (error) {
      this.log.error('添加AI总结失败:', error);
      throw error;
    }
  }

  /**
   * 更新笔记中的截图 (异步)
   * @param {string} noteId - 笔记ID
   * @param {Object} screenshot - 截图数据 {imageData, timeString, videoTimestamp}
   */
  async addScreenshotToSummary(noteId, screenshot) {
    try {
      const notes = await this.getAllNotes();
      const noteIndex = notes.findIndex(n => n.id === noteId);
      
      if (noteIndex === -1) {
        throw new Error('笔记不存在');
      }

      const note = notes[noteIndex];
      if (note.type !== 'ai-summary' || !note.segments) {
        throw new Error('笔记不是AI总结类型或没有时间戳段落');
      }

      if (!note.screenshots) {
        note.screenshots = [];
      }

      const screenshotTime = screenshot.videoTimestamp;
      let targetSegmentIndex = -1;

      for (let i = 0; i < note.segments.length; i++) {
        const segment = note.segments[i];
        const segmentTime = this.parseTimestamp(segment.timestamp);

        if (segmentTime > screenshotTime) {
          targetSegmentIndex = i;
          break;
        }
      }

      if (targetSegmentIndex === -1) {
        targetSegmentIndex = note.segments.length;
      }

      note.screenshots.push({
        ...screenshot,
        segmentIndex: targetSegmentIndex,
        addedAt: Date.now()
      });

      await this.saveNotes(notes);
      this.log.success('截图已添加到总结笔记');
      return note;
    } catch (error) {
      this.log.error('添加截图到总结失败:', error);
      throw error;
    }
  }

  /**
   * 解析时间戳字符串为秒数
   * @param {string} timestamp - 时间戳字符串 (MM:SS 或 HH:MM:SS)
   * @returns {number} 秒数
   */
  parseTimestamp(timestamp) {
    const parts = timestamp.split(':').map(p => parseInt(p, 10));
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  /**
   * 删除指定笔记 (异步)
   * @param {string} noteId - 笔记ID
   */
  async deleteNote(noteId) {
    const notes = await this.getAllNotes();
    const filtered = notes.filter(note => note.id !== noteId);
    await this.saveNotes(filtered);
  }

  /**
   * 批量删除笔记 (异步)
   * @param {Array<string>} noteIds - 笔记ID数组
   */
  async deleteNotes(noteIds) {
    const notes = await this.getAllNotes();
    const filtered = notes.filter(note => !noteIds.includes(note.id));
    await this.saveNotes(filtered);
  }

  /**
   * 按日期分组笔记 (异步)
   * @returns {Promise<Array>} 分组后的笔记数组 [{date, notes}, ...]
   */
  async getGroupedNotes() {
    const notes = await this.getAllNotes();
    const groups = {};

    notes.forEach(note => {
      const groupTimestamp = note.createdAt || note.timestamp;
      const date = this.formatDate(groupTimestamp);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(note);
    });

    return Object.keys(groups)
      .sort((a, b) => {
        const dateA = groups[a][0].createdAt || groups[a][0].timestamp;
        const dateB = groups[b][0].createdAt || groups[b][0].timestamp;
        return dateB - dateA;
      })
      .map(date => ({
        date,
        notes: groups[date]
      }));
  }

  /**
   * 格式化时间戳为日期字符串
   * @param {number} timestamp - 时间戳
   * @returns {string} 格式化的日期字符串
   */
  formatDate(timestamp) {
    const date = new Date(timestamp);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return '今天';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return '昨天';
    } else {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
  }

  /**
   * 格式化时间戳为完整时间字符串
   * @param {number} timestamp - 时间戳
   * @returns {string} 格式化的时间字符串
   */
  formatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  /**
   * 创建钢笔保存点元素
   */
  createBlueDot() {
    this.log.debug('创建笔记保存点元素...');
    
    if (this.blueDot) {
      this.log.debug('笔记保存点元素已存在');
      return this.blueDot;
    }

    try {
      this.blueDot = document.createElement('div');
      this.blueDot.id = 'note-saver-blue-dot';
      this.blueDot.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="20" height="20">
          <path d="M20.7 5.2c.4.4.4 1.1 0 1.6l-1 1-3.3-3.3 1-1c.4-.4 1.1-.4 1.6 0l1.7 1.7zm-3.3 2.3L6.7 18.2c-.2.2-.4.3-.7.3H3c-.6 0-1-.4-1-1v-3c0-.3.1-.5.3-.7L13 3.1l3.3 3.3z" stroke="#feebea" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="rgba(0,0,0,0.7)"/>
        </svg>
      `;
      this.blueDot.style.cssText = `
        position: absolute;
        cursor: pointer;
        z-index: 2147483647;
        display: none;
        transition: transform 0.2s, filter 0.2s;
        pointer-events: auto;
      `;

      this.blueDot.addEventListener('mouseenter', () => {
        this.log.debug('鼠标进入保存点');
        this.blueDot.style.transform = 'scale(1.15)';
        this.blueDot.style.filter = 'drop-shadow(0 2px 4px rgba(254, 235, 234, 0.5))';
      });

      this.blueDot.addEventListener('mouseleave', () => {
        this.log.debug('鼠标离开保存点');
        this.blueDot.style.transform = 'scale(1)';
        this.blueDot.style.filter = 'none';
      });

      this.blueDot.addEventListener('click', (e) => this.handleBlueDotClick(e));

      document.body.appendChild(this.blueDot);
      this.log.debug('笔记保存点元素已创建并添加到body');
      return this.blueDot;
    } catch (error) {
      this.log.error('创建笔记保存点元素失败:', error);
      return null;
    }
  }

  /**
   * 显示蓝点在指定位置
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   */
  showBlueDot(x, y) {
    this.log.debug(`显示保存点在位置 (${x}, ${y})`);
    
    try {
      const dot = this.createBlueDot();
      if (!dot) {
        this.log.error('无法获取保存点元素');
        return;
      }
      
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      dot.style.display = 'block';
      

      if (this.blueDotHideTimeout) {
        clearTimeout(this.blueDotHideTimeout);
      }

      this.blueDotHideTimeout = setTimeout(() => {
        this.hideBlueDot();
        this.savedSelectionText = '';
      }, NOTES_CONFIG.BLUE_DOT_HIDE_TIMEOUT);
    } catch (error) {
      logger.error('NotesService', '✗ 显示保存点失败:', error);
    }
  }

  /**
   * 隐藏蓝点
   */
  hideBlueDot() {
    try {
      if (this.blueDot) {
        this.blueDot.style.display = 'none';
      }
      if (this.blueDotHideTimeout) {
        clearTimeout(this.blueDotHideTimeout);
        this.blueDotHideTimeout = null;
      }
    } catch (error) {
      logger.error('NotesService', '✗ 隐藏保存点失败:', error);
    }
  }

  /**
   * 处理蓝点点击事件
   */
  async handleBlueDotClick(e) {
    logger.info('NotesService', '保存点被点击 - 保存笔记');
    
    try {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (this.savedSelectionText) {
        await this.addNote(this.savedSelectionText, window.location.href);
        this.savedSelectionText = '';

        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          selection.removeAllRanges();
        }
      } else {
        logger.warn('NotesService', '⚠ 没有保存的选中文本');
      }

      this.hideBlueDot();
    } catch (error) {
      logger.error('NotesService', '✗ 处理保存点点击失败:', error);
    }
  }

  /**
   * 监听文本选择事件
   */
  initSelectionListener() {
    logger.debug('NotesService', '初始化文本选择监听器...');
    
    try {
      document.addEventListener('mouseup', (e) => {
        const sectionItem = e.target.closest('.section-item');
        const isTimeRelated = e.target.closest('.time-btn, .segment-item, .ai-segments-section');
        
        if (sectionItem || isTimeRelated) {
          logger.debug('NotesService', '点击的是时间戳段落，忽略文字选择');
          this.hideBlueDot();
          return;
        }
        
        if (this.selectionTimeout) {
          clearTimeout(this.selectionTimeout);
        }

        const mouseX = e.clientX;
        const mouseY = e.clientY;

        this.selectionTimeout = setTimeout(() => {
          try {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();
            
            if (selectedText && selection.rangeCount > 0) {
              logger.debug('NotesService', `检测到文本选择: "${selectedText.substring(0, 30)}${selectedText.length > 30 ? '...' : ''}"`);
              this.savedSelectionText = selectedText;

              const x = mouseX + window.scrollX + 10;
              const y = mouseY + window.scrollY + 10;
              
              this.showBlueDot(x, y);
            } else {
              this.savedSelectionText = '';
              this.hideBlueDot();
            }
          } catch (error) {
            logger.error('NotesService', '✗ 处理文本选择失败:', error);
          }
        }, 100);
      });

      document.addEventListener('mousedown', (e) => {
        const sectionItem = e.target.closest('.section-item');
        const isTimeRelated = e.target.closest('.time-btn, .segment-item, .ai-segments-section');
        
        if (sectionItem || isTimeRelated) {
          logger.debug('NotesService', 'mousedown 在段落元素上，忽略');
          return;
        }
        
        if (this.blueDot && (e.target === this.blueDot || this.blueDot.contains(e.target))) {
          return;
        }
        this.savedSelectionText = '';
        this.hideBlueDot();
      });
      
      logger.debug('NotesService', '✓ 文本选择监听器已初始化');
    } catch (error) {
      logger.error('NotesService', '✗ 初始化文本选择监听器失败:', error);
    }
  }

  /**
   * 保存当前选中的字幕文本 (异步)
   * @param {string} content - 字幕内容
   */
  async saveSubtitleNote(content) {
    const note = await this.addNote(content, window.location.href);
    return note;
  }
}

// 创建全局单例
export const notesService = new NotesService();
export default notesService;

