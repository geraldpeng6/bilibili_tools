/**
 * AI服务模块
 * 处理AI总结相关的所有逻辑，修复内存泄漏问题
 */

import config from '../config/ConfigManager.js';
import state from '../state/StateManager.js';
import eventBus from '../utils/EventBus.js';
import performanceMonitor from '../utils/PerformanceMonitor.js';
import notesService from './NotesService.js';
import notionService from './NotionService.js';
import { getVideoTitle, getVideoUrl } from '../utils/helpers.js';
import taskManager from '../utils/TaskManager.js';
import { EVENTS, TIMING, BALL_STATUS } from '../constants.js';
import { withTimeout } from '../utils/helpers.js';
import LogDecorator from '../utils/LogDecorator.js';

class AIService {
  constructor() {
    // 创建模块专用日志记录器
    this.log = LogDecorator.createModuleLogger('AIService');
  }
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
   * @param {boolean} isManual - 是否手动触发
   * @returns {Promise<{markdown: string, segments: Array}>} - 返回两个AI总结
   */
  async summarize(subtitleData, isManual = false) {
    // 性能监控：测量AI总结耗时
    return await performanceMonitor.measureAsync('AI总结', async () => {
      try {
        // 检查缓存：如果已有AI总结缓存且不是手动触发，直接返回缓存
        const videoKey = state.getVideoKey();
        if (videoKey && !isManual) {
          const cachedSummary = state.getAISummary(videoKey);
          if (cachedSummary) {
            this.log.info('检测到AI总结缓存，直接使用缓存，跳过请求');
            // 如果是对象格式，直接返回
            if (typeof cachedSummary === 'object' && cachedSummary.markdown) {
              return cachedSummary;
            }
            // 如果是字符串格式，尝试解析（兼容旧格式）
            try {
              return JSON.parse(cachedSummary);
            } catch (e) {
              // 旧格式字符串，返回null让后续逻辑处理
              this.log.warn('检测到旧格式缓存，需要重新生成');
            }
          }
        }

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

        // 获取当前视频信息
        const videoInfo = state.getVideoInfo();
        const videoTitle = getVideoTitle();
        const videoUrl = getVideoUrl();
        const bvid = videoInfo?.bvid;
        
        // 创建任务上下文，固定视频信息
        const taskVideoInfo = {
          bvid,
          cid: videoInfo?.cid,
          aid: videoInfo?.aid,
          p: videoInfo?.p || 1,  // 确保包含分P信息
          title: videoTitle,
          url: videoUrl
        };
        
        // 如果是手动触发，清除该视频的处理记录
        if (isManual && videoInfo) {
          taskManager.clearVideoProcessed(taskVideoInfo);
        }
        
        // 检查是否有运行中的任务
        const existingTask = this._findExistingTask(taskVideoInfo);
        if (existingTask) {
          if (existingTask.status === 'completed') {
            // 任务已完成，直接返回结果
            this.log.info('发现已完成的任务，直接返回结果');
            // 确保小球状态正确（如果处于AI总结状态，需要恢复）
            if (state.getBallStatus() === BALL_STATUS.AI_SUMMARIZING) {
              state.setBallStatus(BALL_STATUS.ACTIVE);
            }
            return existingTask.result;
          } else if (existingTask.status === 'pending' || existingTask.status === 'running') {
            // 任务正在运行，等待完成
            this.log.info('发现运行中的任务，等待完成...');
            // 如果还没有进入AI总结状态，设置并仅触发一次开始事件
            if (state.startAISummary()) {
              eventBus.emit(EVENTS.AI_SUMMARY_START);
            }
            
            // 等待任务完成
            while (existingTask.status === 'pending' || existingTask.status === 'running') {
              await new Promise(resolve => setTimeout(resolve, 100));
            }
            
            if (existingTask.status === 'completed') {
              return existingTask.result;
            } else if (existingTask.error) {
              throw existingTask.error;
            } else {
              throw new Error('任务被取消');
            }
          }
        }
        
        // 检查是否已自动处理过（仅在自动任务时）
        if (!isManual && taskManager.isVideoProcessed(taskVideoInfo)) {
          this.log.info('视频已自动处理过，跳过自动任务');
          // 确保小球状态正确（如果处于AI总结状态，需要恢复）
          if (state.getBallStatus() === BALL_STATUS.AI_SUMMARIZING) {
            state.setBallStatus(BALL_STATUS.ACTIVE);
          }
          // 尝试从缓存获取结果
          const cachedSummary = state.getAISummary(videoKey);
          if (cachedSummary) {
            // 如果有缓存，直接返回，不触发事件（因为这不是新任务）
            return cachedSummary;
          }
          // 如果没有缓存，返回null，但不触发任何事件
          return null;
        }
        
        // 创建新任务
        const taskId = taskManager.createTask(
          'ai_summary', 
          taskVideoInfo,
          async (taskContext) => {
            return await this._executeSummaryTask(subtitleData, aiConfig, headers, pureSubtitleText, timestampedSubtitleText, taskContext);
          },
          isManual
        );
        
        if (!taskId) {
          this.log.info('任务创建失败，可能是已有相同任务');
          return null;
        }
        
        // 设置AI总结状态并仅在首次触发开始事件（启动粉色小球呼吸效果）
        if (state.startAISummary()) {
          eventBus.emit(EVENTS.AI_SUMMARY_START);
        }
        
        // 获取任务结果
        const task = taskManager.activeTasks.get(taskId);
        if (!task) {
          throw new Error('任务创建失败');
        }
        
        // 等待任务完成
        while (task.status === 'pending' || task.status === 'running') {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
        
        if (task.status === 'completed') {
          return task.result;
        } else if (task.error) {
          throw task.error;
        } else {
          throw new Error('任务被取消');
        }
        
      } catch (error) {
        // 发生错误时，确保状态正确重置
        state.cancelAISummary();
        eventBus.emit(EVENTS.AI_SUMMARY_FAILED, error.message);
        throw error;
      }
    });
  }
  
  /**
   * 查找已存在的任务
   * @private
   * @param {Object} videoInfo - 视频信息
   * @returns {Object|null} 任务对象或null
   */
  _findExistingTask(videoInfo) {
    for (const [taskId, task] of taskManager.activeTasks) {
      const taskVideoKey = task.videoInfo?.bvid && task.videoInfo?.cid && task.videoInfo?.p
        ? `${task.videoInfo.bvid}-${task.videoInfo.cid}-p${task.videoInfo.p || 1}`
        : null;
      const currentVideoKey = `${videoInfo.bvid}-${videoInfo.cid}-p${videoInfo.p || 1}`;
      
      if (taskVideoKey === currentVideoKey && 
          task.type === 'ai_summary') {
        return task;
      }
    }
    return null;
  }

  /**
   * 执行总结任务
   * @private
   */
  async _executeSummaryTask(subtitleData, aiConfig, headers, pureSubtitleText, timestampedSubtitleText, taskContext) {
    try {
      const { videoInfo, signal } = taskContext;
      const taskStartTime = performance.now(); // 记录任务开始时间
      
      this.log.info('开始AI总结任务');

        // 准备请求数组
        // 第一个请求：Markdown格式总结（单独获取）
        this.log.info('=== 第一部分：视频总结（Markdown格式）===');
        this.log.debug('使用提示词类型: markdown总结');
        this.log.debug('字幕文本长度:', pureSubtitleText.length, '字符');
        
        const markdownRequest = this._makeAIRequest(
          aiConfig, 
          headers, 
          pureSubtitleText, 
          aiConfig.prompt1 || this._getDefaultPrompt1(), 
          'markdown'
        );

        // 第二个请求：JSON格式段落总结（包含广告检测）
        this.log.info('=== 第二部分：段落总结（含广告检测）===');
        this.log.debug('使用提示词类型: 段落总结+广告检测');
        this.log.debug('字幕文本长度:', timestampedSubtitleText.length, '字符');
        
        const segmentsRequest = this._makeAIRequest(
          aiConfig, 
          headers, 
          timestampedSubtitleText, 
          aiConfig.prompt2 || this._getDefaultPrompt2(), 
          'segments'
        );

        // 并行执行两个AI请求（传入signal以支持取消）
        this.log.info('并行执行两个AI请求...');
        const results = await Promise.race([
          Promise.all([markdownRequest, segmentsRequest]),
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => reject(new Error('Task aborted')));
          })
        ]);
        
