# TestFlight Setup Checklist

Budget Calendar를 Expo Go 없이 iPhone에 설치해서 실생활 테스트하기 위한 순서입니다.

## 1. Apple Developer 확인

- [ ] Apple Developer Program 결제 완료
- [ ] https://developer.apple.com/account 접속 가능
- [ ] https://appstoreconnect.apple.com 접속 가능
- [ ] App Store Connect에서 계약/세금/은행 정보는 나중에 수익화 전에 설정

## 2. Expo 계정 확인

- [ ] Expo 계정 만들기 또는 로그인
- [ ] 로컬에서 로그인

```bash
cd /Users/kmjunseong/Desktop/project/budget-calendar/mobile-app
npx eas login
```

- [ ] 로그인 확인

```bash
npx expo whoami
```

## 3. 로컬 빌드 설정 확인

- [x] `eas-cli` 프로젝트 dev dependency 설치
- [x] `eas.json` 생성
- [x] iOS bundle identifier 설정: `com.kmjunseong.budgetcalendar`
- [x] Android package 설정: `com.kmjunseong.budgetcalendar`
- [x] TypeScript 체크 통과

## 4. EAS 프로젝트 연결

- [x] EAS 프로젝트 초기화

```bash
npx eas init
```

연결된 프로젝트:

- Expo owner: `pant5uf1ard`
- Project: `budget-calendar`
- Project ID: `303cb010-2c33-4c73-8569-d256262ed8cc`

## 5. iOS 빌드 생성

Apple Developer Portal에서 `Membership / Team ID`가 보인 뒤 진행합니다.

처음에는 TestFlight용 production 빌드보다 내부 설치 확인용 preview 빌드가 편합니다.

```bash
npx eas build --platform ios --profile preview --clear-credentials
```

진행 중 Apple 로그인, 팀 선택, 인증서/프로비저닝 생성 질문이 나오면 Expo가 안내하는 기본값으로 진행합니다.

## 6. TestFlight 업로드

App Store Connect/TestFlight까지 올릴 때:

```bash
npx eas build --platform ios --profile production
npx eas submit --platform ios
```

## 7. iPhone 테스트

- [ ] TestFlight 앱 설치
- [ ] Budget Calendar 초대/테스트 빌드 설치
- [ ] 하루 이상 실제 지출 입력
- [ ] 캘린더 재계산 확인
- [ ] 키보드/모달/설정 화면 확인

## 내일 이어가기 전 확인

- [ ] https://developer.apple.com/account 에서 Team ID 보이는지 확인
- [ ] https://appstoreconnect.apple.com 에서 약관 동의 남아있는지 확인
- [ ] `npx eas build --platform ios --profile preview --clear-credentials` 재시도
- [ ] Apple 로그인 후 팀 선택 화면이 뜨는지 확인

## 오늘 완료한 사전 준비

- [x] Expo/EAS 로그인 확인
- [x] EAS 프로젝트 연결
- [x] Bundle ID 설정
- [x] 암호화 면제 응답 저장: `ITSAppUsesNonExemptEncryption: false`
- [x] 임시 앱 아이콘 생성
- [x] 임시 스플래시 이미지 생성
- [x] Git 첫 커밋 생성

## 8. Android 병행 테스트

Android는 APK로 내부 테스트가 쉽습니다.

```bash
npx eas build --platform android --profile preview
```

생성된 APK를 Android 폰에 설치해서 Expo Go 없이 테스트합니다.
