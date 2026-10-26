// dsh-netease —— 宿主半区：现在故意是空的。
//
// 卡片的数据全部走本地桥 http://127.0.0.1:3457（bridge.py）：
// 宿主侧 JS 改了必须重启 DSH（Node 模块缓存），而界面/数据要反复调，
// 所以数据层搬出去之后，这里不再注册任何路由，也不再拉 SMTC 子进程。
//
// 保留这个文件是因为 cordis 需要 `name: 'dsh-netease'` 能解析到包，
// 客户端半区的 bundle 由本包的 package.json dsh.client 声明提供。
export function apply() {
  // 无宿主侧行为。
}