        // 计算总耗时
        const taskDuration = performance.now() - taskStartTime;
        logger.debug('计时', `AI总结 - 总耗时: ${taskDuration.toFixed(2)}ms`);
        
        // 第一个请求返回：Markdown总结
        const markdownSummary = results[0];
        this.log.info('✅ 第一部分完成：Markdown总结');
        this.log.debug('Markdown总结长度:', markdownSummary?.length || 0, '字符');
        
        // 第二个请求返回：段落数组（可能包含广告段落）
        const allSegments = results[1];
        this.log.info('✅ 第二部分完成：段落总结');
        
        // 从segments中分离普通段落和广告段落
        const segments = [];
        const ads = [];
        
        for (const segment of allSegments) {
          if (segment.title === '广告') {
            // 这是广告段落，转换为广告格式
            const adStartTime = this._parseTimeToSeconds(segment.timestamp);
            // 假设广告持续30秒（如果AI没有提供结束时间）
            const adEndTime = adStartTime + 30;
            
            ads.push({
              segment: [adStartTime, adEndTime],
              category: 'sponsor',
              product: segment.summary?.substring(0, 20) || '广告',
              description: segment.summary || ''
            });
            
            this.log.debug('检测到广告段落:', segment.timestamp, '-', segment.summary);
          } else {
            // 普通段落
            segments.push(segment);
          }
        }
        
