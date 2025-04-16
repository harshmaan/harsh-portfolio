import { createSignal, Show, For } from "solid-js";

const PersonaTracker = () => {
  const [cxoName, setCxoName] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [posts, setPosts] = createSignal<any[]>([]);
  const [error, setError] = createSignal("");

  const handleSearch = async () => {
    if (!cxoName().trim()) return;
    setLoading(true);
    setError("");
    setPosts([]);

    try {
      const res = await fetch(`https://www.reddit.com/search.json?q=${encodeURIComponent(cxoName())}&limit=10`, {
        headers: {
          "User-Agent": "Mozilla/5.0", // optional but safe
          "Accept": "application/json",
        },
      });

      const data = await res.json();
      const children = data?.data?.children || [];

      const cleaned = children.map((child: any) => ({
        title: child.data.title,
        permalink: child.data.permalink,
        ups: child.data.ups,
        num_comments: child.data.num_comments,
        subreddit: child.data.subreddit,
      }));

      setPosts(cleaned);
    } catch (err: any) {
      setError("Failed to fetch Reddit posts");
      console.error("Reddit fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="max-w-xl mx-auto w-full p-6 bg-neutral-900 rounded-lg border border-neutral-700 text-white">
      <h1 class="text-2xl font-bold mb-4 text-center">📣 Persona Tracker</h1>

      <div class="flex items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Enter CXO name (e.g. Julie Sweet)"
          value={cxoName()}
          onInput={(e) => setCxoName(e.currentTarget.value)}
          class="flex-1 px-4 py-2 rounded bg-neutral-800 border border-neutral-600 text-white"
        />
        <button
          onClick={handleSearch}
          class="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded text-sm"
          disabled={loading()}
        >
          {loading() ? "Loading..." : "Search"}
        </button>
      </div>

      <Show when={error()}>
        <p class="text-red-500 text-sm mb-2">{error()}</p>
      </Show>

      <Show when={posts().length > 0}>
        <div class="space-y-3 mt-4 max-h-[400px] overflow-y-auto">
          <For each={posts()}>
            {(post: any) => (
              <div class="border border-neutral-700 p-3 rounded bg-neutral-800">
                <a
                  href={`https://www.reddit.com${post.permalink}`}
                  target="_blank"
                  class="text-blue-400 hover:underline text-sm font-medium"
                >
                  {post.title}
                </a>
                <p class="text-gray-400 text-xs mt-1">
                  👍 {post.ups} | 💬 {post.num_comments} | 🧵 r/{post.subreddit}
                </p>
              </div>
            )}
          </For>
        </div>
      </Show>
    </div>
  );
};

export default PersonaTracker;
