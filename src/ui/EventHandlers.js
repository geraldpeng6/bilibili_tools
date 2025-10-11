/**
 * 事件处理模块
 * 负责所有UI事件的绑定和处理
 */

import state from '../state/StateManager.js';
import config from '../config/ConfigManager.js';
import aiService from '../services/AIService.js';
import notionService from '../services/NotionService.js';
import subtitleService from '../services/SubtitleService.js';
import notesService from '../services/NotesService.js';
import speedControlService from '../services/SpeedControlService.js';
import notification from './Notification.js';
import uiRenderer from './UIRenderer.js';
import notesPanel from './NotesPanel.js';
import { SELECTORS } from '../constants.js';

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
  }

  /**
   * 绑定字幕面板事件
   * @param {HTMLElement} container - 字幕容器
   */
  bindSubtitlePanelEvents(container) {
    // 关闭按钮
    const closeBtn = container.querySelector('.subtitle-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        state.setPanelVisible(false);
        container.classList.remove('show');
      });
    }

    // AI总结按钮
    const aiIcon = container.querySelector('.ai-icon');
    if (aiIcon) {
      aiIcon.addEventListener('click', async (e) => {
        e.stopPropagation();
        const subtitleData = state.getSubtitleData();
        if (subtitleData) {
          try {
            await aiService.summarize(subtitleData, false);
          } catch (error) {
            notification.handleError(error, 'AI总结');
          }
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
        const subtitleData = state.getSubtitleData();
        if (subtitleData) {
          try {
            await notionService.sendSubtitle(subtitleData, false);
          } catch (error) {
            notification.handleError(error, 'Notion发送');
          }
        }
      });
    }

    // 展开/收起按钮
    const toggleBtn = container.querySelector('#subtitle-toggle-btn');
    const listContainer = container.querySelector('#subtitle-list-container');
    if (toggleBtn && listContainer) {
      toggleBtn.addEventListener('click', () => {
        listContainer.classList.toggle('expanded');
        toggleBtn.classList.toggle('expanded');
      });
    }

    // 字幕项点击跳转
    const subtitleItems = container.querySelectorAll('.subtitle-item');
    subtitleItems.forEach(item => {
      item.addEventListener('click', () => {
        const video = document.querySelector(SELECTORS.VIDEO);
        if (video) {
          const startTime = parseFloat(item.dataset.from);
          
          // 先移除所有高亮
          container.querySelectorAll('.subtitle-item').forEach(i => {
            i.classList.remove('current');
          });
          
          // 只高亮当前点击的
          item.classList.add('current');
          
          // 跳转视频
          video.currentTime = startTime;
        }
      });
    });

    // 保存笔记按钮
    const saveButtons = container.querySelectorAll('.save-subtitle-note-btn');
    saveButtons.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const content = btn.getAttribute('data-content');
        if (content) {
          notesService.saveSubtitleNote(content);
          btn.textContent = '✓';
          setTimeout(() => {
            btn.textContent = '保存';
          }, 1000);
        }
      });
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
   * 同步字幕高亮
   * @param {HTMLElement} container - 字幕容器
   */
  syncSubtitleHighlight(container) {
    const video = document.querySelector(SELECTORS.VIDEO);

    if (video) {
      video.addEventListener('timeupdate', () => {
        const currentTime = video.currentTime;
        const items = container.querySelectorAll('.subtitle-item');

        // 找到第一个匹配的字幕（按顺序）
        let foundMatch = false;
        items.forEach(item => {
          const from = parseFloat(item.dataset.from);
          const to = parseFloat(item.dataset.to);

          if (!foundMatch && currentTime >= from && currentTime <= to) {
            item.classList.add('current');
            foundMatch = true;
          } else {
            item.classList.remove('current');
          }
        });
      });
    }
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
  }

  /**
   * 清空AI配置表单
   */
  clearAIConfigForm() {
    const nameEl = document.getElementById('ai-config-name');
    const urlEl = document.getElementById('ai-config-url');
    const apikeyEl = document.getElementById('ai-config-apikey');
    const modelEl = document.getElementById('ai-config-model');
    const promptEl = document.getElementById('ai-config-prompt');
    const openrouterEl = document.getElementById('ai-config-is-openrouter');
    const saveNewBtn = document.getElementById('ai-save-new-btn');
    const updateBtn = document.getElementById('ai-update-btn');
    const modelSelectWrapper = document.getElementById('model-select-wrapper');

    if (nameEl) nameEl.value = '';
    if (urlEl) urlEl.value = 'https://openrouter.ai/api/v1/chat/completions';
    if (apikeyEl) apikeyEl.value = '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';
    if (modelEl) modelEl.value = 'alibaba/tongyi-deepresearch-30b-a3b:free';
    if (promptEl) promptEl.value = `请用中文总结以下视频字幕内容，使用Markdown格式输出。

要求：
1. 在开头提供TL;DR（不超过50字的核心摘要）
2. 使用标题、列表等Markdown格式组织内容
3. 突出关键信息和要点

字幕内容：
`;
    if (openrouterEl) openrouterEl.checked = true;
    if (saveNewBtn) saveNewBtn.style.display = '';
    if (updateBtn) updateBtn.style.display = 'none';
    if (modelSelectWrapper) modelSelectWrapper.style.display = 'none';
  }

  /**
   * 显示Notion配置模态框
   */
  showNotionConfigModal() {
    const modal = document.getElementById('notion-config-modal');
    if (!modal) return;

    const notionConfig = config.getNotionConfig();
    document.getElementById('notion-api-key').value = notionConfig.apiKey;
    document.getElementById('notion-parent-page-id').value = notionConfig.parentPageId;
    document.getElementById('notion-auto-send-enabled').checked = config.getNotionAutoSendEnabled();
    
    const statusEl = document.getElementById('notion-status-message');
    if (statusEl) statusEl.innerHTML = '';

    modal.classList.add('show');
  }

  /**
   * 隐藏Notion配置模态框
   */
  hideNotionConfigModal() {
    const modal = document.getElementById('notion-config-modal');
    if (modal) {
      modal.classList.remove('show');
    }
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
    const promptEl = document.getElementById('ai-config-prompt');
    const openrouterEl = document.getElementById('ai-config-is-openrouter');
    const saveNewBtn = document.getElementById('ai-save-new-btn');
    const updateBtn = document.getElementById('ai-update-btn');
    const modelSelectWrapper = document.getElementById('model-select-wrapper');

    if (nameEl) nameEl.value = cfg.name;
    if (urlEl) urlEl.value = cfg.url;
    if (apikeyEl) apikeyEl.value = cfg.apiKey;
    if (modelEl) modelEl.value = cfg.model;
    if (promptEl) promptEl.value = cfg.prompt;
    if (openrouterEl) openrouterEl.checked = cfg.isOpenRouter || false;

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
      prompt: document.getElementById('ai-config-prompt').value,
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
      prompt: document.getElementById('ai-config-prompt').value,
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
}

// 创建全局单例
export const eventHandlers = new EventHandlers();
export default eventHandlers;

