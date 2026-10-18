#!/bin/sh
# 필담 배포: 빌드 → /opt/pildam/releases/<UTC시각> 복사 → current 링크 교체 → 서비스 재시작.
# 데이터(/opt/pildam-data)는 만들기만 하고 내용은 건드리지 않는다. (wiki/decisions/0007)
set -eu

REPO=$(cd "$(dirname "$0")/.." && pwd)
ROOT=/opt/pildam
DATA=/opt/pildam-data
KEEP=5

# /opt는 root 소유라 처음 한 번만 sudo로 폴더를 만들어 넘겨받는다.
for d in "$ROOT/releases" "$DATA"; do
  [ -d "$d" ] || { sudo mkdir -p "$d" && sudo chown -R "$(id -un):$(id -gn)" "$ROOT" "$DATA"; }
done

cd "$REPO"
pnpm install --frozen-lockfile
pnpm build

REL=$ROOT/releases/$(date -u +%Y%m%dT%H%M%SZ)
mkdir -p "$REL"
cp -r dist server shared package.json pnpm-lock.yaml "$REL"/
(cd "$REL" && pnpm install --prod --frozen-lockfile)

# 링크를 새로 만들어 rename으로 바꿔치기 (중간 상태가 없다)
ln -sfn "$REL" "$ROOT/current.new"
mv -Tf "$ROOT/current.new" "$ROOT/current"

systemctl --user restart pildam

# 오래된 릴리스 정리 (최근 KEEP개만 남김)
ls -1d "$ROOT"/releases/* | sort | head -n -"$KEEP" | while read -r old; do rm -rf "$old"; done
echo "배포 완료: $REL"
