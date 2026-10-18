# Wiki Structure

- Wiki path: ./wiki
- Format: OKF v0.1 style Markdown with YAML frontmatter
- Index policy: Every wiki directory contains index.md
- Change log: ./wiki/logs/

## Directory map

- concepts/: 제품·화면·AI 흐름·데이터 구조 같은 개념 문서
- decisions/: 번호가 있는 ADR (NNNN-kebab-case.md)
- references/: 외부 프로젝트·UI 레퍼런스·도구 조사
- logs/: 날짜·주제별 변경 이력

## Rules

- 문서 하나에 한 주제를 다룬다.
- 새 문서·디렉토리는 해당 index.md에 등록한다.
- 인덱스는 바로 아래 문서와 하위 인덱스만 안내한다.
- 로그는 YYYY-MM-DD-kebab-case.md로 만들고 logs/index.md에 최신순으로 등록한다.
- 공개 저장소이므로 토큰·비밀번호·개인 이메일 등 비밀 값은 기록하지 않는다.
