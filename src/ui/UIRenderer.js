/**
 * UI渲染模块
 * 负责生成所有UI元素的HTML
 */

import { ICONS } from './styles.js';
import state from '../state/StateManager.js';
import { formatTime } from '../utils/helpers.js';
import config from '../config/ConfigManager.js';
import shortcutManager from '../config/ShortcutManager.js';
import logger from '../utils/DebugLogger.js';
import { AI_API_KEY_URLS } from '../constants.js';

class UIRenderer {
  constructor() {
    this.markedConfigured = false;
  }

  /**
   * 渲染字幕面板
   * @param {Array} subtitleData - 字幕数据（已不再使用，保留参数以兼容）
   * @returns {string} - HTML字符串
   */
  renderSubtitlePanel(subtitleData) {
    const videoKey = state.getVideoKey();
    const cachedSummary = videoKey ? state.getAISummary(videoKey) : null;

    let html = `
      <div class="subtitle-header">
        <div class="subtitle-header-left">
        </div>
        <div class="subtitle-header-right">
          <div class="subtitle-header-actions">
            <span class="ai-icon" title="AI配置">
              ${ICONS.AI}
            </span>
            <span class="download-icon" title="下载字幕">
              ${ICONS.DOWNLOAD}
            </span>
            <span class="notion-icon ${state.notion.isSending ? 'loading' : ''}" title="Notion">
              ${ICONS.NOTION}
            </span>
            <span class="subtitle-close">×</span>
          </div>
        </div>
      </div>
      <div class="subtitle-content">
        <div class="subtitle-panel" id="summary-panel" style="display: block;">
          ${this.renderAISummaryPanel(cachedSummary)}
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
   * 解析markdown文本
   * @param {string} markdownText - markdown文本
   * @returns {string} 解析后的HTML
   */
  /**
   * 转义HTML特殊字符
   * @private
   * @param {string} text - 需要转义的文本
   * @returns {string} 转义后的文本
   */
  _escapeHtml(text) {
    const escapeMap = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };
    return text.replace(/[&<>"']/g, char => escapeMap[char]);
  }

  parseMarkdown(markdownText) {
    if (!markdownText) return '';
    
    // 先清理markdown文本，移除空的代码块
    let cleanedText = markdownText.trim();
    // 移除空的代码块（可能包含只有空格/换行的内容）
    cleanedText = cleanedText.replace(/```[a-zA-Z0-9]*\s*```/g, '');
    cleanedText = cleanedText.replace(/```\s*\n\s*```/g, '');
    
    // 检查marked库是否可用
    if (typeof marked !== 'undefined' && typeof marked.parse === 'function') {
      try {
        // 配置marked以支持链接在新标签页打开
        if (typeof marked.use === 'function') {
          marked.use({
            renderer: {
              link(href, title, text) {
                return `<a href="${href}" target="_blank" rel="noopener noreferrer" ${title ? `title="${title}"` : ''}>${text}</a>`;
              }
            }
          });
        }
        if (!this.markedConfigured && typeof marked.setOptions === 'function') {
          marked.setOptions({ breaks: true, gfm: true });
          this.markedConfigured = true;
        }
        let html = marked.parse(cleanedText);
        // 清理生成的空代码块
        html = html.replace(/<pre><code[^>]*>\s*<\/code><\/pre>/g, '');
        return html;
      } catch (error) {
        logger.warn('UIRenderer', 'Marked解析失败:', error);
      }
    }

    let html = cleanedText;

    // 处理代码块 (```code```)
    html = html.replace(/```([a-zA-Z0-9]*)?\n([\s\S]*?)```/g, (match, lang, code) => {
      if (!code.trim()) return ''; // 忽略空代码块
      const langAttr = lang ? ` class="language-${lang}"` : '';
      return `<pre><code${langAttr}>${this._escapeHtml(code)}</code></pre>`;
    });

    // 处理标题 (#)
    html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

    // 处理粗体 (**text**)
    html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // 处理斜体 (*text*)
    html = html.replace(/(?<!\*)\*(?!\*)([^*]+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');

    // 处理行内代码 (`code`)
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

    // 处理列表项
    html = html.replace(/^\* (.*$)/gim, '<li>$1</li>');
    html = html.replace(/^- (.*$)/gim, '<li>$1</li>');
    html = html.replace(/^\d+\. (.*$)/gim, '<li>$1</li>');

    // 将连续的<li>标签包装在<ul>中
    html = html.replace(/(<li>.*<\/li>(?:\s*<li>.*<\/li>)*)/g, '<ul>$1</ul>');

    // 将连续的<ul>替换为<ol>当原始文本使用有序列表时
    html = html.replace(/<ul>((?:<li>.*<\/li>\s*)+)<\/ul>/g, (match, listItems) => {
      const originalLines = cleanedText.split('\n');
      const hasOrdered = originalLines.some(line => /^\d+\.\s+/.test(line));
      return hasOrdered ? `<ol>${listItems}</ol>` : match;
    });

    // 处理换行
    html = html.replace(/\n/g, '<br>');

    return html;
  }

  normalizeMarkdown(markdownText) {
    if (!markdownText) {
      return '';
    }

    let text = String(markdownText).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    const fenceMatch = text.match(/^```[a-zA-Z0-9+_-]*\s*\n([\s\S]*?)\s*```$/);
    if (fenceMatch) {
      text = fenceMatch[1];
    }

    const lines = text.split('\n');
    const nonEmpty = lines.filter(line => line.trim().length > 0);

    if (nonEmpty.length > 0) {
      const minIndent = Math.min(...nonEmpty.map(line => line.match(/^ */)[0].length));
      if (minIndent > 0) {
        text = lines
          .map(line => (line.startsWith(' '.repeat(minIndent)) ? line.slice(minIndent) : line))
          .join('\n');
      }
    }

    return text.trim();
  }

  /**
   * 渲染AI总结面板
   * @param {Object|string} summary - 总结内容（新格式为对象，包含markdown和segments）
   * @param {boolean} isLoading - 是否正在加载（已废弃，不再显示加载状态）
   * @returns {string} - HTML字符串
   */
  renderAISummaryPanel(summary = null, isLoading = false) {
    let html = '';
    
    // 不再显示加载状态，直接判断是否有内容
    if (summary) {
      let mainSummary = '';
      let segments = [];
      
      // 处理新格式（对象包含markdown和segments）
      if (typeof summary === 'object' && summary.markdown) {
        // 新格式：显示Markdown总结和segments
        mainSummary = this.parseMarkdown(summary.markdown);
        segments = summary.segments || [];
      } else if (typeof summary === 'string') {
        // 兼容旧格式：解析字符串中的总结部分
        const parsed = this.parseAISummary(summary);
        mainSummary = parsed.mainSummary;
      }
      
      html = '<div class="summary-panel-container">';
      
      // 先渲染AI时间戳段落（如果存在）
      if (segments && segments.length > 0) {
        html += `
          <div class="ai-segments-in-summary">
            <div class="segments-header">AI时间戳段落</div>
            ${this.renderAISegments(segments)}
            <div class="segments-divider"></div>
          </div>
        `;
      }
      
      // 然后渲染总结内容
      html += mainSummary.trim() ? `
        <div class="ai-summary-main">
          <div class="summary-content">${mainSummary}</div>
        </div>
      ` : '<div class="ai-summary-empty">暂无总结内容</div>';
      
      html += '</div>';
    } else {
      html = `
        <div class="ai-summary-empty">
          <p>点击上方AI图标生成视频总结</p>
        </div>
      `;
    }
    
    return html;
  }

  /**
   * 解析AI总结内容，分离主要总结和要点
   * @param {string} summary - 原始总结内容
   * @returns {{mainSummary: string, keyPoints: Array}}
   */
  parseAISummary(summary) {
    let mainSummary = '';
    let keyPoints = [];
    
    // 方案1：匹配[总结]和[段落]格式
    const summaryMatch = summary.match(/\[总结\]([\s\S]*?)(?=\[段落\]|$)/i);
    const paragraphMatch = summary.match(/\[段落\]([\s\S]*)/i);
    
    if (summaryMatch && summaryMatch[1]) {
      const summaryText = summaryMatch[1].trim();
      mainSummary = this.parseMarkdown(summaryText);
    }
    
    if (paragraphMatch && paragraphMatch[1]) {
      const paragraphText = paragraphMatch[1];
      // 匹配每个段落：[00:02:15] 标题\n    内容 或 [00:02:15] 标题内容
      const paragraphRegex = /\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*([^\n]+?)(?:\n\s+([^\[]+?))?(?=\[|$)/g;
      let match;
      
      while ((match = paragraphRegex.exec(paragraphText)) !== null) {
        const [_, timeStr, titleOrContent, additionalContent] = match;
        
        // 标准化时间戳格式
        let normalizedTime = timeStr;
        const timeParts = timeStr.split(':');
        if (timeParts.length === 2) {
          normalizedTime = `[${timeParts[0].padStart(2, '0')}:${timeParts[1].padStart(2, '0')}]`;
        } else if (timeParts.length === 3) {
          const hours = parseInt(timeParts[0]);
          const minutes = parseInt(timeParts[1]);
          const totalMinutes = hours * 60 + minutes;
          normalizedTime = `[${totalMinutes.toString().padStart(2, '0')}:${timeParts[2].padStart(2, '0')}]`;
        }
        
        // 如果有缩进内容，则第一行是标题，缩进内容是描述
        // 否则整个内容都作为标题
        const title = titleOrContent.trim();
        const content = additionalContent ? additionalContent.trim() : '';
        
        keyPoints.push({
          title: title,
          time: normalizedTime,
          content: content
        });
      }
    }
    
    // 方案2：智能解析（如果方案1没有找到内容）
    if (!mainSummary && keyPoints.length === 0) {
      const lines = summary.split('\n');
      let summaryPart = [];
      let inParagraphSection = false;
      
      for (const line of lines) {
        const trimmed = line.trim();
        
        // 检测是否是时间戳行
        if (trimmed.match(/^\[\d{1,2}:\d{2}(?::\d{2})?\]/)) {
          inParagraphSection = true;
          // 解析时间戳行
          const timeMatch = trimmed.match(/^\[(\d{1,2}:\d{2}(?::\d{2})?)\]\s*(.*)/);
          if (timeMatch) {
            const [_, timeStr, content] = timeMatch;
            let normalizedTime = timeStr;
            const timeParts = timeStr.split(':');
            if (timeParts.length === 2) {
              normalizedTime = `[${timeParts[0].padStart(2, '0')}:${timeParts[1].padStart(2, '0')}]`;
            } else if (timeParts.length === 3) {
              const hours = parseInt(timeParts[0]);
              const minutes = parseInt(timeParts[1]);
              const totalMinutes = hours * 60 + minutes;
              normalizedTime = `[${totalMinutes.toString().padStart(2, '0')}:${timeParts[2].padStart(2, '0')}]`;
            }
            
            keyPoints.push({
              title: content.trim(),
              time: normalizedTime,
              content: ''
            });
          }
        } else if (!inParagraphSection) {
          // 在时间戳出现之前的内容都是总结
          summaryPart.push(line);
        } else if (keyPoints.length > 0 && line.startsWith('  ')) {
          // 缩进的内容属于上一个要点的描述
          keyPoints[keyPoints.length - 1].content += (keyPoints[keyPoints.length - 1].content ? ' ' : '') + trimmed;
        }
      }
      
      if (summaryPart.length > 0) {
        mainSummary = this.parseMarkdown(summaryPart.join('\n').trim());
      }
    }
    
    // 方案3：兼容旧格式
    if (!mainSummary && keyPoints.length === 0) {
      const parts = summary.split(/##\s*要点/i);
      
      if (parts.length >= 2) {
        const summaryPart = parts[0].replace(/##\s*总结/i, '').trim();
        mainSummary = this.parseMarkdown(summaryPart);
        
        const pointsPart = parts[1];
        const pointMatches = pointsPart.matchAll(/###\s*\[?([^\]\n]+)\]?[\s\S]*?-\s*时间[：:]\s*\[(\d{1,2}):(\d{2})\][\s\S]*?-\s*内容[：:]\s*([^\n]+)/gi);
        
        for (const match of pointMatches) {
          const [_, title, minutes, seconds, content] = match;
          keyPoints.push({
            title: title.trim(),
            time: `[${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}]`,
            content: content.trim()
          });
        }
      }
    }
    
    // 最终降级：如果什么都没解析到，把全部内容作为总结
    if (!mainSummary && keyPoints.length === 0) {
      mainSummary = this.parseMarkdown(summary);
    }
    
    return { mainSummary, keyPoints };
  }

  /**
   * 渲染AI总结区域（兼容旧方法）
   * @param {string} summary - 总结内容（Markdown格式）
   * @param {boolean} isLoading - 是否正在加载
   * @returns {HTMLElement} - DOM元素
   */
  renderAISummarySection(summary = null, isLoading = false) {
    const section = document.createElement('div');
    section.className = 'ai-summary-section';
    section.innerHTML = this.renderAISummaryPanel(summary, isLoading);
    return section;
  }

  /**
   * 更新AI总结内容
   * @param {HTMLElement} container - 容器元素
   * @param {Object|string} summary - 总结内容
   */
  updateAISummary(container, summary) {
    if (!container) {
      container = document.getElementById('subtitle-container');
    }
    if (!container) return;
    
    // 更新视频总结面板（现在包含段落总结）
    const summaryPanel = container.querySelector('#summary-panel');
    if (summaryPanel) {
      summaryPanel.innerHTML = this.renderAISummaryPanel(summary, false);
      // 时间戳点击事件已由EventHandlers全局处理
    }
  }

  /**
   * 渲染AI段落
   * @param {Array} segments - AI段落数组
   * @returns {string} HTML字符串
   */
  renderAISegments(segments) {
    return segments.map((segment, idx) => {
      const displayTime = (segment.timestamp || '[00:00]').replace(/[\[\]]/g, '');
      const timeAttr = segment.timestamp || '[00:00]';
      
      return `
        <div class="section-item" data-time="${timeAttr}" data-index="${idx}">
          <button class="time-btn">${displayTime}</button>
          <div class="item-content">
            ${segment.summary ? 
              `<span class="item-title">${segment.title || ''}</span>
               <span class="item-desc">${segment.summary}</span>` :
              `<span class="item-single">${segment.title || ''}</span>`
            }
          </div>
        </div>
      `;
    }).join('');
  }

  /**
   * 创建临时通知
   * @param {string} message - 通知消息
   * @returns {HTMLElement}
   */
  createNotification(message) {
    const notif = document.createElement('div');
    notif.className = 'notion-toast show';
    notif.textContent = message;
    document.body.appendChild(notif);
    
    setTimeout(() => {
      notif.remove();
    }, 3000);
    
    return notif;
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

        <div class="config-field">
          <label style="font-weight: 600; margin-bottom: 10px; display: block;">📋 自动添加内容选项</label>
          <div style="display: flex; flex-direction: column; gap: 8px;">
            <label style="display: flex; align-items: center; gap: 8px; font-weight: normal;">
              <input type="checkbox" id="notion-content-video-info" checked>
              <span>📹 视频信息</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-weight: normal;">
              <input type="checkbox" id="notion-content-summary" checked>
              <span>📊 视频总结</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-weight: normal;">
              <input type="checkbox" id="notion-content-segments" checked>
              <span>⏱️ 时间戳段落（含截图）</span>
            </label>
            <label style="display: flex; align-items: center; gap: 8px; font-weight: normal;">
              <input type="checkbox" id="notion-content-subtitles" checked>
              <span>📝 字幕内容</span>
            </label>
          </div>
          <div class="config-help" style="margin-top: 10px;">
            选择要自动添加到Notion的内容。未勾选的内容不会被发送。
          </div>
        </div>

        <div class="config-field" style="border-top: 1px solid rgba(255, 255, 255, 0.1); padding-top: 15px; margin-top: 15px;">
          <label style="font-weight: 600; margin-bottom: 10px; display: block;">✏️ 笔记同步设置</label>
          <label style="display: flex; align-items: center; gap: 8px;">
            <input type="checkbox" id="notion-notes-auto-sync">
            <span>自动同步笔记到Notion（创建独立的笔记数据库）</span>
          </label>
          <div class="config-help" style="margin-top: 10px;">
            开启后，选中文字并点击钢笔保存的笔记会自动同步到Notion的独立笔记数据库中。
          </div>
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
          <div style="margin-bottom: 15px; text-align: center; display: flex; gap: 10px; justify-content: center;">
            <button class="config-btn config-btn-primary" id="ai-start-summary-btn" style="padding: 8px 20px; font-size: 14px; font-weight: 600;">🚀 开始总结</button>
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
            <label>总结提示词 (Markdown总结)</label>
            <textarea id="ai-config-prompt1" placeholder="请用中文总结以下视频字幕内容，使用Markdown格式输出..."></textarea>
          </div>
          <div class="config-field">
            <label>段落提示词 (JSON时间段落)</label>
            <textarea id="ai-config-prompt2" placeholder="请根据以下带时间戳的视频字幕内容，提取关键时间点段落..."></textarea>
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


  /**
   * 渲染快捷键配置面板
   * @returns {string} - HTML字符串
   */
  renderShortcutConfigModal() {
    logger.debug('UIRenderer', 'renderShortcutConfigModal 开始');
    
    if (!shortcutManager) {
      console.error('[UIRenderer] shortcutManager 未定义');
      return null;
    }
    
    let shortcuts;
    try {
      shortcuts = shortcutManager.getAllShortcuts();
      logger.debug('UIRenderer', '获取到快捷键:', shortcuts);
    } catch (error) {
      console.error('[UIRenderer] 获取快捷键失败:', error);
      return null;
    }
    
    if (!shortcuts || typeof shortcuts !== 'object') {
      console.error('[UIRenderer] 快捷键配置无效:', shortcuts);
      return null;
    }
    
    // 使用与其他配置模态框一致的结构
    return `
      <div class="config-modal" id="shortcut-config-modal">
        <div class="config-modal-content">
          <div class="config-modal-header">
            <span class="config-modal-title">快捷键设置</span>
            <button class="config-modal-close">×</button>
          </div>
          <div class="config-modal-body">
            <div style="margin-bottom: 20px; padding: 15px; background: rgba(254, 235, 234, 0.1); border-radius: 10px; border-left: 4px solid #feebea;">
              <div style="font-size: 13px; color: #fff; font-weight: 600; margin-bottom: 4px;">使用说明</div>
              <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); line-height: 1.5;">
                点击输入框后按下想要的组合键即可设置。特殊组合键：<br/>
                • 截图：连按两下 / 键<br/>
                • 双击操作：快速连续按两次同一个键
              </div>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 12px;">
              ${Object.entries(shortcuts).map(([key, shortcut]) => `
                <div class="shortcut-item" data-key="${key}">
                  <div class="shortcut-description">${shortcut.description}</div>
                  <div class="shortcut-controls">
                    <input 
                      type="text" 
                      class="shortcut-input" 
                      value="${shortcutManager.formatShortcut(shortcut)}" 
                      readonly 
                      placeholder="点击设置"
                      data-key="${key}"
                    >
                    <button class="shortcut-mode-btn shortcut-hold-btn ${shortcut.holdMode ? 'active' : ''}" 
                            data-key="${key}" 
                            data-mode="hold"
                            title="长按此键触发">
                      长按
                    </button>
                    <button class="shortcut-mode-btn shortcut-double-btn ${shortcut.doubleClickMode ? 'active' : ''}" 
                            data-key="${key}" 
                            data-mode="double"
                            title="双击此键触发">
                      双击
                    </button>
                    <button class="shortcut-reset-btn" data-key="${key}">重置</button>
                  </div>
                </div>
              `).join('')}
            </div>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255, 255, 255, 0.1);">
              <button class="config-btn config-btn-secondary" id="reset-all-shortcuts">
                重置所有快捷键
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}

// 创建全局单例
export const uiRenderer = new UIRenderer();
export default uiRenderer;

