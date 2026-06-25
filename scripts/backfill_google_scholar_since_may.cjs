const {
  fetchGoogleScholarPapers,
  fetchRecentPapers,
  todayString
} = require("../paperhot_backend.cjs");
const scholarConfig = require("../config/google-scholar.json");

async function main() {
  const date = todayString();
  const endpoint = new URL(scholarConfig.endpoint);
  endpoint.searchParams.set("as_ylo", "2026");
  endpoint.searchParams.set("as_yhi", "2026");
  endpoint.searchParams.set("scisbd", "1");
  endpoint.searchParams.set("num", "20");
  const googleScholarPapers = await fetchGoogleScholarPapers([
    "structured illumination microscopy",
    "SIM"
  ], {
    config: {
      ...scholarConfig,
      endpoint: endpoint.toString()
    }
  });
  const scopedGoogleScholarPapers = googleScholarPapers.filter(paper => (
    paper.published && paper.published >= "2026-05-01" && paper.published <= date
  ));
  const payload = await fetchRecentPapers({
    refresh: true,
    date,
    startDate: "2026-05-01",
    endDate: date,
    keywords: [
      "structured illumination microscopy",
      "SIM"
    ],
    sources: ["Google Scholar"],
    fetchers: {
      googlescholar: async () => scopedGoogleScholarPapers
    }
  });

  console.log(JSON.stringify({
    date: payload.date,
    startDate: payload.startDate,
    endDate: payload.endDate,
    sources: payload.sources,
    scholarReturnedCount: googleScholarPapers.length,
    fetchedCount: payload.fetchedCount,
    archivedCount: payload.archivedCount,
    count: payload.count,
    errors: payload.errors,
    archiveFile: payload.archiveFile,
    cacheFile: payload.cacheFile,
    topTitles: payload.papers.slice(0, 10).map(paper => ({
      title: paper.title,
      journal: paper.journal,
      published: paper.published,
      doiPresent: Boolean(paper.doi)
    }))
  }, null, 2));
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
