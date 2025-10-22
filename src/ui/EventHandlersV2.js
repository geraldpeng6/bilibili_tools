/**
 * 事件处理模块（重构版）
 * 使用模块化的事件处理器，减少代码冗余
 */

import DragHandler from './events/DragHandler.js';
import ResizeHandler from './events/ResizeHandler.js';
import SubtitleEventHandler from './events/SubtitleEventHandler.js';
import modalEventHandler from './events/ModalEventHandler.js';

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
import { SELECTORS, AI_API_KEY_URLS } from '../constants.js';
import { debounce, throttleRAF } from '../utils/helpers.js';
import logger from '../utils/DebugLogger.js';

class EventHandlersV2 {
  constructor() {
    // 初始化子模块
    this.dragHandler = new DragHandler();
    this.resizeHandler = new ResizeHandler();
    this.subtitleHandler = new SubtitleEventHandler();
    
    // 注册模态框配置
    this.registerModals();
  }

  /**
   * 注册所有模态框配置
   */
  registerModals() {
    // AI配置模态框
    modalEventHandler.registerModal('ai-config-modal', {
      loadData: (modal) => this.loadAIConfigData(modal),
      validateData: (data) => this.validateAIConfig(data),
      onSave: (data) => this.saveAIConfig(data),
      onShow: () => logger.info('EventHandlers', 'AI配置模态框已显示'),
      onHide: () => logger.info('EventHandlers', 'AI配置模态框已隐藏')
    });

    // Notion配置模态框
    modalEventHandler.registerModal('notion-config-modal', {
      loadData: (modal) => this.loadNotionConfigData(modal),
      validateData: (data) => this.validateNotionConfig(data),
      onSave: (data) => this.saveNotionConfig(data),
      onShow: () => logger.info('EventHandlers', 'Notion配置模态框已显示'),
      onHide: () => logger.info('EventHandlers', 'Notion配置模态框已隐藏')
    });

    // 快捷键配置模态框
    modalEventHandler.registerModal('shortcut-config-modal', {
      loadData: (modal) => this.loadShortcutConfigData(modal),
      onSave: (data) => this.saveShortcutConfig(data),
      onShow: (modal) => this.bindShortcutConfigEvents(modal),
      escapeClose: false // 快捷键配置时不允许ESC关闭
    });
  }

  /**
   * 绑定字幕面板事件
   * @param {HTMLElement} container
   */
  bindSubtitlePanelEvents(container) {
    if (!container) {
      logger.error('EventHandlers', '字幕容器不存在');
      return;
    }

    // 恢复状态
    this.restoreContainerState(container);
    
    // 绑定拖动和调整大小
    const header = container.querySelector('.subtitle-header');
    this.dragHandler.bind(container, header);
    this.resizeHandler.bind(container);
    
    // 绑定字幕相关事件
    const subtitleList = container.querySelector('#subtitle-list-container');
    const searchInput = container.querySelector('#subtitle-search-input');
    const followBtn = container.querySelector('#subtitle-follow-btn');
    
    if (subtitleList) {
      this.subtitleHandler.bindSearchEvents(subtitleList, searchInput);
      this.subtitleHandler.bindFollowEvents(subtitleList, followBtn);
      
      // 初始化搜索索引
      const subtitleData = state.getSubtitleData();
      if (subtitleData) {
        this.subtitleHandler.initSearchIndex(subtitleData);
      }
    }
    
    // 绑定其他事件
    this.bindPanelButtons(container);
    this.bindTabEvents(container);
    this.observeContainerResize(container);
    
    logger.info('EventHandlers', '字幕面板事件绑定完成');
  }

