import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, Modal, TextInput, StyleSheet, SafeAreaView, StatusBar } from 'react-native';
import * as Haptics from 'expo-haptics';
import { db, init, iso, daysBetween, getSetting, setSetting, addSubject, addDays } from './src/db';
import { replan, Warning } from './src/planner';

const C = { bg: '#0E0B1A', card: '#1A1530', text: '#F5F3FF', mute: '#9A93BD', gold: '#FFC857', ok: '#2DD4A8', bad: '#FF6B8A' };
const XP_L = 25, XP_CH = 100;
type Tab = 'Home' | 'Today' | 'Subjects' | 'Exams';

const Bar = ({ p, color = C.gold }: { p: number; color?: string }) => (
  <View style={s.bar}><View style={{ width: `${Math.round(p * 100)}%`, height: 8, borderRadius: 4, backgroundColor: color }} /></View>
);

export default function App() {
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>('Home');
  const [tick, setTick] = useState(0);
  const [warn, setWarn] = useState<Warning[]>([]);
  const [toast, setToast] = useState('');
  const [focus, setFocus] = useState(false);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => { init(); setWarn(replan()); setReady(true); }, []);
  const refresh = () => { setWarn(replan()); setTick(t => t + 1); };
  const say = (m: string) => { setToast(m); setTimeout(() => setToast(''), 1600); };

  const data = useMemo(() => {
    if (!ready) return null;
    const today = iso();
    const subjects = db.getAllSync<any>('SELECT * FROM subjects ORDER BY exam_date').map(sub => {
      const chapters = db.getAllSync<any>('SELECT * FROM chapters WHERE subject_id=? ORDER BY position', [sub.id]).map(ch => {
        const lessons = db.getAllSync<any>('SELECT * FROM lessons WHERE chapter_id=? ORDER BY position', [ch.id]);
        return { ...ch, lessons, done: lessons.filter(l => l.done).length };
      });
      const total = chapters.reduce((a, c) => a + c.lessons.length, 0);
      const done = chapters.reduce((a, c) => a + c.done, 0);
      return { ...sub, chapters, total, done, days: daysBetween(today, sub.exam_date) };
    });
    const tasks = db.getAllSync<any>(
      `SELECT l.id,l.done,l.title,c.title chapter,s.name subject,s.color FROM lessons l
       JOIN chapters c ON c.id=l.chapter_id JOIN subjects s ON s.id=c.subject_id
       LEFT JOIN plan p ON p.lesson_id=l.id
       WHERE p.date=? OR l.done_at=? ORDER BY s.exam_date,c.position,l.position`, [today, today]);
    const doneDays = new Set(db.getAllSync<{ d: string }>('SELECT DISTINCT done_at d FROM lessons WHERE done_at IS NOT NULL').map(r => r.d));
    let streak = 0, d = doneDays.has(today) ? today : addDays(today, -1);
    while (doneDays.has(d)) { streak++; d = addDays(d, -1); }
    const mins = Math.round((db.getFirstSync<{ x: number }>('SELECT COALESCE(SUM(seconds),0) x FROM sessions WHERE date=?', [today])!.x) / 60);
    const xp = parseInt(getSetting('xp', '0'));
    return { subjects, tasks, streak, mins, xp, level: Math.floor(xp / 200) + 1,
      total: subjects.reduce((a, x) => a + x.total, 0), done: subjects.reduce((a, x) => a + x.done, 0) };
  }, [ready, tick]);

  if (!data) return null;
  const pct = data.total ? data.done / data.total : 0;
  const nextExam = data.subjects.find(x => x.days >= 0);

  const toggle = (id: number) => {
    const l = db.getFirstSync<any>('SELECT * FROM lessons WHERE id=?', [id])!;
    let xp = parseInt(getSetting('xp', '0'));
    if (l.done) {
      db.runSync('UPDATE lessons SET done=0,done_at=NULL WHERE id=?', [id]); xp = Math.max(0, xp - XP_L);
    } else {
      db.runSync('UPDATE lessons SET done=1,done_at=? WHERE id=?', [iso(), id]); xp += XP_L;
      const left = db.getFirstSync<{ n: number }>('SELECT COUNT(*) n FROM lessons WHERE chapter_id=? AND done=0', [l.chapter_id])!.n;
      if (!left) { xp += XP_CH; say(`+${XP_L + XP_CH} XP — Chapter completed! 🏆`); } else say(`+${XP_L} XP — Lesson completed!`);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    }
    setSetting('xp', String(xp)); refresh();
  };

  const doneToday = data.tasks.filter(t => t.done).length;
  const todayP = data.tasks.length ? doneToday / data.tasks.length : 0;

  const TaskRow = (t: any) => (
    <Pressable key={t.id} onPress={() => toggle(t.id)} style={[s.card, { flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4, borderLeftColor: t.color }]}>
      <Text style={{ fontSize: 22, marginRight: 12 }}>{t.done ? '✅' : '⬜'}</Text>
      <View><Text style={[s.h3, t.done && { textDecorationLine: 'line-through', opacity: 0.5 }]}>{t.subject}</Text>
        <Text style={s.mute}>{t.chapter} · {t.title}</Text></View>
    </Pressable>);

  return (
    <SafeAreaView style={s.root}>
      <StatusBar barStyle="light-content" />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 120 }}>
        {warn.map(w => (
          <View key={w.subject} style={[s.card, { backgroundColor: '#3A1830' }]}>
            <Text style={s.h3}>⚠️ {w.subject}: not enough time</Text>
            <Text style={s.mute}>{w.leftLessons} lessons won't fit. Study ~{w.extraHoursPerDay}h more per day, move the exam, or drop low-priority lessons.</Text>
          </View>))}

        {tab === 'Home' && <>
          <Text style={s.h1}>Good day! 🔥</Text>
          <Text style={s.mute}>Small steps every day beat cramming.</Text>
          <View style={s.card}>
            <Text style={s.mute}>Level {data.level} · {data.xp} XP</Text>
            <Bar p={(data.xp % 200) / 200} />
            <Text style={[s.h2, { marginTop: 14 }]}>{Math.round(pct * 100)}% overall</Text>
            <Bar p={pct} color={C.ok} />
            <Text style={s.mute}>{data.done} / {data.total} lessons completed</Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <View style={[s.card, { flex: 1 }]}><Text style={s.h2}>🔥 {data.streak}</Text><Text style={s.mute}>day streak</Text></View>
            <View style={[s.card, { flex: 1 }]}><Text style={s.h2}>⏳ {nextExam ? nextExam.days : '–'}</Text><Text style={s.mute}>days to next exam</Text></View>
            <View style={[s.card, { flex: 1 }]}><Text style={s.h2}>⏱ {data.mins}m</Text><Text style={s.mute}>studied today</Text></View>
          </View>
          <View style={s.card}><Text style={s.h3}>📚 Today's mission: {data.tasks.length} lessons</Text><Bar p={todayP} color={C.ok} />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
              <Text style={[s.mute, { flex: 1 }]}>Available hours per day</Text>
              {[-0.5, 0.5].map(n => <Pressable key={n} style={s.chip} onPress={() => { setSetting('hours', String(Math.max(0.5, parseFloat(getSetting('hours', '3')) + n))); refresh(); }}><Text style={s.h3}>{n > 0 ? '+' : '−'}</Text></Pressable>)}
              <Text style={[s.h3, { marginLeft: 8 }]}>{getSetting('hours', '3')}h</Text>
            </View></View>
          <Pressable style={s.cta} onPress={() => setFocus(true)}><Text style={s.ctaT}>Start Studying</Text></Pressable>
        </>}

        {tab === 'Today' && <>
          <Text style={s.h1}>Today's Missions</Text>
          <Text style={s.mute}>Daily progress {Math.round(todayP * 100)}%</Text><Bar p={todayP} color={C.ok} />
          {todayP === 1 && data.tasks.length > 0 && <Text style={[s.h2, { textAlign: 'center', marginVertical: 12 }]}>🎉🎊 All missions done! 🎊🎉</Text>}
          {data.tasks.length === 0 && <Text style={[s.mute, { marginTop: 30, textAlign: 'center' }]}>Nothing planned today. Add a subject or enjoy your rest day 🌿</Text>}
          <View style={{ marginTop: 12 }}>{data.tasks.map(TaskRow)}</View>
        </>}

        {tab === 'Subjects' && <>
          <Text style={s.h1}>Subjects</Text>
          {data.subjects.map(sub => (
            <View key={sub.id} style={[s.card, { borderLeftWidth: 4, borderLeftColor: sub.color }]}>
              <Pressable onPress={() => setOpen(open === sub.id ? null : sub.id)}>
                <Text style={s.h3}>{sub.name}</Text>
                <Text style={s.mute}>{sub.done}/{sub.total} lessons · exam {sub.exam_date}</Text>
                <Bar p={sub.total ? sub.done / sub.total : 0} color={sub.color} />
              </Pressable>
              {open === sub.id && sub.chapters.map((ch: any) => (
                <View key={ch.id} style={{ marginTop: 12 }}>
                  <Text style={s.h3}>{ch.title} · {Math.round(ch.lessons.length ? (ch.done / ch.lessons.length) * 100 : 0)}%</Text>
                  <Bar p={ch.lessons.length ? ch.done / ch.lessons.length : 0} color={sub.color} />
                  {ch.lessons.map((l: any) => (
                    <Pressable key={l.id} onPress={() => toggle(l.id)} style={{ paddingVertical: 6 }}>
                      <Text style={[s.text, l.done && { opacity: 0.5 }]}>{l.done ? '✅' : '⬜'}  {l.title}</Text>
                    </Pressable>))}
                  <Pressable onPress={() => { const n = ch.lessons.length + 1; db.runSync('INSERT INTO lessons(chapter_id,title,position) VALUES(?,?,?)', [ch.id, `Lesson ${n}`, n]); refresh(); }}>
                    <Text style={{ color: sub.color, marginTop: 4 }}>+ Add lesson</Text></Pressable>
                </View>))}
              {open === sub.id && <Pressable onPress={() => { db.runSync('DELETE FROM subjects WHERE id=?', [sub.id]); refresh(); }}><Text style={{ color: C.bad, marginTop: 14 }}>Delete subject</Text></Pressable>}
            </View>))}
          <Pressable style={s.cta} onPress={() => setAdding(true)}><Text style={s.ctaT}>+ Add subject</Text></Pressable>
        </>}

        {tab === 'Exams' && <>
          <Text style={s.h1}>Exam Countdown</Text>
          {data.subjects.map(sub => {
            const rem = sub.total - sub.done;
            // status looks at remaining WORK per remaining day, not only days left
            const perDay = sub.days > 0 ? rem / sub.days : rem;
            const st = rem === 0 ? 'Ready ✅' : sub.days < 0 ? 'Exam passed' : perDay > parseFloat(getSetting('hours', '3')) * 1.5 ? 'Behind schedule' : 'On track';
            const col = st === 'Behind schedule' ? C.bad : st === 'On track' || st === 'Ready ✅' ? C.ok : C.mute;
            return (<View key={sub.id} style={[s.card, { borderColor: col, borderWidth: 1 }]}>
              <Text style={s.h2}>{sub.name}</Text>
              <Text style={s.mute}>⏳ {sub.days < 0 ? 'Passed' : `${sub.days} days left`} · {sub.exam_date}</Text>
              <Bar p={sub.total ? sub.done / sub.total : 0} color={col} />
              <Text style={s.mute}>{sub.done}/{sub.total} done · {rem} remaining</Text>
              <Text style={{ color: col, fontWeight: '700', marginTop: 4 }}>{st}</Text></View>);
          })}
        </>}
      </ScrollView>

      {!!toast && <View style={s.toast}><Text style={s.h3}>{toast}</Text></View>}
      <View style={s.nav}>{(['Home', 'Today', 'Subjects', 'Exams'] as Tab[]).map(t => (
        <Pressable key={t} onPress={() => setTab(t)} style={{ flex: 1, alignItems: 'center', padding: 14 }}>
          <Text style={{ color: tab === t ? C.gold : C.mute, fontWeight: '700' }}>{t}</Text></Pressable>))}</View>

      <FocusModal visible={focus} onClose={() => { setFocus(false); refresh(); }} tasks={data.tasks.filter(t => !t.done)} />
      <AddModal visible={adding} onClose={() => { setAdding(false); refresh(); }} />
    </SafeAreaView>);
}

