/**
 * Notion服务模块
 * 处理Notion集成相关的所有逻辑，使用Promise替代回调地狱
 */

import config from '../config/ConfigManager.js';
import state from '../state/StateManager.js';
import eventBus from '../utils/EventBus.js';
import { EVENTS, API, LIMITS } from '../constants.js';
import { getVideoTitle, getVideoUrl, getVideoCreator } from '../utils/helpers.js';

class NotionService {
  /**
   * 发送字幕到Notion
   * @param {Array} subtitleData - 字幕数据
   * @param {boolean} isAuto - 是否自动发送
   * @returns {Promise<void>}
   */
  async sendSubtitle(subtitleData, isAuto = false) {
    const notionConfig = config.getNotionConfig();

    if (!notionConfig.apiKey) {
      throw new Error('请先配置 Notion API Key');
    }

    if (!subtitleData || subtitleData.length === 0) {
      throw new Error('没有字幕数据可发送');
    }

    state.notion.isSending = true;
    eventBus.emit(EVENTS.NOTION_SEND_START);

    try {
      const videoInfo = state.getVideoInfo();
      const videoTitle = getVideoTitle();
      const videoUrl = getVideoUrl();
      const creator = getVideoCreator();

      // 构建页面内容
      const pageChildren = this._buildPageContent(videoInfo, videoTitle, videoUrl, subtitleData);

      // 根据配置决定使用数据库ID还是页面ID
      let databaseId = notionConfig.databaseId;

      if (!databaseId) {
        // 首次使用，尝试识别是Database ID还是Page ID
        if (!notionConfig.parentPageId) {
          throw new Error('请先配置目标位置（Page ID 或 Database ID）');
        }

        // 尝试作为Database ID使用
        databaseId = notionConfig.parentPageId;
      }

      // 获取数据库结构并填充数据
      const schema = await this._getDatabaseSchema(notionConfig.apiKey, databaseId);
      const properties = this._buildProperties(schema, videoInfo, videoTitle, videoUrl, creator, subtitleData);

      // 创建页面
      const pageId = await this._createPage(notionConfig.apiKey, databaseId, properties, pageChildren);
      
      // 存储页面ID到状态，供截图功能使用
      if (pageId) {
        state.setNotionPageId(videoInfo.bvid, pageId);
      }

      // 保存database ID（如果是首次使用）
      if (!notionConfig.databaseId) {
        config.saveNotionConfig({ databaseId });
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
   * 追加内容到现有Notion页面
   * @param {string} apiKey - API Key
   * @param {string} pageId - 页面ID
   * @param {Array} blocks - 要追加的blocks
   * @returns {Promise<void>}
   */
  async appendToPage(apiKey, pageId, blocks) {
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
   * 发送AI总结到Notion
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
      throw new Error('请先发送字幕到Notion以创建视频页面');
    }

    // 构建AI总结blocks
    const blocks = this._buildAISummaryBlocks(summary);
    
    // 追加到页面
    await this.appendToPage(notionConfig.apiKey, pageId, blocks);
  }

  /**
   * 构建AI总结blocks
   * @private
   * @param {Object} summary - AI总结数据
   * @returns {Array} blocks数组
   */
  _buildAISummaryBlocks(summary) {
    const blocks = [];

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
        rich_text: [{ type: 'text', text: { content: '🤖 AI总结' } }]
      }
    });

    // 添加Markdown总结
    if (summary.markdown) {
      // 将markdown内容转换为Notion blocks
      const markdownLines = summary.markdown.split('\n');
      markdownLines.forEach(line => {
        if (line.trim()) {
          blocks.push({
            object: 'block',
            type: 'paragraph',
            paragraph: {
              rich_text: [{ type: 'text', text: { content: line } }]
            }
          });
        }
      });
    }

    // 添加时间戳段落
    if (summary.segments && summary.segments.length > 0) {
      blocks.push({
        object: 'block',
        type: 'heading_3',
        heading_3: {
          rich_text: [{ type: 'text', text: { content: '⏱️ 时间戳段落' } }]
        }
      });

      summary.segments.forEach(segment => {
        blocks.push({
          object: 'block',
          type: 'bulleted_list_item',
          bulleted_list_item: {
            rich_text: [
              { type: 'text', text: { content: `${segment.timestamp} - ${segment.title}: ${segment.summary || ''}` } }
            ]
          }
        });
      });
    }

    return blocks;
  }

  /**
   * 构建页面内容
   * @private
   * @param {Object} videoInfo - 视频信息
   * @param {string} videoTitle - 视频标题
   * @param {string} videoUrl - 视频URL
   * @param {Array} subtitleData - 字幕数据
   * @returns {Array}
   */
  _buildPageContent(videoInfo, videoTitle, videoUrl, subtitleData) {
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
      },
      {
        object: 'block',
        type: 'heading_2',
        heading_2: {
          rich_text: [{ type: 'text', text: { content: '📝 字幕内容' } }]
        }
      }
    ];

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

    return children;
  }

  /**
   * 构建数据库属性
   * @private
   * @param {Object} schema - 数据库结构
   * @param {Object} videoInfo - 视频信息
   * @param {string} videoTitle - 视频标题
   * @param {string} videoUrl - 视频URL
   * @param {string} creator - 创作者
   * @param {Array} subtitleData - 字幕数据
   * @returns {Object}
   */
  _buildProperties(schema, videoInfo, videoTitle, videoUrl, creator, subtitleData) {
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
          rich_text: [{ text: { content: videoInfo.bvid || '' } }]
        };
      }

      // 创作者字段
      if ((lowerFieldName.includes('创作') || lowerFieldName.includes('作者') || 
           lowerFieldName.includes('creator') || lowerFieldName.includes('up主')) &&
          (fieldType === 'rich_text' || fieldType === 'text')) {
        properties[fieldName] = {
          rich_text: [{ text: { content: creator } }]
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
            rich_text: [{ text: { content: hasSummary ? '已总结' : '未总结' } }]
          };
        }
      }

      // 总结字段
      if (lowerFieldName === '总结' || lowerFieldName === 'summary') {
        const videoKey = state.getVideoKey();
        const summary = videoKey ? state.getAISummary(videoKey) : null;
        
        if (fieldType === 'rich_text' && summary) {
          // summary可能是对象或字符串，需要处理两种情况
          let summaryText = '';
          if (typeof summary === 'string') {
            summaryText = summary;
          } else if (summary && summary.markdown) {
            summaryText = summary.markdown;
          }
          
          if (summaryText) {
            properties[fieldName] = {
              rich_text: [{ text: { content: summaryText.substring(0, LIMITS.NOTION_TEXT_MAX) } }]
            };
          }
        }
      }
    });

    return properties;
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

