import { db, iso, addDays, daysBetween, getSetting } from './db';

export type Warning = { subject: string; leftLessons: number; extraHoursPerDay: number };
const cost = (diff: number) => 25 + diff * 10; // minutes per lesson

/** Rebuilds the plan for all unfinished lessons, starting today.
 *  Called on app open and after every change => automatic rescheduling. */
export function replan(): Warning[] {
  const today = iso();
  const hours = parseFloat(getSetting('hours', '3'));
  const rest = getSetting('rest', '').split(',').filter(Boolean).map(Number); // 0=Sun..6=Sat
  const budget = hours * 60;
  const isRest = (d: number) => rest.includes(new Date(addDays(today, d) + 'T12:00:00').getDay());

  const subs = db.getAllSync<any>('SELECT * FROM subjects').map(s => {
    const lessons = db.getAllSync<{ id: number }>(
      `SELECT l.id FROM lessons l JOIN chapters c ON c.id=l.chapter_id
       WHERE c.subject_id=? AND l.done=0 ORDER BY c.position,l.position`, [s.id]);
    const left = daysBetween(today, s.exam_date);
    const revision = left >= 7 ? 2 : left >= 3 ? 1 : 0;          // days reserved for revision
    const last = Math.max(0, left - 1 - revision);                // last day lessons may be scheduled
    return { ...s, q: lessons.map(l => l.id), c: cost(s.difficulty), last,
             rem: lessons.length * cost(s.difficulty) };
  }).filter(s => s.q.length)
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date) || b.priority - a.priority);

  const workDaysLeft = (from: number, last: number) => {
    let n = 0; for (let d = from; d <= last; d++) if (!isRest(d)) n++; return Math.max(1, n);
  };
  db.runSync('DELETE FROM plan');
  const horizon = Math.min(365, Math.max(0, ...subs.map(s => s.last)));
  for (let d = 0; d <= horizon; d++) {
    if (isRest(d) && d !== 0) continue;
    let used = 0;
    for (const s of subs) {
      if (!s.q.length || d > s.last) continue;
      // Quota = remaining workload / remaining study days => big chapters automatically get more days
      const quota = s.rem / workDaysLeft(d, s.last);
      let got = 0;
      while (s.q.length && got < quota - 1e-9 && used + s.c <= budget + 15) {
        db.runSync('INSERT INTO plan(lesson_id,date) VALUES(?,?)', [s.q.shift(), addDays(today, d)]);
        got += s.c; used += s.c; s.rem -= s.c;
      }
    }
  }
  // Anything left didn't fit before its exam: warn + suggest more hours/day, park it on the last allowed day
  const warnings: Warning[] = [];
  for (const s of subs) if (s.q.length) {
    const days = workDaysLeft(0, s.last);
    warnings.push({ subject: s.name, leftLessons: s.q.length,
      extraHoursPerDay: Math.ceil((s.q.length * s.c) / 60 / days * 10) / 10 });
    s.q.forEach((id: number) => db.runSync('INSERT INTO plan(lesson_id,date) VALUES(?,?)', [id, addDays(today, s.last)]));
  }
  return warnings;
}
