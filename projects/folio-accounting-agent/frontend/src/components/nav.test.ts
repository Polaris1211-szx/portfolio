import { createPinia } from 'pinia'
import { createSSRApp } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createI18n } from 'vue-i18n'
import { createMemoryHistory, createRouter } from 'vue-router'
import { expect, it } from 'vitest'
import AppShell from '@/components/AppShell.vue'
import { accountsMessages } from '@/i18n/accounts'
import { useAuthStore } from '@/stores/auth'
import type { ClientMembership, FirmRole } from '@/types'

it.each<{
  role: FirmRole | null; memberships: ClientMembership[]; expected: string[]; hidden: string[]
}>([
  { role: 'FIRM_ADMIN', memberships: [], expected: ['/staff/clients', '/staff/admin/users'], hidden: ['/client/contacts'] },
  { role: 'ACCOUNTANT', memberships: [], expected: ['/staff/clients'], hidden: ['/staff/admin/users', '/client/contacts'] },
  { role: null, memberships: [{ clientId: 'client', clientName: 'Client', role: 'CLIENT_ADMIN' }], expected: ['/client/collections', '/client/contacts'], hidden: ['/staff/clients', '/staff/admin/users'] },
  { role: null, memberships: [{ clientId: 'client', clientName: 'Client', role: 'CLIENT_SUBMITTER' }], expected: ['/client/collections'], hidden: ['/client/contacts', '/staff/clients', '/staff/admin/users'] },
])('renders only permitted navigation for $role / $memberships', async ({ role, memberships, expected, hidden }) => {
  const area = role ? 'staff' : 'client'
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  auth.user = {
    id: 'user', email: 'user@example.com', name: 'User', firmRole: role,
    firm: { id: 'firm', name: 'Firm', timezone: 'UTC' }, clientMemberships: memberships,
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { render: () => null } }],
  })
  await router.push(`/${area}`)
  const app = createSSRApp(AppShell, { area }).use(pinia).use(router).use(createI18n({
    legacy: false, locale: 'en',
    messages: { en: {
      ...accountsMessages.en,
      app: { name: 'Client Records' }, auth: { signOut: 'Sign out' }, home: { firm: 'Organisation' },
      nav: { primary: 'Main navigation', workspace: 'Workspace', profile: 'Account' },
      portal: { title: 'Documents' },
    } },
  }))
  const html = await renderToString(app)
  for (const path of expected) {
    // Desktop and mobile navigation must enforce the same visibility rules.
    expect(html.match(new RegExp(`href="${path}"`, 'g'))).toHaveLength(2)
  }
  for (const path of hidden) expect(html).not.toContain(`href="${path}"`)
  expect(html.match(new RegExp(`href="/${area}/profile"`, 'g'))).toHaveLength(2)
})
