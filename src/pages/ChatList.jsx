import React, { useEffect, useState } from "react";
import axios from "axios";

function ChatList({ userEmail, onSelectReceiver }) {
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    if (!userEmail) return;

    axios
      .get(`http://localhost:8080/api/chat/rooms/${userEmail}`)
      .then((res) => setRooms(res.data))
      .catch((err) => console.error("Error loading chat rooms", err));
  }, [userEmail]);

  return (
    <div style={{
      width: "200px",
      borderRight: "1px solid #ccc",
      padding: "10px",
      height: "100vh"
    }}>
      <h3>Chats</h3>

      {rooms.length === 0 && (
        <div style={{ fontSize: 14, opacity: 0.6 }}>No chats yet</div>
      )}

      {rooms.map((r, i) => (
        <div
          key={i}
          style={{
            padding: "10px",
            background: "#f5f5f5",
            marginBottom: "6px",
            cursor: "pointer",
            borderRadius: "6px",
          }}
          onClick={() => onSelectReceiver(r.receiver)}
        >
          {r.receiver}
        </div>
      ))}
    </div>
  );
}

export default ChatList;
