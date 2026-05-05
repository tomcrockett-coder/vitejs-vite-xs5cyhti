import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Activity, CheckCircle2, Circle, Send, Calendar, LogOut, Edit3, Zap, Sparkles, Flame, Shield, Loader2, Eye, EyeOff, Settings, Trash2, Users, Camera, Download, Palette, UserPlus, User, BarChart3, TrendingUp, LineChart } from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, signInWithRedirect, GoogleAuthProvider, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, doc, setDoc, getDoc, onSnapshot, getDocs, deleteDoc } from 'firebase/firestore';

// --- CONFIGURE MASTER ADMIN ACCESS HERE ---
const ADMIN_EMAIL = "tom.crockett@ruralvirtual.org"; 

const firebaseConfig = {
  apiKey: "AIzaSyCHNoSv3EqxXOE06BXJvdA7YrhirCbjmbg",
  authDomain: "study-tracker-803a2.firebaseapp.com",
  projectId: "study-tracker-803a2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- ZERO-LAG AUDIO ENGINE (Web Audio API) ---
const audioContext = new (window.AudioContext || window.webkitAudioContext)();
const audioBuffers = {};

const fetchAudio = async (key, url) => {
  try {
    const res = await fetch(url);
    const arrayBuf = await res.arrayBuffer();
    audioBuffers[key] = await audioContext.decodeAudioData(arrayBuf);
  } catch(e) {
    console.warn("Audio load failed for", key);
  }
};

fetchAudio('click', 'https://assets.mixkit.co/active_storage/sfx/2568/2568-preview.mp3');
fetchAudio('unclick', 'https://assets.mixkit.co/active_storage/sfx/2570/2570-preview.mp3');
fetchAudio('powerup', 'https://assets.mixkit.co/active_storage/sfx/2019/2019-preview.mp3');

// Resume audio context on first interaction
const initAudioCtx = () => {
  if (audioContext.state === 'suspended') audioContext.resume();
};
if (typeof window !== 'undefined') {
  window.addEventListener('click', initAudioCtx, { once: true });
  window.addEventListener('touchstart', initAudioCtx, { once: true });
}

const playSound = (key, volume = 1, rate = 1) => {
  if (!audioBuffers[key]) return;
  if (audioContext.state === 'suspended') audioContext.resume();
  const source = audioContext.createBufferSource();
  source.buffer = audioBuffers[key];
  source.playbackRate.value = rate;
  const gainNode = audioContext.createGain();
  gainNode.gain.value = volume;
  source.connect(gainNode);
  gainNode.connect(audioContext.destination);
  source.start(0);
};

const playClick = () => playSound('click', 1.0, 1.0);
const playUnclick = () => playSound('unclick', 1.8, 1.0);
const playPowerup = () => playSound('powerup', 0.5, 1.0);

// --- THEME ENGINE ---
const THEMES = {
  burgundy: { id: 'burgundy', name: 'Classic Burgundy', primary: 'bg-[#8B1D3B]', hover: 'hover:bg-[#6A152C]', text: 'text-[#8B1D3B]', hoverText: 'hover:text-[#6A152C]', border: 'border-[#8B1D3B]', borderDark: 'border-[#6A152C]', hex: '#8B1D3B', imageFilter: 'none' },
  navy: { id: 'navy', name: 'Midnight Navy', primary: 'bg-[#1E3A8A]', hover: 'hover:bg-[#172554]', text: 'text-[#1E3A8A]', hoverText: 'hover:text-[#172554]', border: 'border-[#1E3A8A]', borderDark: 'border-[#172554]', hex: '#1E3A8A', imageFilter: 'hue-rotate(-120deg) brightness(0.9) saturate(1.2)' },
  forest: { id: 'forest', name: 'Evergreen', primary: 'bg-[#064E3B]', hover: 'hover:bg-[#022C22]', text: 'text-[#064E3B]', hoverText: 'hover:text-[#022C22]', border: 'border-[#064E3B]', borderDark: 'border-[#022C22]', hex: '#064E3B', imageFilter: 'hue-rotate(170deg) brightness(0.8) saturate(1.1)' },
  plum: { id: 'plum', name: 'Royal Plum', primary: 'bg-[#4C1D95]', hover: 'hover:bg-[#2E1065]', text: 'text-[#4C1D95]', hoverText: 'hover:text-[#2E1065]', border: 'border-[#4C1D95]', borderDark: 'border-[#2E1065]', hex: '#4C1D95', imageFilter: 'hue-rotate(-60deg) saturate(1.3)' }
};

// --- STATIC COMPONENTS ---
const RVALogo = ({ large, theme, centered }) => {
  return (
    <div className={`flex items-center ${centered ? 'relative right-4 md:right-6' : ''}`}>
      <div className={`flex items-center justify-center shrink-0 relative z-0 ${large ? 'w-24 h-24 md:w-32 md:h-32 mr-2 md:mr-1' : 'w-16 h-16 md:w-20 md:h-20 mr-3 md:mr-2'}`}>
        <img src="/image.png" alt="Equip" className="w-full h-full object-contain scale-[1.7] transition-all duration-700 drop-shadow-sm" style={{ filter: theme.imageFilter }} />
      </div>
      <div className="flex flex-col items-start justify-center cursor-default relative z-10 drop-shadow-sm">
        <div className={`${large ? 'text-5xl md:text-6xl' : 'text-3xl md:text-4xl'} font-black leading-none tracking-tighter text-gray-900 transition-colors duration-500`}>Equip</div>
        <div className={`${large ? 'text-[10px] mt-2 pt-1.5' : 'text-[8px] md:text-[9px] mt-1.5 pt-1'} font-black ${theme.text} tracking-[0.2em] uppercase opacity-90 border-t w-full transition-colors duration-500`} style={{ borderColor: theme.hex + '33' }}>
          <span className="typewriter inline-block">By Rural Virtual Academy</span>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState(null);
  const [userRole, setUserRole] = useState(null);
  const [loggedInDocId, setLoggedInDocId] = useState(null);
  const [studentsList, setStudentsList] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [authError, setAuthError] = useState(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  // App Navigation State
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [viewAsStudent, setViewAsStudent] = useState(false);
  const [fireworksActive, setFireworksActive] = useState(false);
  const [showThemeMenu, setShowThemeMenu] = useState(false);

  // Photo & Theme State
  const [myPhoto, setMyPhoto] = useState(null);
  const [studentPhoto, setStudentPhoto] = useState(null);
  const [userThemeId, setUserThemeId] = useState('burgundy');

  // Dashboard Settings
  const [subjects, setSubjects] = useState(['Social Studies', 'Health', 'Language Arts', 'Math', 'Science', 'Lexia']);
  const [goalText, setGoalText] = useState('NO missing work');
  const [habits, setHabits] = useState(['Sat at my desk', 'No phone during work', '']);
  const [startingScore, setStartingScore] = useState(0);
  const [isStartingScoreLocked, setIsStartingScoreLocked] = useState(true);
  const [teacherAdjustment, setTeacherAdjustment] = useState(0);
  const [teacherDailyAdjustment, setTeacherDailyAdjustment] = useState(0);
  
  // Data State
  const [history, setHistory] = useState([]);
  const [replyTexts, setReplyTexts] = useState({});
  const [isEditingToday, setIsEditingToday] = useState(false);
  const [isNoneSubjects, setIsNoneSubjects] = useState(false);
  const [isNoneHabits, setIsNoneHabits] = useState(false);
  const [todayData, setTodayData] = useState({ caughtUpSubjects: [], completedHabits: [], newNote: '' });
  
  const [researchData, setResearchData] = useState({
    location: { value: '', other: '', approved: false },
    distractions: { value: '', other: '', approved: false },
    stuck: { value: '', other: '', approved: false },
    extra: { value: '', approved: false }
  });

  // Admin User Management State
  const [allowedUsersList, setAllowedUsersList] = useState([]);
  const [newAllowedEmail, setNewAllowedEmail] = useState('');
  const [newAllowedRole, setNewAllowedRole] = useState('teacher');
  const [preloadName, setPreloadName] = useState('');
  const [preloadEmail, setPreloadEmail] = useState('');
  const [adminMessage, setAdminMessage] = useState({ text: '', type: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmStaffDelete, setConfirmStaffDelete] = useState(null);

  const activeHabits = habits.filter(h => h.trim() !== '');
  const activeSubjects = subjects.filter(s => s.trim() !== '');
  const currentTheme = THEMES[userThemeId] || THEMES.burgundy;

  const showAdminMsg = (text, type = 'success') => {
    setAdminMessage({ text, type });
    setTimeout(() => setAdminMessage({ text: '', type: '' }), 6000);
  };

  // --- AUTHENTICATION & SYNC LOGIC ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        const userEmail = currentUser.email.toLowerCase();
        let role = 'student'; 

        if (userEmail === ADMIN_EMAIL.toLowerCase()) {
          role = 'admin';
        } else {
          const allowedDocRef = doc(db, 'allowed_users', userEmail);
          const allowedDoc = await getDoc(allowedDocRef);
          if (allowedDoc.exists()) {
            role = allowedDoc.data().role || 'student';
          }
        }

        let docId = currentUser.uid;
        const stubDocRef = doc(db, 'users', userEmail);
        const stubDoc = await getDoc(stubDocRef);
        
        if (stubDoc.exists() && stubDoc.data().preloaded) {
          docId = userEmail; 
        }

        setLoggedInDocId(docId);

        await setDoc(doc(db, 'users', docId), {
          name: currentUser.displayName || stubDoc.data()?.name || userEmail.split('@')[0],
          email: userEmail,
          role: role,
          uid: currentUser.uid 
        }, { merge: true });

        setUserRole(role);
        setUser(currentUser);

        if (role === 'student') {
          setSelectedStudentId(docId);
        } else {
          await loadTeacherData(currentUser);
        }
        
        onSnapshot(doc(db, 'users', docId), (snap) => {
            if(snap.exists()) {
              if (snap.data().photoURL) setMyPhoto(snap.data().photoURL);
              if (snap.data().theme) setUserThemeId(snap.data().theme);
            }
        });

      } else {
        setUser(null);
        setUserRole(null);
        setSelectedStudentId(null);
        setLoggedInDocId(null);
      }
    });
    return () => unsubscribe();
  }, []);

  const loadTeacherData = async (currentUser) => {
    const usersSnap = await getDocs(collection(db, 'users'));
    const fetchedStudents = [];
    usersSnap.forEach(d => {
      const data = d.data();
      if (data.role === 'student' || (!data.role && data.email?.toLowerCase() !== ADMIN_EMAIL.toLowerCase())) {
        fetchedStudents.push({ id: d.id, ...data });
      }
    });
    setStudentsList(fetchedStudents);
  };

  const fetchAllowedUsers = async () => {
    const snap = await getDocs(collection(db, 'allowed_users'));
    const users = [];
    snap.forEach(d => users.push({ email: d.id, ...d.data() }));
    setAllowedUsersList(users);
  };

  useEffect(() => {
    if (userRole === 'admin' && showAdminPanel) fetchAllowedUsers();
  }, [userRole, showAdminPanel]);

  useEffect(() => {
    if (!user || !selectedStudentId) return;

    const unsubUser = onSnapshot(doc(db, 'users', selectedStudentId), (docSnap) => {
      if(docSnap.exists()) setStudentPhoto(docSnap.data().photoURL || null);
    });

    const unsubHistory = onSnapshot(collection(db, 'users', selectedStudentId, 'history'), (snapshot) => {
      const fetched = [];
      snapshot.forEach(doc => fetched.push(doc.data()));
      fetched.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setHistory(fetched);
    });

    const unsubSettings = onSnapshot(doc(db, 'users', selectedStudentId, 'settings', 'config'), (docSnap) => {
      if (docSnap.exists()) {
        const d = docSnap.data();
        if (d.goalText) setGoalText(d.goalText);
        if (d.habits) setHabits(d.habits);
        if (d.subjects) setSubjects(d.subjects);
        if (d.startingScore !== undefined) {
          setStartingScore(d.startingScore);
          setIsStartingScoreLocked(true);
        }
        if (d.teacherAdjustment !== undefined) setTeacherAdjustment(d.teacherAdjustment);
        if (d.teacherDailyAdjustment !== undefined) setTeacherDailyAdjustment(d.teacherDailyAdjustment);
      } else {
        setGoalText('NO missing work');
        setHabits(['Sat at my desk', 'No phone during work', '']);
        setSubjects(['Social Studies', 'Health', 'Language Arts', 'Math', 'Science', 'Lexia']);
        setStartingScore(0); setTeacherAdjustment(0); setTeacherDailyAdjustment(0);
        setIsStartingScoreLocked(false);
      }
    });

    const unsubResearch = onSnapshot(doc(db, 'users', selectedStudentId, 'research', 'habits'), (docSnap) => {
      if (docSnap.exists()) setResearchData(docSnap.data());
    });

    return () => { unsubUser(); unsubHistory(); unsubSettings(); unsubResearch(); };
  }, [user, selectedStudentId]);

  const todayId = new Date().toISOString().split('T')[0];
  const todaysHistory = history.find(h => h.id === todayId);
  const isSubmittedToday = !!todaysHistory;
  const isStaff = userRole === 'admin' || userRole === 'teacher';
  const isEffectivelyStaff = isStaff && !viewAsStudent;

  useEffect(() => {
    if (isEditingToday && todaysHistory) {
      setTodayData({ caughtUpSubjects: todaysHistory.caughtUpSubjects || [], completedHabits: todaysHistory.completedHabits || [], newNote: '' });
      setIsNoneSubjects(todaysHistory.caughtUpSubjects?.length === 0);
      setIsNoneHabits(todaysHistory.completedHabits?.length === 0);
    }
  }, [isEditingToday, todaysHistory]);

  const currentStreak = useMemo(() => history.length > 0 ? (history[0].streak || 0) : 0, [history]);

  const healthScore = useMemo(() => {
    let bonus = 0;
    Object.values(researchData).forEach(item => { if (item.approved) bonus += 2; });
    let calculated = startingScore;
    if (history.length > 0) {
      let totalPossible = 0; let totalEarned = 0;
      history.forEach(day => {
        totalPossible += (day.possibleCount || (activeSubjects.length + activeHabits.length));
        totalEarned += ((day.caughtUpSubjects?.length || 0) + (day.completedHabits?.length || 0));
      });
      calculated = Math.round((totalEarned / totalPossible) * 100);
    }
    return calculated + bonus + teacherAdjustment;
  }, [history, activeSubjects.length, activeHabits.length, startingScore, teacherAdjustment, researchData]);

  const todayScore = useMemo(() => {
    const possible = activeSubjects.length + activeHabits.length;
    if (possible === 0) return 0 + teacherDailyAdjustment;
    if (isSubmittedToday && !isEditingToday) {
      const earned = (todaysHistory?.caughtUpSubjects?.length || 0) + (todaysHistory?.completedHabits?.length || 0);
      return Math.round((earned / (todaysHistory?.possibleCount || possible)) * 100) + teacherDailyAdjustment;
    }
    const earned = todayData.caughtUpSubjects.length + todayData.completedHabits.length;
    return Math.round((earned / possible) * 100) + teacherDailyAdjustment;
  }, [todayData, activeSubjects.length, activeHabits.length, isSubmittedToday, isEditingToday, todaysHistory, teacherDailyAdjustment]);

  const researchUnlocked = isEffectivelyStaff || (healthScore >= startingScore + 10);

  // --- COMPUTE TRENDS DATA (With Cumulative Overall Score logic) ---
  const trendsData = useMemo(() => {
    if (!history || history.length === 0) return null;
    
    const sorted = [...history].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    
    let runningEarned = 0;
    let runningPossible = 0;
    let bonus = 0;
    Object.values(researchData).forEach(item => { if (item.approved) bonus += 2; });
    
    const cumulativeHistory = sorted.map(day => {
      const earned = (day.caughtUpSubjects?.length || 0) + (day.completedHabits?.length || 0);
      const possible = day.possibleCount || (activeSubjects.length + activeHabits.length);
      runningEarned += earned;
      runningPossible += possible;
      
      let cumulativeBase = Math.round((runningEarned / runningPossible) * 100);
      const overall = cumulativeBase + startingScore + teacherAdjustment + bonus;
      
      return { ...day, cumulativeScore: overall, dailyScore: Math.round((earned/possible)*100) };
    });

    const recentChart = cumulativeHistory.slice(-14); 
    
    const classFrequencies = {};
    const habitFrequencies = {};
    
    history.forEach(day => {
        (day.caughtUpSubjects || []).forEach(sub => {
            classFrequencies[sub] = (classFrequencies[sub] || 0) + 1;
        });
        (day.completedHabits || []).forEach(hab => {
            habitFrequencies[hab] = (habitFrequencies[hab] || 0) + 1;
        });
    });

    const topClasses = Object.entries(classFrequencies).sort((a, b) => b[1] - a[1]);
    const topHabits = Object.entries(habitFrequencies).sort((a, b) => b[1] - a[1]);

    return { cumulativeHistory, recentChart, topClasses, topHabits, totalDays: history.length };
  }, [history, researchData, startingScore, teacherAdjustment]);

  // --- ACTIONS ---
  const changeTheme = async (newThemeId) => {
    setUserThemeId(newThemeId);
    setShowThemeMenu(false);
    if (loggedInDocId) {
      await setDoc(doc(db, 'users', loggedInDocId), { theme: newThemeId }, { merge: true });
    }
  };

  const handleLogin = async (useRedirect = false) => {
    setAuthError(null); setIsLoggingIn(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      if (useRedirect) await signInWithRedirect(auth, provider);
      else await signInWithPopup(auth, provider);
    } catch (error) {
      console.error("Auth Error: ", error);
      setAuthError(error.message);
    } finally { setIsLoggingIn(false); }
  };

  const submitToday = async () => {
    if (!selectedStudentId) return;
    const possibleClassesCount = activeSubjects.length;
    const possibleHabitsCount = activeHabits.length;
    const possibleCount = possibleClassesCount + possibleHabitsCount;
    let newStreak = 1;
    if (history.length > 0) {
      const yesterday = new Date(Date.now() - 86400000).toISOString().split('T')[0];
      if (history[0].date === yesterday) newStreak = (history[0].streak || 0) + 1;
      else if (history[0].date === todayId) newStreak = history[0].streak || 1;
    }
    const newEntry = {
      id: todayId, date: todayId,
      caughtUpSubjects: todayData.caughtUpSubjects, 
      completedHabits: todayData.completedHabits,
      possibleCount, 
      possibleClassesCount,
      possibleHabitsCount,
      streak: newStreak, 
      notes: todaysHistory?.notes || []
    };
    if (todayData.newNote.trim()) {
      newEntry.notes.push({ author: 'Student', text: todayData.newNote.trim(), time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) });
    }
    await setDoc(doc(db, 'users', selectedStudentId, 'history', todayId), newEntry);
    setIsEditingToday(false);
  };

  const submitReply = async (dayId) => {
    const text = replyTexts[dayId];
    if (!text?.trim() || !selectedStudentId) return;
    const day = history.find(h => h.id === dayId);
    const updated = { ...day, notes: [...(day.notes || []), { author: 'Mr. Crockett', text: text.trim(), time: new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) }] };
    await setDoc(doc(db, 'users', selectedStudentId, 'history', dayId), updated);
    setReplyTexts({ ...replyTexts, [dayId]: '' });
  };

  const handleApproveResearch = async (category) => {
    if (!isEffectivelyStaff || !selectedStudentId) return;
    const isNowApproved = !researchData[category].approved;
    if (isNowApproved) { playPowerup(); setFireworksActive(true); setTimeout(() => setFireworksActive(false), 2000); }
    const newData = { ...researchData, [category]: { ...researchData[category], approved: isNowApproved } };
    setResearchData(newData);
    await setDoc(doc(db, 'users', selectedStudentId, 'research', 'habits'), newData);
  };

  const saveSettings = async () => {
    if (!selectedStudentId) return;
    await setDoc(doc(db, 'users', selectedStudentId, 'settings', 'config'), {
      subjects: subjects.filter(s => s.trim() !== ''),
      habits: habits.filter(h => h.trim() !== ''),
      goalText,
      startingScore: Number(startingScore) || 0,
      teacherAdjustment: Number(teacherAdjustment) || 0,
      teacherDailyAdjustment: Number(teacherDailyAdjustment) || 0
    }, { merge: true });
    setIsStartingScoreLocked(true);
    setShowSettings(false);
  };

  const handlePreloadStudent = async () => {
    if (!preloadName.trim() || !preloadEmail.trim()) {
      showAdminMsg("Please enter both a name and an email address.", "error");
      return;
    }
    const emailId = preloadEmail.toLowerCase().trim();
    const existingStudent = studentsList.find(s => s.email?.toLowerCase() === emailId);
    if (existingStudent) {
      showAdminMsg("This student already has a profile! You can configure them from the main dropdown menu.", "error");
      return;
    }
    await setDoc(doc(db, 'allowed_users', emailId), { role: 'student', addedAt: new Date().toISOString() });
    await setDoc(doc(db, 'users', emailId), { name: preloadName.trim(), email: emailId, role: 'student', preloaded: true }, { merge: true });
    setPreloadName(''); setPreloadEmail(''); fetchAllowedUsers();
    if(user) loadTeacherData(user);
    showAdminMsg(`${preloadName.trim()} has been pre-loaded successfully! Select them from the dropdown above to configure their dashboard.`);
  };

  const handleAddStaff = async () => {
    if (!newAllowedEmail.trim()) return;
    const emailId = newAllowedEmail.toLowerCase().trim();
    await setDoc(doc(db, 'allowed_users', emailId), { role: newAllowedRole, addedAt: new Date().toISOString() });
    setNewAllowedEmail(''); fetchAllowedUsers();
    showAdminMsg(`${emailId} was granted ${newAllowedRole} access.`);
  };

  const executeDeleteStaff = async (email) => {
    await deleteDoc(doc(db, 'allowed_users', email));
    fetchAllowedUsers(); setConfirmStaffDelete(null);
  };

  const executeDeleteStudent = async (studentId, studentEmail) => {
    await deleteDoc(doc(db, 'users', studentId));
    if (studentEmail) await deleteDoc(doc(db, 'allowed_users', studentEmail.toLowerCase()));
    if (selectedStudentId === studentId) setSelectedStudentId(null);
    loadTeacherData(user); setConfirmDeleteId(null);
  };

  const handlePhotoUpload = async (e) => {
    const file = e.target.files[0];
    const targetId = selectedStudentId || loggedInDocId;
    if (!file || !targetId) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
       const img = new Image();
       img.onload = async () => {
         const canvas = document.createElement('canvas');
         const MAX_WIDTH = 150;
         const scaleSize = MAX_WIDTH / img.width;
         canvas.width = MAX_WIDTH;
         canvas.height = img.height * scaleSize;
         const ctx = canvas.getContext('2d');
         ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
         const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
         
         if (selectedStudentId) setStudentPhoto(dataUrl);
         else setMyPhoto(dataUrl);

         await setDoc(doc(db, 'users', targetId), { photoURL: dataUrl }, { merge: true });
       }
       img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  };

  const uploadTargetId = selectedStudentId || loggedInDocId;
  const displayPhoto = selectedStudentId ? studentPhoto : myPhoto;

  const exportToCSV = (data, fileName) => {
    // If using the single student export, data passed in is standard history. We should use the computed cumulativeHistory from trendsData.
    const exportData = trendsData?.cumulativeHistory || data;
    if (!exportData || exportData.length === 0) return;
    
    const headers = [
      "Date", "Daily Score (%)", "Cumulative Overall Score (%)", "Streak", 
      "Possible Classes", "Possible Tasks", "Total Possible Items", 
      "Number of Classes Checked", "Number of Tasks Checked", 
      "Subjects Caught Up (List)", "Habits Completed (List)", "Notes/Comments"
    ];
    
    const rows = exportData.map(day => {
      const numClasses = day.caughtUpSubjects?.length || 0;
      const numHabits = day.completedHabits?.length || 0;
      const score = Math.round((numClasses + numHabits) / (day.possibleCount || 1) * 100);
      const overall = day.cumulativeScore !== undefined ? day.cumulativeScore : score;
      const possClasses = day.possibleClassesCount !== undefined ? day.possibleClassesCount : "N/A";
      const possTasks = day.possibleHabitsCount !== undefined ? day.possibleHabitsCount : "N/A";
      const classesList = (day.caughtUpSubjects || []).join("; ");
      const habitsList = (day.completedHabits || []).join("; ");
      const noteStr = (day.notes || []).map(n => `[${n.author}]: ${n.text}`).join(" | ");
      return [
        day.date, score, overall, day.streak || 0, 
        possClasses, possTasks, day.possibleCount || 0, 
        numClasses, numHabits, 
        `"${classesList}"`, `"${habitsList}"`, `"${noteStr.replace(/"/g, '""')}"`
      ].join(",");
    });
    
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleBulkExport = async () => {
    setIsExporting(true);
    let masterData = [];
    const headers = [
      "Student Name", "Student Email", "Date", "Daily Score (%)", "Cumulative Overall Score (%)", "Streak", 
      "Possible Classes", "Possible Tasks", "Total Possible Items", 
      "Number of Classes Checked", "Number of Tasks Checked", 
      "Subjects Caught Up (List)", "Habits Completed (List)", "Notes/Comments"
    ];
    masterData.push(headers.join(","));

    try {
      for (const student of studentsList) {
        const hSnap = await getDocs(collection(db, 'users', student.id, 'history'));
        const sSnap = await getDoc(doc(db, 'users', student.id, 'settings', 'config'));
        const rSnap = await getDoc(doc(db, 'users', student.id, 'research', 'habits'));

        let sScore = 0; let tAdj = 0;
        if (sSnap.exists()) {
           sScore = sSnap.data().startingScore || 0;
           tAdj = sSnap.data().teacherAdjustment || 0;
        }
        let bonus = 0;
        if (rSnap.exists()) {
           Object.values(rSnap.data()).forEach(item => { if (item?.approved) bonus += 2; });
        }

        const studentHistory = [];
        hSnap.forEach(d => studentHistory.push(d.data()));
        studentHistory.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

        let runningEarned = 0;
        let runningPossible = 0;

        studentHistory.forEach(day => {
          const numClasses = day.caughtUpSubjects?.length || 0;
          const numHabits = day.completedHabits?.length || 0;
          const possible = day.possibleCount || 1;
          const dailyScore = Math.round(((numClasses + numHabits) / possible) * 100);
          
          runningEarned += (numClasses + numHabits);
          runningPossible += possible;
          const overallScore = Math.round((runningEarned / runningPossible) * 100) + sScore + tAdj + bonus;

          const possClasses = day.possibleClassesCount !== undefined ? day.possibleClassesCount : "N/A";
          const possTasks = day.possibleHabitsCount !== undefined ? day.possibleHabitsCount : "N/A";
          const classesList = (day.caughtUpSubjects || []).join("; ");
          const habitsList = (day.completedHabits || []).join("; ");
          const noteStr = (day.notes || []).map(n => `[${n.author}]: ${n.text}`).join(" | ");
          
          const row = [
            student.name, student.email || "N/A", day.date, dailyScore, overallScore, day.streak || 0, 
            possClasses, possTasks, possible, 
            numClasses, numHabits, 
            `"${classesList}"`, `"${habitsList}"`, `"${noteStr.replace(/"/g, '""')}"`
          ];
          masterData.push(row.join(","));
        });
      }
      const csvContent = "data:text/csv;charset=utf-8," + masterData.join("\n");
      const encodedUri = encodeURI(csvContent);
      const link = document.createElement("a");
      link.setAttribute("href", encodedUri);
      link.setAttribute("download", `Equip_Master_Data_${new Date().toISOString().split('T')[0]}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (e) {
      console.error("Export failed", e);
    } finally {
      setIsExporting(false);
    }
  };

  const getHealthColor = (s) => s >= 85 ? 'text-[#2D6A4F]' : s >= 70 ? 'text-amber-500' : 'text-red-500';
  const getHealthBg = (s) => s >= 85 ? 'bg-[#2D6A4F]' : s >= 70 ? 'bg-amber-500' : 'bg-red-500';

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4" style={{ background: `linear-gradient(to top, ${currentTheme.hex}15 0%, #f8fafc 40%, #ffffff 100%)` }}>
        <style>
          {`
            @keyframes typing { from { width: 0; } to { width: 100%; } }
            .typewriter { overflow: hidden; white-space: nowrap; width: 0; animation: typing 1.5s steps(24, end) forwards; animation-delay: 0.5s; }
          `}
        </style>
        <div className="max-w-md w-full flex flex-col items-center text-center">
          <div className="flex justify-center mb-10">
            <RVALogo large={true} theme={currentTheme} centered={true} />
          </div>
          <p className="text-gray-500 mb-8 font-medium">Sign in with your Google account to access your dashboard.</p>
          <button onClick={() => handleLogin()} disabled={isLoggingIn} className={`w-full py-4 rounded-2xl ${currentTheme.primary} ${currentTheme.hover} text-white font-bold text-lg transition-all flex items-center justify-center gap-3 shadow-lg border-2 border-black border-b-[6px] active:border-b-2 active:translate-y-[4px] disabled:opacity-50`}>
            {isLoggingIn ? <Loader2 className="animate-spin" /> : "Sign in with Google"}
          </button>

          {authError && (
            <div className="mt-6 p-4 bg-red-50 border-2 border-red-500 text-red-700 font-bold rounded-xl text-sm animate-in fade-in slide-in-from-bottom-2 text-left">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg">⚠️</span> 
                <span className="uppercase tracking-widest text-[10px]">Access Blocked</span>
              </div>
              <div className="mb-3">{authError}</div>
              <div className="text-xs font-normal pt-2 border-t border-red-200 text-red-600">
                <p className="mb-1"><strong>Action Required:</strong> Go to Firebase Console &gt; Authentication &gt; Settings &gt; Authorized Domains and add:</p>
                <code className="bg-white/50 px-2 py-0.5 rounded font-mono font-bold block mt-1 text-center border border-red-200">
                  {typeof window !== 'undefined' ? window.location.hostname : 'your-vercel-link.vercel.app'}
                </code>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8 font-sans text-gray-800 flex flex-col items-center transition-colors duration-500" style={{ background: `linear-gradient(to top, ${currentTheme.hex}10 0%, #f8fafc 40%, #ffffff 100%)` }}>
      
      <style>
        {`
          @keyframes typing { from { width: 0; } to { width: 100%; } }
          .typewriter { overflow: hidden; white-space: nowrap; width: 0; animation: typing 1.5s steps(24, end) forwards; animation-delay: 0.5s; }
        `}
      </style>

      {/* Top Navigation Bar - Corrected Spacing */}
      <div className={`w-full max-w-7xl bg-slate-200/80 backdrop-blur-md rounded-2xl md:rounded-full px-6 md:px-8 py-5 md:py-4 shadow-sm border-[3px] ${currentTheme.border} mb-2 flex flex-col md:flex-row justify-between items-center gap-4 transition-colors duration-500`}>
        <RVALogo large={false} theme={currentTheme} />
        
        <div className="flex items-center gap-2 md:gap-3 flex-wrap md:flex-nowrap justify-center">
          {isStaff && selectedStudentId && !showAdminPanel && (
            <button 
              onClick={() => { setViewAsStudent(!viewAsStudent); setShowSettings(false); }} 
              className={`flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-full transition-all border-2 border-black whitespace-nowrap ${viewAsStudent ? 'bg-amber-100 text-amber-800' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
              {viewAsStudent ? <EyeOff size={16} /> : <Eye size={16} />} 
              <span className="hidden lg:inline">{viewAsStudent ? 'Exit View' : 'Student View'}</span>
            </button>
          )}
          
          {isStaff && !showAdminPanel && (
            <select className={`p-2.5 bg-white border-2 border-black rounded-xl text-sm font-bold text-gray-700 outline-none focus:${currentTheme.border} transition-colors max-w-[160px] md:max-w-[200px] truncate shrink`} value={selectedStudentId || ''} onChange={(e) => { setSelectedStudentId(e.target.value); setViewAsStudent(false); setShowSettings(false); }}>
              <option value="">-- Select Student --</option>
              {studentsList.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          )}
          
          {userRole === 'admin' && (
            <button 
              onClick={() => { setShowAdminPanel(!showAdminPanel); setSelectedStudentId(null); setShowSettings(false); }} 
              className={`flex items-center gap-2 px-4 py-2.5 rounded-full border-2 border-black transition-colors font-bold text-sm whitespace-nowrap ${showAdminPanel ? 'bg-blue-100 text-blue-700' : 'bg-white text-gray-700 hover:bg-gray-50'}`} 
              title="Admin Settings">
              <Shield size={16} />
              <span className="hidden lg:inline">{showAdminPanel ? 'Exit Admin' : 'Admin'}</span>
            </button>
          )}

          {uploadTargetId && (
            <div className="relative w-11 h-11 rounded-full border-2 border-black overflow-hidden group cursor-pointer shrink-0 ml-1 shadow-sm bg-gray-200 flex items-center justify-center">
              {displayPhoto ? (
                <img src={displayPhoto} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <User size={24} className="text-gray-400" />
              )}
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera size={16} className="text-white" />
              </div>
              <input type="file" accept="image/*" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handlePhotoUpload} />
            </div>
          )}

          <div className="relative flex items-center">
            <button onClick={() => setShowThemeMenu(!showThemeMenu)} className="p-2.5 rounded-full bg-white border-2 border-black hover:bg-gray-50 transition-colors shrink-0" title="Color Theme">
              <Palette size={20} className="text-gray-700" />
            </button>
            {showThemeMenu && (
              <div className="absolute right-0 top-full mt-2 p-3 bg-white border-2 border-black rounded-2xl shadow-xl flex gap-3 z-50 animate-in fade-in zoom-in-95 duration-200">
                {Object.values(THEMES).map(t => (
                  <button 
                    key={t.id} 
                    onClick={() => changeTheme(t.id)} 
                    className={`w-8 h-8 rounded-full border-2 border-black shadow-inner ${t.primary} transition-all ${userThemeId === t.id ? 'ring-2 ring-offset-2 ring-black scale-110' : 'hover:scale-110 opacity-70 hover:opacity-100'}`} 
                    title={t.name} 
                  />
                ))}
              </div>
            )}
          </div>

          <button onClick={() => auth.signOut()} className="text-gray-500 hover:text-red-600 font-bold p-2.5 rounded-full bg-white border-2 border-black hover:bg-red-50 transition-colors shrink-0">
            <LogOut size={20} />
          </button>
        </div>
      </div>

      {/* Settings Link */}
      {isStaff && selectedStudentId && !showAdminPanel && !viewAsStudent && (
        <div className="w-full max-w-7xl text-right mb-6 px-4 flex justify-between items-center">
          <div className="text-sm font-bold text-gray-500 flex items-center gap-2">
            <UserPlus size={16} /> Pre-load students via Admin Dashboard
          </div>
          <button 
            onClick={() => setShowSettings(!showSettings)} 
            className={`${currentTheme.text} ${currentTheme.hoverText} font-black text-sm uppercase tracking-widest transition-colors flex items-center gap-1 underline underline-offset-4 decoration-2`}>
            <Settings size={14} /> {showSettings ? 'Close Configuration' : 'Configure Student Profile'}
          </button>
        </div>
      )}

      {showAdminPanel ? (
        <div className={`w-full max-w-7xl ${currentTheme.primary} rounded-[40px] p-8 md:p-12 shadow-lg border-[3px] ${currentTheme.borderDark} mt-4 text-center transition-colors duration-500`}>
          <Shield size={48} className="text-white opacity-20 mx-auto mb-4" />
          <h2 className="text-3xl font-black text-white mb-4">Admin Dashboard</h2>
          <p className="text-white/80 text-lg mb-8">Manage user access and pre-load student profiles before their first login.</p>
          
          <div className="max-w-4xl mx-auto text-left">
            
            {adminMessage.text && (
              <div className={`mb-6 p-4 rounded-xl border-2 font-bold animate-in fade-in slide-in-from-top-2 ${adminMessage.type === 'error' ? 'bg-red-50 text-red-700 border-red-500' : 'bg-emerald-50 text-emerald-700 border-[#2D6A4F]'}`}>
                {adminMessage.type === 'error' ? '⚠️' : '✅'} {adminMessage.text}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
              {/* Preload Student Box */}
              <div className="bg-white p-8 rounded-3xl border-2 border-black shadow-sm flex flex-col h-full">
                <h3 className={`font-black text-xl flex items-center gap-2 mb-2 ${currentTheme.text}`}><Users size={24} /> Pre-load Student</h3>
                <p className="text-xs text-gray-500 font-bold mb-6 flex-1">Create a profile using their email address. This allows you to configure their classes and baseline score before they ever log in.</p>
                <div className="space-y-3">
                  <input type="text" placeholder="Student First & Last Name..." className={`w-full p-3 border-2 border-black rounded-xl font-bold text-gray-700 outline-none focus:${currentTheme.border}`} value={preloadName} onChange={e => setPreloadName(e.target.value)} />
                  <input type="email" placeholder="Student Google Email..." className={`w-full p-3 border-2 border-black rounded-xl font-bold text-gray-700 outline-none focus:${currentTheme.border}`} value={preloadEmail} onChange={e => setPreloadEmail(e.target.value)} />
                  <button onClick={handlePreloadStudent} className={`w-full py-3 mt-2 ${currentTheme.primary} ${currentTheme.hover} text-white font-bold rounded-xl border-2 border-black transition-colors flex justify-center items-center gap-2`}>
                    <UserPlus size={18} /> Pre-load Profile
                  </button>
                </div>
              </div>

              {/* Staff Access Box */}
              <div className="bg-white p-8 rounded-3xl border-2 border-black shadow-sm flex flex-col h-full">
                <h3 className={`font-black text-xl flex items-center gap-2 mb-2 ${currentTheme.text}`}><Shield size={24} /> Grant Staff Access</h3>
                <p className="text-xs text-gray-500 font-bold mb-6 flex-1">Authorize a teacher or administrator to access the system and manage student dashboards.</p>
                <div className="space-y-3">
                  <input type="email" placeholder="Staff Email Address..." className={`w-full p-3 border-2 border-black rounded-xl font-bold text-gray-700 outline-none focus:${currentTheme.border}`} value={newAllowedEmail} onChange={e => setNewAllowedEmail(e.target.value)} />
                  <select className={`w-full p-3 border-2 border-black rounded-xl font-bold text-gray-700 outline-none focus:${currentTheme.border}`} value={newAllowedRole} onChange={e => setNewAllowedRole(e.target.value)}>
                    <option value="teacher">Teacher (Staff)</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button onClick={handleAddStaff} className={`w-full py-3 mt-2 ${currentTheme.primary} ${currentTheme.hover} text-white font-bold rounded-xl border-2 border-black transition-colors`}>Authorize Staff</button>
                </div>
              </div>
            </div>

            {/* List Management Box */}
            <div className="bg-white p-8 rounded-3xl border-2 border-black shadow-sm mb-8">
              
              <div className="flex flex-col md:flex-row justify-between items-center border-b-2 border-gray-200 pb-4 mb-6">
                <h3 className={`font-black text-xl flex items-center gap-2 ${currentTheme.text}`}>System Database</h3>
                <button 
                  onClick={handleBulkExport} 
                  disabled={isExporting || studentsList.length === 0}
                  className="flex items-center gap-2 px-4 py-2 mt-4 md:mt-0 bg-emerald-50 text-[#2D6A4F] border-2 border-black rounded-xl text-xs font-black uppercase tracking-widest hover:bg-emerald-100 transition-all disabled:opacity-50">
                  {isExporting ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />} 
                  Master Data Export
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {/* Students List */}
                <div>
                  <h4 className="font-black text-gray-800 mb-3 flex items-center gap-2"><Users size={18} className="text-gray-400"/> Registered Students</h4>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                    {studentsList.map(s => (
                      <div key={s.id} className="flex justify-between items-center p-3 border-2 border-black rounded-xl bg-gray-50 hover:bg-white transition-colors">
                        <div>
                          <div className="font-bold text-gray-900 text-sm">{s.name}</div>
                          <div className="text-[10px] font-black uppercase tracking-widest text-gray-500 mt-0.5">{s.email}</div>
                        </div>
                        {confirmDeleteId === s.id ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => executeDeleteStudent(s.id, s.email)} className="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded border-2 border-black hover:bg-red-600">Yes</button>
                            <button onClick={() => setConfirmDeleteId(null)} className="px-2 py-1 bg-white text-gray-700 text-xs font-bold rounded border-2 border-black hover:bg-gray-100">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setConfirmDeleteId(s.id)} className="p-1.5 border-2 border-black text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16}/></button>
                        )}
                      </div>
                    ))}
                    {studentsList.length === 0 && <div className="text-gray-500 font-bold p-4 text-sm border-2 border-dashed border-gray-300 rounded-xl text-center">No students found.</div>}
                  </div>
                </div>

                {/* Staff List */}
                <div>
                  <h4 className="font-black text-gray-800 mb-3 flex items-center gap-2"><Shield size={18} className="text-gray-400"/> Authorized Staff</h4>
                  <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2">
                    {allowedUsersList.filter(u => u.role !== 'student').map(u => (
                      <div key={u.email} className="flex justify-between items-center p-3 border-2 border-black rounded-xl bg-gray-50 hover:bg-white transition-colors">
                        <div>
                          <div className="font-bold text-gray-900 text-sm truncate max-w-[150px]">{u.email}</div>
                          <div className={`text-[10px] font-black uppercase tracking-widest mt-0.5 ${currentTheme.text}`}>{u.role}</div>
                        </div>
                        {u.email.toLowerCase() !== ADMIN_EMAIL.toLowerCase() && (
                          confirmStaffDelete === u.email ? (
                            <div className="flex items-center gap-1">
                              <button onClick={() => executeDeleteStaff(u.email)} className="px-2 py-1 bg-red-500 text-white text-xs font-bold rounded border-2 border-black hover:bg-red-600">Yes</button>
                              <button onClick={() => setConfirmStaffDelete(null)} className="px-2 py-1 bg-white text-gray-700 text-xs font-bold rounded border-2 border-black hover:bg-gray-100">No</button>
                            </div>
                          ) : (
                            <button onClick={() => setConfirmStaffDelete(u.email)} className="p-1.5 border-2 border-black text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"><Trash2 size={16}/></button>
                          )
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

            </div>

          </div>

          <button onClick={() => setShowAdminPanel(false)} className={`px-8 py-4 bg-white ${currentTheme.text} font-bold rounded-2xl hover:bg-gray-100 transition-all shadow-xl border-2 border-black inline-flex items-center gap-2`}>
            Return to Dashboard
          </button>
        </div>
      ) : showSettings ? (
        <div className={`w-full max-w-7xl bg-slate-200/80 backdrop-blur-md rounded-[40px] p-8 shadow-sm border-[3px] ${currentTheme.border} mt-4 transition-colors duration-500`}>
          <div className="flex items-center justify-center gap-3 mb-8">
            <Settings size={32} className={currentTheme.text} />
            <h2 className="text-3xl font-black text-gray-900">Student Configuration</h2>
          </div>
          
          <div className="bg-white p-8 rounded-3xl border border-gray-200 text-left space-y-6 max-w-4xl mx-auto shadow-sm">
            <div className="space-y-4">
              <h3 className="font-black text-lg text-gray-800 border-b-2 border-gray-100 pb-2 flex items-center gap-2"><Flame size={20} className="text-orange-500"/> Scoring Metrics</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <div className="flex items-center justify-between mb-1.5 h-4">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest leading-none">Starting Health Score</label>
                    {isStartingScoreLocked && (
                      <button onClick={() => setIsStartingScoreLocked(false)} className="text-gray-400 hover:text-gray-700 transition-colors" title="Unlock Score">
                        <Edit3 size={14} />
                      </button>
                    )}
                  </div>
                  <input type="number" disabled={isStartingScoreLocked} className={`w-full p-3 border-2 border-black rounded-xl font-bold text-gray-700 outline-none ${isStartingScoreLocked ? 'bg-gray-200 opacity-70 cursor-not-allowed' : `bg-gray-50 focus:${currentTheme.border}`}`} value={startingScore} onChange={e => setStartingScore(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 h-4 flex items-center">Manually Edit Daily Score (+ / -)</label>
                  <input type="number" className={`w-full p-3 bg-gray-50 border-2 border-black rounded-xl font-bold text-gray-700 outline-none focus:${currentTheme.border}`} value={teacherDailyAdjustment} onChange={e => setTeacherDailyAdjustment(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
                <div>
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5 h-4 flex items-center">Manually Edit Overall Score (+ / -)</label>
                  <input type="number" className={`w-full p-3 bg-gray-50 border-2 border-black rounded-xl font-bold text-gray-700 outline-none focus:${currentTheme.border}`} value={teacherAdjustment} onChange={e => setTeacherAdjustment(e.target.value === '' ? '' : Number(e.target.value))} />
                </div>
                <div className="md:col-span-3 mt-2">
                  <label className="block text-[10px] font-black text-gray-400 uppercase tracking-widest mb-1.5">Goal Text (e.g. "No missing work", "Less than 5 missing")</label>
                  <input type="text" className={`w-full p-3 bg-gray-50 border-2 border-black rounded-xl font-bold text-gray-700 outline-none focus:${currentTheme.border}`} value={goalText} onChange={e => setGoalText(e.target.value)} />
                </div>
              </div>
            </div>

            <div className="space-y-4 pt-4">
              <h3 className="font-black text-lg text-gray-800 border-b-2 border-gray-100 pb-2 flex items-center gap-2"><Activity size={20} className={currentTheme.text}/> Tracked Classes</h3>
              {subjects.map((sub, i) => (
                <div key={i} className="flex gap-2">
                  <input className={`flex-1 p-3 bg-gray-50 border-2 border-black rounded-xl font-bold text-gray-700 outline-none focus:${currentTheme.border}`} value={sub} onChange={e => { const n = [...subjects]; n[i] = e.target.value; setSubjects(n); }} />
                  <button onClick={() => setSubjects(subjects.filter((_, idx) => idx !== i))} className="p-3 border-2 border-black text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all shrink-0"><Trash2 size={20}/></button>
                </div>
              ))}
              <button onClick={() => setSubjects([...subjects, ''])} className="px-4 py-3 bg-emerald-50 text-[#2D6A4F] font-bold rounded-xl hover:bg-emerald-100 transition-all text-sm border-2 border-black">+ Add Class</button>
            </div>

            <div className="space-y-4 pt-4">
              <h3 className="font-black text-lg text-gray-800 border-b-2 border-gray-100 pb-2 flex items-center gap-2"><CheckCircle2 size={20} className="text-[#2D6A4F]"/> Target Habits</h3>
              {habits.map((hab, i) => (
                <div key={i} className="flex gap-2">
                  <input className={`flex-1 p-3 bg-gray-50 border-2 border-black rounded-xl font-bold text-gray-700 outline-none focus:${currentTheme.border}`} value={hab} onChange={e => { const n = [...habits]; n[i] = e.target.value; setHabits(n); }} />
                  <button onClick={() => setHabits(habits.filter((_, idx) => idx !== i))} className="p-3 border-2 border-black text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl transition-all shrink-0"><Trash2 size={20}/></button>
                </div>
              ))}
              <button onClick={() => setHabits([...habits, ''])} className="px-4 py-3 bg-emerald-50 text-[#2D6A4F] font-bold rounded-xl hover:bg-emerald-100 transition-all text-sm border-2 border-black">+ Add Habit</button>
            </div>

            <div className="pt-6 border-t border-gray-100 flex flex-col md:flex-row gap-4">
              <button onClick={saveSettings} className={`flex-1 py-4 ${currentTheme.primary} text-white font-black rounded-xl ${currentTheme.hover} transition-all shadow-md border-2 border-black border-b-[6px] active:border-b-2 active:translate-y-[4px]`}>Save Settings</button>
              <button onClick={() => setShowSettings(false)} className="px-8 py-4 bg-white border-2 border-black text-gray-700 font-bold rounded-xl hover:bg-gray-50 transition-all shadow-sm">Cancel</button>
            </div>
          </div>
        </div>
      ) : !selectedStudentId ? (
        <div className={`w-full max-w-3xl ${currentTheme.primary} rounded-[40px] p-12 text-center shadow-lg border-[3px] ${currentTheme.borderDark} mt-8 transition-colors duration-500`}>
          <Activity size={48} className="text-white opacity-20 mx-auto mb-4" />
          <h2 className="text-3xl font-black text-white mb-2">Ready to Equip?</h2>
          <p className="text-white/80 text-lg">Select a student from the menu above to start your session.</p>
        </div>
      ) : (
        <div className="w-full max-w-7xl grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            
            {/* Daily Submission Panel */}
            {!isEffectivelyStaff && (
              <div className={`bg-slate-200/80 backdrop-blur-md rounded-[40px] p-8 shadow-sm border-[3px] ${currentTheme.border} transition-colors duration-500`}>
                {isSubmittedToday && !isEditingToday ? (
                  <div className="text-center py-10">
                    <div className="w-20 h-20 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-6 border-4 border-emerald-100"><CheckCircle2 size={40} className="text-[#2D6A4F]" /></div>
                    <h2 className="text-2xl font-black text-gray-900 mb-2">Check-in Complete!</h2>
                    <p className="text-gray-500 mb-8">You've logged your progress for today.</p>
                    <button onClick={() => setIsEditingToday(true)} className="px-6 py-3 bg-white border-2 border-black text-gray-700 font-bold rounded-xl hover:bg-gray-50"><Edit3 size={18} className="inline mr-2" /> Edit Entry</button>
                  </div>
                ) : (
                  <div className="space-y-8 animate-in fade-in duration-300">
                    <h2 className={`text-xl font-black flex items-center gap-2 ${currentTheme.text}`}><Activity size={24} /> Today's Focus</h2>
                    
                    <div className="bg-white border-2 border-gray-200 p-6 rounded-3xl shadow-sm">
                      <p className="font-bold text-gray-800 mb-4">Select classes with <strong className={currentTheme.text}>{goalText}</strong>:</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {activeSubjects.map(sub => (
                          <button 
                            key={sub} 
                            onClick={() => { const current = todayData.caughtUpSubjects.includes(sub); setTodayData({...todayData, caughtUpSubjects: current ? todayData.caughtUpSubjects.filter(s => s !== sub) : [...todayData.caughtUpSubjects, sub]}); current ? playUnclick() : playClick(); setIsNoneSubjects(false); }} 
                            className={`p-4 rounded-2xl border-2 font-bold text-sm transition-all text-left flex items-center gap-3 border-black ${todayData.caughtUpSubjects.includes(sub) && !isNoneSubjects ? 'bg-[#E8F5E9] text-[#1B4332] shadow-sm' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                            {todayData.caughtUpSubjects.includes(sub) && !isNoneSubjects ? <CheckCircle2 size={18} className="shrink-0" /> : <Circle size={18} className="text-gray-400 shrink-0" />} 
                            <span className="leading-tight">{sub}</span>
                          </button>
                        ))}
                      </div>
                      <button 
                        onClick={() => { const next = !isNoneSubjects; setIsNoneSubjects(next); setTodayData({...todayData, caughtUpSubjects: []}); next ? playClick() : playUnclick(); }} 
                        className={`mt-4 w-full p-4 rounded-xl border-2 font-bold transition-all border-black text-left flex items-center gap-3 ${isNoneSubjects ? 'bg-[#E8F5E9] text-[#1B4332] shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        {isNoneSubjects ? <CheckCircle2 size={18} className="shrink-0" /> : <Circle size={18} className="text-gray-400 shrink-0" />} 
                        <span className="leading-tight">I am not fully caught up in any classes yet.</span>
                      </button>
                    </div>

                    <div className="bg-white border-2 border-gray-200 p-6 rounded-3xl shadow-sm">
                      <p className="font-bold text-gray-800 mb-4">Target Habits:</p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {activeHabits.map(hab => (
                          <button 
                            key={hab} 
                            onClick={() => { const current = todayData.completedHabits.includes(hab); setTodayData({...todayData, completedHabits: current ? todayData.completedHabits.filter(h => h !== hab) : [...todayData.completedHabits, hab]}); current ? playUnclick() : playClick(); setIsNoneHabits(false); }} 
                            className={`p-4 rounded-2xl border-2 font-bold text-sm transition-all text-left flex items-center gap-3 border-black ${todayData.completedHabits.includes(hab) && !isNoneHabits ? 'bg-[#E8F5E9] text-[#1B4332] shadow-sm' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>
                            {todayData.completedHabits.includes(hab) && !isNoneHabits ? <CheckCircle2 size={18} className="shrink-0" /> : <Circle size={18} className="text-gray-400 shrink-0" />} 
                            <span className="leading-tight">{hab}</span>
                          </button>
                        ))}
                      </div>
                      <button 
                        onClick={() => { const next = !isNoneHabits; setIsNoneHabits(next); setTodayData({...todayData, completedHabits: []}); next ? playClick() : playUnclick(); }} 
                        className={`mt-4 w-full p-4 rounded-xl border-2 font-bold transition-all border-black text-left flex items-center gap-3 ${isNoneHabits ? 'bg-[#E8F5E9] text-[#1B4332] shadow-sm' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                        {isNoneHabits ? <CheckCircle2 size={18} className="shrink-0" /> : <Circle size={18} className="text-gray-400 shrink-0" />} 
                        <span className="leading-tight">I did not meet these habit goals today.</span>
                      </button>
                    </div>

                    <div className="bg-white border-2 border-gray-200 p-6 rounded-3xl shadow-sm">
                      <p className="font-bold text-gray-800 mb-4">Do you want to add a comment for your instructor?</p>
                      <textarea 
                        className={`w-full p-4 rounded-xl border-2 border-black font-bold text-sm text-gray-700 outline-none focus:${currentTheme.border} resize-none h-24`}
                        placeholder="Type your message here..."
                        value={todayData.newNote}
                        onChange={(e) => setTodayData({...todayData, newNote: e.target.value})}
                      />
                    </div>

                    <button onClick={submitToday} className={`w-full py-5 ${currentTheme.primary} ${currentTheme.hover} text-white font-black text-xl shadow-lg border-2 border-black border-b-[6px] active:border-b-2 active:translate-y-[4px] transition-all flex items-center justify-center gap-2`}><Send /> Save Daily Progress</button>
                  </div>
                )}
              </div>
            )}

            {/* Trends & Analytics Panel */}
            {trendsData && trendsData.totalDays > 0 && (
              <div className={`bg-slate-200/80 backdrop-blur-md rounded-[40px] p-8 shadow-sm border-[3px] ${currentTheme.border} transition-colors duration-500`}>
                <div className="flex items-center gap-2 mb-8">
                  <BarChart3 size={28} className={currentTheme.text} />
                  <h2 className="text-2xl font-black text-gray-900 tracking-tight">Trends & Analytics</h2>
                </div>
                
                <div className="bg-white p-6 rounded-3xl border-2 border-black shadow-sm mb-6 relative">
                  <div className="flex justify-between items-center mb-8">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm uppercase tracking-widest">
                      <TrendingUp size={18} className="text-blue-600" /> Score History
                    </h3>
                    <div className="flex gap-4 text-[10px] font-bold uppercase tracking-widest bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-200">
                      <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500 rounded-sm"></div> Overall</div>
                      <div className="flex items-center gap-1"><div className="w-3 h-3 bg-gray-300 rounded-sm"></div> Daily</div>
                    </div>
                  </div>

                  <div className="h-48 flex items-end gap-2 md:gap-4 border-b-2 border-black pb-0 px-2 relative">
                    {/* Background Grid Lines */}
                    <div className="absolute top-0 left-0 w-full border-t-2 border-dashed border-gray-200 -z-10 flex items-start">
                      <span className="text-[10px] text-gray-400 font-bold -mt-4 ml-1">100%</span>
                    </div>
                    <div className="absolute top-1/2 left-0 w-full border-t border-dashed border-gray-200 -z-10 flex items-start">
                      <span className="text-[10px] text-gray-400 font-bold -mt-4 ml-1">50%</span>
                    </div>
                    
                    {/* Overall Score Trend Line Overlay */}
                    <div className="absolute inset-0 w-full h-full pointer-events-none z-10 flex px-2 pb-0 mb-[2px]">
                      <svg className="w-full h-full overflow-visible" preserveAspectRatio="none" viewBox={`0 0 100 100`}>
                        <polyline 
                          points={trendsData.recentChart.map((day, i) => {
                            const x = (i + 0.5) * (100 / trendsData.recentChart.length);
                            const y = 100 - Math.max(Math.min(day.cumulativeScore || 0, 100), 0);
                            return `${x},${y}`;
                          }).join(' ')}
                          fill="none" 
                          stroke="#3b82f6" // blue-500
                          strokeWidth="2.5" 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                        />
                        {trendsData.recentChart.map((day, i) => {
                          const x = (i + 0.5) * (100 / trendsData.recentChart.length);
                          const y = 100 - Math.max(Math.min(day.cumulativeScore || 0, 100), 0);
                          return (
                            <circle key={i} cx={x} cy={y} r="1.5" fill="#3b82f6" className="drop-shadow-sm" />
                          );
                        })}
                      </svg>
                    </div>

                    {/* Daily Score Bars */}
                    {trendsData.recentChart.map((day, index) => {
                      return (
                        <div key={day.id + index} className="flex-1 flex flex-col items-center group relative h-full justify-end z-0">
                          <div 
                            className={`w-full max-w-[48px] rounded-t-lg transition-all group-hover:opacity-80 border-2 border-b-0 border-black shadow-[inset_0_-4px_0_rgba(0,0,0,0.1)] opacity-40 ${day.dailyScore >= 85 ? 'bg-[#2D6A4F]' : day.dailyScore >= 70 ? 'bg-amber-400' : 'bg-red-400'}`} 
                            style={{ height: `${Math.max(Math.min(day.dailyScore, 100), 5)}%` }}
                          ></div>
                          <span className="text-[10px] font-bold text-gray-600 mt-3 rotate-45 origin-top-left absolute -bottom-8 whitespace-nowrap">
                            {day.date.substring(5).replace('-', '/')}
                          </span>
                          
                          <div className="absolute bottom-full mb-2 bg-black text-white text-xs font-bold px-3 py-2 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-20 pointer-events-none shadow-xl border border-gray-700">
                            <div className="text-center text-lg">{day.dailyScore}% Daily</div>
                            <div className="text-center text-blue-300">{day.cumulativeScore}% Overall</div>
                            <div className="text-[10px] font-normal text-gray-400 mt-1">{day.date}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="h-10 w-full"></div> 
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white p-6 rounded-3xl border-2 border-black shadow-sm">
                     <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase tracking-widest border-b-2 border-gray-100 pb-2">Most Frequent Classes</h3>
                     {trendsData.topClasses.length === 0 ? (
                        <p className="text-sm text-gray-500 font-bold italic">No data yet.</p>
                     ) : (
                        <div className="space-y-3">
                          {trendsData.topClasses.map(([sub, count]) => (
                            <div key={sub} className="flex justify-between items-center group hover:bg-gray-50 p-2 -mx-2 rounded-xl transition-colors">
                              <span className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                <CheckCircle2 size={16} className="text-[#2D6A4F] opacity-50" /> {sub}
                              </span>
                              <div className="flex items-center gap-2">
                                <div className="w-16 lg:w-24 h-2 bg-gray-200 rounded-full overflow-hidden hidden sm:block">
                                  <div className="h-full bg-[#2D6A4F]" style={{ width: `${(count / trendsData.totalDays) * 100}%` }}></div>
                                </div>
                                <span className="text-xs font-black bg-gray-100 px-2 py-1 rounded-lg border border-gray-200 min-w-[50px] text-center">
                                  {count}/{trendsData.totalDays}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                     )}
                  </div>
                  
                  <div className="bg-white p-6 rounded-3xl border-2 border-black shadow-sm">
                     <h3 className="font-bold text-gray-800 mb-4 text-sm uppercase tracking-widest border-b-2 border-gray-100 pb-2">Top Habits Met</h3>
                     {trendsData.topHabits.length === 0 ? (
                        <p className="text-sm text-gray-500 font-bold italic">No data yet.</p>
                     ) : (
                        <div className="space-y-3">
                          {trendsData.topHabits.map(([hab, count]) => (
                            <div key={hab} className="flex justify-between items-center group hover:bg-gray-50 p-2 -mx-2 rounded-xl transition-colors">
                              <span className="text-sm font-bold text-gray-700 truncate mr-2 flex items-center gap-2" title={hab}>
                                <Sparkles size={16} className="text-blue-500 opacity-50 shrink-0" /> {hab}
                              </span>
                              <div className="flex items-center gap-2 shrink-0">
                                <div className="w-16 lg:w-24 h-2 bg-gray-200 rounded-full overflow-hidden hidden sm:block">
                                  <div className="h-full bg-blue-500" style={{ width: `${(count / trendsData.totalDays) * 100}%` }}></div>
                                </div>
                                <span className="text-xs font-black bg-gray-100 px-2 py-1 rounded-lg border border-gray-200 min-w-[50px] text-center">
                                  {count}/{trendsData.totalDays}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                     )}
                  </div>
                </div>
              </div>
            )}

            {/* History Panel */}
            <div className="space-y-4 pt-4">
              <div className="flex justify-between items-center px-2">
                <h2 className="text-xl font-black flex items-center gap-2 text-gray-800"><Calendar size={20} /> Submission History</h2>
                {history.length > 0 && (
                  <button 
                    onClick={() => exportToCSV(history, `Equip_Data_${studentsList.find(s=>s.id===selectedStudentId)?.name || 'Student'}_${new Date().toISOString().split('T')[0]}.csv`)} 
                    className="flex items-center gap-2 px-4 py-2 bg-white border-2 border-black rounded-xl text-xs font-black uppercase tracking-widest hover:bg-gray-50 transition-all shadow-sm">
                    <Download size={14} /> Export Data
                  </button>
                )}
              </div>
              
              {history.length === 0 ? (
                <div className="text-center py-8 px-4 border-2 border-dashed border-gray-300 rounded-3xl bg-slate-200/50">
                  <p className="text-gray-500 font-bold">No entries found for this student.</p>
                </div>
              ) : (
                history.map(day => (
                  <div key={day.id} className={`bg-slate-200/80 backdrop-blur-md rounded-[32px] p-6 shadow-sm border-[3px] ${currentTheme.border} transition-colors duration-500`}>
                    <div className="flex justify-between mb-4">
                      <div className="font-black text-lg text-gray-900">{day.date}</div>
                      <div className={`px-4 py-1 rounded-full text-white font-black text-sm border border-black/20 ${getHealthBg(Math.round(((day.caughtUpSubjects?.length||0) + (day.completedHabits?.length||0)) / (day.possibleCount||1) * 100))}`}>
                        {Math.round(((day.caughtUpSubjects?.length||0) + (day.completedHabits?.length||0)) / (day.possibleCount||1) * 100)}%
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {day.caughtUpSubjects?.map(s => <span key={s} className="px-3 py-1 bg-white text-[#2D6A4F] rounded-lg text-xs font-bold border-2 border-black">✓ {s}</span>)}
                      {day.completedHabits?.map(h => <span key={h} className="px-3 py-1 bg-white text-[#2D6A4F] rounded-lg text-xs font-bold border-2 border-black">✓ {h}</span>)}
                    </div>
                    
                    <div className="bg-white p-4 rounded-2xl space-y-3 shadow-sm border-2 border-black">
                      {day.notes?.map((n, i) => (
                        <div key={i} className={`flex flex-col ${n.author === 'Mr. Crockett' ? 'items-end' : 'items-start'}`}>
                          <div className={`p-3 rounded-2xl max-w-[85%] text-sm font-bold border-2 border-black ${n.author === 'Mr. Crockett' ? `${currentTheme.primary} text-white rounded-br-none` : 'bg-gray-100 text-gray-800 rounded-bl-none'}`}>{n.text}</div>
                          <span className="text-[10px] text-gray-500 mt-1 uppercase tracking-widest font-bold">{n.author} • {n.time}</span>
                        </div>
                      ))}
                      {isEffectivelyStaff && (
                        <div className="flex gap-2 pt-2 mt-2 border-t-2 border-gray-100">
                          <input type="text" placeholder="Reply..." className={`flex-1 p-2 text-sm rounded-xl border-2 border-black outline-none focus:${currentTheme.border}`} value={replyTexts[day.id] || ''} onChange={e => setReplyTexts({...replyTexts, [day.id]: e.target.value})} onKeyDown={e => e.key === 'Enter' && submitReply(day.id)} />
                          <button onClick={() => submitReply(day.id)} className={`p-2 px-3 ${currentTheme.primary} border-2 border-black text-white rounded-xl ${currentTheme.hover} transition-colors`}><Send size={16} /></button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

          </div>

          <div className="space-y-6">
            
            {/* COMPACT Health Score Panel (Moved to Sidebar) */}
            <div className={`bg-slate-200/80 backdrop-blur-md rounded-[40px] p-6 shadow-sm border-[3px] ${currentTheme.border} flex flex-col items-center gap-6 transition-colors duration-500`}>
              <div className="text-center">
                <h1 className="text-2xl font-black text-gray-900 tracking-tight">Academic Health</h1>
                <div className="flex items-center justify-center gap-2 text-orange-500 mt-1 font-black uppercase text-xs tracking-widest">
                  <Flame size={14} fill="currentColor" /> {currentStreak} Day Streak
                </div>
              </div>
              <div className="flex w-full justify-around items-center">
                <div className="flex flex-col items-center">
                  <div className="relative flex items-center justify-center w-20 h-20 font-black text-xl">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="#d1d5db" strokeWidth="8" />
                      <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="8" strokeDasharray="283" strokeDashoffset={283 * (1 - todayScore/100)} className={`${getHealthColor(todayScore)} transition-all duration-1000`} strokeLinecap="round" />
                    </svg>
                    <div className="absolute">{todayScore}</div>
                  </div>
                  <span className="text-[10px] font-black uppercase text-gray-500 mt-2 tracking-widest">Today</span>
                </div>
                <div className="flex flex-col items-center relative">
                  <div className="relative flex items-center justify-center w-24 h-24 font-black text-3xl">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="none" stroke="#d1d5db" strokeWidth="10" />
                      <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="10" strokeDasharray="283" strokeDashoffset={283 * (1 - Math.min(healthScore, 100)/100)} className={`${getHealthColor(healthScore)} transition-all duration-1000`} strokeLinecap="round" />
                    </svg>
                    <div className="absolute">{healthScore}</div>
                    {fireworksActive && <Sparkles size={40} className="absolute text-yellow-500 animate-bounce" />}
                  </div>
                  <span className="text-[10px] font-black uppercase text-gray-500 mt-2 tracking-widest">Overall</span>
                </div>
              </div>
            </div>

            {/* Research Panel Sidebar */}
            <div className={`bg-slate-200/80 backdrop-blur-md rounded-[40px] p-6 shadow-sm border-[3px] ${currentTheme.border} transition-colors duration-500`}>
              <h2 className="text-xl font-black mb-6 flex items-center gap-2"><Zap className="text-yellow-500" /> What Works for Me?</h2>
              {!researchUnlocked ? (
                <div className="text-center py-12 px-4 border-2 border-dashed border-gray-400 rounded-3xl bg-white">
                  <p className="text-gray-500 font-bold">Reach {startingScore + 10}% Overall Health to unlock your custom "What Works for Me?" panel!</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {Object.keys(researchData).map(cat => (
                    <div key={cat} className={`p-4 rounded-2xl border-2 border-black transition-all ${researchData[cat].approved ? 'bg-emerald-50' : 'bg-white'}`}>
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="text-[10px] font-black text-gray-600 uppercase tracking-[0.2em]">{cat}</h3>
                        {isEffectivelyStaff && <button onClick={() => handleApproveResearch(cat)} className={`p-1.5 rounded-lg transition-colors border-2 border-black ${researchData[cat].approved ? 'bg-[#2D6A4F] text-white hover:bg-[#1B4332]' : 'bg-white text-gray-700 hover:bg-gray-100'}`}><Zap size={14} /></button>}
                        {!isEffectivelyStaff && researchData[cat].approved && <Sparkles size={14} className="text-[#2D6A4F]" />}
                      </div>
                      {cat !== 'extra' ? (
                        <select className="w-full p-2 text-sm font-bold rounded-lg bg-gray-50 outline-none border-2 border-black text-gray-800" disabled={isEffectivelyStaff || researchData[cat].approved}>
                          <option value="">Pending entry...</option>
                        </select>
                      ) : (
                        <textarea className="w-full p-3 text-sm font-bold rounded-lg bg-gray-50 outline-none border-2 border-black text-gray-800 h-24" placeholder="Notes..." disabled={isEffectivelyStaff || researchData[cat].approved} />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
