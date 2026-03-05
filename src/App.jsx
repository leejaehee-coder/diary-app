import React, { useEffect, useRef, useState } from "react";
import "./App.css";

import { auth, googleProvider, db, storage } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  setDoc, // ✅ (추가) shoppingMeta 저장용
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

function App() {
  const [user, setUser] = useState(null);
    // 🔊 공통 사운드 재생 함수
  const playSound = (fileName) => {
    try {
      const audio = new Audio(`/sfx/${fileName}`);
      audio.volume = 0.6; // 볼륨 (0~1)
      audio.play();
    } catch (e) {
      console.warn("sound play fail:", e);
    }
  };
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [text, setText] = useState("");
  const [entryPhotoFile, setEntryPhotoFile] = useState(null);
  const entryPhotoInputRef = useRef(null);

  const [entries, setEntries] = useState([]);

  const [todoText, setTodoText] = useState("");
  const [price, setPrice] = useState("");
  const [todos, setTodos] = useState([]);
  const [shoppingImageUrl, setShoppingImageUrl] = useState("");
  const [shoppingImagePath, setShoppingImagePath] = useState("");
const [receiptUploading, setReceiptUploading] = useState(false);
const receiptInputRef = useRef(null);
  // ✅ 보기 모드: all | diary | todo
  const [viewMode, setViewMode] = useState("all");
  // ✅ (추가) Entry 검색 (D 상세화면에서만 사용)
const [entrySearch, setEntrySearch] = useState("");
const [entrySearchApplied, setEntrySearchApplied] = useState("");

// ✅ (추가) 검색 적용/해제
const applyEntrySearch = () => {
  setEntrySearchApplied((entrySearch || "").trim());
};

const clearEntrySearch = () => {
  setEntrySearch("");
  setEntrySearchApplied("");
};

  // ✅ TODO 섹션 내부 모드: todo | shopping
  const [todoMode, setTodoMode] = useState("todo");
  const todayKey = new Date().toISOString().slice(0, 10);
  const nowHHMM = new Date().toTimeString().slice(0, 5);
  const isDetailView = viewMode === "todo" || viewMode === "shopping";

  // ✅ (추가) 전체화면 상단 표시: 월.일.요일
  const nowMDW = new Date()
    .toLocaleDateString("ko-KR", {
      month: "numeric",
      day: "numeric",
      weekday: "short",
    })
    .replaceAll(" ", "."); // 예: "2.22.일"

  // 로그인 상태 감지
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsub();
  }, []);

  // 날짜 자동
  useEffect(() => {
    const now = new Date();
    setDate(now.toISOString().slice(0, 10));
    setTime(now.toTimeString().slice(0, 5));
  }, []);

  // entries realtime
  useEffect(() => {
    if (!user) {
      setEntries([]);
      return;
    }

    const ref = collection(db, "users", user.uid, "entries");
    const q = query(ref, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setEntries(arr);
    });

    return () => unsub();
  }, [user]);

  // todos realtime
  useEffect(() => {
    if (!user) {
      setTodos([]);
      return;
    }

    const ref = collection(db, "users", user.uid, "todos");
    const q = query(ref, orderBy("createdAt", "desc"));

    const unsub = onSnapshot(q, (snap) => {
      const arr = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTodos(arr);
    });

    return () => unsub();
  }, [user]);
  // ✅ (추가) 오늘 영수증 meta realtime (저장 성공 후 버튼 진노랑/보기 가능)
useEffect(() => {
  if (!user) {
    setShoppingImageUrl("");
    setShoppingImagePath("");
    return;
  }

  const dateKey = todayKey;
  const metaRef = doc(db, "users", user.uid, "shoppingMeta", dateKey);

  const unsub = onSnapshot(
    metaRef,
    (snap) => {
      if (!snap.exists()) {
        setShoppingImageUrl("");
        setShoppingImagePath("");
        return;
      }
      const data = snap.data() || {};
      setShoppingImageUrl(data.imageUrl || "");
      setShoppingImagePath(data.imagePath || "");
    },
    (err) => {
      console.error("shoppingMeta snapshot error:", err);
      setShoppingImageUrl("");
      setShoppingImagePath("");
    }
  );

  return () => unsub();
}, [user, todayKey]);

  // Google 로그인
  const loginGoogle = async () => {
    await signInWithPopup(auth, googleProvider);
  };

  // 로그아웃
  const logout = async () => {
    await signOut(auth);
  };

  // ✅ (추가) 일기 삭제
  const deleteEntry = async (id) => {
    if (!user) return;
    const ref = doc(db, "users", user.uid, "entries", id);
    await deleteDoc(ref);
  };

     // 일기 저장 (+ 사진 1장 업로드)
  const save = async () => {
    try {
      if (!user) return;
      const t = (text || "").trim();
      if (!t) return;

      let imageUrl = "";
      let imagePath = "";

      // ✅ 사진 업로드는 "실패해도 저장 계속" + "무한대기 방지(타임아웃)"
      const withTimeout = (promise, ms = 12000) =>
        Promise.race([
          promise,
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("사진 업로드 타임아웃")), ms)
          ),
        ]);

      if (entryPhotoFile) {
        playSound("camera-shutter.wav");
        try {
          const ext = (entryPhotoFile.name || "").split(".").pop() || "jpg";
          imagePath = `users/${user.uid}/entries/${Date.now()}.${ext}`;

          const sRef = storageRef(storage, imagePath);

          // 업로드가 멈추는 경우를 막기 위해 타임아웃 적용
                    await withTimeout(uploadBytes(sRef, entryPhotoFile), 12000);
          imageUrl = await withTimeout(getDownloadURL(sRef), 12000);

          
        } catch (err) {
          console.error("사진 업로드 실패(무시하고 텍스트 저장 진행):", err);
          imageUrl = "";
          imagePath = "";
        }
      }

      const ref = collection(db, "users", user.uid, "entries");
      await addDoc(ref, {
        text: t,
        completed: false,
        date,
        time: new Date().toTimeString().slice(0, 5),
        createdAt: serverTimestamp(),
        imageUrl,
        imagePath,
      });
            // 🔊 일기 저장 성공 → 페이지 넘김
      if (!entryPhotoFile) playSound("page-turn.mp3");
      setText("");
      setEntryPhotoFile(null);
      if (entryPhotoInputRef.current) entryPhotoInputRef.current.value = "";
    } catch (err) {
      // ✅ save 전체에서 어떤 에러가 나도 콘솔에 무조건 찍히게
      console.error("save() 전체 실패:", err);
    }
  };
