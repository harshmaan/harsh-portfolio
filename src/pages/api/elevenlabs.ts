export async function POST({ request }) {
  const { text } = await request.json();

  const response = await fetch("https://api.elevenlabs.io/v1/text-to-speech/puAQxSeQK6FU8XqOJvhB", {
    method: "POST",
    headers: {
      "xi-api-key": import.meta.env.ELEVENLABS_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      text,
      model_id: "eleven_monolingual_v1",
      voice_settings: {
        stability: 0.4,
        similarity_boost: 0.75
      }
    }),
  });

  const audioBuffer = await response.arrayBuffer();

  return new Response(audioBuffer, {
    headers: {
      "Content-Type": "audio/mpeg"
    }
  });
}
