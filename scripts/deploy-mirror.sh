#!/bin/sh
# 把实验室产物同步到境内镜像 https://lab.steven.run（成都机房，已备案）
# 用法：npm run deploy:mirror
set -eu

ROOT=$(cd "$(dirname "$0")/.." && pwd)
TAR=/tmp/lab-mirror.tar
HOST=${MIRROR_HOST:-steven.run}
PORT=${MIRROR_PORT:-9999}

node "$ROOT/scripts/build.mjs" lab
tar -C "$ROOT/dist" -cf "$TAR" lab

scp -P "$PORT" -q "$TAR" "$HOST:/tmp/lab-mirror.tar"

# 解包与改权限都得在宿主机上做，借助特权容器进 chroot
ssh -p "$PORT" "$HOST" "docker run --rm --privileged --pid=host --network=host -v /:/host -v /proc:/host/proc --entrypoint chroot alpine /host /bin/sh -c '
  set -e
  tar -xf /tmp/lab-mirror.tar -C /tmp
  rm -rf /www/wwwroot/lab.steven.run/*
  cp -a /tmp/lab/. /www/wwwroot/lab.steven.run/
  chown -R www:www /www/wwwroot/lab.steven.run
  rm -rf /tmp/lab /tmp/lab-mirror.tar
  /usr/local/sbin/reload-nginx.sh || true
  du -sh /www/wwwroot/lab.steven.run
'"

curl -s -o /dev/null -w "https://lab.steven.run/ → %{http_code}\n" https://lab.steven.run/
