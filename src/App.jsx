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
  updateDoc,
  deleteDoc,
  serverTimestamp, // ✅ 추가
} from "firebase/firestore";
import { ref as storageRef, uploadBytes, getDownloadURL, deleteObject } from "firebase/storage";

function App() {
  const [user, setUser] = useState(null);

  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [text, setText] = useState("");
  const [entryPhotoFile, setEntryPhotoFile] = useState(null);
  const entryPhotoInputRef = useRef(null);

  const [entries, setEntries] = useState([]);

  const [todoText, setTodoText] = useState("");
  const [price, setPrice] = useState("");
  const [todos, setTodos] = useState([]);

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
    if (!user) return;
    const t = (text || "").trim();
    if (!t) return;

    let imageUrl = "";
    let imagePath = "";

    // ✅ 사진이 있으면 Storage 업로드
    if (entryPhotoFile) {
      const ext = (entryPhotoFile.name || "").split(".").pop() || "jpg";
      imagePath = `users/${user.uid}/entries/${Date.now()}.${ext}`;

      const sRef = storageRef(storage, imagePath);
      await uploadBytes(sRef, entryPhotoFile);
      imageUrl = await getDownloadURL(sRef);
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

    setText("");
    setEntryPhotoFile(null);
    if (entryPhotoInputRef.current) entryPhotoInputRef.current.value = "";
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
              <button
                type="button"
                className="save-button photoBtn"
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

  const cancelEdit = () => {
    setIsEditing(false);
    setDraft(entry?.text || "");
    setEditPhotoFile(null);
    setRemovePhoto(false);
    if (editPhotoInputRef.current) editPhotoInputRef.current.value = "";
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
      {/* 우상단 액션 */}
      <div className="entryActions">
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
              ✓
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

      <div className="entryDateLine">{timeText}</div>

      {/* 사진 보기(기존 기능 유지) */}
      {!isEditing && entry?.imageUrl && (
        <div style={{ marginTop: "8px" }}>
          <button
            type="button"
            className="entryMiniBtn"
            onClick={() => setPhotoOpen(true)}
          >
            사진 보기
          </button>
        </div>
      )}

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
        <div className="entryBody">
          {viewMode === "diary" && entrySearchApplied
            ? highlightText(entry?.text || "", entrySearchApplied)
            : entry?.text}
        </div>
      ) : (
        <>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            style={{ marginTop: "10px" }}
          />

          {/* ✅ 수정 모드에서만: 사진 교체/제거 */}
          <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
            <button
              type="button"
              className="save-button photoBtn"
              onClick={() => editPhotoInputRef.current?.click()}
            >
              포토
            </button>

            <button
              type="button"
              className="save-button photoRemoveBtn"
              onClick={() => {
                setRemovePhoto(true);
                setEditPhotoFile(null);
                if (editPhotoInputRef.current) editPhotoInputRef.current.value = "";
              }}
            >
              사진 제거
            </button>

            <input
              ref={editPhotoInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={(e) => {
                setEditPhotoFile(e.target.files?.[0] || null);
                setRemovePhoto(false);
              }}
            />
          </div>
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