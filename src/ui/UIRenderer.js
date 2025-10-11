/**
 * UI渲染模块
 * 负责生成所有UI元素的HTML
 */

import { ICONS } from './styles.js';
import state from '../state/StateManager.js';
import { formatTime } from '../utils/helpers.js';
import config from '../config/ConfigManager.js';
import { AI_API_KEY_URLS } from '../constants.js';

class UIRenderer {
  /**
   * 渲染字幕面板
   * @param {Array} subtitleData - 字幕数据
   * @returns {string} - HTML字符串
   */
  renderSubtitlePanel(subtitleData) {
    const videoKey = state.getVideoKey();
    const cachedSummary = videoKey ? state.getAISummary(videoKey) : null;

    let html = `
      <div class="subtitle-header">
        <div class="subtitle-search-container">
          <input type="text" class="search-input" placeholder="搜索..." id="subtitle-search-input">
          <div class="search-nav" id="search-nav" style="display: none;">
            <span class="search-counter" id="search-counter">0/0</span>
            <button class="search-nav-btn search-prev" id="search-prev" title="上一个">↑</button>
            <button class="search-nav-btn search-next" id="search-next" title="下一个">↓</button>
          </div>
        </div>
        <div class="subtitle-header-actions">
          <span class="ai-icon ${state.ai.isSummarizing ? 'loading' : ''}" title="AI 总结">
            ${ICONS.AI}
          </span>
          <span class="download-icon" title="下载字幕">
            ${ICONS.DOWNLOAD}
          </span>
          <span class="notion-icon ${state.notion.isSending ? 'loading' : ''}" title="发送到 Notion">
            ${ICONS.NOTION}
          </span>
          <span class="subtitle-close">×</span>
        </div>
      </div>
      <div class="subtitle-content">
        <button class="subtitle-toggle-btn" id="subtitle-toggle-btn" title="展开/收起字幕列表 (${subtitleData.length}条)">
          <span class="subtitle-toggle-icon">►</span>
        </button>
        <div class="subtitle-list-container" id="subtitle-list-container">
    `;

    // 渲染字幕列表
    subtitleData.forEach((item, index) => {
      const startTime = formatTime(item.from);
      html += `
        <div class="subtitle-item" data-index="${index}" data-from="${item.from}" data-to="${item.to}">
          <div class="subtitle-item-header">
            <div class="subtitle-time">${startTime}</div>
            <button class="save-subtitle-note-btn" data-content="${this.escapeHtml(item.content)}" title="保存为笔记">保存</button>
          </div>
          <div class="subtitle-text">${item.content}</div>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;

    return html;
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
   * 渲染AI总结区域
   * @param {string} summary - 总结内容（Markdown格式）
   * @param {boolean} isLoading - 是否正在加载
   * @returns {HTMLElement} - DOM元素
   */
  renderAISummarySection(summary = null, isLoading = false) {
    const section = document.createElement('div');
    section.className = 'ai-summary-section';

    if (isLoading) {
      section.innerHTML = `
        <div class="ai-summary-title">
          <span>✨ AI 视频总结</span>
        </div>
        <div class="ai-summary-content ai-summary-loading">正在生成总结...</div>
      `;
    } else if (summary) {
      // 确保marked库已加载
      const parsedHTML = (typeof marked !== 'undefined' && marked.parse) 
        ? marked.parse(summary) 
        : summary.replace(/\n/g, '<br>');
      
      section.innerHTML = `
        <div class="ai-summary-title">
          <span>✨ AI 视频总结</span>
        </div>
        <div class="ai-summary-content">${parsedHTML}</div>
      `;
    }

    return section;
  }

  /**
   * 更新AI总结内容
   * @param {HTMLElement} container - 字幕容器元素
   * @param {string} summary - 总结内容
   */
  updateAISummary(container, summary) {
    const contentDiv = container.querySelector('.subtitle-content');
    if (!contentDiv) return;

    let summarySection = contentDiv.querySelector('.ai-summary-section');

    if (!summarySection) {
      summarySection = this.renderAISummarySection(summary);
      contentDiv.insertBefore(summarySection, contentDiv.firstChild);
    } else {
      const summaryContent = summarySection.querySelector('.ai-summary-content');
      if (summaryContent) {
        summaryContent.classList.remove('ai-summary-loading');
        // 确保marked库已加载
        const parsedHTML = (typeof marked !== 'undefined' && marked.parse) 
          ? marked.parse(summary) 
          : summary.replace(/\n/g, '<br>');
        summaryContent.innerHTML = parsedHTML;
      }
    }
  }

  /**
   * 创建Notion配置模态框
   * @returns {HTMLElement}
   */
  createNotionConfigModal() {
    const modal = document.createElement('div');
    modal.id = 'notion-config-modal';
    modal.className = 'config-modal';
    modal.innerHTML = `
      <div class="config-modal-content">
        <div class="config-modal-header">
          <span>Notion 集成配置</span>
        </div>
        <div class="config-modal-body">
          <div class="config-field">
            <label>1️⃣ Notion API Key</label>
            <input type="password" id="notion-api-key" placeholder="输入你的 Integration Token">
            <div class="config-help">
              访问 <a href="https://www.notion.so/my-integrations" target="_blank">Notion Integrations</a> 创建 Integration 并复制 Token
            </div>
          </div>
          <div class="config-field">
            <label>2️⃣ 目标位置（二选一）</label>
            <input type="text" id="notion-parent-page-id" placeholder="Page ID 或 Database ID">
            <div class="config-help">
              <strong>方式A - 使用已有数据库：</strong><br>
              从数据库 URL 中获取：<code>notion.so/<strong>abc123...</strong>?v=...</code><br>
              脚本会直接向该数据库添加记录
            </div>
            <div class="config-help" style="margin-top: 8px;">
              <strong>方式B - 自动创建数据库：</strong><br>
              从页面 URL 中获取：<code>notion.so/My-Page-<strong>abc123...</strong></code><br>
              首次使用会在此页面下创建数据库
            </div>
            <div class="config-help" style="margin-top: 8px; color: #f59e0b;">
              ⚠️ 重要：需要在「Share」中邀请你的 Integration
            </div>
          </div>
        <div class="config-field">
          <label>
            <input type="checkbox" id="notion-auto-send-enabled">
            自动发送（获取字幕后自动发送到Notion）
          </label>
        </div>
          <div id="notion-status-message"></div>
        </div>
        <div class="config-footer">
          <button class="config-btn config-btn-secondary" id="notion-cancel-btn">取消</button>
          <button class="config-btn config-btn-primary" id="notion-save-btn">保存配置</button>
        </div>
      </div>
    `;

    return modal;
  }

  /**
   * 创建AI配置模态框
   * @returns {HTMLElement}
   */
  createAIConfigModal() {
    const modal = document.createElement('div');
    modal.id = 'ai-config-modal';
    modal.className = 'config-modal';
    modal.innerHTML = `
      <div class="config-modal-content">
        <div class="config-modal-header">
          <span>AI 配置管理</span>
        </div>
        <div class="config-modal-body">
          <div style="margin-bottom: 20px; padding: 15px; background: linear-gradient(135deg, rgba(255, 107, 107, 0.15), rgba(255, 77, 77, 0.15)); border-radius: 10px; border-left: 4px solid #ff6b6b;">
            <div style="font-size: 14px; color: #fff; font-weight: 600; margin-bottom: 8px;">⚠️ 首次使用必读</div>
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.9); line-height: 1.6; margin-bottom: 8px;">
              • 使用AI总结功能前，需要先配置API Key<br>
              • 选择一个AI服务商，点击查看其配置，填写API Key后保存<br>
              • 推荐使用 <strong>OpenRouter</strong>、<strong>DeepSeek</strong> 或 <strong>硅基流动</strong>（提供免费额度）
            </div>
            <div style="font-size: 11px; color: rgba(255, 255, 255, 0.6); margin-top: 8px;">
              💡 提示：点击配置卡片可查看详情和获取API Key的教程链接
            </div>
          </div>
          <div class="ai-config-list" id="ai-config-list"></div>
          <div style="margin-bottom: 15px; text-align: center;">
            <button class="config-btn config-btn-secondary" id="ai-new-config-btn" style="padding: 8px 16px; font-size: 13px;">新建配置</button>
          </div>
          <div class="ai-config-form hidden">
          <div class="config-field">
            <label>配置名称</label>
            <input type="text" id="ai-config-name" placeholder="例如：OpenAI GPT-4">
          </div>
          <div class="config-field">
            <label>API URL</label>
            <input type="text" id="ai-config-url" placeholder="https://api.openai.com/v1/chat/completions">
          </div>
          <div class="config-field">
            <label>API Key <span id="api-key-help-link" style="font-size: 11px; margin-left: 8px;"></span></label>
            <input type="password" id="ai-config-apikey" placeholder="sk-...">
          </div>
          <div class="config-field">
            <label>模型</label>
            <div class="model-field-with-button">
              <input type="text" id="ai-config-model" placeholder="手动输入或点击获取模型">
              <button class="fetch-models-btn" id="fetch-models-btn">获取模型</button>
            </div>
            <div class="model-select-wrapper" id="model-select-wrapper" style="display:none;">
              <input type="text" id="model-search-input" class="model-search-input" placeholder="🔍 搜索模型...">
              <select id="model-select" size="8"></select>
            </div>
          </div>
          <div class="config-field">
            <label>
              <input type="checkbox" id="ai-config-is-openrouter">
              使用OpenRouter (支持获取模型列表)
            </label>
          </div>
          <div class="config-field">
            <label>提示词 (Prompt)</label>
            <textarea id="ai-config-prompt" placeholder="根据以下视频字幕，用中文总结视频内容："></textarea>
          </div>
          <div class="config-field">
            <label>
              <input type="checkbox" id="ai-auto-summary-enabled">
              自动总结（获取字幕后自动触发AI总结）
            </label>
          </div>
          </div>
        </div>
        <div class="config-footer">
          <button class="config-btn config-btn-danger" id="ai-delete-current-btn" style="display:none;">删除此配置</button>
          <div style="flex: 1;"></div>
          <button class="config-btn config-btn-secondary" id="ai-cancel-btn">取消</button>
          <button class="config-btn config-btn-primary" id="ai-save-new-btn">添加新配置</button>
          <button class="config-btn config-btn-primary" id="ai-update-btn" style="display:none;">更新配置</button>
        </div>
      </div>
    `;

    return modal;
  }

  /**
   * 渲染AI配置列表
   * @param {HTMLElement} listElement - 列表容器元素
   */
  renderAIConfigList(listElement) {
    const configs = config.getAIConfigs();
    const selectedId = config.getSelectedAIConfigId();

    listElement.innerHTML = configs.map(cfg => {
      const hasApiKey = cfg.apiKey && cfg.apiKey.trim() !== '';
      const statusIcon = hasApiKey ? '✅' : '⚠️';
      const statusText = hasApiKey ? '已配置' : '未配置';
      const statusColor = hasApiKey ? '#4ade80' : '#fbbf24';
      
      return `
        <div class="ai-config-item ${cfg.id === selectedId ? 'selected' : ''}" data-id="${cfg.id}">
          <div class="ai-config-item-name">
            ${cfg.name}
            <span style="font-size: 11px; color: ${statusColor}; margin-left: 8px;" title="API Key ${statusText}">
              ${statusIcon} ${statusText}
            </span>
          </div>
          <div class="ai-config-item-actions">
            <button class="ai-config-btn-small config-btn-primary ai-edit-btn" data-id="${cfg.id}">查看</button>
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * 显示Notion配置状态
   * @param {string} message - 消息内容
   * @param {boolean} isError - 是否为错误
   */
  showNotionStatus(message, isError = false) {
    const statusEl = document.getElementById('notion-status-message');
    if (statusEl) {
      statusEl.className = `config-status ${isError ? 'error' : 'success'}`;
      statusEl.textContent = message;
    }
  }
}

// 创建全局单例
export const uiRenderer = new UIRenderer();
export default uiRenderer;

