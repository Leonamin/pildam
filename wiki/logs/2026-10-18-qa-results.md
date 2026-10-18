---
type: Log
title: "QA 결과와 남은 위험"
description: "프로토타입 전체 흐름 QA에서 고친 결함과 남은 위험 기록"
timestamp: 2026-10-18
okf_version: "0.1"
---

# QA 결과와 남은 위험

연습용 AI로 전체 흐름을 실제 브라우저에서 확인하고 결함 10건을 고쳤다(화 전환 시 빈 화면, 대화상자 안 선택 목록 가림, 대화상자 첫 포커스, 빈 원고 첫 AI 쓰기 되돌리기, 선택 수정 메뉴 복귀·팝오버 위치, 새 노드 겹침, 쓰는 중 화 전환, 서버 연결 실패 문구, 첫 화 제목, 기록 문구). Storybook 상태 스토리 38개를 추가했다. 재현되지 않은 글 유실 1건과 남은 위험을 별도 문서로 남겼다.

- 추가: concepts/known-issues.md
- 갱신: concepts/index.md, logs/index.md
