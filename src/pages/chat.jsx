// src/pages/Chat.jsx
import React, { useEffect, useState, useRef, memo } from "react";
import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import axios from "axios";
import UserSearchSidebar from "./UserSearchSidebar";

const API_BASE = "https://chat-backened-2.onrender.com/api/chat";
const WS_ENDPOINT = "https://chat-backened-2.onrender.com/chat";
const EMOJI_SET = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

let stompClient = null;
let typingTimeout = null;

/* ---------------- helpers ---------------- */
const safeParseReactions = (r) => {
  if (!r) return {};
  if (typeof r === "object" && r !== null) return r;
  if (typeof r === "string") {
    try {
      const parsed = JSON.parse(r);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const safeParseReplyTo = (r) => {
  if (!r) return null;
  if (typeof r === "object") return r;
  if (typeof r === "string") {
    try {
      return JSON.parse(r);
    } catch {
      return null;
    }
  }
  return null;
};

const fmtTimeShort = (ts) => {
  if (!ts) return "";
  if (typeof ts === "string" && ts.includes(":")) {
    const p = ts.split(":");
    return `${p[0].padStart(2, "0")}:${p[1].padStart(2, "0")}`;
  }
  return String(ts);
};

/* ---------------- small components ---------------- */
const ChatListItem = memo(({ r, online, active, onClick }) => (
  <div
    onClick={onClick}
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: 10,
      marginBottom: 8,
      background: active ? "#eaf8ee" : "#fff",
      borderRadius: 8,
      cursor: "pointer",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: online ? "#2ecc71" : "#bbb",
          display: "inline-block",
        }}
      />
      <div>
        <div style={{ fontWeight: 700 }}>{r.receiver}</div>
        <div style={{ fontSize: 12, color: "#666" }}>{r.preview || ""}</div>
      </div>
    </div>

    {r.unread > 0 && (
      <div
        style={{
          background: "#25D366",
          color: "#fff",
          padding: "4px 8px",
          borderRadius: 999,
          fontWeight: 700,
          fontSize: 12,
        }}
      >
        {r.unread}
      </div>
    )}
  </div>
));

/* ---------------- MessageBubble ---------------- */
function MessageBubble({
  msg,
  mine,
  userEmail,
  onlineMap,
  hoveredMsg,
  setHoveredMsg,
  reactionBarFor,
  setReactionBarFor,
  menuFor,
  setMenuFor,
  sendReaction,
  deleteMessageApi,
  replyToMessage,
  forwardMessage,
  copyMessage,
  startEdit,
  renderReactions,
  fmtTime,
  renderTicks,
  setPreviewImage,
  setShowPreview,
}) {
  const replyObj = safeParseReplyTo(msg.replyTo);

  return (
    <div
      onMouseEnter={() => setHoveredMsg(msg.id)}
      onMouseLeave={() => {
        if (reactionBarFor !== msg.id && menuFor !== msg.id) setHoveredMsg(null);
      }}
      style={{
        margin: "10px 0",
        display: "flex",
        justifyContent: mine ? "flex-end" : "flex-start",
        position: "relative",
      }}
    >
      <div style={{ maxWidth: "78%", position: "relative" }}>
        {/* bubble */}
        <div
          style={{
            display: "inline-block",
            background: mine ? "#dcf8c6" : "#fff",
            padding: "10px 12px",
            borderRadius: 12,
            boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
          }}
        >
          {msg.deleted ? (
            <div style={{ color: "#666", fontStyle: "italic" }}>
              🚫 This message was deleted
            </div>
          ) : (
            <>
              {replyObj && (
                <div
                  style={{
                    borderLeft: "3px solid #eee",
                    paddingLeft: 8,
                    fontSize: 13,
                    color: "#555",
                    marginBottom: 6,
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 12 }}>
                    {replyObj.sender === userEmail ? "You" : replyObj.sender}
                  </div>
                  <div style={{ fontSize: 13 }}>
                    {String(replyObj.content || "").slice(0, 200)}
                  </div>
                </div>
              )}

              <div style={{ fontSize: 15, color: "#111", whiteSpace: "pre-wrap" }}>
                {msg.content}
                {msg.editedContent ? " (edited)" : ""}
              </div>

              <div style={{ marginTop: 8 }}>{renderReactions(msg)}</div>

              <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
                • {fmtTime(msg.timestamp)} {mine && renderTicks(msg)}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Main Chat ---------------- */
export default function Chat() {
  const [userEmail, setUserEmail] = useState("");
  const [receiver, setReceiver] = useState("");
  const [roomId, setRoomId] = useState(null);

  const [messages, setMessages] = useState([]);
  const [rooms, setRooms] = useState([]);
  const [onlineMap, setOnlineMap] = useState({});
  const [typingMap, setTypingMap] = useState({});
  const [connected, setConnected] = useState(false);

  const [messageInput, setMessageInput] = useState("");
  const [replyTo, setReplyTo] = useState(null);

  const subRef = useRef(null);
  const bottomRef = useRef(null);

  /* ---------------- INITIAL LOAD ---------------- */
  useEffect(() => {
    const email = localStorage.getItem("email");
    if (!email) {
      window.location.href = "/login";
      return;
    }

    setUserEmail(email);
    connectSocket(email);
    loadRooms(email);
  }, []);

  /* ---------------- load sidebar rooms ---------------- */
  async function loadRooms(email) {
    try {
      const { data } = await axios.get(`${API_BASE}/rooms/${email}`);

      const normalized = (data || []).map((r) => {
        const other = r.userA === email ? r.userB : r.userA;
        return {
          roomId: r.roomId,
          receiver: other,
          preview: r.preview || "",
          unread: r.unread || 0,
        };
      });

      setRooms(normalized);
    } catch (err) {
      console.error("loadRooms failed", err);
    }
  }

  /* ---------------- SOCKET ---------------- */
  function connectSocket(email) {
    const socket = new SockJS(WS_ENDPOINT);
    stompClient = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 1500,

      onConnect: () => {
        setConnected(true);

        stompClient.subscribe("/topic/online", (frame) => {
          const evt = JSON.parse(frame.body || "{}");
          setOnlineMap((prev) => ({ ...prev, [evt.email]: evt.online }));
          loadRooms(email);
        });
      },
    });

    stompClient.activate();
  }

  /* ---------------- ROOM SUBSCRIPTION ---------------- */
  useEffect(() => {
    if (!connected || !receiver) return;

    (async () => {
      try {
        let rid = roomId;

        if (!rid) {
          const { data } = await axios.get(
            `${API_BASE}/room/${userEmail}/${receiver}`
          );
          rid = data.roomId;
          setRoomId(rid);
        }

        if (!rid) return;

        try {
          subRef.current?.unsubscribe();
        } catch {}

        subRef.current = stompClient.subscribe(
          `/topic/room.${rid}`,
          (frame) => {
            const msg = JSON.parse(frame.body || "{}");
            msg.reactions = safeParseReactions(msg.reactions);

            setMessages((prev) => {
              const exists = prev.some((m) => m.id === msg.id);
              return exists
                ? prev.map((m) => (m.id === msg.id ? msg : m))
                : [...prev, msg];
            });
          }
        );

        const hist = await axios.get(`${API_BASE}/${userEmail}/${receiver}`);
        setMessages(
          hist.data.map((m) => ({
            ...m,
            reactions: safeParseReactions(m.reactions),
          }))
        );
      } catch (err) {
        console.error("room subscription failed", err);
      }
    })();
  }, [receiver, roomId, connected]);

  /* ---------------- SEND MESSAGE ---------------- */
  const sendMessage = () => {
    if (!messageInput.trim() || !receiver) return;

    stompClient.publish({
      destination: "/app/private-message",
      body: JSON.stringify({
        sender: userEmail,
        receiver,
        content: messageInput.trim(),
      }),
    });

    setMessageInput("");
  };

  /* ---------------- UI ---------------- */
  return (
    <div style={{ display: "flex", height: "100vh" }}>
      {/* SIDEBAR */}
      <div style={{ width: 320, padding: 16, borderRight: "1px solid #eee" }}>
        <UserSearchSidebar
          onOpenChat={(rid, email) => {
            setRoomId(rid);
            setReceiver(email);
          }}
        />

        <div style={{ marginTop: 10, fontWeight: 700 }}>Chats</div>

        <div style={{ height: "calc(100vh - 200px)", overflowY: "auto" }}>
          {rooms.map((r, index) => (
            <ChatListItem
              key={index}
              r={r}
              active={receiver === r.receiver}
              online={!!onlineMap[r.receiver]}
              onClick={async () => {
                try {
                  const { data } = await axios.get(
                    `${API_BASE}/room/${userEmail}/${r.receiver}`
                  );
                  setRoomId(data.roomId);
                } catch (err) {
                  console.error("room fetch from list failed", err);
                }

                setReceiver(r.receiver);

                setRooms((prev) =>
                  prev.map((p) =>
                    p.receiver === r.receiver ? { ...p, unread: 0 } : p
                  )
                );
              }}
            />
          ))}
        </div>
      </div>

      {/* CHAT PANEL */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <div
          style={{
            padding: 16,
            borderBottom: "1px solid #eee",
            fontWeight: 700,
          }}
        >
          {receiver || "Select a user"}
        </div>

        <div
          style={{
            flex: 1,
            padding: 20,
            overflowY: "auto",
            background: "#fafafa",
          }}
        >
          {messages.map((msg) => (
            <div
              key={msg.id}
              style={{
                display: "flex",
                justifyContent:
                  msg.sender === userEmail ? "flex-end" : "flex-start",
                marginBottom: 10,
              }}
            >
              <div
                style={{
                  padding: 10,
                  background:
                    msg.sender === userEmail ? "#dcf8c6" : "#fff",
                  borderRadius: 10,
                  maxWidth: "70%",
                }}
              >
                {msg.content}
              </div>
            </div>
          ))}

          <div ref={bottomRef}></div>
        </div>

        <div
          style={{
            padding: 12,
            borderTop: "1px solid #eee",
            display: "flex",
            gap: 10,
          }}
        >
          <input
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            style={{ flex: 1, padding: 12, borderRadius: 6 }}
            placeholder={receiver ? `Message ${receiver}` : "Select chat"}
            onKeyDown={(e) => e.key === "Enter" && sendMessage()}
          />

          <button
            onClick={sendMessage}
            style={{
              padding: "10px 16px",
              background: "#007bff",
              color: "#fff",
              borderRadius: 6,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
