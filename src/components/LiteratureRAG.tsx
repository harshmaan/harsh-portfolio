import { createSignal, For, Show } from "solid-js";

interface Source {
  chunk_index: number;
  score: number;
  preview: string;
}

interface QueryResult {
  answer: string;
  confidence: string;
  relevant_excerpts: string[];
  sources: Source[];
}

export default function LiteratureRAG() {
  const [uploadStatus, setUploadStatus] = createSignal<"idle" | "uploading" | "ready" | "error">("idle");
  const [chunkCount, setChunkCount] = createSignal(0);
  const [preview, setPreview] = createSignal("");
  const [fileName, setFileName] = createSignal("");
  const [question, setQuestion] = createSignal("");
  const [querying, setQuerying] = createSignal(false);
  const [result, setResult] = createSignal<QueryResult | null>(null);
  const [queryHistory, setQueryHistory] = createSignal<{ q: string; a: string }[]>([]);
  const [error, setError] = createSignal("");

  const handleFileUpload = async (e: Event) => {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setUploadStatus("uploading");
    setError("");
    setResult(null);
    setQueryHistory([]);

    try {
      // Extract text from the file client-side
      let text = "";

      if (file.type === "text/plain" || file.name.endsWith(".txt")) {
        text = await file.text();
      } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        // Use pdf.js from CDN to extract text
        const pdfjsLib = await import("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs" as any);
        pdfjsLib.GlobalWorkerOptions.workerSrc =
          "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs";

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const pages: string[] = [];

        for (let i = 1; i <= pdf.numPages; i++) {
          const page = await pdf.getPage(i);
          const content = await page.getTextContent();
          const strings = content.items.map((item: any) => item.str).join(" ");
          pages.push(strings);
        }
        text = pages.join("\n\n");
      } else {
        setError("Unsupported file type. Please upload a PDF or TXT file.");
        setUploadStatus("error");
        return;
      }

      if (text.length < 50) {
        setError("Could not extract enough text from this file.");
        setUploadStatus("error");
        return;
      }

      // Send to backend for chunking + embedding
      const res = await fetch("/api/literature-rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "upload", text }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setUploadStatus("error");
      } else {
        setChunkCount(data.chunks);
        setPreview(data.preview);
        setUploadStatus("ready");
      }
    } catch (err: any) {
      setError(`Upload failed: ${err.message || "Unknown error"}`);
      setUploadStatus("error");
    }
  };

  const askQuestion = async () => {
    const q = question().trim();
    if (!q) return;

    setQuerying(true);
    setError("");
    setResult(null);

    try {
      const res = await fetch("/api/literature-rag", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "query", question: q }),
      });

      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
        setQueryHistory([...queryHistory(), { q, a: data.answer }]);
      }
    } catch {
      setError("Query failed. Please try again.");
    } finally {
      setQuerying(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      askQuestion();
    }
  };

  const confidenceColor = (c: string) => {
    switch (c?.toLowerCase()) {
      case "high": return "text-green-400 bg-green-500/10 border-green-500/30";
      case "medium": return "text-yellow-400 bg-yellow-500/10 border-yellow-500/30";
      case "low": return "text-red-400 bg-red-500/10 border-red-500/30";
      default: return "text-gray-400 bg-gray-500/10 border-gray-500/30";
    }
  };

  return (
    <div class="max-w-4xl mx-auto">
      {/* Upload Section */}
      <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6 mb-6">
        <h2 class="text-lg font-bold mb-2">📤 Upload a Research Paper</h2>
        <p class="text-xs text-gray-500 mb-4">
          Upload a PDF or TXT file. The text will be chunked, embedded, and stored for querying.
        </p>

        <label class="block cursor-pointer">
          <div class={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            uploadStatus() === "ready"
              ? "border-green-500/50 bg-green-900/10"
              : "border-darkslate-100 hover:border-primary-500/50"
          }`}>
            <Show when={uploadStatus() === "idle"}>
              <p class="text-gray-400 text-sm mb-2">📄 Drop a PDF or TXT file here</p>
              <p class="text-xs text-gray-600">or click to browse</p>
            </Show>
            <Show when={uploadStatus() === "uploading"}>
              <p class="text-primary-400 text-sm">⏳ Processing "{fileName()}"...</p>
              <p class="text-xs text-gray-500 mt-1">Extracting text → Chunking → Embedding</p>
            </Show>
            <Show when={uploadStatus() === "ready"}>
              <p class="text-green-400 text-sm mb-1">✅ "{fileName()}" loaded successfully</p>
              <p class="text-xs text-gray-500">{chunkCount()} chunks embedded · Ready to query</p>
            </Show>
            <Show when={uploadStatus() === "error"}>
              <p class="text-red-400 text-sm mb-1">❌ Upload failed</p>
              <p class="text-xs text-gray-500">Click to try again</p>
            </Show>
          </div>
          <input
            type="file"
            accept=".pdf,.txt"
            onChange={handleFileUpload}
            class="hidden"
          />
        </label>
      </div>

      {/* Query Section */}
      <Show when={uploadStatus() === "ready"}>
        <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6 mb-6">
          <h2 class="text-lg font-bold mb-4">💬 Ask a Question</h2>

          <div class="flex gap-2 mb-2">
            <input
              type="text"
              value={question()}
              onInput={(e) => setQuestion(e.currentTarget.value)}
              onKeyDown={handleKeyDown}
              placeholder="What are the main findings of this paper?"
              class="flex-1 bg-darkslate-300 border border-darkslate-100 text-white px-4 py-2 rounded-lg outline-none focus:border-primary-500 transition-colors"
            />
            <button
              onClick={askQuestion}
              disabled={querying()}
              class="bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-2 rounded-lg transition-colors"
            >
              {querying() ? "Thinking..." : "Ask"}
            </button>
          </div>

          <div class="flex flex-wrap gap-2 mt-3">
            <span class="text-xs text-gray-500">Try:</span>
            {["What is the main hypothesis?", "What methodology was used?", "What are the key results?", "What are the limitations?"].map((q) => (
              <button
                onClick={() => { setQuestion(q); askQuestion(); }}
                class="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-0.5 rounded-full text-gray-400 hover:text-white transition-colors"
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </Show>

      <Show when={error()}>
        <div class="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6 text-sm">
          {error()}
        </div>
      </Show>

      {/* Answer */}
      <Show when={result()}>
        <div class="space-y-6">
          <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6">
            <div class="flex items-center justify-between mb-3">
              <h3 class="text-lg font-bold">🧠 Answer</h3>
              <span class={`text-xs px-2 py-0.5 rounded-full border ${confidenceColor(result()!.confidence)}`}>
                {result()!.confidence} confidence
              </span>
            </div>
            <p class="text-gray-300 text-sm leading-relaxed whitespace-pre-line">{result()!.answer}</p>
          </div>

          {/* Relevant Excerpts */}
          <Show when={result()!.relevant_excerpts && result()!.relevant_excerpts.length > 0}>
            <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6">
              <h3 class="text-lg font-bold mb-3">📌 Cited Excerpts</h3>
              <div class="space-y-2">
                <For each={result()!.relevant_excerpts}>
                  {(excerpt) => (
                    <blockquote class="border-l-2 border-primary-500/50 pl-3 text-sm text-gray-400 italic">
                      "{excerpt}"
                    </blockquote>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Source Chunks */}
          <Show when={result()!.sources && result()!.sources.length > 0}>
            <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6">
              <h3 class="text-lg font-bold mb-3">🔗 Retrieved Chunks</h3>
              <div class="space-y-3">
                <For each={result()!.sources}>
                  {(source) => (
                    <div class="bg-darkslate-300 rounded-lg p-3">
                      <div class="flex items-center justify-between mb-1">
                        <span class="text-xs text-gray-500">Chunk #{source.chunk_index + 1}</span>
                        <span class="text-xs text-primary-400">Similarity: {source.score}</span>
                      </div>
                      <p class="text-xs text-gray-400">{source.preview}</p>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>
        </div>
      </Show>

      {/* Query History */}
      <Show when={queryHistory().length > 1}>
        <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6 mt-6">
          <h3 class="text-lg font-bold mb-3">📜 Query History</h3>
          <div class="space-y-3">
            <For each={queryHistory().slice(0, -1).reverse()}>
              {(item) => (
                <div class="bg-darkslate-300 rounded-lg p-3">
                  <p class="text-xs text-primary-400 mb-1 font-semibold">Q: {item.q}</p>
                  <p class="text-xs text-gray-400 line-clamp-2">{item.a}</p>
                </div>
              )}
            </For>
          </div>
        </div>
      </Show>

      {/* Architecture Note */}
      <div class="bg-darkslate-500/50 border border-darkslate-100/50 rounded-xl p-5 mt-6">
        <h3 class="text-sm font-bold mb-2 text-gray-400">🏗️ How This Works</h3>
        <ol class="text-xs text-gray-500 space-y-1 list-decimal list-inside">
          <li>PDF text extracted client-side via pdf.js</li>
          <li>Text chunked into ~800 char overlapping segments</li>
          <li>Each chunk embedded with Gemini's <code class="text-gray-400">text-embedding-004</code></li>
          <li>Query embedded → cosine similarity → top-5 chunks retrieved</li>
          <li>Gemini generates answer grounded in retrieved context</li>
        </ol>
      </div>
    </div>
  );
}
