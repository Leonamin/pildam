# 배포

서버 PC(hamsbox)에서 systemd **사용자 서비스**로 돌린다 (nomi-web과 같은 방식). 근거: wiki/decisions/0007.

## 처음 한 번

```sh
cp deploy/pildam.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable pildam      # 첫 배포 때 시작된다
loginctl enable-linger leonamin     # 로그아웃해도, 재부팅 뒤에도 유지 (이미 켜 두었다면 생략)
```

계정 만들기 (데이터 폴더는 첫 배포가 만든다):

```sh
PILDAM_DATA=/opt/pildam-data pnpm add-user <아이디>   # 비밀번호는 프롬프트로 입력
```

Cloudflare 터널: Zero Trust → Tunnels → 기존 터널 → Public Hostname 추가
`pildam.leonamin.com` → `HTTP` `127.0.0.1:8310`.

## 배포

```sh
deploy/deploy.sh
```

빌드 → `/opt/pildam/releases/<UTC시각>/` 복사 → `current` 링크 교체 → `systemctl --user restart pildam`. 최근 5개 릴리스만 남긴다. `/opt/pildam-data`(계정, 작품, 모델 목록)는 건드리지 않는다.

- 로그: `journalctl --user -u pildam -f`
- 모델 목록: `/opt/pildam-data/models.json` (없으면 첫 실행 때 기본값 생성). 수정 후 재시작 불필요.
- 되돌리기: `ln -sfn /opt/pildam/releases/<이전> /opt/pildam/current && systemctl --user restart pildam`
