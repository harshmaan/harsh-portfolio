export async function fetchRedditPosts(query: string) {
  const encodedQuery = encodeURIComponent(query);
  const url = `https://www.reddit.com/search.json?q=${encodedQuery}&sort=new&limit=10`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    const posts = data.data.children.map((item: any) => ({
      id: item.data.id,
      title: item.data.title,
      body: item.data.selftext,
      subreddit: item.data.subreddit,
      permalink: `https://reddit.com${item.data.permalink}`,
      author: item.data.author,
      score: item.data.score,
      createdUtc: item.data.created_utc,
    }));

    return posts;
  } catch (err) {
    console.error("Failed to fetch Reddit posts:", err);
    return [];
  }
}
