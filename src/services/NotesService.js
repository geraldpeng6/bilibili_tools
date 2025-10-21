/**
 * 笔记服务模块
 * 管理用户选中文字的笔记保存和管理
 */

import logger from '../utils/DebugLogger.js';

const NOTES_CONFIG = {
  STORAGE_KEY: 'bilibili_subtitle_notes',
  BLUE_DOT_SIZE: 14,
  BLUE_DOT_COLOR: '#feebea',
  BLUE_DOT_HIDE_TIMEOUT: 5000,
};

class NotesService {
  constructor() {
    this.blueDot = null;
    this.blueDotHideTimeout = null;
    this.savedSelectionText = '';
    this.selectionTimeout = null;
  }

  /**
   * 初始化笔记服务
   */
  init() {
    logger.info('NotesService', '初始化笔记服务...');
    try {
      this.createBlueDot();
      this.initSelectionListener();
      logger.info('NotesService', '✓ 笔记服务初始化成功');
    } catch (error) {
      logger.error('NotesService', '✗ 初始化失败:', error);
    }
  }

  /**
   * 获取所有笔记数据
   * @returns {Array} 笔记数组
   */
  getAllNotes() {
    try {
      const data = localStorage.getItem(NOTES_CONFIG.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('读取笔记数据失败:', error);
      return [];
    }
  }

  /**
   * 保存笔记数据
   * @param {Array} notes - 笔记数组
   */
  saveNotes(notes) {
    try {
      localStorage.setItem(NOTES_CONFIG.STORAGE_KEY, JSON.stringify(notes));
    } catch (error) {
      console.error('保存笔记数据失败:', error);
    }
  }

  /**
   * 添加新笔记
   * @param {string} content - 笔记内容
   * @param {string} url - 来源URL
   * @returns {Object} 新添加的笔记对象
   */
  addNote(content, url) {
    logger.info('NotesService', `添加新笔记，内容长度: ${content.length}`);
    
    try {
      const note = {
        id: Date.now() + Math.random().toString(36).substr(2, 9),
        content: content.trim(),
        url: url,
        timestamp: Date.now()
      };

      const notes = this.getAllNotes();
      notes.unshift(note);
      this.saveNotes(notes);
      
      logger.info('NotesService', `✓ 笔记已保存，当前总数: ${notes.length}`);
      return note;
    } catch (error) {
      logger.error('NotesService', '✗ 添加笔记失败:', error);
      throw error;
    }
  }

  /**
   * 删除指定笔记
   * @param {string} noteId - 笔记ID
   */
  deleteNote(noteId) {
    const notes = this.getAllNotes();
    const filtered = notes.filter(note => note.id !== noteId);
    this.saveNotes(filtered);
  }

  /**
   * 批量删除笔记
   * @param {Array<string>} noteIds - 笔记ID数组
   */
  deleteNotes(noteIds) {
    const notes = this.getAllNotes();
    const filtered = notes.filter(note => !noteIds.includes(note.id));
    this.saveNotes(filtered);
  }

  /**
   * 按日期分组笔记
   * @returns {Array} 分组后的笔记数组 [{date, notes}, ...]
   */
  getGroupedNotes() {
    const notes = this.getAllNotes();
    const groups = {};

    notes.forEach(note => {
      const date = this.formatDate(note.timestamp);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(note);
    });

    return Object.keys(groups)
      .sort((a, b) => {
        const dateA = groups[a][0].timestamp;
        const dateB = groups[b][0].timestamp;
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
    logger.debug('NotesService', '创建笔记保存点元素...');
    
    if (this.blueDot) {
      logger.debug('NotesService', '笔记保存点元素已存在');
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
        logger.debug('NotesService', '鼠标进入保存点');
        this.blueDot.style.transform = 'scale(1.15)';
        this.blueDot.style.filter = 'drop-shadow(0 2px 4px rgba(254, 235, 234, 0.5))';
      });

      this.blueDot.addEventListener('mouseleave', () => {
        logger.debug('NotesService', '鼠标离开保存点');
        this.blueDot.style.transform = 'scale(1)';
        this.blueDot.style.filter = 'none';
      });

      this.blueDot.addEventListener('click', (e) => this.handleBlueDotClick(e));

      document.body.appendChild(this.blueDot);
      logger.debug('NotesService', '✓ 笔记保存点元素已创建并添加到body');
      return this.blueDot;
    } catch (error) {
      logger.error('NotesService', '✗ 创建笔记保存点元素失败:', error);
      return null;
    }
  }

  /**
   * 显示蓝点在指定位置
   * @param {number} x - X坐标
   * @param {number} y - Y坐标
   */
  showBlueDot(x, y) {
    logger.debug('NotesService', `显示保存点在位置 (${x}, ${y})`);
    
    try {
      const dot = this.createBlueDot();
      if (!dot) {
        logger.error('NotesService', '✗ 无法获取保存点元素');
        return;
      }
      
      dot.style.left = `${x}px`;
      dot.style.top = `${y}px`;
      dot.style.display = 'block';
      
      logger.debug('NotesService', `✓ 保存点已显示`);

      if (this.blueDotHideTimeout) {
        clearTimeout(this.blueDotHideTimeout);
      }

      this.blueDotHideTimeout = setTimeout(() => {
        logger.debug('NotesService', '保存点自动隐藏超时触发');
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
    logger.debug('NotesService', '隐藏保存点');
    
    try {
      if (this.blueDot) {
        this.blueDot.style.display = 'none';
        logger.debug('NotesService', '✓ 保存点已隐藏');
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
  handleBlueDotClick(e) {
    logger.debug('NotesService', '保存点被点击');
    
    try {
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }

      if (this.savedSelectionText) {
        const note = this.addNote(this.savedSelectionText, window.location.href);
        this.savedSelectionText = '';

        const selection = window.getSelection();
        if (selection.rangeCount > 0) {
          selection.removeAllRanges();
          logger.debug('NotesService', '已清除文本选择');
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
        logger.debug('NotesService', 'mouseup 事件触发');
        
        if (this.selectionTimeout) {
          clearTimeout(this.selectionTimeout);
        }

        // 保存鼠标位置
        const mouseX = e.clientX;
        const mouseY = e.clientY;
        logger.debug('NotesService', `鼠标位置: clientX=${mouseX}, clientY=${mouseY}`);

        this.selectionTimeout = setTimeout(() => {
          try {
            const selection = window.getSelection();
            const selectedText = selection.toString().trim();

            logger.debug('NotesService', `选中文本长度: ${selectedText.length}`);
            
            if (selectedText && selection.rangeCount > 0) {
              logger.debug('NotesService', `检测到文本选择`);
              this.savedSelectionText = selectedText;

              // 使用鼠标位置 + 偏移量来显示保存点
              const x = mouseX + window.scrollX + 10;
              const y = mouseY + window.scrollY + 10;
              
              logger.debug('NotesService', `滚动偏移: scrollX=${window.scrollX}, scrollY=${window.scrollY}`);
              logger.debug('NotesService', `计算位置（鼠标附近）: x=${x}, y=${y}`);

              this.showBlueDot(x, y);
            } else {
              logger.debug('NotesService', '没有选中文本或选择范围为空');
              this.savedSelectionText = '';
              this.hideBlueDot();
            }
          } catch (error) {
            logger.error('NotesService', '✗ 处理文本选择失败:', error);
          }
        }, 100);
      });

      document.addEventListener('mousedown', (e) => {
        // 如果点击的是蓝点或其子元素，不清空
        if (this.blueDot && (e.target === this.blueDot || this.blueDot.contains(e.target))) {
          logger.debug('NotesService', 'mousedown 在保存点上，忽略');
          return;
        }
        logger.debug('NotesService', 'mousedown 事件，清空选中文本并隐藏保存点');
        this.savedSelectionText = '';
        this.hideBlueDot();
      });
      
      logger.debug('NotesService', '✓ 文本选择监听器已初始化');
    } catch (error) {
      logger.error('NotesService', '✗ 初始化文本选择监听器失败:', error);
    }
  }

  /**
   * 保存当前选中的字幕文本
   * @param {string} content - 字幕内容
   */
  saveSubtitleNote(content) {
    const note = this.addNote(content, window.location.href);
    return note;
  }
}

// 创建全局单例
export const notesService = new NotesService();
export default notesService;

