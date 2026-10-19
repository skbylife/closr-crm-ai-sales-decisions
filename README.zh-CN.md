# Closr Community

在本地创建和管理销售计划。

[English](README.md)

创建计划、跟踪状态，重启应用后继续工作。Closr Community 是 Closr 公开的源码可用部分；当前预览聚焦本地手动计划流程。

- 自行创建计划，或使用客户跟进、会议安排两种基础模板。
- 查看计划，标记完成、终止或重新打开。
- 停止并恢复运行后保留计划，按需删除。

界面目前为中文。这是单用户、单组织、一个合成客户的本地预览，不提供创建客户界面、邀请、多组织、Salesforce、SSO、计费或商业 AI。请只使用合成数据。

## 已验证范围

在同一台 Apple Silicon Mac 的隔离回环环境中，已通过全新 Auth/PostgreSQL 安装、真实浏览器登录、计划创建与读回、状态修改、停止/恢复后的数据保留、删除和销毁。最终源码包已重新解包并执行快速开始和生命周期检查；对应源码通过 npm 安装、TypeScript 检查和生产构建。

这不代表另一台干净机器、Linux、现有客户数据库或私有 Engine 已兼容，也不是生产支持承诺。请勿向不可信网络开放预览或在可销毁测试库中录入真实客户数据。

## 环境要求

- Apple Silicon macOS 与本机 Docker Desktop，是唯一经过验证的组合。安装器只使用 `/var/run/docker.sock` 和 `/usr/local/bin/docker`、`/opt/homebrew/bin/docker`、`/usr/bin/docker` 之一，不使用远程 Docker 主机或 context。
- `/usr/bin/curl`、Node.js >=20.9.0 与 npm；Next 版本锁定为 16.2.6。
- checkout 所在磁盘至少 4 GiB 可用空间；不足时安装器拒绝启动。
- 本机已有下面三个 `linux/arm64` 镜像。Linux 主机（包括 ARM64）未经验证、不在支持范围内。

## 手动准备镜像

安装器不会拉取镜像。请自行拉取以下不可变摘要对应的官方镜像：

```sh
docker pull --platform linux/arm64 public.ecr.aws/supabase/postgres@sha256:3b3484fdb09164d84c785314a0732a4abc33100f2726166b6458cb7f244f18e0
docker pull --platform linux/arm64 public.ecr.aws/supabase/gotrue@sha256:994d932f081033c7ea4ed766ab73169d16930a12244767d0468d1f8f697d0a6a
docker pull --platform linux/arm64 public.ecr.aws/supabase/postgrest@sha256:146be673e7821e86908cbf7fce1e6c7a7451c7975ef2058368bc494de551b87c
```

然后检查平台和镜像 ID；缺少或不匹配时会拒绝：

```sh
node installer/cli.mjs image-check
```

## 快速开始：关闭 Engine 的手动流程

从全新 checkout 开始：

```sh
npm ci
npm run typecheck
node installer/cli.mjs image-check
```

目录中不得存在 `.env.local`，包括目录、符号链接及悬空链接。它可能带有旧实例密钥；如已有，请自行移到一个未使用的名字，并保密保存：

```sh
if [ -e .env.local ] || [ -L .env.local ]; then mv -n .env.local ".env.local.old-$(date +%Y%m%d%H%M%S)"; fi
```

使用最终验收实际使用的端口，API 为 55441、网页为 55442，两者必须空闲：

```sh
node installer/cli.mjs up --ports 55441 55442
```

`up` 在 `.closr-local/` 下创建私有运行目录（0700，私有文件 0600）、内部 Docker 网络、一个数据卷和三个不发布主机端口的容器，并执行一次两份 Community 迁移。记下输出的绝对 `runtimeDir`，替换下列占位路径。

先创建第一个所有者用户，再启动长期 API 代理；`first-user` 会临时占用 `127.0.0.1:55441`：

```sh
node installer/cli.mjs first-user /absolute/path/printed/by/up
```

首位用户会获得 `Closr Community Preview` 组织和 `示例客户`。生成的 `…@example.invalid` 邮箱及密码在 `<runtimeDir>/users.json`（0600）中，只在本机读取，不要粘贴或分享。公开注册关闭；所有者仍存在时，后续用户不会获得成员资格。若删除所有者，下一个新用户可以成为所有者，因此这不是多用户部署。

保持以下终端运行：

```sh
node installer/cli.mjs serve-api /absolute/path/printed/by/up
```

在另一个终端中加载同一个运行目录的 `app.env`，保持 `.env.local` 不存在。不要打印、分享或提交其中的值；无需再保存一份 service-role 密钥。生成的配置默认关闭 Engine。

```sh
set -a
. /absolute/path/printed/by/up/app.env
set +a
npm run dev -- -p 55442
```

网页只绑定 `127.0.0.1:55442`。登录页按请求读取公共 API 地址和 anon key，service-role 密钥留在服务端；可在实例创建前做生产构建。

### 试用完整流程

