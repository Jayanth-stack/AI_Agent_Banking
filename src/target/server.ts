import express from "express";
import { DENIED, MEMBERS } from "./data.js";
import { layout, noticeOverlay } from "./html.js";

const PORT = Number(process.env.TARGET_PORT ?? 3847);

function wantsNotice(req: express.Request): boolean {
  return !String(req.headers.cookie ?? "").includes("notice_ack=1");
}

function expired(req: express.Request): boolean {
  return req.query.expire === "1" || String(req.headers.cookie ?? "").includes("force_expire=1");
}

export function createTargetApp() {
  const app = express();
  app.use(express.urlencoded({ extended: false }));

  app.use((req, res, next) => {
    if (expired(req) && req.path !== "/expired") {
      res.redirect("/expired");
      return;
    }
    next();
  });

  app.get("/", (req, res) => {
    const err = req.query.error;
    const extras = wantsNotice(req) ? noticeOverlay() : "";
    const msg =
      err === "not_found"
        ? `<div class="err" role="alert">No member record matches the ID entered.</div>`
        : err === "validation"
          ? `<div class="err" role="alert">Member ID is required.</div>`
          : err === "denied"
            ? `<div class="err" role="alert">Permission denied: you are not authorized to view this member.</div>`
            : "";
    res.send(
      layout(
        "Member Search",
        `
        <h1>Member Search</h1>
        ${msg}
        <form method="POST" action="/search">
          <table class="tbl">
            <tr>
              <td>Member ID</td>
              <td><input type="text" name="member_id" title="Member ID" size="16"></td>
            </tr>
            <tr>
              <td>Last name</td>
              <td><input type="text" name="last_name" title="Last name" size="24"></td>
            </tr>
          </table>
          <p><input type="submit" value="Search" title="Search"></p>
        </form>
        <p class="mono">Hint (demo): 12345 Jane Doe · 22222 Robert Chen · 88888 restricted · 99999 not found</p>
      `,
        extras,
      ),
    );
  });

  app.post("/ack-notice", (req, res) => {
    res.setHeader("Set-Cookie", "notice_ack=1; Path=/");
    res.redirect("/");
  });

  app.post("/search", (req, res) => {
    const id = String(req.body.member_id ?? "").trim();
    if (!id) {
      res.redirect("/?error=validation");
      return;
    }
    if (DENIED.has(id)) {
      res.redirect("/?error=denied");
      return;
    }
    if (!MEMBERS[id]) {
      res.redirect("/?error=not_found");
      return;
    }
    res.redirect(`/member?id=${encodeURIComponent(id)}`);
  });

  app.get("/member", (req, res) => {
    const id = String(req.query.id ?? "");
    if (DENIED.has(id)) {
      res.redirect("/?error=denied");
      return;
    }
    const m = MEMBERS[id];
    if (!m) {
      res.redirect("/?error=not_found");
      return;
    }
    const rows = m.accounts
      .map(
        (a) =>
          `<tr><td>${a.type}</td><td class="mono">${a.number}</td><td>${a.balance}</td><td>${a.status}</td></tr>`,
      )
      .join("");
    res.send(
      layout(
        `Member ${m.id}`,
        `
        <h1>Member Profile</h1>
        <table class="tbl">
          <tr><td>Member ID</td><td class="mono">${m.id}</td></tr>
          <tr><td>Name</td><td>${m.name}</td></tr>
          <tr><td>Status</td><td>${m.status}</td></tr>
          <tr><td>Member since</td><td>${m.since}</td></tr>
        </table>
        <h2>Accounts</h2>
        <table class="tbl">
          <tr><th>Type</th><th>Number</th><th>Balance</th><th>Status</th></tr>
          ${rows}
        </table>
        <p>
          <a href="/member/subaccount?id=${encodeURIComponent(m.id)}">Open sub-account</a>
          &nbsp;|&nbsp;
          <a href="/">New search</a>
        </p>
      `,
      ),
    );
  });

  app.get("/member/subaccount", (req, res) => {
    const id = String(req.query.id ?? "");
    const m = MEMBERS[id];
    if (!m) {
      res.redirect("/?error=not_found");
      return;
    }
    res.send(
      layout(
        "Open sub-account",
        `
        <h1>Open Sub-Account</h1>
        <p>Member ${m.id} — ${m.name}</p>
        <form method="POST" action="/member/subaccount">
          <input type="hidden" name="member_id" value="${m.id}">
          <table class="tbl">
            <tr>
              <td>Product</td>
              <td>
                <select name="product" title="Product">
                  <option value="savings">Savings</option>
                  <option value="money_market">Money Market</option>
                </select>
              </td>
            </tr>
            <tr>
              <td>Nickname</td>
              <td><input type="text" name="nickname" title="Nickname" size="24"></td>
            </tr>
          </table>
          <p><input type="submit" value="Submit" title="Submit"></p>
        </form>
      `,
      ),
    );
  });

  app.post("/member/subaccount", (req, res) => {
    const id = String(req.body.member_id ?? "");
    const product = String(req.body.product ?? "savings");
    const nickname = String(req.body.nickname ?? "").trim();
    if (!MEMBERS[id]) {
      res.redirect("/?error=not_found");
      return;
    }
    if (!nickname) {
      res.redirect(`/member/subaccount?id=${encodeURIComponent(id)}&error=validation`);
      return;
    }
    res.redirect(
      `/confirm?id=${encodeURIComponent(id)}&product=${encodeURIComponent(product)}&nickname=${encodeURIComponent(nickname)}`,
    );
  });

  app.get("/confirm", (req, res) => {
    const id = String(req.query.id ?? "");
    const m = MEMBERS[id];
    if (!m) {
      res.redirect("/?error=not_found");
      return;
    }
    res.send(
      layout(
        "Confirmation",
        `
        <h1>Confirmation</h1>
        <p class="ok" role="status">Sub-account request accepted.</p>
        <table class="tbl">
          <tr><td>Confirmation #</td><td class="mono">CNF-${m.id}-8841</td></tr>
          <tr><td>Member</td><td>${m.name} (${m.id})</td></tr>
          <tr><td>Product</td><td>${String(req.query.product ?? "")}</td></tr>
          <tr><td>Nickname</td><td>${String(req.query.nickname ?? "")}</td></tr>
        </table>
        <p><a href="/">Return to search</a></p>
      `,
      ),
    );
  });

  app.get("/expired", (_req, res) => {
    res.send(
      layout(
        "Session expired",
        `<h1>Session expired</h1><p class="err" role="alert">Your teller session has expired. Sign in again to continue.</p>`,
      ),
    );
  });

  app.get("/health", (_req, res) => res.json({ ok: true }));

  return app;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("server.ts")) {
  const app = createTargetApp();
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`CoreLink UAT listening on http://127.0.0.1:${PORT}`);
  });
}
