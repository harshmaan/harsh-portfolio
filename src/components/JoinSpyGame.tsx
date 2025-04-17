import { createSignal, Show, For, createEffect } from "solid-js";
import { db } from "../lib/firebase";
import { ref, set, onValue, remove } from "firebase/database";

const JoinSpyGame = () => {
  const [name, setName] = createSignal("");
  const [sessionId, setSessionId] = createSignal("");
  const [joined, setJoined] = createSignal(false);
  const [playerId, setPlayerId] = createSignal("");
  const [players, setPlayers] = createSignal<any[]>([]);
  const [role, setRole] = createSignal<"Imposter" | "Collaborator" | null>(null);
  const [prompt, setPrompt] = createSignal("");
  const [personalPrompt, setPersonalPrompt] = createSignal("");
  const [response, setResponse] = createSignal("");
  const [hasSubmitted, setHasSubmitted] = createSignal(false);
  const [responses, setResponses] = createSignal<Record<string, string>>({});
  const [votingPhase, setVotingPhase] = createSignal(false);
  const [votes, setVotes] = createSignal<Record<string, string>>({});
  const [eliminated, setEliminated] = createSignal<string | null>(null);
  const [gameOver, setGameOver] = createSignal(false);
  const [winner, setWinner] = createSignal<"Imposter" | "Collaborators" | null>(null);

  const isHost = () => players()[0]?.id === playerId();

  const handleJoin = async () => {
    const id = crypto.randomUUID();
    setPlayerId(id);
    await set(ref(db, `spy/${sessionId()}/players/${id}`), {
      name: name(),
      joinedAt: Date.now(),
    });
    setJoined(true);

    const playersRef = ref(db, `spy/${sessionId()}/players`);
    onValue(playersRef, (snapshot) => {
      const data = snapshot.val() || {};
      const sorted = Object.entries(data).sort((a, b) => a[1].joinedAt - b[1].joinedAt);
      setPlayers(sorted.map(([id, val]: any) => ({ id, ...val })));
    });

    const roleRef = ref(db, `spy/${sessionId()}/roles/${id}`);
    onValue(roleRef, (snap) => {
      if (snap.exists()) setRole(snap.val());
    });

    const personalPromptRef = ref(db, `spy/${sessionId()}/personalPrompts/${id}`);
    onValue(personalPromptRef, (snap) => {
      if (snap.exists()) setPersonalPrompt(snap.val());
    });

    const promptRef = ref(db, `spy/${sessionId()}/basePrompt`);
    onValue(promptRef, (snap) => {
      if (snap.exists()) setPrompt(snap.val());
    });

    const responsesRef = ref(db, `spy/${sessionId()}/responses`);
    onValue(responsesRef, (snap) => {
      const data = snap.val() || {};
      setResponses(data);
      if (Object.keys(data).length === players().length) {
        setVotingPhase(true);
      }
    });

    const votesRef = ref(db, `spy/${sessionId()}/votes`);
    onValue(votesRef, (snap) => {
      setVotes(snap.val() || {});
    });

    const eliminatedRef = ref(db, `spy/${sessionId()}/eliminated`);
    onValue(eliminatedRef, (snap) => {
      if (snap.exists()) setEliminated(snap.val());
    });
  };

  const generatePrompt = async () => {
    const res = await fetch("/api/spy-prompt");
    const { basePrompt, imposterPrompt } = await res.json();

    await set(ref(db, `spy/${sessionId()}/basePrompt`), basePrompt);

    const imposterIndex = Math.floor(Math.random() * players().length);
    await Promise.all(
      players().map(async (player, idx) => {
        const role = idx === imposterIndex ? "Imposter" : "Collaborator";
        const promptToSend = idx === imposterIndex ? imposterPrompt : basePrompt;

        await set(ref(db, `spy/${sessionId()}/roles/${player.id}`), role);
        await set(ref(db, `spy/${sessionId()}/personalPrompts/${player.id}`), promptToSend);
      })
    );
  };

  const handleSubmitResponse = async () => {
    await set(ref(db, `spy/${sessionId()}/responses/${playerId()}`), response());
    setHasSubmitted(true);
  };

  const handleVote = async (targetId: string) => {
    await set(ref(db, `spy/${sessionId()}/votes/${playerId()}`), targetId);
  };

  const tallyVotesAndEliminate = async () => {
    const allVotes = votes();
    const voteCounts: Record<string, number> = {};

    Object.values(allVotes).forEach((voteId) => {
      voteCounts[voteId] = (voteCounts[voteId] || 0) + 1;
    });

    const sorted = Object.entries(voteCounts).sort((a, b) => b[1] - a[1]);
    const [topPlayerId] = sorted[0];
    await set(ref(db, `spy/${sessionId()}/eliminated`), topPlayerId);

    // Check if the eliminated was the imposter
    const roleRef = ref(db, `spy/${sessionId()}/roles/${topPlayerId}`);
    onValue(roleRef, (snap) => {
      if (!snap.exists()) return;
      const eliminatedRole = snap.val();
      if (eliminatedRole === "Imposter") {
        setWinner("Collaborators");
        setGameOver(true);
      } else {
        const remaining = players().length - 1;
        if (remaining <= 2) {
          setWinner("Imposter");
          setGameOver(true);
        }
      }
    }, { onlyOnce: true });
  };

  createEffect(() => {
    if (
      votingPhase() &&
      Object.keys(votes()).length === players().length &&
      !eliminated()
    ) {
      tallyVotesAndEliminate();
    }
  });

  const startNextRound = async () => {
    const basePath = `spy/${sessionId()}`;
    await Promise.all([
      remove(ref(db, `${basePath}/basePrompt`)),
      remove(ref(db, `${basePath}/roles`)),
      remove(ref(db, `${basePath}/personalPrompts`)),
      remove(ref(db, `${basePath}/responses`)),
      remove(ref(db, `${basePath}/votes`)),
      remove(ref(db, `${basePath}/eliminated`)),
    ]);

    setVotingPhase(false);
    setHasSubmitted(false);
    setPrompt("");
    setPersonalPrompt("");
    setResponse("");
    setEliminated(null);
    setGameOver(false);
    setWinner(null);
  };

  return (
    <main class="p-6 max-w-4xl mx-auto text-white">
      <Show when={!joined()}>
        {/* join form omitted for brevity */}
      </Show>

      <Show when={joined()}>
        {/* Player lobby and game sections omitted for brevity */}

        <Show when={eliminated()}>
          <div class="mt-6 p-4 border border-red-600 bg-neutral-900 rounded">
            ❌ <strong>{players().find(p => p.id === eliminated())?.name}</strong> was eliminated!
          </div>
        </Show>

        <Show when={gameOver()}>
          <div class="mt-8 p-6 text-center bg-neutral-800 border border-neutral-600 rounded">
            <h2 class="text-2xl font-bold mb-2">🎮 Game Over</h2>
            <p class="text-lg text-green-400">
              {winner() === "Collaborators"
                ? "✅ Collaborators win! The Imposter was caught."
                : "😈 Imposter wins! Only 2 players remain."}
            </p>
            <Show when={isHost()}>
              <button
                onClick={startNextRound}
                class="mt-4 bg-blue-600 hover:bg-blue-700 py-2 px-4 rounded"
              >
                🔁 Play Again
              </button>
            </Show>
          </div>
        </Show>

        <Show when={eliminated() && !gameOver() && isHost()}>
          <button
            onClick={startNextRound}
            class="mt-4 bg-blue-600 hover:bg-blue-700 py-2 px-4 rounded"
          >
            🔄 Start Next Round
          </button>
        </Show>
      </Show>
    </main>
  );
};

export default JoinSpyGame;
