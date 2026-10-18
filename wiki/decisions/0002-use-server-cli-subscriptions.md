---
type: Decision
title: "0002. 서버 PC의 AI CLI 구독을 쓴다"
description: "API 키 대신 로그인된 CLI를 비대화형으로 호출"
status: Accepted
timestamp: 2026-10-18
okf_version: "0.1"
---

# 0002. 서버 PC의 AI CLI 구독을 쓴다

## 결정

서버 PC에 로그인된 CLI를 비대화형 모드로 호출한다. [AI CLI 비대화형 모드](../references/ai-cli-headless.md)

- Claude Code: `claude -p`
- Codex: `codex exec`
- Antigravity: `agy -p`

## 근거

- 운영자가 이미 구독 중이라 추가 지출이 없다. 한도만 신경 쓰면 된다.
- 허용 모델 목록은 운영자가 `models.json`으로 정하므로 AI 선택권이 운영자에게 있다.

## 결과

- CLI 로그인 정보가 사용자 홈에 있어 앱은 Docker가 아닌 호스트 프로세스로 돌린다. [ADR 0007](0007-deploy-with-release-symlink-and-systemd.md)
- 공개 서비스이므로 CLI는 빈 작업 폴더에서, 도구 없이, 읽기 전용 샌드박스로 실행한다.
- 동시 호출 수를 제한한다.
