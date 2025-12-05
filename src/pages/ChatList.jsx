import React, { useEffect, useState } from "react";
import axios from "axios";

const API = "https://chat-backened-2.onrender.com/api/chat";

export default function ChatList({ userEmail, activeReceiver, onSelectChat }) {
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    if (!userEmail) return;
    loadRooms();
  }, [userEmail]);

  async function loadRooms() {
    try {
      const { data } = await axios.get(`${API}/rooms/${userEmail}`);

      const normalized = (data || []).map((r) => {
        const other =
          r.userA === userEmail ? r.userB :
          r.userB === userEmail ? r.userA :
          null;

        return {
          roomId: r.roomId,
          receiver: other,
          preview: r.preview || "",
          unread: r.unread || 0,
        };
      });

      setRooms(normalized.filter((r) => r.receiver));
    } catch (e) {
      console.error("Failed loading rooms", e);
    }
  }

  return (
    <div
      style={{
        width: 260,
        borderRight: "1px solid #ddd",
        padding: 12,
        height: "100vh",
        overflowY: "auto",
      }}
    >
      <h3 style={{ marginBottom: 12 }}>Chats</h3>

      {rooms.length === 0 && (
        <div style={{ opacity: 0.6 }}>No chats yet</div>
      )}

      {rooms.map((r, i) => (
        <div
          key={i}
          onClick={() => onSelectChat(r.roomId, r.receiver)}
          style={{
            padding: 12,
            marginBottom: 8,
            borderRadius: 8,
            cursor: "pointer",
            background: activeReceiver === r.receiver ? "#e6f8e8" : "#f5f5f5",
          }}
        >
          <div style={{ fontWeight: 700 }}>{r.receiver}</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            {r.preview || ""}
          </div>

          {r.unread > 0 && (
            <div
              style={{
                marginTop: 4,
                background: "#25D366",
                color: "white",
                display: "inline-block",
                padding: "2px 8px",
                borderRadius: 12,
                fontSize: 12,
                fontWeight: 700,
              }}
            >
              {r.unread}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
