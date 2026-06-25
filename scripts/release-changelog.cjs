const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.join(__dirname, "..");
const changelogFile = path.join(rootDir, "CHANGELOG.md");
const packageFile = path.join(rootDir, "package.json");

function beijingDate() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
}

function readPackageVersion() {
  const payload = JSON.parse(fs.readFileSync(packageFile, "utf8"));
  if (!payload.version) throw new Error("package.json 缺少 version 字段");
  return payload.version;
}

function releaseChangelog(version, date) {
  const text = fs.readFileSync(changelogFile, "utf8");
  const unreleasedHeading = "## 未发布";
  const start = text.indexOf(unreleasedHeading);
  if (start < 0) throw new Error("CHANGELOG.md 中没有找到 `## 未发布`");

  const bodyStart = start + unreleasedHeading.length;
  const nextHeadingMatch = text.slice(bodyStart).match(/\n##\s+/);
  const bodyEnd = nextHeadingMatch ? bodyStart + nextHeadingMatch.index : text.length;
  const before = text.slice(0, bodyStart);
  const unreleasedBody = text.slice(bodyStart, bodyEnd).trim();
  const after = text.slice(bodyEnd).replace(/^\n+/, "");

  if (!unreleasedBody) throw new Error("`未发布` 区域为空，不需要归档");

  const releaseHeading = `## ${version} - ${date}`;
  if (text.includes(releaseHeading)) {
    throw new Error(`CHANGELOG.md 中已存在版本：${releaseHeading}`);
  }

  const nextText = [
    before.trimEnd(),
    "",
    releaseHeading,
    "",
    unreleasedBody,
    "",
    after.trimEnd()
  ].filter((part, index, parts) => part || index < parts.length - 1).join("\n");

  fs.writeFileSync(changelogFile, `${nextText}\n`, "utf8");
  return releaseHeading;
}

const version = process.argv[2] || readPackageVersion();
const date = process.argv[3] || beijingDate();
const heading = releaseChangelog(version, date);
console.log(`已归档 CHANGELOG.md：${heading}`);
