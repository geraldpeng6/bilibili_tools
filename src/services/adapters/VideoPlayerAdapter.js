/**
 * 视频播放器适配器基类
 * 为不同视频平台提供统一的接口
 */
export default class VideoPlayerAdapter {
  constructor() {
    this.platform = 'unknown';
    this.video = null;
    this.progressBar = null;
  }

  /**
   * 检测当前页面是否为视频页面
   * @returns {boolean}
   */
  isVideoPage() {
    throw new Error('子类必须实现isVideoPage方法');
  }

  /**
   * 获取视频ID
   * @returns {string|null}
   */
  getVideoId() {
    throw new Error('子类必须实现getVideoId方法');
  }

  /**
   * 获取视频元素
   * @returns {HTMLVideoElement|null}
   */
  getVideoElement() {
    throw new Error('子类必须实现getVideoElement方法');
  }

  /**
   * 获取进度条容器
   * @returns {HTMLElement|null}
   */
  getProgressBar() {
    throw new Error('子类必须实现getProgressBar方法');
  }

  /**
   * 获取广告进度条元素
   * @returns {HTMLElement|null}
   */
  getAdProgressBar() {
    throw new Error('子类必须实现getAdProgressBar方法');
  }

  /**
   * 获取播放器容器
   * @returns {HTMLElement|null}
   */
  getPlayerContainer() {
    throw new Error('子类必须实现getPlayerContainer方法');
  }

  /**
   * 等待视频元素加载
   * @returns {Promise<HTMLVideoElement>}
   */
  async waitForVideo() {
    return new Promise((resolve) => {
      const check = () => {
        const video = this.getVideoElement();
        if (video) {
          this.video = video;
          resolve(video);
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }

  /**
   * 等待进度条加载
   * @returns {Promise<HTMLElement>}
   */
  async waitForProgressBar() {
    return new Promise((resolve) => {
      const check = () => {
        const progressBar = this.getProgressBar();
        if (progressBar) {
          this.progressBar = progressBar;
          resolve(progressBar);
        } else {
          setTimeout(check, 500);
        }
      };
      check();
    });
  }

  /**
   * 跳转到指定时间
   * @param {number} time - 秒数
   */
  seekTo(time) {
    if (this.video) {
      this.video.currentTime = time;
    }
  }

  /**
   * 获取当前播放时间
   * @returns {number}
   */
  getCurrentTime() {
    return this.video ? this.video.currentTime : 0;
  }

  /**
   * 获取视频总时长
   * @returns {number}
   */
  getDuration() {
    return this.video ? this.video.duration : 0;
  }

  /**
   * 检查是否正在播放
   * @returns {boolean}
   */
  isPlaying() {
    return this.video && !this.video.paused;
  }

  /**
   * 在播放器上显示提示
   * @param {string} message
   * @param {object} options
   */
  showNotification(message, options = {}) {
    throw new Error('子类必须实现showNotification方法');
  }

  /**
   * 在进度条上添加标记
   * @param {Array} segments
   */
  addProgressMarkers(segments) {
    throw new Error('子类必须实现addProgressMarkers方法');
  }

  /**
   * 清理资源
   */
  destroy() {
    this.video = null;
    this.progressBar = null;
  }
}
