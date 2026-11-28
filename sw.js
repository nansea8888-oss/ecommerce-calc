/* 电商精算 · 离线缓存
 *
 * 目的：解决从 GitHub Pages 加载慢的问题。
 * 第一次访问后把页面存进本机缓存，之后打开直接读本地，不再走网络。
 * 同时后台悄悄拉一次新版本，下次打开就是最新的。
 *
 * 策略（stale-while-revalidate）：
 *   打开 → 立刻用缓存（毫秒级）
 *        → 后台请求网络 → 有新版就更新缓存
 *        → 本次不打断，下次打开生效
 */

const CACHE = 'jingsuan-v5'
const PRECACHE = ['./', './index.html']

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // 只接管自己的页面资源；GitHub API 等跨域请求保持原样
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => cached)

      // 有缓存先用缓存（快），没有就等网络
      return cached || network
    }),
  )
})
