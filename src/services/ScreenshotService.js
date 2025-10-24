/**
 * 视频截图服务
 * 负责视频截图的捕获和处理
 */

import state from '../state/StateManager.js';
import notesService from './NotesService.js';
import notionService from './NotionService.js';
import config from '../config/ConfigManager.js';
import notification from '../ui/Notification.js';
import logger from '../utils/DebugLogger.js';
import { formatTime, getVideoTitle, getVideoInfo } from '../utils/helpers.js';

class ScreenshotService {
  constructor() {
    this.isProcessing = false;
  }

  /**
   * 捕获当前视频帧
   * @returns {Promise<{blob: Blob, timestamp: number, timeString: string}>}
   */
  async captureVideoFrame() {
    const video = document.querySelector('video');
    
    if (!video) {
      throw new Error('未找到视频元素');
    }

    if (video.readyState < 2) {
      throw new Error('视频尚未加载');
    }

    try {
      // 计算压缩尺寸（最大宽度800px）
      const maxWidth = 800;
      let width = video.videoWidth;
      let height = video.videoHeight;
      
      if (width > maxWidth) {
        const ratio = maxWidth / width;
        width = maxWidth;
        height = Math.floor(video.videoHeight * ratio);
      }

      // 创建离屏Canvas
      const canvas = new OffscreenCanvas(width, height);
      const ctx = canvas.getContext('2d');

      // 绘制当前帧（缩放）
      ctx.drawImage(video, 0, 0, width, height);

      // 转换为Blob（使用JPEG格式，更小的文件大小）
      const blob = await canvas.convertToBlob({
        type: 'image/jpeg',
        quality: 0.7  // 降低质量以减少文件大小
      });

      const timestamp = video.currentTime;
      const timeString = formatTime(timestamp);

      logger.debug('[Screenshot] 截图成功', {
        originalSize: `${video.videoWidth}x${video.videoHeight}`,
        compressedSize: `${width}x${height}`,
        timestamp: timeString,
        blobSize: `${(blob.size / 1024).toFixed(2)}KB`
      });

      return {
        blob,
        timestamp,
        timeString
      };
    } catch (error) {
      logger.error('[Screenshot] 截图失败:', error);
      throw error;
    }
  }

