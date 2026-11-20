# 배포 가이드

Kanji Zoom을 릴리스하고 Obsidian 커뮤니티 디렉터리에 등록·유지하는 방법입니다.

## 현재 상태

| 항목 | 상태 |
| --- | --- |
| 저장소 | [kikyung/obsidian-kanji-zoom](https://github.com/kikyung/obsidian-kanji-zoom) (public) |
| 최신 릴리스 | [0.1.0](https://github.com/kikyung/obsidian-kanji-zoom/releases/tag/0.1.0) |
| 커뮤니티 디렉터리 | 등록 전 |
| 베타 배포 | BRAT에서 `kikyung/obsidian-kanji-zoom`으로 설치 가능 |

## 새 버전 릴리스

1. `manifest.json`의 `version`을 올립니다 (예: `0.1.1`).
2. `versions.json`에 `"0.1.1": "<minAppVersion>"` 항목을 추가합니다.
3. 배포 검사를 실행합니다. 실패하면 릴리스하지 않습니다.
   ```bash
   python3 tools/check.py --release
   ```
4. 변경 사항을 PR로 main에 머지합니다. CI(`check`) 통과가 필요합니다.
5. 버전과 같은 이름의 태그를 push합니다. 접두어 `v`는 붙이지 않습니다.
   ```bash
   git tag -a 0.1.1 -m "0.1.1"
   ```
   ```bash
   git push origin 0.1.1
   ```
6. Release 워크플로가 배포 검사 후 `main.js`를 빌드해 draft 릴리스를 만듭니다.
   첨부 파일은 `main.js`, `manifest.json`, `styles.css`입니다.
7. [Releases](https://github.com/kikyung/obsidian-kanji-zoom/releases)에서 내용을 확인하고 **Publish release**를 누릅니다.

커뮤니티 디렉터리에 등록된 뒤에는 새 릴리스를 Publish하는 것만으로 사용자에게 업데이트가 배포됩니다.

## 커뮤니티 디렉터리 등록

플러그인 등록은 [community.obsidian.md](https://community.obsidian.md)에서 합니다.
`obsidianmd/obsidian-releases`의 `community-plugins.json`은 이 디렉터리에서 자동으로 복사되므로 PR을 보내지 않습니다.
공식 문서: [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit+your+plugin)

1. community.obsidian.md에 Obsidian 계정으로 로그인합니다.
2. 프로필에서 GitHub 계정을 연결합니다. 저장소 소유자 확인에 사용됩니다.
3. **Add your plugin**에서 `kikyung/obsidian-kanji-zoom`을 선택합니다.
   디렉터리는 main 브랜치 최신 커밋의 `manifest.json`을 읽습니다.
4. 자동 심사 결과를 확인합니다. 오류가 있으면 수정 후 새 버전으로 릴리스합니다.
   오류가 해결되기 전에는 Obsidian에서 설치할 수 없습니다.

### 등록 요건

| 요건 | 현재 값 |
| --- | --- |
| 저장소 루트 파일 | `README.md`, `LICENSE`, `manifest.json` |
| 릴리스 태그 | manifest `version`과 동일 (`0.1.0`) |
| 릴리스 첨부 | `main.js`, `manifest.json`, `styles.css` |
| 플러그인 id | `kanji-zoom` — 고유, "obsidian" 미포함 |

## 심사 기준 대응

`tools/check.py`가 다음 항목을 자동으로 검사합니다. CI와 Release 워크플로에서도 같은 검사가 실행됩니다.

| 기준 | 대응 |
| --- | --- |
| manifest 규칙 | id 형식, 설명 문구("Obsidian" 미포함, 마침표로 끝남), 버전과 `versions.json` 일치 |
| 안전한 DOM 사용 | `innerHTML` 미사용, Obsidian Markdown 렌더러 사용 |
| 인라인 스타일 | CSS 클래스와 CSS 변수만 사용 |
| 기본 단축키 | 지정하지 않음 (사용자가 직접 설정) |
| 모바일 호환 | Node 전용 모듈 미사용, 정규식 lookbehind 미사용 |
| 네트워크 | 외부 요청 없음 (한자 사전은 `main.js`에 내장) |
| 데이터 라이선스 | KANJIDIC2 출처를 README, LICENSE, `main.js` 헤더에 표기 |

## 후원 링크

`manifest.json`의 `fundingUrl`(`https://buymeacoffee.com/kikyung`)은 플러그인 상세 페이지에 후원 버튼으로 표시됩니다.
여러 후원처를 함께 표시하려면 객체로 지정합니다.

```json
"fundingUrl": {
  "Buy Me a Coffee": "https://buymeacoffee.com/kikyung",
  "GitHub Sponsors": "https://github.com/sponsors/kikyung"
}
```

## 저장소 보호 설정

| 대상 | 규칙 |
| --- | --- |
| main 브랜치 | PR 필수, CI `check` 통과 필수, 리뷰 코멘트 해결 필수, squash 머지만 허용, 삭제·강제 푸시 금지 |
| 태그 | 생성·변경·삭제는 관리자만 가능 (태그 push가 릴리스를 만들기 때문) |
| GitHub Actions | GitHub 공식 Action만 허용, 기본 토큰 읽기 전용, 외부 기여자 워크플로는 승인 후 실행 |
| 보안 기능 | 비밀 정보 감지·push 차단, Dependabot 알림·보안 업데이트, 비공개 취약점 신고 |

관리자(kikyung)는 브랜치·태그 규칙의 예외입니다. 협업자를 추가하면 Settings → Rules → Protect main에서 필수 승인 수를 1 이상으로 올립니다.

## 공개 후 홍보

- [Obsidian 포럼 Share & showcase](https://forum.obsidian.md/c/share-showcase/9)
- Obsidian Discord `#updates` 채널 (developer 역할 필요)