function FocusModal({ visible, onClose, tasks }: any) {
  const [min, setMin] = useState(25), [left, setLeft] = useState(25 * 60), [run, setRun] = useState(false), [pick, setPick] = useState<number | null>(null);
  useEffect(() => { if (!run) return; const i = setInterval(() => setLeft(x => x - 1), 1000); return () => clearInterval(i); }, [run]);
  useEffect(() => { if (left <= 0 && run) { setRun(false); save(min * 60); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}); } }, [left]);
  const save = (sec: number) => { if (sec > 0) db.runSync('INSERT INTO sessions(lesson_id,seconds,date) VALUES(?,?,?)', [pick ?? tasks[0]?.id ?? null, sec, iso()]); };
  const close = () => { if (run || left < min * 60) save(min * 60 - Math.max(left, 0)); setRun(false); setLeft(min * 60); onClose(); };
  return (<Modal visible={visible} animationType="slide"><SafeAreaView style={[s.root, { padding: 20 }]}>
    <Text style={s.h1}>Focus</Text>
    <View style={{ flexDirection: 'row', gap: 8, marginVertical: 12 }}>{[25, 45, 60].map(m => (
      <Pressable key={m} style={[s.chip, min === m && { backgroundColor: C.gold }]} onPress={() => { setMin(m); setLeft(m * 60); setRun(false); }}>
        <Text style={{ color: min === m ? '#000' : C.text }}>{m} min</Text></Pressable>))}</View>
    <Text style={s.mute}>Studying (pick a lesson):</Text>
    {tasks.slice(0, 4).map((t: any) => (<Pressable key={t.id} onPress={() => setPick(t.id)} style={[s.card, (pick ?? tasks[0]?.id) === t.id && { borderColor: C.gold, borderWidth: 1 }]}>
      <Text style={s.text}>{t.subject} · {t.chapter} · {t.title}</Text></Pressable>))}
    <Text style={s.timer}>{String(Math.floor(Math.max(left, 0) / 60)).padStart(2, '0')}:{String(Math.max(left, 0) % 60).padStart(2, '0')}</Text>
    <Pressable style={s.cta} onPress={() => setRun(!run)}><Text style={s.ctaT}>{run ? 'Pause' : 'Start'}</Text></Pressable>
    <Pressable onPress={close} style={{ padding: 16 }}><Text style={[s.mute, { textAlign: 'center' }]}>Finish & close (time is saved)</Text></Pressable>
  </SafeAreaView></Modal>);
}

