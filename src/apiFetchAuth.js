import { supabase } from './supabaseClient'

let installed = false

/**
 * Adds the current Supabase access token to same-origin /api requests that do
 * not already provide an Authorization header. This keeps authentication
 * consistent for background calls such as categorisation, memory extraction,
 * and generated document downloads.
 */
export function installAuthenticatedFetch() {
  if (installed || typeof window === 'undefined') return
  installed = true

  const nativeFetch = window.fetch.bind(window)

  window.fetch = async (input, init = {}) => {
    try {
      const rawUrl = input instanceof Request ? input.url : String(input)
      const url = new URL(rawUrl, window.location.origin)

      if (url.origin === window.location.origin && url.pathname.startsWith('/api/')) {
        const headers = new Headers(input instanceof Request ? input.headers : undefined)
        new Headers(init.headers || {}).forEach((value, key) => headers.set(key, value))

        if (!headers.has('Authorization')) {
          const { data } = await supabase.auth.getSession()
          const token = data?.session?.access_token
          if (token) headers.set('Authorization', `Bearer ${token}`)
        }

        if (input instanceof Request) {
          return nativeFetch(new Request(input, { ...init, headers }))
        }

        return nativeFetch(input, { ...init, headers })
      }
    } catch (error) {
      console.error('[api-fetch-auth] Could not attach session token:', error.message)
    }

    return nativeFetch(input, init)
  }
}
