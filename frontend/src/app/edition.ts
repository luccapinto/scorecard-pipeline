// Which product this bundle is.
//
// `true` only in `vite build --mode showcase`, the public GitHub Pages demo
// (docs/adr/0006). There, API mode does not exist anywhere: no mode switch, no
// settings screen, no CORS diagnosis, and every API-mode URL resolves to its
// demonstration equivalent.
//
// It is a build-time literal, never a runtime flag, on purpose: a flag would
// hide the API code but still ship it, whereas a literal lets the bundler
// delete every branch it guards. scripts/check-showcase-bundle.mjs scans the
// built showcase bundle and fails if API-mode strings survived.
export const SHOWCASE: boolean = __SHOWCASE__;