function AddModal({ visible, onClose }: any) {
  const [name, setName] = useState(''), [days, setDays] = useState('30'), [ch, setCh] = useState('5,8,6');
  const save = () => {
    const chapters = ch.split(',').map(x => parseInt(x.trim())).filter(n => n > 0);
    if (!name.trim() || !chapters.length) return;
    const colors = ['#7C5CFF', '#FF6B8A', '#2DD4A8', '#FFC857', '#4DA3FF'];
    addSubject(name.trim(), colors[Math.floor(Math.random() * colors.length)], addDays(iso(), parseInt(days) || 30), 2, 2, chapters);
    setName(''); onClose();
  };
  return (<Modal visible={visible} animationType="slide"><SafeAreaView style={[s.root, { padding: 20 }]}>
    <Text style={s.h1}>New subject</Text>
    {[['Name', name, setName], ['Days until exam', days, setDays], ['Lessons per chapter (e.g. 5,8,6)', ch, setCh]].map(([l, v, f]: any) => (
      <View key={l}><Text style={[s.mute, { marginTop: 14 }]}>{l}</Text><TextInput value={v} onChangeText={f} style={s.input} placeholderTextColor={C.mute} /></View>))}
    <Pressable style={s.cta} onPress={save}><Text style={s.ctaT}>Save subject</Text></Pressable>
    <Pressable onPress={onClose} style={{ padding: 16 }}><Text style={[s.mute, { textAlign: 'center' }]}>Cancel</Text></Pressable>
  </SafeAreaView></Modal>);
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  card: { backgroundColor: C.card, borderRadius: 22, padding: 16, marginTop: 12 },
  h1: { color: C.text, fontSize: 30, fontWeight: '800' }, h2: { color: C.text, fontSize: 22, fontWeight: '800' },
  h3: { color: C.text, fontSize: 16, fontWeight: '700' }, text: { color: C.text, fontSize: 15 }, mute: { color: C.mute, fontSize: 13, marginTop: 2 },
  bar: { height: 8, borderRadius: 4, backgroundColor: '#2C2650', marginVertical: 8 },
  cta: { backgroundColor: C.gold, borderRadius: 20, padding: 18, marginTop: 18, alignItems: 'center' }, ctaT: { color: '#1A1530', fontSize: 18, fontWeight: '800' },
  chip: { backgroundColor: '#2C2650', borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, marginLeft: 6 },
  nav: { position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', backgroundColor: '#150F28', paddingBottom: 14 },
  toast: { position: 'absolute', top: 60, alignSelf: 'center', backgroundColor: '#2C2650', padding: 14, borderRadius: 18 },
  timer: { color: C.text, fontSize: 72, fontWeight: '800', textAlign: 'center', marginVertical: 24 },
  input: { backgroundColor: C.card, color: C.text, borderRadius: 14, padding: 14, marginTop: 6, fontSize: 16 },
});
