# CLAUDE.md

Project rules for coding assistants (Claude Code reads this file) and for human
contributors.

## What this is

A Gladys Assistant **external integration** for NS (Nederlandse Spoorwegen),
the Dutch railways: a Node.js service (Node 22+, ESM, no build step) that runs
in its own sandboxed Docker container and talks to Gladys through
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js),
its only runtime dependency. It reads the official API of NS
(`https://gateway.apiportal.ns.nl`, a free personal key of the "Ns-App"
product in the `Ocp-Apim-Subscription-Key` header): the next departures of
the followed stations in real time — three in the form, up to 10 more added
with the "Add a station" button —, the disruptions about them, and the
stations of NS (kept in /data).
Transport: cloud only.
Documentation of the API: https://apiportal.ns.nl (each route used is listed
at the top of `src/ns-api.js`).

## Commands

```bash
npm install
npm test                                  # node --test, the built-in runner
node --test test/widgets.test.js          # one file
DEBUG=gladys-integration-sdk npm test     # with the SDK debug logs
npm run lint                              # ESLint
npm run format:check                      # Prettier, as the CI runs it
npm run format                            # Prettier, fix in place
npx github:GladysAssistant/integration-store . --skip-image-check   # store checks
scripts/build-cover.sh                    # cover.jpg from docs/assets/cover.svg
docs/illustrations/render.sh              # docs/assets/widgets.<lang>.png
node .github/scripts/release.mjs next     # the version the next release would get
```

## Architecture

```
index.js                SDK wiring only (new GladysIntegration + createApp)
src/app.js              every handler, registered before connect(); the timers
src/ns-api.js           HTTP client of the NS API: routes, key header, errors, request budget
src/stations.js         the stations of NS in /data, typed codes and names -> stations
src/departures.js       departures -> passages (delay, platform, cancelled, type, destination, via)
src/disruptions.js      disruptions, works and calamities -> the state of a station
src/events.js           scene trigger transitions, payloads, scene action outputs
src/device.js           the station devices and their states
src/widgets.js          departures and disruptions dashboard widgets
src/store.js            /data/nederlandse-spoorwegen.json: stations, `seen`
src/time.js             times of day in the timezone of the instance (TZ)
src/config.js           configuration (key, three stations + `added_stations`, interval, language)
src/i18n.js             runtime texts, en / fr / de / es
gladys-assistant-integration.json   manifest
docs/{en,fr,de,es}.md   user documentation, re-hosted by the store
docs/illustrations/     generated widget images (render.sh, gen.mjs, render.js)
test/fixtures/          real answers of the API, reduced (recorded by perron, MIT)
.github/scripts/release.mjs         version, changelog, bump (tested in test/)
```

## Rules

- **External ids are forever**, and so is every key users store: device and
  feature external ids (`station:c-<station code>_t-<types>_to-<direction>`,
  e.g. `station:c-ut_t-ic_to-amersfoort`: the code of NS, never a public
  label that could change), feature `category` / `type` / `unit` / `min` /
  `max` / `step`, the keys of `config_schema`, `actions`, the widgets and
  their settings, scene triggers (fields, options, variables) and scene
  actions (fields, outputs), and the internal config keys `added_stations`
  (`[{ station, type, direction }]`, the station stored as its code) and
  `last_language`. `test/structure.test.js` compares them to
  `test/fixtures/discovery.baseline.json`: never update the baseline to make a
  test pass without a documented migration.
- **Category / type pairs.** The next train and the traffic are `text` /
  `text`, the waits and the delay `duration` / `integer` in minutes (0-180),
  the count of disruptions `counter-sensor` / `integer` (0-20). Without a
  train the waits are not published (a 0 would announce a train now); without
  real time the delay is not published.
- **`should_poll` stays false**: the integration reads on its own timer —
  each followed station in ONE request every `interval` (30 s to 5 min, 1 min
  by default; 10 min while no station announces a train in the next half
  hour), one station after the other, devices of one station sharing the
  request; the disruptions of each station every 5 min; the stations weekly.
  A widget or a scene action reuses a reading of less than 90 s.
- **Quota.** NS allows 300 requests per 5 minutes per key: the client refuses
  beyond `REQUEST_BUDGET` (250) and pauses after a 429 (Retry-After). Keep
  the number of stations bounded (`MAX_ADDED_STATIONS`).
- **The key.** A `secret` field, sent only in the `Ocp-Apim-Subscription-Key`
  header; never logged (the diagnostic says "set (32 characters)"). A 401 /
  403 is `auth`: the status says so and nothing retries in a loop.
- **Times.** NS dates carry their offset ("2026-10-06T09:24:00+0200"): read
  them with `parseNsDate()`. The delay is the gap between `actualDateTime`
  and `plannedDateTime`: NS gives no other. Never invent a delay.
- **Platforms.** `actualTrack` against `plannedTrack`: a change is shown
  ("platform 15 (changed)") and fired once per new platform.
- **Disruptions.** `DISRUPTION` → disrupted (major from impact 4), `MAINTENANCE`
  → info (disrupted from impact 4), `CALAMITY` → major. One counts between
  its start and its end; works starting in the next three days are "coming".
- **Events once.** `seen` (in /data) remembers the reminders fired, the
  trains watched (cancelled, delay mark, platform) and the disruptions under
  way per station. The first reading of a station is a baseline: nothing
  fires. A scene action or a widget never fires an event.
- **Source.** Keep "NS" and the time of the reading visible in the widgets,
  and the credit in the README, the docs and NOTICE.
- **The container rootfs is read-only.** Write only under `/data`.
- **Four languages.** Every user-facing text (manifest, runtime messages in
  `src/i18n.js`, `docs/*.md`, README) exists in English, French, German and
  Spanish. `test/i18n.test.js` checks it. Station names, destinations,
  messages and disruptions stay in English, as NS writes them (`lang=en`).
- **Widget images.** After any change to the content of a widget, run
  `docs/illustrations/render.sh` again and look at the four PNG files.
- **Versions belong to the Release workflow**: never edit `version` in
  `package.json`, the lockfile or the manifest, nor the `docker_image` tag.
  The version stays below 1.0.0 until the maintainer runs the Release workflow
  with `release-as: 1.0.0`.
- **Changelog.** Never edit CHANGELOG.md by hand, it is generated at the
  release. Write the PR title as the line the user will read.
- **Commits and PR titles** follow Conventional Commits, in English: `feat` ->
  minor, `fix` / `perf` -> patch, `!` or `BREAKING CHANGE:` -> major (minor
  below 1.0.0); `docs`, `chore`, `ci`, `test`, `style`, `refactor`, `build`
  release nothing.
- **Manifest.** Texts are objects `{ "en", "fr", "de", "es" }`; the catalog
  `description` holds 10 to 100 characters per language; the file stays under
  100 KB. `gladys_version` is `>=5.3.0` (widgets, scene triggers, catalog
  `keywords` and `countries`). Transport: `["cloud"]`. No permission; one
  secret (`api_key`).
- **Forum drafts** (`.github/forum-*.md`) are never committed.
- **Style.** Prettier formats, ESLint catches mistakes. Comments explain why,
  in English. Tests never touch the network (the fake gateway of
  `test/helpers/fixtures.js`).
