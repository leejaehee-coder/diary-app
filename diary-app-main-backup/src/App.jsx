import React, { useEffect, useState } from "react";
import "./App.css";
import { db } from "./firebase";
import { collection, addDoc, onSnapshot, query, orderBy, updateDoc, doc, deleteDoc } from "firebase/firestore";

function todayISO() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function App() {
  const [text, setText] = useState("");
  const [mood, setMood] = useState("🙂");
  const [date, setDate] = useState(todayISO());
  const [entries, setEntries] = useState([]);
  const [todoText, setTodoText] = useState("");  // TODO 입력 텍스트
  const [todos, setTodos] = useState([]);  // TODO 리스트 상태

  // 일기 데이터 불러오기
  useEffect(() => {
    const q = query(collection(db, "diary"), orderBy("date", "desc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setEntries(list);
    });
    return () => unsub();
  }, []);

  // TODO 데이터 불러오기
  useEffect(() => {
    const q = query(collection(db, "todos"), orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data(),
      }));
      setTodos(list);
    });
    return () => unsub();
  }, []);

  const save = async () => {
    const t = text.trim();
    if (!t) return;

    await addDoc(collection(db, "diary"), {
      text: t,
      date,
      mood,
      createdAt: new Date().toISOString(),
    });

    setText("");
  };

  const addTodo = async () => {
    const todo = todoText.trim();
    if (!todo) return;

    await addDoc(collection(db, "todos"), {
      text: todo,
      completed: false,
      createdAt: new Date().toISOString(),
    });

    setTodoText("");  // 입력란 비우기
  };

  const toggleTodo = async (id, completed) => {
    const todoRef = doc(db, "todos", id);
    await updateDoc(todoRef, {
      completed: !completed,
    });
  };

  const deleteTodo = async (id) => {
    const todoRef = doc(db, "todos", id);
    await deleteDoc(todoRef);
  };

  return (
    <div className="wrap">
      {/* Daily Ink 제목 */}
      <h1
        style={{
          fontFamily: "'Great Vibes', cursive",
          letterSpacing: "1px",
          color: "#f4a6c2",
          fontSize: "3rem",
          fontWeight: "bold",
          textAlign: "left",
          background: "linear-gradient(180deg, #f8c8dc 60%, #8a4d89 100%)",
          WebkitBackgroundClip: "text",
          color: "transparent",
          marginTop: "20px",
marginLeft: "24px",
fontWeight: 800,
        }}
      >
        Daily Ink
      </h1>

      <div className="content">
        {/* 일기 입력란 왼쪽 */}
        <div className="diary-section">
          <div className="toolbar">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            <input
              type="time"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                background: "rgba(255, 255, 255, .85)",
                borderRadius: "12px",
                padding: "8px 10px",
                border: "1px solid var(--border)",
              }}
            />
          </div>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="오늘의 일기..."
          />

          {/* 저장 버튼 */}
          <button onClick={save}>저장</button>
        </div>

        {/* TODO 리스트 오른쪽 */}
        <div className="todo-section">
          <h2>오늘의 TODO</h2>
          <input
            type="text"
            value={todoText}
            onChange={(e) => setTodoText(e.target.value)}
            placeholder="할 일을 입력하세요..."
          />
          <button onClick={addTodo}>+ Add</button>

          <ul>
            {todos.map((todo) => (
              <li className={`todo-item ${todo.completed ? "completed" : ""}`} key={todo.id}>
                <input
                  type="checkbox"
                  checked={todo.completed}
                  onChange={() => toggleTodo(todo.id, todo.completed)}
                />
                <span>{todo.text}</span>
                <button onClick={() => deleteTodo(todo.id)}>삭제</button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <hr />

      {/* 기존 일기 목록 */}
      {entries.map((e) => (
        <div className="entry" key={e.id}>
          <div className="entryTop">
            <div className="entryDate">
              {e.date} {e.mood}
            </div>
          </div>
          <div className="entryText">{e.text}</div>
        </div>
      ))}
    </div>
  );
}