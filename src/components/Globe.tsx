import { onMount, onCleanup } from "solid-js";
import { geoOrthographic, geoPath } from "d3-geo";
import { select } from "d3-selection";
import { timer, type Timer } from "d3-timer";

const GlobeComponent = () => {
  let mapContainer: HTMLDivElement | undefined;
  let globeTimer: Timer | undefined;

  const visitedCountries = [
    "United Arab Emirates",
    "Indonesia",
    "Singapore",
    "Malaysia",
    "India",
  ];

  onMount(async () => {
    if (!mapContainer) return;

    // Dynamically import world.json so it's not in the main bundle
    const worldData = (await import("../lib/world.json")).default;

    const width = mapContainer.clientWidth;
    const height = 500;
    const sensitivity = 75;

    let projection = geoOrthographic()
      .scale(250)
      .center([0, 0])
      .rotate([0, -30])
      .translate([width / 2, height / 2]);

    const initialScale = projection.scale();
    let pathGenerator = geoPath().projection(projection);

    let svg = select(mapContainer)
      .append("svg")
      .attr("width", width)
      .attr("height", height);

    svg
      .append("circle")
      .attr("fill", "#EEE")
      .attr("stroke", "#000")
      .attr("stroke-width", "0.2")
      .attr("cx", width / 2)
      .attr("cy", height / 2)
      .attr("r", initialScale);

    let map = svg.append("g");

    map
      .append("g")
      .attr("class", "countries")
      .selectAll("path")
      .data(worldData.features)
      .enter()
      .append("path")
      .attr("d", (d: any) => pathGenerator(d as any))
      .attr("fill", (d: { properties: { name: string } }) =>
        visitedCountries.includes(d.properties.name) ? "#E63946" : "white"
      )
      .style("stroke", "black")
      .style("stroke-width", 0.3)
      .style("opacity", 0.8);

    globeTimer = timer(() => {
      const rotate = projection.rotate();
      const k = sensitivity / projection.scale();
      projection.rotate([rotate[0] - 1 * k, rotate[1]]);
      svg.selectAll("path").attr("d", (d: any) => pathGenerator(d as any));
    }, 200);
  });

  onCleanup(() => {
    if (globeTimer) globeTimer.stop();
  });

  return (
    <div class="flex flex-col text-white justify-center items-center w-full h-full">
      <div class="w-full" ref={mapContainer}></div>
    </div>
  );
};

export default GlobeComponent;
