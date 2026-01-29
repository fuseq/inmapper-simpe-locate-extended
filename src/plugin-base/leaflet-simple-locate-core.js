// Wrapper: expose the existing SimpleLocate control as SimpleLocateCore
// This file should be loaded AFTER src/leaflet-simple-locate.js
(function () {
    if (typeof window === "undefined") return;

    if (typeof window.L === "undefined" || !window.L.Control) {
        console.warn("Leaflet not found. Include Leaflet before plugin-base wrapper.");
        return;
    }

    if (window.L.Control.SimpleLocate) {
        // Create an alias to preserve an independent copy namespace
        window.L.Control.SimpleLocateCore = window.L.Control.SimpleLocate;
        console.log("✅ SimpleLocateCore alias created.");
    } else {
        console.warn("SimpleLocate is not loaded yet. Make sure src/leaflet-simple-locate.js is included before plugin-base/leaflet-simple-locate-core.js");
    }
})();


