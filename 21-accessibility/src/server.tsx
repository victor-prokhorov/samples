import { createServer } from "node:http";
import { renderToStaticMarkup } from "react-dom/server";
import { ReactElement } from "react";
import { empty, parse, validate } from "./address.js";
import { BadForm } from "./bad.js";
import { Done, GoodForm } from "./good.js";

export const PORT = 53031;

const html = (el: ReactElement) => "<!DOCTYPE html>" + renderToStaticMarkup(el);

const server = createServer(async (req, res) => {
  const path = new URL(req.url ?? "/", "http://x").pathname;
  const send = (status: number, el: ReactElement) => {
    res.writeHead(status, { "content-type": "text/html; charset=utf-8" });
    res.end(html(el));
  };
  const variant = path.startsWith("/bad") ? "bad" : path.startsWith("/good") ? "good" : null;
  if (!variant || (req.method !== "GET" && req.method !== "POST")) return res.writeHead(404).end("not found");
  const Form = variant === "bad" ? BadForm : GoodForm;
  if (path.endsWith("/done")) return send(200, <Done lang={variant === "good"} />);
  if (req.method === "GET") return send(200, <Form values={empty} errors={{}} />);
  let body = "";
  for await (const chunk of req) body += chunk;
  const values = parse(body);
  const errors = validate(values);
  if (Object.keys(errors).length) return send(422, <Form values={values} errors={errors} />);
  res.writeHead(303, { location: `/${variant}/done` }).end();
});

server.listen(PORT, () => console.log(`   [form server pid ${process.pid}] listening on :${PORT} (/bad and /good)`));
