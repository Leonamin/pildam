# shared/ui — Goodcase UI kit 사본

- 출처: use-goodcase-ui 스킬, kit version 0.1.0
- contentHash: 98fd9e12680840d2236a819392cf6da605492a8bf159dc5b97837fc1fbb4e032
- 복사한 컴포넌트: basic/{button(Button, IconButton), text-field, field, input, text-area, spinner, alert, card, switch, skeleton}, overlays/{dialog(Dialog, Drawer), menu, popover, select, tooltip, toast, tabs, types}, composed/confirm-dialog
- 스타일: styles/{tokens, basic, overlays, tabs, toast}.css 는 원본 그대로. `theme.css`가 필담 색으로 `--gc-*`를 덮어쓰고, `app.css`가 import 순서(tokens → theme → basic → overlays → tabs → toast)와 Tailwind `@theme`, global.css/composed.css 중 필요한 규칙만 합친다.
- 수정한 곳: composed/confirm-dialog.tsx — `trigger` 선택, `isOpen`/`onOpenChange` 제어 모드 추가.
- 자체 추가: Wordmark.tsx, layout/AppShell.tsx
- 추가 복사: basic/slider (Slider, 원본 그대로)
