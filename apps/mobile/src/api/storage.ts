// Where the session token lives.
//
// SecureStore is the right home on a device — it is the Keychain, and a bearer that
// unlocks a customer's statement belongs there. It does not exist on web, which the
// app targets only for review builds, so that platform falls back to localStorage.
// The fallback is deliberately not "secure"; it is only ever reached where there is
// no keychain to use, and a review build holds a synthetic customer.
import { Platform } from 'react-native'
import * as SecureStore from 'expo-secure-store'

const web = Platform.OS === 'web'

export async function getItem(key: string): Promise<string | null> {
  if (web) {
    try {
      return globalThis.localStorage?.getItem(key) ?? null
    } catch {
      return null
    }
  }
  return SecureStore.getItemAsync(key)
}

export async function setItem(key: string, value: string): Promise<void> {
  if (web) {
    try {
      globalThis.localStorage?.setItem(key, value)
    } catch {
      /* private mode, or storage disabled — the session simply does not survive a reload */
    }
    return
  }
  await SecureStore.setItemAsync(key, value)
}

export async function removeItem(key: string): Promise<void> {
  if (web) {
    try {
      globalThis.localStorage?.removeItem(key)
    } catch {
      /* see setItem */
    }
    return
  }
  await SecureStore.deleteItemAsync(key)
}
