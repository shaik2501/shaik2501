#!/usr/bin/env node
// Self-hosted GitHub contribution heatmap SVG generator.
// Dependency-free Node 20 ESM script using global fetch.

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GH_USER = process.env.GH_USER || "shaik2501";

if (!GITHUB_TOKEN) {
  console.error("Missing GITHUB_TOKEN env var.");
  process.exit(1);
}

const QUERY = `
query($login:String!){ user(login:$login){ contributionsCollection{ contributionCalendar{
  totalContributions
  weeks{ firstDay contributionDays{ date weekday contributionCount contributionLevel } } } } } }
`;

async function main() {
  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `bearer ${GITHUB_TOKEN}`,
      "Content-Type": "application/json",
      "User-Agent": "contrib-graph",
    },
    body: JSON.stringify({ query: QUERY, variables: { login: GH_USER } }),
  });

  if (!res.ok) {
    console.error(`GitHub API request failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }

  const json = await res.json();

  if (json.errors) {
    console.error("GitHub GraphQL API returned errors:", JSON.stringify(json.errors, null, 2));
    process.exit(1);
  }

  const calendar = json?.data?.user?.contributionsCollection?.contributionCalendar;
  if (!calendar || !Array.isArray(calendar.weeks)) {
    console.error("Response missing contributionCalendar data:", JSON.stringify(json, null, 2));
    process.exit(1);
  }

  const svg = renderSvg(calendar);
  const fs = await import("node:fs");
  fs.mkdirSync("dist", { recursive: true });
  fs.writeFileSync("dist/contribution-graph.svg", svg, "utf8");
  console.log(`Wrote dist/contribution-graph.svg (${calendar.totalContributions} contributions).`);
}

const LEVEL_COLORS = {
  NONE: "#161b22",
  FIRST_QUARTILE: "#3d0a22",
  SECOND_QUARTILE: "#7a1444",
  THIRD_QUARTILE: "#c41f6b",
  FOURTH_QUARTILE: "#ff2e88",
};

const LEVEL_ORDER = ["NONE", "FIRST_QUARTILE", "SECOND_QUARTILE", "THIRD_QUARTILE", "FOURTH_QUARTILE"];

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

function renderSvg(calendar) {
  const CELL = 11;
  const GAP = 3;
  const STEP = CELL + GAP;
  const LEFT_PAD = 28;
  const TOP_PAD = 34;
  const RIGHT_PAD = 12;
  const BOTTOM_PAD = 26;

  const weeks = calendar.weeks;
  const numWeeks = weeks.length;

  const width = LEFT_PAD + numWeeks * STEP - GAP + RIGHT_PAD;
  const height = TOP_PAD + 7 * STEP - GAP + BOTTOM_PAD;

  const parts = [];
  parts.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif">`
  );

  // Background
  parts.push(`<rect x="0" y="0" width="${width}" height="${height}" fill="#0d1117" />`);

  // Title
  parts.push(
    `<text x="${LEFT_PAD}" y="16" fill="#c9d1d9" font-size="12">${calendar.totalContributions} contributions in the last year</text>`
  );

  // Month labels
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    const firstDay = week.contributionDays[0]?.date || week.firstDay;
    const d = new Date(firstDay + "T00:00:00Z");
    const month = d.getUTCMonth();
    if (month !== lastMonth) {
      const x = LEFT_PAD + wi * STEP;
      parts.push(
        `<text x="${x}" y="${TOP_PAD - 6}" fill="#8b949e" font-size="9">${MONTH_NAMES[month]}</text>`
      );
      lastMonth = month;
    }
  });

  // Weekday labels (Mon/Wed/Fri => weekday 1,3,5)
  const weekdayLabels = { 1: "Mon", 3: "Wed", 5: "Fri" };
  for (const [wd, label] of Object.entries(weekdayLabels)) {
    const y = TOP_PAD + Number(wd) * STEP + CELL - 2;
    parts.push(`<text x="0" y="${y}" fill="#8b949e" font-size="9">${label}</text>`);
  }

  // Day cells
  weeks.forEach((week, wi) => {
    week.contributionDays.forEach((day) => {
      const x = LEFT_PAD + wi * STEP;
      const y = TOP_PAD + day.weekday * STEP;
      const color = LEVEL_COLORS[day.contributionLevel] || LEVEL_COLORS.NONE;
      const plural = day.contributionCount === 1 ? "" : "s";
      parts.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${color}"><title>${day.contributionCount} contribution${plural} on ${day.date}</title></rect>`
      );
    });
  });

  // Legend (bottom-right)
  const legendSwatch = 9;
  const legendGap = 3;
  const legendCount = LEVEL_ORDER.length;
  const legendY = height - BOTTOM_PAD + 12;
  let legendWidth = 0;
  legendWidth += 24; // "Less"
  legendWidth += legendCount * (legendSwatch + legendGap);
  legendWidth += 26; // "More"
  let legendX = width - RIGHT_PAD - legendWidth;

  parts.push(`<text x="${legendX}" y="${legendY + legendSwatch - 1}" fill="#8b949e" font-size="9">Less</text>`);
  legendX += 24;
  LEVEL_ORDER.forEach((level) => {
    parts.push(
      `<rect x="${legendX}" y="${legendY}" width="${legendSwatch}" height="${legendSwatch}" rx="2" fill="${LEVEL_COLORS[level]}" />`
    );
    legendX += legendSwatch + legendGap;
  });
  parts.push(`<text x="${legendX}" y="${legendY + legendSwatch - 1}" fill="#8b949e" font-size="9">More</text>`);

  parts.push(`</svg>`);
  return parts.join("\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
