import React, { useState, useEffect, useRef } from "react";
import { chatApi } from "../services/chatApi";
import "../styles/UserSearchSidebar.css";

function UserSearchSidebar({ onOpenChat }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [clickedUser, setClickedUser] = useState(null);
  const loggedEmail = localStorage.getItem("email");

  const debounceRef = useRef(null);

  // SEARCH USERS
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      chatApi
        .get(`/api/users/search?query=${query}&exclude=${loggedEmail}`)
        .then((res) => setResults(res.data || []))
        .catch((err) => {
          console.error("Search failed:", err);
          setResults([]);
        })
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, loggedEmail]);

  // HANDLE USER CLICK
  const handleUserClick = async (user) => {
    if (clickedUser === user.email) return;

    setClickedUser(user.email);

    try {
      // 1️⃣ Try to fetch existing room
      const roomRes = await chatApi.get(
        `/api/chat/room/${loggedEmail}/${user.email}`
      );

      if (roomRes.data?.roomId) {
        const room = roomRes.data;

        // OPEN THE CHAT WITH REAL ROOM ID
        onOpenChat(room.roomId, user.email);

        setQuery("");
        setResults([]);
        return;
      }
    } catch (error) {
      console.warn("Room fetch failed → trying to create:", error);

      // 2️⃣ If not found → backend returns 404 → create new room
      if (error.response?.status === 404) {
        try {
          const createRes = await chatApi.post("/api/chat/room", {
            sender: loggedEmail,
            receiver: user.email,
          });

          const newRoom = createRes.data;

          // OPEN THE NEW ROOM
          onOpenChat(newRoom.roomId, user.email);

          setQuery("");
          setResults([]);
          return;
        } catch (createError) {
          console.error("Failed to create room:", createError);
          alert("Unable to start chat. Please try again.");
        }
      } else {
        alert("Unable to start chat. Please try again.");
      }
    }

    setTimeout(() => setClickedUser(null), 1000);
  };

  return (
    <div className="search-sidebar">
      <input
        type="text"
        placeholder="Search username or email…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="search-input"
        autoComplete="off"
      />

      {!query && results.length === 0 && (
        <div className="search-hint">
          🔍 Search for a username or email to start chatting
        </div>
      )}

      {loading && <div className="search-status">Searching...</div>}

      {!loading && query && results.length === 0 && (
        <div className="search-status">No users found</div>
      )}

      <div className="search-results">
        {results.map((user) => (
          <div
            key={user.id}
            className={`search-result-item ${
              clickedUser === user.email ? "clicking" : ""
            }`}
            onClick={() => handleUserClick(user)}
          >
            <div className="result-username">{user.username || user.email}</div>
            <div className="result-email">{user.email}</div>

            {clickedUser === user.email && (
              <span className="result-loading">⏳</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default UserSearchSidebar;
