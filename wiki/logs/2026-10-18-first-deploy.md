---
type: Log
title: "첫 배포"
description: "서버 PC에 필담을 처음 배포하며 고친 점과 확인한 내용"
timestamp: 2026-10-18
okf_version: "0.1"
---

# 첫 배포

`deploy/README.md` 절차로 서버 PC에 배포했다. 릴리스 `/opt/pildam/releases/20261018T065414Z`, systemd 사용자 서비스 `pildam` 실행 중(127.0.0.1:8310).

- 배포 스크립트 수정: 처음 실행 때 데이터 폴더를 만들기 전에 소유권을 바꾸려다 실패하던 문제.
- pnpm 12가 승인되지 않은 빌드 스크립트(esbuild, Storybook 개발 의존성)를 오류로 처리해서 `pnpm-workspace.yaml`에 `allowBuilds: esbuild: false`를 두고 릴리스에도 복사한다.
- 서비스의 `NoNewPrivileges=true` 아래에서 agy·codex·claude가 안전 옵션 그대로 동작하는 것을 확인했다.
- 남은 일(운영자): 계정 추가(`PILDAM_DATA=/opt/pildam-data pnpm add-user <아이디>`), Cloudflare 터널 Public Hostname `pildam.leonamin.com` → `http://127.0.0.1:8310`.

- 갱신: concepts/known-issues.md, logs/index.md
