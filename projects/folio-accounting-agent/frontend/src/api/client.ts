import type { AxiosError, InternalAxiosRequestConfig } from 'axios'
import axios from 'axios'
import applyCaseMiddleware from 'axios-case-converter'
import type { ApiErrorBody, AuthSession } from '@/types'

export const api = applyCaseMiddleware(
  axios.create({ baseURL: '/api/v1', withCredentials: true }),
  { ignoreHeaders: true },
)

export const sessionClient = applyCaseMiddleware(
  axios.create({ baseURL: '/api/v1', withCredentials: true }),
  { ignoreHeaders: true },
)

let accessToken: string | null = null
let refreshPromise: Promise<AuthSession> | null = null
let sessionListener: (session: AuthSession | null) => void = () => undefined

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setSessionListener(listener: typeof sessionListener) {
  sessionListener = listener
}

export function refreshSession(): Promise<AuthSession> {
  if (!refreshPromise) {
    refreshPromise = sessionClient
      .post<AuthSession>('/auth/refresh')
      .then(({ data }) => {
        setAccessToken(data.accessToken)
        sessionListener(data)
        return data
      })
      .catch((error: unknown) => {
        setAccessToken(null)
        sessionListener(null)
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.set('Authorization', `Bearer ${accessToken}`)
  return config
})

interface RetryableConfig extends InternalAxiosRequestConfig {
  _retried?: boolean
}

api.interceptors.response.use(undefined, async (error: AxiosError) => {
  const config = error.config as RetryableConfig | undefined
  const isAuthEndpoint = config?.url?.startsWith('/auth/')
  if (error.response?.status !== 401 || !config || isAuthEndpoint) {
    throw error
  }
  if (config._retried) {
    setAccessToken(null)
    sessionListener(null)
    throw error
  }
  config._retried = true
  // A slow 401 can arrive after another request already refreshed the token.
  if (accessToken && config.headers.get('Authorization') !== `Bearer ${accessToken}`) {
    return api.request(config)
  }
  const session = await refreshSession()
  config.headers.set('Authorization', `Bearer ${session.accessToken}`)
  return api.request(config)
})

export interface ReadApiError {
  code?: string
  status?: number
  message: string
  details?: unknown
  requestId?: string
}

export function readApiError(error: unknown): ReadApiError {
  const response = axios.isAxiosError<ApiErrorBody>(error) ? error.response : undefined
  return {
    code: response?.data?.code,
    status: response?.status,
    message: response?.data?.message ?? 'The request could not be completed.',
    details: response?.data?.details,
    requestId:
      response?.data?.requestId ??
      (response?.headers['x-request-id'] as string | undefined),
  }
}
