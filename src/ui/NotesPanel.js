/**
 * 笔记面板UI模块
 * 负责渲染笔记管理界面
 */

import notesService from '../services/NotesService.js';

class NotesPanel {
  constructor() {
    this.panel = null;
    this.isPanelVisible = false;
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
  }

  /**
   * 隐藏笔记面板
   */
  hidePanel() {
    if (this.panel) {
      this.panel.classList.remove('show');
    }
    this.isPanelVisible = false;
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
    const groupedNotes = notesService.getGroupedNotes();

    const html = `
      <div class="notes-panel-content">
        <div class="notes-panel-header">
          <h2>我的笔记</h2>
          <button class="notes-panel-close">×</button>
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
   * 渲染空状态
   */
  renderEmptyState() {
    return `
      <div class="notes-empty-state">
        <div class="notes-empty-icon">📝</div>
        <div>还没有保存任何笔记</div>
        <div class="notes-empty-hint">选中文字后点击粉色点即可保存</div>
      </div>
    `;
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

    return `
      <div class="note-item" data-note-id="${note.id}">
        <div class="note-content">${this.escapeHtml(displayContent)}</div>
        <div class="note-footer">
          <div class="note-time">${notesService.formatTime(note.timestamp)}</div>
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
   * 绑定面板事件
   */
  bindPanelEvents() {
    // 关闭按钮
    const closeBtn = this.panel.querySelector('.notes-panel-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hidePanel());
    }

    // 复制单条笔记
    this.panel.querySelectorAll('.note-copy-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const noteId = e.target.getAttribute('data-note-id');
        const note = notesService.getAllNotes().find(n => n.id === noteId);
        if (note) {
          await this.copyToClipboard(note.content);
          const originalText = e.target.textContent;
          e.target.textContent = '✓';
          setTimeout(() => {
            e.target.textContent = originalText;
          }, 1000);
        }
      });
    });

    // 删除单条笔记
    this.panel.querySelectorAll('.note-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const noteId = e.target.getAttribute('data-note-id');
        notesService.deleteNote(noteId);
        this.renderPanel();
      });
    });

    // 批量复制
    this.panel.querySelectorAll('.note-group-copy-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const date = e.target.getAttribute('data-date');
        const groupedNotes = notesService.getGroupedNotes();
        const group = groupedNotes.find(g => g.date === date);
        
        if (group) {
          const contents = group.notes.map(note => note.content).join('\n\n');
          await this.copyToClipboard(contents);
          const originalText = e.target.textContent;
          e.target.textContent = '✓';
          setTimeout(() => {
            e.target.textContent = originalText;
          }, 1000);
        }
      });
    });

    // 批量删除
    this.panel.querySelectorAll('.note-group-delete-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const date = e.target.getAttribute('data-date');
        const groupedNotes = notesService.getGroupedNotes();
        const group = groupedNotes.find(g => g.date === date);
        
        if (group && confirm(`确定要删除 ${date} 的 ${group.notes.length} 条笔记吗？`)) {
          const noteIds = group.notes.map(note => note.id);
          notesService.deleteNotes(noteIds);
          this.renderPanel();
        }
      });
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

