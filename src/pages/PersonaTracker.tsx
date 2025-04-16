// src/pages/PersonaTracker.tsx
import { createSignal } from "solid-js";

const PersonaTracker = () => {
  const [cxoName, setCxoName] = createSignal("");
  const [posts, setPosts] = createSignal<any[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [error, setError] = createSignal("");

  const fetchRedditPosts = async () => {
    setLoading(true);
    setError("");
    setPosts([]);

    try {
      const query = cxoName().trim().replace(/\s+/g, "+");
      const response = await fetch(`https://www.reddit.com/search.json?q=${query}&limit=20`);
      const data = await response.json();
      const extracted = data.data.children.map((item: any) => item.data);
      setPosts(extracted);
    } catch (err) {
      setError("Failed to fetch posts.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main class="p-6 text-white max-w-3xl mx-auto">
      <h1 class="text-3xl font-bold mb-4">🔎 Public Persona Tracker</h1>
      <input
        type="text"
        class="w-full p-2 rounded bg-neutral-800 border border-neutral-600 text-white mb-4"
        placeholder="Enter CXO name (e.g. Julie Sweet)"
        value={cxoName()}
        onInput={(e) => setCxoName(e.currentTarget.value)}
      />
      <button
        class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-white disabled:opacity-50"
        onClick={fetchRedditPosts}
        disabled={!cxoName().trim() || loading()}
      >
        {loading() ? "Fetching..." : "Fetch Posts"}
      </button>

      <Show when={error()}>
        <p class="text-red-500 mt-4">{error()}</p>
      </Show>

      <div class="mt-6 space-y-4">
        <For each={posts()}>
          {(post) => (
            <div class="border border-neutral-700 rounded p-4 bg-neutral-900">
              <a href={`https://reddit.com${post.permalink}`} target="_blank" rel="noopener" class="text-blue-400 hover:underline">
                {post.title}
              </a>
              <p class="text-sm text-gray-400 mt-1">r/{post.subreddit} • {post.ups} upvotes</p>
              <p class="mt-2 text-sm">{post.selftext.slice(0, 200)}{post.selftext.length > 200 && "..."}</p>
            </div>
          )}
        </For>
      </div>
    </main>
  );
};

export default PersonaTracker;
