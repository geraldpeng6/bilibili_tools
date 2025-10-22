/**
 * 请求工厂
 * 统一管理不同类型的API请求配置
 */

export class RequestFactory {
  /**
   * 创建B站API请求配置
   * @param {string} endpoint
   * @param {Object} params
   * @returns {Object}
   */
  static createBilibiliRequest(endpoint, params = {}) {
    const baseUrl = 'https://api.bilibili.com';
    const headers = {
      'Accept': 'application/json',
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Cache-Control': 'no-cache',
      'Origin': 'https://www.bilibili.com',
      'Referer': window.location.href,
      'User-Agent': navigator.userAgent
    };

    return {
      url: `${baseUrl}${endpoint}`,
      headers,
      params,
      validateStatus: (status) => status === 200,
      parseJson: true
    };
  }

  /**
   * 创建字幕请求配置
   * @param {string} url
   * @param {Object} videoInfo
   * @returns {Object}
   */
  static createSubtitleRequest(url, videoInfo) {
    return {
      url,
      headers: {
        'Accept': 'application/json, text/plain, */*',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
        'Origin': 'https://www.bilibili.com',
        'Referer': `https://www.bilibili.com/video/${videoInfo.bvid}/`,
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'cross-site',
        'User-Agent': navigator.userAgent
      },
      validateStatus: (status) => status === 200,
      parseJson: true,
      retry: true
    };
  }

  /**
   * 创建AI请求配置
   * @param {Object} aiConfig
   * @param {string} prompt
   * @param {string} content
   * @param {boolean} stream
   * @returns {Object}
   */
  static createAIRequest(aiConfig, prompt, content, stream = false) {
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${aiConfig.apiKey}`
    };

    // OpenRouter特殊处理
    if (aiConfig.isOpenRouter) {
      headers['HTTP-Referer'] = window.location.origin;
      headers['X-Title'] = 'Bilibili Subtitle Assistant';
    }

    const body = {
      model: aiConfig.model,
      messages: [
        {
          role: 'user',
          content: prompt + content
        }
      ],
      stream,
      temperature: aiConfig.temperature || 0.7,
      max_tokens: aiConfig.maxTokens || 4000
    };

    return {
      url: aiConfig.url,
      method: 'POST',
      headers,
      body,
      stream
    };
  }

  /**
   * 创建Notion请求配置
   * @param {string} endpoint
   * @param {string} apiKey
   * @param {Object} data
   * @returns {Object}
   */
  static createNotionRequest(endpoint, apiKey, data = null) {
    const baseUrl = 'https://api.notion.com/v1';
    
    return {
      url: `${baseUrl}${endpoint}`,
      method: data ? 'POST' : 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Notion-Version': '2022-06-28'
      },
      data,
      validateStatus: (status) => status >= 200 && status < 300,
      parseJson: true
    };
  }

  /**
   * 创建SponsorBlock请求配置
   * @param {string} videoId
   * @returns {Object}
   */
  static createSponsorBlockRequest(videoId) {
    return {
      url: `https://sponsor.ajay.app/api/skipSegments`,
      params: { videoID: videoId },
      headers: {
        'origin': 'userscript-bilibili-sponsor-skip',
        'x-ext-version': '1.0.0'
      },
      timeout: 5000,
      validateStatus: (status) => status === 200 || status === 404,
      parseJson: true,
      retry: true
    };
  }

  /**
   * 创建通用GET请求配置
   * @param {string} url
   * @param {Object} headers
   * @returns {Object}
   */
  static createGetRequest(url, headers = {}) {
    return {
      url,
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        ...headers
      },
      parseJson: true
    };
  }

  /**
   * 创建通用POST请求配置
   * @param {string} url
   * @param {Object} data
   * @param {Object} headers
   * @returns {Object}
   */
  static createPostRequest(url, data, headers = {}) {
    return {
      url,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...headers
      },
      data,
      parseJson: true
    };
  }

  /**
   * 创建文件下载请求配置
   * @param {string} url
   * @param {string} filename
   * @returns {Object}
   */
  static createDownloadRequest(url, filename) {
    return {
      url,
      method: 'GET',
      responseType: 'blob',
      headers: {
        'Accept': '*/*'
      },
      onSuccess: (blob) => {
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);
      }
    };
  }
}

export default RequestFactory;
