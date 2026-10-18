---
type: Concept
title: "개발 방식"
description: "실행 명령, 연습용 AI, 에이전트 분업 방식"
timestamp: 2026-10-18
okf_version: "0.1"
---

# 개발 방식

## 실행

```sh
pnpm install
PILDAM_DATA=./data PILDAM_PASSWORD=<8자 이상> pnpm add-user <아이디>
PILDAM_DATA=./data PILDAM_AI_MOCK=1 pnpm dev:server   # 127.0.0.1:8310
pnpm dev                                              # Vite, /api는 8310으로 프록시
pnpm storybook                                        # 상태별 화면 확인 (6006)
pnpm build                                            # tsc -b + vite build
```

- `PILDAM_AI_MOCK=1`이면 "연습용 AI"가 생긴다. 구독 사용량을 쓰지 않고 대필·선택 수정·요약·새 작품 흐름을 시험할 수 있다.
- 배포는 [ADR 0007](../decisions/0007-deploy-with-release-symlink-and-systemd.md)과 `deploy/README.md`.

## 에이전트 분업 (2026-10-18 첫 구현 때)

- 메인 세션은 플래너·감독: 설계, API 계약(`shared/types.ts`), 작업 분할, 결과 검토, 위키 기록, 커밋.
- 구현은 Sonnet 5.5 서브에이전트에 맡겼다. 파일 영역이 겹치지 않게 나눠 동시에 실행했다: 서버 / 클라이언트 기반 → 에디터 / 관계도·새 작품 → Storybook / QA.
- 단순 파일 탐색은 Haiku 5.5 에이전트에 맡겼다.
- 의존성 설치·`package.json` 수정은 메인 세션만 했다. 서브에이전트는 커밋하지 않고, 메인 세션이 영역별로 나눠 커밋했다.
