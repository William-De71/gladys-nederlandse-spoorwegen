// Builds the widget contents of the illustrations with the integration's own
// code: node gen.mjs <repo> <out.json> (run by render.sh)
//
// The two widgets on a real Tuesday morning at Utrecht Centraal: the answers
// of the NS API read on 2026-10-06 around 09:20 and kept in test/fixtures
// (departures of Utrecht, disruptions of the network) go through the real
// parsers (src/departures.js, src/disruptions.js) and the real widget
// builders (src/widgets.js). Added to show what the widgets do with them: a
// cancelled Sprinter, a signal failure at Utrecht and works coming tomorrow.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const [repo, out] = process.argv.slice(2);
const load = (path) => import(pathToFileURL(`${repo}/${path}`).href);
const { buildDeparturesWidget, buildDisruptionsWidget } = await load('src/widgets.js');
const { parsePassages } = await load('src/departures.js');
const { parseDisruptions, stationTraffic } = await load('src/disruptions.js');
const { LANGUAGES } = await load('src/i18n.js');
const { departure, disruption } = await load('test/helpers/fixtures.js');
const fixture = (name) => JSON.parse(readFileSync(`${repo}/test/fixtures/${name}`, 'utf8'));
const manifest = JSON.parse(readFileSync(`${repo}/gladys-assistant-integration.json`, 'utf8'));

// Tuesday 6 October 2026, 09:20:30 in Amsterdam.
const NOW = Date.parse('2026-10-06T07:20:30Z');
const TZ = 'Europe/Amsterdam';

const passages = parsePassages([
  ...fixture('departures.json').payload.departures,
  departure({
    at: '09:26',
    cancelled: true,
    category: 'SPR',
    number: '6928',
    direction: 'Woerden',
    track: '11',
  }),
]);
const all = parseDisruptions([
  ...fixture('disruptions.json'),
  disruption(),
  disruption({
    id: '7100002',
    type: 'MAINTENANCE',
    isActive: false,
    title: 'Utrecht - Gouda.',
    impact: { value: 4 },
    start: '2026-10-07T21:00:00+0200',
    end: '2026-10-08T05:00:00+0200',
    publicationSections: [
      {
        section: {
          stations: [
            { stationCode: 'UT', name: 'Utrecht Centraal' },
            { stationCode: 'GD', name: 'Gouda' },
          ],
        },
        consequence: { description: 'no trains', level: 'NO_TRAINS' },
      },
    ],
    timespans: [
      {
        situation: { label: 'Due to engineering works: between Utrecht and Gouda no trains run.' },
        cause: { label: 'engineering works' },
        advices: ['Buses run between Utrecht Centraal and Gouda.'],
      },
    ],
  }),
]);
const at = (code) => all.filter((entry) => entry.stations.includes(code));
const stations = [
  { name: 'Utrecht Centraal', traffic: stationTraffic(at('UT'), NOW) },
  { name: 'Rotterdam Centraal', traffic: stationTraffic(at('RTD'), NOW) },
];

const contents = {};
for (const language of LANGUAGES) {
  contents[language] = {
    departures: buildDeparturesWidget({
      title: 'Utrecht Centraal',
      passages,
      readAt: NOW,
      count: 7,
      language,
      now: NOW,
      timeZone: TZ,
    }),
    disruptions: buildDisruptionsWidget({
      stations,
      readAt: NOW - 2 * 60 * 1000,
      language,
      now: NOW,
      timeZone: TZ,
    }),
  };
}
const widgets = Object.fromEntries(
  manifest.widgets.map((w) => [w.key, { icon: w.icon, label: w.label }]),
);
writeFileSync(out, JSON.stringify({ now: NOW, widgets, contents }));