const handleReceiptClick = () => {
  console.log("receipt click ✅", {
    todoMode,
    before: shoppingImageUrl,
    time: new Date().toISOString(),
  });

  // 클릭할 때마다 값 토글 → 색 변화 확인용
  setShoppingImageUrl((prev) => (prev ? "" : "temp"));
};
  // Todo 추가
  const addTodo = async () => {
    try {
      if (!user) {
        alert("로그인이 필요해요!");
        return;
      }

      const t = (todoText || "").trim();
      if (!t) {
        alert("내용을 입력해줘!");
        return;
      }

      const dateKey = new Date().toISOString().slice(0, 10);

      const ref = collection(db, "users", user.uid, "todos");

      const isShopping = todoMode === "shopping";
      const priceNum = isShopping ? Number(price || 0) : 0;

      await addDoc(ref, {
        text: t,
        completed: false,
        date: dateKey,
        kind: isShopping ? "shopping" : "todo",
        price: priceNum,
        createdAt: serverTimestamp(),
      });

      // ✅ 성공 표시(이제 "안 먹힘"인지 확실히 알 수 있음)
      console.log("ADD OK:", {
        kind: isShopping ? "shopping" : "todo",
        t,
        priceNum,
      });

      setTodoText("");
      setPrice("");
      // 🔊 쇼핑 아이템 추가 성공 → 차칭
if (isShopping) playSound("cash-kaching.mp3");
    } catch (e) {
      console.error("ADD FAIL:", e);
      alert(e?.message || "저장 실패(콘솔 확인)");
    }
  };
