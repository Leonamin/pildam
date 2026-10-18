---
type: Concept
title: "코드 구조"
description: "저장소 폴더 구성과 각 영역의 책임"
timestamp: 2026-10-18
okf_version: "0.1"
---

# 코드 구조

```
shared/types.ts        서버·클라이언트 공용 API 계약 (바꿀 때 양쪽을 함께 고친다)
server/
  index.ts             Hono 앱, /api 라우트, 인증 미들웨어, 운영 시 dist 정적 제공
  auth.ts              로그인·세션·실패 제한
  store.ts             파일 저장, 입력 검증(checkId 등)
  ai.ts                CLI 실행기, 컨텍스트 조립, AI 엔드포인트
  scripts/add-user.ts  계정 추가
src/
  app/                 라우팅, provider 조립, 작품 내비게이션 항목
  shared/              api.ts(fetch·NDJSON 스트림), useApi, useMedia, time
  shared/ui/           Goodcase UI 이식본(basic/overlays/composed), layout/AppShell, styles
  features/auth/       로그인
  features/works/      홈(작품 목록), 새 작품 시작 흐름
  features/editor/     작업 화면: 목차·원고(Tiptap)·AI 패널·전환 버튼·선택 수정·요약
  features/graph/      관계도: Cytoscape 캔버스, 노드 상세, 제안 반영(applySuggestions·edgesAt)
deploy/                배포 스크립트, systemd 유닛, 설치 안내
.storybook/            Storybook 설정과 API mock
```

- 공용 UI(`shared/ui`)는 도메인을 모른다. 도메인 화면은 `features/*`에 둔다.
- 테스트는 업무 규칙에만 둔다: `src/features/editor/text.test.ts`(ProseMirror 위치 ↔ 일반 텍스트 위치), `src/features/graph/suggestions.test.ts`(제안 반영·시점별 관계). `node --test <파일>`로 실행하며 앱 타입 검사에서는 제외한다.
- API 목록과 응답 형식은 저장소의 `shared/types.ts` 주석이 기준이다. 위키에 중복해 적지 않는다.
