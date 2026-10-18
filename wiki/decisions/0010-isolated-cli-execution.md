---
type: Decision
title: "0010. AI CLI는 도구 없이·격리해서 실행한다"
description: "공개 서비스에서 서버 CLI를 안전하게 호출하는 실행 옵션"
status: Accepted
timestamp: 2026-10-18
okf_version: "0.1"
---

# 0010. AI CLI는 도구 없이·격리해서 실행한다

## Context

필담은 공개 도메인에 노출되고, 서버의 로그인된 AI CLI를 사용자 입력으로 실행한다. CLI가 파일을 읽거나 명령을 실행하면 서버가 위험해진다. 사용자 설정(훅·플러그인·MCP)이 끼어들면 입력 토큰도 크게 늘어난다.

## Decision

모든 호출은 새 임시 폴더(`mkdtemp`, 끝나면 삭제)에서, 세션 이어 쓰기 없이, 5분 제한으로 실행한다. 동시에 최대 2개(넘으면 `ai_busy`).

| CLI | 옵션 | 출력 |
|---|---|---|
| claude | `-p --model M --tools "" --no-session-persistence --setting-sources "" --strict-mcp-config --disable-slash-commands --output-format stream-json --verbose --include-partial-messages`, 프롬프트는 stdin | `stream_event`의 `text_delta`로 실시간 |
| codex | `exec -m M -s read-only --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules --json -`, 프롬프트는 stdin | 끝에 한 번에 (`agent_message`) |
| agy | `--model M --output-format stream-json --sandbox --mode plan --print-timeout 300s -p=<프롬프트>` | `step_update`(agent_response, ACTIVE)로 실시간 |

- claude는 `--bare`가 API 키 전용이라 쓰지 못했다. 설정·MCP·슬래시 명령을 끄는 옵션으로 입력이 약 39k → 2.5k 토큰으로 줄었다.
- agy는 stdin을 읽지 않아 프롬프트를 인자로 넘긴다. `-p` 뒤에 다른 옵션이 오면 삼키므로 `-p=...` 형태로 붙인다. 인자 길이 한계(약 128KB) 때문에 120KB가 넘는 프롬프트는 400으로 거절하고 다른 AI를 권한다.
- 오류 문구에 한도·로그인 관련 단어(rate limit, quota, usage limit, login, 401, 429)가 있으면 `ai_unavailable`(다른 AI로 바꾸라는 안내), 그 외는 `ai_failed`.
- 개발·Storybook용 `PILDAM_AI_MOCK=1`이면 "연습용 AI"(mock)가 추가된다. CLI를 실행하지 않는다.

## Consequences

- 2026-10-18 세 CLI 모두 실제 1회 호출로 스트리밍을 확인했다(claude-opus-5-5, codex gpt-6.1-sol, agy gemini-3.8-flash-medium).
- 실제 한도 초과 오류 문구는 아직 보지 못해 판별 규칙은 추정이다. 실제로 겪으면 갱신한다.
- 매우 긴 소설에서 agy 인자 한계에 닿을 수 있다. 필요하면 agy `--input-format stream-json`을 검토한다.

## Status

Accepted
