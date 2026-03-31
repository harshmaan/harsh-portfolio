import { createSignal, For, Show } from "solid-js";

interface Interaction {
  drug_a: string;
  drug_b: string;
  severity: string;
  type: string;
  mechanism: string;
  clinical_effect: string;
  recommendation: string;
}

interface Result {
  summary: string;
  interactions: Interaction[];
  contraindications: string[];
  general_advice: string;
}

export default function DrugInteractionChecker() {
  const [drugInput, setDrugInput] = createSignal("");
  const [drugs, setDrugs] = createSignal<string[]>([]);
  const [loading, setLoading] = createSignal(false);
  const [result, setResult] = createSignal<Result | null>(null);
  const [error, setError] = createSignal("");

  const addDrug = () => {
    const name = drugInput().trim();
    if (!name) return;
    if (drugs().includes(name)) return;
    setDrugs([...drugs(), name]);
    setDrugInput("");
  };

  const removeDrug = (name: string) => {
    setDrugs(drugs().filter((d) => d !== name));
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addDrug();
    }
  };

  const analyze = async () => {
    if (drugs().length < 2) {
      setError("Please add at least 2 drugs to check interactions.");
      return;
    }
    setError("");
    setLoading(true);
    setResult(null);

    try {
      const res = await fetch("/api/drug-interactions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drugs: drugs() }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
      } else {
        setResult(data);
      }
    } catch (err: any) {
      setError("Failed to analyze. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const severityColor = (severity: string) => {
    switch (severity?.toLowerCase()) {
      case "major": return "bg-red-600";
      case "moderate": return "bg-yellow-600";
      case "minor": return "bg-green-600";
      default: return "bg-gray-600";
    }
  };

  return (
    <div class="max-w-4xl mx-auto">
      {/* Input Section */}
      <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6 mb-6">
        <h2 class="text-lg font-bold mb-4">Enter Drug Names</h2>

        <div class="flex gap-2 mb-4">
          <input
            type="text"
            value={drugInput()}
            onInput={(e) => setDrugInput(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a drug name and press Enter..."
            class="flex-1 bg-darkslate-300 border border-darkslate-100 text-white px-4 py-2 rounded-lg outline-none focus:border-primary-500 transition-colors"
          />
          <button
            onClick={addDrug}
            class="bg-darkslate-300 hover:bg-darkslate-200 border border-darkslate-100 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Add
          </button>
        </div>

        {/* Drug Tags */}
        <div class="flex flex-wrap gap-2 mb-4">
          <For each={drugs()}>
            {(drug) => (
              <span class="bg-primary-500/20 text-primary-300 border border-primary-500/30 px-3 py-1 rounded-full text-sm flex items-center gap-2">
                {drug}
                <button
                  onClick={() => removeDrug(drug)}
                  class="hover:text-white transition-colors text-xs"
                >
                  ✕
                </button>
              </span>
            )}
          </For>
        </div>

        <Show when={drugs().length > 0}>
          <p class="text-xs text-gray-500 mb-4">
            {drugs().length} drug{drugs().length !== 1 ? "s" : ""} added · {drugs().length >= 2 ? "Ready to analyze" : "Add at least 1 more"}
          </p>
        </Show>

        <button
          onClick={analyze}
          disabled={loading() || drugs().length < 2}
          class="w-full bg-primary-500 hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold py-3 rounded-lg transition-colors"
        >
          {loading() ? "Analyzing interactions..." : "🔍 Check Interactions"}
        </button>
      </div>

      <Show when={error()}>
        <div class="bg-red-900/30 border border-red-700 text-red-300 px-4 py-3 rounded-lg mb-6 text-sm">
          {error()}
        </div>
      </Show>

      {/* Results */}
      <Show when={result()}>
        <div class="space-y-6">
          {/* Summary */}
          <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6">
            <h3 class="text-lg font-bold mb-2">📋 Summary</h3>
            <p class="text-gray-300 text-sm">{result()!.summary}</p>
          </div>

          {/* Interactions */}
          <Show when={result()!.interactions.length > 0}>
            <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6">
              <h3 class="text-lg font-bold mb-4">⚠️ Interactions Found</h3>
              <div class="space-y-4">
                <For each={result()!.interactions}>
                  {(interaction) => (
                    <div class="bg-darkslate-300 rounded-lg p-4 border border-darkslate-100">
                      <div class="flex items-center justify-between mb-3">
                        <span class="font-semibold text-sm">
                          {interaction.drug_a} ↔ {interaction.drug_b}
                        </span>
                        <span class={`text-xs px-2 py-0.5 rounded-full text-white ${severityColor(interaction.severity)}`}>
                          {interaction.severity}
                        </span>
                      </div>
                      <div class="space-y-2 text-sm text-gray-300">
                        <p><strong class="text-gray-100">Type:</strong> {interaction.type}</p>
                        <p><strong class="text-gray-100">Mechanism:</strong> {interaction.mechanism}</p>
                        <p><strong class="text-gray-100">Clinical Effect:</strong> {interaction.clinical_effect}</p>
                        <p><strong class="text-gray-100">Recommendation:</strong> {interaction.recommendation}</p>
                      </div>
                    </div>
                  )}
                </For>
              </div>
            </div>
          </Show>

          {/* Contraindications */}
          <Show when={result()!.contraindications && result()!.contraindications.length > 0}>
            <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6">
              <h3 class="text-lg font-bold mb-3">🚫 Contraindications</h3>
              <ul class="list-disc list-inside space-y-1 text-sm text-gray-300">
                <For each={result()!.contraindications}>
                  {(item) => <li>{item}</li>}
                </For>
              </ul>
            </div>
          </Show>

          {/* General Advice */}
          <Show when={result()!.general_advice}>
            <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6">
              <h3 class="text-lg font-bold mb-2">💡 General Advice</h3>
              <p class="text-gray-300 text-sm">{result()!.general_advice}</p>
            </div>
          </Show>

          {/* Interaction Network Graph */}
          <Show when={result()!.interactions.length > 0}>
            <div class="bg-darkslate-500 border border-darkslate-100 rounded-xl p-6">
              <h3 class="text-lg font-bold mb-4">🕸️ Interaction Network</h3>
              <InteractionGraph interactions={result()!.interactions} drugs={drugs()} />
            </div>
          </Show>

          {/* Disclaimer */}
          <div class="bg-yellow-900/20 border border-yellow-700/40 text-yellow-300/80 px-4 py-3 rounded-lg text-xs">
            ⚠️ <strong>Disclaimer:</strong> This tool is for educational purposes only. Always consult a licensed pharmacist or physician for clinical drug interaction checks. AI-generated content may contain inaccuracies.
          </div>
        </div>
      </Show>
    </div>
  );
}

/* ─── D3 Interaction Graph Sub-Component ─── */
function InteractionGraph(props: { interactions: Interaction[]; drugs: string[] }) {
  let svgRef: SVGSVGElement | undefined;

  const onMount = async () => {
    if (!svgRef) return;
    const d3sel = await import("d3-selection");
    const d3force = await import("d3-force");

    const width = svgRef.clientWidth || 500;
    const height = 300;

    const nodes = props.drugs.map((d) => ({ id: d, x: width / 2, y: height / 2 }));
    const links = props.interactions.map((i) => ({
      source: i.drug_a,
      target: i.drug_b,
      severity: i.severity,
    }));

    const svg = d3sel.select(svgRef).attr("viewBox", `0 0 ${width} ${height}`);
    svg.selectAll("*").remove();

    const severityStroke = (s: string) => {
      switch (s?.toLowerCase()) {
        case "major": return "#dc2626";
        case "moderate": return "#ca8a04";
        case "minor": return "#16a34a";
        default: return "#6b7280";
      }
    };

    const simulation = d3force
      .forceSimulation(nodes as any)
      .force("link", d3force.forceLink(links).id((d: any) => d.id).distance(120))
      .force("charge", d3force.forceManyBody().strength(-300))
      .force("center", d3force.forceCenter(width / 2, height / 2));

    const link = svg
      .append("g")
      .selectAll("line")
      .data(links)
      .join("line")
      .attr("stroke", (d: any) => severityStroke(d.severity))
      .attr("stroke-width", 2.5)
      .attr("stroke-opacity", 0.7);

    const node = svg
      .append("g")
      .selectAll("circle")
      .data(nodes)
      .join("circle")
      .attr("r", 20)
      .attr("fill", "#E63946")
      .attr("stroke", "#fff")
      .attr("stroke-width", 1.5);

    const label = svg
      .append("g")
      .selectAll("text")
      .data(nodes)
      .join("text")
      .text((d: any) => d.id)
      .attr("text-anchor", "middle")
      .attr("dy", "0.35em")
      .attr("fill", "#fff")
      .attr("font-size", "10px")
      .attr("font-weight", "600");

    simulation.on("tick", () => {
      link
        .attr("x1", (d: any) => d.source.x)
        .attr("y1", (d: any) => d.source.y)
        .attr("x2", (d: any) => d.target.x)
        .attr("y2", (d: any) => d.target.y);
      node.attr("cx", (d: any) => d.x).attr("cy", (d: any) => d.y);
      label.attr("x", (d: any) => d.x).attr("y", (d: any) => d.y);
    });
  };

  setTimeout(onMount, 100);

  return <svg ref={svgRef!} class="w-full" style="height: 300px;" />;
}
