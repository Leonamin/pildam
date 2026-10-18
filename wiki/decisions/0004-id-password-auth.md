---
type: Decision
title: "0004. 아이디·비밀번호 로그인을 직접 만든다"
description: "Cloudflare Access 대신 앱 자체 로그인"
status: Accepted
timestamp: 2026-10-18
okf_version: "0.1"
---

# 0004. 아이디·비밀번호 로그인을 직접 만든다

## 맥락

Cloudflare Access는 결제 수단 등록이 필요하다. 운영자는 카드를 등록하지 않는다.

## 결정

앱에 아이디·비밀번호 로그인을 직접 만든다.

- 계정 2개를 `users.json`에 둔다. 회원가입 화면은 없다.
- 비밀번호는 해시로 저장한다.
- 쿠키 세션(HttpOnly, Secure)으로 로그인을 유지한다.
- 로그인 실패 횟수를 제한한다.
- HTTPS는 Cloudflare 터널이 제공한다.
