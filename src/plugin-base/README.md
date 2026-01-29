Plugin base (core) wrapper
===========================

This folder contains a tiny wrapper that exposes the existing `L.Control.SimpleLocate` implementation
under the `L.Control.SimpleLocateCore` name. It's intentionally lightweight — it does not duplicate code,
it just creates an alias and logs a message.

Usage
-----
1. Make sure `src/leaflet-simple-locate.js` is included in the page.
2. Include `src/plugin-base/leaflet-simple-locate-core.js`.
3. The core class will be available as `L.Control.SimpleLocateCore`.

Why this approach?
------------------
- Avoids duplicating the large original file while giving a stable entrypoint for extensions.
- Keeps maintenance simple: fixes to the original plugin remain in `src/leaflet-simple-locate.js`.


