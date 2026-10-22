import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useSyncExternalStore } from 'react'
import {
  getListDevicesQueryKey,
  registerDevice,
  useListDevices,
} from '../../lib/api/generated/devices/devices'
import type { Device, ListDevices200, Platform } from '../../lib/api/generated/model'
import { isStandalone, readIos, subscribeStandalone } from '../pwa/platform'
import { loadDeviceId, saveDeviceId } from './deviceId'
import { askPermission, getPermission, subscribePermission, type Permission } from './permission'
import { usePushClient } from './usePushClient'

/**
 * Notifications on this device (design doc 5.2 Settings, 5.7 "Push registration"; decision 43):
 * - `needs-install`: a browser tab. Pushes need the installed app (design doc §0).
 * - `unsupported`: this browser can't get pushes.
 * - `checking`: still asking the API, or registering.
 * - `off`: permission not asked yet: Enable.
 * - `blocked`: you said no; only the phone's or browser's settings can change it.
 * - `lost`: allowed, but the API has no device (e.g. the token was lost): register again.
 * - `elsewhere`: another device gets the pushes (one device per user, decision 40).
 * - `on`: this device gets the pushes.
 */
export type NotificationState =
  'needs-install' | 'unsupported' | 'checking' | 'off' | 'blocked' | 'lost' | 'elsewhere' | 'on'

/** The state from what the browser and the API said (pure, for tests). */
export function notificationStateOf({
  standalone,
  supported,
  permission,
  devices,
  myDeviceId,
  registering,
}: {
  standalone: boolean
  /** undefined: still asking the browser. */
  supported: boolean | undefined
  permission: Permission
  /** undefined: still asking the API (or it failed). */
  devices: Device[] | undefined
  myDeviceId: string | null
  registering: boolean
}): NotificationState {
  if (!standalone) return 'needs-install'
  if (supported === false || permission === 'unsupported') return 'unsupported'
  if (supported === undefined) return 'checking'
  if (permission === 'denied') return 'blocked'
  if (permission === 'default') return registering ? 'checking' : 'off'
  if (registering || !devices) return 'checking'
  const [device] = devices
  if (!device) return 'lost'
  return device.id === myDeviceId ? 'on' : 'elsewhere'
}

/** What POST /devices records as the platform. */
export function platformOf(userAgent: string, maxTouchPoints: number): Platform {
  if (readIos(userAgent, maxTouchPoints)) return 'ios'
  return /Android/i.test(userAgent) ? 'android' : 'web'
}

const REGISTER_KEY = ['notifications', 'register'] as const

/** Registered once per app start (module-level, so remounts don't repeat it). */
let registeredThisStart = false

/** Tests start each case from a fresh app start. */
export function resetRegisterOnStart() {
  registeredThisStart = false
}

/**
 * Register this device: the permission answer (asked on the tap, see `enable`), then the push
 * token, then POST /devices. Returns null when permission wasn't given.
 */
function useRegister() {
  const push = usePushClient()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: REGISTER_KEY,
    mutationFn: async (answer: Promise<NotificationPermission>): Promise<Device | null> => {
      if ((await answer) !== 'granted') return null
      registeredThisStart = true // a tap on Enable counts as this start's registration
      const fcmToken = await push.getToken()
      const platform = platformOf(navigator.userAgent, navigator.maxTouchPoints)
      const device = await registerDevice({ fcmToken, platform })
      saveDeviceId(device.id)
      return device
    },
    onSuccess: async (device) => {
      if (!device) return
      // A list request started before this (when the permission turned "granted") must not
      // land afterwards and hide the new device.
      await queryClient.cancelQueries({ queryKey: getListDevicesQueryKey() })
      queryClient.setQueryData<ListDevices200>(getListDevicesQueryKey(), { items: [device] })
    },
  })
}

function useBrowserState() {
  const push = usePushClient()
  const standalone = useSyncExternalStore(subscribeStandalone, isStandalone)
  const permission = useSyncExternalStore(subscribePermission, getPermission)
  // networkMode 'always': the browser answers this, not the network.
  const supported = useQuery({
    queryKey: ['notifications', 'supported'],
    queryFn: () => push.isSupported(),
    staleTime: Infinity,
    networkMode: 'always',
  })
  const devices = useListDevices({
    query: { enabled: standalone && permission === 'granted' },
  })
  return { standalone, permission, supported: supported.data, devices: devices.data?.items }
}

export function useNotifications() {
  const { standalone, permission, supported, devices } = useBrowserState()
  const register = useRegister()
  const registering = useIsMutating({ mutationKey: REGISTER_KEY }) > 0
  const tapped = useRef(false)
  const state = notificationStateOf({
    standalone,
    supported,
    permission,
    devices,
    myDeviceId: loadDeviceId(),
    registering,
  })

  return {
    state,
    /**
     * Turn notifications on here (also "use this device instead"). iPhone Safari shows the
     * permission prompt only straight from a tap, so it's asked here, before anything waits.
     */
    enable: (options?: Parameters<typeof register.mutate>[1]) => {
      // A quick second tap arrives before the button shows it's busy: one registration only.
      if (tapped.current) return
      tapped.current = true
      const answer = permission === 'granted' ? Promise.resolve(permission) : askPermission()
      register.mutate(answer, {
        ...options,
        onSettled: (...args) => {
          tapped.current = false
          options?.onSettled?.(...args)
        },
      })
    },
    /** This component's own Enable is running (not the quiet start-up registration). */
    enabling: register.isPending,
  }
}

/**
 * On every app start with permission given: register again (a rotated token gets saved, the
 * API notes lastSeenAt). Not when another device took over: taking it back is your choice, in
 * Settings (design doc 5.7). Mounted once, in the signed-in frame (RequireAuth).
 */
export function useRegisterOnStart() {
  const { standalone, permission, supported, devices } = useBrowserState()
  const { mutate } = useRegister()
  // A tap on Enable may be registering right now (the permission turns "granted" first).
  const registering = useIsMutating({ mutationKey: REGISTER_KEY }) > 0

  useEffect(() => {
    if (registeredThisStart || registering) return
    if (!standalone || !supported || permission !== 'granted' || !devices) return
    const [device] = devices
    if (device && device.id !== loadDeviceId()) return
    registeredThisStart = true
    mutate(Promise.resolve('granted')) // quietly: Settings shows the result
  }, [registering, standalone, supported, permission, devices, mutate])
}
