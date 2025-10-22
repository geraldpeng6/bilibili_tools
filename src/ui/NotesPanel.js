/**
 * 笔记面板UI模块
 * 负责渲染笔记管理界面
 */

import notesService from '../services/NotesService.js';
import modalManager from '../utils/ModalManager.js';

class NotesPanel {
  constructor() {
    this.panel = null;
    this.isPanelVisible = false;
    this.filters = {
      showText: true,      // 显示文字笔记
      showScreenshot: true // 显示截图笔记
    };
  }

  /**
   * 创建笔记面板元素
   */
  createPanel() {
    if (this.panel) {
      return this.panel;
    }

    this.panel = document.createElement('div');
    this.panel.id = 'notes-panel';
    this.panel.className = 'notes-panel';
    
    document.body.appendChild(this.panel);
    return this.panel;
  }

  /**
   * 显示笔记面板
   */
  showPanel() {
    const panel = this.createPanel();
    this.renderPanel();
    panel.classList.add('show');
    this.isPanelVisible = true;
    
    // 注册到模态框管理器（统一处理ESC键）
    modalManager.push(this);
  }

  /**
   * 隐藏笔记面板
   */
  hidePanel() {
    if (this.panel) {
      this.panel.classList.remove('show');
    }
    this.isPanelVisible = false;
    
    // 从模态框管理器移除
    modalManager.pop(this);
  }

  /**
   * 隐藏面板（ModalManager兼容方法）
   */
  hide() {
    this.hidePanel();
  }

  /**
   * 切换笔记面板显示/隐藏
   */
  togglePanel() {
    if (this.isPanelVisible) {
      this.hidePanel();
    } else {
      this.showPanel();
    }
  }

  /**
   * 渲染笔记面板内容
   */
  renderPanel() {
    const panel = this.createPanel();
    const groupedNotes = this.getFilteredGroupedNotes();
    const totalNotes = notesService.getAllNotes();
    const textCount = totalNotes.filter(n => n.type !== 'screenshot').length;
    const screenshotCount = totalNotes.filter(n => n.type === 'screenshot').length;

    const html = `
      <div class="notes-panel-content">
        <div class="notes-panel-header">
          <h2>我的笔记</h2>
          <button class="notes-panel-close">×</button>
        </div>
        <div class="notes-filters">
          <label class="filter-checkbox">
            <input type="checkbox" id="filter-text-notes" ${this.filters.showText ? 'checked' : ''}>
            <span>文字笔记 (${textCount})</span>
          </label>
          <label class="filter-checkbox">
            <input type="checkbox" id="filter-screenshot-notes" ${this.filters.showScreenshot ? 'checked' : ''}>
            <span>截图笔记 (${screenshotCount})</span>
          </label>
        </div>
        <div class="notes-panel-body">
          ${groupedNotes.length === 0 ? this.renderEmptyState() : groupedNotes.map(group => this.renderGroup(group)).join('')}
        </div>
      </div>
    `;

    panel.innerHTML = html;
    this.bindPanelEvents();
  }

