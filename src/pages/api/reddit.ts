import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("name");

  if (!query) {
    return new Response(
      JSON.stringify({ error: "Missing query parameter" }),
      { status: 400 }
    );
  }

  // Pushshift API endpoint for Reddit submissions
  const pushshiftUrl = `https://api.pushshift.io/reddit/search/submission/?q=${encodeURIComponent(query)}&size=10&sort=desc`;

  try {
    const res = await fetch(pushshiftUrl, {
      headers: {
        "User-Agent": "persona-tracker-bot/1.0 by harshmaan.com",
      },
    });

    const data = await res.json();

    const posts =
      data?.data?.map((post: any) => ({
        title: post.title,
        selftext: post.selftext || "",
        url: post.full_link || (post.permalink ? `https://reddit.com${post.permalink}` : ""),
        score: post.score,
        subreddit: post.subreddit,
        created_utc: post.created_utc,
      })) || [];

    return new Response(JSON.stringify({ posts }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Pushshift fetch error:", err);
    return new Response(
      JSON.stringify({ error: "Pushshift API error", details: String(err) }),
      { status: 500 }
    );
  }
};
