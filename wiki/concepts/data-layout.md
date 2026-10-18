---
type: Concept
title: "데이터 구조"
description: "작품·원고·설정·이력의 파일 저장 구조"
timestamp: 2026-10-18
okf_version: "0.1"
---

# 데이터 구조

데이터베이스 없이 읽을 수 있는 파일로 저장한다. 근거: [ADR 0005](../decisions/0005-file-based-storage.md).

```
/opt/pildam-data/
  users.json                  # 계정 2개 (비밀번호는 해시)
  models.json                 # 허용 모델 + 별명
  works/<작품ID>/
    work.json                 # 제목, 수정시간, 기본 모델, 챕터 순서·제목
    world.txt                 # 세계관 줄글 (규칙·배경)
    style.txt                 # 문체 지시
    graph.json                # 노드 + 관계선(시작화~끝화)
    notes.txt                 # 메모
    chapters/<챕터ID>.txt          # 원고 본문 (문단 = 빈 줄로 구분)
    chapters/<챕터ID>.summary.txt  # AI 요약
    chat/<챕터ID>.jsonl            # 지시 기록 (AI에는 최근 몇 개만)
    history/<챕터ID>/<시각>.txt     # 스냅샷 (AI 적용 직전, 최근 50개)
```

## 규칙

- 챕터 파일 이름은 순서 번호가 아니라 ID다. 순서는 `work.json`에서만 관리한다.
- 원고는 일반 텍스트다. 수정 표시(취소선·밑줄)는 화면에서만 보이고 저장하지 않는다.
- 같은 챕터를 두 사람이 동시에 고치면, 저장할 때 수정 시간을 비교해 충돌을 경고한다. 실시간 공동 편집은 하지 않는다.
- 배포는 이 폴더를 건드리지 않는다. [ADR 0007](../decisions/0007-deploy-with-release-symlink-and-systemd.md)
- 백업은 폴더 복사로 끝난다.

## models.json 예시

```json
[
  { "provider": "agy", "model": "gemini-4-argon-high", "alias": "꼼꼼한 작가" },
  { "provider": "claude", "model": "claude-opus-5-5" }
]
```

별명이 없으면 화면에 모델 원문만 표시한다.

## 구현 결과 (2026-10-18)

- 데이터 폴더 루트에 `sessions.json`(로그인 세션, 토큰 해시만 저장, 30일)이 추가로 생긴다.
- 화·설정 문서·관계도의 `updatedAt`은 각 파일이 아니라 `work.json`에 모아 둔다.
- 스냅샷 파일 이름은 `<시각>_<사유>.txt`(예: `2026-10-18T05-32-12-401Z_ai-write.txt`)이고 이것이 스냅샷 ID다.
- 모든 쓰기는 임시 파일에 쓴 뒤 이름을 바꾸는 원자적 쓰기이고, 작품 단위로 순서대로 처리한다.
- `models.json`이 없으면 기본값을 만든다: agy Gemini 4 Argon high("꼼꼼한 작가")·medium, Gemini 3.8 Flash medium("빠른 작가"), claude-opus-5-5, codex 기본 모델.
- ID는 `^[a-z0-9-]{1,40}$`만 허용해 경로 조작을 막는다.

## 설정 노트 (2026-10-18 추가)

```
works/<작품ID>/
  notes.json            # 노트 목록·순서 (id, title, folder, pinned, recap, size, updatedAt)
  notes/<노트ID>.txt    # 노트 본문
  style.txt             # 문체 (세계관·메모 문서는 노트로 이관됨)
  world.txt.migrated    # 이관 전 원본 보존
  notes.txt.migrated
  chat/<화ID>.jsonl · chat/style.jsonl · chat/graph.jsonl · chat/note-<노트ID>.jsonl   # 대상별 지시 기록
```

- 폴더는 노트의 `folder` 문자열일 뿐이고 폴더 안에 폴더는 없다. 결정 배경: [ADR 0011](../decisions/0011-setting-notes-and-server-side-note-selection.md)
- 노트 제목·폴더·고정을 바꿔도 노트의 `updatedAt`은 그대로라서 본문 저장 충돌(409)을 일으키지 않는다.
