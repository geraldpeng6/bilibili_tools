/**
 * AI服务模块
 * 处理AI总结相关的所有逻辑，修复内存泄漏问题
 */

import config from '../config/ConfigManager.js';
import state from '../state/StateManager.js';
import eventBus from '../utils/EventBus.js';
import { EVENTS, TIMING } from '../constants.js';
import { withTimeout } from '../utils/helpers.js';

class AIService {
  /**
   * 获取OpenRouter模型列表
   * @param {string} apiKey - API Key
   * @param {string} url - API URL
   * @returns {Promise<Array>}
   */
  async fetchOpenRouterModels(apiKey, url) {
    const modelsUrl = url.replace('/chat/completions', '/models');
    
    const response = await fetch(modelsUrl, {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (!response.ok) {
      throw new Error(`获取模型列表失败: ${response.status}`);
    }

    const data = await response.json();
    return data.data || [];
  }

  /**
   * 生成AI总结
   * @param {Array} subtitleData - 字幕数据
   * @param {boolean} isAuto - 是否自动触发
   * @returns {Promise<string>}
   */
  async summarize(subtitleData, isAuto = false) {
    // 检查是否正在总结
    if (!state.startAISummary()) {
      throw new Error('已有总结任务在进行中');
    }

    try {
      const aiConfig = config.getSelectedAIConfig();
      
      if (!aiConfig || !aiConfig.apiKey) {
        throw new Error('请先配置 AI API Key');
      }

      // 验证配置
      if (!aiConfig.url || !aiConfig.url.startsWith('http')) {
        throw new Error('API URL格式错误');
      }

      if (!aiConfig.model) {
        throw new Error('未配置模型');
      }

      // 生成字幕文本
      const subtitleText = subtitleData.map(item => item.content).join('\n');

      // 构建请求头
      const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`
      };

      // OpenRouter需要额外的headers
      if (aiConfig.isOpenRouter) {
        headers['HTTP-Referer'] = window.location.origin;
        headers['X-Title'] = 'Bilibili Subtitle Extractor';
      }

      const requestBody = {
        model: aiConfig.model,
        messages: [
          {
            role: 'user',
            content: aiConfig.prompt + subtitleText
          }
        ],
        stream: true
      };

      // 使用超时机制发起请求（修复内存泄漏问题）
      const summaryPromise = this._streamingRequest(aiConfig.url, headers, requestBody);
      
      // 添加超时保护
      const summary = await withTimeout(
        summaryPromise,
        TIMING.AI_SUMMARY_TIMEOUT,
        'AI总结超时，请稍后重试'
      );

      // 完成总结
      state.finishAISummary(summary);
      
      return summary;

    } catch (error) {
      // 发生错误时，确保状态正确重置
      state.cancelAISummary();
      eventBus.emit(EVENTS.AI_SUMMARY_FAILED, error.message);
      throw error;
    }
  }

  /**
   * 流式请求处理
   * @private
   * @param {string} url - API URL
   * @param {Object} headers - 请求头
   * @param {Object} body - 请求体
   * @returns {Promise<string>}
   */
  async _streamingRequest(url, headers, body) {
    const response = await fetch(url, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(body),
      signal: state.ai.abortController?.signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AIService] API错误响应:', errorText);
      throw new Error(`API请求失败: ${response.status} ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedText = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') continue;

            try {
              const json = JSON.parse(data);
              const content = json.choices[0]?.delta?.content;
              if (content) {
                accumulatedText += content;
                // 触发chunk事件，供UI实时更新
                eventBus.emit(EVENTS.AI_SUMMARY_CHUNK, accumulatedText);
              }
            } catch (e) {
              // 跳过解析错误
            }
          }
        }
      }

      return accumulatedText;

    } finally {
      reader.releaseLock();
    }
  }

  /**
   * 取消当前的AI总结
   */
  cancelCurrentSummary() {
    state.cancelAISummary();
  }
}

// 创建全局单例
export const aiService = new AIService();
export default aiService;

