import React, { useState, useEffect, useRef } from "react";
import API from "../services/api";
import "../styles/UserSearchSidebar.css"; // <- Create this CSS file or embed styles where you prefer

function UserSearchSidebar({ onOpenChat }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const loggedEmail = localStorage.getItem("email");

  const debounceRef = useRef(null);

  // handle search input
  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      setLoading(false);
      return;
    }

    setLoading(true);

    // debounce to avoid spamming server
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      API.get(`/users/search?query=${query}&exclude=${loggedEmail}`)
        .then((res) => {
          setResults(res.data || []);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, loggedEmail]);

  const handleUserClick = (user) => {
    onOpenChat(user.email); // parent component will create/open chat
  };

  return (
    <div className="search-sidebar">
      <input
        type="text"
        placeholder="Search username or email..."
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
            className="search-result-item"
            onClick={() => handleUserClick(user)}
          >
            <div className="result-username">
              {user.username || user.email}
            </div>
            <div className="result-email">{user.email}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default UserSearchSidebar;
