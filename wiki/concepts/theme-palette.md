---
type: Concept
title: "테마와 팔레트"
description: "ColorHunt 팔레트를 Goodcase 토큰과 Tailwind 이름에 연결한 방식"
timestamp: 2026-10-18
okf_version: "0.1"
---

# 테마와 팔레트

기준 팔레트(운영자가 ColorHunt에서 고름): `#FFFAD3` 크림, `#FFDBB0` 피치, `#FFCCB8` 살구, `#FFB1B1` 분홍.
네 색이 모두 밝아서 버튼·포커스용 진한 장미색(`#B4424F`)을 파생했다. 정의 위치는 `src/shared/ui/styles/theme.css`, Tailwind 이름은 `app.css`의 `@theme inline`. 결정 배경: [ADR 0009](../decisions/0009-tailwind-with-goodcase-ui-layers.md)

| 역할 | 토큰 / Tailwind | 라이트 | 다크 | 대비 |
|---|---|---|---|---|
| 배경 | `--gc-bg` / `bg-bg` | #FFFDF0 | #1F1A18 | |
| 표면 | `--gc-surface` / `bg-surface` | #FFFFFF | #2A2321 | |
| 보조 표면 | `bg-surface-subtle` | #FFFAD3 | #352C29 | |
| 글자 | `--gc-text` / `text-ink` | #3A2F2C | #F4EBE4 | 12.7:1 |
| 보조 글자 | `text-muted` | #6B5A53 | #BBAAA1 | 6.4:1 |
| 테두리 | `border-line` | #EBCFAE | #4A3D38 | |
| 강조 | `--gc-accent` / `bg-accent` | #B4424F | #FFB1B1 | 흰 글자 5.5:1 |
| 강조 연한 배경 | `bg-accent-soft` | #FFCCB8 | #4A2F2E | 배경 전용 (강조 글자를 올리면 3.8:1) |
| 원고 종이 | `bg-paper` | #FFFFFF | #2A2321 | |
| 삭제 표시 | `diff-del` | #B52A36 | #F3A5AD | |
| 추가 표시 | `diff-add` / `diff-add-bg` | #1F6B43 / #E3F4E6 | #8FD9A8 / #1F3A2A | 5.7:1 |

- 팔레트 원색은 `cream`, `peach`, `apricot`, `pink`로도 쓸 수 있다. 관계도 노드 색(인물 분홍, 장소 피치, 세력 살구, 사물 크림)에 쓴다.
- 다크 모드는 `prefers-color-scheme`과 `[data-color-mode="dark"]` 둘 다 지원한다.
- 글꼴: UI는 Pretendard, 원고는 `font-manuscript`(RIDIBatang이 설치돼 있으면 그것, 아니면 Noto Serif KR).
- 컨트롤 높이 44px (터치 대상 크기).