        this.log.debug('普通段落数量:', segments.length);
        this.log.debug('广告段落数量:', ads.length);
        
        if (segments.length > 0) {
          this.log.trace('段落总结详情:', segments.slice(0, 3)); // 只显示前3个
        }
        
        if (ads.length > 0) {
          this.log.info('检测到广告段落:', ads.length, '个');
          this.log.trace('广告段落详情:', ads);
        }
        
        // 组合最终结果
        const combinedResult = {
          markdown: markdownSummary,
          segments: segments,
          ads: ads
        };
        
        // 验证AI总结是否完整
        if (!combinedResult.markdown) {
          throw new Error('AI总结不完整：markdown总结缺失');
        }
        
        if (!combinedResult.segments || combinedResult.segments.length === 0) {
          this.log.warn('段落总结为空，请检查AI返回内容');
        }
        
        if (combinedResult.ads && combinedResult.ads.length > 0) {
          // 将广告段落添加到进度条标记
          this._applyAdSegments(combinedResult.ads);
        }
        
        this.log.success('AI总结任务完成');
        this.log.info('总结:', markdownSummary?.substring(0, 50) + '...');
        this.log.info('段落数:', segments.length, '广告数:', ads.length);

        // 完成总结（使用任务中的固定视频信息）
      state.finishAISummary(combinedResult);
      
      // 注意：AI总结不应该保存到"我的笔记"中
      // "我的笔记"只保存用户主动选中并点击钢笔添加的内容
      
      // 后台发送到Notion（使用任务中的固定视频信息）
      try {
        const notionConfig = config.getNotionConfig();
        const notionAutoEnabled = config.getNotionAutoSendEnabled();
        
        // 检查是否启用了自动发送并且有配置
        if (notionAutoEnabled && notionConfig.apiKey && videoInfo.bvid) {
          // 创建Notion发送任务
          taskManager.createTask(
            'notion_send_summary',
            videoInfo,
            async (notionTaskContext) => {
              // 获取配置选项
              const contentOptions = config.getNotionContentOptions();
              // 获取字幕数据（如果配置了要发送字幕）
              const subtitleData = contentOptions.subtitles ? state.getSubtitleData() : null;
              
              await notionService.sendToNotion({
                videoInfo: notionTaskContext.videoInfo,
                aiSummary: combinedResult,
                subtitleData: subtitleData, // 根据配置决定是否发送字幕
                isAuto: true
              });
            },
            false // 自动任务
          );
        }
      } catch (error) {
        console.error('[AIService] 创建Notion任务失败:', error);
      }
      
