import { offerInstall, pretendAppFound, resetDevice } from '../../test-utils/device'
import { getState, promptInstall, type InstallPromptState } from './installPrompt'
import type { Ios } from './platform'
import { installStateOf } from './useInstall'

afterEach(resetDevice)

const iphone = (version: number[]): Ios => ({ device: 'iPhone', version })
const noOffer: InstallPromptState = { prompt: null, installed: false, appFound: false }

describe('installStateOf (design doc §0 detection table)', () => {
  it('old iOS is a hard stop, even when installed', () => {
    const ios = iphone([15, 7])
    expect(installStateOf({ ios, standalone: true, prompt: noOffer }).state).toBe('ios-too-old')
  })

  it('opened from the home screen: installed', () => {
    expect(installStateOf({ ios: iphone([17]), standalone: true, prompt: noOffer }).state).toBe(
      'installed',
    )
    expect(installStateOf({ ios: null, standalone: true, prompt: noOffer }).state).toBe('installed')
  })

  it('an iPhone in a browser tab: the steps', () => {
    expect(installStateOf({ ios: iphone([16, 4]), standalone: false, prompt: noOffer }).state).toBe(
      'ios-browser',
    )
  })

  it('elsewhere: installable when Chrome offered, else unavailable', () => {
    const prompt = offerInstall()
    expect(installStateOf({ ios: null, standalone: false, prompt: getState() }).state).toBe(
      'installable',
    )
    expect(prompt.defaultPrevented).toBe(true) // our button, not Chrome's mini-bar
    expect(installStateOf({ ios: null, standalone: false, prompt: noOffer }).state).toBe(
      'unavailable',
    )
  })

  it('a tab where the browser says rud. is already installed: app-found', async () => {
    await pretendAppFound()
    expect(getState().appFound).toBe(true)
    expect(installStateOf({ ios: null, standalone: false, prompt: getState() }).state).toBe(
      'app-found',
    )
    // Opened from the icon, it's simply installed.
    expect(installStateOf({ ios: null, standalone: true, prompt: getState() }).state).toBe(
      'installed',
    )
  })
})

describe('checkInstalledApp', () => {
  it('no app found, or the browser refuses to say: nothing changes', async () => {
    await pretendAppFound([])
    expect(getState().appFound).toBe(false)
    await pretendAppFound(new Error('not allowed'))
    expect(getState().appFound).toBe(false)
  })
})

describe('promptInstall', () => {
  it('accepted: shows Chrome\'s dialog once, then "just installed"', async () => {
    const event = offerInstall('accepted')
    await promptInstall()
    expect(event.prompted).toBe(1)
    expect(getState()).toEqual({ prompt: null, installed: true, appFound: false })
  })

  it('dismissed: the offer is used up (Chrome may make a new one later)', async () => {
    offerInstall('dismissed')
    await promptInstall()
    expect(getState()).toEqual({ prompt: null, installed: false, appFound: false })
  })

  it('Chrome refuses a used-up offer: dropped, so the page shows no Install button', async () => {
    const event = offerInstall()
    event.prompt = () => Promise.reject(new DOMException('already used', 'InvalidStateError'))
    await expect(promptInstall()).rejects.toThrow('already used')
    expect(getState()).toEqual({ prompt: null, installed: false, appFound: false })
  })

  it('installed from the browser menu instead: "just installed" too', () => {
    offerInstall()
    window.dispatchEvent(new Event('appinstalled'))
    expect(getState()).toEqual({ prompt: null, installed: true, appFound: false })
  })
})
