import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Trophy, Calendar as CalendarIcon, CheckCircle, Circle, 
  Plus, Settings, Copy, Trash2, Users, ChevronLeft, 
  ChevronRight, X, Medal, Award, Edit2, ArrowLeft,
  Sparkles, PartyPopper, AlertTriangle, LogOut
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInWithPopup, 
  signInWithRedirect, 
  getRedirectResult, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  setPersistence,
  browserLocalPersistence
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  deleteDoc, 
  query, 
  where 
} from 'firebase/firestore';

// --- Firebase 初始化 ---
// ⚠️ 務必在此處填入您從 Firebase Console 取得的金鑰 ⚠️
// 💡 特別檢查：authDomain 必須與您的 Vercel 網址或 firebaseapp.com 一致
const firebaseConfig = {
  apiKey: "AIzaSyDOEU8JitsOszMaQyBt2dhD-9iF4f1ZVs8",
  authDomain: "my-habit-tracker-v1.firebaseapp.com",
  projectId: "my-habit-tracker-v1",
  storageBucket: "my-habit-tracker-v1.firebasestorage.app",
  messagingSenderId: "503984172880",
  appId: "1:503984172880:web:70bd60cb6fd9b33a498655",
  measurementId: "G-JV4VBHSL9X"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'gamified-cute-tracker';

// --- 工具函數 ---
const formatLocal = (date) => {
  const d = new Date(date);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const getWeekId = (dateString) => {
  const d = new Date(dateString);
  const day = d.getDay();
  const diff = d.getDate() - day;
  const sunday = new Date(d.setDate(diff));
  return formatLocal(sunday);
};

const getPreviousWeekId = (currentWeekId) => {
  const d = new Date(currentWeekId);
  d.setDate(d.getDate() - 7);
  return formatLocal(d);
};

const getWeekRange = (weekId) => {
  const start = new Date(weekId);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  return `${weekId} ~ ${formatLocal(end)}`;
};

const getMedal = (score) => {
  if (score >= 680) return { name: '金牌', bg: 'bg-yellow-100 text-yellow-700', border: 'border-yellow-400', icon: '👑' };
  if (score >= 450) return { name: '銀牌', bg: 'bg-slate-200 text-slate-700', border: 'border-slate-400', icon: '⭐' };
  if (score >= 200) return { name: '銅牌', bg: 'bg-orange-100 text-orange-800', border: 'border-orange-400', icon: '✨' };
  return { name: '無', bg: 'bg-pink-50 text-pink-400', border: 'border-pink-200', icon: '🌱' };
};

// --- 特效控制 ---
const triggerConfetti = (type) => {
  if (!window.confetti) return;
  if (type === 'fireworks') {
    const duration = 3 * 1000;
    const end = Date.now() + duration;
    (function frame() {
      window.confetti({ particleCount: 5, angle: 60, spread: 55, origin: { x: 0 }, colors: ['#ffb7b2', '#e2f0cb', '#b5ead7', '#ff9aa2'] });
      window.confetti({ particleCount: 5, angle: 120, spread: 55, origin: { x: 1 }, colors: ['#ffb7b2', '#e2f0cb', '#b5ead7', '#ff9aa2'] });
      if (Date.now() < end) requestAnimationFrame(frame);
    }());
  } else {
    window.confetti({ particleCount: 80, spread: 70, origin: { y: 0.6 }, colors: ['#ff9aa2', '#c7ceea', '#b5ead7', '#e2f0cb'] });
  }
};

// --- 主要應用程式元件 ---
export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [isProcessing, setIsProcessing] = useState(true); 
  const [activeTab, setActiveTab] = useState('today'); 
  const [toastMsg, setToastMsg] = useState('');
  
  const [tasks, setTasks] = useState([]);
  const [dailyScores, setDailyScores] = useState([]);
  const [preferences, setPreferences] = useState([]);
  const [profile, setProfile] = useState({ displayName: '' });
  const [leaderboard, setLeaderboard] = useState([]);

  const [viewingHistoryDate, setViewingHistoryDate] = useState(null);
  const [deleteDialog, setDeleteDialog] = useState({ isOpen: false, task: null, activeDateStr: null });
  const [showResultModal, setShowResultModal] = useState(false);
  const [resultData, setResultData] = useState(null);

  const todayDateStr = formatLocal(new Date());
  const currentWeekId = getWeekId(todayDateStr);

  const showToast = useCallback((msg) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(''), 3000);
  }, []);

  // 1. 載入特效腳本
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/canvas-confetti@1.9.3/dist/confetti.browser.min.js';
    script.async = true;
    document.body.appendChild(script);
    return () => { if (document.body.contains(script)) document.body.removeChild(script); };
  }, []);

  // 2. 強化版 Auth 監聽：解決手機登入迴圈
  useEffect(() => {
    const initAuth = async () => {
      try {
        // A. 強制持久化登入狀態
        await setPersistence(auth, browserLocalPersistence);

        // B. 檢查是否是從 Redirect 回來的
        const result = await getRedirectResult(auth);
        if (result?.user) {
          setUser(result.user);
          console.log("Redirect Login Success");
        }
      } catch (error) {
        console.error("Auth Init Error:", error);
        // 如果是跨網域問題，這裡會報錯
        if (error.code === 'auth/cross-origin-isolated-biometric-fallback') {
          showToast("瀏覽器限制了登入，請嘗試在一般分頁開啟。");
        }
      } finally {
        // C. 監聽狀態變化 (這是最準確的登入判斷)
        const unsub = onAuthStateChanged(auth, (u) => {
          setUser(u);
          setAuthReady(true);
          setIsProcessing(false);
        });
        return unsub;
      }
    };

    const unsubAuth = initAuth();
    return () => { if (typeof unsubAuth === 'function') unsubAuth(); };
  }, [showToast]);

  const handleGoogleLogin = async () => {
    const provider = new GoogleAuthProvider();
    // 讓每次登入都強制顯示帳號選擇器 (解決自動跳轉問題)
    provider.setCustomParameters({ prompt: 'select_account' });
    
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    setIsProcessing(true);

    try {
      if (isMobile) {
        await signInWithRedirect(auth, provider);
      } else {
        const result = await signInWithPopup(auth, provider);
        setUser(result.user);
        setIsProcessing(false);
      }
    } catch (error) {
      console.error(error);
      showToast("無法啟動登入視窗。");
      setIsProcessing(false);
    }
  };

  // 3. 監聽 Firestore 資料 (保持不變)
  useEffect(() => {
    if (!user) return;
    const privatePath = (col) => collection(db, 'artifacts', appId, 'users', user.uid, col);
    const publicPath = (col) => collection(db, 'artifacts', appId, 'public', 'data', col);

    const unsubs = [
      onSnapshot(privatePath('tasks'), snap => setTasks(snap.docs.map(d => ({ ...d.data(), id: d.id }))), err => console.error(err)),
      onSnapshot(privatePath('daily_scores'), snap => setDailyScores(snap.docs.map(d => d.data())), err => console.error(err)),
      onSnapshot(privatePath('preferences'), snap => setPreferences(snap.docs.map(d => d.data())), err => console.error(err)),
      onSnapshot(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), snap => {
        if (snap.exists()) setProfile(snap.data());
        else setProfile({ displayName: user.displayName || `玩家_${user.uid.substring(0, 4)}` });
      }, err => console.error(err)),
      onSnapshot(publicPath('leaderboard'), snap => setLeaderboard(snap.docs.map(d => d.data())), err => console.error(err))
    ];
    return () => unsubs.forEach(unsub => unsub());
  }, [user]);

  // 結算報告邏輯 (保持不變)
  useEffect(() => {
    if (!user || !profile?.displayName) return;
    const prevWeekId = getPreviousWeekId(currentWeekId);
    if (profile.lastSeenResultWeekId !== prevWeekId && dailyScores.length > 0) {
       let prevScore = 0;
       for (let i = 0; i < 7; i++) {
          const d = new Date(prevWeekId); d.setDate(d.getDate() + i);
          const ds = dailyScores.find(x => x.date === formatLocal(d));
          if (ds) prevScore += ds.score;
       }
       const prevLb = leaderboard.filter(e => e.weekId === prevWeekId).sort((a,b)=>b.score - a.score);
       const myRankIdx = prevLb.findIndex(e => e.userId === user.uid);
       setResultData({ weekId: prevWeekId, score: prevScore, rank: myRankIdx >= 0 ? myRankIdx + 1 : null });
       setShowResultModal(true);
    }
  }, [user, profile, currentWeekId, dailyScores, leaderboard]);

  const closeResultModal = async () => {
    setShowResultModal(false);
    const prevWeekId = getPreviousWeekId(currentWeekId);
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), { lastSeenResultWeekId: prevWeekId }, { merge: true });
  };

  const getTasksForDate = useCallback((allTasks, targetDateStr) => {
    return allTasks.filter(task => {
      if (task.excludedDates?.includes(targetDateStr)) return false;
      if (task.endDate && targetDateStr > task.endDate) return false;
      if (task.recurrence === 'once') return task.date === targetDateStr;
      if (task.createdAt > targetDateStr) return false;
      if (task.recurrence === 'daily') return true;
      if (task.recurrence === 'weekly') return task.recurrenceValue === new Date(targetDateStr).getDay().toString();
      if (task.recurrence === 'monthly') {
        const targetD = new Date(targetDateStr);
        const lastDay = new Date(targetD.getFullYear(), targetD.getMonth() + 1, 0).getDate();
        return targetD.getDate() === Math.min(Number(task.recurrenceValue), lastDay);
      }
      return false;
    });
  }, []);

  const getScoreInfoForDate = useCallback((targetDateStr) => {
    const dayTasks = getTasksForDate(tasks, targetDateStr);
    const rawScore = dayTasks.reduce((acc, t) => acc + (t.completedDates?.includes(targetDateStr) ? Number(t.points) : 0), 0);
    return { tasks: dayTasks, score: Math.min(100, rawScore) };
  }, [tasks, getTasksForDate]);

  const { score: cappedTodayScore } = getScoreInfoForDate(todayDateStr);
  const currentWeekScore = useMemo(() => {
    let total = 0;
    const startDate = new Date(currentWeekId);
    for (let i = 0; i < 7; i++) {
      const d = new Date(startDate); d.setDate(startDate.getDate() + i);
      const dStr = formatLocal(d);
      if (dStr === todayDateStr) total += cappedTodayScore;
      else { const ds = dailyScores.find(x => x.date === dStr); if (ds) total += ds.score; }
    }
    return total;
  }, [currentWeekId, todayDateStr, cappedTodayScore, dailyScores]);

  const handleToggleTask = async (task, isCompleted, targetDateStr) => {
    if (!user) return;
    const dayTasks = getTasksForDate(tasks, targetDateStr);
    let newRawScore = 0;
    dayTasks.forEach(t => { 
      if (t.id === task.id) { if (isCompleted) newRawScore += Number(t.points); } 
      else if (t.completedDates?.includes(targetDateStr)) newRawScore += Number(t.points); 
    });
    const newCappedScore = Math.min(100, newRawScore);
    const oldScore = getScoreInfoForDate(targetDateStr).score;
    
    if (isCompleted) { 
      if (newCappedScore >= 100 && oldScore < 100) triggerConfetti('fireworks'); 
      else triggerConfetti('normal'); 
    }
    
    const updatedDates = isCompleted ? [...(task.completedDates || []), targetDateStr] : (task.completedDates || []).filter(d => d !== targetDateStr);
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id), { ...task, completedDates: updatedDates });
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'daily_scores', targetDateStr), { date: targetDateStr, score: newCappedScore });
    
    const targetWeekId = getWeekId(targetDateStr);
    const pref = preferences.find(p => p.id === targetWeekId);
    if (pref?.optedIn) {
      let weekTotal = 0;
      for (let i = 0; i < 7; i++) {
        const d = new Date(targetWeekId); d.setDate(d.getDate() + i); const dStr = formatLocal(d);
        if (dStr === targetDateStr) weekTotal += newCappedScore;
        else { const ds = dailyScores.find(x => x.date === dStr); if (ds) weekTotal += ds.score; }
      }
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'leaderboard', `${targetWeekId}_${user.uid}`), { weekId: targetWeekId, userId: user.uid, displayName: profile.displayName, score: weekTotal });
    }
  };

  const handleSaveTask = async (taskData) => {
    const targetDate = taskData.date || todayDateStr;
    const dayPoints = getTasksForDate(tasks, targetDate).reduce((acc, t) => acc + (t.id === taskData.id ? 0 : Number(t.points)), 0);
    if (dayPoints + Number(taskData.points) > 100) { showToast(`${targetDate} 總分將超過 100，請修改！`); return false; }
    const taskId = taskData.id || Date.now().toString();
    await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', taskId), { ...taskData, id: taskId, completedDates: taskData.completedDates || [], createdAt: taskData.createdAt || todayDateStr });
    showToast('儲存成功！'); return true;
  };

  const executeDeleteTask = async (type) => {
    const { task, activeDateStr } = deleteDialog;
    if (task.recurrence === 'once' || type === 'all') {
      await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id));
    } else if (type === 'single') {
      await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id), { ...task, excludedDates: [...(task.excludedDates || []), activeDateStr] });
    } else if (type === 'future') {
      const prevD = new Date(activeDateStr); prevD.setDate(prevD.getDate() - 1);
      const end = formatLocal(prevD);
      if (end < task.createdAt) await deleteDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id));
      else await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', task.id), { ...task, endDate: end });
    }
    setDeleteDialog({ isOpen: false, task: null, activeDateStr: null }); showToast('已刪除！');
  };

  const getTheme = () => {
    if (activeTab === 'today') return { bg: 'from-pink-50 via-white to-purple-50', border: 'sm:border-pink-100', text: 'text-pink-500', grad: 'from-pink-500 to-purple-500', btn: 'pink' };
    if (activeTab === 'history') return { bg: 'from-blue-50 via-white to-sky-50', border: 'sm:border-blue-100', text: 'text-blue-500', grad: 'from-blue-500 to-sky-500', btn: 'blue' };
    if (activeTab === 'leaderboard') return { bg: 'from-amber-50 via-white to-orange-50', border: 'sm:border-amber-100', text: 'text-amber-500', grad: 'from-amber-500 to-orange-500', btn: 'amber' };
    if (activeTab === 'settings') return { bg: 'from-emerald-50 via-white to-teal-50', border: 'sm:border-emerald-100', text: 'text-emerald-500', grad: 'from-emerald-500 to-teal-500', btn: 'emerald' };
    return { bg: 'from-pink-50 via-white to-purple-50', border: 'sm:border-pink-100', text: 'text-pink-500', grad: 'from-pink-500 to-purple-500', btn: 'pink' };
  };
  const theme = getTheme();

  // 渲染：等待中
  if (!authReady || isProcessing) return <div className="flex flex-col items-center justify-center h-screen bg-pink-50 text-pink-400 font-bold"><Sparkles className="animate-spin mb-4" size={40} /> 正在與雲端連線中...</div>;
  
  // 渲染：未登入
  if (!user) return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-gradient-to-br from-pink-50 via-white to-purple-50 items-center justify-center p-8 text-center sm:border-x sm:border-pink-100 font-sans">
      <Award size={80} className="text-pink-500 mb-6 drop-shadow-lg" />
      <h1 className="text-3xl font-black bg-gradient-to-r from-pink-500 to-purple-500 bg-clip-text text-transparent mb-4">目標追蹤器</h1>
      <p className="text-slate-500 mb-12 font-bold">登入以永久保存您的專屬紀錄與可愛目標！ ✨</p>
      <button 
        onClick={handleGoogleLogin} 
        className="w-full py-4 bg-white border-2 border-pink-100 rounded-3xl shadow-lg flex items-center justify-center gap-3 font-black text-slate-700 hover:scale-[1.02] active:scale-95 transition-all"
      >
        <svg className="w-6 h-6" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
        使用 Google 帳號登入
      </button>
    </div>
  );

  // 渲染：已登入主畫面
  return (
    <div className={`flex flex-col h-screen max-w-md mx-auto bg-gradient-to-br ${theme.bg} overflow-hidden relative shadow-2xl sm:border-x ${theme.border} font-sans transition-all duration-500`}>
      <Toast message={toastMsg} onClose={() => setToastMsg('')} />
      {showResultModal && <WeeklyResultModal data={resultData} onClose={closeResultModal} />}
      
      <DeleteTaskModal 
        isOpen={deleteDialog.isOpen} 
        task={deleteDialog.task} 
        activeDateStr={deleteDialog.activeDateStr} 
        onConfirm={executeDeleteTask} 
        onCancel={() => setDeleteDialog({ isOpen: false, task: null, activeDateStr: null })} 
      />

      <header className="bg-white/70 backdrop-blur-lg px-6 py-5 shadow-sm z-10 flex justify-between items-center border-b border-white/50">
        <h1 className={`text-lg font-black bg-gradient-to-r ${theme.grad} bg-clip-text text-transparent flex items-center gap-2 truncate`}>
          <Award className={theme.text} /> {profile.displayName} 的目標追蹤器
        </h1>
        <div className="flex items-center gap-1 shrink-0 ml-2">
           <span className={`text-[10px] font-black text-white ${viewingHistoryDate ? 'bg-blue-400' : 'bg-pink-400'} px-2 py-1 rounded shadow-sm`}>{viewingHistoryDate ? '非今日' : '今日'}</span>
           <span className={`text-xs font-bold ${viewingHistoryDate ? 'text-blue-600 bg-blue-100' : 'text-pink-600 bg-pink-100'} px-2 py-1 rounded`}>{viewingHistoryDate || todayDateStr}</span>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto pb-28">
        {activeTab === 'history' && viewingHistoryDate ? (
          <DayView activeDateStr={viewingHistoryDate} todayDateStr={todayDateStr} tasks={tasks} getTasksForDate={getTasksForDate} getScoreInfoForDate={getScoreInfoForDate} onToggle={handleToggleTask} onAdd={handleSaveTask} onDelete={(t, date) => setDeleteDialog({ isOpen: true, task: t, activeDateStr: date })} onCopy={(t, date) => setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', Date.now().toString()), { ...t, id: Date.now().toString(), completedDates: [], createdAt: date })} onBack={() => setViewingHistoryDate(null)} showToast={showToast} profile={profile} />
        ) : (
          <>
            {activeTab === 'today' && <DayView activeDateStr={todayDateStr} todayDateStr={todayDateStr} tasks={tasks} getTasksForDate={getTasksForDate} getScoreInfoForDate={getScoreInfoForDate} onToggle={handleToggleTask} onAdd={handleSaveTask} onDelete={(t, date) => setDeleteDialog({ isOpen: true, task: t, activeDateStr: date })} onCopy={(t, date) => setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'tasks', Date.now().toString()), { ...t, id: Date.now().toString(), completedDates: [], createdAt: date })} isTodayView={true} currentWeekScore={currentWeekScore} showToast={showToast} profile={profile} />}
            {activeTab === 'history' && <HistoryView dailyScores={dailyScores} onDayClick={setViewingHistoryDate} />}
            {activeTab === 'leaderboard' && <LeaderboardView profile={profile} leaderboard={leaderboard} currentWeekId={currentWeekId} currentWeekScore={currentWeekScore} user={user} />}
            {activeTab === 'settings' && <SettingsView user={user} profile={profile} onLogout={() => signOut(auth)} />}
          </>
        )}
      </main>

      <nav className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md rounded-[2rem] flex justify-around p-2 z-20 shadow-lg">
        <NavBtn icon={CheckCircle} label="今日" active={activeTab === 'today'} onClick={() => {setActiveTab('today'); setViewingHistoryDate(null);}} color="pink" />
        <NavBtn icon={CalendarIcon} label="歷史" active={activeTab === 'history'} onClick={() => setActiveTab('history')} color="blue" />
        <NavBtn icon={Trophy} label="排行" active={activeTab === 'leaderboard'} onClick={() => setActiveTab('leaderboard')} color="amber" />
        <NavBtn icon={Settings} label="設定" active={activeTab === 'settings'} onClick={() => setActiveTab('settings')} color="emerald" />
      </nav>
    </div>
  );
}

