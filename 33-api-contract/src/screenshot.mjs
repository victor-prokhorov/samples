// node src/screenshot.mjs: two viewport-sized shots of out/api-reference.html, offline (every request off the
// file is blocked, so a page that still needed a CDN would render blank). Uses the shared tools/render.mjs.
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { withPage } from "../../tools/render.mjs";

const page = pathToFileURL(resolve("out/api-reference.html")).href;
const blocked = new Set();

await withPage(
  async (p) => {
    await p.route(/^https?:/, (route) => {
      blocked.add(route.request().url());
      return route.abort();
    });
    await p.goto(page);
    await p.getByRole("heading", { name: /Member Portal API/ }).first().waitFor();
    await p.waitForTimeout(500); // let Redoc finish hydrating the prerendered page before the picture
    await p.screenshot({ path: "screenshots/api-reference.png" });
    console.log("screenshots/api-reference.png: the top of the reference");

    await p.goto(`${page}#tag/contributions/operation/listMemberContributions`);
    await p.getByText("Deprecated", { exact: true }).first().waitFor();
    await p.getByRole("button", { name: /200 Every contribution/ }).click(); // open the 200 to show its three headers
    await p.getByText("Sunset", { exact: true }).first().waitFor();
    await p.waitForTimeout(500);
    await p.screenshot({ path: "screenshots/api-reference-deprecated.png" });
    console.log("screenshots/api-reference-deprecated.png: the deprecated operation and its headers");
  },
  { width: 1280, height: 1000 },
);
console.log(`requests to the network (blocked): ${blocked.size ? [...blocked].join(", ") : "none"}`);
