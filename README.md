# Kimai for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that brings the time tracking of [Kimai](https://www.kimai.org) (self-hosted
Kimai 2 or Kimai Cloud) into Gladys: the running timer, the hours of the day,
the week and the month, and timers started and stopped from a scene, the
dashboard or a switch.

> **Feedback welcome.** The integration was checked against a real Kimai
> server (Docker image `kimai/kimai2:apache` 2.70.2 with MariaDB, October
> 2026), but not yet in everyday use with a real Gladys, nor against Kimai
> Cloud. Please report what works and what does not in the
> [issues](https://github.com/guim31/gladys-kimai/issues).

## Features

- **A device for the user of the API token**, with six features: _timer
  running_ (a switch: off stops the timer, on resumes the last entry),
  _current project_ (`Project · Activity`), _timer duration_ (minutes), and
  the _hours today_, _this week_ and _this month_ (running timer included).
- **Dashboard widget** "Kimai timer": the hours of the day and the week, the
  running timer with its duration, a Stop or Resume button and three buttons
  to switch to one of the last projects.
- **Scene triggers**: _Kimai timer started_ and _Kimai timer stopped_ (with
  its duration), filtered by project and activity, wherever the timer was
  started (Gladys, the Kimai web or mobile app); _Kimai daily limit reached_,
  once a day past the limit set in the configuration (8 hours by default).
- **Scene actions**: _Start a Kimai timer_ (project and activity by name or
  number, the running timer stopped first if ticked), _Stop the Kimai timer_
  and _Toggle the Kimai timer_.
- The durations and the daily limit move every minute between two readings,
  without a request; Kimai is read every 30 seconds to 5 minutes (1 minute by
  default).
- A **Test the connection** button, a connection status that names the
  problem (token refused, no Kimai at this address, certificate…), and a
  transport badge (local, or cloud for `*.kimai.cloud`).
- Every text in English, French, German and Spanish.

## Requirements

- Gladys Assistant **5.1.0** or later (widgets, scene triggers and actions).
- A **Kimai 2** reachable from Gladys, or a Kimai Cloud account, and an **API
  token** of the user whose time is tracked (Kimai → your avatar → Edit → API
  access → Create). The old API password (Kimai before 2.14) works too, with
  the username. A plain user is enough; the integration acts as this user.

## Installation

1. In Gladys, open **Integrations** → **Install from GitHub** and enter the
   address of this repository: `https://github.com/guim31/gladys-kimai`
   (or install **Kimai** from the catalog once it is listed).
2. In **Configuration**, enter the address of Kimai
   (`http://192.168.1.20:8001`, `https://kimai.example.org`,
   `acme.kimai.cloud`…) and the API token. Save, then click **Test the
   connection**.
3. Open the **Discover** tab and add the device.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

The integration uses the REST API of Kimai, `/api`, with the API token in the
`Authorization: Bearer` header (or `X-AUTH-USER` / `X-AUTH-TOKEN` for the old
API password):

| Request                                                  | Use                                                  |
| -------------------------------------------------------- | ---------------------------------------------------- |
| `GET /api/version`, `GET /api/users/me`                  | version, the user (id, time zone, first weekday)     |
| `GET /api/config/timesheet`                              | how many timers may run at once                      |
| `GET /api/timesheets/active`                             | the running timers                                   |
| `GET /api/timesheets?begin=…&size=250&page=N`            | the entries since the start of the week or the month |
| `GET /api/projects`, `/api/activities`, `/api/customers` | names, every 30 minutes                              |
| `POST /api/timesheets`                                   | start a timer                                        |
| `PATCH /api/timesheets/{id}/stop`, `…/{id}/restart`      | stop a timer, resume an entry                        |

Kimai is read on a timer of the container; the device is published with
`should_poll: false`. States are published only when they change, and every
12 hours otherwise. A started or stopped timer is a change of the list of
running timers between two readings; the ids last seen are kept in
`/data/kimai-state.json`, with the day the daily limit last fired. Kimai
webhooks (a plugin) are not used.

## Checked on a real Kimai, and what was not

Checked against `kimai/kimai2:apache` 2.70.2 with MariaDB 11 in a Docker
network: a plain user with an API token and with the old API password, a
customer, two projects, a global and a project activity, entries over two
months, timers started, stopped and restarted through the API. The real
answers are in `test/fixtures/kimai/` and drive the tests; the integration ran
in its own container under the Gladys sandbox limits (read-only root, no
capabilities, 256 MB) against that server and the SDK's fake Gladys.

Not checked: a real Gladys instance, Kimai Cloud, Kimai versions before 2.70,
Kimai behind a reverse proxy with a path prefix.

## Limitations

- One user: the user of the token.
- Starts, stops and resumes timers; does not edit, delete or export entries.
- A timer started or stopped in Kimai shows up within the refresh interval;
  one started and stopped between two readings fires no trigger.
- An entry counts for the day it begins in, as in the Kimai reports.

## Development

```bash
npm ci
npm run format:check
npm run lint
npm test
npx -y github:GladysAssistant/integration-store --skip-image-check .
```

The tests use the fake Gladys of the SDK (`@gladysassistant/integration-sdk/testing`)
and an in-memory Kimai (`test/helpers/fakeKimai.js`) built from real answers.
See [`CLAUDE.md`](CLAUDE.md) for the project rules.

## Credits

- [Kimai](https://www.kimai.org) by Kevin Papst and its contributors
  (AGPL-3.0): the integration only talks to its API; no code was copied. The
  cover uses the Kimai logo from its
  [repository](https://github.com/kimai/kimai) (`public/touch-icon-192x192.png`),
  to name the service.
- The architecture and the conformity tests follow
  [gladys-vikunja](https://github.com/guim31/gladys-vikunja) and
  [gladys-wled](https://github.com/guim31/gladys-wled).

## Disclaimer

This project is not affiliated with, endorsed or sponsored by Kimai. The
Kimai name and logo belong to their owners.

## License

Apache-2.0
