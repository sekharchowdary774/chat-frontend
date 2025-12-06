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
        title="More"
      >
        ⋮
      </button>
    </div>
  );
}

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
      <div style={{ padding: "8px 10px", cursor: "pointer" }} onClick={onReply}>
        Reply
      </div>
      <div style={{ padding: "8px 10px", cursor: "pointer" }} onClick={onForward}>
        Forward
      </div>
      <div style={{ padding: "8px 10px", cursor: "pointer" }} onClick={onCopy}>
        Copy
      </div>
      {onEdit && (
        <div style={{ padding: "8px 10px", cursor: "pointer" }} onClick={onEdit}>
          Edit
        </div>
      )}
      <div
        style={{ padding: "8px 10px", cursor: "pointer", color: "#ffdddd" }}
        onClick={onDeleteForMe}
      >
        Delete for me
      </div>
      <div
        style={{ padding: "8px 10px", cursor: "pointer", color: "#ff6b6b" }}
        onClick={onDeleteForEveryone}
      >
        Delete for everyone
      </div>
    </div>
  );
}

/* ---------------- MessageBubble ---------------- */
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
  setShowPreview,
}) {
  const replyObj = safeParseReplyTo(msg.replyTo);

  const isFile =
    typeof msg.content === "string" && msg.content.startsWith("http");
  const isImage =
    isFile && /\.(jpeg|jpg|png|gif|webp)$/i.test(msg.content || "");

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
      onClick={() => {
        setReactionBarFor(null);
        setMenuFor(null);
      }}
    >
      <div style={{ maxWidth: "78%", position: "relative" }}>
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
                zIndex: 90,
                display: "flex",
                gap: 8,
                alignItems: "center",
              }}
              onClick={(ev) => ev.stopPropagation()}
            >
              <ActionPill
                onChooseEmoji={(emoji) => {
                  sendReaction(msg.id, emoji);
                  setReactionBarFor(null);
                  setMenuFor(null);
                  setHoveredMsg(null);
                }}
                onToggleMenu={() => {
                  setMenuFor(menuFor === msg.id ? null : msg.id);
                  setReactionBarFor(null);
                }}
                showingMenu={menuFor === msg.id}
              />
            </div>
          )}

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

              <div
                style={{
                  fontSize: 15,
                  color: "#111",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {isFile ? (
                  isImage ? (
                    <img
                      src={msg.content}
                      alt="img"
                      style={{ maxWidth: 360, borderRadius: 8, cursor: "pointer" }}
                      onClick={() => {
                        setPreviewImage(msg.content);
                        setShowPreview(true);
                      }}
                    />
                  ) : (
                    <a href={msg.content} target="_blank" rel="noreferrer">
                      📎 {msg.content.split("/").pop()}
                    </a>
                  )
                ) : (
                  <span>
                    {msg.content}
                    {msg.editedContent ? " (edited)" : ""}
                  </span>
                )}
              </div>

              <div style={{ marginTop: 8 }}>{renderReactions(msg)}</div>

              <div style={{ fontSize: 11, color: "#666", marginTop: 6 }}>
                • {fmtTime(msg.timestamp)} {mine && renderTicks(msg)}
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
              onReply={() => {
                replyToMessage(msg);
                setMenuFor(null);
                setHoveredMsg(null);
              }}
              onForward={() => {
                forwardMessage(msg);
                setMenuFor(null);
                setHoveredMsg(null);
              }}
              onCopy={() => {
                copyMessage(msg.content || "");
                setMenuFor(null);
                setHoveredMsg(null);
              }}
              onEdit={
                msg.sender === userEmail
                  ? () => {
                      startEdit(msg);
                      setMenuFor(null);
                      setHoveredMsg(null);
                    }
                  : null
              }
              onDeleteForMe={() => {
                deleteMessageApi(msg.id, false);
                setMenuFor(null);
                setHoveredMsg(null);
              }}
              onDeleteForEveryone={() => {
                deleteMessageApi(msg.id, true);
                setMenuFor(null);
                setHoveredMsg(null);
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- Main Chat component ---------------- */
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
  const [previewImage, setPreviewImage] = useState(null);
  const [showPreview, setShowPreview] = useState(false);

  const [hoveredMsg, setHoveredMsg] = useState(null);
  const [reactionBarFor, setReactionBarFor] = useState(null);
  const [menuFor, setMenuFor] = useState(null);
  const [replyTo, setReplyTo] = useState(null);
  const [editFor, setEditFor] = useState(null);
  const [editText, setEditText] = useState("");

  const subRef = useRef(null);
  const bottomRef = useRef(null);
  const fileInputRef = useRef(null);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ------------------- API helpers ------------------- */
  async function loadRooms(email) {
    try {
      const { data } = await axios.get(`${API_BASE}/rooms/${email}`);

      const normalized = (data || [])
        .map((room) => {
          // Try different backend shapes defensively
          let other = null;

          if (room.userA || room.userB) {
            other =
              room.userA === email
                ? room.userB
                : room.userB === email
                ? room.userA
                : null;
          } else if (Array.isArray(room.participants)) {
            const others = room.participants.filter((u) => u !== email);
            other = others[0] || null;
          } else if (room.receiver || room.sender) {
            // last-resort guess
            other = room.receiver === email ? room.sender : room.receiver;
          } else if (room.other) {
            other = room.other;
          }

          const rid = room.roomId || room.id || room.roomid;

          if (!other) return null;

          return {
            roomId: rid,
            receiver: other,
            preview: room.preview || room.lastMessage || "",
            unread: room.unread || 0,
          };
        })
        .filter(Boolean);

      setRooms(normalized);
    } catch (e) {
      console.error("loadRooms failed", e);
    }
  }

  async function loadOnline() {
    try {
      const { data } = await axios.get(`${API_BASE}/online`);
      setOnlineMap(data.users || {});
    } catch (e) {
      console.error("loadOnline failed", e);
    }
  }

  /* ------------------- WebSocket ------------------- */
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

        // presence updates
        stompClient.subscribe("/topic/online", (frame) => {
          const evt = JSON.parse(frame.body || "{}");
          setOnlineMap((prev) => ({ ...prev, [evt.email]: evt.online }));
          loadRooms(myEmail);
        });

        // unread.update
        stompClient.subscribe("/topic/unread.update", async (frame) => {
          const evt = JSON.parse(frame.body || "{}");
          if (evt.receiver === myEmail) {
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
          }
        });

        // unread.refresh
        stompClient.subscribe("/topic/unread.refresh", (frame) => {
          const evt = JSON.parse(frame.body || "{}");
          if (evt?.email === myEmail) loadRooms(myEmail);
        });

        // reaction updates
        stompClient.subscribe(`/topic/reaction.${myEmail}`, (frame) => {
          try {
            const evt = JSON.parse(frame.body || "{}");
            setMessages((prev) =>
              prev.map((m) =>
                m.id === evt.messageId
                  ? {
                      ...m,
                      reactions: {
                        ...safeParseReactions(m.reactions),
                        [evt.emoji]: Array.isArray(evt.users)
                          ? evt.users
                          : evt.users || [],
                      },
                    }
                  : m
              )
            );
          } catch (e) {
            console.error("reaction update parse error", e);
          }
        });

        // seen notifications
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

        // delete notifications (for everyone)
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

        // deleteForMe
        stompClient.subscribe(`/topic/deleteForMe.${myEmail}`, (frame) => {
          const evt = JSON.parse(frame.body || "{}");
          setMessages((prev) => prev.filter((m) => m.id !== evt.messageId));
        });

        // edit
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

        // register online
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

  /* ------------------- Room subscription ------------------- */
  useEffect(() => {
    if (!connected || !receiver || !userEmail) return;

    let cancelled = false;

    (async () => {
      try {
        let rid = roomId;

        // fetch/create room if missing
        if (!rid) {
          const { data } = await axios.get(
            `${API_BASE}/room/${userEmail}/${receiver}`
          );
          rid = data.roomId;
          setRoomId(rid);
        }

        if (!rid || cancelled) return;

        // unsubscribe previous room sub
        try {
          subRef.current?.unsubscribe();
        } catch {}

        // messages subscription
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

        // typing
        stompClient.subscribe(`/topic/typing.${rid}`, (frame) => {
          const evt = JSON.parse(frame.body || "{}");
          setTypingMap((prev) => ({ ...prev, [evt.sender]: evt.typing }));
        });

        // history
        const hist = await axios.get(`${API_BASE}/${userEmail}/${receiver}`);
        if (!cancelled) {
          setMessages(
            (hist.data || []).map((m) => ({
              ...m,
              reactions: safeParseReactions(m.reactions),
            }))
          );
        }

        // mark seen for receiver->me
        try {
          await axios.put(`${API_BASE}/seen/${receiver}/${userEmail}`);
        } catch {}

        // clear unread for this chat
        setRooms((prev) =>
          prev.map((r) =>
            r.receiver === receiver ? { ...r, unread: 0 } : r
          )
        );
      } catch (err) {
        console.error("setupRoom error", err);
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiver, roomId, connected, userEmail]);

  /* ------------------- Actions ------------------- */
  const sendTypingEvent = () => {
    if (!stompClient?.connected || !receiver) return;
    stompClient.publish({
      destination: "/app/typing",
      body: JSON.stringify({ sender: userEmail, receiver, typing: true }),
    });
    if (typingTimeout) clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
      stompClient.publish({
        destination: "/app/typing",
        body: JSON.stringify({ sender: userEmail, receiver, typing: false }),
      });
    }, 900);
  };

  const sendMessage = () => {
    if (!messageInput.trim() || !receiver || !stompClient?.connected) return;

    const payload = {
      sender: userEmail,
      receiver,
      content: messageInput.trim(),
      replyTo: replyTo
        ? { id: replyTo.id, sender: replyTo.sender, content: replyTo.content }
        : null,
    };

    stompClient.publish({
      destination: "/app/private-message",
      body: JSON.stringify(payload),
    });

    setMessageInput("");
    setReplyTo(null);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !receiver) return;
    try {
      const formData = new FormData();
      formData.append("file", file);
      const { data } = await axios.post(`${API_BASE}/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const fileUrl = data.url;
      stompClient.publish({
        destination: "/app/private-message",
        body: JSON.stringify({
          sender: userEmail,
          receiver,
          content: fileUrl,
        }),
      });
    } catch (err) {
      console.error("upload failed", err);
      alert("File upload failed");
    }
  };

  const sendReaction = (messageId, emoji) => {
    if (!stompClient?.connected) return;

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId) return m;
        const existing = safeParseReactions(m.reactions);
        const arr = Array.isArray(existing[emoji])
          ? [...existing[emoji]]
          : typeof existing[emoji] === "string"
          ? existing[emoji].split(",").filter(Boolean)
          : [];
        const already = arr.includes(userEmail);
        const newArr = already
          ? arr.filter((u) => u !== userEmail)
          : [...arr, userEmail];
        return { ...m, reactions: { ...existing, [emoji]: newArr } };
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

  const deleteMessageApi = async (messageId, forEveryone = false) => {
    try {
      if (forEveryone) {
        await axios.put(
          `${API_BASE}/deleteForEveryone/${messageId}/${userEmail}`
        );
        setMessages((prev) =>
          prev.map((m) =>
            m.id === messageId
              ? { ...m, deleted: true, content: "", reactions: {} }
              : m
          )
        );
      } else {
        await axios.put(
          `${API_BASE}/deleteForMe/${messageId}/${userEmail}`
        );
        setMessages((prev) => prev.filter((m) => m.id !== messageId));
      }
      setMenuFor(null);
    } catch (err) {
      console.error("delete failed", err);
    }
  };

  const copyMessage = async (txt) => {
    try {
      await navigator.clipboard.writeText(txt || "");
      setMenuFor(null);
    } catch {
      console.warn("Copy failed");
    }
  };

  const replyToMessage = (m) => {
    setReplyTo({ id: m.id, sender: m.sender, content: m.content });
    setMenuFor(null);
  };

  const forwardMessage = (m) => {
    const to = prompt("Forward to (email):");
    if (!to) return;
    const payload = {
      sender: userEmail,
      receiver: to,
      content: `[Fwd] ${m.content || ""}`,
    };
    stompClient.publish({
      destination: "/app/private-message",
      body: JSON.stringify(payload),
    });
    setMenuFor(null);
  };

  const startEdit = (m) => {
    if (m.sender !== userEmail) return;
    setEditFor(m.id);
    setEditText(m.content || "");
    setMenuFor(null);
  };

  const saveEdit = async (messageId) => {
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, content: editText, editedContent: editText } : m
      )
    );
    setEditFor(null);
    setEditText("");
    try {
      await axios.put(`${API_BASE}/edit/${messageId}`, {
        editedContent: editText,
      });
    } catch {}
  };

  const renderReactions = (msg) => {
    const reactionsObj = safeParseReactions(msg.reactions);
    return (
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {Object.entries(reactionsObj).map(([emoji, users]) => {
          const list = Array.isArray(users)
            ? users
            : typeof users === "string"
            ? users.split(",").filter(Boolean)
            : [];
          if (list.length === 0) return null;
          const me = list.includes(userEmail);
          return (
            <span
              key={emoji}
              onClick={() => sendReaction(msg.id, emoji)}
              title={list.join(", ")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                padding: "3px 8px",
                background: me ? "#dcf8c6" : "#f1f1f1",
                borderRadius: 12,
                marginRight: 6,
                cursor: "pointer",
                userSelect: "none",
                fontSize: 13,
              }}
            >
              <span style={{ marginRight: 6 }}>{emoji}</span>
              <strong style={{ fontSize: 12 }}>{list.length}</strong>
            </span>
          );
        })}
      </div>
    );
  };

  const renderTicks = (msg) => {
    if (msg.sender !== userEmail) return null;
    if (msg.status === "SEEN")
      return <span style={{ color: "#34B7F1", marginLeft: 6 }}>✓✓</span>;
    const receiverOnline = !!onlineMap[receiver];
    if (receiverOnline)
      return <span style={{ color: "#666", marginLeft: 6 }}>✓✓</span>;
    return <span style={{ color: "#666", marginLeft: 6 }}>✓</span>;
  };

  const partnerTyping = receiver && typingMap[receiver];

  /* ------------------- render ------------------- */
  return (
    <div
      style={{
        display: "flex",
        height: "100vh",
        fontFamily: "Inter, Roboto, Arial, sans-serif",
      }}
    >
      {/* Sidebar with search + chat list */}
      <div
        style={{
          width: 320,
          borderRight: "1px solid #eee",
          padding: 16,
          background: "#fafafa",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 14,
          }}
        >
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{userEmail}</div>
            <div style={{ fontSize: 12, color: "#2b9cff" }}>Online</div>
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
            style={{ padding: "6px 10px", borderRadius: 8 }}
          >
            Logout
          </button>
        </div>

        {/* search sidebar (existing component) */}
        onOpenChat={(roomIdFromSidebar, partnerEmail) => {
  // 1. Set active chat
  setRoomId(roomIdFromSidebar || null);
  setReceiver(partnerEmail);

  // 2. Ensure chat appears in rooms list
  setRooms((prev) => {
    const exists = prev.some((r) => r.receiver === partnerEmail);

    if (!exists) {
      return [
        {
          roomId: roomIdFromSidebar,
          receiver: partnerEmail,
          preview: "",
          unread: 0,
        },
        ...prev,
      ];
    }

    return prev.map((r) =>
      r.receiver === partnerEmail
        ? { ...r, roomId: roomIdFromSidebar }
        : r
    );
  });

  // 3. Cleanup UI states
  setMenuFor(null);
  setReactionBarFor(null);
  setHoveredMsg(null);
  setReplyTo(null);
  setEditFor(null);

  // 4. Reload room list from backend later to refresh preview/unread
  if (userEmail) loadRooms(userEmail);
}}


        <div style={{ fontSize: 13, color: "#555", marginBottom: 8 }}>Chats</div>

        <div style={{ overflowY: "auto", height: "calc(100vh - 220px)" }}>
          {rooms.length === 0 && (
            <div style={{ padding: 10, opacity: 0.6 }}>No chats yet</div>
          )}

          {rooms.map((r, idx) => (
            <ChatListItem
              key={idx}
              r={r}
              online={!!onlineMap[r.receiver]}
              active={r.receiver === receiver}
              onClick={() => {
                setRoomId(r.roomId || null);
                setReceiver(r.receiver);
                setMenuFor(null);
                setReactionBarFor(null);
                setHoveredMsg(null);
                setReplyTo(null);
                setEditFor(null);
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

      {/* Chat Panel */}
      <div
        style={{
          background: "#fbfcfd",
          flex: 1,
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: 14,
            borderBottom: "1px solid #eee",
            display: "flex",
            gap: 12,
            alignItems: "center",
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

        {/* Messages */}
        <div
          style={{
            flex: 1,
            padding: 18,
            overflowY: "auto",
            background: "#fbfcfd",
          }}
          onClick={() => {
            setMenuFor(null);
            setReactionBarFor(null);
            setHoveredMsg(null);
          }}
        >
          <div style={{ maxWidth: 900, margin: "0 auto" }}>
            {messages.map((msg) => {
              if (
                Array.isArray(msg.deletedFor) &&
                msg.deletedFor.includes(userEmail)
              )
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
                        maxWidth: "78%",
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

        {/* Composer */}
        <div
          style={{
            padding: 12,
            borderTop: "1px solid #eee",
            display: "flex",
            gap: 8,
            alignItems: "center",
          }}
        >
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: "none" }}
            onChange={handleFileSelect}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{ padding: 8 }}
          >
            📎
          </button>

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
                <strong>
                  {replyTo.sender === userEmail ? "You" : replyTo.sender}
                </strong>
                : {String(replyTo.content).slice(0, 120)}
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
                receiver
                  ? `Message ${receiver}`
                  : "Select a chat to start messaging"
              }
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 8,
                border: "1px solid #ddd",
              }}
              disabled={!receiver}
            />
          </div>

          <button
            onClick={sendMessage}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              background: "#007bff",
              color: "#fff",
              border: "none",
            }}
          >
            Send
          </button>
        </div>
      </div>

      {/* Image lightbox */}
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
            zIndex: 4000,
          }}
        >
          <img
            src={previewImage}
            alt="preview"
            style={{ maxWidth: "92%", maxHeight: "92%", borderRadius: 8 }}
          />
        </div>
      )}
    </div>
  );
}
