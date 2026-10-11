import type { AxiosAdapter } from 'axios'
import { AxiosError, AxiosHeaders } from 'axios'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, readApiError, refreshSession, sessionClient, setAccessToken, setSessionListener } from './client'
import { portalApi } from './portal'
import { reviewApi } from './review'

const apiAdapter = api.defaults.adapter
const sessionAdapter = sessionClient.defaults.adapter

afterEach(() => {
  api.defaults.adapter = apiAdapter
  sessionClient.defaults.adapter = sessionAdapter
  setAccessToken(null)
  setSessionListener(() => undefined)
})

function response(config: Parameters<AxiosAdapter>[0], data: unknown) {
  return Promise.resolve({
    data,
    status: 200,
    statusText: 'OK',
    headers: new AxiosHeaders(),
    config,
  })
}

const session = {
  access_token: 'fresh-token', token_type: 'bearer', expires_in: 900,
  user: {
    id: 'user-1', email: 'admin@example.com', name: 'Admin',
    firm: { id: 'firm-1', name: 'Firm', timezone: 'Asia/Singapore' },
    firm_role: 'FIRM_ADMIN', client_memberships: [],
  },
}

function unauthorized(config: Parameters<AxiosAdapter>[0]) {
  return new AxiosError('Unauthorized', 'ERR_BAD_REQUEST', config, undefined, {
    data: { code: 'SESSION_REVOKED', message: 'Session has been revoked', request_id: 'req-401' },
    status: 401, statusText: 'Unauthorized', headers: new AxiosHeaders(), config,
  })
}

