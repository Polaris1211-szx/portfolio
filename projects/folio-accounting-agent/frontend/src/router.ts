import { createRouter, createWebHistory } from 'vue-router'
import AppShell from '@/components/AppShell.vue'
import NotificationCenter from '@/components/NotificationCenter.vue'
import HomeView from '@/views/HomeView.vue'
import LoginView from '@/views/LoginView.vue'
import NotFoundView from '@/views/NotFoundView.vue'
import ProfileView from '@/views/ProfileView.vue'
import ClientsView from '@/views/ClientsView.vue'
import ClientDetailView from '@/views/ClientDetailView.vue'
import StaffView from '@/views/StaffView.vue'
import ContactsView from '@/views/ContactsView.vue'
import InvitationAcceptView from '@/views/InvitationAcceptView.vue'
import ForbiddenView from '@/views/ForbiddenView.vue'
import { useAuthStore } from '@/stores/auth'

const DashboardView = () => import('@/views/DashboardView.vue')
const CollectionsView = () => import('@/views/CollectionsView.vue')
const CollectionDetailView = () => import('@/views/CollectionDetailView.vue')
const CollectionFormView = () => import('@/views/CollectionFormView.vue')
const CollectionReviewView = () => import('@/views/CollectionReviewView.vue')
const PortalCollectionsView = () => import('@/views/PortalCollectionsView.vue')
const PortalCollectionDetailView = () => import('@/views/PortalCollectionDetailView.vue')

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/login', name: 'login', component: LoginView, meta: { guest: true } },
    { path: '/invitations/accept', name: 'invitation-accept', component: InvitationAcceptView },
    {
      path: '/staff', component: AppShell, props: { area: 'staff' },
      meta: { requiresAuth: true, area: 'staff' },
      children: [
        { path: '', name: 'staff-home', component: DashboardView },
        { path: 'profile', name: 'staff-profile', component: ProfileView },
        { path: 'notifications', name: 'staff-notifications', component: NotificationCenter, props: { area: 'staff', pageView: true }, meta: { title: 'notifications.title' } },
        { path: 'collections', name: 'collections', component: CollectionsView, meta: { title: 'collections.title' } },
        { path: 'collections/new', name: 'collection-new', component: CollectionFormView, meta: { title: 'collections.new' } },
        { path: 'collections/:id/edit', name: 'collection-edit', component: CollectionFormView, meta: { title: 'collections.edit' } },
        { path: 'collections/:id', name: 'collection-detail', component: CollectionDetailView, meta: { title: 'collections.requestDetails' } },
        { path: 'collections/:id/review', name: 'collection-review', component: CollectionReviewView, meta: { title: 'review.title' } },
        { path: 'clients', name: 'clients', component: ClientsView, meta: { title: 'accounts.clients' } },
        { path: 'clients/new', name: 'client-new', component: ClientDetailView, meta: { firmAdmin: true, title: 'accounts.newClient' } },
        { path: 'clients/:id', name: 'client-detail', component: ClientDetailView, meta: { title: 'accounts.clients' } },
        { path: 'admin/users', name: 'staff-users', component: StaffView, meta: { firmAdmin: true, title: 'accounts.employees' } },
        { path: 'forbidden', name: 'staff-forbidden', component: ForbiddenView, meta: { title: 'accounts.forbidden' } },
        { path: ':pathMatch(.*)*', name: 'staff-not-found', component: NotFoundView },
      ],
    },
    {
      path: '/client', component: AppShell, props: { area: 'client' },
      meta: { requiresAuth: true, area: 'client' },
      children: [
        { path: '', name: 'client-home', component: HomeView },
        { path: 'collections', name: 'portal-collections', component: PortalCollectionsView, meta: { title: 'portal.title' } },
        { path: 'collections/:id', name: 'portal-collection-detail', component: PortalCollectionDetailView, meta: { title: 'portal.request' } },
        { path: 'profile', name: 'client-profile', component: ProfileView },
        { path: 'notifications', name: 'client-notifications', component: NotificationCenter, props: { area: 'client', pageView: true }, meta: { title: 'notifications.title' } },
        { path: 'contacts', name: 'client-contacts', component: ContactsView, meta: { clientAdmin: true, title: 'accounts.contacts' } },
        { path: 'forbidden', name: 'client-forbidden', component: ForbiddenView, meta: { title: 'accounts.forbidden' } },
        { path: ':pathMatch(.*)*', name: 'client-not-found', component: NotFoundView },
      ],
    },
    { path: '/portal', redirect: '/client' },
    { path: '/portal/collections', redirect: { name: 'portal-collections' } },
    { path: '/portal/collections/:id', redirect: to => ({ name: 'portal-collection-detail', params: { id: to.params.id } }) },
    { path: '/', redirect: '/staff' },
    { path: '/:pathMatch(.*)*', name: 'not-found', component: NotFoundView },
  ],
})

router.beforeEach(async (to) => {
  const auth = useAuthStore()
  await auth.bootstrap()
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  if (to.meta.guest && auth.isAuthenticated) return auth.homePath
  if (to.meta.area === 'staff' && !auth.isStaff) return '/client'
  if (to.meta.area === 'client' && auth.isStaff) return '/staff'
  if (to.meta.firmAdmin && auth.user?.firmRole !== 'FIRM_ADMIN') return { name: 'staff-forbidden' }
  if (to.meta.clientAdmin && !auth.user?.clientMemberships.some(member => member.role === 'CLIENT_ADMIN')) return { name: 'client-forbidden' }
})
