/**
 * AI服务模块
 * 处理AI总结相关的所有逻辑，修复内存泄漏问题
 */

import config from '../config/ConfigManager.js';
import state from '../state/StateManager.js';
import eventBus from '../utils/EventBus.js';
import performanceMonitor from '../utils/PerformanceMonitor.js';
import notionService from './NotionService.js';
import notesService from './NotesService.js';
import logger from '../utils/DebugLogger.js';
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
   * 生成AI总结（三次独立请求）
   * @param {Array} subtitleData - 字幕数据
   * @param {boolean} isAuto - 是否自动触发
   * @returns {Promise<{markdown: string, segments: Array, ads: Array}>}
   */
  async summarize(subtitleData, isAuto = false) {
    // 检查是否正在总结
    if (!state.startAISummary()) {
      throw new Error('已有总结任务在进行中');
    }

    // 性能监控：测量AI总结耗时
    return await performanceMonitor.measureAsync('AI总结', async () => {
      try {
        const aiConfig = config.getSelectedAIConfig();
        
        if (!aiConfig) {
          throw new Error('未找到AI配置，请先在设置中添加配置');
        }

        if (!aiConfig.apiKey || aiConfig.apiKey.trim() === '') {
          throw new Error('请先配置 AI API Key\n\n请点击右上角设置按钮，选择"AI配置"，然后为所选的AI服务商配置API Key');
        }

        // 验证配置
        if (!aiConfig.url || !aiConfig.url.startsWith('http')) {
          throw new Error('API URL格式错误，请在设置中检查配置');
        }

        if (!aiConfig.model || aiConfig.model.trim() === '') {
          throw new Error('未配置模型，请在设置中选择AI模型');
        }

        // 为两个不同的AI请求准备不同的字幕文本
        // 第一个请求：纯字幕文本（不含时间戳）
        const pureSubtitleText = subtitleData.map(item => item.content).join('\n');
        
        // 第二个请求：带时间戳的字幕文本
        const timestampedSubtitleText = subtitleData.map(item => {
          // 格式化时间戳
          const minutes = Math.floor(item.from / 60);
          const seconds = Math.floor(item.from % 60);
          const timeStr = `[${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}]`;
          return `${timeStr} ${item.content}`;
        }).join('\n');

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

        // 检查是否需要广告检测
        const videoInfo = state.getVideoInfo();
        const videoDuration = document.querySelector('video')?.duration || 0;
        const shouldDetectAds = videoDuration > 300; // 超过5分钟的视频才检测广告

        // 准备请求数组
        const aiRequests = [
          // 第一个请求：Markdown格式总结（使用纯字幕文本）
          this._makeAIRequest(aiConfig, headers, pureSubtitleText, aiConfig.prompt1 || this._getDefaultPrompt1(), 'markdown'),
          // 第二个请求：JSON格式段落（使用带时间戳的字幕文本）
          this._makeAIRequest(aiConfig, headers, timestampedSubtitleText, aiConfig.prompt2 || this._getDefaultPrompt2(), 'json')
        ];

        // 如果需要，添加广告检测请求
        if (shouldDetectAds) {
          aiRequests.push(
            // 第三个请求：广告检测（使用带时间戳的字幕文本）
            this._makeAIRequest(aiConfig, headers, timestampedSubtitleText, this._getAdDetectionPrompt(), 'ads')
          );
        }

        // 并行执行所有AI请求
        const results = await Promise.all(aiRequests);
        
        // 组合结果
        const combinedResult = {
          markdown: results[0],
          segments: results[1],
          ads: shouldDetectAds ? results[2] : []
        };
        
        // 验证两个AI总结是否都成功
        if (!combinedResult.markdown || !combinedResult.segments) {
          throw new Error('AI总结不完整：markdown或segments缺失');
        }
        
        // 调试日志
        logger.debug('AIService', 'Markdown总结长度:', combinedResult.markdown?.length || 0);
        logger.debug('AIService', '段落数量:', combinedResult.segments?.length || 0);
        
        if (combinedResult.segments.length === 0) {
          logger.warn('AIService', '段落总结为空，请检查AI返回内容');
        }
        
        if (combinedResult.ads && combinedResult.ads.length > 0) {
          logger.info('AIService', '检测到广告段落:', combinedResult.ads.length);
          // 将广告段落添加到进度条标记
          this._applyAdSegments(combinedResult.ads);
        }

        // 完成总结
        state.finishAISummary(combinedResult);
        
        // 只有两个AI总结都成功才保存到笔记
        try {
          const videoInfo = state.getVideoInfo();
          const summaryNote = notesService.addAISummary({
            summary: combinedResult.markdown,
            segments: combinedResult.segments,
            videoInfo: videoInfo,
            videoBvid: videoInfo?.bvid
          });
          logger.info('AIService', '✅ 两个AI总结都成功，已保存到笔记，笔记ID:', summaryNote.id);
        } catch (error) {
          logger.error('AIService', '保存AI总结到笔记失败:', error);
        }
        
        // 如果配置了Notion且有页面，自动发送AI总结
        try {
          const notionConfig = config.getNotionConfig();
          const videoInfo = state.getVideoInfo();
          const bvid = videoInfo?.bvid;
          
          if (notionConfig.apiKey && bvid) {
            const pageId = state.getNotionPageId(bvid);
            if (pageId) {
              // 异步发送AI总结到Notion，不阻塞返回
              notionService.sendAISummary(combinedResult).catch(error => {
                console.error('[AIService] 发送AI总结到Notion失败:', error);
              });
            }
          }
        } catch (error) {
          console.error('[AIService] 检查Notion配置失败:', error);
        }
        
        return combinedResult;

      } catch (error) {
        // 发生错误时，确保状态正确重置
        state.cancelAISummary();
        eventBus.emit(EVENTS.AI_SUMMARY_FAILED, error.message);
        throw error;
      }
    });
  }

  /**
   * 执行单个AI请求
   * @private
   * @param {Object} aiConfig - AI配置
   * @param {Object} headers - 请求头
   * @param {string} subtitleText - 字幕文本
   * @param {string} prompt - 提示词
   * @param {string} type - 请求类型 (markdown/json)
   * @returns {Promise<string|Array>}
   */
  async _makeAIRequest(aiConfig, headers, subtitleText, prompt, type) {
    const requestBody = {
      model: aiConfig.model,
      messages: [
        {
          role: 'user',
          content: prompt + subtitleText
        }
      ],
      stream: type === 'markdown' // 只有Markdown总结使用流式响应
    };

    if (type === 'markdown') {
      // 使用流式请求处理Markdown总结
      const summaryPromise = this._streamingRequest(aiConfig.url, headers, requestBody);
      
      // 添加超时保护
      const markdownContent = await withTimeout(
        summaryPromise,
        TIMING.AI_SUMMARY_TIMEOUT,
        'Markdown总结超时，请稍后重试'
      );
      
      // 清理markdown内容：如果被代码块包裹，提取出来
      return this._cleanMarkdownContent(markdownContent);
    } else {
      // JSON和广告检测请求使用非流式响应
      const response = await fetch(aiConfig.url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        signal: state.ai.abortController?.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[AIService] ${type} API错误响应:`, errorText);
        throw new Error(`${type}请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      // 根据类型解析响应
      if (type === 'json') {
        return this._parseJSONResponse(content);
      } else if (type === 'ads') {
        return this._parseAdResponse(content);
      }
    }
  }

  /**
   * 解析JSON响应
   * @private
   * @param {string} content - AI返回的内容
   * @returns {Array} 解析后的段落数组
   */
  _parseJSONResponse(content) {
    logger.debug('AIService', '尝试解析JSON响应，原始内容长度:', content?.length || 0);
    
    try {
      // 先尝试清理内容
      let cleanContent = content.trim();
      
      // 如果内容被包裹在markdown代码块中，提取出来
      if (cleanContent.includes('```json')) {
        const match = cleanContent.match(/```json\s*([\s\S]*?)```/);
        if (match) {
          cleanContent = match[1].trim();
        }
      } else if (cleanContent.includes('```')) {
        const match = cleanContent.match(/```\s*([\s\S]*?)```/);
        if (match) {
          cleanContent = match[1].trim();
        }
      }
      
      // 尝试提取JSON部分
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/); 
      if (jsonMatch) {
        logger.debug('AIService', '找到JSON匹配:', jsonMatch[0].substring(0, 100) + '...');
        const json = JSON.parse(jsonMatch[0]);
        const segments = Array.isArray(json.segments) ? json.segments : (Array.isArray(json) ? json : []);

        if (segments.length > 0) {
          logger.debug('AIService', '成功解析段落数量:', segments.length);
          return segments.map(segment => ({
            timestamp: this._normalizeTimestamp(segment.timestamp),
            title: segment.title || '',
            summary: segment.summary || ''
          }));
        } else {
          logger.warn('AIService', 'JSON中没有找到segments数组，json内容:', json);
        }
      } else {
        logger.warn('AIService', '响应中没有找到JSON格式内容，原始内容前200字符:', cleanContent.substring(0, 200));
      }
    } catch (e) {
      console.error('[AIService] JSON解析失败:', e, '\n原始内容前200字符:', content?.substring(0, 200));
    }
    
    // 返回空数组作为降级处理
    return [];
  }

  /**
   * 清理markdown内容，去除可能的代码块包裹
   * @private
   * @param {string} content - 原始markdown内容
   * @returns {string} 清理后的markdown内容
   */
  _cleanMarkdownContent(content) {
    if (!content) return '';
    
    let cleanContent = content.trim();
    
    // 处理多个可能的代码块包裹情况
    // 1. 处理```markdown代码块
    while (cleanContent.includes('```markdown')) {
      const match = cleanContent.match(/```markdown\s*([\s\S]*?)```/);
      if (match) {
        // 替换代码块为其内容
        cleanContent = cleanContent.replace(/```markdown\s*[\s\S]*?```/, match[1].trim());
        logger.debug('AIService', '从markdown代码块中提取内容');
      } else {
        break;
      }
    }
    
    // 2. 处理普通```代码块，但只处理包含markdown内容的
    // 检查是否整个内容被包裹在代码块中
    if (cleanContent.startsWith('```') && cleanContent.endsWith('```')) {
      cleanContent = cleanContent.slice(3, -3).trim();
      // 如果第一行是语言标识符，移除它
      const lines = cleanContent.split('\n');
      if (lines[0] && !lines[0].includes(' ') && lines[0].length < 20) {
        cleanContent = lines.slice(1).join('\n').trim();
      }
      logger.debug('AIService', '从代码块中提取内容');
    }
    
    // 3. 处理部分内容在代码块中的情况
    // 如果内容中有markdown标题在代码块里（常见的AI错误）
    cleanContent = cleanContent.replace(/```\s*\n?(#{1,3}\s+[\s\S]*?)```/g, '$1');
    
    return cleanContent;
  }

  /**
   * 标准化时间戳格式
   * @private
   * @param {string} timeStr - 时间字符串
   * @returns {string} 标准化的时间戳
   */
  _normalizeTimestamp(timeStr) {
    if (!timeStr) return '[00:00]';
    
    // 移除可能的方括号
    const cleanTime = timeStr.replace(/[\[\]]/g, '');
    const parts = cleanTime.split(':');
    
    if (parts.length === 2) {
      // MM:SS 格式
      const [minutes, seconds] = parts;
      return `[${minutes.padStart(2, '0')}:${seconds.padStart(2, '0')}]`;
    } else if (parts.length === 3) {
      // HH:MM:SS 格式，转换为 MM:SS
      const [hours, minutes, seconds] = parts;
      const totalMinutes = parseInt(hours) * 60 + parseInt(minutes);
      return `[${totalMinutes.toString().padStart(2, '0')}:${seconds.padStart(2, '0')}]`;
    }
    
    return `[${cleanTime}]`;
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
   * 获取Markdown格式的默认提示词
   * @private
   * @returns {string}
   */
  _getDefaultPrompt1() {
    return `请用中文总结以下视频字幕内容，使用Markdown格式输出。

要求：
1. 第一行使用 # 标题，简洁概括视频主题
2. 第二部分使用 ## TL;DR 作为标题，提供2-3句话的核心摘要
3. 第三部分使用 --- 分隔线
4. 后续内容按主题使用 ### 三级标题分段
5. 使用项目符号 - 列出要点
6. 不要在总结中包含任何时间戳
7. 直接输出Markdown内容，不要使用代码块包裹（不要使用\`\`\`）

字幕内容：
`;
  }

  /**
   * 获取JSON格式的默认提示词
   * @private
   * @returns {string}
   */
  _getDefaultPrompt2() {
    return `分析以下带时间戳的字幕，提取5-8个关键段落。

重要：你的回复必须只包含JSON，不要有任何其他文字、解释或markdown标记。
直接以{开始，以}结束。

JSON格式要求：
{"segments":[
  {"timestamp":"分钟:秒","title":"标题(10字内)","summary":"内容总结(30-50字)"}
]}

示例（你的回复应该像这样）：
{"segments":[{"timestamp":"00:15","title":"开场介绍","summary":"主持人介绍今天的主题和嘉宾背景"},{"timestamp":"02:30","title":"核心观点","summary":"讨论技术发展趋势和未来展望"}]}

字幕内容：
`;
  }

  /**
   * 获取广告检测的提示词
   * @private
   * @returns {string}
   */
  _getAdDetectionPrompt() {
    return `分析以下视频字幕，识别是否存在对特定产品或品牌的硬性广告推广介绍。

判断标准：
1. 明确提及产品名称、品牌或服务
2. 包含推广性描述（如功能介绍、优惠信息、购买链接等）
3. 明显的商业推广意图

如果没有检测到广告，返回：
{"hasAds":false,"segments":[]}

如果检测到广告，返回广告时间段，格式为：
{"hasAds":true,"segments":[{"start":"分钟:秒","end":"分钟:秒","product":"产品名称","description":"广告内容简述"}]}

示例：
{"hasAds":true,"segments":[{"start":"02:15","end":"03:45","product":"某品牌手机","description":"介绍手机功能和购买优惠"}]}

重要：只返回JSON格式，不要有其他文字。

字幕内容：
`;
  }

  /**
   * 解析广告检测响应
   * @private
   * @param {string} content - AI返回的内容
   * @returns {Array} 解析后的广告段落数组
   */
  _parseAdResponse(content) {
    logger.debug('AIService', '解析广告检测响应，原始内容长度:', content?.length || 0);
    
    try {
      // 清理内容
      let cleanContent = content.trim();
      
      // 如果内容被包裹在代码块中，提取出来
      if (cleanContent.includes('```json')) {
        const match = cleanContent.match(/```json\s*([\s\S]*?)```/);
        if (match) {
          cleanContent = match[1].trim();
        }
      } else if (cleanContent.includes('```')) {
        const match = cleanContent.match(/```\s*([\s\S]*?)```/);
        if (match) {
          cleanContent = match[1].trim();
        }
      }
      
      // 尝试提取JSON部分
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const json = JSON.parse(jsonMatch[0]);
        
        if (json.hasAds && Array.isArray(json.segments)) {
          logger.info('AIService', '检测到广告段落:', json.segments.length);
          // 转换时间格式为秒数
          return json.segments.map(segment => {
            const startTime = this._parseTimeToSeconds(segment.start);
            const endTime = this._parseTimeToSeconds(segment.end);
            return {
              segment: [startTime, endTime],
              category: 'sponsor', // 使用sponsor类别
              product: segment.product,
              description: segment.description
            };
          });
        }
      }
    } catch (e) {
      logger.warn('AIService', '广告检测解析失败:', e);
    }
    
    return [];
  }

  /**
   * 将时间字符串转换为秒数
   * @private
   * @param {string} timeStr - 时间字符串 (MM:SS 或 HH:MM:SS)
   * @returns {number} 秒数
   */
  _parseTimeToSeconds(timeStr) {
    if (!timeStr) return 0;
    
    const parts = timeStr.split(':').map(p => parseInt(p));
    if (parts.length === 2) {
      // MM:SS
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      // HH:MM:SS
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
  }

  /**
   * 应用广告段落到进度条标记
   * @private
   * @param {Array} adSegments - 广告段落数组
   */
  async _applyAdSegments(adSegments) {
    if (!adSegments || adSegments.length === 0) return;
    
    try {
      // 获取SponsorBlock服务实例
      const sponsorBlockService = (await import('./SponsorBlockService.js')).default;
      
      // 添加广告段落到标记系统
      if (sponsorBlockService.playerController) {
        // 将广告段落添加到现有段落
        const existingSegments = sponsorBlockService.playerController.segments || [];
        const combinedSegments = [
          ...existingSegments,
          ...adSegments.map((ad, index) => ({
            UUID: `ai-ad-${index}`,
            segment: ad.segment,
            category: 'sponsor',
            votes: 100, // 给予较高的优先级
            videoDuration: 0,
            description: `${ad.product}: ${ad.description}`
          }))
        ];
        
        sponsorBlockService.playerController.segments = combinedSegments;
        // 重新渲染进度条标记
        sponsorBlockService.playerController.renderProgressMarkers();
        
        logger.info('AIService', '已将广告段落添加到进度条标记');
      }
    } catch (error) {
      logger.warn('AIService', '添加广告段落到标记失败:', error);
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

