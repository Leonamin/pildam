---
type: Log
title: "위키 초기 설정"
description: "필담 위키 구조 생성과 초기 설계 문서화"
timestamp: 2026-10-18
okf_version: "0.1"
---

# 위키 초기 설정

## 변경

- `./wiki`에 `concepts/`, `decisions/`, `references/`, `logs/` 구조와 각 `index.md`를 만들었다.
- `.agents/wiki-path`, `.agents/wiki-structure.md`에 위키 설정을 기록했다.
- 설계 대화에서 정한 내용을 문서화했다: 제품 개요, MVP 범위, 화면 구성, AI 작성 흐름, 컨텍스트 조립, 관계도, 데이터 구조, ADR 0001~0008, 조사 자료 3건.

## 이유

구현을 시작하기 전에 요구사항·조사·결정을 한곳에 모아 이후 세션과 작업자가 같은 기준으로 작업하게 하기 위해서다.

## 영향

- 이후 지식 갱신은 `wiki-update`, 조회는 `wiki-read`로 한다.
- 저장소가 공개이므로 비밀 값은 위키에 기록하지 않는다.
