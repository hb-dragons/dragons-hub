import { writeFileSync } from "fs";
import { sdkClient } from "./sync/sdk-client";

async function test() {
  const matchInfo = await sdkClient.sdk.match.getMatchInfo({
    matchId: 2676378,
  });
  writeFileSync("match-info.json", JSON.stringify(matchInfo, null, 2), "utf-8");
  const matchBoxscore = await sdkClient.sdk.match.getBoxscore({
    matchId: 2676378,
  });
  writeFileSync(
    "match-boxscore.json",
    JSON.stringify(matchBoxscore, null, 2),
    "utf-8",
  );
  const match = await sdkClient.sdk.match.getMatchById({
    matchId: 2676378,
  });
  writeFileSync("match.json", JSON.stringify(match, null, 2), "utf-8");
}

await test();
