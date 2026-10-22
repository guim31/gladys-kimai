# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.0] - 2026-10-22

### Added

- Kimai time tracking in Gladys: one device for the user of the API token,
  with the running timer (a switch: off stops it, on resumes the last entry),
  the current project and activity, the duration of the running timer, and
  the hours of the day, the week and the month.
- Dashboard widget "Kimai timer": the hours of the day and the week, the
  running timer, and buttons to stop it, resume the last entry or switch to
  one of the three last projects.
- Scene triggers "Kimai timer started", "Kimai timer stopped" (with its
  duration) and "Kimai daily limit reached" (once a day, past the limit set
  in the configuration), with project and activity filters.
- Scene actions "Start a Kimai timer" (project and activity by name or
  number, the running timer stopped first if ticked), "Stop the Kimai timer"
  and "Toggle the Kimai timer".
- Self-hosted Kimai 2 or Kimai Cloud, with an API token, or the old API
  password and the username.
- A "Test the connection" button and a connection status naming the problem.
- Every text in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-kimai/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/guim31/gladys-kimai/releases/tag/v1.0.0