      return combinedResult;

    } catch (error) {
      // 发生错误时，确保状态正确重置
      state.cancelAISummary();
      eventBus.emit(EVENTS.AI_SUMMARY_FAILED, error.message);
      throw error;
    }
  }
  
  /**
   * 执行单个AI请求
   * @private
   * @param {Object} aiConfig - AI配置
   * @param {Object} headers - 请求头
   * @param {string} subtitleText - 字幕文本
   * @param {string} prompt - 提示词
   * @param {string} type - 请求类型 (markdown/segments)
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
      this.log.debug('发送Markdown总结请求（流式）');
      const start = performance.now();
      
      const summaryPromise = this._streamingRequest(aiConfig.url, headers, requestBody);
      
      // 添加超时保护
      const markdownContent = await withTimeout(
        summaryPromise,
        TIMING.AI_SUMMARY_TIMEOUT,
        'Markdown总结超时，请稍后重试'
      );
      
      const duration = performance.now() - start;
      logger.debug('计时', `AI总结 - Prompt1 (Markdown格式): ${duration.toFixed(2)}ms`);
      
      // 清理markdown内容：如果被代码块包裹，提取出来
      return this._cleanMarkdownContent(markdownContent);
    } else if (type === 'segments') {
      // 段落总结请求（非流式响应，包含广告检测）
      this.log.debug('发送段落总结请求（非流式，含广告检测）');
      const start = performance.now();
      
      const response = await fetch(aiConfig.url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody),
        signal: state.ai.abortController?.signal
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.log.error('段落总结API错误响应:', errorText);
        throw new Error(`段落总结请求失败: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      const duration = performance.now() - start;
      logger.debug('计时', `AI总结 - Prompt2 (段落+广告): ${duration.toFixed(2)}ms`);
      
      this.log.debug('收到AI响应，原始内容长度:', content.length, '字符');
      this.log.trace('AI响应原始内容前200字符:', content.substring(0, 200));
      
      // 解析JSON响应，返回段落数组（可能包含title为"广告"的段落）
      return this._parseJSONResponse(content);
    }
  }

  /**
   * 解析JSON响应
   * @private
   * @param {string} content - AI返回的内容
   * @returns {Array} 解析后的段落数组
   */
  _parseJSONResponse(content) {
    this.log.trace('尝试解析JSON响应，原始内容长度:', content?.length || 0);
    
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
        this.log.trace('找到JSON匹配:', jsonMatch[0].substring(0, 100) + '...');
        
        // 修复常见的JSON格式问题
        let fixedJson = jsonMatch[0];
        
        // 修复数组元素之间缺少逗号的问题
        // 在 }{ 之间添加逗号
        fixedJson = fixedJson.replace(/\}\s*\{/g, '},{');
        
        // 修复多余的逗号（如果有的话）
        fixedJson = fixedJson.replace(/,\s*\]/g, ']');
        fixedJson = fixedJson.replace(/,\s*\}/g, '}');
        
        // 尝试解析修复后的JSON
        let json;
        try {
          json = JSON.parse(fixedJson);
        } catch (firstError) {
          // 如果修复后仍然失败，尝试原始内容
          this.log.debug('修复后的JSON仍然解析失败，尝试原始内容');
          json = JSON.parse(jsonMatch[0]);
        }
        
        const segments = Array.isArray(json.segments) ? json.segments : (Array.isArray(json) ? json : []);

        if (segments.length > 0) {
          this.log.debug('成功解析段落数量:', segments.length);
          return segments.map(segment => ({
            timestamp: this._normalizeTimestamp(segment.timestamp),
            title: segment.title || '',
            summary: segment.summary || ''
          }));
        } else {
          this.log.warn('JSON中没有找到segments数组，json内容:', json);
        }
      } else {
        this.log.warn('响应中没有找到JSON格式内容，原始内容前200字符:', cleanContent.substring(0, 200));
      }
    } catch (e) {
      this.log.error('JSON解析失败:', e, '原始内容前200字符:', content?.substring(0, 200));
    }
    
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
        this.log.trace('从markdown代码块中提取内容');
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
      this.log.trace('从代码块中提取内容');
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
1. 在开头提供TL;DR（不超过50字的核心摘要）
2. 使用标题、列表等Markdown格式组织内容
3. 突出关键信息和要点
4. 总分结构，分段表示哪部分讲什么内容