describe('API boundary', () => {
  it('sends review decisions and idempotent transitions with converted field names', async () => {
    const requests: Array<{ url?: string; body: unknown; key?: string }> = []
    api.defaults.adapter = (config) => {
      requests.push({
        url: config.url,
        body: config.data ? JSON.parse(config.data as string) : undefined,
        key: config.headers.get('Idempotency-Key') as string | undefined,
      })
      return response(config, {})
    }

    await reviewApi.review('requirement-1', {
      version: 2, submissionId: 'submission-1', decision: 'SATISFY',
      evidence: [{ documentId: 'document-1', relation: 'SUPPORTS' }],
    })
    await reviewApi.approve('request-1', 3, 'approve-key')

    expect(requests).toEqual([
      {
        url: '/requirements/requirement-1/review', key: undefined,
        body: { version: 2, submission_id: 'submission-1', decision: 'SATISFY', evidence: [{ document_id: 'document-1', relation: 'SUPPORTS' }] },
      },
      {
        url: '/collection-requests/request-1/approve', key: 'approve-key',
        body: { version: 3 },
      },
    ])
  })

  it('sends classification confirmation in snake_case and preserves invalid items', async () => {
    let requestBody: Record<string, unknown> = {}
    api.defaults.adapter = (config) => {
      requestBody = JSON.parse(config.data as string)
      return response(config, {
        provider: 'MOCK', items: [{ document_id: 'doc', category: 'INVALID', requirement_id: null, confidence: 0.99 }],
      })
    }
    const result = await portalApi.confirmClassification('request-1', 'run-1', [{ documentId: 'doc', category: 'INVALID', requirementId: null }])

    expect(requestBody).toEqual({ items: [{ document_id: 'doc', category: 'INVALID', requirement_id: null }] })
    expect(result.items[0]).toEqual({ documentId: 'doc', category: 'INVALID', requirementId: null, confidence: 0.99 })
  })

  it('converts request keys to snake_case and response keys to camelCase', async () => {
    let requestBody: Record<string, unknown> = {}
    api.defaults.adapter = (config) => {
      requestBody = JSON.parse(config.data as string)
      expect(config.params).toEqual({ client_ids: ['client-1', 'client-2'], page_size: 10 })
      expect(config.headers.get('Authorization')).toBe('Bearer token')
      expect(config.headers.get('Idempotency-Key')).toBe('operation-1')
      return response(config, { request_id: 'req-1', users: [{ firm_role: 'FIRM_ADMIN' }] })
    }

    setAccessToken('token')
    const { data } = await api.post('/clients', {
      legalName: 'ACME',
      features: { multiCurrency: true },
      contacts: [{ displayName: 'Sam' }],
    }, {
      params: { clientIds: ['client-1', 'client-2'], pageSize: 10 },
      headers: { 'Idempotency-Key': 'operation-1' },
    })

    expect(requestBody).toEqual({
      legal_name: 'ACME',
      features: { multi_currency: true },
      contacts: [{ display_name: 'Sam' }],
    })
    expect(data).toEqual({ requestId: 'req-1', users: [{ firmRole: 'FIRM_ADMIN' }] })
  })

  it('keeps binary values intact while converting FormData keys', async () => {
    const blob = new Blob(['invoice'], { type: 'text/plain' })
    const file = new File([blob], 'invoice.txt', { type: 'text/plain' })
    let sent: FormData | undefined
    api.defaults.adapter = (config) => {
      sent = config.data as FormData
      return response(config, blob)
    }
    const form = new FormData()
    form.append('supportingFile', file)

    const { data } = await api.post('/documents', form, { responseType: 'blob' })

    const sentFile = sent?.get('supporting_file') as File
    expect(sentFile).toBeInstanceOf(File)
    expect(sentFile.name).toBe('invoice.txt')
    expect(await sentFile.text()).toBe('invoice')
    expect(data).toBe(blob)
  })

  it('shares one refresh request across concurrent callers', async () => {
    let calls = 0
    sessionClient.defaults.adapter = async (config) => {
      calls += 1
      await Promise.resolve()
      return response(config, session)
    }

    const sessions = await Promise.all([refreshSession(), refreshSession(), refreshSession()])

    expect(calls).toBe(1)
    expect(sessions[0].accessToken).toBe('fresh-token')
  })

  it('refreshes once for concurrent 401s and retries each original request once', async () => {
    const attempts = new Map<string, number>()
    setAccessToken('expired-token')
    api.defaults.adapter = (config) => {
      attempts.set(config.url!, (attempts.get(config.url!) ?? 0) + 1)
      if (config.headers.get('Authorization') === 'Bearer expired-token') {
        return Promise.reject(unauthorized(config))
      }
      expect(config.headers.get('Authorization')).toBe('Bearer fresh-token')
      return response(config, { ok: true })
    }
    const refresh = vi.fn((config: Parameters<AxiosAdapter>[0]) => response(config, session))
    sessionClient.defaults.adapter = refresh

    await Promise.all(['/me', '/clients', '/users'].map((url) => api.get(url)))

    expect(refresh).toHaveBeenCalledTimes(1)
    expect([...attempts.values()]).toEqual([2, 2, 2])
  })

  it('reuses a refreshed token when a slow old 401 arrives later', async () => {
    let rejectSlow!: (reason: unknown) => void
    let slowConfig!: Parameters<AxiosAdapter>[0]
    let slowStarted!: () => void
    const started = new Promise<void>((resolve) => { slowStarted = resolve })
    setAccessToken('expired-token')
    api.defaults.adapter = (config) => {
      if (config.headers.get('Authorization') === 'Bearer fresh-token') return response(config, {})
      if (config.url === '/slow') {
        slowConfig = config
        slowStarted()
        return new Promise((_resolve, reject) => { rejectSlow = reject })
      }
      return Promise.reject(unauthorized(config))
    }
    const refresh = vi.fn((config: Parameters<AxiosAdapter>[0]) => response(config, session))
    sessionClient.defaults.adapter = refresh
    const slow = api.get('/slow')
    await started
    await api.get('/fast')
    rejectSlow(unauthorized(slowConfig))
    await slow
    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('clears the session and stops when refresh fails', async () => {
    const listener = vi.fn()
    setSessionListener(listener)
    setAccessToken('expired-token')
    const request = vi.fn((config: Parameters<AxiosAdapter>[0]) => Promise.reject(unauthorized(config)))
    const refresh = vi.fn((config: Parameters<AxiosAdapter>[0]) => Promise.reject(unauthorized(config)))
    api.defaults.adapter = request
    sessionClient.defaults.adapter = refresh

    await expect(api.get('/me')).rejects.toBeInstanceOf(AxiosError)

    expect(request).toHaveBeenCalledTimes(1)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith(null)
    api.defaults.adapter = (config) => {
      expect(config.headers.has('Authorization')).toBe(false)
      return response(config, {})
    }
    await api.get('/health/live')
  })

  it('does not loop when a retried request also returns 401', async () => {
    const listener = vi.fn()
    setSessionListener(listener)
    const request = vi.fn((config: Parameters<AxiosAdapter>[0]) => Promise.reject(unauthorized(config)))
    const refresh = vi.fn((config: Parameters<AxiosAdapter>[0]) => response(config, session))
    api.defaults.adapter = request
    sessionClient.defaults.adapter = refresh

    await expect(api.get('/me')).rejects.toBeInstanceOf(AxiosError)

    expect(request).toHaveBeenCalledTimes(2)
    expect(refresh).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenLastCalledWith(null)
  })

  it('preserves error code and request ID without refreshing login failures', async () => {
    api.defaults.adapter = (config) => Promise.reject(unauthorized(config))
    const refresh = vi.fn()
    sessionClient.defaults.adapter = refresh
    const error = await api.post('/auth/login', {}).catch(readApiError)
    expect(error).toEqual({
      code: 'SESSION_REVOKED', status: 401,
      message: 'Session has been revoked', requestId: 'req-401',
    })
    expect(refresh).not.toHaveBeenCalled()
  })
})
