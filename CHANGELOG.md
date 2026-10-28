# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions
follow [Semantic Versioning](https://semver.org/). This file is generated at
each release from the Conventional Commits: do not edit it by hand.

## [0.1.0] - unreleased

### Added

- One device per followed station of NS (three in the form and up to 10 more with the "Add a station" button, typed by code or by name, filtered by train type and by direction): the next train as text with its delay and platform, the wait of the next two trains and the delay of the next one, in real time, from the official API of NS.
- On each station device, the disruptions, engineering works and calamities about the station: the traffic in one line and the number under way.
- Scene triggers: train leaving soon (2 to 30 minutes before, on the real-time estimate), train cancelled, train delayed (5, 10, 15 or 30 minutes), platform changed, disruption started and disruption over.
- Scene actions: read the next trains of a station (with delay and platform), and read the disruptions of a station, each with a ready-made sentence.
- Dashboard widgets: the departure board of one or several stations, with delays, platform changes and cancelled trains highlighted (any station can be typed in the widget); the disruptions and works of your stations, or of the whole Dutch network.
- Configuration actions: test the connection, find a station by name (with its code), add, list and remove stations, and a diagnostic written to the Logs tab (never the key).
- Cloud transport: the official API of NS with a free personal key (product "Ns-App"); one request per followed station every 30 seconds to 5 minutes, disruptions every 5 minutes, under the 300 requests per 5 minutes NS allows; the stations of NS kept in /data.
- English, French, German and Spanish everywhere: settings, devices, widgets, scenes and documentation.