字幕内容如下：
`;
  }

  /**
   * 获取JSON格式的默认提示词（包含广告检测）
   * @private
   * @returns {string}
   */
  _getDefaultPrompt2() {
    return `分析以下带时间戳的字幕，提取关键段落。

重要：你的回复必须只包含JSON，不要有任何其他文字、解释或markdown标记。

直接以{开始，以}结束。

JSON格式要求：
{"segments":[
  {"timestamp":"分钟:秒","title":"标题(10字内)","summary":"内容总结(30-50字)"}
]}

示例（你的回复应该像这样）：
{"segments":[{"timestamp":"00:15","title":"开场介绍","summary":"主持人介绍今天的主题和嘉宾背景"},{"timestamp":"02:30","title":"核心观点","summary":"讨论技术发展趋势和未来展望"}]}

特别注意：如果视频中存在商业广告推广内容（明确提及产品名称、品牌、购买链接等），请在对应位置添加一个段落，title固定为"广告"，timestamp为广告开始时间，summary简述广告内容。

包含广告的示例：
{"segments":[{"timestamp":"00:15","title":"开场介绍","summary":"主持人介绍今天的主题"},{"timestamp":"02:30","title":"广告","summary":"推广某品牌手机，介绍功能和优惠"},{"timestamp":"04:00","title":"核心观点","summary":"讨论技术发展趋势"}]}

字幕内容：
`;
  }

  /**
   * 获取合并的提示词（段落总结 + 广告分析）
   * @private
   * @param {Object} aiConfig - AI配置
   * @param {boolean} shouldDetectAds - 是否检测广告
   * @returns {string}
   */
  _getCombinedPrompt(aiConfig, shouldDetectAds) {
    const segmentsPrompt = aiConfig.prompt2 || this._getDefaultPrompt2();
    
    if (!shouldDetectAds) {
      // 如果不检测广告，只返回段落总结提示词
      return segmentsPrompt;
    }
    
    // 如果检测广告，合并两个提示词
    const adsPrompt = this._getAdDetectionPrompt();
    
    return `分析以下带时间戳的视频字幕，需要完成两个任务：

【任务1：段落总结】
${segmentsPrompt}

【任务2：广告检测】
${adsPrompt}

【重要：返回格式说明】
你必须返回一个完整的JSON对象，包含两个字段：
1. "segments": 段落总结数组（来自任务1）
2. "ads": 广告段落数组（来自任务2）

如果检测到广告，ads数组包含广告信息；如果没有广告，ads为空数组[]。

返回格式示例：
{
  "segments": [
    {"timestamp":"00:15","title":"开场介绍","summary":"主持人介绍今天的主题和嘉宾背景"},
    {"timestamp":"02:30","title":"核心观点","summary":"讨论技术发展趋势和未来展望"}
  ],
  "ads": [
    {"start":"05:20","end":"06:45","product":"某品牌手机","description":"介绍手机功能和购买优惠"}
  ]
}

如果没有广告，ads为空数组：
{
  "segments": [...],
  "ads": []
}

重要：
- 只返回JSON格式，不要有其他文字
- segments和ads都是数组
- ads数组中的每个对象包含start、end、product、description字段

字幕内容：
`;
  }

  /**
   * 获取广告检测的提示词（仅用于参考，实际已合并到_getCombinedPrompt）
   * @private
   * @returns {string}
   */
  _getAdDetectionPrompt() {
    return `识别是否存在对特定产品或品牌的硬性广告推广介绍。

判断标准：
1. 明确提及产品名称、品牌或服务
2. 包含推广性描述（如功能介绍、优惠信息、购买链接等）
3. 明显的商业推广意图

如果没有检测到广告，返回空数组[]。

如果检测到广告，返回广告时间段数组，格式为：
[{"start":"分钟:秒","end":"分钟:秒","product":"产品名称","description":"广告内容简述"}]

