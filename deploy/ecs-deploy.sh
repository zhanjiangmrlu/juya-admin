#!/bin/sh
set -eu

die() {
  printf '%s\n' "$1" >&2
  exit "${2:-1}"
}

if [ "$#" -ne 4 ]; then
  die 'usage: ecs-deploy.sh <environment> <branch> <release-id> <bundle-dir>' 64
fi

environment=$1
branch=$2
release_id=$3
bundle_dir=$4

script_path=$0
case "$script_path" in
  *\\*) script_path=$(cygpath -u -- "$script_path") ;;
esac
deploy_dir=$(CDPATH= cd -- "$(dirname -- "$script_path")" && pwd)
. "$deploy_dir/environment.sh"

resolved_root=$(resolve_deploy_root "$environment" "$branch")

if [ "$environment" = 'production' ]; then
  die 'production deployment is not configured' 64
fi

case "$release_id" in
  '' | '.' | '..' | *[!A-Za-z0-9._-]*)
    die "invalid release id: $release_id" 64
    ;;
esac

test_root=${JUYA_DEPLOY_TEST_ROOT-}
test_mode=${JUYA_DEPLOY_TEST_MODE-}
if [ -n "$test_root" ]; then
  [ "$test_mode" = '1' ] || die 'test root override requires JUYA_DEPLOY_TEST_MODE=1' 64
  case "$test_root" in
    /*) ;;
    *) die 'JUYA_DEPLOY_TEST_ROOT must be an absolute path' 64 ;;
  esac
  deploy_root="${test_root}${resolved_root}"
  nginx_conf_dir="${test_root}/etc/nginx/conf.d"
elif [ "$test_mode" = '1' ]; then
  die 'JUYA_DEPLOY_TEST_MODE=1 requires JUYA_DEPLOY_TEST_ROOT' 64
else
  deploy_root=$resolved_root
  nginx_conf_dir='/etc/nginx/conf.d'
fi

nginx_bin='nginx'
curl_bin='curl'
if [ "$test_mode" = '1' ]; then
  nginx_bin=${JUYA_NGINX_BIN:-nginx}
  curl_bin=${JUYA_CURL_BIN:-curl}
elif [ -n "${JUYA_NGINX_BIN-}${JUYA_CURL_BIN-}" ]; then
  die 'command overrides require JUYA_DEPLOY_TEST_MODE=1' 64
fi

[ -f "$bundle_dir/dist/index.html" ] || die 'bundle is missing dist/index.html' 65
[ -d "$bundle_dir/dist/assets" ] || die 'bundle is missing dist/assets' 65
nginx_source="$bundle_dir/deploy/nginx/juya-admin-test.conf"
[ -f "$nginx_source" ] || die 'bundle is missing deploy/nginx/juya-admin-test.conf' 65

command -v "$nginx_bin" >/dev/null 2>&1 || die 'nginx command is required' 69
command -v "$curl_bin" >/dev/null 2>&1 || die 'curl command is required' 69

releases_dir="$deploy_root/releases"
release_dir="$releases_dir/$release_id"
current_link="$deploy_root/current"
next_link="$deploy_root/.current.next.$$"
nginx_target="$nginx_conf_dir/juya-admin-test.conf"
nginx_backup="$nginx_conf_dir/.juya-admin-test.conf.backup.$$"

old_target=''
config_had_previous=0
config_installed=0
switched=0
success=0

clear_current() {
  rm -f -- "$current_link"
}

write_current() {
  target=$1
  rm -f -- "$next_link"
  if [ "$test_mode" = '1' ]; then
    printf '%s\n' "$target" > "$next_link"
  else
    ln -s -- "$target" "$next_link"
  fi
  mv -Tf -- "$next_link" "$current_link"
}

rollback() {
  rm -f -- "$next_link"

  if [ "$switched" -eq 1 ]; then
    clear_current
    if [ -n "$old_target" ]; then
      write_current "$old_target"
    fi
  fi

  if [ "$config_installed" -eq 1 ]; then
    if [ "$config_had_previous" -eq 1 ]; then
      cp -p -- "$nginx_backup" "$nginx_target" || true
    else
      rm -f -- "$nginx_target"
    fi
  fi

  if [ "$switched" -eq 1 ]; then
    "$nginx_bin" -t >/dev/null 2>&1 || true
    "$nginx_bin" -s reload >/dev/null 2>&1 || true
  fi

  rm -f -- "$nginx_backup"
  rm -rf -- "$release_dir"
}

finish() {
  exit_code=$?
  trap - EXIT HUP INT TERM
  if [ "$success" -ne 1 ]; then
    rollback
  fi
  exit "$exit_code"
}

trap finish EXIT HUP INT TERM

mkdir -p -- "$releases_dir" "$nginx_conf_dir"
[ ! -e "$release_dir" ] || die "release already exists: $release_id" 73

if [ "$test_mode" = '1' ] && [ -f "$current_link" ]; then
  old_target=$(cat "$current_link")
elif [ -L "$current_link" ]; then
  old_target=$(readlink "$current_link")
elif [ -e "$current_link" ]; then
  die "current path is not a symbolic link: $current_link" 73
fi

mkdir -- "$release_dir"
cp -R -- "$bundle_dir/dist/." "$release_dir/"
chmod -R a-w -- "$release_dir"

if [ -f "$nginx_target" ]; then
  cp -p -- "$nginx_target" "$nginx_backup"
  config_had_previous=1
fi
cp -- "$nginx_source" "$nginx_target"
chmod 0644 -- "$nginx_target"
config_installed=1

"$nginx_bin" -t

write_current "$release_dir"
switched=1

"$nginx_bin" -s reload
"$curl_bin" --fail --silent --show-error 'http://127.0.0.1/' >/dev/null

for candidate in "$releases_dir"/*; do
  [ -d "$candidate" ] || continue
  [ "$candidate" = "$release_dir" ] && continue
  [ -n "$old_target" ] && [ "$candidate" = "$old_target" ] && continue
  rm -rf -- "$candidate" || true
done

rm -f -- "$nginx_backup"
success=1
printf 'deployed %s from branch %s to %s\n' "$release_id" "$branch" "$deploy_root"
