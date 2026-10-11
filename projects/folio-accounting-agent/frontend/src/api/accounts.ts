import { api } from './client'
import type { ClientMembership, ClientRole, FirmRole } from '@/types'

export type AccountStatus = 'ACTIVE' | 'DISABLED'
export interface Page<T> { items: T[]; total: number; page: number; pageSize: number }
export interface ListQuery { page?: number; pageSize?: number; search?: string; status?: AccountStatus }
export interface UserAccount {
  id: string; name: string; email: string; status: AccountStatus
  firmRole: FirmRole | null; clientRoles: ClientMembership[]; lastLoginAt: string | null
}
export interface ClientFeatures {
  usesPaymentPlatform: boolean; hasEmployeeReimbursement: boolean; hasLoan: boolean
  multiCurrency: boolean; projectBased: boolean; hasRetention: boolean
}
export interface ClientAccount {
  industry: string
  id: string; code: string; legalName: string; baseCurrency: string
  features: ClientFeatures; status: AccountStatus
}
export type ClientCreate = Omit<ClientAccount, 'id' | 'status'>
export type ClientUpdate = Partial<Omit<ClientAccount, 'id' | 'code'>>
export interface BankAccount {
  id: string; bank: string; accountLast4: string; currency: string; status: AccountStatus
}
export interface ClientMember {
  userId: string; name: string; email: string; status: AccountStatus; role: ClientRole
}
export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED'
export interface Invitation {
  id: string; email: string; role: FirmRole | ClientRole
  expiresAt: string; createdAt: string; status: InvitationStatus
}
export interface InvitationToken { id: string; email: string; role: FirmRole | ClientRole; expiresAt: string; token: string }
export interface InvitationInput { email: string; role: FirmRole | ClientRole }

const invitationPath = (clientId?: string) => clientId ? `/clients/${clientId}/invitations` : '/users/invitations'

export const accountsApi = {
  listUsers: (params: ListQuery & { role?: FirmRole; staffOnly?: boolean } = {}) =>
    api.get<Page<UserAccount>>('/users', { params }).then(({ data }) => data),
  updateUser: (id: string, body: { name?: string; status?: AccountStatus; role?: FirmRole }) =>
    api.patch<UserAccount>(`/users/${id}`, body).then(({ data }) => data),
  listClients: (params: ListQuery = {}) => api.get<Page<ClientAccount>>('/clients', { params }).then(({ data }) => data),
  getClient: (id: string) => api.get<ClientAccount>(`/clients/${id}`).then(({ data }) => data),
  createClient: (body: ClientCreate) => api.post<ClientAccount>('/clients', body).then(({ data }) => data),
  updateClient: (id: string, body: ClientUpdate) => api.patch<ClientAccount>(`/clients/${id}`, body).then(({ data }) => data),
  listBanks: (id: string) => api.get<BankAccount[]>(`/clients/${id}/bank-accounts`).then(({ data }) => data),
  createBank: (id: string, body: Omit<BankAccount, 'id' | 'status'>) =>
    api.post<BankAccount>(`/clients/${id}/bank-accounts`, body).then(({ data }) => data),
  updateBank: (clientId: string, bankId: string, body: Partial<Omit<BankAccount, 'id'>>) =>
    api.patch<BankAccount>(`/clients/${clientId}/bank-accounts/${bankId}`, body).then(({ data }) => data),
  listMembers: (id: string) => api.get<ClientMember[]>(`/clients/${id}/members`).then(({ data }) => data),
  updateMember: (clientId: string, userId: string, body: { role: ClientRole; active?: boolean }) =>
    api.patch<ClientMember | null>(`/clients/${clientId}/members/${userId}`, body).then(({ data }) => data),
  getAssignments: (id: string) => api.get<{ userIds: string[] }>(`/clients/${id}/assignments`).then(({ data }) => data),
  replaceAssignments: (id: string, userIds: string[]) =>
    api.put<{ userIds: string[] }>(`/clients/${id}/assignments`, { userIds }).then(({ data }) => data),
  listInvitations: (clientId?: string, params: { page?: number; pageSize?: number } = {}) =>
    api.get<Page<Invitation>>(invitationPath(clientId), { params }).then(({ data }) => data),
  invite: (body: InvitationInput, clientId?: string) =>
    api.post<InvitationToken>(invitationPath(clientId), body).then(({ data }) => data),
  resendInvitation: (id: string, clientId?: string) =>
    api.post<InvitationToken>(`${invitationPath(clientId)}/${id}/resend`).then(({ data }) => data),
  revokeInvitation: (id: string, clientId?: string) =>
    api.post<{ message: string }>(`${invitationPath(clientId)}/${id}/revoke`).then(({ data }) => data),
  acceptInvitation: (body: { token: string; name: string; password: string }) =>
    api.post<{ message: string }>('/auth/invitations/accept', body).then(({ data }) => data),
}
