# 第三方组件与许可

本目录（`music/`）里有一个**整份 vendor 进来的第三方项目**，其余文件是本仓库自己的代码。

## `server.py` —— NetEase Cloud Music MCP Server

| 项 | 内容 |
|---|---|
| 上游 | https://github.com/Vael-KY/netease-music-mcp |
| 许可 | **MIT** |
| 版本锚点 | `server.py` 头部 `VERSION = "3.2.1"` |
| 本地改动 | **仅一处**：`__main__` 里监听地址由 `0.0.0.0` 改为 `127.0.0.1`（原版无鉴权，同局域网可读写账号）。需要对外监听时用环境变量 `MCP_BIND` 覆盖 |
| 其余 | 与上游一致，未做其它修改 |

> **再分发提醒**：MIT 要求随分发附带上游的版权声明与许可正文。本仓库目前**没有**附完整许可正文，
> 只是在此标注出处。如果你要把这份代码公开发布或再分发，请到上游仓库取回 `LICENSE` 一并附上，
> 或直接用 `server.py` 头部标注的上游地址替换成原始文件。

## 其它

- `dsh-netease/` 是本仓库自己写的客户端插件（MIT 亦可，正文见根目录说明）。
- `bridge.py`、`keepalive.py`、`install.ps1` 等均为本仓库原创，只依赖 Python 标准库与 PowerShell 5.1。
