#!/bin/sh

resolve_deploy_root() {
  environment="${1-}"
  branch="${2-}"

  case "${environment}:${branch}" in
    test:test)
      printf '%s\n' '/opt/juya-admin/test'
      ;;
    production:main)
      printf '%s\n' '/opt/juya-admin/production'
      ;;
    *)
      printf 'invalid deployment mapping: environment=%s branch=%s\n' \
        "$environment" "$branch" >&2
      return 64
      ;;
  esac
}

case "$0" in
  *environment.sh)
    if [ "$#" -ne 2 ]; then
      printf 'usage: environment.sh <environment> <branch>\n' >&2
      exit 64
    fi

    resolve_deploy_root "$1" "$2"
    ;;
esac
