/**
 * 事件处理模块
 * 负责所有UI事件的绑定和处理
 */

import state from '../state/StateManager.js';
import config from '../config/ConfigManager.js';
import shortcutManager from '../config/ShortcutManager.js';
import aiService from '../services/AIService.js';
import notionService from '../services/NotionService.js';
import subtitleService from '../services/SubtitleService.js';
import notesService from '../services/NotesService.js';
import speedControlService from '../services/SpeedControlService.js';
import notification from './Notification.js';
import uiRenderer from './UIRenderer.js';
import notesPanel from './NotesPanel.js';
import modalManager from '../utils/ModalManager.js';
import domCache from '../utils/DOMCache.js';
import { SELECTORS, AI_API_KEY_URLS } from '../constants.js';
import logger from '../utils/DebugLogger.js';
import { debounce, throttleRAF, findSubtitleIndex } from '../utils/helpers.js';
import { subtitleScrollManager } from '../utils/SubtitleScrollManager.js';

class EventHandlers {
  constructor() {
    this.isDragging = false;
    this.dragStartX = 0;
    this.dragStartY = 0;
    this.translateX = 0;
    this.translateY = 0;
    this.isResizing = false;
    this.resizeStartX = 0;
    this.resizeStartY = 0;
    this.resizeStartWidth = 0;
    this.resizeStartHeight = 0;
    // Subtitle highlight optimization
    this.subtitleDataCache = null;
    this.currentHighlightedIndex = -1;
    // Debounced/throttled functions
    this.throttledHighlight = null;
    // 模态框代理对象（用于ModalManager）
    this.aiConfigModalProxy = {
      hide: () => this.hideAIConfigModal()
    };
    this.notionConfigModalProxy = {
      hide: () => this.hideNotionConfigModal()
    };
    // 快捷键配置模态框代理
    this.shortcutConfigModalProxy = {
      hide: () => this.hideShortcutConfigModal()
    };
  }


