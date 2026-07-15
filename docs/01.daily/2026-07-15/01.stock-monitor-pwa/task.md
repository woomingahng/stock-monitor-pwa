# Stock Monitor PWA - Task List

- `[/]` 1. 프로젝트 초기화
  - `[x]` `npx create-next-app` 실행 (Tailwind CSS, App Router 포함)
  - `[x]` `next-pwa` 패키지 설치 및 설정 (`next.config.ts` 수정, `manifest.json` 생성)
- `[/]` 2. API Routes 구현 (백엔드)
  - `[x]` `/api/search` 엔드포인트 구현 (네이버 자동완성 API 프록시)
  - `[x]` `/api/price` 엔드포인트 구현 (네이버 증권 현재가 크롤링/파싱)
- `[x]` 3. 프론트엔드 UI 및 로직 구현
  - `[x]` 메인 화면 UI 마크업 (다크모드, 위젯 스타일)
  - `[x]` 종목 검색 창 및 자동완성 드롭다운 UI 구현
  - `[x]` 관심 종목 및 다중 목표가 등록/삭제 기능 구현 (Local Storage 연동)
  - `[x]` 목표가 돌파 조건(상승/하락) 판별 로직 적용
- `[x]` 4. 백그라운드 폴링 및 알림 연동
  - `[x]` 브라우저 `Notification` 권한 요청 로직
  - `[x]` 10초 주기 `setInterval` 가격 조회 구현
  - `[x]` 조건 달성 시 토스트 알림 발생 및 달성 항목 삭제 처리
- `[x]` 5. 검증 및 배포 준비
  - `[x]` 로컬 구동 테스트 (UI, 알림, PWA 동작)
  - `[x]` Vercel 배포 안내 및 Walkthrough 작성
