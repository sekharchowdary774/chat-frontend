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

  // Perform search when query changes
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // debounce API call
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      chatApi
        .get(`/api/users/search?query=${query}&exclude=${loggedEmail}`)
        .then((res) => {
          setResults(res.data || []);
        })
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

  const handleUserClick = async (user) => {
    // Prevent double clicks
    if (clickedUser === user.email) return;
    
    setClickedUser(user.email);
    
    try {
      // Try to get existing room or create it
      const roomResponse = await chatApi.get(
        `/api/chat/room/${loggedEmail}/${user.email}`
      );
      
      // If room exists or was created successfully
      if (roomResponse.data) {
        console.log("Room ready:", roomResponse.data);
        onOpenChat(user.email);
        setQuery("");
        setResults([]);
      }
    } catch (error) {
      console.error("Error with chat room:", error);
      
      // If GET fails (404), try to create the room with POST
      if (error.response?.status === 404) {
        try {
          await chatApi.post("/api/chat/room", {
            sender: loggedEmail,
            receiver: user.email
          });
          
          // After creating, open the chat
          onOpenChat(user.email);
          setQuery("");
          setResults([]);
        } catch (createError) {
          console.error("Failed to create room:", createError);
          alert("Unable to start chat. Please try again.");
        }
      } else {
        alert("Unable to start chat. Please try again.");
      }
    } finally {
      // Reset clicked state after a delay
      setTimeout(() => setClickedUser(null), 1000);
    }
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

      {/* Hint */}
      {!query && results.length === 0 && (
        <div className="search-hint">
          🔍 Search for a username or email to start chatting
        </div>
      )}

      {loading && <div className="search-status">Searching...</div>}

      {!loading && query && results.length === 0 && (
        <div className="search-status">No users found</div>
      )}

      {/* Results */}
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