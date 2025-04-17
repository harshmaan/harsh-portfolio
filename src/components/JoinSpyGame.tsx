import { createSignal, Show, For, createEffect } from "solid-js";
import { db } from "../lib/firebase";
import {
  ref,
  set,
  onValue,
  remove,
  get,
} from "firebase/database";

/**
 * JoinSpyGame – single‑file SolidJS component that hosts & plays a full
 * “Spy Among Prompts” match‑flow.
 *
 * Key concepts
 * ─────────────
 * • matchId  – changes only when an ENTIRE match (set of rounds) restarts
 * • roundId  – changes every time we continue the current match with a new round
 *
 * A match ends and winner is written when:
 *   • Imposter is eliminated  → Collaborators win
 *   • Only two players remain → Imposter wins
 */
const JoinSpyGame = () => {
  /* ─────────────── state ─────────────── */
  const [name, setName] = createSignal("");
  const [sessionId, setSessionId] = createSignal("");
  const [joined, setJoined] = createSignal(false);
  const [playerId, setPlayerId] = createSignal("");
  const [players, setPlayers] = createSignal<any[]>([]);
  const [role, setRole] = createSignal<"Imposter" | "Collaborator" | null>(
    null
  );
  const [prompt, setPrompt] = createSignal("");
  const [personalPrompt, setPersonalPrompt] = createSignal("");
  const [response, setResponse] = createSignal("");
  const [hasSubmitted, setHasSubmitted] = createSignal(false);
  const [responses, setResponses] = createSignal<Record<string, string>>({});
  const [votingPhase, setVotingPhase] = createSignal(false);
  const [votes, setVotes] = createSignal<Record<string, string>>({});
  const [eliminated, setEliminated] = createSignal<string | null>(null);
  const [gameOver, setGameOver] = createSignal(false);
  const [winner, setWinner] = createSignal<
    "Imposter" | "Collaborators" | null
  >(null);

  const isHost = () => players()[0]?.id === playerId();
  const base = () => `spy/${sessionId()}`;

  /* ─────────────── join / listeners ─────────────── */
  const handleJoin = async () => {
    const id = crypto.randomUUID();
    setPlayerId(id);
    await set(ref(db, `${base()}/players/${id}`), {
      name: name(),
      joinedAt: Date.now(),
    });
    setJoined(true);

    /* players list (ordered by join time) */
    onValue(ref(db, `${base()}/players`), (snapshot) => {
      const data = snapshot.val() || {};
      const sorted = Object.entries(data).sort(
        // @ts‑ignore – Firebase returns any
        // eslint‑disable-next-line @typescript-eslint/ban-ts-comment
        //@ts-ignore
        (a, b) => a[1].joinedAt - b[1].joinedAt
      );
      setPlayers(sorted.map(([pid, val]: any) => ({ id: pid, ...val })));
    });

    /* personal role & prompt */
    onValue(ref(db, `${base()}/roles/${id}`), (snap) => {
      if (snap.exists()) setRole(snap.val());
    });

    onValue(ref(db, `${base()}/personalPrompts/${id}`), (snap) => {
      if (snap.exists()) setPersonalPrompt(snap.val());
    });

    /* base prompt */
    onValue(ref(db, `${base()}/basePrompt`), (snap) => {
      if (snap.exists()) setPrompt(snap.val());
    });

    /* responses */
    onValue(ref(db, `${base()}/responses`), (snap) => {
      const data = snap.val() || {};
      setResponses(data);
      if (Object.keys(data).length === players().length) {
        setVotingPhase(true);
      }
    });

    /* votes */
    onValue(ref(db, `${base()}/votes`), (snap) => {
      setVotes(snap.val() || {});
    });

    /* match end flags */
    onValue(ref(db, `${base()}/gameOver`), (snap) => {
      if (snap.exists()) setGameOver(snap.val());
    });
    onValue(ref(db, `${base()}/winner`), (snap) => {
      if (snap.exists()) setWinner(snap.val());
    });

    /* intra‑match ROUND reset */
    onValue(ref(db, `${base()}/roundId`), (snap) => {
      if (!snap.exists()) return;
      /* clear round‑scoped client state */
      setVotingPhase(false);
      setHasSubmitted(false);
      setPrompt("");
      setPersonalPrompt("");
      setResponse("");
      setEliminated(null);
      setResponses({});
      setVotes({});
    });

    /* full MATCH reset */
    onValue(ref(db, `${base()}/matchId`), (snap) => {
      if (!snap.exists()) return;
      /* wipe absolutely everything except name / session / id */
      setVotingPhase(false);
      setHasSubmitted(false);
      setPrompt("");
      setPersonalPrompt("");
      setResponse("");
      setEliminated(null);
      setGameOver(false);
      setWinner(null);
      setResponses({});
      setVotes({});
    });
  };

  /* ─────────────── host actions ─────────────── */
  const generatePrompt = async () => {
    const res = await fetch("/api/spy-prompt");
    const { basePrompt, imposterPrompt } = await res.json();

    await set(ref(db, `${base()}/basePrompt`), basePrompt);

    const imposterIdx = Math.floor(Math.random() * players().length);
    await Promise.all(
      players().map(async (p, idx) => {
        const roleName = idx === imposterIdx ? "Imposter" : "Collaborator";
        const promptToSend = idx === imposterIdx ? imposterPrompt : basePrompt;

        await set(ref(db, `${base()}/roles/${p.id}`), roleName);
        await set(
          ref(db, `${base()}/personalPrompts/${p.id}`),
          promptToSend
        );
      })
    );
  };

  const startNextRound = async () => {
    /* remove round‑scoped data ONLY */
    await Promise.all([
      remove(ref(db, `${base()}/basePrompt`)),
      remove(ref(db, `${base()}/roles`)),
      remove(ref(db, `${base()}/personalPrompts`)),
      remove(ref(db, `${base()}/responses`)),
      remove(ref(db, `${base()}/votes`)),
      remove(ref(db, `${base()}/eliminated`)),
    ]);

    // signal round reset
    await set(ref(db, `${base()}/roundId`), crypto.randomUUID());
  };

  /* ─────────────── player actions ─────────────── */
  const handleSubmitResponse = async () => {
    await set(ref(db, `${base()}/responses/${playerId()}`), response());
    setHasSubmitted(true);
  };

  const handleVote = async (targetId: string) => {
    await set(ref(db, `${base()}/votes/${playerId()}`), targetId);
  };

  /* ─────────────── vote tally / elimination ─────────────── */
  const tallyVotesAndEliminate = async () => {
    const allVotes = votes();
    const counts: Record<string, number> = {};
    Object.values(allVotes).forEach((id) => {
      counts[id] = (counts[id] || 0) + 1;
    });

    const [topPlayerId] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
    await set(ref(db, `${base()}/eliminated`), topPlayerId);

    const roleSnap = await get(ref(db, `${base()}/roles/${topPlayerId}`));
    const eliminatedRole = roleSnap.val();
    const remaining = players().length - 1;

    if (eliminatedRole === "Imposter") {
      await set(ref(db, `${base()}/winner`), "Collaborators");
      await set(ref(db, `${base()}/gameOver`), true);
    } else if (remaining <= 2) {
      await set(ref(db, `${base()}/winner`), "Imposter");
      await set(ref(db, `${base()}/gameOver`), true);
    } else if (isHost()) {
      // match continues → next round
      await startNextRound();
      await generatePrompt();
    }
  };

  /* trigger tally when all votes are in */
  createEffect(() => {
    if (
      votingPhase() &&
      Object.keys(votes()).length === players().length &&
      !eliminated()
    ) {
      tallyVotesAndEliminate();
    }
  });

  /* ─────────────── UI ─────────────── */
  return (
    <main class="p-6 max-w-4xl mx-auto text-white">
      {/* join screen */}
      <Show when={!joined()}>
        <div class="space-y-4 text-center">
          <h1 class="text-3xl font-bold">🕵️ Join Spy Among Prompts</h1>
          <input
            class="w-full p-2 bg-neutral-800 border border-neutral-600 rounded"
            placeholder="Name"
            value={name()}
            onInput={(e) => setName(e.currentTarget.value)}
          />
          <input
            class="w-full p-2 bg-neutral-800 border border-neutral-600 rounded"
            placeholder="Session ID"
            value={sessionId()}
            onInput={(e) => setSessionId(e.currentTarget.value)}
          />
          <button
            onClick={handleJoin}
            class="bg-blue-600 hover:bg-blue-700 py-2 px-4 rounded"
          >
            🚀 Join Game
          </button>
        </div>
      </Show>

      {/* lobby / game screen */}
      <Show when={joined()}>
        <h2 class="text-xl font-semibold mb-2">Welcome, {name()}!</h2>

        {/* players list */}
        <div class="mb-6 border border-neutral-700 p-4 rounded bg-neutral-800">
          <h3 class="text-lg font-semibold mb-2">👥 Players in Lobby</h3>
          <For each={players()}>
            {(p) => {
              const isSelf = p.id === playerId();
              const hasPrompt = !!personalPrompt();
              const roleDisplay =
                isSelf && role()
                  ? ` — ${role()}`
                  : hasPrompt
                  ? "— Role Hidden"
                  : null;
              const hasResp = hasPrompt && responses()[p.id];
              return (
                <div class="text-sm text-gray-200 flex justify-between items-center mb-1">
                  <div>
                    {p.name}
                    {isSelf && " (You)"}
                    {roleDisplay && (
                      <span class="text-xs text-gray-400 italic ml-1">
                        {roleDisplay}
                      </span>
                    )}
                  </div>
                  {hasPrompt && (
                    <span
                      class={`text-xs font-medium ${
                        hasResp ? "text-green-400" : "text-yellow-400 animate-pulse"
                      }`}
                    >
                      {hasResp ? "✅ Responded" : "⌛ Waiting"}
                    </span>
                  )}
                </div>
              );
            }}
          </For>
        </div>

        {/* host start button */}
        <Show
          when={
            isHost() &&
            players().length >= 2 &&
            !prompt() &&
            !personalPrompt() &&
            !gameOver()
          }
        >
          <button
            onClick={generatePrompt}
            class="mb-4 bg-green-600 hover:bg-green-700 py-2 px-4 rounded"
          >
            🎭 Start Match
          </button>
        </Show>

        {/* waiting notice for others */}
        <Show
          when={
            !isHost() &&
            players().length >= 2 &&
            !prompt() &&
            !personalPrompt() &&
            !gameOver()
          }
        >
          <div class="text-sm text-yellow-400 text-center mb-4">
            ⏳ Waiting for host to start the match…
          </div>
        </Show>

        {/* personal prompt / response area (active players only) */}
        <Show when={personalPrompt() && winner() === null}>
          {/* eliminated notice */}
          <Show when={eliminated() === playerId()}>
            <p class="mb-4 text-yellow-400 italic">
              ❌ You’ve been eliminated. You cannot submit a response this round.
            </p>
          </Show>

          {/* response form */}
          <Show when={eliminated() !== playerId()}>
            <p class="mb-4">
              📝 <strong>Your Prompt:</strong> {personalPrompt()}
            </p>
            <textarea
              class="w-full bg-neutral-800 border border-neutral-600 p-2 rounded"
              rows="5"
              value={response()}
              onInput={(e) => setResponse(e.currentTarget.value)}
              disabled={hasSubmitted()}
            />
            <button
              onClick={handleSubmitResponse}
              disabled={hasSubmitted()}
              class="mt-2 bg-red-600 hover:bg-red-700 py-2 px-4 rounded"
            >
              {hasSubmitted() ? "✔️ Submitted" : "📤 Submit Response"}
            </button>
          </Show>
        </Show>

        {/* all responses + voting */}
        <Show when={Object.keys(responses()).length === players().length}>
          <div class="mt-6">
            <h3 class="text-lg font-semibold mb-2">🧾 All Responses</h3>
            <For each={Object.entries(responses())}>
              {([id, resp]) => (
                <div class="mb-2 p-2 border border-neutral-600 bg-neutral-800 rounded">
                  <p class="text-sm italic">{resp}</p>
                  <Show
                    when={
                      votingPhase() &&
                      !votes()[playerId()] &&
                      eliminated() !== playerId() &&
                      winner() === null
                    }
                  >
                    <button
                      class="mt-1 text-xs bg-yellow-500 hover:bg-yellow-600 px-2 py-1 rounded"
                      onClick={() => handleVote(id)}
                    >
                      Vote to Eliminate
                    </button>
                  </Show>
                  <Show when={eliminated() === playerId() && votingPhase()}>
                    <p class="text-xs italic text-yellow-400 mt-1">
                      You’ve been eliminated. Viewing only.
                    </p>
                  </Show>
                </div>
              )}
            </For>
          </div>
        </Show>

        {/* elimination banner */}
        <Show when={eliminated()}>
          <div class="mt-6 p-4 border border-red-600 bg-neutral-900 rounded">
            ❌ <strong>{players().find((p) => p.id === eliminated())?.name}</strong>{" "}
            was eliminated!
          </div>
        </Show>

        {/* game over screen */}
        <Show when={gameOver()}>
          <div class="mt-6 p-6 bg-neutral-900 border border-neutral-600 rounded text-center">
            <h2 class="text-2xl font-bold mb-2">🎮 Game Over</h2>
            <p class="text-lg">
              {winner() === "Collaborators"
                ? "✅ Collaborators win! The Imposter was caught."
                : "😈 Imposter wins! Only 2 players remain."}
            </p>
            <Show when={isHost()}>
              <button
                class="mt-4 bg-blue-600 hover:bg-blue-700 py-2 px-4 rounded"
                onClick={async () => {
                  // clear match‑level keys & start a new match
                  await remove(ref(db, `${base()}/winner`));
                  await remove(ref(db, `${base()}/gameOver`));
                  await startNextRound(); // wipes round data too
                  await set(ref(db, `${base()}/matchId`), crypto.randomUUID());
                }}
              >
                🔁 Start New Match
              </button>
            </Show>
          </div>
        </Show>
      </Show>
    </main>
  );
};

export default JoinSpyGame;
