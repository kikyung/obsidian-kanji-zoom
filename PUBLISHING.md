# 배포 체크리스트 (내일 할 일)

## 0. 자리표시자 바꾸기 (필수)
아래 값을 실제 값으로 바꾸세요. (`grep -rn YOUR_ .` 으로 한 번에 찾을 수 있어요)

| 자리표시자 | 바꿀 값 | 위치 |
| --- | --- | --- |
| ~~`YOUR_GITHUB_ID`~~ | ✅ `kikyung` 반영 완료 | `manifest.json` (authorUrl) |
| ~~`YOUR_BMC_ID`~~ | ✅ `buymeacoffee.com/kikyung` 반영 완료 | `manifest.json` (fundingUrl), `src/main.js` (FUNDING_URL), `README.md` |

> GitHub Sponsors나 Ko-fi를 추가하려면 `fundingUrl`을 객체로 여러 개 넣을 수 있어요:
> `"fundingUrl": { "Buy Me a Coffee": "https://...", "GitHub Sponsors": "https://..." }`

바꾼 뒤 `python3 tools/build.py` 다시 실행.

## 1. GitHub 저장소 (public)
1. 저장소 생성 (`obsidian-kanji-zoom`), public
2. 이 폴더를 push. `main.js`는 `.gitignore`에 있어서 올라가지 않아요(릴리스 첨부용).
3. README 데모 스크린샷/GIF를 `docs/`에 넣고 README의 TODO 주석 교체 (심사에 필수는 아니지만 강력 권장)

## 2. 첫 릴리스 (0.1.0)
1. 태그를 **`v` 없이** manifest 버전과 똑같이 만들어 push:
   ```bash
   git tag 0.1.0
   git push origin 0.1.0
   ```
2. GitHub Actions가 `main.js`를 빌드해 **draft 릴리스**를 만들어요 (첨부: `main.js`, `manifest.json`, `styles.css`).
3. Releases 페이지에서 내용 확인 후 **Publish release**.

## 3. 옵시디언 커뮤니티 플러그인 등록 신청
1. https://github.com/obsidianmd/obsidian-releases 를 fork
2. `community-plugins.json` **맨 끝**에 추가:
   ```json
   {
     "id": "kanji-zoom",
     "name": "Kanji Zoom",
     "author": "kikyung",
     "description": "Enlarge small kanji in Japanese study notes with a full-screen zoom viewer, furigana and hover lookups.",
     "repo": "kikyung/obsidian-kanji-zoom"
   }
   ```
   (`id`, `name`, `description`은 manifest.json과 정확히 같아야 해요. 2026-11-20 기준 `kanji-zoom` / `Kanji Zoom`은 사용 중인 곳이 없어요.)
3. PR 생성 → PR 템플릿 체크리스트 채우기 → 자동 검사 봇 통과 확인
4. 사람 심사는 보통 몇 주 걸려요. 리뷰 코멘트가 오면 수정 후 새 버전(0.1.1 등)으로 릴리스.
5. 승인되면 누구나 설정 → 커뮤니티 플러그인 → 탐색에서 검색해 설치할 수 있어요.

## 심사에서 자주 지적되는 것 (이미 반영함)
- [x] description에 "Obsidian" / "This plugin" 없음, 마침표로 끝남
- [x] id에 "obsidian" 없음
- [x] 기본 단축키 없음 (사용자가 지정)
- [x] `innerHTML` 사용 안 함 (DOM API만 사용)
- [x] 외부 네트워크 요청 없음 (한자사전은 main.js에 내장)
- [x] 데이터 출처·라이선스 표기 (README, LICENSE)
- [x] `fundingUrl`로 후원 링크 (플러그인 상세 페이지에 후원 버튼이 표시됨)

## 이후 버전 올리는 법
1. `manifest.json`의 `version` 올리기 (예: 0.1.1)
2. `versions.json`에 `"0.1.1": "1.4.0"` 추가
3. 커밋 → `git tag 0.1.1 && git push origin 0.1.1` → draft 릴리스 Publish
