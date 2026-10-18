---
type: Decision
title: "0009. 프론트엔드는 Tailwind v4 + Goodcase UI를 cascade layer로 함께 쓴다"
description: "스타일링 방식과 공용 컴포넌트 출처"
status: Accepted
timestamp: 2026-10-18
okf_version: "0.1"
---

# 0009. 프론트엔드는 Tailwind v4 + Goodcase UI를 cascade layer로 함께 쓴다

## Context

- 운영자 경험상 CSS Modules는 나중에 스타일이 겹쳐 문제를 일으켰다.
- 운영자가 미리 정해 둔 디자인 컴포넌트 키트 Goodcase UI(0.1.0)가 있다. 키트는 `gc-` 접두사 클래스를 쓰는 일반 CSS다.
- 키트 CSS가 layer 밖에 있으면 Tailwind 유틸리티(`@layer utilities`)보다 우선해 `px-*` 같은 유틸리티가 먹지 않았다.

## Decision

- 패키지 매니저 pnpm, 빌드 Vite, React 19 + TypeScript, 라우터 react-router, 아이콘 lucide-react, 접근성 오버레이 radix-ui.
- 스타일은 Tailwind CSS v4. CSS Modules와 CSS-in-JS는 쓰지 않는다.
- Goodcase UI 컴포넌트를 `src/shared/ui/`로 복사해 쓴다. 키트 CSS는 `app.css`에서 `@import ... layer(components)`(토큰·테마는 `layer(base)`)로 불러와 Tailwind 유틸리티가 항상 이기게 한다.
- 키트의 `--gc-*` 토큰을 필담 테마로 덮어쓰고, Tailwind `@theme inline`으로 노출한다. [테마와 팔레트](../concepts/theme-palette.md)

## Consequences

- 기능 코드는 `bg-surface text-ink` 같은 의미 이름의 유틸리티만 쓴다.
- 키트를 갱신할 때는 `src/shared/ui/README.md`의 버전·해시와 복사 목록을 기준으로 비교한다.
- 웹 UI 상태 재현은 Storybook 10(@storybook/react-vite)으로 한다.

## Status

Accepted
