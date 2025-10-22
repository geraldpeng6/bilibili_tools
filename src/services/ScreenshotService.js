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

      // 1. 先将图片上传到Notion（通过创建临时页面）
      const imageUrl = await this.uploadImageToNotion(blob, notionConfig);

      // 2. 获取或创建视频对应的Notion页面
      const pageId = await this.getOrCreateNotionPage(videoTitle, notionConfig);

      // 3. 追加截图block到页面
      await this.appendScreenshotBlock(pageId, imageUrl, timeString, notionConfig);

      notification.success('截图已发送到Notion');
    } catch (error) {
      logger.error('[Screenshot] 发送到Notion失败:', error);
      notification.error(`Notion上传失败: ${error.message}`);
    }
  }

  /**
   * 上传图片到Notion（通过external URL或文件上传）
   * 注意：Notion API不直接支持图片上传，需要使用外部URL
   * 这里使用临时方案：将图片转为data URL
   */
  async uploadImageToNotion(blob, notionConfig) {
    // Notion API要求图片必须是可访问的URL
    // 由于我们是油猴脚本，无法直接上传文件
    // 解决方案：使用临时图床服务或data URL（有大小限制）
    
    // 方案1：转为base64 data URL（适用于小图片）
    const base64 = await this.blobToBase64(blob);
    
    // 如果图片太大，给出提示
    if (blob.size > 1024 * 1024) { // 大于1MB
      notification.warning('截图较大，Notion展示可能受限');
    }

    return base64;
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
   * 追加截图block到Notion页面
   */
  async appendScreenshotBlock(pageId, imageUrl, timeString, notionConfig) {
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
            type: 'external',
            external: { url: imageUrl }
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
            reject(new Error(`Notion API错误: ${response.status}`));
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
