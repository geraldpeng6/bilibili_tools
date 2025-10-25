/**
 * Notion服务模块
 * 处理Notion集成相关的所有逻辑，使用Promise替代回调地狱
 */

import config from '../config/ConfigManager.js';
import state from '../state/StateManager.js';
import eventBus from '../utils/EventBus.js';
import logger from '../utils/DebugLogger.js';
import notification from '../ui/Notification.js';
import { EVENTS, API, LIMITS } from '../constants.js';
import { getVideoTitle, getVideoUrl, getVideoCreator, formatTime } from '../utils/helpers.js';

class NotionService {
  /**
   * 统一的发送方法，自动和手动发送都调用此方法
   * @param {Object} options - 发送选项
   * @param {Object} options.videoInfo - 视频信息
   * @param {Object} options.aiSummary - AI总结数据 {markdown, segments}
   * @param {Array} options.subtitleData - 字幕数据
   * @param {boolean} options.isAuto - 是否自动发送
   * @returns {Promise<void>}
   */
  async sendToNotion({ videoInfo, aiSummary, subtitleData, isAuto = false }) {
    const notionConfig = config.getNotionConfig();
    const contentOptions = config.getNotionContentOptions();

    if (!notionConfig.apiKey) {
      throw new Error('请先配置 Notion API Key');
    }

    // 根据配置检查是否需要发送
    if (!contentOptions.videoInfo && !contentOptions.summary && 
        !contentOptions.segments && !contentOptions.subtitles) {
      logger.warn('NotionService', '没有选择任何要发送的内容');
      return;
    }

    state.notion.isSending = true;
    eventBus.emit(EVENTS.NOTION_SEND_START);

    try {
      // 优先使用传入的视频信息，其次从页面获取
      const videoTitle = videoInfo?.title || getVideoTitle() || '未知视频';
      const videoUrl = videoInfo?.url || getVideoUrl() || '';
      const creator = videoInfo?.creator || getVideoCreator() || '';
      const bvid = videoInfo?.bvid;

      // 构建主页面内容
      const mainPageChildren = [];

      // 添加时间戳段落（放在最前面）
      if (contentOptions.segments && aiSummary && aiSummary.segments && aiSummary.segments.length > 0) {
        mainPageChildren.push({
          object: 'block',
          type: 'heading_2',
          heading_2: { 
            rich_text: [{ 
              type: 'text', 
              text: { content: '⏱️ 时间戳段落' } 
            }] 
          }
        });

        aiSummary.segments.forEach((segment) => {
          mainPageChildren.push({
            object: 'block',
            type: 'toggle',
            toggle: {
              rich_text: [
                { 
                  type: 'text',
                  text: { content: `[${segment.timestamp}] ${segment.title}` },
                  annotations: { bold: true }
                }
              ],
              children: [{
                object: 'block',
                type: 'paragraph',
                paragraph: {
                  rich_text: [{
                    type: 'text',
                    text: { content: segment.summary }
                  }]
                }
              }]
            }
          });
        });
      }

      // 添加AI总结
      if (contentOptions.summary && aiSummary && aiSummary.markdown) {
        if (mainPageChildren.length > 0) {
          // 如果前面有内容，添加分隔线
          mainPageChildren.push({
            object: 'block',
            type: 'divider',
            divider: {}
          });
        }
        
        mainPageChildren.push({
          object: 'block',
          type: 'heading_2',
          heading_2: { 
            rich_text: [{ 
              type: 'text', 
              text: { content: '📊 视频总结' } 
            }] 
          }
        });

        // 将markdown转换为Notion blocks
        const summaryBlocks = this._convertMarkdownToNotionBlocks(aiSummary.markdown);
        mainPageChildren.push(...summaryBlocks);
      }

      // 获取或设置数据库ID
      let databaseId = notionConfig.databaseId || notionConfig.parentPageId;
      if (!databaseId) {
        throw new Error('请先配置目标位置（Page ID 或 Database ID）');
      }

      // 获取数据库结构并填充数据
      const schema = await this._getDatabaseSchema(notionConfig.apiKey, databaseId);
      const properties = this._buildProperties(schema, videoInfo, videoTitle, videoUrl, creator, [], null);

      // 创建或更新主页面
      let mainPageId = state.getNotionPageId(bvid);
      if (!mainPageId) {
        mainPageId = await this._createPage(notionConfig.apiKey, databaseId, properties, mainPageChildren);
        state.setNotionPageId(bvid, mainPageId);
        logger.info('[NotionService] ✓ 主页面创建成功');
      } else {
        // 更新现有页面
        await this._updatePage(notionConfig.apiKey, mainPageId, mainPageChildren);
        logger.info('[NotionService] ✓ 主页面更新成功');
      }

      // 创建字幕子页面
      if (contentOptions.subtitles && subtitleData && subtitleData.length > 0) {
        const subtitlePageContent = this._formatSubtitleContent(subtitleData);
        const subtitlePageId = await this._createSubtitlePage(
          notionConfig.apiKey, 
          mainPageId, 
          `${videoTitle} - 完整字幕`,
          subtitlePageContent
        );

        // 在主页面添加字幕块引用
        const subtitleBlocks = [];
        
        subtitleBlocks.push({
          object: 'block',
          type: 'divider',
          divider: {}
        });
        
        subtitleBlocks.push({
          object: 'block',
          type: 'heading_2',
          heading_2: { 
            rich_text: [{ 
              type: 'text', 
              text: { content: '📝 字幕内容' } 
            }] 
          }
        });
        
        // 添加子页面链接（Notion的块引用方式）
        subtitleBlocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: { content: '查看完整字幕: ' }
              },
              {
                type: 'mention',
                mention: {
                  type: 'page',
                  page: { id: subtitlePageId }
                },
                annotations: {
                  bold: true,
                  color: 'blue'
                }
              },
              {
                type: 'text',
                text: { content: ` (共 ${subtitleData.length} 条)` },
                annotations: {
                  italic: true,
                  color: 'gray'
                }
              }
            ]
          }
        });

        await this.appendToPage(notionConfig.apiKey, mainPageId, subtitleBlocks);
        logger.info('[NotionService] ✓ 字幕子页面创建成功');
      }

      state.notion.isSending = false;
      eventBus.emit(EVENTS.NOTION_SEND_COMPLETE);
      
      if (!isAuto) {
        notification.success('已成功发送到Notion');
      } else {
        logger.info('NotionService', `自动发送完成: ${videoTitle}`);
      }

    } catch (error) {
      state.notion.isSending = false;
      eventBus.emit(EVENTS.NOTION_SEND_FAILED, error.message);
      
      if (!isAuto) {
        throw error;
      } else {
        logger.error('NotionService', '自动发送失败:', error.message);
      }
    }
  }

  /**
   * 发送完整内容到Notion（手动触发）
   * @param {Array} subtitleData - 字幕数据
   * @param {Object} aiSummary - AI总结数据
   * @param {Object} videoInfo - 视频信息
   * @returns {Promise<void>}
   */
  async sendComplete(subtitleData, aiSummary, videoInfo) {
    return this.sendToNotion({
      videoInfo,
      aiSummary,
      subtitleData,
      isAuto: false
    });
  }

  /**
   * 发送AI总结到Notion（自动触发）
   * @param {Object} summaryData - AI总结数据
   * @param {Object} videoInfo - 视频信息
   * @returns {Promise<void>}
   */
  async sendAISummaryWithVideoInfo(summaryData, videoInfo) {
    // 获取字幕数据
    const subtitleData = state.getSubtitleData();
    
    return this.sendToNotion({
      videoInfo,
      aiSummary: summaryData,
      subtitleData,
      isAuto: true
    });
  }


  /**
   * 查询数据库中的视频页面
   * @param {string} apiKey - API Key  
   * @param {string} databaseId - 数据库ID
   * @param {string} bvid - 视频BV号
   * @returns {Promise<string|null>} - 返回页面ID或null
   */
  async queryVideoPage(apiKey, databaseId, bvid) {
    if (!apiKey || !databaseId || !bvid) {
      return null;
    }

    const queryData = {
      filter: {
        property: 'BV号',
        rich_text: {
          contains: bvid
        }
      },
      sorts: [
        {
          timestamp: 'created_time',
          direction: 'descending'
        }
      ],
      page_size: 1
    };

    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `${API.NOTION_BASE_URL}/databases/${databaseId}/query`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': API.NOTION_VERSION
        },
        data: JSON.stringify(queryData),
        onload: (response) => {
          if (response.status === 200) {
            const data = JSON.parse(response.responseText);
            if (data.results && data.results.length > 0) {
              resolve(data.results[0].id);
            } else {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        },
        onerror: () => {
          resolve(null);
        }
      });
    });
  }

  /**
   * 创建Bilibili数据库
   * @param {string} apiKey - API Key
   * @param {string} parentPageId - 父页面ID
   * @returns {Promise<string>} - 返回创建的数据库ID
   */
  async createDatabase(apiKey, parentPageId) {
    const databaseData = {
      parent: {
        type: 'page_id',
        page_id: parentPageId
      },
      title: [
        {
          type: 'text',
          text: { content: '📺 Bilibili 字幕收藏' }
        }
      ],
      properties: {
        '标题': { title: {} },
        'BV号': { rich_text: {} },
        '创作者': { rich_text: {} },
        '视频链接': { url: {} },
        '收藏时间': { date: {} },
        '字幕条数': { number: {} },
        '状态': { select: { options: [
          { name: '未总结', color: 'gray' },
          { name: '已总结', color: 'green' }
        ]}},
        '总结': { rich_text: {} }
      }
    };

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `${API.NOTION_BASE_URL}/databases`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': API.NOTION_VERSION
        },
        data: JSON.stringify(databaseData),
        onload: (response) => {
          if (response.status === 200) {
            const data = JSON.parse(response.responseText);
            resolve(data.id);
          } else {
            const error = this._parseNotionError(response);
            reject(error);
          }
        },
        onerror: (error) => {
          reject(new Error('网络请求失败'));
        }
      });
    });
  }

  /**
   * 获取数据库结构
   * @private
   * @param {string} apiKey - API Key
   * @param {string} databaseId - 数据库ID
   * @returns {Promise<Object>}
   */
  _getDatabaseSchema(apiKey, databaseId) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${API.NOTION_BASE_URL}/databases/${databaseId}`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': API.NOTION_VERSION
        },
        onload: (response) => {
          if (response.status === 200) {
            const data = JSON.parse(response.responseText);
            resolve(data.properties);
          } else {
            const error = this._parseNotionError(response);
            reject(error);
          }
        },
        onerror: () => {
          reject(new Error('获取数据库结构失败'));
        }
      });
    });
  }

  /**
   * 创建页面
   * @private
   * @param {string} apiKey - API Key
   * @param {string} databaseId - 数据库ID
   * @param {Object} properties - 页面属性
   * @param {Array} children - 页面内容
   * @returns {Promise<Object>}
   */
  _createPage(apiKey, databaseId, properties, children) {
    const pageData = {
      parent: { database_id: databaseId },
      properties: properties,
      children: children
    };

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `${API.NOTION_BASE_URL}/pages`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': API.NOTION_VERSION
        },
        data: JSON.stringify(pageData),
        onload: (response) => {
          if (response.status === 200) {
            const data = JSON.parse(response.responseText);
            resolve(data.id); // 返回页面ID
          } else {
            const error = this._parseNotionError(response);
            reject(error);
          }
        },
        onerror: () => {
          reject(new Error('创建页面失败'));
        }
      });
    });
  }

  /**
   * 创建子页面（父页面是普通页面，不是数据库）
   * @param {string} apiKey - API Key
   * @param {string} parentPageId - 父页面ID
   * @param {string} title - 子页面标题
   * @param {Array} children - 页面内容
   * @returns {Promise<string>} 子页面ID
   */
  _createChildPage(apiKey, parentPageId, title, children) {
    const pageData = {
      parent: { page_id: parentPageId },
      properties: {
        title: {
          title: [{ text: { content: title } }]
        }
      },
      children: children
    };

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `${API.NOTION_BASE_URL}/pages`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': API.NOTION_VERSION
        },
        data: JSON.stringify(pageData),
        onload: (response) => {
          if (response.status === 200) {
            const data = JSON.parse(response.responseText);
            logger.info('[NotionService] ✓ 子页面创建成功:', title);
            resolve(data.id);
          } else {
            const error = this._parseNotionError(response);
            reject(error);
          }
        },
        onerror: () => {
          reject(new Error('创建子页面失败'));
        }
      });
    });
  }

  /**
   * 追加内容到现有Notion页面（支持分批发送）
   * @param {string} apiKey - API Key
   * @param {string} pageId - 页面ID
   * @param {Array} blocks - 要追加的blocks
   * @returns {Promise<void>}
   */
  async appendToPage(apiKey, pageId, blocks) {
    // Notion API 限制每次最多100个blocks
    const BATCH_SIZE = 95; // 保守一点，留出余量
    
    // 如果块数量不超过限制，直接发送
    if (blocks.length <= BATCH_SIZE) {
      return this._appendBatch(apiKey, pageId, blocks);
    }
    
    // 分批发送
    logger.info(`[NotionService] 需要分批发送，总共 ${blocks.length} 个块`);
    
    for (let i = 0; i < blocks.length; i += BATCH_SIZE) {
      const batch = blocks.slice(i, Math.min(i + BATCH_SIZE, blocks.length));
      logger.info(`[NotionService] 发送第 ${Math.floor(i / BATCH_SIZE) + 1} 批，包含 ${batch.length} 个块`);
      
      try {
        await this._appendBatch(apiKey, pageId, batch);
        
        // 避免请求过快，添加小延迟
        if (i + BATCH_SIZE < blocks.length) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        logger.error(`[NotionService] 第 ${Math.floor(i / BATCH_SIZE) + 1} 批发送失败:`, error);
        throw error;
      }
    }
  }
  
  /**
   * 执行单批次的追加操作
   * @private
   * @param {string} apiKey - API Key
   * @param {string} pageId - 页面ID
   * @param {Array} blocks - 要追加的blocks（不超过100个）
   * @returns {Promise<void>}
   */
  async _appendBatch(apiKey, pageId, blocks) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'PATCH',
        url: `${API.NOTION_BASE_URL}/blocks/${pageId}/children`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': API.NOTION_VERSION
        },
        data: JSON.stringify({ children: blocks }),
        onload: (response) => {
          if (response.status === 200) {
            resolve();
          } else {
            const error = this._parseNotionError(response);
            reject(error);
          }
        },
        onerror: () => {
          reject(new Error('追加内容失败'));
        }
      });
    });
  }

  /**
   * 获取页面的所有blocks
   * @param {string} apiKey - API Key
   * @param {string} pageId - 页面ID
   * @returns {Promise<Array>} blocks数组
   */
  async getPageBlocks(apiKey, pageId) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${API.NOTION_BASE_URL}/blocks/${pageId}/children`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': API.NOTION_VERSION
        },
        onload: (response) => {
          if (response.status === 200) {
            const data = JSON.parse(response.responseText);
            resolve(data.results || []);
          } else {
            const error = this._parseNotionError(response);
            reject(error);
          }
        },
        onerror: () => {
          reject(new Error('获取页面内容失败'));
        }
      });
    });
  }

  /**
   * 发送AI总结到Notion
   * 注意：如果页面已存在，AI总结会追加到末尾
   * 建议在AI总结完成后重新发送字幕，以获得正确的顺序（视频信息→AI总结→字幕内容）
   * @param {Object} summary - AI总结数据 {markdown, segments}
   * @returns {Promise<void>}
   */
  async sendAISummary(summary) {
    const notionConfig = config.getNotionConfig();
    const videoInfo = state.getVideoInfo();
    const bvid = videoInfo?.bvid;

    if (!bvid) {
      throw new Error('无效的视频信息');
    }

    // 获取页面ID（从缓存或查询）
    let pageId = state.getNotionPageId(bvid);
    
    if (!pageId && notionConfig.databaseId) {
      pageId = await this.queryVideoPage(notionConfig.apiKey, notionConfig.databaseId, bvid);
      if (pageId) {
        state.setNotionPageId(bvid, pageId);
      }
    }

    if (!pageId) {
      // 没有页面，不自动发送
      // AI总结会在下次发送字幕时自动包含
      console.log('[NotionService] 未找到页面，AI总结将在下次发送字幕时自动包含');
      return;
    }

    // 构建AI总结blocks
    const blocks = this._buildAISummaryBlocks(summary);
    
    // 最后一次验证所有blocks的结构
    console.log('[NotionService] 开始验证blocks结构...');
    for (let i = 0; i < blocks.length; i++) {
      const block = blocks[i];
      
      // 基本结构验证
      if (!block || typeof block !== 'object') {
        console.error('[NotionService] Block at index', i, 'is not an object:', block);
        throw new Error(`Block at index ${i} is not an object`);
      }
      
      if (!block.object || block.object !== 'block') {
        console.error('[NotionService] Block at index', i, 'missing or invalid object property:', block);
        throw new Error(`Block at index ${i} missing object: 'block' property`);
      }
      
      if (!block.type || typeof block.type !== 'string') {
        console.error('[NotionService] Block at index', i, 'missing or invalid type:', block);
        throw new Error(`Block at index ${i} missing valid type property`);
      }
      
      // 确保block有对应类型的属性
      if (!block[block.type]) {
        console.error('[NotionService] Block at index', i, 'missing type-specific property for type', block.type, ':', block);
        throw new Error(`Block at index ${i} is missing ${block.type} property`);
      }
      
      // 对于需要rich_text的block类型，验证rich_text结构
      const typeObj = block[block.type];
      if (typeObj && typeObj.rich_text !== undefined) {
        if (!Array.isArray(typeObj.rich_text)) {
          console.error('[NotionService] Block at index', i, 'has invalid rich_text (not an array):', typeObj.rich_text);
          throw new Error(`Block at index ${i} has invalid rich_text property`);
        }
        
        // 验证每个rich_text元素
        typeObj.rich_text.forEach((rt, rtIndex) => {
          if (!rt || !rt.type || !rt.text || typeof rt.text.content !== 'string') {
            console.error('[NotionService] Block at index', i, 'has invalid rich_text element at', rtIndex, ':', rt);
            throw new Error(`Block at index ${i} has invalid rich_text element at ${rtIndex}`);
          }
        });
      }
      
      console.log('[NotionService] Block', i, 'validated successfully:', block.type);
    }
    
    console.log('[NotionService] 所有blocks验证通过，准备发送', blocks.length, '个blocks到Notion');
    
    // 追加到页面末尾
    // 注意：这会使顺序变成"视频信息→字幕内容→AI总结"
    // 如需正确顺序，请重新发送字幕
    await this.appendToPage(notionConfig.apiKey, pageId, blocks);
    
    console.log('[NotionService] AI总结已追加到Notion页面末尾');
  }

  /**
   * 构建AI总结blocks
   * @private
   * @param {Object} summary - AI总结数据
   * @returns {Array} blocks数组
   */
  _buildAISummaryBlocks(summary) {
    const blocks = [];

    try {
      // 添加分隔线
      blocks.push({
        object: 'block',
        type: 'divider',
        divider: {}
      });

      // 添加AI总结标题
      blocks.push({
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ 
            type: 'text', 
            text: { 
              content: '🤖 AI总结' 
            }
          }]
        }
      });

      // 添加Markdown总结
      if (summary && summary.markdown) {
        // 确保markdown是字符串
        const markdownContent = String(summary.markdown || '');
        // 将markdown内容分块，每块最多包含10行或1500字符
        const markdownLines = markdownContent.split('\n').filter(line => line !== undefined && line !== null);
        
        let currentChunk = [];
        let currentChunkLength = 0;
        const maxLinesPerBlock = 10;
        const maxCharsPerBlock = 1500;
        
        markdownLines.forEach((line, index) => {
          const trimmedLine = String(line || '').trim();
          
          // 如果是空行且当前chunk有内容，则创建一个block并重新开始
          if (!trimmedLine && currentChunk.length > 0) {
            blocks.push({
              object: 'block',
              type: 'paragraph',
              paragraph: {
                rich_text: [{ 
                  type: 'text', 
                  text: { 
                    content: currentChunk.join('\n') 
                  }
                }]
              }
            });
            currentChunk = [];
            currentChunkLength = 0;
          } 
          // 如果超过限制，创建一个block
          else if (currentChunk.length >= maxLinesPerBlock || 
                   currentChunkLength + trimmedLine.length > maxCharsPerBlock) {
            if (currentChunk.length > 0) {
              blocks.push({
                object: 'block',
                type: 'paragraph',
                paragraph: {
                  rich_text: [{ 
                    type: 'text', 
                    text: { 
                      content: currentChunk.join('\n') 
                    }
                  }]
                }
              });
            }
            currentChunk = trimmedLine ? [trimmedLine] : [];
            currentChunkLength = trimmedLine.length;
          } 
          // 添加到当前chunk
          else if (trimmedLine) {
            currentChunk.push(trimmedLine);
            currentChunkLength += trimmedLine.length;
          }
        });
        
        // 添加最后的chunk
        if (currentChunk.length > 0) {
          blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ 
                type: 'text', 
                text: { 
                  content: currentChunk.join('\n') 
                }
              }]
            }
          });
        }
      }

      // 添加时间戳段落
      if (summary && summary.segments && Array.isArray(summary.segments) && summary.segments.length > 0) {
        // 添加段落标题前先加个空行
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [{ 
              type: 'text', 
              text: { 
                content: ' '  // Notion不支持空段落，使用空格
              }
            }]
          }
        });
        
        blocks.push({
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [{ 
              type: 'text', 
              text: { 
                content: '⏱️ 时间戳段落' 
              }
            }]
          }
        });

        // 限制时间戳段落数量，避免blocks过多
        const maxSegments = 20; // 最多显示20个时间戳段落
        const segmentsToAdd = summary.segments.slice(0, maxSegments);
        
        segmentsToAdd.forEach(segment => {
          if (segment && typeof segment === 'object') {
            // 确保所有字段都是有效的字符串
            const timestamp = String(segment.timestamp || '00:00');
            const title = String(segment.title || '未知标题');
            const segmentSummary = String(segment.summary || '');
            const content = `${timestamp} - ${title}${segmentSummary ? ': ' + segmentSummary : ''}`;
            
            // 确保content是有效的字符串
            if (content && typeof content === 'string') {
              blocks.push({
                object: 'block',
                type: 'bulleted_list_item',
                bulleted_list_item: {
                  rich_text: [{ 
                    type: 'text', 
                    text: { 
                      content: content 
                    }
                  }]
                }
              });
            }
          }
        });
        
        // 如果段落被截断，添加提示
        if (summary.segments.length > maxSegments) {
          blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ 
                type: 'text', 
                text: { 
                  content: `... 还有 ${summary.segments.length - maxSegments} 个时间戳段落未显示`
                },
                annotations: { italic: true }
              }]
            }
          });
        }
      }

      // 验证所有blocks都有正确的结构
      const validBlocks = blocks.filter(block => {
        if (!block || typeof block !== 'object') {
          console.warn('[NotionService] 发现无效的block:', block);
          return false;
        }
        if (!block.type || !block.object) {
          console.warn('[NotionService] Block缺少必要属性:', block);
          return false;
        }
        // 验证block有对应类型的属性
        if (!block[block.type]) {
          console.warn('[NotionService] Block缺少类型属性', block.type, ':', block);
          return false;
        }
        return true;
      });

      console.log('[NotionService] 构建AI总结blocks完成，共', validBlocks.length, '个有效blocks');
      
      // 再次验证每个block的rich_text属性（如果需要）
      validBlocks.forEach((block, index) => {
        const typeKey = block.type;
        // 对于需要rich_text的block类型，确保rich_text是数组
        if (['paragraph', 'heading_1', 'heading_2', 'heading_3', 'bulleted_list_item', 'numbered_list_item', 'quote', 'to_do', 'toggle', 'callout'].includes(typeKey)) {
          if (block[typeKey] && block[typeKey].rich_text) {
            // 确保rich_text是数组
            if (!Array.isArray(block[typeKey].rich_text)) {
              block[typeKey].rich_text = [];
            }
            // 确保每个rich_text元素都有正确的结构
            block[typeKey].rich_text = block[typeKey].rich_text.filter(rt => {
              return rt && rt.type === 'text' && rt.text && typeof rt.text.content === 'string';
            });
            // 如果rich_text为空，添加一个空文本
            if (block[typeKey].rich_text.length === 0) {
              block[typeKey].rich_text = [{ type: 'text', text: { content: ' ' } }];
            }
          }
        }
      });
      
      return validBlocks;
      
    } catch (error) {
      console.error('[NotionService] 构建AI总结blocks失败:', error);
      // 返回最小的有效blocks数组
      return [{
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ 
            type: 'text', 
            text: { 
              content: 'AI总结生成失败，请重试' 
            }
          }]
        }
      }];
    }
  }

  /**
   * 构建页面内容
   * @private
   * @param {Object} videoInfo - 视频信息
   * @param {string} videoTitle - 视频标题
   * @param {string} videoUrl - 视频URL
   * @param {Array} subtitleData - 字幕数据
   * @param {Object} aiSummary - AI总结（可选）{markdown, segments}
   * @returns {Array}
   */
  _buildPageContent(videoInfo, videoTitle, videoUrl, subtitleData, aiSummary = null) {
    const children = [
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: '📹 视频信息' } }]
        }
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `视频标题：${videoTitle}` } }]
        }
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `BV号：${videoInfo.bvid}` } }]
        }
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `视频链接：${videoUrl}` } }]
        }
      },
      {
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{ type: 'text', text: { content: `字幕总数：${subtitleData.length} 条` } }]
        }
      },
      {
        object: 'block',
        type: 'divider',
        divider: {}
      }
    ];

    // 如果有AI总结，在字幕内容之前插入
    if (aiSummary && (aiSummary.markdown || aiSummary.segments)) {
      const aiBlocks = this._buildAISummaryBlocks(aiSummary);
      children.push(...aiBlocks);
    }

    // 添加字幕内容标题
    children.push({
      object: 'block',
      type: 'heading_2',
      heading_2: {
        rich_text: [{ type: 'text', text: { content: '📝 字幕内容' } }]
      }
    });

    // 构建字幕rich_text数组
    const subtitleRichTextArray = [];
    let currentText = '';
    const maxTextLength = LIMITS.NOTION_TEXT_CHUNK;

    for (let item of subtitleData) {
      const line = `${item.content}\n`;

      if (currentText.length + line.length > maxTextLength) {
        if (currentText) {
          subtitleRichTextArray.push({
            type: 'text',
            text: { content: currentText }
          });
        }
        currentText = line;
      } else {
        currentText += line;
      }
    }

    // 添加最后一段
    if (currentText) {
      subtitleRichTextArray.push({
        type: 'text',
        text: { content: currentText }
      });
    }

    // 添加字幕代码块
    children.push({
      object: 'block',
      type: 'code',
      code: {
        rich_text: subtitleRichTextArray,
        language: 'plain text'
      }
    });

    // 检查并限制blocks数量不超过100个（Notion API限制）
    if (children.length > 100) {
      logger.warn('[NotionService] blocks数量超过100个，进行截断', children.length);
      // 保留前95个blocks，然后添加一个提示
      const truncatedChildren = children.slice(0, 95);
      truncatedChildren.push({
        object: 'block',
        type: 'divider',
        divider: {}
      });
      truncatedChildren.push({
        object: 'block',
        type: 'callout',
        callout: {
          rich_text: [{ 
            type: 'text', 
            text: { 
              content: `⚠️ 内容被截断：原始内容包含 ${children.length} 个blocks，超过了Notion API的100个blocks限制。` 
            }
          }],
          icon: {
            emoji: '⚠️'
          }
        }
      });
      return truncatedChildren;
    }

    return children;
  }

  /**
   * 构建Notion页面的Properties
   * @private
   * @param {Object} schema - 数据库schema
   * @param {Object} videoInfo - 视频信息
   * @param {string} videoTitle - 视频标题
   * @param {string} videoUrl - 视频链接
   * @param {string} creator - 创作者
   * @param {Array} subtitleData - 字幕数据
   * @param {Object|null} summary - AI总结（null表示不填充总结字段）
   * @returns {Object}
   */
  _buildProperties(schema, videoInfo, videoTitle, videoUrl, creator, subtitleData, summary = null) {
    const properties = {};

    // 查找title类型的字段（必须存在）
    const titleField = Object.keys(schema).find(key => schema[key].type === 'title');
    if (titleField) {
      properties[titleField] = {
        title: [{ text: { content: videoTitle } }]
      };
    }

    // 智能匹配其他字段
    Object.keys(schema).forEach(fieldName => {
      const fieldType = schema[fieldName].type;
      const lowerFieldName = fieldName.toLowerCase().replace(/\s+/g, '');

      // BV号字段
      if (lowerFieldName.includes('bv') && (fieldType === 'rich_text' || fieldType === 'text')) {
        properties[fieldName] = {
          rich_text: [{ type: 'text', text: { content: videoInfo.bvid || '' } }]
        };
      }

      // 创作者字段
      if ((lowerFieldName.includes('创作') || lowerFieldName.includes('作者') || 
           lowerFieldName.includes('creator') || lowerFieldName.includes('up主')) &&
          (fieldType === 'rich_text' || fieldType === 'text')) {
        properties[fieldName] = {
          rich_text: [{ type: 'text', text: { content: creator } }]
        };
      }

      // 视频链接字段
      if (lowerFieldName.includes('链接') && fieldType === 'url') {
        properties[fieldName] = { url: videoUrl };
      }

      // 日期字段
      if (fieldType === 'date' && (
        lowerFieldName === '日期' ||
        lowerFieldName.includes('收藏') ||
        lowerFieldName.includes('添加') ||
        lowerFieldName.includes('创建'))) {
        properties[fieldName] = {
          date: { start: new Date().toISOString() }
        };
      }

      // 数量字段
      if ((lowerFieldName.includes('条数') || lowerFieldName.includes('数量')) && 
          fieldType === 'number') {
        properties[fieldName] = { number: subtitleData.length };
      }

      // 状态字段
      if (lowerFieldName === '状态' || lowerFieldName === 'status') {
        const videoKey = state.getVideoKey();
        const hasSummary = videoKey ? state.getAISummary(videoKey) : null;
        
        if (fieldType === 'select' || fieldType === 'status') {
          properties[fieldName] = {
            [fieldType]: { name: hasSummary ? '已总结' : '未总结' }
          };
        } else if (fieldType === 'rich_text') {
          properties[fieldName] = {
            rich_text: [{ type: 'text', text: { content: hasSummary ? '已总结' : '未总结' } }]
          };
        }
      }

      // 总结字段 - 只有传入summary参数时才填充
      if ((lowerFieldName === '总结' || lowerFieldName === 'summary') && summary !== null) {
        if (fieldType === 'rich_text') {
          // summary可能是对象或字符串，需要处理两种情况
          let summaryText = '';
          if (typeof summary === 'string') {
            summaryText = summary;
          } else if (summary && summary.markdown) {
            summaryText = summary.markdown;
          }
          
          if (summaryText) {
            properties[fieldName] = {
              rich_text: [{ type: 'text', text: { content: summaryText.substring(0, LIMITS.NOTION_TEXT_MAX) } }]
            };
          }
        }
      }
    });

    return properties;
  }

  /**
   * 发送AI总结到Notion（新结构：创建子页面）
   * @param {Object} summaryData - AI总结数据 {markdown, segments}
   * @returns {Promise<void>}
   */
  async sendAISummary(summaryData) {
    const notionConfig = config.getNotionConfig();
    const contentOptions = config.getNotionContentOptions();

    if (!notionConfig.apiKey) {
      throw new Error('请先配置 Notion API Key');
    }

    if (!summaryData) {
      throw new Error('没有总结数据可发送');
    }

    state.notion.isSending = true;
    eventBus.emit(EVENTS.NOTION_SEND_START);

    try {
      const videoInfo = state.getVideoInfo();
      const videoTitle = getVideoTitle();
      const videoUrl = getVideoUrl();
      const creator = getVideoCreator();
      const bvid = videoInfo?.bvid;

      // 获取或创建主页面
      let mainPageId = state.getNotionPageId(bvid);
      
      if (!mainPageId) {
        // 先创建主页面（只包含视频信息和时间戳段落）
        const mainPageChildren = [];

        // 添加视频信息
        if (contentOptions.videoInfo) {
          mainPageChildren.push({
            object: 'block',
            type: 'heading_2',
            heading_2: { 
              rich_text: [{ 
                type: 'text',  // 添加type属性
                text: { content: '📹 视频信息' } 
              }] 
            }
          });
          mainPageChildren.push({
            object: 'block',
            type: 'paragraph',
            paragraph: { 
              rich_text: [{ 
                type: 'text',  // 添加type属性
                text: { content: videoTitle || '未知视频' } 
              }] 
            }
          });
        }

        // 创建主页面
        let databaseId = notionConfig.databaseId || notionConfig.parentPageId;
        if (!databaseId) {
          throw new Error('请先配置目标位置（Page ID 或 Database ID）');
        }

        const schema = await this._getDatabaseSchema(notionConfig.apiKey, databaseId);
        const properties = this._buildProperties(schema, videoInfo, videoTitle, videoUrl, creator, [], null); // 不添加summary到字段

        mainPageId = await this._createPage(notionConfig.apiKey, databaseId, properties, mainPageChildren);
        state.setNotionPageId(bvid, mainPageId);
        logger.info('[NotionService] ✓ 主页面创建成功');
        
        // 创建页面后，再追加时间戳段落（避免初始创建时超过100个块的限制）
        if (contentOptions.segments && summaryData.segments && summaryData.segments.length > 0) {
          logger.info('[NotionService] 添加时间戳段落...');
          const segmentBlocks = [];
          
          // 添加分隔线
          segmentBlocks.push({
            object: 'block',
            type: 'divider',
            divider: {}
          });
          
          // 添加标题
          segmentBlocks.push({
            object: 'block',
            type: 'heading_2',
            heading_2: { 
              rich_text: [{ 
                type: 'text',
                text: { content: '⏱️ 时间戳段落' } 
              }] 
            }
          });

          // 添加每个段落
          summaryData.segments.forEach((segment) => {
            segmentBlocks.push({
              object: 'block',
              type: 'toggle',
              toggle: {
                rich_text: [
                  { 
                    type: 'text',
                    text: { content: `[${segment.timestamp}] ${segment.title}` },
                    annotations: { bold: true }
                  }
                ],
                children: [
                  {
                    object: 'block',
                    type: 'paragraph',
                    paragraph: {
                      rich_text: [{ 
                        type: 'text',
                        text: { content: segment.summary } 
                      }]
                    }
                  }
                ]
              }
            });
          });
          
          // 追加段落到主页面（自动分批处理）
          logger.info(`[NotionService] 准备发送 ${segmentBlocks.length} 个段落块`);
          await this.appendToPage(notionConfig.apiKey, mainPageId, segmentBlocks);
          logger.info('[NotionService] ✓ 时间戳段落已添加到主页面');
        }
      }

      // 添加 AI总结到主页面
      if (contentOptions.summary && summaryData.markdown) {
        logger.info('[NotionService] 添加 AI总结内容...');
        
        const summaryBlocks = [];
        
        // 添加分隔线
        summaryBlocks.push({
          object: 'block',
          type: 'divider',
          divider: {}
        });
        
        // 添加标题
        summaryBlocks.push({
          object: 'block',
          type: 'heading_2',
          heading_2: { 
            rich_text: [{ 
              type: 'text',
              text: { content: '🤖 AI总结' } 
            }] 
          }
        });
        
        // 转换markdown内容为blocks
        const markdownBlocks = this._convertMarkdownToNotionBlocks(summaryData.markdown);
        summaryBlocks.push(...markdownBlocks);
        
        // 追加到主页面
        await this.appendToPage(notionConfig.apiKey, mainPageId, summaryBlocks);
        
        logger.info('[NotionService] ✓ AI总结已添加到主页面');
      }

      state.notion.isSending = false;
      eventBus.emit(EVENTS.NOTION_SEND_COMPLETE);

    } catch (error) {
      state.notion.isSending = false;
      eventBus.emit(EVENTS.NOTION_SEND_FAILED, error.message);
      throw error;
    }
  }

  /**
   * 将Markdown文本转换为Notion blocks（优化版）
   * @private
   * @param {string} markdown - Markdown文本
   * @returns {Array} Notion blocks数组
   */
  _convertMarkdownToNotionBlocks(markdown) {
    const blocks = [];
    const lines = markdown.split('\n');
    
    logger.debug('[NotionService] 开始转换Markdown，共', lines.length, '行');
    
    let consecutiveParagraphs = [];
    
    const flushParagraphs = () => {
      if (consecutiveParagraphs.length > 0) {
        // 合并连续的普通段落为一个paragraph，用换行分隔
        const combinedText = consecutiveParagraphs.join('\n');
        blocks.push({
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: this._parseRichText(combinedText)
          }
        });
        consecutiveParagraphs = [];
      }
    };
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();
      
      // 跳过空行
      if (!trimmedLine) {
        continue;
      }
      
      // 分隔线
      if (trimmedLine === '---' || trimmedLine === '***' || trimmedLine === '___') {
        flushParagraphs();
        blocks.push({
          object: 'block',
          type: 'divider',
          divider: {}
        });
        continue;
      }
      
      // 标题检测（优化：使用正则，支持标题后有多余空格）
      const headingMatch = trimmedLine.match(/^(#{1,3})\s+(.+)$/);
      if (headingMatch) {
        flushParagraphs();
        const level = headingMatch[1].length;
        const text = headingMatch[2].trim();
        const headingType = `heading_${level}`;
        
        blocks.push({
          object: 'block',
          type: headingType,
          [headingType]: {
            rich_text: this._parseRichText(text)
          }
        });
        continue;
      }
      
      // 无序列表: - item 或 * item
      if (trimmedLine.match(/^[-*]\s+/)) {
        flushParagraphs();
        const text = trimmedLine.substring(2).trim();
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: this._parseRichText(text)
          }
        });
        continue;
      }
      
      // 有序列表: 1. item
      const numberedMatch = trimmedLine.match(/^(\d+)\.\s+(.+)$/);
      if (numberedMatch) {
        flushParagraphs();
        const text = numberedMatch[2].trim();
        blocks.push({
          object: 'block',
          type: 'numbered_list_item',
          numbered_list_item: {
            rich_text: this._parseRichText(text)
          }
        });
        continue;
      }
      
      // 引用: > text
      if (trimmedLine.startsWith('> ')) {
        flushParagraphs();
        const text = trimmedLine.substring(2).trim();
        blocks.push({
          object: 'block',
          type: 'quote',
          quote: {
            rich_text: this._parseRichText(text)
          }
        });
        continue;
      }
      
      // 代码块: ```
      if (trimmedLine.startsWith('```')) {
        flushParagraphs();
        const codeLines = [];
        i++; // 跳过开始的```
        while (i < lines.length && !lines[i].trim().startsWith('```')) {
          codeLines.push(lines[i]);
          i++;
        }
        blocks.push({
          object: 'block',
          type: 'code',
          code: {
            rich_text: [{ type: 'text', text: { content: codeLines.join('\n') } }],
            language: 'plain text'
          }
        });
        continue;
      }
      
      // 普通段落 - 累积起来
      consecutiveParagraphs.push(trimmedLine);
    }
    
    // 处理剩余的段落
    flushParagraphs();
    
    logger.info('[NotionService] ✓ Markdown转换完成，生成', blocks.length, '个blocks（优化后）');
    return blocks;
  }
  
  /**
   * 解析文本中的rich text格式（粗体、斜体等）- 简化版
   * @private
   * @param {string} text - 文本
   * @returns {Array} rich_text数组
   */
  _parseRichText(text) {
    // 简化版：只保留粗体和换行支持，减少复杂度
    const richText = [];
    let currentText = '';
    let i = 0;
    
    // 处理文本中的换行
    const lines = text.split('\n');
    
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
      const line = lines[lineIndex];
      i = 0;
      
      while (i < line.length) {
        // 粗体: **text**
        if (line.substring(i, i + 2) === '**') {
          if (currentText) {
            richText.push({ 
              type: 'text',  // 添加type属性
              text: { content: currentText } 
            });
            currentText = '';
          }
          i += 2;
          let boldText = '';
          while (i < line.length && line.substring(i, i + 2) !== '**') {
            boldText += line[i];
            i++;
          }
          if (boldText) {
            richText.push({
              type: 'text',  // 添加type属性
              text: { content: boldText },
              annotations: { bold: true }
            });
          }
          i += 2;
          continue;
        }
        
        // 行内代码: `code`
        if (line[i] === '`' && line[i + 1] !== '`') {
          if (currentText) {
            richText.push({ 
              type: 'text',  // 添加type属性
              text: { content: currentText } 
            });
            currentText = '';
          }
          i++;
          let codeText = '';
          while (i < line.length && line[i] !== '`') {
            codeText += line[i];
            i++;
          }
          if (codeText) {
            richText.push({
              type: 'text',  // 添加type属性
              text: { content: codeText },
              annotations: { code: true }
            });
          }
          i++;
          continue;
        }
        
        currentText += line[i];
        i++;
      }
      
      // 添加当前行的文本
      if (currentText) {
        richText.push({ 
          type: 'text',  // 添加type属性
          text: { content: currentText } 
        });
        currentText = '';
      }
      
      // 如果不是最后一行，添加换行
      if (lineIndex < lines.length - 1) {
        richText.push({ 
          type: 'text',  // 添加type属性
          text: { content: '\n' } 
        });
      }
    }
    
    // 如果没有任何内容，返回空文本
    if (richText.length === 0) {
      return [{ 
        type: 'text',  // 添加type属性
        text: { content: text || '' } 
      }];
    }
    
    return richText;
  }

  /**
   * 发送AI总结到Notion（带固定视频信息）
   * @param {Object} summaryData - AI总结数据 {markdown, segments}
   * @param {Object} videoInfo - 固定的视频信息 {bvid, cid, aid, title, url}
   * @returns {Promise<void>}
   */
  async sendAISummaryWithVideoInfo(summaryData, videoInfo) {
    const notionConfig = config.getNotionConfig();
    const contentOptions = config.getNotionContentOptions();

    if (!notionConfig.apiKey) {
      throw new Error('请先配置 Notion API Key');
    }

    if (!summaryData) {
      throw new Error('没有总结数据可发送');
    }

    logger.info('NotionService', `后台发送AI总结，视频: ${videoInfo.bvid}`);

    try {
      // 使用固定的视频信息，而不是从state获取
      const videoTitle = videoInfo.title || '未知视频';
      const videoUrl = videoInfo.url || '';
      const bvid = videoInfo.bvid;

      // 获取或创建主页面
      let mainPageId = state.getNotionPageId(bvid);
      
      if (!mainPageId) {
        // 创建新页面
        const mainPageChildren = [];

        // 添加视频信息
        if (contentOptions.videoInfo) {
          mainPageChildren.push({
            object: 'block',
            type: 'heading_2',
            heading_2: { 
              rich_text: [{ 
                type: 'text',
                text: { content: '📹 视频信息' } 
              }] 
            }
          });
          mainPageChildren.push({
            object: 'block',
            type: 'paragraph',
            paragraph: { 
              rich_text: [{ 
                type: 'text',
                text: { content: videoTitle } 
              }] 
            }
          });
        }

        let databaseId = notionConfig.databaseId || notionConfig.parentPageId;
        if (!databaseId) {
          throw new Error('请先配置目标位置（Page ID 或 Database ID）');
        }

        const schema = await this._getDatabaseSchema(notionConfig.apiKey, databaseId);
        const properties = this._buildProperties(schema, videoInfo, videoTitle, videoUrl, '', [], null);

        mainPageId = await this._createPage(notionConfig.apiKey, databaseId, properties, mainPageChildren);
        state.setNotionPageId(bvid, mainPageId);
        logger.info('NotionService', '✓ 为后台任务创建主页面成功');
      }

      // 添加时间戳段落和AI总结（使用既有的逻辑）
      if (contentOptions.segments && summaryData.segments && summaryData.segments.length > 0) {
        const segmentBlocks = [];
        
        segmentBlocks.push({
          object: 'block',
          type: 'divider',
          divider: {}
        });
        
        segmentBlocks.push({
          object: 'block',
          type: 'heading_2',
          heading_2: { 
            rich_text: [{ 
              type: 'text',
              text: { content: '⏱️ 时间戳段落' } 
            }] 
          }
        });

        summaryData.segments.forEach((segment) => {
          segmentBlocks.push({
            object: 'block',
            type: 'toggle',
            toggle: {
              rich_text: [
                { 
                  type: 'text',
                  text: { content: `[${segment.timestamp}] ${segment.title}` },
                  annotations: { bold: true }
                }
              ],
              children: [
                {
                  object: 'block',
                  type: 'paragraph',
                  paragraph: {
                    rich_text: [{ 
                      type: 'text',
                      text: { content: segment.summary } 
                    }]
                  }
                }
              ]
            }
          });
        });
        
        await this.appendToPage(notionConfig.apiKey, mainPageId, segmentBlocks);
        logger.info('NotionService', '✓ 后台任务：时间戳段落已添加');
      }

      // 添加AI总结
      if (contentOptions.summary && summaryData.markdown) {
        const summaryBlocks = [];
        
        summaryBlocks.push({
          object: 'block',
          type: 'divider',
          divider: {}
        });
        
        summaryBlocks.push({
          object: 'block',
          type: 'heading_2',
          heading_2: { 
            rich_text: [{ 
              type: 'text',
              text: { content: '🤖 AI总结' } 
            }] 
          }
        });
        
        const markdownBlocks = this._convertMarkdownToNotionBlocks(summaryData.markdown);
        summaryBlocks.push(...markdownBlocks);
        
        await this.appendToPage(notionConfig.apiKey, mainPageId, summaryBlocks);
        logger.info('NotionService', '✓ 后台任务：AI总结已添加');
      }

      logger.success('NotionService', `后台任务完成：视频 ${videoInfo.bvid} 的AI总结已发送到Notion`);

    } catch (error) {
      logger.error('NotionService', `后台任务失败：视频 ${videoInfo.bvid}`, error.message);
      throw error;
    }
  }

  /**
   * 格式化字幕内容为文本
   * @private
   * @param {Array} subtitleData - 字幕数据
   * @returns {string} 格式化后的字幕文本
   */
  _formatSubtitleContent(subtitleData) {
    return subtitleData.map(subtitle => {
      const time = formatTime ? formatTime(subtitle.from) : subtitle.from;
      return `[${time}] ${subtitle.content}`;
    }).join('\n\n');
  }

  /**
   * 创建字幕子页面
   * @private
   * @param {string} apiKey - API Key
   * @param {string} parentPageId - 父页面ID
   * @param {string} title - 页面标题
   * @param {string} content - 字幕内容
   * @returns {Promise<string>} 返回创建的子页面ID
   */
  async _createSubtitlePage(apiKey, parentPageId, title, content) {
    // 将内容分块，避免超出单个block的限制
    const maxChunkSize = 2000; // 每块最大2000字符
    const chunks = [];
    
    for (let i = 0; i < content.length; i += maxChunkSize) {
      chunks.push(content.slice(i, i + maxChunkSize));
    }

    // 创建子页面的blocks（不需要额外的标题块，Notion会自动使用properties中的title）
    const children = [];

    // 直接添加字幕内容块
    chunks.forEach(chunk => {
      children.push({
        object: 'block',
        type: 'paragraph',
        paragraph: {
          rich_text: [{
            type: 'text',
            text: { content: chunk }
          }]
        }
      });
    });

    const pageData = {
      parent: { page_id: parentPageId },
      properties: {
        title: {
          title: [{
            type: 'text',
            text: { content: title }
          }]
        }
      },
      children: children.slice(0, 100) // Notion限制最多100个blocks
    };

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: `${API.NOTION_BASE_URL}/pages`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': API.NOTION_VERSION
        },
        data: JSON.stringify(pageData),
        onload: (response) => {
          if (response.status === 200) {
            const data = JSON.parse(response.responseText);
            // 如果还有剩余的块，追加到页面
            if (children.length > 100) {
              this.appendToPage(apiKey, data.id, children.slice(100)).then(() => {
                resolve(data.id);
              });
            } else {
              resolve(data.id);
            }
          } else {
            reject(this._parseNotionError(response));
          }
        },
        onerror: () => {
          reject(new Error('网络错误'));
        }
      });
    });
  }

  /**
   * 更新页面内容
   * @private
   * @param {string} apiKey - API Key
   * @param {string} pageId - 页面ID
   * @param {Array} newChildren - 新的内容块
   * @returns {Promise<void>}
   */
  async _updatePage(apiKey, pageId, newChildren) {
    // 首先获取现有的blocks
    const existingBlocks = await this._getPageBlocks(apiKey, pageId);
    
    // 删除现有的blocks（保留标题）
    for (const block of existingBlocks) {
      if (block.type !== 'child_page') {
        await this._deleteBlock(apiKey, block.id);
      }
    }
    
    // 添加新内容
    await this.appendToPage(apiKey, pageId, newChildren);
  }

  /**
   * 获取页面的blocks
   * @private
   * @param {string} apiKey - API Key
   * @param {string} pageId - 页面ID
   * @returns {Promise<Array>} 返回blocks数组
   */
  async _getPageBlocks(apiKey, pageId) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url: `${API.NOTION_BASE_URL}/blocks/${pageId}/children`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': API.NOTION_VERSION
        },
        onload: (response) => {
          if (response.status === 200) {
            const data = JSON.parse(response.responseText);
            resolve(data.results || []);
          } else {
            resolve([]);
          }
        },
        onerror: () => {
          resolve([]);
        }
      });
    });
  }

  /**
   * 删除block
   * @private
   * @param {string} apiKey - API Key
   * @param {string} blockId - Block ID
   * @returns {Promise<void>}
   */
  async _deleteBlock(apiKey, blockId) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'DELETE',
        url: `${API.NOTION_BASE_URL}/blocks/${blockId}`,
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Notion-Version': API.NOTION_VERSION
        },
        onload: () => {
          resolve();
        },
        onerror: () => {
          resolve();
        }
      });
    });
  }

  /**
   * 解析Notion错误响应
   * @private
   * @param {Object} response - 响应对象
   * @returns {Error}
   */
  _parseNotionError(response) {
    try {
      const error = JSON.parse(response.responseText);
      
      // 特殊处理常见错误
      if (error.code === 'object_not_found' || error.message?.includes('Could not find')) {
        return new Error('找不到指定的Notion页面或数据库，请检查：\n1. ID是否正确\n2. 是否已在Notion中授权该Integration');
      }
      
      return new Error(error.message || '未知错误');
    } catch (e) {
      return new Error(`请求失败: ${response.status}`);
    }
  }
}

// 创建全局单例
export const notionService = new NotionService();
export default notionService;

