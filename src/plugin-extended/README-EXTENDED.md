SimpleLocate Extended Plugin
============================

This extended plugin builds on top of the original `leaflet-simple-locate` core and provides:

- Geofence API (polygon / bounds / center / radius) via options.geofence
- Configurable filtering modules: LowPass, Median, Kalman (runtime toggles & params)
- Last-good fallback, locationHistory and movement detection APIs
- Circle styling control (force dashArray), toggleable
- Settings panel (in-plugin) to adjust runtime parameters
- Optional WeiYe info panel and enriched `afterDeviceMove` payload
- Convenience alias: `L.simplelocate(options)` -> returns `L.Control.SimpleLocateExtended`

Loading order
------------
1. Include `src/leaflet-simple-locate.js` (original core)
2. Include `src/plugin-base/leaflet-simple-locate-core.js` (alias wrapper)
3. Include `src/plugin-extended/leaflet-simple-locate-extended.js`

Basic usage
-----------
```html
<script src="src/leaflet-simple-locate.js"></script>
<script src="src/plugin-base/leaflet-simple-locate-core.js"></script>
<script src="src/plugin-extended/leaflet-simple-locate-extended.js"></script>
<script>
  const control = L.simplelocate({
    geofence: {
      polygon: [{lat:...,lng:...}, ...]
    },
    advancedFiltering: true,
    settingsControl: true
  }).addTo(map);

  // Optionally add settings control explicitly
  control.addSettingsControlToMap(map);
</script>
```

API highlights
--------------
- `control.enableFeature(name, bool)` - toggle features (advancedFiltering, lastGoodLocation, circleWatcher, weiYePanel, settingsControl)  
- `control.setFilterModuleParams(moduleName, params)` - set params for lowpass/median/kalman  
- `control.setGeofence({ polygon: [...], bounds: [[minLat,minLng],[maxLat,maxLng]], center: [lat,lng], radius: m })`  
- `control.getLastGoodLocation()` - returns last good location object or null  
- `control.getLocationStats()` - returns stats object  
- `control.addWeiYeInfoControlToMap(map)` - adds info panel to map  
- `control.addSettingsControlToMap(map)` - adds settings control to map

Notes
-----
This extended plugin intentionally delegates core functionality to the original implementation and only adds orchestration, UI and runtime controls. For deep refactors you may fork the core.


