#!/bin/sh
set -eu
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
deploy_script=${1:-$script_dir/../../deploy/ecs-web-deploy.sh}
entry_script=$script_dir/../../deploy/yunxiao-entry.sh
test_root=$(mktemp -d)
passed=0
export MSYS=winsymlinks:nativestrict

# 在独立临时目录模拟 ECS，name 为场景名称，mode 为预期故障或成功模式
# via_entry 为 1 时通过云效短入口提取并执行制品内脚本
run_case() {
  name=$1
  mode=$2
  via_entry=${3:-0}
  case_dir="$test_root/$name"
  mkdir -p "$case_dir/base/juya-admin-web/assets" "$case_dir/bin" "$case_dir/package/dist/assets" "$case_dir/package/deploy"
  printf OLD > "$case_dir/base/juya-admin-web/index.html"
  printf OLD_JS > "$case_dir/base/juya-admin-web/assets/old.js"
  printf '<title>NEW</title><script src="/assets/new.js"></script>\n' > "$case_dir/package/dist/index.html"
  if [ "$mode" != missing_asset ]; then
    if [ "$mode" = wrong_api_base ]; then
      printf OLD_SAME_ORIGIN > "$case_dir/package/dist/assets/new.js"
    else
      printf 'NEW_JS https://test-admin-api.juyayingyu.com' > "$case_dir/package/dist/assets/new.js"
    fi
  fi
  sed -e "s|/opt/juya|$case_dir/base|g" -e "s|/home/admin/app/package.tgz|$case_dir/package.tgz|g" "$deploy_script" > "$case_dir/package/deploy/ecs-web-deploy.sh"
  tar -czf "$case_dir/package.tgz" -C "$case_dir/package" dist deploy
  cat > "$case_dir/bin/nginx" <<'MOCK'
#!/bin/sh
[ "$MOCK_MODE" != nginx_fail ]
MOCK
  cat > "$case_dir/bin/curl" <<'MOCK'
#!/bin/sh
resolve=
need_resolve=0
for arg do
  if [ "$need_resolve" -eq 1 ]; then resolve=$arg; need_resolve=0; fi
  case "$arg" in
    --resolve) need_resolve=1 ;;
    -k|--insecure) exit 22 ;;
  esac
  url=$arg
done
case "$url" in
  https://*)
    case "$url" in
      https://test-admin.juyayingyu.com/*) [ "$resolve" = test-admin.juyayingyu.com:443:127.0.0.1 ] || exit 22 ;;
      https://test-admin-api.juyayingyu.com/*) [ "$resolve" = test-admin-api.juyayingyu.com:443:127.0.0.1 ] || exit 22 ;;
      *) exit 22 ;;
    esac
    if [ "$MOCK_MODE" = tls_fail ]; then exit 60; fi ;;
esac
case "$url" in
  *:8000/health/ready)
    if [ "$MOCK_MODE" = backend_fail ]; then exit 22; fi
    printf '{"status":"ready"}' ;;
  https://test-admin-api.juyayingyu.com/health/ready)
    if [ "$MOCK_MODE" = health_fail ]; then exit 22; fi
    printf '{"status":"ready"}' ;;
  https://test-admin.juyayingyu.com/login)
    if [ "$MOCK_MODE" = wrong_index ]; then printf WRONG; else cat "$MOCK_WEB/index.html"; fi ;;
  https://test-admin.juyayingyu.com/assets/new.js) cat "$MOCK_WEB/assets/new.js" ;;
  *) exit 22 ;;
esac
MOCK
  chmod +x "$case_dir/bin/nginx" "$case_dir/bin/curl"
  if ! command -v flock >/dev/null 2>&1; then
    printf '#!/bin/sh\nexit 0\n' > "$case_dir/bin/flock"
    chmod +x "$case_dir/bin/flock"
  fi
  if [ "$via_entry" -eq 1 ]; then
    sed "s|/home/admin/app/package.tgz|$case_dir/package.tgz|g" "$entry_script" > "$case_dir/deploy.sh"
  else
    cp "$case_dir/package/deploy/ecs-web-deploy.sh" "$case_dir/deploy.sh"
  fi
  export MOCK_MODE="$mode" MOCK_WEB="$case_dir/base/juya-admin-web"
  status=0
  PATH="$case_dir/bin:$PATH" BUILD_NUMBER=14 sh "$case_dir/deploy.sh" > "$case_dir/log" 2>&1 || status=$?
  if [ "$mode" = success ]; then
    if [ "$status" -ne 0 ]; then cat "$case_dir/log" >&2; exit 1; fi
    [ -L "$MOCK_WEB" ]
    cmp "$MOCK_WEB/index.html" "$case_dir/package/dist/index.html"
    export MOCK_MODE=success
    PATH="$case_dir/bin:$PATH" BUILD_NUMBER=15 sh "$case_dir/deploy.sh" >> "$case_dir/log" 2>&1
    [ -L "$MOCK_WEB" ]
    cmp "$MOCK_WEB/index.html" "$case_dir/package/dist/index.html"
  else
    [ "$status" -ne 0 ]
    [ "$(cat "$MOCK_WEB/index.html")" = OLD ]
  fi
  passed=$((passed + 1))
  printf 'PASS %s\n' "$name"
}

if [ ! -f "$deploy_script" ]; then
  printf 'FAIL: deployment script is missing\n' >&2
  exit 1
fi
sh -n "$deploy_script"
sh -n "$entry_script"
run_case directory_migration_and_second_release success
run_case missing_entry_asset missing_asset
run_case reject_same_origin_artifact wrong_api_base
run_case nginx_validation_failure nginx_fail
run_case backend_not_ready backend_fail
run_case rollback_after_index_mismatch wrong_index
run_case rollback_after_proxy_health_failure health_fail
run_case rollback_after_tls_failure tls_fail
run_case artifact_entry_deploys_bundled_script success 1
run_case artifact_entry_propagates_failure health_fail 1
printf 'PASS %s cases; fixtures: %s\n' "$passed" "$test_root"
