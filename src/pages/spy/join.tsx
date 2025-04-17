// File: src/pages/spy/join.tsx
import { createSignal, Show, For } from "solid-js";
import { db } from "../../lib/firebase";
import {
  ref,
  set,
  onValue,
  update,
  get,
} from "firebase/database";

const JoinSpyGame = () => {
  const [name, setName] = createSignal("");
  const [sessionId, setSessionId] = createSignal("");
  const [joined, setJoined] = createSignal(false);
  const [playerId, setPlayerId] = createSignal("");
  const [players, setPlayers] = createSignal<any[]>([]);
  const [hostId, setHostId] = createSignal("");

  const isHost = () => playerId() === hostId();

  const handleJoin = async () => {
    if (!name().trim() || !sessionId().trim()) return;
    const id = crypto.randomUUID();
    setPlayerId(id);

    const sessionRef = ref(db, `spySessions/${sessionId()}`);
    const sessionSnap = await get(sessionRef);
    const isNewSession = !sessionSnap.exists();

    await set(ref(db, `spySessions/${sessionId()}/players/${id}`), {
      name: name(),
      eliminated: false,
      response: "",
      vote: "",
      joinedAt: Date.now(),
    });

    if (isNewSession) {
      await update(sessionRef, {
        hostId: id,
        started: false,
        round: 1,
        responsesRevealed: false,
        votingComplete: false,
      });
    }

    setJoined(true);

    const playersRef = ref(db, `spySessions/${sessionId()}/players`);
    onValue(playersRef, (snap) => {
      const data = snap.val() || {};
      const formatted = Object.entries(data).map(([id, val]: any) => ({
        id,
        ...val,
      }));
      setPlayers(formatted.sort((a, b) => a.joinedAt - b.joinedAt));
    });

    const hostRef = ref(db, `spySessions/${sessionId()}/hostId`);
    onValue(hostRef, (snap) => {
      setHostId(snap.val());
    });
  };

  const handleStartGame = async () => {
    const all = players();
    const ids = all.map((p) => p.id);
    const imposterId = ids[Math.floor(Math.random() * ids.length)];

    const updates: any = {};
    ids.forEach((id) => {
      updates[id] = {
        ...all.find((p) => p.id === id),
        role: id === imposterId ? "imposter" : "collaborator",
        response: "",
        vote: "",
        eliminated: false,
      };
    });

    await update(ref(db, `spySessions/${sessionId()}/players`), updates);
    await update(ref(db, `spySessions/${sessionId()}`), {
      started: true,
      responsesRevealed: false,
      votingComplete: false,
    });

    window.location.href = `/spy/game?sessionId=${sessionId()}&playerId=${playerId()}`;
  };

  return (
    <main class="p-6 text-white max-w-xl mx-auto">
      <h1 class="text-3xl font-bold text-center mb-6">🕵️ Spy Among Prompts</h1>

      <Show when={!joined()}>
        <div class="space-y-4">
          <input
            class="w-full p-2 rounded bg-neutral-800 border border-neutral-600"
            placeholder="Enter your name"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
          <input
            class="w-full p-2 rounded bg-neutral-800 border border-neutral-600"
            placeholder="Session ID"
            value={sessionId()}
            onInput={(e) => setSessionId(e.currentTarget.value)}
          />
          <button
            class="w-full bg-blue-600 hover:bg-blue-700 py-2 rounded"
            disabled={!name().trim() || !sessionId().trim()}
            onClick={handleJoin}
          >
            🚀 Join Game
          </button>
        </div>
      </Show>

      <Show when={joined()}>
        <h2 class="text-lg font-semibold mt-6">Players Joined:</h2>
        <For each={players()}>
          {(p) => (
            <div class="flex justify-between py-1 border-b border-neutral-700 text-sm">
              <span>{p.name}</span>
              <span>{p.id === hostId() ? "👑 Host" : ""}</span>
            </div>
          )}
        </For>

        <Show when={isHost() && players().length >= 4}>
          <button
            class="w-full mt-6 bg-green-600 hover:bg-green-700 py-2 rounded"
            onClick={handleStartGame}
          >
            🎬 Start Game
          </button>
        </Show>

        <Show when={!isHost()}>
          <p class="text-sm text-neutral-400 mt-4 italic text-center">
            Waiting for host to start the game...
          </p>
        </Show>
      </Show>
    </main>
  );
};

export default JoinSpyGame;
