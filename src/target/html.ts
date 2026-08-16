export function layout(title: string, body: string, extras = ""): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>${title} — CoreLink</title>
  <style>
    body { margin: 0; font-family: Tahoma, Verdana, sans-serif; font-size: 13px; background: #d6d2c8; color: #222; }
    #banner { background: #1b3a5f; color: #fff; padding: 6px 12px; }
    #banner b { font-size: 15px; letter-spacing: 0.04em; }
    #sub { background: #9aa7b5; padding: 3px 12px; font-size: 11px; }
    #main { margin: 16px; background: #fff; border: 1px solid #7a7a7a; padding: 12px; }
    table.tbl { border-collapse: collapse; }
    table.tbl td, table.tbl th { border: 1px solid #8a8a8a; padding: 4px 8px; }
    table.tbl th { background: #c5d0dc; text-align: left; }
    .err { color: #8b0000; font-weight: bold; margin: 8px 0; }
    .ok { color: #0b5; font-weight: bold; }
    .notice { position: fixed; inset: 0; background: rgba(0,0,0,.45); }
    .notice .box { width: 420px; margin: 12% auto; background: #fff; border: 2px solid #1b3a5f; padding: 16px; }
    input[type=text], select { font-family: Tahoma, sans-serif; font-size: 13px; }
    input[type=submit], button { font-size: 13px; }
    .mono { font-family: "Courier New", monospace; }
  </style>
</head>
<body>
  <div id="banner"><b>CoreLink</b> &nbsp; Member Servicing Console</div>
  <div id="sub">Institution: First Oak Credit Union (demo) &nbsp;|&nbsp; Operator: TELLER01 &nbsp;|&nbsp; Env: UAT</div>
  <div id="main">
    ${body}
  </div>
  ${extras}
</body>
</html>`;
}

export function noticeOverlay(): string {
  return `
  <div class="notice" role="dialog" aria-label="System Notice">
    <div class="box">
      <b>System Notice</b>
      <p>A scheduled maintenance window begins at 02:00 ET. Click OK to continue.</p>
      <form method="POST" action="/ack-notice">
        <input type="submit" value="OK" title="OK">
      </form>
    </div>
  </div>`;
}
