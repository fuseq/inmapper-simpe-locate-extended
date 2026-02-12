/**
 * SimpleLocate Extended Plugin
 * 
 * Ana plugin'in üzerine ek özellikler ekler:
 * - Runtime'da özellik açma/kapama
 * - Ayarlar paneli
 * - WeiYe bilgi paneli
 * - Gelişmiş API
 * 
 * @requires leaflet-simple-locate.js
 * @version 1.0.0
 */
(function () {
    'use strict';

    if (typeof window === 'undefined') return;
    if (typeof window.L === 'undefined' || !window.L.Control) {
        console.warn('Leaflet not found. Include Leaflet before extended plugin.');
        return;
    }

    var Base = window.L.Control.SimpleLocate;
    if (!Base) {
        console.warn('SimpleLocate not found. Make sure leaflet-simple-locate.js is loaded.');
        return;
    }

    var Extended = Base.extend({
        
        initialize: function (options) {
            // Base initialize çağır
            Base.prototype.initialize.call(this, options);

            this._extendedFeatures = true;
            options = options || {};

            // Geofence ayarı
            if (options.geofence) {
                try {
                    this.setGeofence(options.geofence);
                } catch (e) {
                    console.warn('Failed to set geofence:', e);
                }
            }

            // Özellik bayrakları
            this._features = {
                advancedFiltering: options.advancedFiltering !== false,
                lastGoodLocation: options.lastGoodLocation !== false,
                circleWatcher: options.circleWatcher !== false,
                weiYePanel: !!options.weiYePanel,
                settingsControl: !!options.settingsControl,
                deadReckoning: !!options.enableDeadReckoning
            };

            // Ayarlar kontrolünü oluştur
            if (this._features.settingsControl) {
                this._createSettingsControl();
            }

            // afterDeviceMove callback'ini zenginleştir
            this._wrapAfterDeviceMove(options);
        },

        /**
         * afterDeviceMove callback'ini zenginleştirilmiş veri ile wrap et
         */
        _wrapAfterDeviceMove: function (options) {
            var origAfter = this.options.afterDeviceMove || options.afterDeviceMove;
            if (origAfter && typeof origAfter === 'function') {
                var self = this;
                this._origAfterDeviceMove = origAfter;
                this.options.afterDeviceMove = function (location) {
                    var enriched = self._enrichLocationPayload(location);
                    try {
                        self._origAfterDeviceMove(enriched);
                    } catch (e) {
                        console.error('afterDeviceMove error:', e);
                    }
                    // WeiYe panel güncelle
                    if (self._weiYeInfoControl) {
                        self._weiYeInfoControl.update(enriched);
                    }
                };
            }
        },

        /**
         * Konum verisini zenginleştir
         */
        _enrichLocationPayload: function (location) {
            if (!location) return location;

            var geofenceResult = { inside: true };
            var speedResult = { valid: true, speed: 0 };
            var confidence = location.confidence || 0;

            if (typeof this._isInsideGeofence === 'function') {
                geofenceResult = this._isInsideGeofence(location.lat, location.lng);
            }

            if (typeof this._checkSpeedValidity === 'function') {
                speedResult = this._checkSpeedValidity(
                    location.lat, 
                    location.lng, 
                    location.timestamp || Date.now()
                );
            }

            if (typeof this._calculateLocationConfidence === 'function') {
                try {
                    confidence = this._calculateLocationConfidence(location, geofenceResult, speedResult);
                } catch (e) {
                    confidence = 0;
                }
            }

            return Object.assign({}, location, {
                confidence: confidence,
                geofence: geofenceResult,
                speedCheck: speedResult,
                locationStats: this._locationStats
            });
        },

        /**
         * Özelliği aç/kapat
         * @param {string} name - Özellik adı
         * @param {boolean} enabled - Aktif mi
         */
        enableFeature: function (name, enabled) {
            if (!this._features || !(name in this._features)) {
                console.warn('Unknown feature:', name);
                return this;
            }

            enabled = !!enabled;
            this._features[name] = enabled;

            // Core options'a da yansıt
            switch (name) {
                case 'advancedFiltering':
                    this.options.enableFiltering = enabled;
                    break;
                case 'lastGoodLocation':
                    this.options.enableLastGoodLocation = enabled;
                    break;
                case 'circleWatcher':
                    this.enableCircleWatcher(enabled);
                    break;
                case 'deadReckoning':
                    this.options.enableDeadReckoning = enabled;
                    if (!enabled && this._pdr && this._pdr.active) {
                        this._stopDeadReckoning("kullanıcı tarafından kapatıldı");
                    }
                    break;
            }

            console.log('Feature', name, 'set to', enabled);
            return this;
        },

        /**
         * Filtre parametrelerini güncelle
         */
        setFilterParams: function (params) {
            if (!params) return this;

            if (params.medianWindowSize !== undefined) {
                this.options.medianWindowSize = params.medianWindowSize;
                if (this._medianFilter) {
                    this._medianFilter.windowSize = params.medianWindowSize;
                }
            }

            if (params.kalmanProcessNoise !== undefined) {
                this.options.kalmanProcessNoise = params.kalmanProcessNoise;
                if (this._kalmanFilter) {
                    this._kalmanFilter.Q_lat = params.kalmanProcessNoise;
                    this._kalmanFilter.Q_lng = params.kalmanProcessNoise;
                }
            }

            if (params.kalmanMeasurementNoise !== undefined) {
                this.options.kalmanMeasurementNoise = params.kalmanMeasurementNoise;
                if (this._kalmanFilter) {
                    this._kalmanFilter.R_lat = params.kalmanMeasurementNoise;
                    this._kalmanFilter.R_lng = params.kalmanMeasurementNoise;
                }
            }

            if (params.lowPassFilterTau !== undefined) {
                this.options.lowPassFilterTau = params.lowPassFilterTau;
                if (this._lowPassFilterLat && this._lowPassFilterLat.setTau) {
                    this._lowPassFilterLat.setTau(params.lowPassFilterTau);
                    this._lowPassFilterLng.setTau(params.lowPassFilterTau);
                }
            }

            return this;
        },

        /**
         * Belirli filtre modülünü aç/kapat
         */
        enableFilterModule: function (moduleName, enabled) {
            enabled = !!enabled;

            switch (moduleName) {
                case 'lowpass':
                    this.options.enableLowPassFilter = enabled;
                    break;
                case 'median':
                    this.options._medianEnabled = enabled;
                    if (!enabled) this.options.medianWindowSize = 1;
                    break;
                case 'kalman':
                    this.options._kalmanEnabled = enabled;
                    break;
                default:
                    console.warn('Unknown filter module:', moduleName);
                    return this;
            }

            console.log('Filter module', moduleName, '=', enabled);
            return this;
        },

        /**
         * Belirli filtre modülünün parametrelerini ayarla
         */
        setFilterModuleParams: function (moduleName, params) {
            if (!params) return this;

            switch (moduleName) {
                case 'lowpass':
                    if (params.tau !== undefined) {
                        this.options.lowPassFilterTau = params.tau;
                        if (this._lowPassFilterLat && this._lowPassFilterLat.setTau) {
                            this._lowPassFilterLat.setTau(params.tau);
                            this._lowPassFilterLng.setTau(params.tau);
                        }
                    }
                    break;

                case 'median':
                    if (params.windowSize !== undefined) {
                        this.options.medianWindowSize = params.windowSize;
                        if (this._medianFilter) {
                            this._medianFilter.windowSize = params.windowSize;
                        }
                    }
                    break;

                case 'kalman':
                    if (params.processNoise !== undefined) {
                        this.options.kalmanProcessNoise = params.processNoise;
                    }
                    if (params.measurementNoise !== undefined) {
                        this.options.kalmanMeasurementNoise = params.measurementNoise;
                    }
                    if (this._kalmanFilter) {
                        this._kalmanFilter.Q_lat = this.options.kalmanProcessNoise;
                        this._kalmanFilter.Q_lng = this.options.kalmanProcessNoise;
                        this._kalmanFilter.R_lat = this.options.kalmanMeasurementNoise;
                        this._kalmanFilter.R_lng = this.options.kalmanMeasurementNoise;
                    }
                    break;

                default:
                    console.warn('Unknown filter module:', moduleName);
            }

            return this;
        },

        /**
         * Son iyi konumu al
         */
        getLastGoodLocation: function () {
            return this._lastGoodLocation || null;
        },

        /**
         * Son iyi konumu temizle
         */
        clearLastGoodLocation: function () {
            this._lastGoodLocation = {
                latitude: null,
                longitude: null,
                accuracy: null,
                timestamp: null,
                confidence: 0
            };
            return this;
        },

        /**
         * Circle watcher'ı aç/kapat
         */
        enableCircleWatcher: function (enabled) {
            enabled = !!enabled;
            this.options.enableCircleWatcher = enabled;

            if (enabled && typeof this._startCircleStyleWatcher === 'function') {
                this._startCircleStyleWatcher();
            } else if (!enabled && typeof this._stopCircleStyleWatcher === 'function') {
                this._stopCircleStyleWatcher();
            }

            return this;
        },

        /**
         * Ayarlar kontrolünü oluştur
         */
        _createSettingsControl: function () {
            if (this._settingsControl) return;

            var self = this;

            var SettingsControl = L.Control.extend({
                options: { position: 'topright' },

                onAdd: function () {
                    var container = L.DomUtil.create('div', 'leaflet-control-simplelocate-settings');
                    container.style.cssText = 'padding:8px;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);font-family:system-ui,-apple-system,sans-serif;font-size:13px;';

                    var btn = L.DomUtil.create('button', '', container);
                    btn.innerHTML = '⚙️ Ayarlar';
                    btn.style.cssText = 'cursor:pointer;border:none;background:#f0f0f0;padding:6px 12px;border-radius:4px;font-size:13px;';

                    L.DomEvent.disableClickPropagation(container);
                    L.DomEvent.on(btn, 'click', function () {
                        self._showSettingsDialog();
                    });

                    return container;
                }
            });

            this._settingsControl = new SettingsControl();
        },

        /**
         * Ayarlar dialogunu göster
         */
        _showSettingsDialog: function () {
            var self = this;

            // Basit prompt-based ayarlar
            var threshold = prompt(
                'Marker görünürlük eşiği (m):',
                this.options.markerVisibilityThreshold || 30
            );
            if (threshold !== null) {
                var v = parseFloat(threshold);
                if (!isNaN(v) && v > 0) {
                    this.options.markerVisibilityThreshold = v;
                }
            }

            var maxAcc = prompt(
                'Maksimum kabul edilebilir accuracy (m):',
                this.options.maxAcceptableAccuracy || 100
            );
            if (maxAcc !== null) {
                var a = parseFloat(maxAcc);
                if (!isNaN(a) && a > 0) {
                    this.options.maxAcceptableAccuracy = a;
                }
            }

            var tau = prompt(
                'Low Pass Filter Tau değeri:',
                this.options.lowPassFilterTau || 0.5
            );
            if (tau !== null) {
                var t = parseFloat(tau);
                if (!isNaN(t) && t > 0) {
                    this.setFilterModuleParams('lowpass', { tau: t });
                }
            }

            alert('✅ Ayarlar uygulandı!');
        },

        /**
         * Ayarlar kontrolünü haritaya ekle
         */
        addSettingsControlToMap: function (map) {
            if (!this._settingsControl) {
                this._createSettingsControl();
            }
            if (this._settingsControl && map) {
                this._settingsControl.addTo(map);
            }
            return this;
        },

        /**
         * WeiYe bilgi panelini oluştur ve haritaya ekle
         */
        addWeiYeInfoControlToMap: function (map) {
            if (this._weiYeInfoControl) {
                return this._weiYeInfoControl;
            }

            var WeiYeInfoControl = L.Control.extend({
                options: { position: 'topright' },

                onAdd: function () {
                    this._container = L.DomUtil.create('div', 'leaflet-control-weiYe-info');
                    this._container.style.cssText = 'padding:10px 14px;background:#fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,0.15);font-family:system-ui,-apple-system,sans-serif;font-size:13px;min-width:160px;';

                    this._container.innerHTML = 
                        '<div style="font-weight:600;margin-bottom:8px;color:#333;border-bottom:1px solid #eee;padding-bottom:6px;">📍 Konum Bilgisi</div>' +
                        '<div style="margin:4px 0;">Doğruluk: <span class="accuracy-value" style="font-weight:500;color:#1976d2;">--</span> m</div>' +
                        '<div style="margin:4px 0;">Güvenilirlik: <span class="confidence-value" style="font-weight:500;color:#388e3c;">--</span>%</div>' +
                        '<div style="margin:4px 0;">Durum: <span class="status-value" style="font-weight:500;">--</span></div>' +
                        '<div class="raw-gps-section" style="display:none;margin-top:8px;padding-top:6px;border-top:1px solid #eee;">' +
                            '<div style="font-weight:600;margin-bottom:4px;color:#d32f2f;font-size:12px;">📡 Ham GPS (Teşhis)</div>' +
                            '<div style="margin:2px 0;font-size:11px;">Konum: <span class="raw-gps-latlng" style="color:#555;">--</span></div>' +
                            '<div style="margin:2px 0;font-size:11px;">Accuracy: <span class="raw-gps-accuracy" style="font-weight:600;color:#d32f2f;">--</span> m</div>' +
                            '<div style="margin:2px 0;font-size:11px;">Red: <span class="rejection-stats" style="color:#f57c00;">--</span></div>' +
                        '</div>' +
                        '<div class="altitude-section" style="display:none;margin-top:8px;padding-top:6px;border-top:1px solid #eee;">' +
                            '<div style="font-weight:600;margin-bottom:4px;color:#5d4037;font-size:12px;">⛰️ Altitude</div>' +
                            '<div style="margin:3px 0;">Rakım: <span class="altitude-value" style="font-weight:600;color:#5d4037;">--</span> m <span class="altitude-platform" style="font-size:10px;color:#999;"></span></div>' +
                            '<div style="margin:3px 0;font-size:11px;color:#888;">Ham: <span class="altitude-raw-value">--</span> m</div>' +
                            '<div class="floor-row" style="margin:3px 0;display:none;">Kat: <span class="floor-value" style="font-weight:700;color:#7b1fa2;font-size:14px;">--</span></div>' +
                        '</div>' +
                        '<div style="margin:4px 0;font-size:11px;color:#666;">Güncellemeler: <span class="updates-value">0</span></div>';

                    L.DomEvent.disableClickPropagation(this._container);
                    return this._container;
                },

                update: function (stats) {
                    if (!this._container) return;

                    var acc = this._container.querySelector('.accuracy-value');
                    var conf = this._container.querySelector('.confidence-value');
                    var st = this._container.querySelector('.status-value');
                    var upd = this._container.querySelector('.updates-value');

                    if (acc && stats.accuracy !== undefined) {
                        acc.textContent = Math.round(stats.accuracy);
                        acc.style.color = stats.accuracy <= 15 ? '#388e3c' : (stats.accuracy <= 30 ? '#f57c00' : '#d32f2f');
                    }

                    if (conf && stats.confidence !== undefined) {
                        conf.textContent = Math.round(stats.confidence);
                        conf.style.color = stats.confidence >= 70 ? '#388e3c' : (stats.confidence >= 40 ? '#f57c00' : '#d32f2f');
                    }

                    if (st) {
                        if (stats.locationError) {
                            var errorMsg = stats.locationError.userFriendly || stats.locationError.message || 'GPS Hatası';
                            st.textContent = errorMsg;
                            st.style.color = '#d32f2f';
                            st.style.fontSize = '11px';
                            // Help text varsa tooltip olarak ekle
                            if (stats.locationError.helpText) {
                                st.title = stats.locationError.helpText;
                            }
                        } else if (stats.isPDR) {
                            st.textContent = '🦶 PDR (' + (stats.pdrStepCount || 0) + ' adım)';
                            st.style.color = '#7b1fa2';
                            st.style.fontSize = '';
                        } else if (stats.isRejected) {
                            // Neden reddedildi?
                            var reason = '🚫 Reddedildi';
                            if (stats.locationStats) {
                                if (stats.locationStats.geofenceRejections > stats.locationStats.accuracyRejections) {
                                    reason = '🚫 Alan Dışı';
                                } else if (stats.locationStats.accuracyRejections > 0) {
                                    reason = '🚫 Düşük Doğruluk';
                                }
                            }
                            st.textContent = reason;
                            st.style.color = '#d32f2f';
                            st.style.fontSize = '';
                        } else if (stats.isFallback) {
                            st.textContent = '⚠️ Tahmini';
                            st.style.color = '#f57c00';
                            st.style.fontSize = '';
                        } else {
                            st.textContent = '✅ Normal';
                            st.style.color = '#388e3c';
                            st.style.fontSize = '';
                        }
                    }

                    if (upd && stats.locationStats) {
                        var total = (stats.locationStats.accuracyRejections || 0) +
                                    (stats.locationStats.geofenceRejections || 0) +
                                    (stats.locationStats.speedRejections || 0) +
                                    (stats.filterStats ? stats.filterStats.totalUpdates || 0 : 0);
                        upd.textContent = total;
                    } else if (upd && stats.filterStats) {
                        upd.textContent = stats.filterStats.totalUpdates || 0;
                    }

                    // Ham GPS teşhis bilgisi (reddedilen konumlarda)
                    var rawSection = this._container.querySelector('.raw-gps-section');
                    if (rawSection) {
                        var rawLatlng = this._container.querySelector('.raw-gps-latlng');
                        var rawAcc = this._container.querySelector('.raw-gps-accuracy');
                        var rejStats = this._container.querySelector('.rejection-stats');
                        
                        if (stats.rawGPS) {
                            // Ham GPS verisi var - göster
                            rawSection.style.display = '';
                            if (rawLatlng) rawLatlng.textContent = stats.rawGPS.lat.toFixed(6) + ', ' + stats.rawGPS.lng.toFixed(6);
                            if (rawAcc) {
                                rawAcc.textContent = stats.rawGPS.accuracy.toFixed(1);
                                rawAcc.style.color = stats.rawGPS.accuracy <= 30 ? '#388e3c' : (stats.rawGPS.accuracy <= 100 ? '#f57c00' : '#d32f2f');
                            }
                        }
                        
                        if (rejStats && stats.locationStats) {
                            var ls = stats.locationStats;
                            var parts = [];
                            if (ls.accuracyRejections > 0) parts.push('Acc:' + ls.accuracyRejections);
                            if (ls.geofenceRejections > 0) parts.push('Geo:' + ls.geofenceRejections);
                            if (ls.speedRejections > 0) parts.push('Spd:' + ls.speedRejections);
                            if (parts.length > 0) {
                                rawSection.style.display = '';
                                rejStats.textContent = parts.join(' | ');
                            }
                        }
                        
                        // Normal konum alınıyorsa ve reddedilmiyorsa gizle
                        if (!stats.isRejected && !stats.rawGPS) {
                            rawSection.style.display = 'none';
                        }
                    }

                    // Altitude section gösterimi
                    var altSection = this._container.querySelector('.altitude-section');
                    var altVal = this._container.querySelector('.altitude-value');
                    var altRaw = this._container.querySelector('.altitude-raw-value');
                    var altPlatform = this._container.querySelector('.altitude-platform');
                    
                    if (altSection && stats.altitude !== undefined && stats.altitude !== null) {
                        altSection.style.display = '';
                        
                        if (altVal) {
                            altVal.textContent = stats.altitude.toFixed(1);
                        }
                        if (altRaw && stats.altitudeRaw !== undefined && stats.altitudeRaw !== null) {
                            altRaw.textContent = stats.altitudeRaw.toFixed(1);
                        }
                        if (altPlatform && stats.altitudePlatform) {
                            altPlatform.textContent = '(' + stats.altitudePlatform + ')';
                        }
                    }

                    // Kat gösterimi
                    var floorRow = this._container.querySelector('.floor-row');
                    var floorVal = this._container.querySelector('.floor-value');
                    if (floorRow && floorVal && stats.floor !== undefined && stats.floor !== null) {
                        floorRow.style.display = '';
                        floorVal.textContent = stats.floorName || ('Kat ' + stats.floor);
                    }
                }
            });

            this._weiYeInfoControl = new WeiYeInfoControl().addTo(map);
            return this._weiYeInfoControl;
        },

        /**
         * Zemin kat kalibrasyonu yap (cihaz zemin kattayken çağrılmalı)
         * @returns {number|null} Kalibre edilen zemin kat rakımı (MSL)
         */
        calibrateGroundFloor: function () {
            if (typeof this._altitude === 'undefined') return null;
            return L.Control.SimpleLocate.prototype.calibrateGroundFloor.call(this);
        },
        
        /**
         * Kat tanımlarını ayarla
         * @param {Array} floors - [{floor: 0, name: "Zemin", minAlt: 1050, maxAlt: 1053}, ...]
         */
        setFloors: function (floors) {
            this.options.floors = floors;
            this.options.enableFloorDetection = true;
            this.options.enableAltitude = true;
            return this;
        },
        
        /**
         * Geoid ondülasyonunu ayarla (bölgeye göre)
         * @param {number} N - Geoid ondülasyonu (metre)
         */
        setGeoidUndulation: function (N) {
            this.options.geoidUndulation = N;
            return this;
        },

        /**
         * Plugin'i haritaya ekle (override)
         */
        addTo: function (map) {
            var control = Base.prototype.addTo.call(this, map);

            // Ayarlar kontrolü
            if (this._features && this._features.settingsControl) {
                this.addSettingsControlToMap(map);
            }

            // WeiYe panel
            if (this._features && this._features.weiYePanel) {
                this.addWeiYeInfoControlToMap(map);
            }

            return control;
        }
    });

    // Factory fonksiyonları
    window.L.Control.SimpleLocateExtended = Extended;

    window.L.control.simpleLocateExtended = function (options) {
        return new Extended(options);
    };

    // Kısayol alias
    window.L.simplelocate = function (options) {
        return new Extended(options);
    };

    console.log('✅ SimpleLocate Extended loaded');
})();