  /**
   * 获取筛选后的分组笔记
   */
  getFilteredGroupedNotes() {
    const allNotes = notesService.getAllNotes();
    
    // 应用筛选条件
    const filteredNotes = allNotes.filter(note => {
      if (note.type === 'screenshot') {
        return this.filters.showScreenshot;
      } else {
        return this.filters.showText;
      }
    });

    // 按日期分组
    const groups = {};
    filteredNotes.forEach(note => {
      // 使用创建时间分组（兼容新旧数据）
      const groupTimestamp = note.createdAt || note.timestamp;
      const date = notesService.formatDate(groupTimestamp);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(note);
    });

    // 转换为数组并排序
    return Object.keys(groups)
      .sort((a, b) => {
        // 使用创建时间排序（兼容新旧数据）
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
   * 渲染空状态
   */
  renderEmptyState() {
    const hasAnyNotes = notesService.getAllNotes().length > 0;
    
    if (hasAnyNotes) {
      // 有笔记但被筛选隐藏了
      return `
        <div class="notes-empty-state">
          <div class="notes-empty-icon">🔍</div>
          <div>没有符合筛选条件的笔记</div>
          <div class="notes-empty-hint">请调整上方的筛选条件</div>
        </div>
      `;
    } else {
      // 真的没有任何笔记
      return `
        <div class="notes-empty-state">
          <div class="notes-empty-icon">📝</div>
          <div>还没有保存任何笔记</div>
          <div class="notes-empty-hint">选中文字后点击粉色点即可保存<br>或使用 Cmd+E 保存截图</div>
        </div>
      `;
    }
  }

  /**
   * 渲染笔记分组
   * @param {Object} group - 分组对象 {date, notes}
   */
  renderGroup(group) {
    return `
      <div class="note-group">
        <div class="note-group-header">
          <div class="note-group-title">
            ${group.date} (${group.notes.length}条)
          </div>
          <div class="note-group-actions">
            <button class="note-group-copy-btn" data-date="${group.date}">
              批量复制
            </button>
            <button class="note-group-delete-btn" data-date="${group.date}">
              批量删除
            </button>
          </div>
        </div>
        <div class="note-group-items">
          ${group.notes.map(note => this.renderNote(note)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * 渲染单条笔记
   * @param {Object} note - 笔记对象
   */
  renderNote(note) {
    const displayContent = note.content.length > 200 
      ? note.content.substring(0, 200) + '...' 
      : note.content;

    // 如果是截图笔记，显示图片
    const contentHtml = note.type === 'screenshot' && note.imageData
      ? `
        <div class="note-screenshot">
          <img src="${note.imageData}" alt="视频截图" style="max-width: 100%; border-radius: 4px; margin-top: 8px;">
        </div>
        <div class="note-content">${this.escapeHtml(displayContent)}</div>
      `
      : `<div class="note-content">${this.escapeHtml(displayContent)}</div>`;

    // 根据笔记类型决定显示的时间和信息
    let timeDisplay = '';
    let videoDisplay = '';
    
    if (note.type === 'screenshot') {
      // 截图显示视频时间位置
      timeDisplay = note.timeString || notesService.formatTime(note.createdAt || note.timestamp);
      // 显示视频信息（标题或BV号）
      if (note.videoTitle && note.videoTitle !== '未知视频') {
        videoDisplay = ` · ${this.escapeHtml(note.videoTitle)}`;
      } else if (note.videoBvid) {
        videoDisplay = ` · ${this.escapeHtml(note.videoBvid)}`;
      }
    } else {
      // 普通笔记显示创建时间
      timeDisplay = notesService.formatTime(note.timestamp);
      if (note.videoTitle) {
        videoDisplay = ` · ${this.escapeHtml(note.videoTitle)}`;
      }
    }

    return `
      <div class="note-item ${note.type === 'screenshot' ? 'note-item-screenshot' : ''}" data-note-id="${note.id}">
        ${contentHtml}
        <div class="note-footer">
          <div class="note-time">
            ${note.type === 'screenshot' ? '📸 ' : ''}${timeDisplay}${videoDisplay}
          </div>
          <div class="note-actions">
            <button class="note-copy-btn" data-note-id="${note.id}">复制</button>
            <button class="note-delete-btn" data-note-id="${note.id}">删除</button>
          </div>
        </div>
      </div>
    `;
  }

  /**
   * HTML转义
   * @param {string} text - 要转义的文本
   * @returns {string} 转义后的文本
   */
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * 复制文本到剪贴板
   * @param {string} text - 要复制的文本
   */
  async copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
    } catch (error) {
      console.error('复制失败:', error);
    }
  }

  /**
   * 绑定面板事件（使用事件委托优化性能）
   */
  bindPanelEvents() {
    // 关闭按钮
    const closeBtn = this.panel.querySelector('.notes-panel-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hidePanel());
    }

    // 筛选复选框
    const filterText = this.panel.querySelector('#filter-text-notes');
    const filterScreenshot = this.panel.querySelector('#filter-screenshot-notes');
    
    if (filterText) {
      filterText.addEventListener('change', (e) => {
        this.filters.showText = e.target.checked;
        this.renderPanel();
      });
    }
    
    if (filterScreenshot) {
      filterScreenshot.addEventListener('change', (e) => {
        this.filters.showScreenshot = e.target.checked;
        this.renderPanel();
      });
    }

    // 使用事件委托处理所有按钮点击（性能优化：从N个监听器减少到1个）
    const panelBody = this.panel.querySelector('.notes-panel-body');
    if (!panelBody) return;

    panelBody.addEventListener('click', async (e) => {
      // 处理单条笔记复制
      const noteCopyBtn = e.target.closest('.note-copy-btn');
      if (noteCopyBtn) {
        const noteId = noteCopyBtn.getAttribute('data-note-id');
        const note = notesService.getAllNotes().find(n => n.id === noteId);
        if (note) {
          await this.copyToClipboard(note.content);
          const originalText = noteCopyBtn.textContent;
          noteCopyBtn.textContent = '✓';
          setTimeout(() => {
            noteCopyBtn.textContent = originalText;
          }, 1000);
        }
        return;
      }

      // 处理单条笔记删除
      const noteDeleteBtn = e.target.closest('.note-delete-btn');
      if (noteDeleteBtn) {
        const noteId = noteDeleteBtn.getAttribute('data-note-id');
        notesService.deleteNote(noteId);
        this.renderPanel();
        return;
      }

      // 处理批量复制
      const groupCopyBtn = e.target.closest('.note-group-copy-btn');
      if (groupCopyBtn) {
        const date = groupCopyBtn.getAttribute('data-date');
        const groupedNotes = notesService.getGroupedNotes();
        const group = groupedNotes.find(g => g.date === date);
        
        if (group) {
          const contents = group.notes.map(note => note.content).join('\n\n');
          await this.copyToClipboard(contents);
          const originalText = groupCopyBtn.textContent;
          groupCopyBtn.textContent = '✓';
          setTimeout(() => {
            groupCopyBtn.textContent = originalText;
          }, 1000);
        }
        return;
      }

      // 处理批量删除
      const groupDeleteBtn = e.target.closest('.note-group-delete-btn');
      if (groupDeleteBtn) {
        const date = groupDeleteBtn.getAttribute('data-date');
        const groupedNotes = notesService.getGroupedNotes();
        const group = groupedNotes.find(g => g.date === date);
        
        if (group && confirm(`确定要删除 ${date} 的 ${group.notes.length} 条笔记吗？`)) {
          const noteIds = group.notes.map(note => note.id);
          notesService.deleteNotes(noteIds);
          this.renderPanel();
        }
        return;
      }
    });
  }

  /**
   * 在字幕项中添加保存按钮
   * @param {HTMLElement} subtitleItem - 字幕项元素
   */
  addSaveButton(subtitleItem) {
    if (subtitleItem.querySelector('.save-subtitle-note-btn')) {
      return;
    }

    const content = subtitleItem.querySelector('.subtitle-text')?.textContent;
    if (!content) return;

    const saveBtn = document.createElement('button');
    saveBtn.className = 'save-subtitle-note-btn';
    saveBtn.textContent = '保存';
    saveBtn.title = '保存此字幕为笔记';
    
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      notesService.saveSubtitleNote(content);
      saveBtn.textContent = '✓';
      setTimeout(() => {
        saveBtn.textContent = '保存';
      }, 1000);
    });

    const footer = subtitleItem.querySelector('.subtitle-time');
    if (footer) {
      footer.appendChild(saveBtn);
    }
  }

  /**
   * 为所有字幕项添加保存按钮
   * @param {HTMLElement} container - 字幕容器
   */
  addSaveButtonsToSubtitles(container) {
    const subtitleItems = container.querySelectorAll('.subtitle-item');
    subtitleItems.forEach(item => this.addSaveButton(item));
  }
}

// 创建全局单例
export const notesPanel = new NotesPanel();
export default notesPanel;

