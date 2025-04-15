import React, { useState } from "react";
import { useNavigate } from "react-router-dom";

export default function JoinPromptQuest() {
  const [playerName, setPlayerName] = useState("");
  const [sessionId, setSessionId] = useState("");
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!playerName || !sessionId) return;
    localStorage.setItem("promptQuestName", playerName);
    navigate(`/prompt-quest/game/${sessionId}`);
  };

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white flex flex-col items-center justify-center px-6 py-16">
      <div className="max-w-md w-full bg-neutral-900 border border-neutral-700 rounded-xl p-6">
        <h1 className="text-2xl font-bold mb-4 text-center">🎮 Join Prompt Quest</h1>
        <p className="text-sm text-gray-400 mb-6 text-center">
          Enter your name and the game session ID to begin.
        </p>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <input
            type="text"
            placeholder="Your name"
            className="bg-neutral-800 border border-neutral-600 text-white rounded-lg p-3"
            value={playerName}
            onChange={(e) => setPlayerName(e.target.value)}
            required
          />
          <input
            type="text"
            placeholder="Session ID"
            className="bg-neutral-800 border border-neutral-600 text-white rounded-lg p-3"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            required
          />

          <button
            type="submit"
            className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-lg mt-2"
          >
            🚀 Join Game
          </button>
        </form>
      </div>
    </main>
  );
}
