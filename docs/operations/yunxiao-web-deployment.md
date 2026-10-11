# 云效测试前端发布

完整发布脚本在 `deploy/ecs-web-deploy.sh`，通过制品与 `dist/` 一起发布。流水线使用仓库里的脚本版本，无需手动上传脚本到 ECS，也无需把完整脚本粘贴到有 2000 字符限制的部署输入框。

## 构建与构建物上传

构建命令保持现有配置。构建物上传步骤使用以下配置：

- 制品名称：`juya-admin-web`
- 制品版本：`${BUILD_NUMBER}`
- 打包路径第一项：`dist/`
- 点击路径右侧的加号，增加第二项：`deploy/`
- 勾选「制品中包含打包路径的目录」

压缩包必须保留以下结构，脚本位于静态页面目录外，不会成为网站静态文件：

```text
dist/index.html
dist/assets/...
deploy/ecs-web-deploy.sh
```

OSS 上传步骤仍然只上传 `dist/`。

## 主机部署

- 勾选「部署时下载制品」，选择本流水线的 `juya-admin-web`
- 主机组：当前测试 ECS 所在主机组
- 下载路径：`/home/admin/app/package.tgz`
- 执行用户：`root`
- 部署脚本：复制 `deploy/yunxiao-entry.sh` 的全部内容，整体替换原输入框内容

```sh
#!/bin/sh
set -eu
work=$(mktemp -d /tmp/juya-admin-deploy.XXXXXX)
trap 'rm -rf "$work"' EXIT
tar --no-same-owner --no-same-permissions -xzf /home/admin/app/package.tgz \
  -C "$work" deploy/ecs-web-deploy.sh
sh "$work/deploy/ecs-web-deploy.sh"
```

先将仓库变更提交、推送到流水线使用的分支，再保存并运行。旧制品没有 `deploy/ecs-web-deploy.sh`，会在提取脚本时失败，需要重新运行构建和上传。

## 发布范围与验证

发布脚本使用 `/opt/juya/juya-admin-web`，保留旧版本后切换到新页面目录。校验失败时恢复旧前端路径，并返回非零退出码。旧版本目录保留，后续按磁盘容量制定清理策略。

后端就绪检查保持 `http://127.0.0.1:8000/health/ready`。随后通过 `--resolve` 检查本机 Nginx 提供的 `https://test-admin.juyayingyu.com/login`、入口 JavaScript 和 `/health/ready`，并保留证书校验。

脚本不修改 Nginx、TLS 配置、后端容器或数据库。云端成功日志包含 `DEPLOY_OK version=...`；仍需从外网打开测试登录页并验证业务操作。

本地 Linux 发布与回滚模拟：

```sh
sh tests/deploy/ecs-web-deploy.spec.sh
```

模拟使用临时目录与 Nginx、HTTP 测试替身，不连接 ECS 或真实数据库，不能替代云端发布验收。