// --- 其餘組件保持不變 ---
function NavBtn({ icon: Icon, label, active, onClick, color }) {
  const cMap = { pink: 'text-pink-600 bg-pink-100', blue: 'text-blue-600 bg-blue-100', amber: 'text-amber-600 bg-amber-100', emerald: 'text-emerald-600 bg-emerald-100' };
  return (
    <button onClick={onClick} className={`flex flex-col items-center p-2.5 min-w-[64px] rounded-3xl transition-all ${active ? cMap[color] + ' scale-105 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
      <Icon size={22} /><span className="text-[11px] mt-1 font-black">{label}</span>
    </button>
  );
}

function DayView({ activeDateStr, todayDateStr, tasks, getTasksForDate, getScoreInfoForDate, onToggle, onAdd, onDelete, onCopy, isTodayView, currentWeekScore, onBack, showToast, profile }) {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [displayMode, setDisplayMode] = useState('today');
  const [showUnder, setShowUnder] = useState(false);
  const [showOver, setShowOver] = useState(false);
  
  const { tasks: dayTasks, score: dayScore } = getScoreInfoForDate(activeDateStr);
  const totalPossible = dayTasks.reduce((acc, t) => acc + Number(t.points), 0);

  useEffect(() => { 
    if (totalPossible < 100 && dayScore < 100) setShowUnder(true); 
    if (totalPossible > 100) setShowOver(true); 
  }, [activeDateStr, totalPossible, dayScore]);

  return (
    <div className="p-5 space-y-6 animate-fade-in relative min-h-full">
      {onBack && <button onClick={onBack} className="flex items-center gap-2 text-blue-500 font-bold bg-white px-4 py-2 rounded-full shadow border border-blue-50 hover:bg-blue-50"><ArrowLeft size={18} /> 返回月曆</button>}
      
      {showOver && <Modal title="總分超過上限！" msg={`已達 ${totalPossible} 分，已經超過每日 100 分的上限。`} btn="去修改" onBtn={() => setShowOver(false)} color="red" />}
      {showUnder && <Modal title="目標未達滿分喔！" msg={`目前僅 ${totalPossible} 分，尚未滿 100 分呢！<br/>快來設定挑戰吧！`} btn="去新增" onBtn={() => {setShowUnder(false); setIsModalOpen(true);}} color="yellow" onClose={() => setShowUnder(false)} />}
      
      <div className="bg-white rounded-[2rem] p-6 shadow-xl border-2 border-pink-50 flex flex-col items-center cursor-pointer active:scale-95 overflow-hidden group min-h-[160px]" onClick={() => isTodayView && setDisplayMode(prev => prev === 'today' ? 'week' : 'today')}>
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-pink-300 via-purple-300 to-indigo-300"></div>
        {displayMode === 'today' || !isTodayView ? (
          <div className="w-full pt-2 animate-fade-in">
            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-2">{isTodayView ? '今日達成率' : '當日達成率'} {isTodayView && <span className="bg-slate-100 px-2 py-0.5 rounded-full text-[9px]">點擊切換</span>}</span>
            <div className="flex items-baseline gap-1.5 mb-2"><span className="text-5xl font-black text-slate-800">{dayScore}</span><span className="text-sm font-bold text-slate-400">/ 100</span></div>
            <div className="h-6 w-full bg-slate-100 rounded-full overflow-hidden shadow-inner"><div className="h-full bg-gradient-to-r from-pink-400 to-purple-400 transition-all duration-1000" style={{ width: `${dayScore}%` }}></div></div>
          </div>
        ) : (
          <div className="w-full pt-2 animate-fade-in">
            <div className="flex justify-between items-end mb-4"><div className="flex flex-col"><span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">本週結算</span><span className="text-5xl font-black text-purple-600">{currentWeekScore}</span></div><span className={`px-3 py-1.5 rounded-full text-xs font-black border-2 ${getMedal(currentWeekScore).bg} ${getMedal(currentWeekScore).border}`}>{getMedal(currentWeekScore).icon} {getMedal(currentWeekScore).name}</span></div>
            <div className="relative w-full h-8 bg-slate-100 rounded-full shadow-inner mt-4 overflow-visible">
              <div className="h-full bg-gradient-to-r from-orange-300 via-pink-400 to-yellow-400 rounded-full" style={{ width: `${Math.min(100, (currentWeekScore/700)*100)}%` }}></div>
              <Marker left={(200/700)*100} score="200" icon="✨" color="orange" /><Marker left={(450/700)*100} score="450" icon="⭐" color="slate" /><Marker left={(680/700)*100} score="680" icon="👑" color="yellow" />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {dayTasks.map(t => {
          const done = t.completedDates?.includes(activeDateStr);
          return (
            <div key={t.id} className={`flex items-center justify-between p-4 rounded-3xl border-2 transition-all ${done ? 'bg-slate-50 border-slate-100 opacity-70' : 'bg-white border-pink-50 hover:border-pink-200'}`}>
              <div className="flex items-center gap-3 flex-1 cursor-pointer" onClick={() => onToggle(t, !done, activeDateStr)}>
                {done ? <CheckCircle className="text-green-400" size={32} /> : <Circle className="text-slate-200" size={32} />}
                <div className="flex flex-col"><span className={`font-black ${done ? 'line-through text-slate-400' : 'text-slate-700'}`}>{t.title}</span><span className="text-[10px] font-bold text-slate-400">{t.points}分 • {t.recurrence === 'once' ? '單次' : '週期'}</span></div>
              </div>
              <div className="flex gap-1 border-l-2 border-slate-50 pl-2">
                <button onClick={() => {setEditing(t); setIsModalOpen(true);}} className="p-2 text-slate-300 hover:text-blue-500"><Edit2 size={18} /></button>
                <button onClick={() => onDelete(t, activeDateStr)} className="p-2 text-slate-300 hover:text-red-500"><Trash2 size={18} /></button>
              </div>
            </div>
          );
        })}
      </div>
      <button onClick={() => {setEditing(null); setIsModalOpen(true);}} className="fixed bottom-28 right-6 w-16 h-16 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-full shadow-xl flex items-center justify-center border-4 border-white active:scale-90 transition-transform"><Plus size={32} strokeWidth={3} /></button>
      {isModalOpen && <TaskModal onClose={() => setIsModalOpen(false)} onSave={onAdd} activeDateStr={activeDateStr} initialData={editing} showToast={showToast} />}
    </div>
  );
}

function HistoryView({ dailyScores, onDayClick }) {
  const [cal, setCal] = useState(new Date());
  const weeks = useMemo(() => {
    const first = new Date(cal.getFullYear(), cal.getMonth(), 1);
    const start = new Date(first); start.setDate(first.getDate() - first.getDay());
    const res = []; let curr = new Date(start);
    for (let i = 0; i < 6; i++) {
      const wk = []; for (let j = 0; j < 7; j++) { wk.push(formatLocal(curr)); curr.setDate(curr.getDate() + 1); }
      res.push(wk); if (curr.getMonth() !== cal.getMonth() && i >= 3) break;
    }
    return res;
  }, [cal]);
  return (
    <div className="p-5 space-y-4 animate-fade-in">
      <div className="bg-white rounded-[2rem] shadow-xl border-2 border-blue-50 overflow-hidden">
        <div className="flex justify-between p-5 bg-blue-50 border-b-2 border-blue-100"><button onClick={() => setCal(new Date(cal.getFullYear(), cal.getMonth()-1, 1))}><ChevronLeft /></button><div className="font-black">{cal.getFullYear()} 年 {cal.getMonth()+1} 月</div><button onClick={() => setCal(new Date(cal.getFullYear(), cal.getMonth()+1, 1))}><ChevronRight /></button></div>
        <div className="grid grid-cols-8 text-[11px] font-black text-slate-400 text-center py-3">{['日', '一', '二', '三', '四', '五', '六'].map(d => <div key={d}>{d}</div>)}<div className="text-sky-500">結算</div></div>
        <div className="bg-white">{weeks.map((wk, wi) => {
          let ws = 0; const ds = wk.map(dStr => { const s = dailyScores.find(x => x.date === dStr)?.score || 0; ws += s; return { dStr, s, isM: new Date(dStr).getMonth() === cal.getMonth() }; });
          return (
            <div className="grid grid-cols-8 border-t border-slate-100" key={wi}>
              {ds.map((o, di) => <div key={di} onClick={() => onDayClick(o.dStr)} className={`h-16 flex flex-col items-center justify-center cursor-pointer border-r border-slate-50 hover:bg-blue-50 ${o.isM ? '' : 'bg-slate-50 opacity-40'}`}><span className="text-[11px] font-bold text-slate-500">{new Date(o.dStr).getDate()}</span>{o.s > 0 && <span className={`text-xs font-black mt-1 ${o.s === 100 ? 'text-green-500' : 'text-blue-500'}`}>{o.s}</span>}</div>)}
              <div className={`flex flex-col items-center justify-center border-l-2 shadow-inner ${getMedal(ws).bg} ${getMedal(ws).border}`}><span className="text-[11px] font-black">{ws || '-'}</span><span className="text-sm">{getMedal(ws).icon !== '🌱' ? getMedal(ws).icon : ''}</span></div>
            </div>
          );
        })}</div>
      </div>
    </div>
  );
}

function LeaderboardView({ profile, leaderboard, currentWeekId, user }) {
  const isOpted = leaderboard.some(e => e.userId === user.uid && e.weekId === currentWeekId);
  const lb = leaderboard.filter(e => e.weekId === currentWeekId).sort((a,b)=>b.score-a.score);
  const handleToggle = async (val) => {
    const lbRef = doc(db, 'artifacts', appId, 'public', 'data', 'leaderboard', `${currentWeekId}_${user.uid}`);
    if (val) await setDoc(lbRef, { weekId: currentWeekId, userId: user.uid, displayName: profile.displayName, score: 0 }); 
    else await deleteDoc(lbRef);
  };
  return (
    <div className="p-5 animate-fade-in space-y-4">
      <div className="bg-white rounded-3xl p-5 shadow-sm border-2 border-amber-50 flex justify-between items-center"><div className="flex flex-col"><span className="font-black text-slate-800">參與本週共同排行</span><span className="text-xs text-slate-400">與好友一起競爭吧！</span></div><Toggle checked={isOpted} onChange={handleToggle} /></div>
      <div className="bg-white rounded-[2rem] shadow-xl border-2 border-amber-50 overflow-hidden"><div className="bg-amber-50 p-5 border-b-2 border-white text-center font-black"><Trophy className="inline mb-1 mr-1" size={18} /> 當週風雲榜<div className="text-[10px] text-amber-500 mt-1">結算週期: {getWeekRange(currentWeekId)}</div></div>
      <div className="p-3 min-h-[300px]">{lb.length === 0 ? <div className="text-center py-20 text-slate-400 font-bold">👻 本週尚無排名</div> : lb.map((e,i)=>(<div key={e.userId} className={`flex items-center justify-between p-3.5 mb-2 rounded-2xl ${e.userId === user.uid ? 'bg-amber-100 border-amber-200 border-2' : 'bg-slate-50 shadow-sm'}`}><div className="flex items-center gap-4"><div className="w-8 h-8 rounded-full bg-white flex items-center justify-center font-black shadow-inner">{i+1}</div><span className="font-black">{e.displayName}</span></div><span className="font-black text-amber-600">{e.score}分</span></div>))}</div></div>
    </div>
  );
}

function SettingsView({ user, profile, onLogout }) {
  const [name, setName] = useState(profile.displayName || '');
  const save = async () => { if (!name.trim()) return; await setDoc(doc(db, 'artifacts', appId, 'users', user.uid, 'profile', 'data'), { displayName: name }, { merge: true }); };
  return (
    <div className="p-5 space-y-6 animate-fade-in">
      <div className="bg-white rounded-[2rem] p-6 shadow-xl border-2 border-emerald-50"><h3 className="text-lg font-black text-slate-800 mb-5 flex items-center gap-2"><Users size={22} className="text-emerald-500" /> 個人檔案</h3>
        <div className="space-y-4"><label className="block text-sm font-black text-slate-500 mb-2">顯示名稱</label><div className="flex gap-2"><input type="text" value={name} onChange={e=>setName(e.target.value)} lang="zh-TW" className="flex-1 px-4 py-3 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-emerald-400 outline-none font-bold" /><button onClick={save} className="px-6 py-3 bg-emerald-500 text-white font-black rounded-2xl active:scale-95 transition-transform">儲存</button></div></div>
      </div>
      <div className="text-center mt-10"><button onClick={onLogout} className="px-8 py-3 bg-white border-2 border-red-100 text-red-500 font-black rounded-2xl flex items-center gap-2 mx-auto active:scale-95 transition-transform shadow-sm"><LogOut size={18} /> 登出帳號</button></div>
    </div>
  );
}

function TaskModal({ onClose, onSave, activeDateStr, initialData, showToast }) {
  const [title, setTitle] = useState(initialData?.title || '');
  const [pts, setPts] = useState(initialData?.points || 10);
  const [rec, setRec] = useState(initialData?.recurrence || 'daily');
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[100] animate-fade-in"><div className="bg-white rounded-[2rem] p-6 w-full max-w-sm shadow-2xl border-4 border-pink-100 relative overflow-y-auto max-h-[90vh]">
      <div className="flex justify-between items-center mb-6"><h3 className="text-xl font-black text-slate-800">🎯 {initialData ? '修改目標' : '新增目標'}</h3><button onClick={onClose}><X size={24} /></button></div>
      <div className="space-y-4">
        <label className="block font-black text-slate-600">目標名稱</label><input type="text" value={title} onChange={e=>setTitle(e.target.value)} placeholder="例如：喝水 2000cc" lang="zh-TW" className="w-full px-4 py-3 bg-slate-50 border-2 rounded-2xl focus:border-pink-400 outline-none font-bold" />
        <label className="block font-black text-slate-600">分數</label><input type="number" value={pts} onChange={e=>setPts(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border-2 rounded-2xl focus:border-pink-400 outline-none font-bold" />
        <label className="block font-black text-slate-600">重複週期</label><select value={rec} onChange={e=>setRec(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border-2 rounded-2xl focus:border-pink-400 outline-none font-bold"><option value="once">單次</option><option value="daily">每天</option><option value="weekly">每週</option><option value="monthly">每月</option></select>
        <button onClick={async ()=>{ const ok = await onSave({...initialData, title, points: Number(pts), recurrence: rec, recurrenceValue: (rec==='weekly'?new Date(activeDateStr).getDay().toString():new Date(activeDateStr).getDate().toString())}); if(ok) onClose(); }} className="w-full py-4 bg-pink-500 text-white font-black rounded-2xl shadow-lg mt-4 active:scale-95 transition-transform">確認儲存</button>
      </div>
    </div></div>
  );
}

function Modal({ title, msg, btn, onBtn, color, onClose }) {
  const c = color === 'red' ? 'red' : 'yellow';
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[90] animate-fade-in">
      <div className={`bg-white rounded-[2rem] p-6 w-full max-w-xs shadow-2xl text-center border-4 border-${c}-100 relative`}>
        {onClose && <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>}
        <div className={`w-16 h-16 bg-${c}-50 text-${c}-500 rounded-full flex items-center justify-center mx-auto mb-4 text-3xl shadow-inner`}>{color === 'red' ? '⚠️' : '💡'}</div>
        <h3 className="text-xl font-black text-slate-800 mb-2">{title}</h3>
        <p className="text-sm text-slate-500 mb-6 font-bold leading-relaxed" dangerouslySetInnerHTML={{ __html: msg }}></p>
        <button onClick={onBtn} className={`w-full py-4 bg-${color === 'red' ? 'red-500' : 'yellow-400'} text-white font-black rounded-2xl shadow-lg active:scale-95 transition-transform`}>{btn}</button>
      </div>
    </div>
  );
}

function WeeklyResultModal({ data, onClose }) {
  if (!data) return null;
  const m = getMedal(data.score);
  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-6 z-[200] animate-fade-in">
      <div className="bg-white rounded-[2.5rem] p-8 w-full max-w-sm shadow-2xl text-center border-4 border-purple-200 relative">
        <h2 className="text-2xl font-black mb-2 text-slate-800">上週結算報告 📊</h2><p className="text-xs text-slate-400 mb-6 font-bold">{getWeekRange(data.weekId)}</p>
        <div className="text-6xl font-black text-purple-600 mb-4 drop-shadow-sm">{data.score}</div>
        <div className="flex justify-center gap-2 mb-8"><span className={`px-4 py-1.5 rounded-full text-sm font-black border-2 ${m.bg} ${m.border}`}>{m.icon} {m.name}</span>{data.rank && <span className="px-4 py-1.5 rounded-full text-sm font-black bg-blue-50 text-blue-600 border-2 border-blue-200">排行第 {data.rank} 名</span>}</div>
        <div className="bg-slate-50 p-4 rounded-2xl mb-8 font-bold text-slate-600">每一天都在變得更好！繼續加油喔！🔥</div>
        <button onClick={onClose} className="w-full py-4 bg-purple-500 text-white font-black rounded-2xl shadow-lg active:scale-95 transition-transform">我知道了，繼續努力！</button>
      </div>
    </div>
  );
}

function Marker({ left, score, icon, color }) {
  const colors = { orange: 'text-orange-500', slate: 'text-slate-500', yellow: 'text-yellow-600' };
  return (
    <div className="absolute top-0 h-full border-l-[3px] border-white/80 flex flex-col items-center justify-center z-10" style={{ left: `${left}%` }}>
      <div className={`absolute -top-6 text-[11px] font-black ${colors[color]}`}>{score}</div><div className="text-[14px] drop-shadow-sm">{icon}</div>
    </div>
  );
}

function Toggle({ checked, onChange }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-300 shadow-inner ${checked ? 'bg-green-400' : 'bg-slate-200'}`}>
      <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform duration-300 ${checked ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  );
}

function DeleteTaskModal({ isOpen, task, activeDateStr, onConfirm, onCancel }) {
  if (!isOpen || !task) return null;
  const isRecurrent = task.recurrence !== 'once';
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-[110] animate-fade-in">
      <div className="bg-white rounded-[2rem] p-6 w-full max-w-sm shadow-2xl border-4 border-red-50 relative">
        <div className="flex justify-between items-center mb-4"><h3 className="text-xl font-black text-slate-800 flex items-center gap-2"><AlertTriangle className="text-red-500" /> 刪除確認</h3><button onClick={onCancel}><X size={24} /></button></div>
        <p className="font-bold text-slate-500 mb-6">您確定要刪除「{task.title}」嗎？</p>
        <div className="space-y-3">
          {isRecurrent ? (
            <>
              <button onClick={() => onConfirm('single')} className="w-full py-4 bg-white border-2 border-red-100 text-red-500 font-black rounded-2xl hover:bg-red-50 active:scale-95 transition-all">僅刪除今日 ({activeDateStr})</button>
              <button onClick={() => onConfirm('future')} className="w-full py-4 bg-white border-2 border-red-200 text-red-600 font-black rounded-2xl hover:bg-red-50 active:scale-95 transition-all">刪除今日及未來</button>
              <button onClick={() => onConfirm('all')} className="w-full py-4 bg-red-500 text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all">徹底永久刪除</button>
            </>
          ) : (
            <button onClick={() => onConfirm('all')} className="w-full py-4 bg-red-500 text-white font-black rounded-2xl shadow-lg active:scale-95 transition-all">確認刪除</button>
          )}
          <button onClick={onCancel} className="w-full py-3 text-slate-400 font-bold">取消</button>
        </div>
      </div>
    </div>
  );
}

function Toast({ message, onClose }) {
  if (!message) return null;
  return (
    <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[300] animate-bounce-in">
      <div className="bg-slate-800 text-white px-6 py-3 rounded-full shadow-2xl font-black text-sm flex items-center gap-2 border-2 border-white/20 whitespace-nowrap">
        <Sparkles size={16} className="text-yellow-400" /> {message}
      </div>
    </div>
  );
}