import { createSignal, Show } from "solid-js";

interface KeyFacts {
  condition?: string;
  intervention?: string;
  phase?: string;
  status?: string;
  enrollment?: string;
  sponsor?: string;
}

interface TrialResult {
  plain_summary: string;
  key_facts: KeyFacts;
  eli5: string;
  significance: string;
  raw: Record<string, any>;
}

export default function ClinicalTrialSummarizer() {
  const [nctId, setNctId] = createSignal("");
  const [loading, setLoading] = createSignal(false);
  const [result, setResult] = createSignal<TrialResult | null>(null);
  const [error, setError] = createSignal("");
  const [showRaw, setShowRaw] = createSignal(false);

  const exampleIds = ["NCT04368728", "NCT05678901", "NCT04280705", "NCT06081894"];

  const analyze = async (id?: string) => {
    const targetId = (id || nctId()).trim();
    if (!targetId) {
      setError("Please enter an NCT ID.");
      return;
    }
    setNctId(targetId);
    setError("");
    setLoading(true);
    setResult(null);
    setShowRaw(false);

    try {
      const res = await fetch("/api/clinical-trial", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nctId: targetId }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch {
      setError("Failed to fetch trial data. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      analyze();
    }
  };

  return (
    <div class="max-w-4xl mx-auto">
      {/* Input Section */}
      <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6 mb-6">
        <h2 class="text-lg font-bold mb-2">Enter NCT ID</h2>
        <p class="text-xs text-gray-500 mb-4">
          Find NCT IDs at{" "}
          <a href="https://clinicaltrials.gov" target="_blank" rel="noopener" class="text-primary-400 hover:underline">
            clinicaltrials.gov
          </a>
        </p>

        <div class="flex gap-2 mb-4">
          <input
            type="text"
            value={nctId()}
            onInput={(e) => setNctId(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="e.g., NCT04368728"
            class="flex-1 bg-darkslate-300 border border-darkslate-100 text-white px-4 py-2 rounded-lg outline-none focus:border-primary-500 transition-colors font-mono"
          />
          <button
            onClick={() => analyze()}
            disabled={loading()}
            class="bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold px-6 py-2 rounded-lg transition-colors"
          >
            {loading() ? "Fetching..." : "🔬 Summarize"}
          </button>
        </div>

        <div class="flex flex-wrap gap-2">
          <span class="text-xs text-gray-500">Try:</span>
          {exampleIds.map((id) => (
            <button
              onClick={() => analyze(id)}
              class="text-xs bg-white/5 hover:bg-white/10 border border-white/10 px-2 py-0.5 rounded-full text-gray-400 hover:text-white transition-colors font-mono"
            >
              {id}
            </button>
          ))}
        </div>
      </div>

      <Show when={error()}>
        <div class="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6 text-sm">
          {error()}
        </div>
      </Show>

      {/* Results */}
      <Show when={result()}>
        <div class="space-y-6">
          {/* ELI5 */}
          <Show when={result()!.eli5}>
            <div class="bg-primary-500/10 border border-primary-500/30 rounded-xl p-5">
              <h3 class="text-sm font-bold text-primary-400 mb-1">🧒 ELI5 (Explain Like I'm 5)</h3>
              <p class="text-gray-200 text-sm">{result()!.eli5}</p>
            </div>
          </Show>

          {/* Key Facts */}
          <Show when={result()!.key_facts && Object.keys(result()!.key_facts).length > 0}>
            <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6">
              <h3 class="text-lg font-bold mb-4">📊 Key Facts</h3>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-3">
                {Object.entries(result()!.key_facts).map(([key, value]) => (
                  <div class="bg-darkslate-300 rounded-lg p-3">
                    <p class="text-[10px] uppercase text-gray-500 mb-0.5">{key.replace(/_/g, " ")}</p>
                    <p class="text-sm text-white font-medium">{value || "N/A"}</p>
                  </div>
                ))}
              </div>
            </div>
          </Show>

          {/* Plain English Summary */}
          <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6">
            <h3 class="text-lg font-bold mb-3">📝 Plain English Summary</h3>
            <div class="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
              {result()!.plain_summary}
            </div>
          </div>

          {/* Significance */}
          <Show when={result()!.significance}>
            <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6">
              <h3 class="text-lg font-bold mb-2">🌟 Why This Matters</h3>
              <p class="text-gray-300 text-sm">{result()!.significance}</p>
            </div>
          </Show>

          {/* Raw Data Toggle */}
          <Show when={result()!.raw}>
            <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6">
              <button
                onClick={() => setShowRaw(!showRaw())}
                class="text-sm text-gray-400 hover:text-white transition-colors"
              >
                {showRaw() ? "▼ Hide" : "▶ Show"} Raw Trial Data
              </button>
              <Show when={showRaw()}>
                <pre class="mt-4 bg-darkslate-300 rounded-lg p-4 overflow-x-auto text-xs text-gray-400">
                  {JSON.stringify(result()!.raw, null, 2)}
                </pre>
              </Show>
            </div>
          </Show>
        </div>
      </Show>
    </div>
  );
}