  /**
   * 绑定字幕面板事件
   * @param {HTMLElement} container - 字幕容器
   */
  bindSubtitlePanelEvents(container) {
    // 恢复保存的位置和尺寸
    this.restoreContainerState(container);
    
    // 绑定拖动功能
    this.bindDragEvents(container);
    
    // 绑定调整大小功能
    this.bindResizeEvents(container);
    
    // 监听尺寸变化并保存
    this.observeContainerResize(container);
    
    // 关闭按钮
    const closeBtn = container.querySelector('.subtitle-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        state.setPanelVisible(false);
        container.classList.remove('show');
        // 销毁滚动管理器
        subtitleScrollManager.destroy();
      });
    }

    // 标签页切换（已移除字幕列表标签页，保留代码以兼容）

    // AI总结按钮（同时生成总结和段落）
    const aiIcon = container.querySelector('.ai-icon');
    if (aiIcon) {
      aiIcon.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        // 检查是否正在生成中
        if (state.ai.isSummarizing) {
          notification.warning('AI总结正在生成中，请稍候...');
          return;
        }
        
        const subtitleData = state.getSubtitleData();
        if (!subtitleData || subtitleData.length === 0) {
          notification.error('没有可用的字幕数据');
          return;
        }
        
        // 检查是否有选中的AI配置
        const selectedConfig = config.getSelectedAIConfig();
        if (!selectedConfig) {
          notification.warning('请先在油猴菜单中AI配置中选择或配置一个AI服务');
          return;
        }
        
        // 检查是否已有总结
        const videoKey = state.getVideoKey();
        const existingSummary = state.getAISummary(videoKey);
        
        if (existingSummary) {
          // 如果已有总结，询问是否重新生成
          const confirmRegenerate = confirm('已存在AI总结，是否重新生成？\n\n点击"确定"重新生成\n点击"取消"查看现有总结');
          
          if (!confirmRegenerate) {
            // 用户选择查看现有总结，直接返回
            return;
          }
          
          // 用户确认重新生成，清除缓存的总结
          if (videoKey) {
            sessionStorage.removeItem(`ai-summary-${videoKey}`);
          }
          state.ai.currentSummary = null;
        }
        
        try {
          // 触发AI总结（会同时生成markdown总结和JSON段落，手动触发）
          await aiService.summarize(subtitleData, true);
        } catch (error) {
          notification.handleError(error, 'AI总结');
        }
      });
    }


    // 进度条开关
    const progressSwitch = container.querySelector('#progress-switch');
    if (progressSwitch) {
      progressSwitch.addEventListener('click', () => {
        progressSwitch.classList.toggle('on');
        const isOn = progressSwitch.classList.contains('on');
        
        if (isOn) {
          // 在进度条上添加要点标记
          this.addProgressBarMarkers(container);
        } else {
          // 移除进度条标记
          this.removeProgressBarMarkers();
        }
      });
    }

    // 下载按钮
    const downloadIcon = container.querySelector('.download-icon');
    if (downloadIcon) {
      downloadIcon.addEventListener('click', (e) => {
        e.stopPropagation();
        try {
          subtitleService.downloadSubtitleFile();
          notification.success('字幕文件已下载');
        } catch (error) {
          notification.handleError(error, '下载字幕');
        }
      });
    }

    // Notion发送按钮
    const notionIcon = container.querySelector('.notion-icon');
    if (notionIcon) {
      notionIcon.addEventListener('click', async (e) => {
        e.stopPropagation();
        
        // 检查AI总结是否正在生成中
        if (state.ai.isSummarizing) {
          notification.warning('AI总结正在生成中，请稍后再发送到Notion');
          return;
        }
        
        const subtitleData = state.getSubtitleData();
        if (!subtitleData || subtitleData.length === 0) {
          notification.error('没有字幕数据可发送');
          return;
        }
        
        try {
          // 获取视频信息和AI总结
          const videoInfo = state.getVideoInfo();
          const videoKey = state.getVideoKey();
          const aiSummary = videoKey ? state.getAISummary(videoKey) : null;
          
          // 检查是否已经有Notion页面
          const existingPageId = state.getNotionPageId(videoKey);
          if (existingPageId) {
            // 已存在Notion页面，询问用户操作
            const confirmUpdate = confirm('该视频已经发送到Notion。\n\n点击"确定"更新现有页面\n点击"取消"创建新页面');
            
            if (!confirmUpdate) {
              // 用户选择创建新页面，清除现有页面ID
              state.setNotionPageId(videoKey, null);
            }
          }
          
          // 获取内容配置选项
          const contentOptions = config.getNotionContentOptions();
          
          // 根据配置决定是否发送字幕
          const subtitleToSend = contentOptions.subtitles ? subtitleData : null;
          
          // 发送内容（根据配置）
          await notionService.sendComplete(subtitleToSend, aiSummary, videoInfo);
        } catch (error) {
          notification.handleError(error, 'Notion发送');
        }
      });
    }

    // 初始化字幕滚动（已移除字幕列表，不再需要）

    // 使用事件委托处理字幕项点击、段落点击和保存按钮（优化：减少事件监听器）
    container.addEventListener('click', (e) => {
      // 首先处理段落元素点击（AI时间戳段落）
      const sectionItem = e.target.closest('.section-item');
      if (sectionItem) {
        e.stopPropagation();
        
        // 清除文字选择，防止与笔记功能冲突
        const selection = window.getSelection();
        if (selection) {
          selection.removeAllRanges();
        }
        
        logger.info('EventHandlers', '段落元素被点击');
        
        // 获取时间戳
        const timeStr = sectionItem.getAttribute('data-time');
        logger.info('EventHandlers', '时间戳字符串:', timeStr);
        
        if (timeStr) {
          // 解析时间戳 [MM:SS] 或 [HH:MM:SS]
          let timeInSeconds = 0;
          const bracketMatch = timeStr.match(/\[?(\d{1,2}):(\d{2})(?::(\d{2}))?\]?/);
          
          if (bracketMatch) {
            const [_, firstPart, secondPart, thirdPart] = bracketMatch;
            if (thirdPart) {
              // HH:MM:SS 格式
              timeInSeconds = parseInt(firstPart) * 3600 + parseInt(secondPart) * 60 + parseInt(thirdPart);
            } else {
              // MM:SS 格式
              timeInSeconds = parseInt(firstPart) * 60 + parseInt(secondPart);
            }
            
            logger.info('EventHandlers', '解析后的秒数:', timeInSeconds);
            
            // 跳转视频 - 与字幕项完全相同的方式
            const video = document.querySelector(SELECTORS.VIDEO);
            if (video) {
              video.currentTime = timeInSeconds;
              
              const displayTime = timeStr.replace(/[\[\]]/g, '');
              notification.info(`跳转到 ${displayTime}`);
              
              // 添加点击动画
              sectionItem.classList.add('clicked');
              setTimeout(() => {
                sectionItem.classList.remove('clicked');
              }, 300);
            }
          }
        }
        return;
      }
      
      // 处理保存笔记按钮
      const saveBtn = e.target.closest('.save-subtitle-note-btn');
      if (saveBtn) {
        e.stopPropagation();
        const content = saveBtn.getAttribute('data-content');
        if (content) {
          notesService.saveSubtitleNote(content);
          saveBtn.textContent = '✓';
          setTimeout(() => {
            saveBtn.textContent = '保存';
          }, 1000);
        }
        return;
      }

      // 处理字幕项点击
      const subtitleItem = e.target.closest('.subtitle-item');
      if (subtitleItem) {
        const video = document.querySelector(SELECTORS.VIDEO);
        if (video) {
          const startTime = parseFloat(subtitleItem.dataset.from);
          
          // 先移除所有高亮
          container.querySelectorAll('.subtitle-item').forEach(i => {
            i.classList.remove('current');
          });
          
          // 只高亮当前点击的
          subtitleItem.classList.add('current');
          
          // 跳转视频
          video.currentTime = startTime;
        }
      }
    });

    // 同步字幕高亮
    this.syncSubtitleHighlight(container);
  }

  /**
   * 设置拖拽功能
   * @param {HTMLElement} container - 字幕容器
   */
  setupDragging(container) {
    const header = container.querySelector('.subtitle-header');
    if (!header) return;

    header.addEventListener('mousedown', (e) => {
      // 如果点击的是按钮，不触发拖拽
      if (e.target.closest('.subtitle-close') || 
          e.target.closest('.ai-icon') || 
          e.target.closest('.download-icon') || 
          e.target.closest('.notion-icon')) {
        return;
      }

      this.isDragging = true;
      this.dragStartX = e.clientX;
      this.dragStartY = e.clientY;
      
      // 启用GPU加速
      container.style.willChange = 'transform';
      
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isDragging) return;
      
      requestAnimationFrame(() => {
        const deltaX = e.clientX - this.dragStartX;
        const deltaY = e.clientY - this.dragStartY;
        
        this.translateX += deltaX;
        this.translateY += deltaY;
        
        this.dragStartX = e.clientX;
        this.dragStartY = e.clientY;
        
        container.style.transform = `translate(${this.translateX}px, ${this.translateY}px)`;
      });
    });

    document.addEventListener('mouseup', () => {
      if (this.isDragging) {
        this.isDragging = false;
        container.style.willChange = 'auto';
        this.savePanelPosition(container);
      }
    });
  }

  /**
   * 设置大小调整功能
   * @param {HTMLElement} container - 字幕容器
   */
  setupResize(container) {
    const resizeHandle = container.querySelector('.subtitle-resize-handle');
    if (!resizeHandle) return;

    resizeHandle.addEventListener('mousedown', (e) => {
      this.isResizing = true;
      this.resizeStartX = e.clientX;
      this.resizeStartY = e.clientY;
      this.resizeStartWidth = container.offsetWidth;
      this.resizeStartHeight = container.offsetHeight;
      
      e.preventDefault();
      e.stopPropagation();
    });

    document.addEventListener('mousemove', (e) => {
      if (!this.isResizing) return;
      
      requestAnimationFrame(() => {
        const deltaX = e.clientX - this.resizeStartX;
        const deltaY = e.clientY - this.resizeStartY;
        
        const newWidth = this.resizeStartWidth + deltaX;
        const newHeight = this.resizeStartHeight + deltaY;
        
        // 限制尺寸范围
        const constrainedWidth = Math.max(300, Math.min(800, newWidth));
        const maxHeight = window.innerHeight * 0.9;
        const constrainedHeight = Math.max(400, Math.min(maxHeight, newHeight));
        
        container.style.width = `${constrainedWidth}px`;
        container.style.maxHeight = `${constrainedHeight}px`;
      });
    });

    document.addEventListener('mouseup', () => {
      if (this.isResizing) {
        this.isResizing = false;
        this.savePanelDimensions(container);
      }
    });
  }

  /**
   * 保存面板位置
   */
  savePanelPosition(container) {
    try {
      localStorage.setItem('subtitle_panel_position', JSON.stringify({
        translateX: this.translateX,
        translateY: this.translateY
      }));
    } catch (error) {
      console.error('保存面板位置失败:', error);
    }
  }

  /**
   * 保存面板尺寸
   */
  savePanelDimensions(container) {
    try {
      localStorage.setItem('subtitle_panel_dimensions', JSON.stringify({
        width: container.offsetWidth,
        height: container.offsetHeight
      }));
    } catch (error) {
      console.error('保存面板尺寸失败:', error);
    }
  }

  /**
   * 加载面板尺寸和位置
   */
  loadPanelDimensions(container) {
    try {
      // 加载尺寸
      const savedDimensions = localStorage.getItem('subtitle_panel_dimensions');
      if (savedDimensions) {
        const { width, height } = JSON.parse(savedDimensions);
        container.style.width = `${width}px`;
        container.style.maxHeight = `${height}px`;
      }

      // 加载位置
      const savedPosition = localStorage.getItem('subtitle_panel_position');
      if (savedPosition) {
        const { translateX, translateY } = JSON.parse(savedPosition);
        this.translateX = translateX;
        this.translateY = translateY;
        container.style.transform = `translate(${translateX}px, ${translateY}px)`;
      }
    } catch (error) {
      console.error('加载面板设置失败:', error);
    }
  }

  /**
   * 同步字幕高亮（优化版：使用节流+二分查找+缓存+DOM缓存）
   * @param {HTMLElement} container - 字幕容器
   */
  syncSubtitleHighlight(container) {
    // 使用DOM缓存获取视频元素
    const video = domCache.get(SELECTORS.VIDEO);
    if (!video) return;

    // 缓存字幕数据
    const items = Array.from(container.querySelectorAll('.subtitle-item'));
    this.subtitleDataCache = items.map(item => ({
      element: item,
      from: parseFloat(item.dataset.from),
      to: parseFloat(item.dataset.to)
    }));

    // 创建节流函数（使用 RAF 优化性能）
    if (!this.throttledHighlight) {
      this.throttledHighlight = throttleRAF((currentTime) => {
        this.updateSubtitleHighlight(currentTime);
      });
    }

    video.addEventListener('timeupdate', () => {
      this.throttledHighlight(video.currentTime);
    });
  }

  /**
   * 更新字幕高亮（使用二分查找）
   * @param {number} currentTime - 当前播放时间
   */
  updateSubtitleHighlight(currentTime) {
    if (!this.subtitleDataCache || this.subtitleDataCache.length === 0) return;

    // 使用二分查找定位当前字幕
    const targetIndex = findSubtitleIndex(this.subtitleDataCache, currentTime);

    // 如果当前高亮的字幕没变，跳过更新
    if (targetIndex === this.currentHighlightedIndex) return;

    // 移除旧高亮
    if (this.currentHighlightedIndex >= 0 && this.currentHighlightedIndex < this.subtitleDataCache.length) {
      this.subtitleDataCache[this.currentHighlightedIndex].element.classList.remove('current');
    }

    // 添加新高亮
    if (targetIndex >= 0) {
      this.subtitleDataCache[targetIndex].element.classList.add('current');
    }

    this.currentHighlightedIndex = targetIndex;
  }


  /**
   * 显示AI配置模态框
   */
  showAIConfigModal() {
    const modal = document.getElementById('ai-config-modal');
    if (!modal) return;

    // 渲染配置列表
    const listEl = document.getElementById('ai-config-list');
    if (listEl) {
      uiRenderer.renderAIConfigList(listEl);
    }

    // 清空表单并隐藏
    this.clearAIConfigForm();
    const formEl = modal.querySelector('.ai-config-form');
    if (formEl) {
      formEl.classList.add('hidden');
    }

    // 加载自动总结开关
    document.getElementById('ai-auto-summary-enabled').checked = config.getAIAutoSummaryEnabled();

    modal.classList.add('show');
    
    // 注册到模态框管理器（统一处理ESC键）
    modalManager.push(this.aiConfigModalProxy);
  }

  /**
   * 隐藏AI配置模态框
   */
  hideAIConfigModal() {
    const modal = document.getElementById('ai-config-modal');
    if (!modal) return;

    // 保存自动总结开关
    const autoSummaryEnabled = document.getElementById('ai-auto-summary-enabled').checked;
    config.setAIAutoSummaryEnabled(autoSummaryEnabled);

    modal.classList.remove('show');
    this.clearAIConfigForm();
    
    // 从模态框管理器移除
    modalManager.pop(this.aiConfigModalProxy);
  }

  /**
   * 清空AI配置表单
   */
  clearAIConfigForm() {
    const nameEl = document.getElementById('ai-config-name');
    const urlEl = document.getElementById('ai-config-url');
    const apikeyEl = document.getElementById('ai-config-apikey');
    const modelEl = document.getElementById('ai-config-model');
    const prompt1El = document.getElementById('ai-config-prompt1');
    const prompt2El = document.getElementById('ai-config-prompt2');
    const openrouterEl = document.getElementById('ai-config-is-openrouter');
    const saveNewBtn = document.getElementById('ai-save-new-btn');
    const updateBtn = document.getElementById('ai-update-btn');
    const modelSelectWrapper = document.getElementById('model-select-wrapper');
    const apiKeyHelpLink = document.getElementById('api-key-help-link');

    if (nameEl) nameEl.value = '';
    if (urlEl) urlEl.value = 'https://openrouter.ai/api/v1/chat/completions';
    if (apikeyEl) apikeyEl.value = '';
    if (modelEl) modelEl.value = 'alibaba/tongyi-deepresearch-30b-a3b:free';
    if (prompt1El) prompt1El.value = '';
    if (prompt2El) prompt2El.value = '';
    if (openrouterEl) openrouterEl.checked = true;
    if (saveNewBtn) saveNewBtn.style.display = '';
    if (updateBtn) updateBtn.style.display = 'none';
    if (modelSelectWrapper) modelSelectWrapper.style.display = 'none';
    if (apiKeyHelpLink) apiKeyHelpLink.innerHTML = '';
  }

  /**
   * 显示Notion配置模态框
   */
  showNotionConfigModal() {
    const modal = document.getElementById('notion-config-modal');
    if (!modal) return;

    const notionConfig = config.getNotionConfig();
    const contentOptions = config.getNotionContentOptions();
    
    document.getElementById('notion-api-key').value = notionConfig.apiKey;
    document.getElementById('notion-parent-page-id').value = notionConfig.parentPageId;
    document.getElementById('notion-auto-send-enabled').checked = config.getNotionAutoSendEnabled();
    
    // 加载内容选项
    document.getElementById('notion-content-video-info').checked = contentOptions.videoInfo;
    document.getElementById('notion-content-summary').checked = contentOptions.summary;
    document.getElementById('notion-content-segments').checked = contentOptions.segments;
    document.getElementById('notion-content-subtitles').checked = contentOptions.subtitles;
    
    // 加载笔记自动同步选项
    document.getElementById('notion-notes-auto-sync').checked = config.getNotionNotesAutoSync();
    
    const statusEl = document.getElementById('notion-status-message');
    if (statusEl) statusEl.innerHTML = '';

    modal.classList.add('show');
    
    // 注册到模态框管理器（统一处理ESC键）
    modalManager.push(this.notionConfigModalProxy);
  }

  /**
   * 隐藏Notion配置模态框
   */
  hideNotionConfigModal() {
    const modal = document.getElementById('notion-config-modal');
    if (modal) {
      modal.classList.remove('show');
    }
    
    // 从模态框管理器移除
    modalManager.pop(this.notionConfigModalProxy);
  }

  /**
   * 显示快捷键配置模态框
   */
  showShortcutConfigModal() {
    try {
      logger.debug('EventHandlers', '显示快捷键配置模态框');
      
      // 检查是否已存在模态框
      const existingModal = document.getElementById('shortcut-config-modal');
      if (existingModal) {
        existingModal.classList.add('show');
        // 确保注册到模态管理器
        modalManager.push(this.shortcutConfigModalProxy);
        return;
      }
      
      // 创建并添加模态框
      const modalHtml = uiRenderer.renderShortcutConfigModal();
      if (!modalHtml) {
        console.error('[EventHandlers] 无法生成快捷键配置模态框HTML');
        notification.error('无法打开快捷键设置');
        return;
      }
      
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = modalHtml;
      const modal = tempDiv.firstElementChild;
      if (!modal) {
        console.error('[EventHandlers] 无法创建模态框元素');
        notification.error('无法创建快捷键设置界面');
        return;
      }
      
      document.body.appendChild(modal);

      // 显示模态框
      requestAnimationFrame(() => {
        modal.classList.add('show');
        // 添加到模态管理器（使用push而不是register）
        modalManager.push(this.shortcutConfigModalProxy);
      });

      // 绑定事件
      this.bindShortcutConfigModalEvents(modal);
      logger.debug('EventHandlers', '快捷键配置模态框已显示');
    } catch (error) {
      console.error('[EventHandlers] 显示快捷键配置模态框失败:', error);
      notification.error('打开快捷键设置失败: ' + error.message);
    }
  }

  /**
   * 隐藏快捷键配置模态框
   */
  hideShortcutConfigModal() {
    const modal = document.getElementById('shortcut-config-modal');
    if (modal) {
      modal.classList.remove('show');
      // 从模态管理器中移除（使用pop而不是unregister）
      modalManager.pop(this.shortcutConfigModalProxy);
      // 延迟移除DOM元素，等动画完成
      setTimeout(() => {
        if (modal && modal.parentNode) {
          modal.parentNode.removeChild(modal);
        }
      }, 300);
    }
  }

  /**
   * 绑定快捷键配置模态框事件
   * @param {HTMLElement} modal - 快捷键配置模态框
   */
  bindShortcutConfigModalEvents(modal) {
    // 关闭按钮
    const closeBtn = modal.querySelector('.config-modal-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hideShortcutConfigModal();
      });
    }

    // 点击背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hideShortcutConfigModal();
      }
    });

    // 单个快捷键输入框
    const shortcutInputs = modal.querySelectorAll('.shortcut-input');
    shortcutInputs.forEach(input => {
      input.addEventListener('click', (e) => {
        e.preventDefault();
        this.startShortcutCapture(input);
      });
    });

    // 单个重置按钮
    const resetBtns = modal.querySelectorAll('.shortcut-reset-btn');
    resetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        const ShortcutManagerClass = shortcutManager.constructor;
        const defaults = ShortcutManagerClass.DEFAULT_SHORTCUTS || {};
        if (defaults[key]) {
          shortcutManager.updateShortcut(key, defaults[key]);
          const input = modal.querySelector(`.shortcut-input[data-key="${key}"]`);
          if (input) {
            input.value = shortcutManager.formatShortcut(defaults[key]);
          }
          notification.success('已重置到默认值');
        }
      });
    });

    // 重置所有快捷键
    const resetAllBtn = modal.querySelector('#reset-all-shortcuts');
    if (resetAllBtn) {
      resetAllBtn.addEventListener('click', () => {
        if (confirm('确定要重置所有快捷键到默认值吗？')) {
          shortcutManager.resetToDefaults();
          notification.success('快捷键已重置到默认值');
          // 重新渲染
          this.hideShortcutConfigModal();
          this.showShortcutConfigModal();
        }
      });
    }

    // 长按和双击模式按钮
    const modeButtons = modal.querySelectorAll('.shortcut-mode-btn');
    modeButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const key = btn.dataset.key;
        const mode = btn.dataset.mode; // 'hold' 或 'double'
        const shortcut = shortcutManager.getAllShortcuts()[key];
        
        if (!shortcut) return;

        // 获取同一行的两个按钮
        const item = btn.closest('.shortcut-item');
        const holdBtn = item.querySelector('.shortcut-hold-btn');
        const doubleBtn = item.querySelector('.shortcut-double-btn');

        // 切换模式（互斥关系）
        if (mode === 'hold') {
          const isActive = btn.classList.contains('active');
          holdBtn.classList.toggle('active');
          doubleBtn.classList.remove('active');
          
          // 更新快捷键配置
          const newConfig = {
            ...shortcut,
            holdMode: !isActive,
            doubleClickMode: false
          };
          shortcutManager.updateShortcut(key, newConfig);
        } else if (mode === 'double') {
          const isActive = btn.classList.contains('active');
          doubleBtn.classList.toggle('active');
          holdBtn.classList.remove('active');
          
          // 更新快捷键配置
          const newConfig = {
            ...shortcut,
            holdMode: false,
            doubleClickMode: !isActive
          };
          shortcutManager.updateShortcut(key, newConfig);
        }
      });
    });
  }

  /**
   * 开始录制快捷键
   * @param {HTMLElement} input - 输入框元素
   */
  startShortcutCapture(input) {
    const shortcutKey = input.dataset.key;
    const shortcut = shortcutManager.getAllShortcuts()[shortcutKey];
    
    input.classList.add('recording');
    
    // 检查是否选择了长按或双击模式
    const item = input.closest('.shortcut-item');
    const holdBtn = item?.querySelector('.shortcut-hold-btn');
    const doubleBtn = item?.querySelector('.shortcut-double-btn');
    const isHoldMode = holdBtn?.classList.contains('active');
    const isDoubleMode = doubleBtn?.classList.contains('active');

    if (isHoldMode || isDoubleMode) {
      input.value = '按下任意键...';
    } else {
      input.value = '按下快捷键...';
    }

    let doubleClickTimer = null;
    let lastKeyCode = '';

    const IS_MAC = /Mac|iPhone|iPad|iPod/.test(navigator.platform);

    const handleKeydown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      // ESC取消
      if (event.key === 'Escape') {
        input.classList.remove('recording');
        input.value = shortcutManager.formatShortcut(shortcut);
        document.removeEventListener('keydown', handleKeydown);
        return;
      }

      // 如果是长按或双击模式，只需要单个按键
      if (isHoldMode || isDoubleMode) {
        // 直接保存单个按键
        const newConfig = {
          key: event.code || event.key,
          meta: false,
          ctrl: false,
          alt: false,
          shift: false,
          holdMode: isHoldMode,
          doubleClickMode: isDoubleMode
        };

        const result = shortcutManager.updateShortcut(shortcutKey, newConfig);
        if (result.success) {
          input.value = shortcutManager.formatShortcut(newConfig);
          notification.success('快捷键已更新');
        } else {
          notification.error(result.error);
          input.value = shortcutManager.formatShortcut(shortcut);
        }

        input.classList.remove('recording');
        document.removeEventListener('keydown', handleKeydown);
        return;
      }

      // 检测修饰键（Command/Ctrl/Alt/Shift）- 仅当按下修饰键时显示提示
      const isModifierOnly = ['Meta', 'Control', 'Alt', 'Shift'].includes(event.key);
      
      if (isModifierOnly) {
        // 修饰键被按下，等待字符键
        input.value = '继续按下字符键...';
        return;
      }

      // 检测双击（仅针对不需要修饰键的快捷键）
      if (!event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey) {
        if (shortcutKey === 'takeScreenshot' && event.code === 'Slash') {
          if (lastKeyCode === 'Slash' && doubleClickTimer) {
            clearTimeout(doubleClickTimer);
            const newConfig = {
              key: 'Slash',
              meta: false,
              ctrl: false,
              alt: false,
              shift: false,
              doubleClick: true
            };
            
            const result = shortcutManager.updateShortcut(shortcutKey, newConfig);
            if (result.success) {
              input.value = shortcutManager.formatShortcut(newConfig);
              notification.success('快捷键已更新');
            }
            input.classList.remove('recording');
            document.removeEventListener('keydown', handleKeydown);
          } else {
            lastKeyCode = 'Slash';
            doubleClickTimer = setTimeout(() => {
              doubleClickTimer = null;
              lastKeyCode = '';
            }, 300);
          }
          return;
        }
      }

      // 构建快捷键配置（支持跨平台）
      const newConfig = {
        key: event.code || event.key,
        meta: event.metaKey,        // Mac Command 键
        ctrl: event.ctrlKey,        // Windows Ctrl 键
        alt: event.altKey,
        shift: event.shiftKey,
        doubleClick: false
      };

      // 检查冲突
      const conflict = shortcutManager.checkConflict(shortcutKey, newConfig);
      if (conflict) {
        notification.warning(`与"${conflict}"冲突，请重新设置`);
        input.value = shortcutManager.formatShortcut(shortcut);
      } else {
        const result = shortcutManager.updateShortcut(shortcutKey, newConfig);
        if (result.success) {
          input.value = shortcutManager.formatShortcut(newConfig);
          notification.success('快捷键已更新');
        } else {
          notification.error(result.error);
          input.value = shortcutManager.formatShortcut(shortcut);
        }
      }

      input.classList.remove('recording');
      document.removeEventListener('keydown', handleKeydown);
    };

    document.addEventListener('keydown', handleKeydown);
  }

  /**
   * 绑定AI配置模态框事件
   * @param {HTMLElement} modal - AI配置模态框
   */
  bindAIConfigModalEvents(modal) {
    // 点击背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hideAIConfigModal();
      }
    });

    // 绑定配置列表事件（选择、编辑）
    const listEl = document.getElementById('ai-config-list');
    if (listEl) {
      listEl.addEventListener('click', (e) => {
        const item = e.target.closest('.ai-config-item');
        const editBtn = e.target.closest('.ai-edit-btn');

        if (editBtn) {
          const id = editBtn.dataset.id;
          // 显示表单并加载配置
          const formEl = modal.querySelector('.ai-config-form');
          if (formEl) {
            formEl.classList.remove('hidden');
          }
          this.loadConfigToForm(id);
        } else if (item && !editBtn) {
          const id = item.dataset.id;
          config.setSelectedAIConfigId(id);
          uiRenderer.renderAIConfigList(listEl);
          const cfg = config.getAIConfigs().find(c => c.id === id);
          notification.success(`已选择配置: ${cfg.name}`);
          // 显示表单并加载配置
          const formEl = modal.querySelector('.ai-config-form');
          if (formEl) {
            formEl.classList.remove('hidden');
          }
          this.loadConfigToForm(id);
        }
      });
    }

    // 开始总结按钮
    const startSummaryBtn = document.getElementById('ai-start-summary-btn');
    if (startSummaryBtn) {
      startSummaryBtn.addEventListener('click', async () => {
        const subtitleData = state.getSubtitleData();
        if (!subtitleData || subtitleData.length === 0) {
          notification.error('没有可用的字幕数据');
          return;
        }
        
        // 检查是否有选中的AI配置
        const selectedConfig = config.getSelectedAIConfig();
        if (!selectedConfig) {
          notification.warning('请先选择或配置一个AI服务');
          return;
        }
        
        // 隐藏模态框
        this.hideAIConfigModal();
        
        try {
          // 触发AI总结（会同时生成markdown总结和JSON段落，手动触发）
          await aiService.summarize(subtitleData, true);
        } catch (error) {
          notification.handleError(error, 'AI总结');
        }
      });
    }

    // 新建配置按钮
    document.getElementById('ai-new-config-btn').addEventListener('click', () => {
      this.clearAIConfigForm();
      // 显示表单
      const formEl = modal.querySelector('.ai-config-form');
      if (formEl) {
        formEl.classList.remove('hidden');
        // 滚动到表单
        setTimeout(() => {
          formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        }, 100);
      }
      notification.info('请填写新配置信息');
    });

    // 保存/添加按钮
    document.getElementById('ai-save-new-btn').addEventListener('click', () => {
      this.saveNewAIConfig();
    });

    document.getElementById('ai-update-btn').addEventListener('click', () => {
      this.updateAIConfig();
    });

    // 取消按钮
    document.getElementById('ai-cancel-btn').addEventListener('click', () => {
      this.hideAIConfigModal();
    });

    // 删除配置按钮
    document.getElementById('ai-delete-current-btn').addEventListener('click', () => {
      const deleteBtn = document.getElementById('ai-delete-current-btn');
      const id = deleteBtn?.dataset.deleteId;
      if (!id) return;

      if (notification.confirm('确定要删除这个配置吗？')) {
        const result = config.deleteAIConfig(id);
        if (result.success) {
          notification.success('配置已删除');
          const listEl = document.getElementById('ai-config-list');
          if (listEl) uiRenderer.renderAIConfigList(listEl);
          // 隐藏表单
          const formEl = document.querySelector('.ai-config-form');
          if (formEl) {
            formEl.classList.add('hidden');
          }
          // 隐藏删除按钮
          deleteBtn.style.display = 'none';
        } else {
          notification.error(result.error);
        }
      }
    });

    // 获取模型按钮
    document.getElementById('fetch-models-btn').addEventListener('click', async () => {
      await this.fetchModels();
    });
  }

  /**
   * 加载配置到表单（选择配置时使用）
   * @param {string} id - 配置ID
   */
  loadConfigToForm(id) {
    const configs = config.getAIConfigs();
    const cfg = configs.find(c => c.id === id);
    if (!cfg) return;

    const nameEl = document.getElementById('ai-config-name');
    const urlEl = document.getElementById('ai-config-url');
    const apikeyEl = document.getElementById('ai-config-apikey');
    const modelEl = document.getElementById('ai-config-model');
    const prompt1El = document.getElementById('ai-config-prompt1');
    const prompt2El = document.getElementById('ai-config-prompt2');
    const openrouterEl = document.getElementById('ai-config-is-openrouter');
    const saveNewBtn = document.getElementById('ai-save-new-btn');
    const updateBtn = document.getElementById('ai-update-btn');
    const modelSelectWrapper = document.getElementById('model-select-wrapper');

    if (nameEl) nameEl.value = cfg.name;
    if (urlEl) urlEl.value = cfg.url;
    if (apikeyEl) apikeyEl.value = cfg.apiKey;
    if (modelEl) modelEl.value = cfg.model;
    // 设置两个提示词字段
    if (prompt1El) prompt1El.value = cfg.prompt1 || '';
    if (prompt2El) prompt2El.value = cfg.prompt2 || '';
    if (openrouterEl) openrouterEl.checked = cfg.isOpenRouter || false;

    // 显示API Key获取链接
    const apiKeyHelpLink = document.getElementById('api-key-help-link');
    if (apiKeyHelpLink && AI_API_KEY_URLS[cfg.id]) {
      apiKeyHelpLink.innerHTML = `<a href="${AI_API_KEY_URLS[cfg.id]}" target="_blank" style="color: #60a5fa; text-decoration: none;">📖 如何获取API Key?</a>`;
    } else if (apiKeyHelpLink) {
      apiKeyHelpLink.innerHTML = '';
    }

    // 显示更新按钮
    if (saveNewBtn) saveNewBtn.style.display = 'none';
    if (updateBtn) {
      updateBtn.style.display = '';
      updateBtn.dataset.editId = id;
    }
    if (modelSelectWrapper) modelSelectWrapper.style.display = 'none';

    // 显示/隐藏删除按钮（非预设配置显示）
    const deleteBtn = document.getElementById('ai-delete-current-btn');
    if (deleteBtn) {
      if (id === 'openrouter' || id === 'openai' || id === 'siliconflow' || 
          id === 'deepseek' || id === 'moonshot' || id === 'zhipu' || 
          id === 'yi' || id === 'dashscope' || id === 'gemini') {
        deleteBtn.style.display = 'none';
      } else {
        deleteBtn.style.display = '';
        deleteBtn.dataset.deleteId = id;
      }
    }

    // 滚动到表单
    setTimeout(() => {
      const formEl = document.querySelector('.ai-config-form');
      if (formEl) {
        formEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    }, 100);
  }

  /**
   * 编辑AI配置（与loadConfigToForm相同，保持兼容）
   * @param {string} id - 配置ID
   */
  editAIConfig(id) {
    this.loadConfigToForm(id);
  }

  /**
   * 保存新的AI配置
   */
  saveNewAIConfig() {
    const newConfig = {
      name: document.getElementById('ai-config-name').value.trim(),
      url: document.getElementById('ai-config-url').value.trim(),
      apiKey: document.getElementById('ai-config-apikey').value.trim(),
      model: document.getElementById('ai-config-model').value.trim(),
      prompt1: document.getElementById('ai-config-prompt1').value,
      prompt2: document.getElementById('ai-config-prompt2').value,
      isOpenRouter: document.getElementById('ai-config-is-openrouter').checked
    };

    const result = config.addAIConfig(newConfig);
    if (result.success) {
      notification.success(`配置"${newConfig.name}"已添加`);
      const listEl = document.getElementById('ai-config-list');
      if (listEl) uiRenderer.renderAIConfigList(listEl);
      this.clearAIConfigForm();
    } else {
      notification.error(result.error);
    }
  }

  /**
   * 更新AI配置
   */
  updateAIConfig() {
    const id = document.getElementById('ai-update-btn').dataset.editId;
    if (!id) return;

    const updates = {
      name: document.getElementById('ai-config-name').value.trim(),
      url: document.getElementById('ai-config-url').value.trim(),
      apiKey: document.getElementById('ai-config-apikey').value.trim(),
      model: document.getElementById('ai-config-model').value.trim(),
      prompt1: document.getElementById('ai-config-prompt1').value,
      prompt2: document.getElementById('ai-config-prompt2').value,
      isOpenRouter: document.getElementById('ai-config-is-openrouter').checked
    };

    const result = config.updateAIConfig(id, updates);
    if (result.success) {
      notification.success(`配置"${updates.name}"已更新`);
      const listEl = document.getElementById('ai-config-list');
      if (listEl) uiRenderer.renderAIConfigList(listEl);
      this.clearAIConfigForm();
    } else {
      notification.error(result.error);
    }
  }

  /**
   * 获取OpenRouter模型列表
   */
  async fetchModels() {
    const apiKey = document.getElementById('ai-config-apikey').value.trim();
    const url = document.getElementById('ai-config-url').value.trim();
    const isOpenRouter = document.getElementById('ai-config-is-openrouter').checked;

    if (!apiKey) {
      notification.error('请先填写 API Key');
      return;
    }

    if (!isOpenRouter) {
      notification.error('仅OpenRouter支持获取模型列表');
      return;
    }

    const btn = document.getElementById('fetch-models-btn');
    btn.disabled = true;
    btn.textContent = '获取中...';

    try {
      const models = await aiService.fetchOpenRouterModels(apiKey, url);
      const selectWrapper = document.getElementById('model-select-wrapper');
      const select = document.getElementById('model-select');
      const searchInput = document.getElementById('model-search-input');

      if (!select) {
        notification.error('模型选择器未找到');
        return;
      }

      // 保存完整模型列表
      this.allModels = models;

      // 渲染所有模型
      select.innerHTML = '';
      models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = `${model.name || model.id} (${model.context_length || 'N/A'} tokens)`;
        option.title = model.id;
        select.appendChild(option);
      });

      if (selectWrapper) selectWrapper.style.display = 'block';

      // 绑定选择事件
      select.onchange = () => {
        document.getElementById('ai-config-model').value = select.value;
      };

      // 双击选择事件
      select.ondblclick = () => {
        document.getElementById('ai-config-model').value = select.value;
        notification.success('已选择模型');
      };

      // 绑定搜索事件
      if (searchInput) {
        searchInput.value = '';
        searchInput.oninput = (e) => {
          this.filterModels(e.target.value);
        };

        searchInput.onkeydown = (e) => {
          if (e.key === 'Enter' && select.options.length > 0) {
            select.selectedIndex = 0;
            document.getElementById('ai-config-model').value = select.options[0].value;
            notification.success('已选择: ' + select.options[0].text);
          }
        };
      }

      notification.success(`已获取 ${models.length} 个模型`);
    } catch (error) {
      notification.error(`获取模型列表失败: ${error.message}`);
    } finally {
      btn.disabled = false;
      btn.textContent = '获取模型';
    }
  }

  /**
   * 过滤模型列表（模糊搜索）
   * @param {string} searchTerm - 搜索词
   */
  filterModels(searchTerm) {
    if (!this.allModels) return;

    const select = document.getElementById('model-select');
    if (!select) return;

    const term = searchTerm.toLowerCase().trim();
    
    if (!term) {
      // 搜索为空，显示所有模型
      select.innerHTML = '';
      this.allModels.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = `${model.name || model.id} (${model.context_length || 'N/A'} tokens)`;
        option.title = model.id;
        select.appendChild(option);
      });
      return;
    }

    // 模糊搜索
    const filtered = this.allModels.filter(model => {
      const id = (model.id || '').toLowerCase();
      const name = (model.name || '').toLowerCase();
      return id.includes(term) || name.includes(term);
    });

    select.innerHTML = '';
    filtered.forEach(model => {
      const option = document.createElement('option');
      option.value = model.id;
      option.textContent = `${model.name || model.id} (${model.context_length || 'N/A'} tokens)`;
      option.title = model.id;
      select.appendChild(option);
    });

    const searchInput = document.getElementById('model-search-input');
    if (searchInput) {
      searchInput.placeholder = filtered.length > 0 
        ? `找到 ${filtered.length} 个模型`
        : `未找到匹配的模型`;
    }
  }

  /**
   * 在进度条上添加要点标记
   * @param {HTMLElement} container - 字幕容器
   */
  addProgressBarMarkers(container) {
    // 获取所有要点的时间戳
    const sectionItems = container.querySelectorAll('.section-item[data-time]');
    const video = document.querySelector('video');
    const progressBar = document.querySelector('.bpx-player-progress-wrap');
    
    if (!video || !progressBar) return;
    
    const videoDuration = video.duration;
    if (!videoDuration) return;
    
    // 创建要点标记容器
    let markersContainer = progressBar.querySelector('.ai-points-container');
    if (!markersContainer) {
      markersContainer = document.createElement('div');
      markersContainer.className = 'ai-points-container';
      progressBar.appendChild(markersContainer);
    }
    
    // 清空旧的标记
    markersContainer.innerHTML = '';
    
    // 为每个要点添加标记
    sectionItems.forEach(item => {
      const timeStr = item.getAttribute('data-time');
      if (!timeStr) return;
      
      // 解析时间戳 [MM:SS]
      const match = timeStr.match(/\[(\d{1,2}):(\d{2})\]/);
      if (!match) return;
      
      const minutes = parseInt(match[1]);
      const seconds = parseInt(match[2]);
      const timeInSeconds = minutes * 60 + seconds;
      
      // 计算位置百分比
      const percentage = (timeInSeconds / videoDuration) * 100;
      
      // 创建标记元素（圆点）
      const marker = document.createElement('span');
      marker.className = 'bpx-player-progress-point bpx-player-progress-point-aipoint';
      marker.style.cssText = `left: ${percentage}%;`;
      marker.setAttribute('data-time', timeInSeconds);
      
      // 添加点击事件
      marker.addEventListener('click', () => {
        video.currentTime = timeInSeconds;
      });
      
      markersContainer.appendChild(marker);
    });
    
    // 添加样式
    this._addProgressBarStyles();
  }
  
  /**
   * 移除进度条标记
   */
  removeProgressBarMarkers() {
    const markersContainer = document.querySelector('.ai-points-container');
    if (markersContainer) {
      markersContainer.remove();
    }
  }
  
  /**
   * 添加进度条标记样式
   * @private
   */
  _addProgressBarStyles() {
    if (document.querySelector('#ai-progress-styles')) return;
    
    const style = document.createElement('style');
    style.id = 'ai-progress-styles';
    style.textContent = `
      .ai-points-container {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        pointer-events: none;
        z-index: 5;
      }
      
      .bpx-player-progress-point-aipoint {
        position: absolute;
        top: 50%;
        transform: translate(-50%, -50%);
        width: 8px;
        height: 8px;
        background: #ff69b4;
        border: 2px solid rgba(255, 255, 255, 0.9);
        border-radius: 50%;
        opacity: 0.9;
        pointer-events: auto;
        cursor: pointer;
        transition: all 0.2s;
        box-shadow: 0 0 4px rgba(255, 105, 180, 0.6);
      }
      
      .bpx-player-progress-point-aipoint:hover {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1.5);
        box-shadow: 0 0 8px rgba(255, 105, 180, 0.9);
      }
    `;
    document.head.appendChild(style);
  }
  
  /**
   * 初始化字幕滚动管理
   * @param {HTMLElement} container - 字幕列表容器
   */
  initSubtitleScroll(container) {
    if (!container) {
      logger.warn('EventHandlers', '字幕容器不存在，无法初始化滚动');
      return;
    }
    
    // 获取恢复滚动按钮
    const followBtn = document.querySelector('#subtitle-follow-btn');
    
    // 初始化滚动管理器
    subtitleScrollManager.init(container, {
      followIntervalMs: 200,        // 200ms更新频率，更流畅
      userScrollDetectMs: 300,      // 用户滚动检测延迟
      scrollBehavior: 'smooth',      // 平滑滚动
      scrollPosition: 'center',      // 始终居中显示
      highlightClass: 'current'  // 高亮类名
    });
    
    // 设置跟随状态改变回调
    subtitleScrollManager.on('onFollowStatusChange', (isFollowing) => {
      if (followBtn) {
        followBtn.style.display = isFollowing ? 'none' : 'block';
      }
      logger.debug('字幕滚动', `跟随状态改变: ${isFollowing}`);
    });
    
    // 恢复滚动按钮事件
    if (followBtn) {
      followBtn.addEventListener('click', () => {
        logger.debug('字幕滚动', '点击恢复滚动');
        subtitleScrollManager.resumeAutoFollow();
      });
    }
    
    logger.info('EventHandlers', '字幕滚动管理器初始化完成');
  }

  /**
   * 绑定Notion配置模态框事件
   * @param {HTMLElement} modal - Notion配置模态框
   */
  bindNotionConfigModalEvents(modal) {
    // 点击背景关闭
    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        this.hideNotionConfigModal();
      }
    });

    // 保存按钮
    document.getElementById('notion-save-btn').addEventListener('click', () => {
      const apiKey = document.getElementById('notion-api-key').value.trim();
      const parentPageId = document.getElementById('notion-parent-page-id').value.trim();
      const autoSendEnabled = document.getElementById('notion-auto-send-enabled').checked;
      const notesAutoSync = document.getElementById('notion-notes-auto-sync').checked;
      
      // 获取内容选项
      const contentOptions = {
        videoInfo: document.getElementById('notion-content-video-info').checked,
        summary: document.getElementById('notion-content-summary').checked,
        segments: document.getElementById('notion-content-segments').checked,
        subtitles: document.getElementById('notion-content-subtitles').checked
      };

      if (!apiKey) {
        uiRenderer.showNotionStatus('请输入 API Key', true);
        return;
      }

      if (!parentPageId) {
        uiRenderer.showNotionStatus('请输入目标位置（Page ID 或 Database ID）', true);
        return;
      }

      const result = config.saveNotionConfig({ apiKey, parentPageId });
      if (result.success) {
        config.setNotionAutoSendEnabled(autoSendEnabled);
        config.setNotionNotesAutoSync(notesAutoSync);
        config.saveNotionContentOptions(contentOptions);
        uiRenderer.showNotionStatus('配置已保存');
        setTimeout(() => {
          this.hideNotionConfigModal();
        }, 1500);
      } else {
        uiRenderer.showNotionStatus(result.error, true);
      }
    });

    // 取消按钮
    document.getElementById('notion-cancel-btn').addEventListener('click', () => {
      this.hideNotionConfigModal();
    });
  }

  /**
   * 恢复容器的位置和尺寸
   * @param {HTMLElement} container - 容器元素
   */
  restoreContainerState(container) {
    const saved = localStorage.getItem('subtitle-container-state');
    if (saved) {
      try {
        const state = JSON.parse(saved);
        
        // 直接恢复保存的状态，不做位置验证
        // 用户自己会调整到合适的位置
        if (state.width) container.style.width = state.width;
        if (state.height) container.style.height = state.height;
        if (state.top) container.style.top = state.top;
        if (state.left) container.style.left = state.left;
        
      } catch (error) {
        logger.warn('EventHandlers', '恢复容器状态失败:', error);
        // 不自动重置，保持默认位置即可
      }
    }
  }

  /**
   * 解析位置值（处理px和百分比）
   * @param {string} value - 位置值
   * @param {number} maxValue - 最大值（视口宽度或高度）
   * @returns {number} 像素值
   */
  parsePositionValue(value, maxValue) {
    if (!value) return 0;
    if (value.endsWith('px')) {
      return parseInt(value);
    } else if (value.endsWith('%')) {
      return (parseInt(value) / 100) * maxValue;
    }
    return parseInt(value) || 0;
  }

  /**
   * 重置容器到默认位置
   * @param {HTMLElement} container - 容器元素
   */
  resetContainerPosition(container) {
    // 清除保存的状态
    localStorage.removeItem('subtitle-container-state');
    
    // 重置到默认位置
    container.style.width = '500px';
    container.style.height = '600px';
    container.style.top = '10%';
    container.style.left = '100%';
    container.style.marginLeft = '10px';
    
    // 不自动显示面板，让用户自己决定是否显示
    // 删除了自动添加 show 类的逻辑
    
    notification.success('字幕面板位置已重置');
  }

  /**
   * 保存容器的位置和尺寸
   * @param {HTMLElement} container - 容器元素
   */
  saveContainerState(container) {
    const state = {
      width: container.style.width || container.offsetWidth + 'px',
      height: container.style.height || container.offsetHeight + 'px',
      top: container.style.top || '10%',
      left: container.style.left || '100%'
    };
    localStorage.setItem('subtitle-container-state', JSON.stringify(state));
  }

  /**
   * 绑定容器拖动事件
   * @param {HTMLElement} container - 容器元素
   */
  bindDragEvents(container) {
    const header = container.querySelector('.subtitle-header');
    if (!header) return;

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;

    const onMouseDown = (e) => {
      // 如果点击的是按钮或输入框，不触发拖拽
      if (e.target.closest('button') || 
          e.target.closest('input') || 
          e.target.closest('.ai-icon') ||
          e.target.closest('.notion-icon') ||
          e.target.closest('.subtitle-close')) {
        return;
      }

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;

      // 获取当前位置
      const rect = container.getBoundingClientRect();
      const videoContainer = document.querySelector('.bpx-player-primary-area');
      const videoRect = videoContainer?.getBoundingClientRect() || { left: 0, top: 0 };
      
      startLeft = rect.left - videoRect.left;
      startTop = rect.top - videoRect.top;

      header.style.cursor = 'grabbing';
      e.preventDefault();
    };

    const onMouseMove = (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;

      const newLeft = startLeft + deltaX;
      const newTop = startTop + deltaY;

      container.style.left = newLeft + 'px';
      container.style.top = newTop + 'px';
      container.style.marginLeft = '0';
    };

    const onMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        header.style.cursor = 'move';
        this.saveContainerState(container);
      }
    };

    header.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);

    // 清理函数（如果需要）
    container._dragCleanup = () => {
      header.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  /**
   * 绑定容器调整大小事件
   * @param {HTMLElement} container - 容器元素
   */
  bindResizeEvents(container) {
    const EDGE_SIZE = 8; // 边缘检测区域大小
    let isResizing = false;
    let resizeDirection = '';
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;
    let startLeft = 0;
    let startTop = 0;

    // 获取鼠标位置对应的resize方向
    const getResizeDirection = (e, rect) => {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const w = rect.width;
      const h = rect.height;
      
      let direction = '';
      
      // 检测边缘
      if (y < EDGE_SIZE) direction += 'n';
      else if (y > h - EDGE_SIZE) direction += 's';
      
      if (x < EDGE_SIZE) direction += 'w';
      else if (x > w - EDGE_SIZE) direction += 'e';
      
      return direction;
    };

    // 鼠标移动时更新光标
    const onMouseMove = (e) => {
      if (isResizing) return;
      
      const rect = container.getBoundingClientRect();
      const direction = getResizeDirection(e, rect);
      
      // 移除所有resize类
      container.className = container.className.replace(/\bresize-\w+\b/g, '');
      
      // 如果在边缘，添加对应的resize类
      if (direction) {
        container.classList.add(`resize-${direction}`);
      }
    };

    // 鼠标按下开始调整大小
    const onMouseDown = (e) => {
      const rect = container.getBoundingClientRect();
      resizeDirection = getResizeDirection(e, rect);
      
      if (!resizeDirection) return;
      
      // 如果点击的是头部区域，不进行resize
      if (e.target.closest('.subtitle-header')) return;
      
      isResizing = true;
      startX = e.clientX;
      startY = e.clientY;
      startWidth = container.offsetWidth;
      startHeight = container.offsetHeight;
      startLeft = container.offsetLeft;
      startTop = container.offsetTop;
      
      e.preventDefault();
      e.stopPropagation();
    };

    // 鼠标移动调整大小
    const onResizeMove = (e) => {
      if (!isResizing) return;
      
      const deltaX = e.clientX - startX;
      const deltaY = e.clientY - startY;
      
      let newWidth = startWidth;
      let newHeight = startHeight;
      let newLeft = startLeft;
      let newTop = startTop;
      
      // 根据方向调整
      if (resizeDirection.includes('e')) {
        newWidth = Math.max(400, Math.min(800, startWidth + deltaX));
      }
      if (resizeDirection.includes('w')) {
        const widthDiff = startWidth - deltaX;
        newWidth = Math.max(400, Math.min(800, widthDiff));
        // 调整左边时，需要同时调整位置保持右边不动
        newLeft = startLeft + (startWidth - newWidth);
      }
      if (resizeDirection.includes('s')) {
        newHeight = Math.max(400, Math.min(window.innerHeight * 0.9, startHeight + deltaY));
      }
      if (resizeDirection.includes('n')) {
        const heightDiff = startHeight - deltaY;
        newHeight = Math.max(400, Math.min(window.innerHeight * 0.9, heightDiff));
        // 调整上边时，需要同时调整位置保持底边不动
        newTop = startTop + (startHeight - newHeight);
      }
      
      container.style.width = newWidth + 'px';
      container.style.height = newHeight + 'px';
      container.style.left = newLeft + 'px';
      container.style.top = newTop + 'px';
    };

    // 鼠标释放
    const onMouseUp = () => {
      if (isResizing) {
        isResizing = false;
        resizeDirection = '';
        this.saveContainerState(container);
      }
    };

    // 绑定事件
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onResizeMove);
    document.addEventListener('mouseup', onMouseUp);

    // 清理函数
    container._resizeCleanup = () => {
      container.removeEventListener('mousemove', onMouseMove);
      container.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onResizeMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }

  /**
   * 监听容器尺寸变化
   * @param {HTMLElement} container - 容器元素
   */
  observeContainerResize(container) {
    const resizeObserver = new ResizeObserver(debounce(() => {
      this.saveContainerState(container);
    }, 500));

    resizeObserver.observe(container);

    // 保存observer以便清理
    container._resizeObserver = resizeObserver;
  }
}

// 创建全局单例
export const eventHandlers = new EventHandlers();
export default eventHandlers;

