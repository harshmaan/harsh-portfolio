import { useState } from "react";

export default function PersonaTracker() {
  const [name, setName] = useState("");
  const [posts, setPosts] = useState<any[]>([]);

  const fetchPosts = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(`/api/reddit?query=${encodeURIComponent(name)}`);
    const data = await res.json();
    setPosts(data.posts || []);
  };

  return (
    <div className="text-white max-w-2xl mx-auto mt-12 space-y-6 px-4">
      <h1 className="text-3xl font-bold">🔎 Persona Tracker</h1>
      <p className="text-neutral-400">
        Enter a CXO’s name below to analyze how they’re being perceived on Reddit.
      </p>

      <form className="flex flex-col gap-4" onSubmit={fetchPosts}>
        <input
          type="text"
          placeholder="Enter CXO name (e.g., Julie Sweet)"
          className="bg-neutral-800 border border-neutral-600 p-3 rounded text-white w-full"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          🚀 Analyze
        </button>
      </form>

      <ul className="space-y-3">
        {posts.map((post, idx) => (
          <li key={idx} className="border border-neutral-700 p-3 rounded bg-neutral-900">
            <strong>{post.title}</strong>
            <p className="text-sm text-gray-400">{post.selftext}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
