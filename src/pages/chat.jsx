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
  if (typeof r === "object") return r;
  try {
    return JSON.parse(r);
  } catch {
    return {};
  }
};

const safeParseReplyTo = (r) => {
  if (!r) return null;
  if (typeof r === "object") return r;
  try {
    return JSON.parse(r);
  } catch {
    return null;
  }
};

const fmtTimeShort = (ts) => {
  if (!ts) return "";
  if (ts.includes(":")) {
    const p = ts.split(":");
    return `${p[0].padStart(2, "0")}:${p[1].padStart(2, "0")}`;
  }
  return ts;
};

/* ---------------- Chat List Item ---------------- */
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

/* ---------------- Action Pill ---------------- */
function ActionPill({ onChooseEmoji, onToggleMenu, showingMenu }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        background: "#111",
        color: "#fff",
        padding: "6px 8px",
        borderRadius: 22,
        gap: 8,
        boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
      }}
    >
      {EMOJI_SET.map((e) => (
        <span
          key={e}
          onClick={() => onChooseEmoji(e)}
          style={{
            fontSize: 18,
            cursor: "pointer",
            userSelect: "none",
            padding: "2px 4px",
          }}
        >
          {e}
        </span>
      ))}

      <button
        onClick={(ev) => {
          ev.stopPropagation();
          onToggleMenu();
        }}
        aria-expanded={showingMenu}
        style={{
          marginLeft: 6,
          width: 28,
          height: 28,
          borderRadius: 999,
          border: "none",
          background: "#fff",
          color: "#111",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 700,
        }}
      >
        ⋮
      </button>
    </div>
  );
}

/* ---------------- Context Menu ---------------- */
function ContextMenu({
  onReply,
  onForward,
  onCopy,
  onEdit,
  onDeleteForMe,
  onDeleteForEveryone,
}) {
  return (
    <div
      style={{
        background: "#111",
        color: "#fff",
        padding: 8,
        borderRadius: 8,
        width: 220,
        boxShadow: "0 8px 30px rgba(0,0,0,0.35)",
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ padding: 8, cursor: "pointer" }} onClick={onReply}>
        Reply
      </div>
      <div style={{ padding: 8, cursor: "pointer" }} onClick={onForward}>
        Forward
      </div>
      <div style={{ padding: 8, cursor: "pointer" }} onClick={onCopy}>
        Copy
      </div>
      {onEdit && (
        <div style={{ padding: 8, cursor: "pointer" }} onClick={onEdit}>
          Edit
        </div>
      )}
      <div
        style={{ padding: 8, cursor: "pointer", color: "#ffdddd" }}
        onClick={onDeleteForMe}
      >
        Delete for me
      </div>
      <div
        style={{ padding: 8, cursor: "pointer", color: "#ff6b6b" }}
        onClick={onDeleteForEveryone}
      >
        Delete for everyone
      </div>
    </div>
  );
}

