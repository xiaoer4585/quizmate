// 托盘管理（完全沿用原考试插件实现 + 秋招助手菜单扩展）
// 提供: 显示主窗口/登录/设置/切换悬浮框/刷新积分/退出 + 忙碌图标
import { app, Tray, Menu, nativeImage } from 'electron'
import fs from 'fs'

export interface TrayState {
  isAuthenticated: boolean
  isOverlayActive: boolean
  credits?: number
  email?: string
}

export interface TrayCallbacks {
  showMainWindow: () => void
  showLogin: () => void
  showSettings: () => void
  toggleOverlay: () => void
  captureScreenshot: () => void
  searchQuestion: () => void
  refreshCredits: () => void
  quit: () => void
}

export class TrayManager {
  private tray: Tray | null = null
  private callbacks: TrayCallbacks
  private state: TrayState = { isAuthenticated: false, isOverlayActive: false }
  private iconPath: string
  private busy: boolean = false
  private normalIcon: Electron.NativeImage | null = null
  private busyIcon: Electron.NativeImage | null = null

  constructor(callbacks: TrayCallbacks, iconPath: string) {
    this.callbacks = callbacks
    this.iconPath = iconPath
  }

  public create(): void {
    if (this.tray) return
    this.normalIcon = this.loadIcon()
    this.busyIcon = this.createBusyIcon()
    this.tray = new Tray(this.normalIcon)
    this.tray.setToolTip('QuizMate')
    this.refresh()
    this.tray.on('double-click', () => {
      this.callbacks.showMainWindow()
    })
    this.tray.on('click', () => {
      this.callbacks.showMainWindow()
    })
  }

  /** 设置忙碌状态：AI 处理中时切换为低调的忙碌图标 */
  public setBusy(busy: boolean): void {
    if (this.busy === busy) return
    this.busy = busy
    if (!this.tray) return
    const icon = busy ? (this.busyIcon || this.normalIcon) : this.normalIcon
    try {
      if (icon && !icon.isEmpty()) {
        this.tray.setImage(icon)
      }
      this.refresh()
    } catch (e) {
      console.warn('[TrayManager] setBusy error:', e)
    }
  }

  public setState(state: Partial<TrayState>): void {
    this.state = { ...this.state, ...state }
    this.refresh()
  }

  public refresh(): void {
    if (!this.tray) return
    const menu = this.buildMenu()
    this.tray.setContextMenu(Menu.buildFromTemplate(menu))
    const parts: string[] = ['QuizMate']
    if (this.busy) parts.push('处理中...')
    if (this.state.isAuthenticated) {
      if (this.state.email) parts.push(`账号: ${this.state.email}`)
      if (typeof this.state.credits === 'number') parts.push(`积分: ${this.state.credits}`)
    } else {
      parts.push('未登录')
    }
    if (this.state.isOverlayActive) parts.push('悬浮框: 已开启')
    this.tray.setToolTip(parts.join(' | '))
  }

  private buildMenu(): Electron.MenuItemConstructorOptions[] {
    const items: Electron.MenuItemConstructorOptions[] = []

    items.push({
      label: '显示主窗口',
      click: () => this.callbacks.showMainWindow(),
    })

    if (this.state.isAuthenticated) {
      items.push({
        label: this.state.email ? `已登录: ${this.state.email}` : '已登录',
        enabled: false,
      })
      items.push({
        label: '刷新积分',
        click: () => this.callbacks.refreshCredits(),
      })
    } else {
      items.push({
        label: '登录账号',
        click: () => this.callbacks.showLogin(),
      })
    }

    items.push({ type: 'separator' })

    items.push({
      label: this.state.isOverlayActive ? '隐藏悬浮框' : '显示悬浮框',
      click: () => this.callbacks.toggleOverlay(),
    });

    // 兜底入口：考试输入框/输入法拦截全局快捷键时，可用鼠标从托盘触发
    items.push({
      label: '全屏截图',
      click: () => this.callbacks.captureScreenshot(),
    });

    items.push({
      label: '搜题',
      click: () => this.callbacks.searchQuestion(),
    });

    items.push({
      label: '设置',
      click: () => this.callbacks.showSettings(),
    });

    items.push({ type: 'separator' })

    items.push({
      label: '退出',
      click: () => this.callbacks.quit(),
    })

    return items
  }

  private loadIcon(): Electron.NativeImage {
    if (this.iconPath && fs.existsSync(this.iconPath)) {
      try {
        const img = nativeImage.createFromPath(this.iconPath)
        if (!img.isEmpty()) return img.resize({ width: 16, height: 16 })
      } catch {
        // Fall through to generated icon
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" rx="6" fill="#2268df"/><text x="16" y="24" font-family="Arial,sans-serif" font-size="22" font-weight="bold" fill="white" text-anchor="middle">Q</text></svg>`
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`
    return nativeImage.createFromDataURL(dataUrl).resize({ width: 16, height: 16 })
  }

  /** 生成忙碌图标：三个橙色圆点（省略号效果） */
  private createBusyIcon(): Electron.NativeImage {
    const width = 16, height = 16
    const buffer = Buffer.alloc(width * height * 4, 0)

    const drawDot = (cx: number, cy: number, radius: number) => {
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const dx = x - cx
          const dy = y - cy
          if (dx * dx + dy * dy <= radius * radius) {
            const offset = (y * width + x) * 4
            buffer[offset] = 0xFF     // R
            buffer[offset + 1] = 0x98  // G
            buffer[offset + 2] = 0x00  // B
            buffer[offset + 3] = 0xFF  // A
          }
        }
      }
    }

    drawDot(4, 13, 2)
    drawDot(8, 13, 2)
    drawDot(12, 13, 2)

    const img = nativeImage.createFromBuffer(buffer, { width, height })
    if (!img.isEmpty()) return img
    return nativeImage.createEmpty()
  }

  public destroy(): void {
    if (this.tray) {
      try {
        this.tray.destroy()
      } catch {
        // Ignore destroy errors during shutdown
      }
      this.tray = null
    }
  }
}
