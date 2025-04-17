import type { APIRoute } from "astro";

export const GET: APIRoute = async ({ request }) => {
  const url = new URL(request.url);
  const query = url.searchParams.get("name");

  if (!query) {
    return new Response(JSON.stringify({ error: "Missing name parameter" }), {
      status: 400,
    });
  }

  const redditUrl = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&limit=100`;

  try {
    const res = await fetch(redditUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PersonaTrackerBot/1.0; +https://harshmaan.com)",
        "Accept": "application/json",
      },
    });

    const data = await res.json();

    const posts =
      data?.data?.children?.map((child: any) => ({
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
    return new Response(
      JSON.stringify({ error: "Reddit API error", details: err.message }),
      { status: 500 }
    );
  }
};