1. 打开 `http://127.0.0.1:55442`，使用 `users.json` 中的所有者账号登录。
2. 在“客户”列表打开“示例客户”，点击“新建手动计划”。
3. 选择“客户跟进”“会议安排”基础模板或“自行填写”，调整目标、成功标准与第一步，点击“保存手动计划”。
4. 刷新确认计划可读回，试用“标记完成”“终止计划”“重新打开”。
5. 按下文停止两个终端进程及容器，再恢复容器，用同一 `app.env` 重启 API 和网页。重新登录，确认计划和状态仍在。
6. 使用删除操作并确认，刷新确认计划已消失。

## 停止、恢复和销毁

```sh
node installer/cli.mjs status  /absolute/path/printed/by/up
node installer/cli.mjs stop    /absolute/path/printed/by/up
node installer/cli.mjs resume  /absolute/path/printed/by/up
node installer/cli.mjs destroy /absolute/path/printed/by/up
```

以上每条命令都需要 `up` 输出的绝对运行目录。

- `status` 查看本次容器、迁移和首位用户状态。
- `stop` 停止容器，保留数据库卷和运行目录。先在 API 与网页终端按 Ctrl-C，等待进程退出。
- `resume` 恢复已完成安装且停止的实例，数据保留。随后重新启动 `serve-api`，加载同一 `app.env` 并运行网页命令。
- `destroy` 永久删除本次数据。先停止 API 与网页进程，并备份需要的内容。它只删除能够确认归属于本次运行的三个容器、内部网络、数据卷及安装器自己的运行文件；遇到意外资源会拒绝删除。镜像保留。

`stop` 和 `destroy` 在 API 端口被占用时拒绝修改 Docker，包括本次自己的 `serve-api`。如果仍提示占用，查明监听者，不要绕过检查或停止不属于本次运行的服务。销毁后退出加载过 `app.env` 的终端；环境变量不会随实例销毁自动消失。下一次运行使用新终端。

## Community 与 Engine

Community 提供公开应用和手动流程。Engine 是独立的私有服务端 API；其实现、专有 Prompt 和 BABEL 不在此仓库中。单独部署 Engine 不等于本 Community 预览已经完成集成。

本地快速开始关闭 Engine，不调用模型供应商。由运维开启的集成可能把用户输入和选定的账户上下文发送至 Engine 及其模型供应商，需要另行安排访问和数据处理。我们不承诺零留存、不用于训练、固定处理地区或合规认证。请勿通过这些实验性入口发送客户数据。

### 访问边界

容器位于内部 Docker 网络，不发布主机端口。`127.0.0.1:55441` 代理只转发 Community 使用的 Auth/REST 路由，并拒绝带 service-role 密钥的浏览器请求；网页绑定回环地址。两份迁移仅适用于全新、可销毁的预览库，不能应用于现有 Closr 或多租户数据库，安装器不重复执行迁移。

预览库开启 RLS，浏览器角色没有直接表访问权。服务端调用 `getUser()` 后，用 service-role 客户端查询成员关系，并在读写账户及计划前检查组织和账户权限。登录页只向浏览器提供公共 API 地址和 anon key；不要把 service-role 密钥作为页面属性传出，保持配置和运行目录私有。

`CLOSR_ENABLE_ENGINE_PREVIEW=true` 与私有 HTTPS `CLOSR_ENGINE_URL` 只是运维集成入口，不是可用的 Engine 安装。私有服务必须独立验证用户 token 和数据库中的组织/账户权限。关闭或没有地址时返回 `engine_not_configured`，手动计划仍可用。

另一个 `CLOSR_ENABLE_FULL_ENGINE` / `CLOSR_FULL_ENGINE_URL` 入口也默认关闭。它通过 Community 服务端发送有大小限制的目标请求，只接受限定作用域的展示结果，不保存计划。在此预览中开启它不受支持。公共契约不包含 BABEL Prompt、规则实现、原始记录或供应商凭据。两个入口均不属于快速开始；排序、重规划和相似案例检索也不在本预览能力中。

## 反馈

欢迎在 [GitHub Issues](https://github.com/skbylife/closr-crm-ai-sales-decisions/issues) 提交可复现问题或流程反馈。请提供操作步骤、预期结果、实际结果，以及 macOS、Node、Docker 版本。日志和截图请移除凭据与客户数据。

## 许可

Copyright 2026 Zhaocheng Liu.

[Closr Community Source-Available License](LICENSE) 允许个人使用、公司内部自部署和修改（含内部商业用途），并允许保留许可、署名和修改说明的免费再分发。

允许为客户控制的部署独立提供付费安装、配置、迁移到全新客户控制的实例、维护、支持、培训和咨询；费用不得购买软件权利或托管访问，客户必须能在不继续购买服务的情况下运行软件。未经单独书面许可，不得出售软件副本或软件权利，也不得提供付费 SaaS 或付费白标服务。改名、捆绑收费或将托管访问称为维护服务不能绕过限制。

这是自定义源码可用许可，不是 OSI 认可的开源许可；完整条款以 [LICENSE](LICENSE) 为准。第三方依赖和随附 Supabase CLI SQL 保留原许可，见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。既有有效单独许可不因此撤销。

此许可不覆盖完整私有 Closr 仓库、私有 Engine、BABEL、专有 Prompt 或策略实现，也不授予托管 Engine 访问权。此仓库仅分发源码，不含容器镜像、已安装依赖或二进制；未来分发这些内容时仍须保留适用通知及许可文本。
