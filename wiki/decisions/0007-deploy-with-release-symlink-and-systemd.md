---
type: Decision
title: "0007. 릴리스 폴더 + systemd로 배포한다"
description: "서버 /opt 배포 구조와 Cloudflare 터널 연결"
status: Accepted
timestamp: 2026-10-18
okf_version: "0.1"
---

# 0007. 릴리스 폴더 + systemd로 배포한다

## 결정

서버의 다른 서비스와 같은 구조로 배포한다.

```
/opt/pildam/releases/<UTC 시각>/   # 배포할 때마다 새 폴더
/opt/pildam/current -> releases/... # 링크만 교체
/opt/pildam-data/                   # 데이터. 배포가 건드리지 않음
```

- 배포 스크립트: 새 릴리스 폴더에 복사 → `current` 링크 교체 → 서비스 재시작 → 오래된 릴리스는 최근 몇 개만 남기고 정리.
- 서비스: Docker가 아닌 systemd 서비스로 운영자 계정 권한에서 실행한다. CLI 로그인 정보를 쓰기 위해서다. [ADR 0002](0002-use-server-cli-subscriptions.md)
- 외부 공개: 기존 Cloudflare 터널에 Public Hostname `pildam.leonamin.com` → `127.0.0.1:<포트>`를 추가한다. 앱은 127.0.0.1에만 바인딩한다.

## 구현 결과 (2026-10-18)

- systemd **사용자 서비스**(`~/.config/systemd/user/pildam.service`, nomi-web과 같은 방식)로 정했다. `loginctl enable-linger`로 로그아웃·재부팅 뒤에도 유지한다.
- `deploy/deploy.sh`: 빌드 → `/opt/pildam/releases/<UTC시각>/` 복사(운영 의존성만 설치) → `current` 링크 교체 → `systemctl --user restart pildam` → 최근 5개 릴리스만 유지. sudo는 처음에 `/opt/pildam`, `/opt/pildam-data`를 만들어 운영자에게 넘길 때만 쓴다.
- 포트 8310, `127.0.0.1`에만 바인딩. Cloudflare 터널 Public Hostname `pildam.leonamin.com` → `http://127.0.0.1:8310`.
- 설치·운영 절차는 저장소의 `deploy/README.md`에 있다.