/* ===== START: OCR -> create shopping items (today only) ===== */
const runOcrToShoppingToday = async () => {
  try {
    if (!user?.uid) {
      alert("로그인이 필요해요!");
      return;
    }

    const dateKey = todayKey; // ✅ 너 코드에 todayKey가 이미 있어야 함

    // 1) shoppingMeta에서 OCR 결과 읽기
    const metaRef = doc(db, "users", user.uid, "shoppingMeta", dateKey);
    const metaSnap = await getDoc(metaRef);

    if (!metaSnap.exists()) {
      alert("오늘 영수증 메타가 없어요. 먼저 Receipt로 사진을 올려줘!");
      return;
    }

    const meta = metaSnap.data() || {};

    if (meta.receiptOcrStatus !== "done") {
      alert("OCR이 아직 완료되지 않았어. (status가 done이 아님)");
      return;
    }

    // 이미 생성했으면 중복 방지
    if (meta.receiptOcrAppliedAt) {
      alert("이미 오늘 OCR 항목이 생성된 적이 있어. (중복 방지)");
      return;
    }

    const raw = String(meta.receiptOcrRawText || "").trim();
    if (!raw) {
      alert("OCR 텍스트가 비어 있어. (receiptOcrRawText 없음)");
      return;
    }

    // 2) 간단 파싱: '품목 ... 금액' 형태 라인 추출 (최대 20개)
    const lines = raw
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);

    const picked = [];
    for (const line of lines) {
      const m = line.match(
        /^(.{1,30}?)\s+([0-9]{1,3}(?:,[0-9]{3})+|[0-9]{3,})\s*원?$/
      );
      if (!m) continue;

      const name = String(m[1] || "").trim();
      const priceNum = parseInt(String(m[2]).replace(/,/g, ""), 10);

      if (!name) continue;
      if (!Number.isFinite(priceNum) || priceNum <= 0) continue;

      picked.push({ text: name, price: priceNum });
      if (picked.length >= 20) break;
    }

    if (picked.length === 0) {
      alert(
        "자동으로 뽑을 만한 항목/가격 라인을 못 찾았어. (영수증 형식 때문일 수 있어)"
      );
      return;
    }

    // 3) Firestore todos에 생성
    const todosRef = collection(db, "users", user.uid, "todos");

    await Promise.all(
      picked.map((it) =>
        addDoc(todosRef, {
          text: it.text,
          completed: false,
          date: dateKey,
          kind: "shopping",
          price: it.price,
          createdAt: serverTimestamp(),
          source: "ocr",
        })
      )
    );

    // 4) 중복 방지 마킹
    await setDoc(
      metaRef,
      { receiptOcrAppliedAt: serverTimestamp() },
      { merge: true }
    );

    alert(`OCR 항목 ${picked.length}개를 오늘 쇼핑에 추가했어!`);
  } catch (e) {
    console.error("runOcrToShoppingToday fail:", e);
    alert(e?.message || "OCR 항목 생성 실패(콘솔 확인)");
  }
};
/* ===== END: OCR -> create shopping items (today only) ===== */
  
  // Todo 토글
  const toggleTodo = async (id, completed) => {
    if (!user) return;
    const ref = doc(db, "users", user.uid, "todos", id);
    await updateDoc(ref, { completed: !completed });

    // 🔊 TODO 체크 토글 성공 → 벨
    playSound("bell-check.mp3");
  };

  // Todo 삭제
  const deleteTodoItem = async (id) => {
    if (!user) return;
    const ref = doc(db, "users", user.uid, "todos", id);
    await deleteDoc(ref);
  };

  return (
    <div className="wrap">
      <header className="top">
        <div>
          <div className="titleDaily">Daily Ink</div>
          <div className="subtitle">오늘의 기록</div>
        </div>
      </header>
      {/* 상단 로그인/로그아웃 + 보기모드 버튼 */}
      <div
        className="topAuthRow"
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "10px",
        }}
      >
        {/* ✅ 로그아웃 버튼 앞: 보기모드 버튼 3개 */}
        <div className="viewToggle">
          <button
            type="button"
            className={`viewBtn all ${viewMode === "all" ? "active" : ""}`}
            onClick={() => setViewMode("all")}
            title="둘 다 보기"
          >
            ALL
          </button>

          <button
            type="button"
            className={`viewBtn diary ${viewMode === "diary" ? "active" : ""}`}
            onClick={() => setViewMode("diary")}
            title="일기만 보기"
          >
            D
          </button>

          <button
            type="button"
            className={`viewBtn todo ${viewMode === "todo" ? "active" : ""}`}
            onClick={() => {
              // ✅ 현재 모드가 shopping이면 T 버튼이 쇼핑 전용 화면으로 동작
              setViewMode(todoMode === "shopping" ? "shopping" : "todo");
            }}
            title="TODO만 보기"
          >
            T
          </button>
        </div>

        {user ? (
          <button className="todoAddBtn" onClick={logout}>
            로그아웃
          </button>
        ) : (
          <button className="todoAddBtn" onClick={loginGoogle}>
            Google 로그인
          </button>
        )}
      </div>

      {/* ✅ content: viewMode에 따라 1칸/2칸 전환하기 위해 클래스 추가 */}
      <div className={`content ${viewMode}`}>
        {/* DIARY */}
        {viewMode !== "todo" && viewMode !== "shopping" && (
          <div className="diary-section">
            <div className="toolbar">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
              />
            </div>

            <textarea value={text} onChange={(e) => setText(e.target.value)} />
                          

                        <div className="saveRow">
              <button
                type="button"
                className={`save-button photoBtn ${entryPhotoFile ? "activePhoto" : ""}`}
                onClick={() => entryPhotoInputRef.current?.click()}
              >
                포토
              </button>

              <button type="button" className="save-button" onClick={save}>
                저장
              </button>

              {/* ✅ 숨김 파일 input: 포토 버튼이 이걸 클릭함 */}
              <input
                ref={entryPhotoInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={(e) => setEntryPhotoFile(e.target.files?.[0] || null)}
              />
            </div>
          </div>
        )}

        {viewMode !== "diary" && (
          <div className="todo-section">
            <div className="todoTop">
              <h2
                style={{ cursor: "pointer" }}
                onClick={() =>
                  setTodoMode((m) => (m === "todo" ? "shopping" : "todo"))
                }
              >
                {todoMode === "shopping" ? "SHOPPING" : "TODO"}
              </h2>

                                          {/* ===== START: todoTopRight (DETAIL-ONLY OCR before Receipt) ===== */}
<div className="todoTopRight">
  {/* ✅ OCR: 상세화면 + 쇼핑모드에서만, Receipt 앞 */}
  {isDetailView && todoMode === "shopping" && (
    <button
      type="button"
      className="todoAddBtn ocrBtn"
      onClick={runOcrToShoppingToday}
      title="영수증 OCR로 오늘 쇼핑 항목 생성"
    >
      OCR
    </button>
  )}

  {/* ✅ Receipt: 쇼핑모드에서만 (전체/상세 공통) */}
  {todoMode === "shopping" && (
    <>
      <button
        type="button"
        className={`todoAddBtn receiptBtn ${shoppingImageUrl ? "hasReceipt" : ""}`}
        title={
          shoppingImageUrl
            ? "클릭: 영수증 보기 / Shift+클릭: 교체 / Alt+클릭: 삭제"
            : "영수증 업로드"
        }
        style={{
          background: shoppingImageUrl ? "#ffd966" : "#fff1b8",
          opacity: receiptUploading ? 0.7 : 1,
        }}
        disabled={receiptUploading}
        onClick={async (e) => {
          // ✅ Alt+클릭: 삭제 (UI 추가 없이)
          if (e.altKey && shoppingImageUrl) {
            if (!user) return;
            try {
              const dateKey = todayKey;

              // storage 파일 삭제(경로가 있을 때만)
              if (shoppingImagePath) {
                try {
                  await deleteObject(storageRef(storage, shoppingImagePath));
                } catch (err) {
                  console.warn("영수증 파일 삭제 실패(무시):", err);
                }
              }

              // meta 문서 삭제
              await deleteDoc(doc(db, "users", user.uid, "shoppingMeta", dateKey));
            } catch (err) {
              console.error("영수증 삭제 실패:", err);
              alert(err?.message || "영수증 삭제 실패(콘솔 확인)");
            }
            return;
          }

          // ✅ Shift+클릭: 교체 업로드
          if (e.shiftKey) {
            receiptInputRef.current?.click();
            return;
          }

          // ✅ 기본 클릭: 있으면 보기 / 없으면 업로드
          if (shoppingImageUrl) {
            window.open(shoppingImageUrl, "_blank", "noopener,noreferrer");
            return;
          }

          receiptInputRef.current?.click();
        }}
      >
        Receipt
      </button>

      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={async (e) => {
          const f = e.target.files?.[0];
          // 같은 파일 다시 선택 가능하게 먼저 초기화
          e.target.value = "";
          if (!f) return;

          if (!user) {
            alert("로그인이 필요해요!");
            return;
          }

          setReceiptUploading(true);

          try {
            const dateKey = todayKey;
            const ext = (f.name || "").split(".").pop() || "jpg";
            const imagePath = `users/${user.uid}/shoppingReceipts/${dateKey}.${ext}`;

            // 기존 파일이 있으면 삭제 시도(실패해도 진행)
            if (shoppingImagePath) {
              try {
                await deleteObject(storageRef(storage, shoppingImagePath));
              } catch (err) {
                console.warn("기존 영수증 삭제 실패(무시):", err);
              }
            }

            // 업로드
            const sRef = storageRef(storage, imagePath);
            await uploadBytes(sRef, f);
            const imageUrl = await getDownloadURL(sRef);

            // meta 저장(하루 1장)
            const metaRef = doc(db, "users", user.uid, "shoppingMeta", dateKey);
            await setDoc(
              metaRef,
              { imageUrl, imagePath, updatedAt: serverTimestamp() },
              { merge: true }
            );

            // 🔊 영수증 업로드 성공 → 프린트
            playSound("receipt-print.mp3");
          } catch (err) {
            console.error("영수증 업로드 실패:", err);
            alert(err?.message || "영수증 업로드 실패(콘솔 확인)");
          } finally {
            setReceiptUploading(false);
          }
        }}
      />
    </>
  )}

  <button className="todoAddBtn" onClick={addTodo}>
    + Add
  </button>
</div>
{/* ===== END: todoTopRight (DETAIL-ONLY OCR before Receipt) ===== */}
            </div>

            {/* ✅ 오늘 키 (기본 화면은 오늘 것만) */}
            {(() => {
              const todayKey = new Date().toISOString().slice(0, 10);
              const activeKind = todoMode === "shopping" ? "shopping" : "todo";

              const kindTodos = todos.filter(
                (t) =>
                  (t.kind || "todo") === activeKind && typeof t.date === "string"
              );

              // 날짜별 그룹
              const byDate = kindTodos.reduce((acc, t) => {
                const d = t.date || "unknown";
                (acc[d] ||= []).push(t);
                return acc;
              }, {});

              // YYYY-MM-DD는 문자열 정렬로 최신순 가능
              const allDatesDesc = Object.keys(byDate)
                .filter((d) => d !== "unknown")
                .sort((a, b) => b.localeCompare(a));

              // ===== START HISTORY DATES =====
const todayItems = byDate[todayKey] || [];
const historyDates = allDatesDesc; // ✅ 오늘도 포함
// ===== END HISTORY DATES =====

              return (
                <>
        
          {/* =========================
          ✅ TODO MODE
         ========================= */}
{todoMode === "todo" && (
  <>
    <input
      className="todoInput"
      placeholder="할 일 입력"
      value={todoText}
      onChange={(e) => setTodoText(e.target.value)}
    />

    {/* ✅ 기본 화면: 오늘 것만 */}
    <ul>
      {todayItems.map((todo) => (
        <li
          key={todo.id}
          className={`todo-item ${todo.completed ? "completed" : ""}`}
        >
          <input
            type="checkbox"
            checked={!!todo.completed}
            onChange={() => toggleTodo(todo.id, !!todo.completed)}
          />

          <span className="todoText">
            <span className="todoTextInner">{todo.text}</span>
          </span>

          <button onClick={() => deleteTodoItem(todo.id)}>삭제</button>
        </li>
      ))}
    </ul>

    {/* ✅ 상세 패널: 날짜 아코디언 */}
    {isDetailView && (
      <HistoryPanel
        mode="todo"
        dates={historyDates}
        byDate={byDate}
        defaultOpenCount={4}
        onToggleTodo={toggleTodo}
        onDelete={deleteTodoItem}
        user={user}
      />
    )}
  </>
)}

{/* =========================
          ✅ SHOPPING MODE
         ========================= */}
{todoMode === "shopping" && (
  <>
    <input
      className="todoInput"
      placeholder="항목"
      value={todoText}
      onChange={(e) => setTodoText(e.target.value)}
    />

    <input
      className="todoInput priceFull"
      type="number"
      placeholder="가격"
      value={price}
      onChange={(e) => setPrice(e.target.value)}
    />
    {todoMode === "shopping" && (
<>
    {/* ✅ 기본 화면: 오늘 것만 */}
    
    <ul>
      {todayItems.map((item) => (
        <li key={item.id} className="todo-item">
          <span className="todoText">
            <span className="todoTextInner">{item.text}</span>
          </span>

          {Number(item.price || 0) > 0 && (
            <span className="priceTag">
              {Number(item.price || 0).toLocaleString()}원
            </span>
          )}

          <button onClick={() => deleteTodoItem(item.id)}>삭제</button>
        </li>
      ))}
    </ul>

    {/* ✅ 오늘 총합만 */}
    <div className="todayTotal">
      총합:{" "}
      {todayItems
        .reduce((sum, t) => sum + Number(t.price || 0), 0)
        .toLocaleString()}
      원
    </div>
       </>
)} 
    {/* ✅ 상세 패널: 날짜 아코디언 */}
    {/* ===== START: DETAIL-ONLY HistoryPanel (shopping) ===== */}
{isDetailView && (
  <HistoryPanel
    mode="shopping"
    dates={historyDates}
    byDate={byDate}
    defaultOpenCount={4}
    onToggleTodo={toggleTodo}
    onDelete={deleteTodoItem}
    user={user}
  />
)}
{/* ===== END: DETAIL-ONLY HistoryPanel (shopping) ===== */}
  </>
)}
                </>
              );
            })()}

            {/* ✅ HistoryPanel 컴포넌트: todo-section 안에서만 “조용히” 추가 */}
            {/*
  NOTE: App.jsx 파일 안에서 App 컴포넌트 아래(같은 파일)로 함수 컴포넌트를 추가해도 되고,
  이 파일 맨 아래 export 위에 추가해도 됨. (레이아웃 변경 없음)
*/}
          </div>
        )}
      </div>

      {/* ✅ TODO만 보기에서는 지난 일기(belowGrid) 숨김 */}
      {(viewMode === "diary" || viewMode === "all") && (
        <div className={`belowGrid ${viewMode}`}>
          <div className="entriesWrap">
            {viewMode === "all" ? (
  <div className="entriesTitle todayHeader">
    {new Date().toLocaleDateString("ko-KR", {
      month: "long",
      day: "numeric",
      weekday: "long",
    })}
  </div>
) : (
  <div className="entriesTitle todayHeader headerWithSearch">
    <div className="headerLeft">
      {new Date().toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })}
    </div>

        {viewMode === "diary" && (
      <div className="headerRight">
        <input
          type="text"
          placeholder="키워드 검색"
          value={entrySearch}
          onChange={(e) => setEntrySearch(e.target.value)}
          className="entrySearchInput"
        />

        <button
  type="button"
  className="save-button header-search-btn"
  onClick={applyEntrySearch}
>
  검색
</button>
      </div>
    )}
  </div>
)}

            <div className="entries">
                            {(viewMode === "all"
                ? entries.filter((en) => (en.date || "") === todayKey)
                : viewMode === "diary" && entrySearchApplied
                ? entries.filter((en) =>
                    String(en?.text || "")
                      .toLowerCase()
                      .includes(String(entrySearchApplied).toLowerCase())
                  )
                : entries
              ).map((en) => (
                <EntryCard
  key={en.id}
  entry={en}
  viewMode={viewMode}
  onDelete={deleteEntry}
  user={user}
  entrySearchApplied={entrySearchApplied}
/>
              ))}
            </div>
          </div>

          {viewMode === "all" && <div></div>}
        </div>
      )}
    </div>
  );
}
function EntryCard({ entry, viewMode, onDelete, user, entrySearchApplied }) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(entry?.text || "");
  const [photoOpen, setPhotoOpen] = useState(false);

  // ✅ (추가) 수정 모드 사진 교체/제거 (수정 모드에서만)
  const [editPhotoFile, setEditPhotoFile] = useState(null);
  const editPhotoInputRef = useRef(null);
  const [removePhoto, setRemovePhoto] = useState(false);

  useEffect(() => {
    setDraft(entry?.text || "");
  }, [entry?.text]);

  // ✅ 핑크 분필 하이라이트
  const highlightText = (text, keyword) => {
    if (!keyword) return text;
    const k = String(keyword);
    const parts = String(text).split(new RegExp(`(${k})`, "gi"));
    return parts.map((part, i) =>
      part.toLowerCase() === k.toLowerCase() ? (
        <span key={i} className="chalkHighlight">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  const timeText =
    viewMode === "all"
      ? (entry?.time ||
          (entry?.createdAt?.toDate?.()
            ? entry.createdAt.toDate().toTimeString().slice(0, 5)
            : ""))
      : `${entry?.date || ""} ${
          entry?.time ||
          (entry?.createdAt?.toDate?.()
            ? entry.createdAt.toDate().toTimeString().slice(0, 5)
            : "")
        }`.trim();

  const startEdit = () => {
    setIsEditing(true);
    setDraft(entry?.text || "");
    setEditPhotoFile(null);
    setRemovePhoto(false);
    if (editPhotoInputRef.current) editPhotoInputRef.current.value = "";
  };
    // ✅ (추가) 사진: Shift+클릭 삭제 (Storage + Firestore)
  const deletePhotoWithShift = async () => {
    try {
      if (!user?.uid) return;

      const ok = window.confirm("이 일기의 사진을 삭제할까?");
      if (!ok) return;

      const imagePath = entry?.imagePath || "";

      // 1) storage 파일 삭제(경로 있을 때만)
      if (imagePath) {
        try {
          await deleteObject(storageRef(storage, imagePath));
        } catch (e) {
          console.warn("entry photo storage delete fail:", e);
        }
      }

      // 2) Firestore 메타 제거
      const ref = doc(db, "users", user.uid, "entries", entry.id);
      await updateDoc(ref, { imageUrl: "", imagePath: "" });

      // 3) 열려있던 팝업 닫기
      setPhotoOpen(false);
    } catch (e) {
      console.error("deletePhotoWithShift fail:", e);
      alert(e?.message || "사진 삭제 실패(콘솔 확인)");
    }
  };
  const cancelEdit = () => {
    setIsEditing(false);
    setDraft(entry?.text || "");
    setEditPhotoFile(null);
    setRemovePhoto(false);
    if (editPhotoInputRef.current) editPhotoInputRef.current.value = "";
  };
    // ✅ (추가) 사진: 파일 선택 즉시 업로드 + Firestore 반영
  const uploadPhotoNow = async (file) => {
    try {
      if (!user?.uid) return;
      if (!file) return;

      // 기존 사진 있으면 먼저 삭제(깔끔)
      const oldPath = entry?.imagePath || "";
      if (oldPath) {
        try {
          await deleteObject(storageRef(storage, oldPath));
        } catch (e) {
          console.warn("old entry photo delete fail:", e);
        }
      }

      const ext = (file.name || "").split(".").pop() || "jpg";
      const imagePath = `users/${user.uid}/entries/${entry.id}_${Date.now()}.${ext}`;

      const sRef = storageRef(storage, imagePath);
      await uploadBytes(sRef, file);
      const imageUrl = await getDownloadURL(sRef);

      const ref = doc(db, "users", user.uid, "entries", entry.id);
      await updateDoc(ref, { imageUrl, imagePath });
    } catch (e) {
      console.error("uploadPhotoNow fail:", e);
      alert(e?.message || "사진 업로드 실패(콘솔 확인)");
    }
  };
  const saveEdit = async () => {
    if (!user) return;

    const t = String(draft || "").trim();
    if (!t) return;

    let imageUrl = entry?.imageUrl || "";
    let imagePath = entry?.imagePath || "";

    // ✅ 1) 사진 제거 선택
    if (removePhoto) {
      if (imagePath) {
        try {
          await deleteObject(storageRef(storage, imagePath));
        } catch (e) {
          // 파일이 이미 없을 수도 있으니 조용히 무시
          console.warn("deleteObject(remove) fail:", e);
        }
      }
      imageUrl = "";
      imagePath = "";
    }

    // ✅ 2) 새 사진으로 교체
    if (editPhotoFile) {
      // 기존 사진 있으면 먼저 삭제(깔끔)
      if (imagePath) {
        try {
          await deleteObject(storageRef(storage, imagePath));
        } catch (e) {
          console.warn("deleteObject(replace) fail:", e);
        }
      }

      const ext = (editPhotoFile.name || "").split(".").pop() || "jpg";
      imagePath = `users/${user.uid}/entries/${entry.id}_${Date.now()}.${ext}`;

      const sRef = storageRef(storage, imagePath);
      await uploadBytes(sRef, editPhotoFile);
      imageUrl = await getDownloadURL(sRef);
    }

    const ref = doc(db, "users", user.uid, "entries", entry.id);
    await updateDoc(ref, {
      text: t,
      imageUrl,
      imagePath,
    });

    setIsEditing(false);
    setEditPhotoFile(null);
    setRemovePhoto(false);
    if (editPhotoInputRef.current) editPhotoInputRef.current.value = "";
  };

  return (
    <div className="entryCard">
      
              {/* ✅ 상단 라인: 시간 + (사진/수정/삭제) 같은 줄 */}
      <div className="entryTopLine">
        <div className="entryTimeText">{timeText}</div>

        <div className="entryTopActions">
          {/* ✅ 사진 버튼: 수정/삭제 앞, 연노랑 동그라미 */}
                              {!isEditing && (
            <>
              <button
                type="button"
                className={`entryActionBtn photo ${entry?.imageUrl ? "hasPhoto" : ""}`}
                onClick={(e) => {
                  // ✅ Shift+클릭: 사진이 있을 때만 삭제
                  if (e.shiftKey) {
                    if (entry?.imageUrl) deletePhotoWithShift();
                    return;
                  }

                  // ✅ 기본 클릭: 사진 있으면 크게 보기, 없으면 업로드 선택창
                  if (entry?.imageUrl) {
                    setPhotoOpen(true);
                    return;
                  }

                  editPhotoInputRef.current?.click();
                }}
                title={
                  entry?.imageUrl
                    ? "클릭: 사진 보기 / Shift+클릭: 사진 삭제"
                    : "클릭: 사진 업로드"
                }
                aria-label="사진"
              >
                📸
              </button>

              {/* ✅ 숨김 파일 input: (사진 없을 때) 📸 버튼이 이걸 클릭함 */}
                            <input
                ref={editPhotoInputRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={async (e) => {
                  const f = e.target.files?.[0] || null;
                  // 같은 파일 다시 선택 가능하게 초기화
                  e.target.value = "";
                  if (!f) return;

                  await uploadPhotoNow(f);
                }}
              />
            </>
          )}

          {!isEditing ? (
            <>
              <button
                type="button"
                className="entryActionBtn edit"
                onClick={startEdit}
                title="수정"
                aria-label="수정"
              >
                ✎
              </button>
              <button
                type="button"
                className="entryActionBtn delete"
                onClick={() => onDelete?.(entry.id)}
                title="삭제"
                aria-label="삭제"
              >
                ×
              </button>
            </>
          ) : (
            <>
              <button
  type="button"
  className="entryActionBtn edit"
  onClick={saveEdit}
  title="저장"
  aria-label="저장"
>
  ✎
</button>
              <button
                type="button"
                className="entryActionBtn delete"
                onClick={cancelEdit}
                title="취소"
                aria-label="취소"
              >
                ×
              </button>
            </>
          )}
        </div>
      </div>   

      
      {photoOpen && (
        <div
          onClick={() => setPhotoOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "18px",
          }}
        >
          <img
            src={entry.imageUrl}
            alt="entry"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: "95vw",
              maxHeight: "85vh",
              borderRadius: "14px",
              boxShadow: "0 10px 30px rgba(0,0,0,.35)",
              background: "#fff",
            }}
          />
        </div>
      )}

      {/* 본문 */}
            {!isEditing ? (
        entry?.imageUrl ? (
          <div className="historyBodyGrid">
            <div className="historyLeft">
              <div className="entryBody">
                {viewMode === "diary" && entrySearchApplied
                  ? highlightText(entry?.text || "", entrySearchApplied)
                  : entry?.text}
              </div>
            </div>

            <div className="historyRight">
              <button
                type="button"
                className="receiptThumbBtn"
                onClick={(e) => {
                  if (e.shiftKey) {
                    deletePhotoWithShift();
                    return;
                  }
                  setPhotoOpen(true);
                }}
                title="클릭: 크게 보기 / Shift+클릭: 사진 삭제"
              >
                <img
                  className="receiptThumb"
                  src={entry.imageUrl}
                  alt={`entry-${entry.id}`}
                  loading="lazy"
                />
              </button>
            </div>
          </div>
        ) : (
          <div className="entryBody">
            {viewMode === "diary" && entrySearchApplied
              ? highlightText(entry?.text || "", entrySearchApplied)
              : entry?.text}
          </div>
        )
      ) : (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ marginTop: "10px" }}
          />
        </>
      )}
    </div>
  );
}
function HistoryPanel({
  mode,
  dates,
  byDate,
  defaultOpenCount = 4,
  onToggleTodo,
  onDelete,
  user,
}) {
  const [open, setOpen] = useState(null);

  // ✅ (추가) 날짜별 영수증 URL 캐시
  const [receiptUrlByDate, setReceiptUrlByDate] = useState({});
  const receiptUnsubsRef = useRef({}); // { [dateKey]: () => void }
  // ✅ (추가) 날짜 선택 업로드용
  const receiptFileInputRef = useRef(null);
  const [receiptPickDate, setReceiptPickDate] = useState("");

  // ✅ (추가) 수정모드 토글(일괄 수정 A용: UI는 다음 스텝에서)
  const [editDay, setEditDay] = useState({}); // { [dateKey]: true/false }
    // ✅ (추가) 날짜별 임시 편집값 (text/price)
  // draftById: { [todoId]: { text: string, price: string } }
  const [draftById, setDraftById] = useState({});

  const setDraft = (id, patch) => {
    setDraftById((prev) => {
      const cur = prev?.[id] || {};
      return { ...(prev || {}), [id]: { ...cur, ...patch } };
    });
  };

  // ✅ (추가) 항목 1개 저장 (text/price)
  const saveOneItem = async (item) => {
    try {
      if (!user?.uid) return;
      if (!item?.id) return;

      const d = draftById?.[item.id] || {};
      const nextText = String(d.text ?? item.text ?? "").trim();
      const nextPrice = Number(d.price ?? item.price ?? 0) || 0;

      if (!nextText) return;

      const ref = doc(db, "users", user.uid, "todos", item.id);
      await updateDoc(ref, { text: nextText, price: nextPrice });

      // ✅ 저장 성공 후 draft 정리
      setDraftById((prev) => {
        const next = { ...(prev || {}) };
        delete next[item.id];
        return next;
      });

      console.log("saveOneItem ok:", item.id);
    } catch (e) {
      console.error("saveOneItem fail:", e);
      alert(e?.message || "저장 실패(콘솔 확인)");
    }
  };
  const openReceiptOrPickFile = (dateKey, receiptUrl) => {
    // 영수증이 있으면: 새탭 크게 보기
    if (receiptUrl) {
      window.open(receiptUrl, "_blank", "noopener,noreferrer");
      return;
    }
    // 영수증이 없으면: 업로드 선택창
    setReceiptPickDate(dateKey);
    receiptFileInputRef.current?.click();
  };

  const deleteReceiptWithShift = async (dateKey) => {
    try {
      if (!user?.uid) return;

      const ok = window.confirm(`${dateKey} 영수증을 삭제할까?`);
      if (!ok) return;

      const metaRef = doc(db, "users", user.uid, "shoppingMeta", dateKey);
      const snap = await new Promise((resolve, reject) => {
        const unsub = onSnapshot(
          metaRef,
          (s) => {
            unsub();
            resolve(s);
          },
          (e) => {
            unsub();
            reject(e);
          }
        );
      });

      if (!snap.exists()) return;

      const imagePath = snap.data()?.imagePath || "";
      // 1) 스토리지 파일 삭제(있으면)
      if (imagePath) {
        try {
          await deleteObject(storageRef(storage, imagePath));
        } catch (e) {
          console.warn("receipt storage delete fail:", e);
        }
      }
      // 2) meta 문서 삭제
      await deleteDoc(metaRef);
    } catch (e) {
      console.error("deleteReceiptWithShift fail:", e);
      alert(e?.message || "영수증 삭제 실패(콘솔 확인)");
    }
  };
    const deleteDayAllItems = async (dateKey, items) => {
    try {
  console.log("deleteDayAllItems called:", dateKey, items);
      if (!user?.uid) return;

      const ok = window.confirm(`${dateKey}의 항목을 전체 삭제할까?`);
      if (!ok) return;

      // 1) 해당 날짜 항목 전부 삭제
      await Promise.all(
        (items || []).map((it) =>
          it?.id ? onDelete?.(it.id) : Promise.resolve()
        )
      );

      // 2) 해당 날짜 영수증 meta + storage도 같이 삭제(있으면)
      const metaRef = doc(db, "users", user.uid, "shoppingMeta", dateKey);

      const snap = await new Promise((resolve, reject) => {
        const unsub = onSnapshot(
          metaRef,
          (s) => {
            unsub();
            resolve(s);
          },
          (e) => {
            unsub();
            reject(e);
          }
        );
      });

      if (snap.exists()) {
        const imagePath = snap.data()?.imagePath || "";
        if (imagePath) {
          try {
            await deleteObject(storageRef(storage, imagePath));
          } catch (e) {
            console.warn("receipt storage delete fail (day delete):", e);
          }
        }
        await deleteDoc(metaRef);
      }

      console.log("delete day all done:", dateKey);
    } catch (e) {
      console.error("deleteDayAllItems fail:", e);
      alert(e?.message || "날짜 전체 삭제 실패(콘솔 확인)");
    }
  };
  const onReceiptFilePicked = async (e) => {
    const f = e.target.files?.[0];
    if (!f) return;

    try {
      if (!user?.uid) return;
      const dateKey = receiptPickDate;
      if (!dateKey) return;

      const ext = (f.name || "").split(".").pop() || "jpg";
      const imagePath = `users/${user.uid}/shoppingReceipts/${dateKey}.${ext}`;

      const sRef = storageRef(storage, imagePath);
      await uploadBytes(sRef, f);
      const imageUrl = await getDownloadURL(sRef);

      const metaRef = doc(db, "users", user.uid, "shoppingMeta", dateKey);
      await setDoc(
  metaRef,
  {
    imageUrl,
    imagePath,
    updatedAt: serverTimestamp(),
  },
  { merge: true }
);

      // ✅ 선택창 재사용 가능하게 초기화
      if (receiptFileInputRef.current) receiptFileInputRef.current.value = "";
      setReceiptPickDate("");
    } catch (err) {
      console.error("receipt upload fail:", err);
      alert(err?.message || "영수증 업로드 실패(콘솔 확인)");
      if (receiptFileInputRef.current) receiptFileInputRef.current.value = "";
    }
  };

  // mode 바뀌면 기본 펼침 상태 재설정(최근 3~4일 자동 펼침)
  useEffect(() => {
    setOpen(null);
  }, [mode, defaultOpenCount]);

  useEffect(() => {
    if (open !== null) return;

    const init = {};
    dates.slice(0, defaultOpenCount).forEach((d) => {
      init[d] = true;
    });
    setOpen(init);
  }, [open, dates, defaultOpenCount]);

  // ✅ (추가) shopping 모드에서, "열린 날짜"의 shoppingMeta를 실시간 구독
  useEffect(() => {
    // todo 모드면 영수증 기능 필요 없음
    if (mode !== "shopping") return;

    // user 없으면 구독 불가
    if (!user?.uid) return;

    // open이 아직 없으면 대기
    if (!open) return;

    const openedDates = Object.keys(open).filter((d) => open[d]);

    // 1) 새로 열린 날짜 구독 시작
    openedDates.forEach((dateKey) => {
      if (receiptUnsubsRef.current[dateKey]) return;

      const metaRef = doc(db, "users", user.uid, "shoppingMeta", dateKey);

      const unsub = onSnapshot(
        metaRef,
        (snap) => {
          const url = snap.exists() ? (snap.data()?.imageUrl || "") : "";
          setReceiptUrlByDate((prev) => ({ ...prev, [dateKey]: url }));
        },
        (err) => {
          console.error("shoppingMeta snapshot error:", err);
          setReceiptUrlByDate((prev) => ({ ...prev, [dateKey]: "" }));
        }
      );

      receiptUnsubsRef.current[dateKey] = unsub;
    });

    // 2) 닫힌 날짜 구독 해제
    Object.keys(receiptUnsubsRef.current).forEach((dateKey) => {
      if (!openedDates.includes(dateKey)) {
        try {
          receiptUnsubsRef.current[dateKey]?.();
        } catch {}
        delete receiptUnsubsRef.current[dateKey];
        // url은 남겨둬도 되지만, 닫힐 때 정리하고 싶으면 아래 유지:
        // setReceiptUrlByDate((prev) => {
        //   const next = { ...prev };
        //   delete next[dateKey];
        //   return next;
        // });
      }
    });

    // unmount 시 전부 정리
    return () => {
      Object.values(receiptUnsubsRef.current).forEach((fn) => {
        try {
          fn?.();
        } catch {}
      });
      receiptUnsubsRef.current = {};
    };
  }, [mode, user, open]);

  if (!dates || dates.length === 0) {
    return (
      <div className="historyPanel">
        <div className="historyTitle">이전 기록</div>
        <div className="historyEmpty">이전 날짜 기록이 없어요.</div>
      </div>
    );
  }

  return (
    <div className="historyPanel">
      <div className="historyTitle">이전 기록</div>
            {/* ✅ (추가) 날짜별 영수증 업로드용 숨김 input (HistoryPanel 내부에서만) */}
      <input
        ref={receiptFileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={onReceiptFilePicked}
      />
      <div className="historyList">
        {dates.map((d) => {
          const isOpen = !!open?.[d];
          const items = byDate[d] || [];
          const dayTotal = items.reduce(
            (sum, it) => sum + Number(it.price || 0),
            0
          );

          const receiptUrl = receiptUrlByDate?.[d] || "";

          return (
            <div key={d} className="historyDay">
              

                <div
                role="button"
                tabIndex={0}
                className={`historyDateBtn ${isOpen ? "open" : ""}`}
                onClick={() =>
                  setOpen((prev) => ({ ...(prev || {}), [d]: !isOpen }))
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpen((prev) => ({ ...(prev || {}), [d]: !isOpen }));
                  }
                }}
                aria-expanded={isOpen}
              >
                <span className="historyDateText">{d}</span>

                {/* ✅ 오른쪽 끝: 동그란 버튼 3개 */}
                <span
                  style={{
                    marginLeft: "auto",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                  onClick={(e) => e.stopPropagation()} // 날짜 토글 방지
                >
                  {/* 🧾 영수증: 클릭=새탭 보기 / 없으면 업로드, Shift+클릭=삭제 */}
                  <span
                    role="button"
                    tabIndex={0}
                    className={`entryActionBtn photo ${
                      receiptUrl ? "hasPhoto" : ""
                    }`}
                    title="영수증 (클릭: 보기/업로드, Shift+클릭: 삭제)"
                    aria-label="영수증"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (e.shiftKey) {
                        deleteReceiptWithShift(d);
                        return;
                      }
                      openReceiptOrPickFile(d, receiptUrl);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (e.shiftKey) {
                          deleteReceiptWithShift(d);
                        } else {
                          openReceiptOrPickFile(d, receiptUrl);
                        }
                      }
                    }}
                  >
                    🧾
                  </span>

                  <span
  role="button"
  tabIndex={0}
  className="entryActionBtn edit"
  title="수정"
  aria-label="수정"
  onClick={(e) => {
    e.stopPropagation();
    setEditDay((prev) => {
      const wasOn = !!prev?.[d];
      const next = !wasOn;

      // ✅ ON -> OFF일 때: 해당 날짜 items 일괄 저장
      if (wasOn) {
        Promise.all((items || []).map((it) => saveOneItem(it)));
      }

      console.log("edit day toggle:", d, next);
      return { ...(prev || {}), [d]: next };
    });
  }}
  onKeyDown={(e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setEditDay((prev) => {
        const wasOn = !!prev?.[d];
        const next = !wasOn;

        // ✅ ON -> OFF일 때: 해당 날짜 items 일괄 저장
        if (wasOn) {
          Promise.all((items || []).map((it) => saveOneItem(it)));
        }

        console.log("edit day toggle:", d, next);
        return { ...(prev || {}), [d]: next };
      });
    }
  }}
>
  ✎
</span>
                  {/* × 삭제(확인용 로그) */}
                  <span
                    role="button"
                    tabIndex={0}
                    className="entryActionBtn delete"
                    title="삭제"
                    aria-label="삭제"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteDayAllItems(d, items);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        deleteDayAllItems(d, items);
                      }
                    }}
                  >
                    ×
                  </span>
                </span>
              </div>

              {isOpen && (
                <div className="historyBody">
                  {/* ✅ (추가) shopping 모드일 때만: 왼쪽=목록 / 오른쪽=영수증 */}
                  <div
                    className={
                      mode === "shopping"
                        ? "historyBodyGrid"
                        : "historyBodyGrid single"
                    }
                  >
                    <div className="historyLeft">
                                            <ul className="historyUl">
                        {items.map((it) => {
                          const dayEditOn = !!editDay?.[d];
                          const draft = draftById?.[it.id] || {};

                          const textVal =
                            draft.text !== undefined ? draft.text : it.text || "";

                          const priceVal =
                            draft.price !== undefined
                              ? draft.price
                              : String(it.price ?? "");

                          return (
                            <li
                              key={it.id}
                              className={`todo-item ${
                                mode === "todo" && it.completed
                                  ? "completed"
                                  : ""
                              }`}
                            >
                              {mode === "todo" && (
                                <input
                                  type="checkbox"
                                  checked={!!it.completed}
                                  onChange={() =>
                                    onToggleTodo?.(it.id, !!it.completed)
                                  }
                                />
                              )}

                              {/* ✅ 텍스트: 편집모드면 input, 아니면 기존 표시 */}
                              <span className="todoText">
                                {dayEditOn ? (
                                  <input
                                    type="text"
                                    value={textVal}
                                    onChange={(e) =>
                                      setDraft(it.id, { text: e.target.value })
                                    }
                                    style={{
                                      width: "100%",
                                      background: "transparent",
                                      border: "1px solid rgba(0,0,0,0.18)",
                                      borderRadius: "10px",
                                      padding: "6px 8px",
                                    }}
                                  />
                                ) : (
                                  <span className="todoTextInner">{it.text}</span>
                                )}
                              </span>

                              {/* ✅ 가격: shopping일 때만. 편집모드면 input, 아니면 기존 priceTag */}
                              {mode === "shopping" &&
                                (dayEditOn ? (
                                  <input
                                    type="number"
                                    value={priceVal}
                                    onChange={(e) =>
                                      setDraft(it.id, { price: e.target.value })
                                    }
                                    style={{
                                      width: "92px",
                                      background: "transparent",
                                      border: "1px solid rgba(0,0,0,0.18)",
                                      borderRadius: "10px",
                                      padding: "6px 8px",
                                      textAlign: "right",
                                    }}
                                  />
                                ) : Number(it.price || 0) > 0 ? (
                                  <span className="priceTag">
                                    {Number(it.price || 0).toLocaleString()}원
                                  </span>
                                ) : null)}

                              {/* ✅ 편집모드면 ✓ 저장 버튼 노출 (항목 1개 저장) */}
                              

                              {/* 기존 삭제는 그대로 */}
                              <button onClick={() => onDelete?.(it.id)}>
                                삭제
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    {mode === "shopping" && (
                      <div className="historyRight">
                        {receiptUrl ? (
                          <button
                            type="button"
                            className="receiptThumbBtn"
                            onClick={() =>
                              window.open(
                                receiptUrl,
                                "_blank",
                                "noopener,noreferrer"
                              )
                            }
                            title="클릭하면 크게 보기"
                          >
                            <img
                              className="receiptThumb"
                              src={receiptUrl}
                              alt={`receipt-${d}`}
                              loading="lazy"
                            />
                          </button>
                        ) : (
                          <div className="receiptEmpty">
                            영수증 없음
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default App;