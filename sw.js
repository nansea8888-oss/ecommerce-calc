/* 电商精算 · 离线缓存
 *
 * 目的：解决从 GitHub Pages 加载慢的问题。
 * 第一次访问后把页面存进本机缓存，之后打开直接读本地，不再走网络。
 *
 * 策略（stale-while-revalidate）：
 *   打开 → 立刻用缓存（毫秒级）
 *        → 后台请求网络 → 有新版就更新缓存 + 通知页面
 *        → 本次不打断，由用户决定何时刷新
 *
 * 注意：这里只缓存「程序」，不碰任何业务数据。
 * 数据在 localStorage 和云端，和本文件无关。
 * 跨域请求（GitHub API 云同步）直接放行，不进缓存。
 */

const CACHE = 'jingsuan-v8'
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

async function notifyUpdate() {
  try {
    const clients = await self.clients.matchAll({ includeUncontrolled: true })
    clients.forEach((c) => c.postMessage({ type: 'update-available' }))
  } catch {
    /* ignore */
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return

  const url = new URL(req.url)
  // 只接管自己的页面资源；GitHub API 等跨域请求保持原样，不进缓存
  if (url.origin !== self.location.origin) return

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then(async (res) => {
          if (res && res.ok) {
            let changed = false
            if (cached) {
              try {
                const [oldText, newText] = await Promise.all([
                  cached.clone().text(),
                  res.clone().text(),
                ])
                changed = oldText !== newText
              } catch {
                changed = false
              }
            }
            const copy = res.clone()
            caches
              .open(CACHE)
              .then((c) => c.put(req, copy))
              .then(() => {
                if (changed) void notifyUpdate()
              })
              .catch(() => {})
          }
          return res
        })
        .catch(() => cached)

      return cached || network
    }),
  )
})