/* ---------------- Message Bubble ---------------- */
function MessageBubble({
  msg,
  mine,
  userEmail,
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
  setShowPreview
}) {
  const replyObj = safeParseReplyTo(msg.replyTo);

  /* ---------------- FILE / IMAGE PARSING FIX ---------------- */
  const content = msg.content || "";

  const isUrl = typeof content === "string" && content.startsWith("http");

  // remove Cloudinary params ?_a=...
  const cleanUrl = isUrl ? content.split("?")[0] : "";

  const isImage = isUrl && /\.(jpe?g|png|gif|webp)$/i.test(cleanUrl);

  /* ---------------------------------------------------------- */
return (
  <div
    style={{
      margin: "10px 0",
      display: "flex",
      justifyContent: mine ? "flex-end" : "flex-start",
      position: "relative",
    }}
    onMouseEnter={() => setHoveredMsg(msg.id)}
    onMouseLeave={() => {
      // Keep visible if reaction bar OR menu is open
      if (reactionBarFor !== msg.id && menuFor !== msg.id) {
        setHoveredMsg(null);
      }
    }}
    onClick={() => {
      setReactionBarFor(null);
      setMenuFor(null);
    }}
  >
    <div style={{ maxWidth: "78%", position: "relative" }}>

      {/* 🔥 FIXED — Stable Action Pill */}
      {(hoveredMsg === msg.id ||
        reactionBarFor === msg.id ||
        menuFor === msg.id) &&
        !msg.deleted && (
          <div
            style={{
              position: "absolute",
              top: -44,
              right: mine ? 0 : "auto",
              left: mine ? "auto" : 0,
              zIndex: 300,
              padding: "6px 10px",
              pointerEvents: "auto",
            }}
            onMouseEnter={() => setHoveredMsg(msg.id)}
            onMouseLeave={() => {
              if (reactionBarFor !== msg.id && menuFor !== msg.id) {
                setHoveredMsg(null);
              }
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <ActionPill
              onChooseEmoji={(emoji) => {
                sendReaction(msg.id, emoji);
                setReactionBarFor(null);
                setMenuFor(null);
                setHoveredMsg(null);
              }}
              onToggleMenu={() =>
                setMenuFor(menuFor === msg.id ? null : msg.id)
              }
              showingMenu={menuFor === msg.id}
            />
          </div>
        )}

      {/* 💬 Actual bubble */}
      <div
        style={{
          display: "inline-block",
          background: mine ? "#dcf8c6" : "#fff",
          padding: 12,
          borderRadius: 12,
          boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
        }}
      >
        {msg.deleted ? (
          <div style={{ color: "#666", fontStyle: "italic" }}>
            🚫 This message was deleted
          </div>
        ) : (
          <>
            {/* Reply Preview */}
            {replyObj && (
              <div
                style={{
                  borderLeft: "3px solid #eee",
                  paddingLeft: 8,
                  marginBottom: 6,
                  fontSize: 13,
                  color: "#555",
                }}
              >
                <strong>
                  {replyObj.sender === userEmail ? "You" : replyObj.sender}
                </strong>
                <div>{String(replyObj.content).slice(0, 200)}</div>
              </div>
            )}

            {/* Message content */}
            <div style={{ fontSize: 15, whiteSpace: "pre-wrap" }}>
              {isUrl ? (
                isImage ? (
                  <img
                    src={content}
                    alt="uploaded"
                    style={{
                      maxWidth: 360,
                      borderRadius: 8,
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      setPreviewImage(content);
                      setShowPreview(true);
                    }}
                  />
                ) : (
                  <a
                    href={content}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "#0066cc",
                      textDecoration: "underline",
                      wordBreak: "break-all",
                    }}
                  >
                    📎 {cleanUrl.split("/").pop()}
                  </a>
                )
              ) : (
                <span>
                  {content}
                  {msg.editedContent ? " (edited)" : ""}
                </span>
              )}
            </div>
          

              {/* ------------------------------------- */}

              <div style={{ marginTop: 6 }}>{renderReactions(msg)}</div>

              <div style={{ fontSize: 11, color: "#777", marginTop: 6 }}>
                {fmtTime(msg.timestamp)} {mine && renderTicks(msg)}
              </div>
            </>
          )}
        </div>

        {menuFor === msg.id && !msg.deleted && (
          <div
            style={{
              position: "absolute",
              top: -120,
              right: mine ? 0 : "auto",
              left: mine ? "auto" : 0,
              zIndex: 200,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <ContextMenu
              onReply={() => replyToMessage(msg)}
              onForward={() => forwardMessage(msg)}
              onCopy={() => copyMessage(msg.content)}
              onEdit={
                msg.sender === userEmail ? () => startEdit(msg) : undefined
              }
              onDeleteForMe={() => deleteMessageApi(msg.id, false)}
              onDeleteForEveryone={() => deleteMessageApi(msg.id, true)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Main Chat Component ---------------- */
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
  const [editFor, setEditFor] = useState(null);
  const [editText, setEditText] = useState("");

  const [hoveredMsg, setHoveredMsg] = useState(null);
  const [reactionBarFor, setReactionBarFor] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const fileInputRef = useRef(null);


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

    return () => {
      try {
        subRef.current?.unsubscribe();
      } catch {}
      try {
        stompClient?.deactivate();
      } catch {}
    };
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ---------------- API HELPERS ---------------- */
  async function loadRooms(email) {
    try {
      const { data } = await axios.get(`${API_BASE}/rooms/${email}`);

      const normalized = (data || [])
        .map((r) => ({
          roomId: r.roomId,
          receiver: r.receiver,
          preview: r.preview || "",
          unread: r.unread || 0,
        }))
        .filter((r) => !!r.receiver);

      setRooms(normalized);
    } catch (e) {
      console.error("rooms load error", e);
    }
  }

  async function loadOnline() {
    try {
      const { data } = await axios.get(`${API_BASE}/online`);
      setOnlineMap(data.users || {});
    } catch {}
  }

  /* ---------------- WebSocket ---------------- */
  function connectSocket(email) {
    const socket = new SockJS(WS_ENDPOINT);
    stompClient = new Client({
      webSocketFactory: () => socket,
      reconnectDelay: 3000,

      onConnect: () => {
        setConnected(true);
        loadOnline();
        loadRooms(email);

        const myEmail = email;

        /* -------- presence updates -------- */
        stompClient.subscribe("/topic/online", (frame) => {
          const evt = JSON.parse(frame.body || "{}");
          setOnlineMap((prev) => ({ ...prev, [evt.email]: evt.online }));
          loadRooms(myEmail);
        });

        /* -------- unread.update -------- */
        stompClient.subscribe("/topic/unread.update", async (frame) => {
          const evt = JSON.parse(frame.body || "{}");
          if (evt.receiver !== myEmail) return;

          try {
            const { data } = await axios.get(
              `${API_BASE}/unread/${myEmail}/${evt.sender}`
            );

            setRooms((prev) =>
              prev.map((r) =>
                r.receiver === evt.sender ? { ...r, unread: data.unread } : r
              )
            );
          } catch {}
        });

        /* -------- reaction updates -------- */
        stompClient.subscribe(`/topic/reaction.${myEmail}`, (frame) => {
          const evt = JSON.parse(frame.body || "{}");

          setMessages((prev) =>
            prev.map((m) =>
              m.id === evt.messageId
                ? {
                    ...m,
                    reactions: {
                      ...safeParseReactions(m.reactions),
                      [evt.emoji]: evt.users || [],
                    },
                  }
                : m
            )
          );
        });

        /* -------- seen updates -------- */
        stompClient.subscribe(`/topic/seen.${myEmail}`, (frame) => {
          const evt = JSON.parse(frame.body || "{}");
          setMessages((prev) =>
            prev.map((m) =>
              m.sender === myEmail && m.receiver === evt.from
                ? { ...m, status: "SEEN" }
                : m
            )
          );
        });

        /* -------- delete for everyone -------- */
        stompClient.subscribe(`/topic/delete.${myEmail}`, (frame) => {
          const evt = JSON.parse(frame.body || "{}");
          setMessages((prev) =>
            prev.map((m) =>
              m.id === evt.messageId
                ? { ...m, deleted: true, content: "", reactions: {} }
                : m
            )
          );
        });

        /* -------- delete for me -------- */
        stompClient.subscribe(`/topic/deleteForMe.${myEmail}`, (frame) => {
          const evt = JSON.parse(frame.body || "{}");
          setMessages((prev) =>
            prev.filter((m) => m.id !== evt.messageId)
          );
        });

        /* -------- edit messages -------- */
        stompClient.subscribe(`/topic/edit.${myEmail}`, (frame) => {
          const evt = JSON.parse(frame.body || "{}");
          setMessages((prev) =>
            prev.map((m) =>
              m.id === evt.messageId
                ? { ...m, editedContent: evt.editedContent }
                : m
            )
          );
        });

        /* ------------ register online ------------ */
        setTimeout(() => {
          stompClient.publish({
            destination: "/app/online.register",
            body: JSON.stringify({ email: myEmail }),
          });
        }, 300);
      },
    });

    stompClient.activate();
  }

  /* ---------------- ROOM SUBSCRIPTION ---------------- */
  useEffect(() => {
    if (!connected || !receiver || !userEmail) return;

    let cancelled = false;

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

        if (!rid || cancelled) return;

        try {
          subRef.current?.unsubscribe();
        } catch {}

        /* -------- subscribe to new messages -------- */
        subRef.current = stompClient.subscribe(
          `/topic/room.${rid}`,
          async (frame) => {
            const msg = JSON.parse(frame.body || "{}");
            msg.reactions = safeParseReactions(msg.reactions);

            if (msg.receiver === userEmail) {
              try {
                await axios.put(
                  `${API_BASE}/seen/${msg.sender}/${userEmail}`
                );
              } catch {}
            }

            setMessages((prev) => {
              const exists = prev.some((m) => m.id === msg.id);
              return exists
                ? prev.map((m) => (m.id === msg.id ? msg : m))
                : [...prev, msg];
            });

            loadRooms(userEmail);
          }
        );

        /* -------- typing -------- */
        stompClient.subscribe(`/topic/typing.${rid}`, (frame) => {
          const evt = JSON.parse(frame.body || "{}");
          setTypingMap((prev) => ({ ...prev, [evt.sender]: evt.typing }));
        });

        /* -------- load history -------- */
        const hist = await axios.get(`${API_BASE}/${userEmail}/${receiver}`);
        if (!cancelled) {
          setMessages(
            hist.data.map((m) => ({
              ...m,
              reactions: safeParseReactions(m.reactions),
            }))
          );
        }

        /* -------- mark seen -------- */
        try {
          await axios.put(`${API_BASE}/seen/${receiver}/${userEmail}`);
        } catch {}

        /* -------- reset unread -------- */
        setRooms((prev) =>
          prev.map((r) =>
            r.receiver === receiver ? { ...r, unread: 0 } : r
          )
        );
      } catch (err) {
        console.error("room setup error", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [receiver, roomId, connected, userEmail]);

  /* ---------------- SEND MESSAGE ---------------- */
  const sendMessage = () => {
    if (!messageInput.trim() || !receiver || !stompClient?.connected) return;

    const payload = {
      sender: userEmail,
      receiver,
      content: messageInput.trim(),
      replyTo: replyTo
        ? {
            id: replyTo.id,
            sender: replyTo.sender,
            content: replyTo.content,
          }
        : null,
    };

    stompClient.publish({
      destination: "/app/private-message",
      body: JSON.stringify(payload),
    });

    setMessageInput("");
    setReplyTo(null);
  };

  /* ---------------- SEND TYPING ---------------- */
  const sendTypingEvent = () => {
    if (!stompClient?.connected || !receiver) return;

    stompClient.publish({
      destination: "/app/typing",
      body: JSON.stringify({
        sender: userEmail,
        receiver,
        typing: true,
      }),
    });

    if (typingTimeout) clearTimeout(typingTimeout);

    typingTimeout = setTimeout(() => {
      stompClient.publish({
        destination: "/app/typing",
        body: JSON.stringify({
          sender: userEmail,
          receiver,
          typing: false,
        }),
      });
    }, 900);
  };

  /* ---------------- DELETE & REACTION ---------------- */
  const deleteMessageApi = async (messageId, forEveryone = false) => {
    try {
      if (forEveryone) {
        await axios.put(
          `${API_BASE}/deleteForEveryone/${messageId}/${userEmail}`
        );
      } else {
        await axios.put(
          `${API_BASE}/deleteForMe/${messageId}/${userEmail}`
        );
      }

      if (!forEveryone) {
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      } else {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, deleted: true, content: "", reactions: {} }
              : m
          )
        );
      }
    } catch {}
  };

  const sendReaction = (messageId, emoji) => {
    if (!stompClient?.connected) return;

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;

        const reactions = safeParseReactions(m.reactions);
        const arr = reactions[emoji] || [];
        const exists = arr.includes(userEmail);

        const updated = exists
          ? arr.filter((u) => u !== userEmail)
          : [...arr, userEmail];

        return {
          ...m,
          reactions: { ...reactions, [emoji]: updated },
        };
      })
    );

    stompClient.publish({
      destination: "/app/react",
      body: JSON.stringify({
        messageId: String(messageId),
        emoji,
        userEmail,
      }),
    });

    setReactionBarFor(null);
  };

  /* ---------------- BASIC ACTIONS ---------------- */
  const copyMessage = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {}
  };

  const replyToMessage = (m) => {
    setReplyTo({
      id: m.id,
      sender: m.sender,
      content: m.content,
    });
  };

  const forwardMessage = (m) => {
    const to = prompt("Forward to email:");
    if (!to) return;

    stompClient.publish({
      destination: "/app/private-message",
      body: JSON.stringify({
        sender: userEmail,
        receiver: to,
        content: `[Fwd] ${m.content}`,
      }),
    });
  };

  const startEdit = (m) => {
    if (m.sender !== userEmail) return;
    setEditFor(m.id);
    setEditText(m.content);
  };

  const saveEdit = async (id) => {
    try {
      await axios.put(`${API_BASE}/edit/${id}`, {
        editedContent: editText,
      });
    } catch {}

    setMessages((prev) =>
      prev.map((m) =>
        m.id === id ? { ...m, editedContent: editText } : m
      )
    );

    setEditFor(null);
    setEditText("");
  };

  /* ---------------- RENDER HELPERS ---------------- */
  const renderReactions = (msg) => {
    const obj = safeParseReactions(msg.reactions);

    return (
      <div style={{ display: "flex", gap: 6 }}>
        {Object.entries(obj).map(([emoji, users]) => {
          if (!users || users.length === 0) return null;

          const me = users.includes(userEmail);

          return (
            <span
              key={emoji}
              onClick={() => sendReaction(msg.id, emoji)}
              style={{
                padding: "3px 8px",
                background: me ? "#dcf8c6" : "#f1f1f1",
                borderRadius: 12,
                cursor: "pointer",
              }}
            >
              {emoji} <strong>{users.length}</strong>
            </span>
          );
        })}
      </div>
    );
  };

  const renderTicks = (msg) => {
    if (msg.sender !== userEmail) return null;

    if (msg.status === "SEEN")
      return <span style={{ color: "#34B7F1" }}>✓✓</span>;

    return <span style={{ color: "#777" }}>✓</span>;
  };

  const partnerTyping = receiver && typingMap[receiver];

  /* ---------------- PAGE UI START ---------------- */
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "Inter, sans-serif",
      }}
    >
      {/* LEFT SIDEBAR */}
      <div
        style={{
          width: 320,
          borderRight: "1px solid #eee",
          padding: 16,
          background: "#fafafa",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontWeight: "bold" }}>{userEmail}</div>
            <small style={{ color: "#2b9cff" }}>Online</small>
          </div>

          <button
            onClick={() => {
              if (stompClient?.connected) {
                stompClient.publish({
                  destination: "/app/online.unregister",
                  body: JSON.stringify({ email: userEmail }),
                });
              }
              localStorage.clear();
              window.location.href = "/login";
            }}
          >
            Logout
          </button>
        </div>

        {/* SEARCH + USER LIST */}
        <UserSearchSidebar
          onOpenChat={(rid, partner) => {
            setRoomId(rid);
            setReceiver(partner);
            setReplyTo(null);
            setEditFor(null);
            loadRooms(userEmail);
          }}
        />

        {/* CHATS LIST */}
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, marginBottom: 8 }}>Chats</div>

          <div style={{ height: "calc(100vh - 220px)", overflowY: "auto" }}>
            {rooms.map((r, i) => (
              <ChatListItem
                key={i}
                r={r}
                online={!!onlineMap[r.receiver]}
                active={r.receiver === receiver}
                onClick={() => {
                  setReceiver(r.receiver);
                  setRoomId(r.roomId);
                  setReplyTo(null);
                  setEditFor(null);
                }}
              />
            ))}
          </div>
        </div>
      </div>
            {/* RIGHT CHAT PANEL */}
      <div
        style={{
          background: "#fbfcfd",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* HEADER */}
        <div
          style={{
            padding: 14,
            borderBottom: "1px solid #eee",
            display: "flex",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div>
            <div style={{ fontWeight: 700, fontSize: 18 }}>
              {receiver || "Select a chat"}
            </div>
            <div style={{ fontSize: 13, color: "#03A9F4" }}>
              {receiver
                ? partnerTyping
                  ? "typing..."
                  : onlineMap[receiver]
                  ? "Online"
                  : "Offline"
                : ""}
            </div>
          </div>
        </div>

        {/* MESSAGES AREA */}
        <div
          style={{
            flex: 1,
            overflowY: "auto",
            padding: 20,
            background: "#fbfcfd",
          }}
          onClick={() => {
            setReactionBarFor(null);
            setMenuFor(null);
            setHoveredMsg(null);
          }}
        >
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            {messages.map((msg) => {
              if (Array.isArray(msg.deletedFor) && msg.deletedFor.includes(userEmail))
                return null;

              const mine = msg.sender === userEmail;

              return (
                <div key={msg.id}>
                  <MessageBubble
                    msg={msg}
                    mine={mine}
                    userEmail={userEmail}
                    hoveredMsg={hoveredMsg}
                    setHoveredMsg={setHoveredMsg}
                    reactionBarFor={reactionBarFor}
                    setReactionBarFor={setReactionBarFor}
                    menuFor={menuFor}
                    setMenuFor={setMenuFor}
                    sendReaction={sendReaction}
                    deleteMessageApi={deleteMessageApi}
                    replyToMessage={replyToMessage}
                    forwardMessage={forwardMessage}
                    copyMessage={copyMessage}
                    startEdit={startEdit}
                    renderReactions={renderReactions}
                    fmtTime={fmtTimeShort}
                    renderTicks={renderTicks}
                    setPreviewImage={setPreviewImage}
                    setShowPreview={setShowPreview}
                  />

                  {editFor === msg.id && (
                    <div
                      style={{
                        maxWidth: "75%",
                        marginLeft: mine ? "auto" : undefined,
                        marginTop: 6,
                      }}
                    >
                      <input
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        style={{
                          padding: 8,
                          width: "100%",
                          borderRadius: 8,
                          border: "1px solid #ddd",
                        }}
                      />
                      <div style={{ marginTop: 6 }}>
                        <button
                          onClick={() => saveEdit(msg.id)}
                          style={{ marginRight: 8 }}
                        >
                          Save
                        </button>
                        <button
                          onClick={() => {
                            setEditFor(null);
                            setEditText("");
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            <div ref={bottomRef} />
          </div>
        </div>

        {/* COMPOSER */}
        <div
          style={{
            padding: 12,
            borderTop: "1px solid #eee",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          {/* FILE UPLOAD */}
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file || !receiver) return;

              try {
                const formData = new FormData();
                formData.append("file", file);

                const { data } = await axios.post(`${API_BASE}/upload`, formData, {
                  headers: { "Content-Type": "multipart/form-data" },
                });

                stompClient.publish({
                  destination: "/app/private-message",
                  body: JSON.stringify({
                    sender: userEmail,
                    receiver,
                    content: data.url,
                  }),
                });
              } catch (err) {
                alert("File upload failed");
              }
            }}
          />

          <button onClick={() => fileInputRef.current?.click()}>📎</button>

          {/* TEXT INPUT */}
          <div style={{ flex: 1 }}>
            {replyTo && (
              <div
                style={{
                  background: "#f1f9ff",
                  padding: 8,
                  borderRadius: 8,
                  marginBottom: 6,
                }}
              >
                Replying to{" "}
                <b>{replyTo.sender === userEmail ? "You" : replyTo.sender}</b>:{" "}
                {String(replyTo.content).slice(0, 120)}
                <button
                  onClick={() => setReplyTo(null)}
                  style={{ marginLeft: 8 }}
                >
                  ✕
                </button>
              </div>
            )}

            <input
              value={messageInput}
              onChange={(e) => {
                setMessageInput(e.target.value);
                sendTypingEvent();
              }}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              placeholder={
                receiver ? `Message ${receiver}` : "Select a chat to start messaging"
              }
              disabled={!receiver}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ddd",
              }}
            />
          </div>

          {/* SEND BUTTON */}
          <button
            onClick={sendMessage}
            style={{
              padding: "10px 14px",
              background: "#007bff",
              color: "#fff",
              borderRadius: 8,
              border: "none",
            }}
          >
            Send
          </button>
        </div>
      </div>

      {/* IMAGE PREVIEW (LIGHTBOX) */}
      {showPreview && (
        <div
          onClick={() => setShowPreview(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
          }}
        >
          <img
            src={previewImage}
            style={{
              maxWidth: "92%",
              maxHeight: "92%",
              borderRadius: 10,
            }} alt=""
          />
        </div>
      )}
    </div>
  );
}
