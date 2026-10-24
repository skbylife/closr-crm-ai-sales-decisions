# Closr 完整应用与引擎源码

此版本包含应用、BABEL 引擎、策略引擎、Prompt、API 及数据库迁移源码，取代先前的有限 Community 预览。默认自部署使用 PostgreSQL + pgvector、应用内账号/MFA 和 Docker 卷附件，不需要 Supabase 账号或服务。

采用 [source-available 许可](LICENSE)：允许个人和公司内部自部署、修改；禁止第三方转售、出售软件许可，以及收费托管、白标和订阅服务（版权所有者另行书面授权除外）。保留原许可允许的免费再分发及独立安装、维护、支持与咨询服务边界。不会在未来自动转成无禁售限制的许可，不称 OSI 开源。

第三方组件保持原许可证。此分发不含私有 Git 历史、生产配置、客户数据库、向量数据、内部评估集或 API key。来源未核实的演示案例与样本记录不分发；演示填充接口返回 410。请使用自己有权处理的数据。

自部署步骤与迁移限制见 [SELF_HOSTING.md](SELF_HOSTING.md)。原生空库基线为 `database/native/`，不能混跑旧迁移目录。附带 58 条可读通用知识、来源记录及可选 embedding 重建脚本；完整验收状态见 RELEASE_NOTES.md。
