import * as SQLite from 'expo-sqlite';
export const db = SQLite.openDatabaseSync('studyquest.db');

export const iso = (d = new Date()) => {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 6e4);
  return z.toISOString().slice(0, 10);
};
export const addDays = (s: string, n: number) => { const d = new Date(s + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); };
export const daysBetween = (a: string, b: string) =>
  Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 864e5);

export const getSetting = (k: string, def = '') =>
  (db.getFirstSync<{ v: string }>('SELECT v FROM settings WHERE k=?', [k])?.v) ?? def;
export const setSetting = (k: string, v: string) =>
  db.runSync('INSERT OR REPLACE INTO settings(k,v) VALUES(?,?)', [k, v]);

export function addSubject(name: string, color: string, examDate: string, difficulty: number, priority: number, chapters: number[]) {
  db.runSync('INSERT INTO subjects(name,color,exam_date,difficulty,priority) VALUES(?,?,?,?,?)', [name, color, examDate, difficulty, priority]);
  const sid = db.getFirstSync<{ id: number }>('SELECT last_insert_rowid() id')!.id;
  chapters.forEach((n, ci) => {
    db.runSync('INSERT INTO chapters(subject_id,title,position) VALUES(?,?,?)', [sid, `Chapter ${ci + 1}`, ci]);
    const cid = db.getFirstSync<{ id: number }>('SELECT last_insert_rowid() id')!.id;
    for (let l = 0; l < n; l++) db.runSync('INSERT INTO lessons(chapter_id,title,position) VALUES(?,?,?)', [cid, `Lesson ${l + 1}`, l]);
  });
}

export function init() {
  db.execSync(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS subjects(id INTEGER PRIMARY KEY, name TEXT, color TEXT, exam_date TEXT, difficulty INT DEFAULT 2, priority INT DEFAULT 2);
    CREATE TABLE IF NOT EXISTS chapters(id INTEGER PRIMARY KEY, subject_id INT REFERENCES subjects(id) ON DELETE CASCADE, title TEXT, position INT);
    CREATE TABLE IF NOT EXISTS lessons(id INTEGER PRIMARY KEY, chapter_id INT REFERENCES chapters(id) ON DELETE CASCADE, title TEXT, position INT, done INT DEFAULT 0, done_at TEXT, mastery INT DEFAULT 0);
    CREATE TABLE IF NOT EXISTS plan(lesson_id INT PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE, date TEXT);
    CREATE TABLE IF NOT EXISTS sessions(id INTEGER PRIMARY KEY, lesson_id INT, seconds INT, date TEXT);
    CREATE TABLE IF NOT EXISTS settings(k TEXT PRIMARY KEY, v TEXT);
  `);
  if (!db.getFirstSync('SELECT 1 x FROM subjects')) {
    const t = iso();
    addSubject('Java Programming', '#7C5CFF', addDays(t, 20), 3, 3, [5, 8, 6, 7]);
    addSubject('Mathematics', '#FF6B8A', addDays(t, 12), 2, 2, [6, 4, 9]);
    addSubject('Physics', '#2DD4A8', addDays(t, 30), 2, 1, [5, 5, 4]);
    setSetting('hours', '3'); setSetting('rest', '5'); setSetting('xp', '0');
  }
}
