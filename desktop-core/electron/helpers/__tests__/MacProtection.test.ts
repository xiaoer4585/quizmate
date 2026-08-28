import { EventEmitter } from 'node:events'
import type { BrowserWindow } from 'electron'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  applyAllProtections,
  startProtectionWatchdog,
} from '../MacProtection'

class FakeBrowserWindow extends EventEmitter {
  destroyed = false
  focusable = true
  alwaysOnTop = false
  contentProtected = false
  ignoreMouseCalls: Array<[boolean, { forward: boolean } | undefined]> = []
  alwaysOnTopCalls: Array<[boolean, string]> = []
  allWorkspaceCalls: Array<[boolean, { visibleOnFullScreen: boolean }]> = []

  isDestroyed() { return this.destroyed }
  setFocusable(value: boolean) { this.focusable = value }
  isFocusable() { return this.focusable }
  setIgnoreMouseEvents(value: boolean, options?: { forward: boolean }) {
    this.ignoreMouseCalls.push([value, options])
  }
  setSkipTaskbar(_value: boolean) {}
  setContentProtection(value: boolean) { this.contentProtected = value }
  isContentProtected() { return this.contentProtected }
  setVisibleOnAllWorkspaces(value: boolean, options: { visibleOnFullScreen: boolean }) {
    this.allWorkspaceCalls.push([value, options])
  }
  setAlwaysOnTop(value: boolean, level: string) {
    this.alwaysOnTop = value
    this.alwaysOnTopCalls.push([value, level])
  }
  isAlwaysOnTop() { return this.alwaysOnTop }
}

const asBrowserWindow = (win: FakeBrowserWindow) => win as unknown as BrowserWindow

beforeEach(() => {
  vi.spyOn(process, 'platform', 'get').mockReturnValue('darwin')
})

afterEach(() => {
  vi.useRealTimers()
  vi.restoreAllMocks()
})

describe('MacProtection', () => {
  it('applies content, input, all-workspaces and screen-saver protections before show', () => {
    const fake = new FakeBrowserWindow()

    const result = applyAllProtections(asBrowserWindow(fake))

    expect(result.success).toBe(true)
    expect(result.verified).toBe(true)
    expect(result.details?.allWorkspaces).toBe(true)
    expect(result.details?.alwaysOnTop).toBe(true)
    expect(fake.ignoreMouseCalls).toEqual([[true, { forward: true }]])
    expect(fake.allWorkspaceCalls).toEqual([[true, { visibleOnFullScreen: true }]])
    expect(fake.alwaysOnTopCalls).toEqual([[true, 'screen-saver']])
  })

  it('restores a lost always-on-top state immediately and removes the listener on stop', () => {
    vi.useFakeTimers()
    const fake = new FakeBrowserWindow()
    const watchdog = startProtectionWatchdog(asBrowserWindow(fake), { intervalMs: 500 })

    fake.alwaysOnTop = false
    fake.emit('always-on-top-changed', {}, false)
    expect(fake.alwaysOnTopCalls.at(-1)).toEqual([true, 'screen-saver'])

    watchdog.stop()
    const callsAfterStop = fake.alwaysOnTopCalls.length
    fake.alwaysOnTop = false
    fake.emit('always-on-top-changed', {}, false)
    vi.advanceTimersByTime(1000)

    expect(fake.alwaysOnTopCalls).toHaveLength(callsAfterStop)
    expect(fake.listenerCount('always-on-top-changed')).toBe(0)
  })

  it('reapplies immutable placement and mouse pass-through on every watchdog tick', () => {
    vi.useFakeTimers()
    const fake = new FakeBrowserWindow()
    const watchdog = startProtectionWatchdog(asBrowserWindow(fake), { intervalMs: 500 })

    vi.advanceTimersByTime(500)

    expect(fake.ignoreMouseCalls.at(-1)).toEqual([true, { forward: true }])
    expect(fake.allWorkspaceCalls.at(-1)).toEqual([true, { visibleOnFullScreen: true }])
    expect(fake.alwaysOnTopCalls.at(-1)).toEqual([true, 'screen-saver'])
    expect(fake.ignoreMouseCalls.some(([ignored]) => ignored === false)).toBe(false)
    watchdog.stop()
  })

  it('cleans the recovery listener when a destroyed window is observed', () => {
    vi.useFakeTimers()
    const fake = new FakeBrowserWindow()
    startProtectionWatchdog(asBrowserWindow(fake), { intervalMs: 500 })

    fake.destroyed = true
    vi.advanceTimersByTime(500)

    expect(fake.listenerCount('always-on-top-changed')).toBe(0)
  })
})
