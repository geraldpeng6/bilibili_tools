/**
 * 使用帮助模态框模块
 * 显示工具的使用说明和快捷键
 */

import modalManager from '../utils/ModalManager.js';

class HelpModal {
  constructor() {
    this.modal = null;
  }

  /**
   * 创建帮助模态框
   */
  createModal() {
    if (this.modal) {
      return this.modal;
    }

    this.modal = document.createElement('div');
    this.modal.id = 'help-modal';
    this.modal.className = 'config-modal';
    
    document.body.appendChild(this.modal);
    return this.modal;
  }

  /**
   * 显示模态框
   */
  show() {
    const modal = this.createModal();
    this.renderModal();
    modal.classList.add('show');
    
    // 注册到模态框管理器（统一处理ESC键）
    modalManager.push(this);
  }

  /**
   * 隐藏模态框
   */
  hide() {
    if (this.modal) {
      this.modal.classList.remove('show');
    }
    
    // 从模态框管理器移除
    modalManager.pop(this);
  }

  /**
   * 渲染模态框内容
   */
  renderModal() {
    this.modal.innerHTML = `
      <div class="config-modal-content">
        <div class="config-modal-header">
          <span>使用帮助</span>
        </div>
        <div class="config-modal-body">
          <div style="margin-bottom: 20px;">
            <h3 style="color: #fff; margin-bottom: 10px; font-size: 16px;">功能特性</h3>
            <ul style="line-height: 1.8; color: #e5e7eb;">
              <li><strong>字幕提取</strong> - 自动检测并提取B站AI字幕和人工字幕</li>
              <li><strong>AI智能总结</strong> - 支持OpenAI、OpenRouter等多种AI服务</li>
              <li><strong>Notion集成</strong> - 一键发送字幕和总结到Notion数据库</li>
              <li><strong>笔记保存</strong> - 选中任意文字显示粉色钢笔图标保存笔记</li>
              <li><strong>播放速度控制</strong> - 键盘快捷键控制速度和响度检测自动加速</li>
            </ul>
          </div>

          <div style="margin-bottom: 20px;">
            <h3 style="color: #fff; margin-bottom: 10px; font-size: 16px;">快捷键</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
              <thead>
                <tr style="background: rgba(255, 255, 255, 0.1); border-bottom: 1px solid rgba(254, 235, 234, 0.2);">
                  <th style="padding: 8px; text-align: left; font-weight: 600; color: #fff;">功能</th>
                  <th style="padding: 8px; text-align: left; font-weight: 600; color: #fff;">快捷键</th>
                  <th style="padding: 8px; text-align: left; font-weight: 600; color: #fff;">说明</th>
                </tr>
              </thead>
              <tbody>
                <tr style="border-bottom: 1px solid rgba(254, 235, 234, 0.1);">
                  <td style="padding: 8px; color: #e5e7eb;">切换字幕面板</td>
                  <td style="padding: 8px;"><code style="background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 3px; color: #feebea;">Cmd/Ctrl + B</code></td>
                  <td style="padding: 8px; color: rgba(255, 255, 255, 0.7);">显示/隐藏字幕面板</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(254, 235, 234, 0.1);">
                  <td style="padding: 8px; color: #e5e7eb;">增加速度</td>
                  <td style="padding: 8px;"><code style="background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 3px; color: #feebea;">.</code></td>
                  <td style="padding: 8px; color: rgba(255, 255, 255, 0.7);">每次增加0.1x</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(254, 235, 234, 0.1);">
                  <td style="padding: 8px; color: #e5e7eb;">减少速度</td>
                  <td style="padding: 8px;"><code style="background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 3px; color: #feebea;">,</code></td>
                  <td style="padding: 8px; color: rgba(255, 255, 255, 0.7);">每次减少0.1x</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(254, 235, 234, 0.1);">
                  <td style="padding: 8px; color: #e5e7eb;">2倍速</td>
                  <td style="padding: 8px;"><code style="background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 3px; color: #feebea;">.. (双击)</code></td>
                  <td style="padding: 8px; color: rgba(255, 255, 255, 0.7);">直接设为2倍速</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(254, 235, 234, 0.1);">
                  <td style="padding: 8px; color: #e5e7eb;">重置速度</td>
                  <td style="padding: 8px;"><code style="background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 3px; color: #feebea;">,, (双击)</code></td>
                  <td style="padding: 8px; color: rgba(255, 255, 255, 0.7);">重置为1倍速</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(254, 235, 234, 0.1);">
                  <td style="padding: 8px; color: #e5e7eb;">临时加速</td>
                  <td style="padding: 8px;"><code style="background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 3px; color: #feebea;">右Option键</code></td>
                  <td style="padding: 8px; color: rgba(255, 255, 255, 0.7);">按住时1.5x加速</td>
                </tr>
                <tr style="border-bottom: 1px solid rgba(254, 235, 234, 0.1);">
                  <td style="padding: 8px; color: #e5e7eb;">响度检测</td>
                  <td style="padding: 8px;"><code style="background: rgba(255, 255, 255, 0.1); padding: 2px 6px; border-radius: 3px; color: #feebea;">, + . (同时按)</code></td>
                  <td style="padding: 8px; color: rgba(255, 255, 255, 0.7);">开启/关闭自动加速</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div style="margin-bottom: 20px;">
            <h3 style="color: #fff; margin-bottom: 10px; font-size: 16px;">使用说明</h3>
            <div style="line-height: 1.8; color: #e5e7eb;">
              <p style="margin: 8px 0;"><strong>字幕提取：</strong>打开B站视频，等待几秒，字幕面板自动出现在右侧</p>
              <p style="margin: 8px 0;"><strong>AI总结：</strong>配置AI服务（菜单 → AI配置），点击魔法棒图标 ✨</p>
              <p style="margin: 8px 0;"><strong>笔记保存：</strong>选中任意文字，点击粉色钢笔图标</p>
              <p style="margin: 8px 0;"><strong>速度控制：</strong>使用 , 和 . 键调整速度，同时按切换响度检测</p>
            </div>
          </div>

          <div style="padding: 15px; background: rgba(254, 235, 234, 0.1); border-radius: 10px; border-left: 4px solid #feebea;">
            <div style="font-size: 13px; color: #fff; font-weight: 600; margin-bottom: 4px;">提示</div>
            <div style="font-size: 12px; color: rgba(255, 255, 255, 0.7); line-height: 1.5;">
              • AI配置支持多个提供商，可自由切换<br>
              • 笔记保存在本地，按日期自动分组<br>
              • SponsorBlock支持自动跳过广告和赞助片段
            </div>
          </div>
        </div>
        <div class="config-footer">
          <button class="config-btn config-btn-primary" id="help-close-btn">知道了</button>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  /**
   * 绑定事件
   */
  bindEvents() {
    // 点击背景关闭
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) {
        this.hide();
      }
    });

    // 关闭按钮
    const closeBtn = document.getElementById('help-close-btn');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => this.hide());
    }
  }
}

// 创建全局单例
export const helpModal = new HelpModal();
export default helpModal;

