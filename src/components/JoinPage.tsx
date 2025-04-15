// File: src/pages/prompt-quest/game/[sessionId].tsx
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { db } from "../../../lib/firebase";
import { ref, set, onValue, update } from "firebase/database";

const GameRoom = () => {
  const { sessionId } = useParams();
  const playerName = localStorage.getItem("promptQuestName") || "";
  const playerId = crypto.randomUUID();

  const [players, setPlayers] = useState<any[]>([]);
  const [prompt, setPrompt] = useState<string>("");
  const [response, setResponse] = useState<string>("");
  const [hasSubmitted, setHasSubmitted] = useState(false);

  useEffect(() => {
    if (!playerName || !sessionId) return;

    const playerRef = ref(db, `sessions/${sessionId}/players/${playerId}`);
    set(playerRef, {
      name: playerName,
      responded: false,
      readyNextRound: false,
    });

    const playersRef = ref(db, `sessions/${sessionId}/players`);
    onValue(playersRef, (snapshot) => {
      const data = snapshot.val() || {};
      const formatted = Object.entries(data).map(([id, val]: any) => ({ id, ...val }));
      setPlayers(formatted);
    });

    const promptRef = ref(db, `sessions/${sessionId}/prompt`);
    onValue(promptRef, (snapshot) => {
      setPrompt(snapshot.val() || "");
    });
  }, [sessionId, playerName]);

  const handleSubmit = async () => {
    const responseRef = ref(db, `sessions/${sessionId}/responses/${playerId}`);
    await set(responseRef, response);
    const playerRef = ref(db, `sessions/${sessionId}/players/${playerId}`);
    await update(playerRef, { responded: true });
    setHasSubmitted(true);
  };

  return (
    <main className="min-h-screen bg-[#0d0d0d] text-white p-6 flex flex-col md:flex-row gap-6">
      <aside className="w-full md:w-1/4 bg-neutral-900 border border-neutral-700 rounded-xl p-4 space-y-3">
        <h2 className="text-lg font-semibold mb-2">🧑‍🤝‍🧑 Players</h2>
        {players.map((player) => (
          <div className="flex items-center justify-between text-sm" key={player.id}>
            <span>{player.name}</span>
            <span className="text-xs text-gray-400">
              {player.responded ? "✅ Responded" : "⌛ Waiting"}
            </span>
          </div>
        ))}
      </aside>

      <section className="flex-1 bg-neutral-900 border border-neutral-700 rounded-xl p-6">
        <h1 className="text-2xl font-bold mb-4">🎯 Quest Prompt</h1>
        <p className="text-gray-300 mb-6">{prompt || "Waiting for prompt to load..."}</p>

        <textarea
          className="w-full bg-neutral-800 border border-neutral-600 text-white rounded-lg p-3 min-h-[120px]"
          placeholder="Write your response here..."
          value={response}
          onChange={(e) => setResponse(e.target.value)}
          disabled={hasSubmitted || !prompt}
        />

        <button
          className="mt-4 bg-red-600 hover:bg-red-700 py-2 px-4 rounded-lg disabled:opacity-50"
          onClick={handleSubmit}
          disabled={hasSubmitted || !response.trim()}
        >
          {hasSubmitted ? "✔️ Submitted" : "🚀 Submit Response"}
        </button>
      </section>
    </main>
  );
};

export default GameRoom;
