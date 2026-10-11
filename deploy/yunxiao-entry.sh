#!/bin/sh
set -eu
work=$(mktemp -d /tmp/juya-admin-deploy.XXXXXX)
trap 'rm -rf "$work"' EXIT
tar --no-same-owner --no-same-permissions -xzf /home/admin/app/package.tgz \
  -C "$work" deploy/ecs-web-deploy.sh
sh "$work/deploy/ecs-web-deploy.sh"
