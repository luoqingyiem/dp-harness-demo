import { createRouter, createWebHashHistory, type RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'shelf',
    component: () => import('@/views/ShelfView.vue')
  },
  {
    path: '/reader/:id',
    name: 'reader',
    component: () => import('@/views/ReaderView.vue'),
    props: true
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/'
  }
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes
})
