import React, { useEffect, useState } from "react";
import "./App.css";

import { auth, googleProvider, db } from "./firebase";
import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import {
  collection,
  addDoc,
  query,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp, // ✅ 추가
} from "firebase/firestore";

function App() {
  const [user, setUser] = useState(null);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [text, setText] = useState("");

  const [entries, setEntries] = useState([]);

  const [todoText, setTodoText] = useState("");
  const [price, setPrice] = useState("");
  const [todos, setTodos] = useState([]);

  // ✅ 보기 모드: all | diary | todo
  const [viewMode, setViewMode] = useState("all");

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

  // 일기 저장
  const save = async () => {
    if (!user) return;
    const t = (text || "").trim();
    if (!t) return;

    const ref = collection(db, "users", user.uid, "entries");
    await addDoc(ref, {
      text: t,
      completed: false,
      date, // ✅ 오늘 날짜 기준(YYYY-MM-DD)
      time: new Date().toTimeString().slice(0, 5), // ✅ (추가) 오늘 시간 저장 → undefined 해결
      createdAt: serverTimestamp(), // ✅ 정렬 안정
    });

    setText("");
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
    } catch (e) {
      console.error("ADD FAIL:", e);
      alert(e?.message || "저장 실패(콘솔 확인)");
    }
  };

  // Todo 토글
  const toggleTodo = async (id, completed) => {
    if (!user) return;
    const ref = doc(db, "users", user.uid, "todos", id);
    await updateDoc(ref, { completed: !completed });
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
              <button className="save-button" onClick={save}>
                저장
              </button>
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

              <button className="todoAddBtn" onClick={addTodo}>
                + Add
              </button>
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

              const todayItems = byDate[todayKey] || [];
              const historyDates = allDatesDesc.filter((d) => d !== todayKey);

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
                            className={`todo-item ${
                              todo.completed ? "completed" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={!!todo.completed}
                              onChange={() =>
                                toggleTodo(todo.id, !!todo.completed)
                              }
                            />

                            <span className="todoText">
                              <span className="todoTextInner">{todo.text}</span>
                            </span>

                            <button onClick={() => deleteTodoItem(todo.id)}>
                              삭제
                            </button>
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

                            <button onClick={() => deleteTodoItem(item.id)}>
                              삭제
                            </button>
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

                      {/* ✅ 상세 패널: 날짜 아코디언 */}
                      {isDetailView && (
                        <HistoryPanel
                          mode="shopping"
                          dates={historyDates}
                          byDate={byDate}
                          defaultOpenCount={4}
                          onToggleTodo={toggleTodo}
                          onDelete={deleteTodoItem}
                        />
                      )}
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
  <div className="entriesTitle todayHeader">
    {new Date().toLocaleDateString("ko-KR", {
      year: "numeric",
      month: "long",
      day: "numeric",
    })}
  </div>
)}

            <div className="entries">
              {(viewMode === "all"
                ? entries.filter((e) => (e.date || "") === todayKey)
                : entries
              ).map((e) => (
                <div className="entryCard" key={e.id}>
                  <div className="entryDateLine">
  {viewMode === "all"
    ? (e.time || (e.createdAt?.toDate?.() ? e.createdAt.toDate().toTimeString().slice(0, 5) : ""))
    : `${e.date || ""} ${e.time || (e.createdAt?.toDate?.() ? e.createdAt.toDate().toTimeString().slice(0, 5) : "")}`.trim()}
</div>

                  <div className="entryBody">{e.text}</div>

                  {/* ✅ (추가) 상세(일기) 화면에서 삭제 버튼 */}
                  {viewMode !== "all" && (
                    <button onClick={() => deleteEntry(e.id)}>삭제</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {viewMode === "all" && <div></div>}
        </div>
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
}) {
  const [open, setOpen] = useState(null);

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

      <div className="historyList">
        {dates.map((d) => {
          const isOpen = !!open?.[d];
          const items = byDate[d] || [];
          const dayTotal = items.reduce((sum, it) => sum + Number(it.price || 0), 0);

          return (
            <div key={d} className="historyDay">
              <button
                type="button"
                className={`historyDateBtn ${isOpen ? "open" : ""}`}
                onClick={() =>
                  setOpen((prev) => ({ ...(prev || {}), [d]: !isOpen }))
                }
                aria-expanded={isOpen}
              >
                <span className="historyDateText">{d}</span>
                <span className="historyCount">{items.length}</span>
              {mode === "shopping" && (
  <span className="historyTotal">
    {dayTotal.toLocaleString()}원
  </span>
)}
              
              </button>

              {isOpen && (
                <div className="historyBody">
                  <ul className="historyUl">
                    {items.map((it) => (
                      <li
                        key={it.id}
                        className={`todo-item ${
                          mode === "todo" && it.completed ? "completed" : ""
                        }`}
                      >
                        {mode === "todo" && (
                          <input
                            type="checkbox"
                            checked={!!it.completed}
                            onChange={() => onToggleTodo?.(it.id, !!it.completed)}
                          />
                        )}

                        <span className="todoText">
                          <span className="todoTextInner">{it.text}</span>
                        </span>

                        {mode === "shopping" && Number(it.price || 0) > 0 && (
                          <span className="priceTag">
                            {Number(it.price || 0).toLocaleString()}원
                          </span>
                        )}

                        <button onClick={() => onDelete?.(it.id)}>삭제</button>
                      </li>
                    ))}
                  </ul>
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