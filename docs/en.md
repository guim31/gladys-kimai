# Kimai

Bring your [Kimai](https://www.kimai.org) time tracking into Gladys: the
running timer, the hours of the day, the week and the month. A scene starts
a timer when you sit at your desk or arrive at the office, stops it when you
leave, and tells you when you have worked enough for today; a tap on the
dashboard stops the timer or switches project.

> **Feedback welcome.** This integration was tested against a real Kimai
> server (Docker image `kimai/kimai2:apache` 2.70.2 with MariaDB, October
> 2026), not yet in everyday use, and not against Kimai Cloud. If something
> does not work as described, please say so on the
> [Gladys forum](https://community.gladysassistant.com) or in the
> [issues](https://github.com/guim31/gladys-kimai/issues).

## What you need

- Gladys Assistant 5.1.0 or later.
- A **Kimai 2**, self-hosted and reachable from Gladys (the Docker image
  listens on port 8001), or a **Kimai Cloud** account.
- An **API token** of the Kimai user whose time you track. In Kimai: your
  avatar (top right) → **Edit** → **API access** → **Create**, give it a name
  (`Gladys`). Copy the token: Kimai shows it only once.

  Before Kimai 2.14 there were no API tokens, only an **API password** (same
  screen). It still works: fill in the **Username** field, and put the API
  password in the token field. Kimai marks this way as deprecated.

The integration sees the timesheets, projects and activities of this user,
and starts and stops timers **as this user**. A plain user (no admin role) is
enough.

## Set up

1. In Gladys, **Integrations** → install **Kimai**.
2. In the **Configuration** screen, fill in:
   - **Address**: the address of Kimai, for example
     `http://192.168.1.20:8001`, `https://kimai.example.org` behind a reverse
     proxy (a path prefix such as `/kimai` is kept), or `acme.kimai.cloud`.
     The address copied from the browser works too;
   - **API token**.
3. Options:
   - **Daily limit, in hours**: past it, the **Kimai daily limit reached**
     trigger fires, once a day: `8`, `7.5`, `7,5` or `7:30`. 8 hours by
     default; empty: off;
   - **Accept self-signed certificates**: for an `https://` address with a
     self-signed certificate, on your own server only;
   - **Refresh interval**: 30 seconds to 5 minutes (1 minute by default): how
     soon a timer started or stopped in Kimai shows up in Gladys. The
     durations move every minute whatever the interval;
   - **Language of the feature names**: the names given to the features when
     the device is added (French by default), and the texts sent to scenes.
4. Save, then **Test the connection**: it reads Kimai and gives its version,
   the user and the hours of the day.
5. In the **Discovery** tab, add the device **Kimai _user_**.

## Devices

One device, **Kimai _user_** (the alias of the user in Kimai, or the
username), with six features:

| Feature            | What it says                                                                                    |
| ------------------ | ----------------------------------------------------------------------------------------------- |
| `Timer running`    | on while a timer runs. A switch: off stops the timer, on resumes the last entry                 |
| `Current project`  | `Project · Activity` of the running timer; `No timer` otherwise                                 |
| `Timer duration`   | minutes since the running timer started; 0 otherwise                                            |
| `Hours today`      | hours of the entries that began today, the running one included                                 |
| `Hours this week`  | the same, since the first day of the week (Monday, or Sunday if so set in the profile in Kimai) |
| `Hours this month` | the same, since the first day of the month                                                      |

"Today" is the day in the time zone of Gladys. An entry counts for the day it
**begins** in, as in the Kimai reports: an entry from 23:00 to 01:00 belongs
to the first day. Breaks are taken off, as in Kimai.

"Resume the last entry" starts a new timer on the project, the activity and
the description of the last stopped entry, like the restart button of Kimai.

## Dashboard

The **Kimai timer** widget shows two tiles (today, this week; the first one
in orange past the daily limit), the running timer with its duration, and up
to four buttons: **Stop** while a timer runs, **Resume** otherwise, then the
three most recent project/activity couples: a tap switches to that project at
once (the running timer is stopped).

The features can also go on the dashboard as any device feature: the
`Timer running` switch is then a start/stop button.

## Scenes

### Triggers

- **Kimai timer started**: a timer started, from Gladys, the Kimai web app,
  the mobile app or anywhere else.
- **Kimai timer stopped**: a timer stopped, with its duration.
- **Kimai daily limit reached**: the hours of the day passed the **Daily
  limit** of the configuration. Once a day, at most a minute late, even while
  the timer runs.

Filters, for the first two: the project name and the activity name (exact
names; empty: any). Information passed on to the actions: the entry number,
the project, the activity, the customer, the description, and the duration in
minutes for a stopped timer. For the limit: the hours of the day, the limit,
whether a timer is running and its project.

Kimai is read every 30 seconds to 5 minutes: a timer started or stopped in
Kimai fires its trigger within that delay (at once when it comes from
Gladys). A timer started and stopped between two readings fires nothing. A
restart of the integration does not fire anything twice, and a timer stopped
while it was down fires when it starts again.

### Actions

- **Start a Kimai timer**: the **project** and the **activity** by name
  (case and accents ignored) or number, and an optional description. The
  activity is one of the project or a global one. **Stop the running timer**:
  ticked, a running timer is stopped first; unticked, a running timer is kept
  and nothing starts (Kimai allows one timer at a time by default; if it
  allows several, the new one starts beside the others). Results: the entry
  number, the project, the activity.
- **Stop the Kimai timer**: stops the running timer, if any (no error when
  none runs). Results: the number of timers stopped, the duration in minutes,
  the project, the activity.
- **Toggle the Kimai timer**: stops the running timer; when none runs,
  starts the project and activity given, or resumes the last entry when they
  are empty. Results: whether a timer runs afterwards, the duration of the
  stopped one, the project, the activity.

The fields accept scene variables.

### Scene ideas

- A button on the desk runs **Toggle the Kimai timer**: one press to start
  the day, one to stop it.
- When the phone of the user arrives at the office, **Start a Kimai timer**
  on `Office` / `Development`, with **Stop the running timer** ticked; when it
  leaves, **Stop the Kimai timer**.
- **Kimai daily limit reached**: dim the desk lamp and send "Enough for
  today: {{triggerEvent.data.hours_today}} h" on Telegram.
- When the computer switches off (a ping device), **Stop the Kimai timer**.

## Troubleshooting

- **"Kimai does not answer"**: check the address and the port from the Gladys
  machine (`http://<address>:8001` opens Kimai in a browser).
- **"API token refused"**: the token was deleted, has expired or was
  mistyped. With the old API password, check the **Username** too; with an
  API token, leave **Username** empty.
- **"No Kimai API at this address"**: the address answers, but not with the
  Kimai API: check the port, or the path prefix behind a reverse proxy.
- **"The address redirects"**: enter the `https://` address.
- **"No visible project has this name or number"**: the project is hidden,
  of a hidden customer, or the user is not in the team that can see it.
- **"A timer is already running"**: tick **Stop the running timer** in the
  action, or use **Toggle the Kimai timer**.
- **The hours differ from the Kimai screen**: Gladys counts the day in its own
  time zone, Kimai in the time zone of the user's profile: set the same one.
- Logs: `LOG_LEVEL=debug` on the container shows every reading.

## Limits

- One user per integration: the user of the token. To follow several users,
  each one needs their own Gladys integration (not possible today), or an
  admin token (not supported).
- Kimai is read every 30 seconds to 5 minutes, two requests per reading (the
  running timers, the entries since the start of the month or the week, 250
  per page, up to 10 pages), plus the projects, activities and customers
  every 30 minutes. Kimai webhooks (a plugin) are not used.
- The integration starts and stops timers, and resumes the last entry; it
  does not edit, delete or export entries, and ignores tags, rates and
  budgets.
- Tested with Kimai 2.70.2. Earlier 2.x versions should work, but were not
  tested, nor was Kimai Cloud. Kimai 1 is not supported.
- Gladys keeps no Kimai data beyond `/data/kimai-state.json` (the running
  timers last seen and the day the limit last fired, so that no event fires
  twice).
- Developed without a Kimai of everyday use: feedback welcome.
- Not affiliated with Kimai.
