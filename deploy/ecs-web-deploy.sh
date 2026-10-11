#!/bin/sh
set -eu
umask 022

package=/home/admin/app/package.tgz
base=/opt/juya
web="$base/juya-admin-web"
version="${BUILD_NUMBER:-manual}-$(date +%Y%m%d%H%M%S)-$$"
mkdir -p "$base/juya-admin-web-releases" "$base/juya-admin-web-backups"
exec 9> "$base/.juya-admin-web-deploy.lock"
flock -n 9
release=$(mktemp -d "$base/juya-admin-web-releases/$version.XXXXXX")
chmod 755 "$release"
previous=
changed=0

# 发布失败时恢复之前的网站路径；旧版本文件保留供回滚
finish() {
  code=$?
  trap - EXIT
  if [ "$code" -ne 0 ] && [ "$changed" -eq 1 ]; then
    if [ -n "$previous" ]; then
      ln -s "$previous" "$web.rollback.$$"
      mv -Tf "$web.rollback.$$" "$web"
    else
      unlink "$web"
    fi
    printf 'DEPLOY_FAILED_ROLLED_BACK\n' >&2
  fi
  exit "$code"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# 校验制品和后端，完成后才切换网站
test -s "$package"
tar --no-same-owner --no-same-permissions -xzf "$package" -C "$release"
test -s "$release/dist/index.html"
test -d "$release/dist/assets"
chmod -R u=rwX,go=rX "$release/dist"
asset=$(sed -n 's/.*src="\([^"]*\.js\)".*/\1/p' "$release/dist/index.html" | head -n 1)
case "$asset" in /assets/*.js) ;; *) printf 'Invalid entry JS path\n' >&2; exit 1 ;; esac
test -s "$release/dist$asset"
nginx -t
curl --fail --silent --show-error --max-time 10 http://127.0.0.1:8000/health/ready > "$release/backend.json"
grep -q '"status"[[:space:]]*:[[:space:]]*"ready"' "$release/backend.json"

# 首次发布保留旧目录，后续发布通过符号链接切换版本
if [ -L "$web" ]; then
  previous=$(readlink -f "$web")
  test -d "$previous"
elif [ -e "$web" ]; then
  test -d "$web"
  previous="$base/juya-admin-web-backups/$version"
  mv "$web" "$previous"
  changed=1
fi
ln -s "$release/dist" "$web.next.$$"
mv -Tf "$web.next.$$" "$web"
changed=1

# 核对测试域名 HTTPS 返回的新页面、入口 JS 和后端代理
test_domain=test-admin.juyayingyu.com
curl --fail --silent --show-error --max-time 10 \
  --noproxy '*' --resolve "${test_domain}:443:127.0.0.1" \
  "https://${test_domain}/login" > "$release/http-index.html"
cmp -s "$release/dist/index.html" "$release/http-index.html"
curl --fail --silent --show-error --max-time 10 \
  --noproxy '*' --resolve "${test_domain}:443:127.0.0.1" \
  "https://${test_domain}${asset}" > "$release/http-entry.js"
cmp -s "$release/dist$asset" "$release/http-entry.js"
curl --fail --silent --show-error --max-time 10 \
  --noproxy '*' --resolve "${test_domain}:443:127.0.0.1" \
  "https://${test_domain}/health/ready" > "$release/proxy-health.json"
grep -q '"status"[[:space:]]*:[[:space:]]*"ready"' "$release/proxy-health.json"
printf 'DEPLOY_OK version=%s\n' "$version"
printf 'Verified: /login, entry JS, /health/ready\n'
