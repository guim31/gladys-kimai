# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- the **Kimai API token** (or the old API password with its username),
  stored by Gladys in the integration configuration (a `secret` field), sent
  only to the configured Kimai address in the `Authorization` (or
  `X-AUTH-TOKEN`) header, and never logged. It gives the rights of its user:
  use a plain user, not an administrator;
- under `/data`, only `kimai-state.json`: the configured address, the Kimai
  user id, the ids of the running timers last seen and the day the daily
  limit last fired (no token, no timesheet);
- network: outgoing HTTP(S) requests to the configured Kimai address only
  (self-hosted, or `*.kimai.cloud`). With "Accept self-signed certificates"
  ticked, the certificate of that address is not verified.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
and Kimai itself.
