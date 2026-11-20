# StudyQuest (MVP – Phase 1)
## التشغيل
1. ثبّت Node 18+ ، ثم على هاتفك ثبّت تطبيق **Expo Go**.
2. `cd studyquest && npm install && npx expo install --fix`
3. `npx expo start` ثم امسح QR بهاتفك (أندرويد: Expo Go / آيفون: الكاميرا).
## البنية
- `src/db.ts`  : مخطط SQLite + بيانات تجريبية + الإعدادات (يُحفظ كل شيء محلياً).
- `src/planner.ts` : خوارزمية الجدولة (حصة يومية = الحمل المتبقي ÷ أيام الدراسة المتبقية، أيام مراجعة قبل الامتحان، أيام راحة، تحذير + ساعات إضافية مقترحة، إعادة جدولة تلقائية).
- `App.tsx` : الشاشات (Home / Today / Subjects / Exams) + Focus Timer + إضافة مادة.
## المرحلة 2 (لم تُنفَّذ بعد)
AI Chat، Spaced Repetition (حقل mastery جاهز)، Calendar، Analytics، Notifications، العربية/RTL، الثيمات.
## بناء APK
`npm i -g eas-cli && eas login && eas build -p android --profile preview`
