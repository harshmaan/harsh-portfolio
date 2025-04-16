import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("name"); // Should match the query param sent from frontend

  if (!query) {
    return new Response(
      JSON.stringify({ error: "Missing query parameter" }),
      { status: 400 }
    );
  }

  const redditUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=10`;
  
  try {
    const res = await fetch(redditUrl, {
      headers: {
        "User-Agent": "persona-tracker-bot/1.0 by harshmaan.com"
      }
    });
  
    if (!res.ok) {
      console.error("Reddit API failed", await res.text());
      return new Response(
        JSON.stringify({ error: "Reddit API returned error", status: res.status }),
        { status: res.status }
      );
    }
  
    const data = await res.json();
    const posts = data?.data?.children?.map((child: any) => ({
      title: child.data.title,
      selftext: child.data.selftext,
      url: `https://reddit.com${child.data.permalink}`,
      score: child.data.score,
      subreddit: child.data.subreddit,
      created_utc: child.data.created_utc,
    })) || [];
  
    return new Response(JSON.stringify({ posts }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Unexpected failure", err);
    return new Response(
      JSON.stringify({ error: "Failed to fetch Reddit data", details: err.message }),
      { status: 500 }
    );
  }
};