示例：
[{"start":"02:15","end":"03:45","product":"某品牌手机","description":"介绍手机功能和购买优惠"}]`;
  }

  /**
   * 解析合并响应（段落总结 + 广告分析）
   * @private
   * @param {string} content - AI返回的内容
   * @returns {Object} 包含segments和ads的对象
   */
  _parseSegmentsAndAdsResponse(content) {
    this.log.trace('解析段落总结+广告分析响应，原始内容长度:', content?.length || 0);
    
    try {
      // 清理内容
      let cleanContent = content.trim();
      
      // 如果内容被包裹在代码块中，提取出来
      if (cleanContent.includes('```json')) {
        const match = cleanContent.match(/```json\s*([\s\S]*?)```/);
        if (match) {
          cleanContent = match[1].trim();
          this.log.trace('从json代码块中提取内容');
        }
      } else if (cleanContent.includes('```')) {
        const match = cleanContent.match(/```\s*([\s\S]*?)```/);
        if (match) {
          cleanContent = match[1].trim();
          this.log.trace('从代码块中提取内容');
        }
      }
      
      // 尝试提取JSON部分
      const jsonMatch = cleanContent.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        this.log.trace('找到JSON匹配，解析中...');
        
        // 修复常见的JSON格式问题
        let fixedJson = jsonMatch[0];
        
        // 修复数组元素之间缺少逗号的问题
        fixedJson = fixedJson.replace(/\}\s*\{/g, '},{');
        
        // 修复多余的逗号
        fixedJson = fixedJson.replace(/,\s*\]/g, ']');
        fixedJson = fixedJson.replace(/,\s*\}/g, '}');
        
        let json;
        try {
          json = JSON.parse(fixedJson);
        } catch (firstError) {
          this.log.debug('修复后的JSON仍然解析失败，尝试原始内容');
          json = JSON.parse(jsonMatch[0]);
        }
        
        // 解析段落总结
        const segments = Array.isArray(json.segments) ? json.segments : (Array.isArray(json) ? json : []);
        const parsedSegments = segments.map(segment => ({
          timestamp: this._normalizeTimestamp(segment.timestamp),
          title: segment.title || '',
          summary: segment.summary || ''
        }));
        
        this.log.debug('解析段落总结数量:', parsedSegments.length);
        
        // 解析广告分析
        let parsedAds = [];
        if (json.ads && Array.isArray(json.ads)) {
          // 新格式：直接使用ads数组
          parsedAds = json.ads.map(ad => {
            const startTime = this._parseTimeToSeconds(ad.start);
            const endTime = this._parseTimeToSeconds(ad.end);
            return {
              segment: [startTime, endTime],
              category: 'sponsor',
              product: ad.product || '',
              description: ad.description || ''
            };
          });
        } else if (json.hasAds && Array.isArray(json.segments)) {
          // 兼容旧格式：hasAds + segments
          parsedAds = json.segments.map(segment => {
            const startTime = this._parseTimeToSeconds(segment.start);
            const endTime = this._parseTimeToSeconds(segment.end);
            return {
              segment: [startTime, endTime],
              category: 'sponsor',
              product: segment.product || '',
              description: segment.description || ''
            };
          });
        }
        
        this.log.debug('解析广告段落数量:', parsedAds.length);
        
        if (parsedSegments.length === 0) {
          this.log.warn('段落总结为空，请检查AI返回内容');
        }
        
        return {
          segments: parsedSegments,
          ads: parsedAds
        };
      } else {
        this.log.warn('响应中没有找到JSON格式内容，原始内容前200字符:', cleanContent.substring(0, 200));
      }
    } catch (e) {
      this.log.error('段落总结+广告分析解析失败:', e);
      this.log.trace('解析失败的内容前200字符:', content?.substring(0, 200));
    }
    
    // 解析失败时返回空结果
    return {
      segments: [],
      ads: []
    };
  }

  /**
   * 解析广告检测响应（已废弃，保留用于兼容）
   * @private
   * @param {string} content - AI返回的内容
   * @returns {Array} 解析后的广告段落数组
   */
  _parseAdResponse(content) {
    this.log.trace('解析广告检测响应（旧方法），原始内容长度:', content?.length || 0);
    
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
          this.log.info('检测到广告段落:', json.segments.length);
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
      this.log.warn('广告检测解析失败:', e);
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
        
        this.log.info('已将广告段落添加到进度条标记');
      }
    } catch (error) {
      this.log.warn('添加广告段落到标记失败:', error);
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

