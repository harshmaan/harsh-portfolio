import { createSignal, Show, For } from "solid-js";

const PersonaTracker = () => {
  const [cxoName, setCxoName] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [posts, setPosts] = createSignal<any[]>([]);
  const [error, setError] = createSignal("");
  const [report, setReport] = createSignal("");

  const handleSearch = async () => {
    if (!cxoName().trim()) return;
    setLoading(true);
    setError("");
    setPosts([]);
    setReport("");

    try {
      // 1️⃣ Fetch Reddit posts
      const res = await fetch(`https://www.reddit.com/search.json?q=${encodeURIComponent(cxoName())}&limit=10`, {
        headers: {
          "User-Agent": "Mozilla/5.0",
          "Accept": "application/json",
        },
      });

      const data = await res.json();
      const children = data?.data?.children || [];

      const cleaned = children.map((child: any) => ({
        title: child.data.title,
        selftext: child.data.selftext || "",
        permalink: child.data.permalink,
        ups: child.data.ups,
        num_comments: child.data.num_comments,
        subreddit: child.data.subreddit,
      }));

      setPosts(cleaned);

      // 2️⃣ Fetch AI Insight Report
      const reportRes = await fetch("/api/persona-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: cxoName(),
          posts: cleaned,
        }),
      });

      const reportData = await reportRes.json();
      setReport(reportData.report || "No insights generated.");
    } catch (err: any) {
      setError("Failed to fetch data");
      console.error("Tracker error:", err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div class="max-w-xl mx-auto w-full p-6 bg-neutral-900 rounded-lg border border-neutral-700 text-white">
      <h1 class="text-2xl font-bold mb-4 text-center">📣 Persona
