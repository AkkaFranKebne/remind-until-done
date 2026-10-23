import { IPHONE_15_7, IPHONE_17 } from '../../test-utils/device'
import { isTooOld, macBrowser, readIos } from './platform'

const IPAD =
  'Mozilla/5.0 (iPad; CPU OS 16_3_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.3 Mobile/15E148 Safari/604.1'
// iPadOS asks for desktop sites: it says "Macintosh".
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Safari/605.1.15'
const CHROME_ON_IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0 Mobile/15E148 Safari/604.1'
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const MAC_EDGE = `${MAC_CHROME} Edg/141.0.0.0`
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36'

describe('readIos', () => {
  it('reads the iPhone and its version', () => {
    expect(readIos(IPHONE_17, 5)).toEqual({ device: 'iPhone', version: [17, 5] })
    expect(readIos(IPHONE_15_7, 5)).toEqual({ device: 'iPhone', version: [15, 7] })
    expect(readIos(CHROME_ON_IPHONE, 5)).toEqual({ device: 'iPhone', version: [16, 4] })
  })

  it('reads an iPad, also when it pretends to be a Mac (a Mac with a touch screen)', () => {
    expect(readIos(IPAD, 5)).toEqual({ device: 'iPad', version: [16, 3, 1] })
    expect(readIos(IPAD_AS_MAC, 5)).toEqual({ device: 'iPad', version: [16, 4] })
  })

  it('anything else is not iOS: a real Mac (no touch), Android', () => {
    expect(readIos(IPAD_AS_MAC, 0)).toBeNull()
    expect(readIos(ANDROID, 5)).toBeNull()
  })
})

describe('isTooOld (web push needs iOS 16.4)', () => {
  it.each([
    [[15, 7], true],
    [[16, 3, 1], true],
    [[16, 4], false],
    [[16, 10], false],
    [[17], false],
  ])('iOS %j → %s', (version, tooOld) => {
    expect(isTooOld({ device: 'iPhone', version })).toBe(tooOld)
  })

  it('an unknown version gets the benefit of the doubt', () => {
    expect(isTooOld({ device: 'iPad', version: null })).toBe(false)
  })
})

describe('macBrowser (the name macOS lists under Notifications)', () => {
  it('Chrome or Edge on a Mac', () => {
    expect(macBrowser(MAC_CHROME, 0)).toBe('Google Chrome')
    expect(macBrowser(MAC_EDGE, 0)).toBe('Microsoft Edge')
  })

  it('not a Mac browser we know: Safari, Opera, an iPad that says "Mac", Android', () => {
    expect(macBrowser(`${MAC_CHROME} OPR/120.0.0.0`, 0)).toBeNull()
    expect(macBrowser(IPAD_AS_MAC, 0)).toBeNull()
    expect(macBrowser(MAC_CHROME, 5)).toBeNull()
    expect(macBrowser(ANDROID, 5)).toBeNull()
  })
})
