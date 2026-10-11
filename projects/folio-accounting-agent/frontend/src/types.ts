export type FirmRole = 'FIRM_ADMIN' | 'ACCOUNTANT'
export type ClientRole = 'CLIENT_ADMIN' | 'CLIENT_SUBMITTER'

export interface ClientMembership {
  clientId: string
  clientName: string
  role: ClientRole
}

export interface Principal {
  id: string
  email: string
  name: string
  firm: { id: string; name: string; timezone: string }
  firmRole: FirmRole | null
  clientMemberships: ClientMembership[]
}

export interface AuthSession {
  accessToken: string
  tokenType: 'bearer'
  expiresIn: number
  user: Principal
}

export interface ApiErrorBody {
  code?: string
  message?: string
  details?: unknown
  requestId?: string
}
