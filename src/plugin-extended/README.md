Plugin extended (features) wrapper
==================================

This folder contains a small extension that builds on top of the core plugin alias
(`L.Control.SimpleLocateCore`) and exposes `L.Control.SimpleLocateExtended`.

Usage
-----
1. Include `src/leaflet-simple-locate.js`.
2. Include `src/plugin-base/leaflet-simple-locate-core.js`.
3. Include `src/plugin-extended/leaflet-simple-locate-extended.js`.
4. Use the extended control:

```js
const ext = new L.Control.SimpleLocateExtended().addTo(map);
```

Notes
-----
- The current extended wrapper provides a small example hook (`enableExtendedFeature`) and is intended
  as a starting point; add your features inside `src/plugin-extended/leaflet-simple-locate-extended.js`.