  /**
   * 绑定面板按钮事件
   */
  bindPanelButtons(container) {
    // 关闭按钮
    const closeBtn = container.querySelector('.subtitle-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        state.setPanelVisible(false);
        container.classList.remove('show');
        this.subtitleHandler.dispose();
      });
    }

    // AI总结按钮
    const aiIcon = container.querySelector('.ai-icon');
    if (aiIcon) {
      aiIcon.addEventListener('click', () => this.handleAISummary());
    }

    // 下载按钮
    const downloadIcon = container.querySelector('.download-icon');
    if (downloadIcon) {
      downloadIcon.addEventListener('click', () => this.handleDownload());
    }

    // Notion发送按钮
    const notionIcon = container.querySelector('.notion-icon');
    if (notionIcon) {
      notionIcon.addEventListener('click', () => this.handleNotionSend());
    }

    // 搜索控制按钮
    this.bindSearchControls(container);
  }

  /**
   * 绑定搜索控制
   */
  bindSearchControls(container) {
    const prevBtn = container.querySelector('#search-prev');
    const nextBtn = container.querySelector('#search-next');
    
    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.subtitleHandler.navigateToMatch(-1);
      });
    }
    
    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.subtitleHandler.navigateToMatch(1);
      });
    }
  }

  /**
   * 绑定标签页切换事件
   */
  bindTabEvents(container) {
    const tabs = container.querySelectorAll('.subtitle-tab');
    const panels = container.querySelectorAll('.tab-panel');
    
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const targetPanel = tab.dataset.tab;
        
        // 切换标签激活状态
        tabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        
        // 切换面板显示
        panels.forEach(panel => {
          panel.classList.toggle('active', panel.id === `${targetPanel}-panel`);
        });
        
        // 保存当前标签
        localStorage.setItem('subtitle-active-tab', targetPanel);
      });
    });
  }

  /**
   * 处理AI总结
   */
  async handleAISummary() {
    const subtitleData = state.getSubtitleData();
    if (!subtitleData || subtitleData.length === 0) {
      notification.error('没有可用的字幕数据');
      return;
    }

    const selectedConfig = config.getSelectedAIConfig();
    if (!selectedConfig) {
      notification.warning('请先在油猴菜单中AI配置中选择或配置一个AI服务');
      return;
    }

    try {
      await aiService.summarize(subtitleData, false);
      
      // 切换到总结标签页
      const summaryTab = document.querySelector('.subtitle-tab[data-tab="summary"]');
      if (summaryTab) {
        summaryTab.click();
      }
    } catch (error) {
      notification.handleError(error, 'AI总结');
    }
  }

  /**
   * 处理下载
   */
  handleDownload() {
    try {
      subtitleService.downloadSubtitleFile();
      notification.success('字幕文件已下载');
    } catch (error) {
      notification.handleError(error, '下载字幕');
    }
  }

  /**
   * 处理Notion发送
   */
  async handleNotionSend() {
    const subtitleData = state.getSubtitleData();
    if (!subtitleData) {
      notification.error('没有可用的字幕数据');
      return;
    }

    try {
      await notionService.sendSubtitle(subtitleData, false);
      notification.success('字幕已发送到Notion');
    } catch (error) {
      notification.handleError(error, 'Notion发送');
    }
  }

  /**
   * 恢复容器状态
   */
  restoreContainerState(container) {
    // 恢复位置
    this.dragHandler.restorePosition(container);
    
    // 恢复大小
    this.resizeHandler.restoreSize(container);
    
    // 恢复激活的标签
    const activeTab = localStorage.getItem('subtitle-active-tab') || 'subtitle';
    const tab = container.querySelector(`.subtitle-tab[data-tab="${activeTab}"]`);
    if (tab) {
      tab.click();
    }
  }

  /**
   * 监听容器尺寸变化
   */
  observeContainerResize(container) {
    if (!window.ResizeObserver) return;

    const observer = new ResizeObserver(debounce((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        logger.debug('EventHandlers', `容器尺寸变化: ${width}x${height}`);
      }
    }, 500));

    observer.observe(container);
  }

  /**
   * AI配置数据处理方法
   */
  loadAIConfigData(modal) {
    const configs = config.getAIConfigs();
    const selectedId = config.getSelectedAIConfigId();
    
    // 渲染配置列表
    const configListEl = modal.querySelector('#ai-config-list');
    if (configListEl && configs.length > 0) {
      configListEl.innerHTML = uiRenderer.renderAIConfigList(configs, selectedId);
    }
  }

  validateAIConfig(data) {
    if (!data.apiKey || data.apiKey.trim() === '') {
      return '请输入API Key';
    }
    if (!data.url || !data.url.startsWith('http')) {
      return 'API URL格式错误';
    }
    if (!data.model || data.model.trim() === '') {
      return '请选择模型';
    }
    return true;
  }

  async saveAIConfig(data) {
    const configData = {
      id: data.id || Date.now().toString(),
      name: data.name || '新配置',
      provider: data.provider,
      apiKey: data.apiKey,
      url: data.url,
      model: data.model,
      prompt1: data.prompt1,
      prompt2: data.prompt2,
      isOpenRouter: data.provider === 'openrouter'
    };

    if (data.id) {
      config.updateAIConfig(data.id, configData);
    } else {
      config.addAIConfig(configData);
    }

    config.selectAIConfig(configData.id);
  }

  /**
   * Notion配置数据处理方法
   */
  loadNotionConfigData(modal) {
    const notionConfig = config.getNotionConfig();
    modalEventHandler.setFormData('notion-config-modal', {
      'notion-api-key': notionConfig.apiKey,
      'notion-parent-page-id': notionConfig.parentPageId,
      'notion-auto-send-enabled': config.getNotionAutoSendEnabled()
    });
  }

  validateNotionConfig(data) {
    const apiKey = data['notion-api-key'];
    if (!apiKey || !apiKey.startsWith('secret_')) {
      return 'API Key格式错误，应以secret_开头';
    }
    return true;
  }

  async saveNotionConfig(data) {
    const configData = {
      apiKey: data['notion-api-key'],
      parentPageId: data['notion-parent-page-id']
    };
    
    config.saveNotionConfig(configData);
    config.setNotionAutoSendEnabled(data['notion-auto-send-enabled']);
  }

  /**
   * 快捷键配置数据处理方法
   */
  loadShortcutConfigData(modal) {
    const shortcuts = shortcutManager.getAllShortcuts();
    // 渲染快捷键列表
    const listEl = modal.querySelector('.shortcut-list');
    if (listEl) {
      listEl.innerHTML = uiRenderer.renderShortcutList(shortcuts);
    }
  }

  bindShortcutConfigEvents(modal) {
    // 快捷键输入框录制
    const inputs = modal.querySelectorAll('.shortcut-input');
    inputs.forEach(input => {
      input.addEventListener('click', (e) => {
        e.preventDefault();
        this.startShortcutCapture(input);
      });
    });

    // 重置按钮
    const resetBtns = modal.querySelectorAll('.shortcut-reset-btn');
    resetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.key;
        shortcutManager.resetShortcut(key);
        notification.success('已重置到默认值');
        this.loadShortcutConfigData(modal);
      });
    });
  }

  saveShortcutConfig(data) {
    // 快捷键配置通过startShortcutCapture直接保存
    logger.info('EventHandlers', '快捷键配置已保存');
  }

  /**
   * 开始录制快捷键
   */
  startShortcutCapture(input) {
    const shortcutKey = input.dataset.key;
    input.classList.add('recording');
    input.value = '按下快捷键...';

    const handleKeydown = (event) => {
      event.preventDefault();
      event.stopPropagation();
      
      // ESC取消
      if (event.key === 'Escape') {
        input.classList.remove('recording');
        input.value = shortcutManager.formatShortcut(shortcutManager.getAllShortcuts()[shortcutKey]);
        document.removeEventListener('keydown', handleKeydown);
        return;
      }

      // 构建快捷键对象
      const shortcut = {
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        code: event.code
      };

      // 更新快捷键
      shortcutManager.updateShortcut(shortcutKey, shortcut);
      
      // 更新显示
      input.value = shortcutManager.formatShortcut(shortcut);
      input.classList.remove('recording');
      
      // 移除事件监听
      document.removeEventListener('keydown', handleKeydown);
      
      notification.success('快捷键已更新');
    };

    document.addEventListener('keydown', handleKeydown);
  }

  /**
   * 清理资源
   */
  dispose() {
    this.subtitleHandler.dispose();
    modalEventHandler.dispose();
    logger.info('EventHandlers', '事件处理器已清理');
  }
}

// 创建单例
export const eventHandlers = new EventHandlersV2();
export default eventHandlers;
