# Legacy prototypes

These files are preserved as migration references only. They are outside the pnpm
workspace, CI, production builds, and deployment paths.

- `office-spikes/`: independent Word, PowerPoint, and Excel Office.js experiments.
- `server-prototype/`: the local filesystem Express prototype used by those experiments.

Do not add dependencies here or use this code as a service boundary. Product behavior
must be reimplemented against the architecture decision records in `docs/adr/`.
