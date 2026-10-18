---
type: Reference
title: "AI CLI 비대화형 모드"
description: "서버에 설치된 AI CLI의 비대화형 호출 방법과 사용 가능 모델"
timestamp: 2026-10-18
okf_version: "0.1"
---

# AI CLI 비대화형 모드

2026-10-18 서버 PC에서 확인한 내용.

| CLI | 비대화형 호출 | 참고 옵션 |
|---|---|---|
| Claude Code 2.1 | `claude -p` | `--model`, 도구 비활성화 |
| Codex | `codex exec` | `-c model=...`, `--sandbox read-only` |
| Antigravity | `agy -p` | `--model`, `--sandbox`, `--output-format json`, `--effort` |

## Antigravity 모델 (`agy models`)

- `gemini-4-argon-low` / `-medium` / `-high` — 사용자가 선호하는 모델
- `gemini-3.8-flash-low` / `-medium` / `-high`
- `claude-opus-5-5-*`, `claude-sonnet-5-5-*`
- `gpt-oss-120b-medium`

모델 목록은 CLI 업데이트에 따라 바뀌므로 `models.json` 갱신 시 다시 확인한다.
