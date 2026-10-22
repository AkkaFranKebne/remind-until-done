import type { Device } from '../../lib/api/generated/model'
import { IPHONE_17 } from '../../test-utils/device'
import { notificationStateOf, platformOf } from './useNotifications'

const device = (id: string): Device => ({
  id,
  platform: 'web',
  userAgent: null,
  createdAt: '2026-10-21T08:00:00Z',
  lastSeenAt: '2026-10-21T08:00:00Z',
})

const base = {
  standalone: true,
  supported: true,
  permission: 'granted' as const,
  devices: [device('d1')],
  myDeviceId: 'd1',
  registering: false,
}

describe('notificationStateOf (decision 43)', () => {
  it('a browser tab needs the installed app, whatever else is true', () => {
    expect(notificationStateOf({ ...base, standalone: false })).toBe('needs-install')
  })

  it('no pushes in this browser', () => {
    expect(notificationStateOf({ ...base, supported: false })).toBe('unsupported')
    expect(notificationStateOf({ ...base, permission: 'unsupported' })).toBe('unsupported')
  })

  it('the permission decides before the API', () => {
    expect(notificationStateOf({ ...base, permission: 'default' })).toBe('off')
    expect(notificationStateOf({ ...base, permission: 'denied' })).toBe('blocked')
  })

  it('allowed: the API says whose device gets the pushes', () => {
    expect(notificationStateOf(base)).toBe('on')
    expect(notificationStateOf({ ...base, devices: [device('d2')] })).toBe('elsewhere')
    expect(notificationStateOf({ ...base, myDeviceId: null })).toBe('elsewhere')
    expect(notificationStateOf({ ...base, devices: [] })).toBe('lost')
  })

  it('still asking, or registering: checking', () => {
    expect(notificationStateOf({ ...base, supported: undefined })).toBe('checking')
    expect(notificationStateOf({ ...base, devices: undefined })).toBe('checking')
    expect(notificationStateOf({ ...base, registering: true })).toBe('checking')
    expect(notificationStateOf({ ...base, permission: 'default', registering: true })).toBe(
      'checking',
    )
  })
})

describe('platformOf', () => {
  it('iPhone and iPad are ios, Android is android, the rest web', () => {
    expect(platformOf(IPHONE_17, 5)).toBe('ios')
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 5)).toBe(
      'ios',
    )
    expect(platformOf('Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/141.0', 5)).toBe('android')
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/155.0', 0)).toBe(
      'web',
    )
  })
})
