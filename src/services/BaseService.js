/**
 * 基础服务类
 * 提供通用的HTTP请求、错误处理和重试机制
 */

import logger from '../utils/DebugLogger.js';
import { withTimeout } from '../utils/helpers.js';

export class BaseService {
  constructor(serviceName) {
    this.serviceName = serviceName;
    this.defaultTimeout = 30000;
    this.maxRetries = 3;
  }

  /**
   * 通用的GM_xmlhttpRequest封装
   * @param {Object} options - 请求配置
   * @returns {Promise}
   */
  async request(options) {
    const { 
      url, 
      method = 'GET', 
      headers = {}, 
      data = null, 
      timeout = this.defaultTimeout,
      retry = true,
      retryCount = 0
    } = options;

    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method,
        url,
        headers,
        data: data ? JSON.stringify(data) : undefined,
        timeout,
        onload: (response) => {
          this.handleResponse(response, resolve, reject, options, retry, retryCount);
        },
        onerror: (error) => {
          this.handleError(error, reject, options, retry, retryCount);
        },
        ontimeout: () => {
          this.handleTimeout(reject, options, retry, retryCount);
        }
      });
    });
  }

  /**
   * 处理响应
   * @private
   */
  handleResponse(response, resolve, reject, options, retry, retryCount) {
    const { parseJson = true, validateStatus = (status) => status >= 200 && status < 300 } = options;

    if (!validateStatus(response.status)) {
      const error = new Error(`HTTP ${response.status}: ${response.statusText}`);
      error.status = response.status;
      error.response = response;
      
      if (retry && this.shouldRetry(response.status, retryCount)) {
        return this.retryRequest(options, retryCount + 1).then(resolve).catch(reject);
      }
      
      reject(error);
      return;
    }

    try {
      const result = parseJson ? JSON.parse(response.responseText) : response.responseText;
      resolve(result);
    } catch (error) {
      logger.error(this.serviceName, 'Response parsing failed:', error);
      reject(new Error('Failed to parse response'));
    }
  }

  /**
   * 处理错误
   * @private
   */
  handleError(error, reject, options, retry, retryCount) {
    logger.error(this.serviceName, 'Request failed:', error);
    
    if (retry && retryCount < this.maxRetries) {
      return this.retryRequest(options, retryCount + 1).catch(reject);
    }
    
    reject(error);
  }

  /**
   * 处理超时
   * @private
   */
  handleTimeout(reject, options, retry, retryCount) {
    logger.error(this.serviceName, 'Request timeout');
    
    if (retry && retryCount < this.maxRetries) {
      return this.retryRequest(options, retryCount + 1).catch(reject);
    }
    
    reject(new Error('Request timeout'));
  }

  /**
   * 判断是否应该重试
   * @private
   */
  shouldRetry(status, retryCount) {
    // 不重试客户端错误（4xx），但重试服务器错误（5xx）和网络错误
    return retryCount < this.maxRetries && (status >= 500 || status === 0);
  }

  /**
   * 重试请求
   * @private
   */
  async retryRequest(options, retryCount) {
    const delay = Math.min(1000 * Math.pow(2, retryCount), 10000); // 指数退避
    logger.info(this.serviceName, `Retrying request (attempt ${retryCount + 1}/${this.maxRetries}) after ${delay}ms`);
    
    await new Promise(resolve => setTimeout(resolve, delay));
    return this.request({ ...options, retryCount });
  }

  /**
   * Fetch API 包装（用于支持流式响应）
   * @param {string} url
   * @param {Object} options
   * @returns {Promise<Response>}
   */
  async fetch(url, options = {}) {
    const { timeout = this.defaultTimeout, ...fetchOptions } = options;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, {
        ...fetchOptions,
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      throw error;
    }
  }

  /**
   * 执行带超时的异步操作
   * @param {Promise} promise
   * @param {number} timeout
   * @param {string} errorMessage
   * @returns {Promise}
   */
  async withTimeout(promise, timeout, errorMessage) {
    return withTimeout(promise, timeout || this.defaultTimeout, errorMessage);
  }
}

export default BaseService;
