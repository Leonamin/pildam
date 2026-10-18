---
type: Reference
title: "기존 프로젝트 조사"
description: "셀프호스팅 후보 AI 소설 도구와 AI CLI 웹 래퍼 조사 결과"
timestamp: 2026-10-18
okf_version: "0.1"
---

# 기존 프로젝트 조사

조사일: 2026-10-18. 결론은 [ADR 0001](../decisions/0001-build-custom-instead-of-self-host.md).

## AI 소설 작성 도구 (오픈소스)

| 프로젝트 | 특징 | 필담에 맞지 않는 이유 |
|---|---|---|
| [AI-Novel-Writing-Assistant](https://github.com/ExplosiveCoderflome/AI-Novel-Writing-Assistant) | 세계관·인물·문체 엔진, 자동 연출, RAG, Plate 리치 에디터. AGPL-3.0 | API 키 방식, 기능 과다, 중국어 |
| [NovelForge](https://github.com/RhythmicWave/NovelForge) | 카드형 설정, Neo4j 지식 그래프로 인물 관계 추적 | API 키 방식, Neo4j 필요 |
| [OpenWrite](https://github.com/ilrein/openwrite) | 자체 API 키·Ollama, 셀프호스팅 DB | API 키 방식, 활동 적음 |
| show-me-the-story, easy-writing, StoryMoss 등 | 단일 바이너리·데스크탑 앱 | API 키 방식 또는 데스크탑 전용 |

## AI CLI 웹 래퍼

| 프로젝트 | 특징 | 맞지 않는 이유 |
|---|---|---|
| [CloudCLI (claudecodeui)](https://github.com/siteboon/claudecodeui) | Claude Code · Codex · Cursor CLI 웹/모바일 UI | 코딩용 화면, 단일 사용자 |
| Kanna, Claudex, claude-code-web | 다중 공급자 지원 | 코딩용, 개발 중 |

## 상용 도구에서 가져올 아이디어

- **Sudowrite**: Story Bible(설정집을 AI가 참조), 선택 영역 다시 쓰기, Show Don't Tell.
- **Novelcrafter**: Codex(세계관 데이터베이스).
