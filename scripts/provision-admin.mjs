#!/usr/bin/env node
/**
 * Helper to call the first-administrator provisioning endpoint.
 *
 * This does NOT touch the database directly. It calls the deployed Worker's
 * /api/provision/first-admin endpoint, authenticated with the ADMIN_PROVISION_TOKEN
 * secret you configured on the Worker. The endpoint only ever succeeds once.
 *
 * Usage:
 *   node scripts/provision-admin.mjs \
 *     --url https://your-worker.example.workers.dev \
 *     --token "$ADMIN_PROVISION_TOKEN" \
 *     --username firstadmin \
 *     [--password "ChooseAStrongOne1!"]
 *
 * If --password is omitted, the server generates a temporary password and returns
 * it once; you will be required to change it at first login.
 */

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    }
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const url = args.url || process.env.WORKER_URL;
  const token = args.token || process.env.ADMIN_PROVISION_TOKEN;
  const username = args.username;
  const password = args.password;

  if (!url || !token || !username) {
    console.error(
      "Missing required args.\n" +
        "Required: --url <worker url> --token <ADMIN_PROVISION_TOKEN> --username <name>\n" +
        "Optional: --password <password> (omit to have one generated)"
    );
    process.exit(1);
  }

  const endpoint = url.replace(/\/+$/, "") + "/api/provision/first-admin";
  const body = { username };
  if (password) body.password = password;

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }

  if (!res.ok) {
    console.error(`Provisioning failed (HTTP ${res.status}):`);
    console.error(data);
    process.exit(1);
  }

  console.log("First administrator provisioned.");
  console.log(`  Username: ${data.username}`);
  if (data.temporaryPassword) {
    console.log(`  Temporary password: ${data.temporaryPassword}`);
    console.log("  You MUST change this at first login.");
  } else {
    console.log("  Use the password you supplied. You will be asked to change it at first login.");
  }
  console.log(
    "\nSecurity: rotate/remove the ADMIN_PROVISION_TOKEN secret now that the admin exists:\n" +
      "  wrangler secret delete ADMIN_PROVISION_TOKEN"
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