  /**
   * 截图并保存到笔记
   * @param {boolean} sendToNotion - 是否发送到Notion
   */
  async captureAndSave(sendToNotion = false) {
    if (this.isProcessing) {
      notification.warning('截图处理中，请稍候');
      return;
    }

    this.isProcessing = true;

    try {
      // 1. 捕获视频帧
      const { blob, timestamp, timeString } = await this.captureVideoFrame();

      // 2. 转换为Base64（用于本地笔记）
      const base64 = await this.blobToBase64(blob);

      // 3. 获取视频信息
      const videoInfo = getVideoInfo();
      const videoTitle = getVideoTitle() || '未知视频';
      const videoBvid = videoInfo?.bvid || '';

      // 4. 保存到本地笔记
      const noteContent = `[截图] ${timeString}`;
      const note = notesService.addNote({
        content: noteContent,
        type: 'screenshot',
        videoTimestamp: timestamp, // 视频播放时间（秒）
        timeString,
        imageData: base64,
        videoTitle,
        videoBvid
      });

      notification.success(`截图已保存 (${timeString})`);

      // 4.5 尝试添加到最近的AI总结笔记
      try {
        const allNotes = notesService.getAllNotes();
        const summaryNote = allNotes.find(n => n.type === 'ai-summary');
        
        if (summaryNote && summaryNote.segments && summaryNote.segments.length > 0) {
          notesService.addScreenshotToSummary(summaryNote.id, {
            imageData: base64,
            timeString,
            videoTimestamp: timestamp
          });
          logger.debug('[Screenshot] 截图已添加到AI总结笔记');
        }
      } catch (error) {
        logger.warn('[Screenshot] 添加截图到AI总结失败:', error);
        // 不影响主流程
      }

      // 5. 如果需要发送到Notion
      if (sendToNotion && config.isNotionConfigured()) {
        await this.sendToNotion(blob, timestamp, timeString, videoTitle);
      }

      return note;
    } catch (error) {
      logger.error('[Screenshot] 截图保存失败:', error);
      notification.error(`截图失败: ${error.message}`);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * 发送截图到Notion
   * @param {Blob} blob - 图片Blob
   * @param {number} timestamp - 时间戳
   * @param {string} timeString - 格式化时间
   * @param {string} videoTitle - 视频标题
   */
  async sendToNotion(blob, timestamp, timeString, videoTitle) {
    try {
      const notionConfig = config.getNotionConfig();
      if (!notionConfig || !notionConfig.apiKey || !notionConfig.parentPageId) {
        throw new Error('Notion未配置');
      }

      notification.info('正在上传截图到Notion...');

      logger.info('[Screenshot] 开始发送截图到Notion...');
      
      // 1. 上传图片到Notion（获取file_upload_id）
      const fileUploadId = await this.uploadImageToNotion(blob, notionConfig);
      logger.debug('[Screenshot] 获得 file_upload_id:', fileUploadId);

      // 2. 获取或创建视频对应的Notion页面
      const pageId = await this.getOrCreateNotionPage(videoTitle, notionConfig);
      logger.debug('[Screenshot] 目标页面ID:', pageId);

      // 3. 智能插入截图block到页面（根据时间戳）
      await this.insertScreenshotAtTimestamp(pageId, fileUploadId, timestamp, timeString, notionConfig);
      logger.info('[Screenshot] ✓ 截图已成功发送到Notion');

      notification.success('截图已发送到Notion');
    } catch (error) {
      logger.error('[Screenshot] 发送到Notion失败:', error);
      notification.error(`Notion上传失败: ${error.message}`);
    }
  }

  /**
   * 上传图片到Notion（使用官方文件上传API）
   * 流程：1. 创建上传对象 -> 2. 上传文件内容 -> 3. 返回file_upload_id
   */
  async uploadImageToNotion(blob, notionConfig) {
    logger.debug('[Screenshot] 开始上传图片到Notion，文件大小:', blob.size);
    
    // 检查文件大小（Notion限制5MB）
    if (blob.size > 5 * 1024 * 1024) {
      throw new Error('截图文件超过5MB，Notion不支持');
    }
    
    try {
      // Step 1: 创建文件上传对象
      logger.debug('[Screenshot] Step 1: 创建文件上传对象...');
      const uploadObject = await this._createFileUpload(blob, notionConfig);
      logger.debug('[Screenshot] 获得 file_upload_id:', uploadObject.id);
      
      // Step 2: 上传文件内容
      logger.debug('[Screenshot] Step 2: 上传文件内容...');
      await this._sendFileContent(uploadObject.id, blob, notionConfig);
      logger.debug('[Screenshot] 文件上传成功');
      
      // 返回 file_upload_id（用于Step 3附加到页面）
      return uploadObject.id;
    } catch (error) {
      logger.error('[Screenshot] Notion上传失败:', error);
      throw error;
    }
  }

  /**
   * Step 1: 创建文件上传对象
   */
  async _createFileUpload(blob, notionConfig) {
    const url = 'https://api.notion.com/v1/file_uploads';
    const data = {
      filename: `screenshot_${Date.now()}.jpg`,
      content_type: blob.type || 'image/jpeg'
    };

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url,
        headers: {
          'Authorization': `Bearer ${notionConfig.apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        data: JSON.stringify(data),
        timeout: 30000,
        onload: (response) => {
          logger.debug('[Screenshot] 创建上传对象响应:', response.status);
          if (response.status === 200) {
            const result = JSON.parse(response.responseText);
            logger.debug('[Screenshot] 上传对象详情:', result);
            resolve(result);
          } else {
            logger.error('[Screenshot] 创建上传对象失败:', response.responseText);
            reject(new Error(`创建上传对象失败: ${response.status}`));
          }
        },
        onerror: (error) => {
          logger.error('[Screenshot] 创建上传对象网络错误:', error);
          reject(error);
        },
        ontimeout: () => reject(new Error('创建上传对象超时'))
      });
    });
  }

  /**
   * Step 2: 上传文件内容（multipart/form-data）
   */
  async _sendFileContent(fileUploadId, blob, notionConfig) {
    const url = `https://api.notion.com/v1/file_uploads/${fileUploadId}/send`;
    
    // 创建 FormData
    const formData = new FormData();
    formData.append('file', blob, `screenshot_${Date.now()}.jpg`);

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url,
        headers: {
          'Authorization': `Bearer ${notionConfig.apiKey}`,
          'Notion-Version': '2022-06-28'
          // 注意：不要手动设置 Content-Type，FormData会自动设置包含boundary
        },
        data: formData,
        timeout: 60000, // 上传可能较慢，设置60秒超时
        onload: (response) => {
          logger.debug('[Screenshot] 上传文件响应:', response.status);
          if (response.status === 200) {
            const result = JSON.parse(response.responseText);
            logger.debug('[Screenshot] 文件上传完成:', result);
            resolve(result);
          } else {
            logger.error('[Screenshot] 上传文件失败:', response.responseText);
            reject(new Error(`上传文件失败: ${response.status}`));
          }
        },
        onerror: (error) => {
          logger.error('[Screenshot] 上传文件网络错误:', error);
          reject(error);
        },
        ontimeout: () => reject(new Error('上传文件超时'))
      });
    });
  }

  /**
   * 获取或创建Notion页面
   * @param {string} videoTitle - 视频标题
   * @param {Object} notionConfig - Notion配置
   * @returns {Promise<string>} 页面ID
   */
  async getOrCreateNotionPage(videoTitle, notionConfig) {
    const videoInfo = state.getVideoInfo();
    const bvid = videoInfo?.bvid;

    if (!bvid) {
      throw new Error('无效的视频信息');
    }

    // 1. 先从状态中获取页面ID
    let pageId = state.getNotionPageId(bvid);
    
    if (pageId) {
      logger.debug('[Screenshot] 使用缓存的Notion页面ID:', pageId);
      return pageId;
    }

    // 2. 如果没有缓存，查询数据库
    const databaseId = notionConfig.databaseId || notionConfig.parentPageId;
    
    if (databaseId) {
      try {
        pageId = await notionService.queryVideoPage(notionConfig.apiKey, databaseId, bvid);
        
        if (pageId) {
          logger.debug('[Screenshot] 从Notion数据库找到页面:', pageId);
          // 缓存找到的页面ID
          state.setNotionPageId(bvid, pageId);
          return pageId;
        }
      } catch (error) {
        logger.error('[Screenshot] 查询Notion页面失败:', error);
      }
    }

    // 3. 如果没有找到页面，需要先发送字幕创建页面
    throw new Error('请先发送字幕和AI总结到Notion，以创建视频页面');
  }

  /**
   * Step 3: 根据时间戳智能插入截图到Notion页面
   * @param {string} pageId - 页面ID
   * @param {string} fileUploadId - 文件上传ID
   * @param {number} timestamp - 截图时间戳（秒）
   * @param {string} timeString - 时间戳字符串（格式化）
   * @param {Object} notionConfig - Notion配置
   */
  async insertScreenshotAtTimestamp(pageId, fileUploadId, timestamp, timeString, notionConfig) {
    logger.info('[Screenshot] ========== 开始智能插入截图 ==========');
    logger.info('[Screenshot] 截图时间戳:', timeString, '(', timestamp, '秒)');
    logger.debug('[Screenshot] 目标页面ID:', pageId);
    logger.debug('[Screenshot] 图片上传ID:', fileUploadId);
    
    try {
      // 1. 获取页面的所有blocks
      logger.debug('[Screenshot] Step 1: 获取页面blocks');
      const blocks = await notionService.getPageBlocks(notionConfig.apiKey, pageId);
      logger.info('[Screenshot] 页面共有', blocks.length, '个blocks');
      
      // 2. 找到“⏱️ 时间戳段落”标题的位置
      logger.debug('[Screenshot] Step 2: 查找时间戳段落标题');
      let segmentsStartIndex = -1;
      for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];
        const blockType = block.type;
        const content = block[blockType]?.rich_text?.[0]?.text?.content || '';
        
        logger.debug(`[Screenshot]   Block ${i}: type=${blockType}, content="${content.substring(0, 50)}..."`);
        
        if ((blockType === 'heading_2' || blockType === 'heading_3') && 
            content.includes('⏱️ 时间戳段落')) {
          segmentsStartIndex = i;
          logger.info('[Screenshot] ✓ 找到时间戳段落标题，位置:', i);
          break;
        }
      }
      
      if (segmentsStartIndex === -1) {
        logger.warn('[Screenshot] ✗ 未找到时间戳段落，追加到页面末尾');
        return await this.appendScreenshotToEnd(pageId, fileUploadId, timeString, notionConfig);
      }
      
      // 3. 解析时间戳段落，找到合适的toggle block
      logger.debug('[Screenshot] Step 3: 解析每个段落的时间戳');
      let targetToggleId = null;
      let targetToggleTime = null;
      let bestMatchTimestamp = -1;
      
      for (let i = segmentsStartIndex + 1; i < blocks.length; i++) {
        const block = blocks[i];
        const blockType = block.type;
        
        // 如果遇到下一个大标题，说明时间戳段落结束了
        if (blockType === 'heading_2') {
          logger.debug(`[Screenshot]   Block ${i}: 遇到heading_2，段落区域结束`);
          break;
        }
        
        // 查找toggle block（新的段落格式）
        if (blockType === 'toggle') {
          const text = block.toggle?.rich_text?.[0]?.text?.content || '';
          logger.debug(`[Screenshot]   Block ${i}: type=toggle, content="${text}"`);
          
          const timeMatch = text.match(/\[?(\d{1,2}):(\d{2})\]?/);
          
          if (timeMatch) {
            const minutes = parseInt(timeMatch[1], 10);
            const seconds = parseInt(timeMatch[2], 10);
            const blockTimestamp = minutes * 60 + seconds;
            
            logger.info(`[Screenshot]   → 解析时间戳: ${timeMatch[0]} = ${blockTimestamp}秒`);
            logger.debug(`[Screenshot]   比较: blockTimestamp(${blockTimestamp}) vs screenshot(${timestamp})`);
            
            // 找到截图时间戳应该属于的段落
            // 选择最接近且不大于截图时间的段落
            if (blockTimestamp <= timestamp && blockTimestamp > bestMatchTimestamp) {
              targetToggleId = block.id;
              targetToggleTime = timeMatch[0];
              bestMatchTimestamp = blockTimestamp;
              logger.info(`[Screenshot]   ✓ 更新最佳匹配: ${timeMatch[0]} (block ${i}, id: ${block.id})`);
            } else if (blockTimestamp > timestamp) {
              // 已经超过截图时间，停止搜索
              logger.debug(`[Screenshot]   → 超过截图时间，停止搜索`);
              break;
            }
          } else {
            logger.debug(`[Screenshot]   → 未toggle但无法解析时间戳`);
          }
        }
        
        // 兼容旧格式: bulleted_list_item
        if (blockType === 'bulleted_list_item') {
          const text = block.bulleted_list_item?.rich_text?.[0]?.text?.content || '';
          logger.debug(`[Screenshot]   Block ${i}: type=bulleted_list_item, content="${text}"`);
          
          const timeMatch = text.match(/\[?(\d{1,2}):(\d{2})\]?/);
          
          if (timeMatch) {
            const minutes = parseInt(timeMatch[1], 10);
            const seconds = parseInt(timeMatch[2], 10);
            const blockTimestamp = minutes * 60 + seconds;
            
            logger.info(`[Screenshot]   → 解析时间戳: ${timeMatch[0]} = ${blockTimestamp}秒`);
            
            if (blockTimestamp <= timestamp && blockTimestamp > bestMatchTimestamp) {
              targetToggleId = block.id;
              targetToggleTime = timeMatch[0];
              bestMatchTimestamp = blockTimestamp;
              logger.info(`[Screenshot]   ✓ 更新最佳匹配: ${timeMatch[0]} (list item)`);
            } else if (blockTimestamp > timestamp) {
              break;
            }
          }
        }
      }
      
      // 4. 构建截图blocks
      logger.debug('[Screenshot] Step 4: 构建截图blocks');
      const screenshotBlocks = [
        {
          object: 'block',
          type: 'paragraph',
          paragraph: {
            rich_text: [
              {
                type: 'text',
                text: { content: `📸 ${timeString}` },
                annotations: { color: 'gray' }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'image',
          image: {
            type: 'file_upload',
            file_upload: {
              id: fileUploadId
            }
          }
        }
      ];
      
      // 5. 插入截图到对应的toggle block下
      if (targetToggleId) {
        logger.info('[Screenshot] ========================================');
        logger.info('[Screenshot] ✓ 找到最佳匹配段落:', targetToggleTime);
        logger.info('[Screenshot] ✓ 目标toggle ID:', targetToggleId);
        logger.info('[Screenshot] ✓ 准备插入截图作为children');
        logger.info('[Screenshot] ========================================');
        
        await this.insertBlocksAsChildren(targetToggleId, screenshotBlocks, notionConfig);
        logger.info('[Screenshot] ✓✓✓ 截图插入成功!');
      } else {
        logger.warn('[Screenshot] ✗ 未找到合适的时间戳段落');
        logger.warn('[Screenshot] → 将截图追加到页面末尾');
        await this.appendScreenshotToEnd(pageId, fileUploadId, timeString, notionConfig);
      }
      
    } catch (error) {
      logger.error('[Screenshot] 智能插入失败，降级为追加到末尾:', error);
      await this.appendScreenshotToEnd(pageId, fileUploadId, timeString, notionConfig);
    }
  }
  
  /**
   * 将blocks作为指定block的children插入
   * @param {string} parentBlockId - 父block ID（如list item）
   * @param {Array} blocks - 要插入的blocks
   * @param {Object} notionConfig - Notion配置
   */
  async insertBlocksAsChildren(parentBlockId, blocks, notionConfig) {
    logger.debug('[Screenshot] ========== insertBlocksAsChildren ==========');
    logger.debug('[Screenshot] 父级block ID:', parentBlockId);
    logger.debug('[Screenshot] 待插入blocks数量:', blocks.length);
    logger.debug('[Screenshot] Blocks详情:', JSON.stringify(blocks, null, 2));
    
    const url = `https://api.notion.com/v1/blocks/${parentBlockId}/children`;
    
    return new Promise((resolve, reject) => {
      const payload = { children: blocks };
      logger.debug('[Screenshot] API请求URL:', url);
      logger.debug('[Screenshot] API请求payload:', JSON.stringify(payload, null, 2));
      
      GM_xmlhttpRequest({
        method: 'PATCH',
        url,
        headers: {
          'Authorization': `Bearer ${notionConfig.apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        data: JSON.stringify(payload),
        timeout: 30000,
        onload: (response) => {
          logger.info('[Screenshot] API响应状态:', response.status);
          if (response.status === 200) {
            logger.info('[Screenshot] ✓ 截图已成功插入为children');
            logger.debug('[Screenshot] 响应内容:', response.responseText.substring(0, 200) + '...');
            resolve(JSON.parse(response.responseText));
          } else {
            logger.error('[Screenshot] ✗ 插入失败，状态码:', response.status);
            logger.error('[Screenshot] 错误响应:', response.responseText);
            reject(new Error(`插入失败: ${response.status}`));
          }
        },
        onerror: (error) => {
          logger.error('[Screenshot] ✗ 网络请求错误:', error);
          reject(error);
        },
        ontimeout: () => {
          logger.error('[Screenshot] ✗ 请求超时');
          reject(new Error('请求超时'));
        }
      });
    });
  }
  
  /**
   * 追加截图到页面末尾（降级方案）
   */
  async appendScreenshotToEnd(pageId, fileUploadId, timeString, notionConfig) {
    logger.debug('[Screenshot] 追加截图到页面末尾');
    const url = `https://api.notion.com/v1/blocks/${pageId}/children`;

    const data = {
      children: [
        {
          object: 'block',
          type: 'heading_3',
          heading_3: {
            rich_text: [
              {
                type: 'text',
                text: { content: `📸 截图 - ${timeString}` }
              }
            ]
          }
        },
        {
          object: 'block',
          type: 'image',
          image: {
            type: 'file_upload',
            file_upload: {
              id: fileUploadId
            }
          }
        }
      ]
    };

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'PATCH',
        url,
        headers: {
          'Authorization': `Bearer ${notionConfig.apiKey}`,
          'Content-Type': 'application/json',
          'Notion-Version': '2022-06-28'
        },
        data: JSON.stringify(data),
        timeout: 30000,
        onload: (response) => {
          if (response.status === 200) {
            resolve(JSON.parse(response.responseText));
          } else {
            reject(new Error(`追加截图失败: ${response.status}`));
          }
        },
        onerror: (error) => reject(error),
        ontimeout: () => reject(new Error('请求超时'))
      });
    });
  }

  /**
   * Blob转Base64
   */
  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * 下载截图
   */
  async downloadScreenshot() {
    try {
      const { blob, timeString } = await this.captureVideoFrame();
      const videoInfo = state.getVideoInfo();
      const videoTitle = videoInfo?.title || 'video';
      
      // 清理文件名
      const safeTitle = videoTitle.replace(/[<>:"/\\|?*]/g, '_');
      const filename = `${safeTitle}_${timeString.replace(/:/g, '-')}.png`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      notification.success('截图已下载');
    } catch (error) {
      logger.error('[Screenshot] 下载失败:', error);
      notification.error(`下载失败: ${error.message}`);
    }
  }
}

// 创建全局单例
export const screenshotService = new ScreenshotService();
export default screenshotService;
