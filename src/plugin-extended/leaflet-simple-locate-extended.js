// Extended plugin: builds on top of SimpleLocateCore
// Load this AFTER plugin-base wrapper.
(function () {
    if (typeof window === "undefined") return;
    if (typeof window.L === "undefined" || !window.L.Control) {
        console.warn("Leaflet not found. Include Leaflet before extended plugin.");
        return;
    }

    const Base = window.L.Control.SimpleLocateCore || window.L.Control.SimpleLocate;
    if (!Base) {
        console.warn("Base SimpleLocate not found. Make sure plugin-base is loaded.");
        return;
    }

    const Extended = Base.extend({
        initialize: function (options) {
            // call base initialize
            Base.prototype.initialize.call(this, options);

            // Extended defaults and feature flags
            this._extendedFeatures = true;
            this.options = this.options || {};

            // Accept geofence via options.geofence (polygon / bounds / center / radius)
            if (options && options.geofence) {
                try {
                    this.setGeofence(options.geofence);
                } catch (e) {
                    console.warn("Failed to set geofence from options:", e);
                }
            }

            // Feature toggles (use core options where appropriate)
            this._features = {
                advancedFiltering: !!options.advancedFiltering || !!this.options.enableFiltering,
                lastGoodLocation: options.lastGoodLocation !== undefined ? !!options.lastGoodLocation : !!this.options.enableLastGoodLocation,
                circleWatcher: options.circleWatcher !== undefined ? !!options.circleWatcher : true,
                weiYePanel: options.weiYePanel !== undefined ? !!options.weiYePanel : false,
                settingsControl: options.settingsControl !== undefined ? !!options.settingsControl : false
            };

            // Create settings control if requested (will be added to map when addTo called)
            if (this._features.settingsControl) {
                this._createSettingsControl();
            }
            // Wrap afterDeviceMove callback to enrich payload (if provided)
            try {
                const origAfter = this.options.afterDeviceMove || (options && options.afterDeviceMove);
                if (origAfter && typeof origAfter === "function") {
                    const self = this;
                    this._origAfterDeviceMove = origAfter;
                    this.options.afterDeviceMove = function (location) {
                        const enriched = self._enrichLocationPayload(location);
                        try { self._origAfterDeviceMove(enriched); } catch (e) { console.error(e); }
                    };
                }
            } catch (e) {
                console.warn("Error wrapping afterDeviceMove:", e);
            }
        },

        // Enable an extended feature at runtime
        enableFeature: function (name, enabled) {
            if (!this._features || !(name in this._features)) {
                console.warn("Unknown feature:", name);
                return;
            }
            this._features[name] = !!enabled;
            // Sync to underlying core options where applicable
            if (name === "advancedFiltering") this.options.enableFiltering = !!enabled;
            if (name === "lastGoodLocation") this.options.enableLastGoodLocation = !!enabled;
            if (name === "circleWatcher") this.options.enableCircleWatcher = !!enabled;
            if (name === "weiYePanel") this.options.showFilterInfo = !!enabled;
            console.log("Feature", name, "set to", !!enabled);
        },

        // Update filter parameters
        setFilterParams: function (params) {
            if (!params) return;
            if (params.medianWindowSize !== undefined) this.options.medianWindowSize = params.medianWindowSize;
            if (params.kalmanProcessNoise !== undefined) this.options.kalmanProcessNoise = params.kalmanProcessNoise;
            if (params.kalmanMeasurementNoise !== undefined) this.options.kalmanMeasurementNoise = params.kalmanMeasurementNoise;
            if (params.lowPassFilterTau !== undefined) this.options.lowPassFilterTau = params.lowPassFilterTau;
            // Apply to existing filter objects if present
            if (this._medianFilter) this._medianFilter.windowSize = this.options.medianWindowSize;
            if (this._kalmanFilter) {
                this._kalmanFilter.Q_lat = this.options.kalmanProcessNoise;
                this._kalmanFilter.Q_lng = this.options.kalmanProcessNoise;
                this._kalmanFilter.R_lat = this.options.kalmanMeasurementNoise;
                this._kalmanFilter.R_lng = this.options.kalmanMeasurementNoise;
            }
            if (this._lowPassFilterLat && this._lowPassFilterLat.setTau) {
                this._lowPassFilterLat.setTau(this.options.lowPassFilterTau);
                this._lowPassFilterLng.setTau(this.options.lowPassFilterTau);
            }
        },

        // Wrapper to call core setGeofence
        setGeofence: function (options) {
            Base.prototype.setGeofence.call(this, options);
        },

        // Enable/disable individual filter modules at runtime
        enableFilterModule: function (moduleName, enabled) {
            enabled = !!enabled;
            switch (moduleName) {
                case "lowpass":
                    this.options.enableLowPassFilter = enabled;
                    break;
                case "median":
                    // median applied via window size; toggling means setting window to 1 to disable
                    if (!enabled) this.options.medianWindowSize = 1;
                    this.options._medianEnabled = enabled;
                    break;
                case "kalman":
                    this.options._kalmanEnabled = enabled;
                    break;
                default:
                    console.warn("Unknown filter module:", moduleName);
            }
            console.log("Filter module", moduleName, "enabled=", enabled);
        },

        // Set parameters for a specific filter module
        setFilterModuleParams: function (moduleName, params) {
            if (!params) return;
            switch (moduleName) {
                case "lowpass":
                    if (params.tau !== undefined) {
                        this.options.lowPassFilterTau = params.tau;
                        if (this._lowPassFilterLat && this._lowPassFilterLat.setTau) {
                            this._lowPassFilterLat.setTau(params.tau);
                            this._lowPassFilterLng.setTau(params.tau);
                        }
                    }
                    break;
                case "median":
                    if (params.windowSize !== undefined) {
                        this.options.medianWindowSize = params.windowSize;
                        if (this._medianFilter) this._medianFilter.windowSize = params.windowSize;
                    }
                    break;
                case "kalman":
                    if (params.processNoise !== undefined) this.options.kalmanProcessNoise = params.processNoise;
                    if (params.measurementNoise !== undefined) this.options.kalmanMeasurementNoise = params.measurementNoise;
                    if (this._kalmanFilter) {
                        this._kalmanFilter.Q_lat = this.options.kalmanProcessNoise;
                        this._kalmanFilter.Q_lng = this.options.kalmanProcessNoise;
                        this._kalmanFilter.R_lat = this.options.kalmanMeasurementNoise;
                        this._kalmanFilter.R_lng = this.options.kalmanMeasurementNoise;
                    }
                    break;
                default:
                    console.warn("Unknown filter module for params:", moduleName);
            }
        },

        // Simple settings control creation (not automatically added to map here)
        _createSettingsControl: function () {
            if (this._settingsControl) return;
            const self = this;
            const SettingsControl = L.Control.extend({
                options: { position: "topright" },
                onAdd: function () {
                    const container = L.DomUtil.create("div", "leaflet-control-extended-settings");
                    container.style.padding = "6px";
                    container.style.background = "white";
                    container.style.borderRadius = "6px";
                    container.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";

                    const btn = L.DomUtil.create("button", "", container);
                    btn.textContent = "⚙️ Plugin Ayarları";
                    btn.style.cursor = "pointer";

                    L.DomEvent.on(btn, "click", L.DomEvent.stopPropagation);
                    L.DomEvent.on(btn, "click", L.DomEvent.preventDefault);
                    L.DomEvent.on(btn, "click", () => {
                        // Prompt-based quick settings (minimal UI)
                        const thr = prompt("Marker görünürlük eşiği (m):", self.options.markerVisibilityThreshold || 30);
                        if (thr !== null) {
                            const v = parseFloat(thr);
                            if (!isNaN(v)) self.options.markerVisibilityThreshold = v;
                        }
                        const maxAcc = prompt("Max acceptable accuracy (m):", self.options.maxAcceptableAccuracy || 50);
                        if (maxAcc !== null) {
                            const a = parseFloat(maxAcc);
                            if (!isNaN(a)) self.options.maxAcceptableAccuracy = a;
                        }
                        alert("Ayarlar uygulandı.");
                    });

                    return container;
                }
            });
            this._settingsControl = new SettingsControl();
        },

        // expose a convenience method to add settings control to a map
        addSettingsControlToMap: function (map) {
            if (!this._settingsControl) this._createSettingsControl();
            if (this._settingsControl && map) this._settingsControl.addTo(map);
        },

        // Override addTo to also add settings control automatically when plugin is added to map
        addTo: function (map) {
            const control = Base.prototype.addTo.call(this, map);
            // If settings control was requested, add it now
            if (this._features && this._features.settingsControl) {
                this.addSettingsControlToMap(map);
            }
            // If wei-ye panel enabled, add it
            if (this._features && this._features.weiYePanel) {
                this.addWeiYeInfoControlToMap(map);
            }
            return control;
        },

        // small example hook
        enableExtendedFeature: function () {
            this._extendedFeatureEnabled = true;
            console.log("Extended feature enabled");
        }
        ,

        /* Last-good and movement APIs */
        getLastGoodLocation: function () {
            return this._lastGoodLocation || null;
        },

        clearLastGoodLocation: function () {
            this._lastGoodLocation = {
                latitude: null,
                longitude: null,
                accuracy: null,
                timestamp: null,
                confidence: 0
            };
            console.log("Last good location cleared");
        },

        getLocationStats: function () {
            return this._locationStats ? { ...this._locationStats } : {};
        },

        // Circle watcher control (delegates to core methods if present)
        enableCircleWatcher: function (enable) {
            enable = !!enable;
            this.options.enableCircleWatcher = enable;
            if (enable) {
                if (typeof this._startCircleStyleWatcher === "function") this._startCircleStyleWatcher();
            } else {
                if (typeof this._stopCircleStyleWatcher === "function") this._stopCircleStyleWatcher();
            }
            console.log("Circle watcher set to", enable);
        },

        /* WeiYe info control (simple) */
        addWeiYeInfoControlToMap: function (map) {
            if (this._weiYeInfoControl) {
                // already present
                return this._weiYeInfoControl;
            }

            const WeiYeInfoControl = L.Control.extend({
                options: { position: "topright" },
                onAdd: function (map) {
                    this._container = L.DomUtil.create("div", "leaflet-control-wei-ye-info");
                    this._container.style.padding = "8px";
                    this._container.style.background = "white";
                    this._container.style.borderRadius = "6px";
                    this._container.style.boxShadow = "0 2px 6px rgba(0,0,0,0.15)";
                    this._container.innerHTML = `
                        <div style="font-weight:600;margin-bottom:6px;">Konum Bilgisi</div>
                        <div>Doğruluk: <span class="accuracy-value">--</span> m</div>
                        <div>Güvenilirlik: <span class="confidence-value">--</span>%</div>
                        <div>Durum: <span class="status-value">--</span></div>
                    `;
                    return this._container;
                },
                update: function (stats) {
                    if (!this._container) return;
                    const acc = this._container.querySelector(".accuracy-value");
                    const conf = this._container.querySelector(".confidence-value");
                    const st = this._container.querySelector(".status-value");
                    if (acc && stats.accuracy !== undefined) acc.textContent = Math.round(stats.accuracy);
                    if (conf && stats.confidence !== undefined) conf.textContent = Math.round(stats.confidence);
                    if (st) st.textContent = stats.isRejected ? "ALAN DIŞI" : (stats.isFallback ? "Tahmini" : "Normal");
                }
            });

            this._weiYeInfoControl = new WeiYeInfoControl().addTo(map);
            return this._weiYeInfoControl;
        },

        /* Internal: enrich payload passed to user afterDeviceMove */
        _enrichLocationPayload: function (location) {
            const geofenceResult = (typeof this._isInsideGeofence === "function") ? this._isInsideGeofence(location.lat, location.lng) : { inside: true };
            const speedResult = (typeof this._checkSpeedValidity === "function") ? this._checkSpeedValidity(location.lat, location.lng, location.timestamp || Date.now()) : { valid: true, speed: 0 };
            let confidence = 100;
            if (typeof this._calculateLocationConfidence === "function") {
                try {
                    confidence = this._calculateLocationConfidence(location, geofenceResult, speedResult);
                } catch (e) {
                    // fallback
                    confidence = 0;
                }
            }

            return Object.assign({}, location, {
                confidence: confidence,
                geofence: geofenceResult,
                speedCheck: speedResult,
                locationStats: this._locationStats
            });
        }
    });

    // Factory
    window.L.Control.SimpleLocateExtended = function (options) {
        return new Extended(options);
    };

    console.log("✅ SimpleLocateExtended is available as L.Control.SimpleLocateExtended");
})();

// Convenience alias
if (typeof window !== "undefined" && window.L && !window.L.simplelocate) {
    window.L.simplelocate = function (options) {
        return new window.L.Control.SimpleLocateExtended(options);
    };
}