import { api } from './client'

export type NotificationEvent =
  | 'PUBLISHED'
  | 'SUBMITTED'
  | 'CHANGES_REQUESTED'
  | 'AI_REVIEW_COMPLETED'
  | 'APPROVED'
  | 'APPROVAL_WITHDRAWN'
  | 'CLOSED'
  | 'CANCELLED'

export interface NotificationItem {
  id: string
  requestId: string
  eventType: NotificationEvent
  clientName: string
  period: string
  payload: Record<string, unknown>
  readAt: string | null
  createdAt: string
}

export interface NotificationList {
  items: NotificationItem[]
  total: number
  unreadCount: number
  page: number
  pageSize: number
}

export const notificationsApi = {
  list: (params: { page?: number; unreadOnly?: boolean } = {}) => api.get<NotificationList>('/notifications', { params: { pageSize: 20, ...params } }).then(({ data }) => data),
  markRead: (id: string) => api.post<NotificationItem>(`/notifications/${id}/read`).then(({ data }) => data),
  markAllRead: () => api.post('/notifications/read-all'),
}
