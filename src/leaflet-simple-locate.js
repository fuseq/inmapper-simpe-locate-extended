/*
 * Leaflet.SimpleLocate Extended v1.1.0 - 2026-02-03
 *
 * Based on original work by mfhsieh (v1.0.5)
 * Extended with Wei Ye filtering, Geofence, Indoor optimizations
 *
 * Licensed under the MIT license.
 *
 * Original: https://github.com/mfhsieh/leaflet-simple-locate
 *
 */

// =====================================================
// CSS AUTO-INJECT - Plugin yüklendiğinde CSS otomatik eklenir
// =====================================================
(function() {
    if (typeof document === 'undefined') return;
    if (document.getElementById('leaflet-simple-locate-styles')) return;

    var css = `
/* Leaflet.SimpleLocate Styles - Auto-injected */
:root {
    --primary-rgb: 51, 51, 51;
    --leaflet-simple-locate-orientation: 0deg;
    --leaflet-simple-locate-circle-display: inline;
}

/* Firefox fix */
@-moz-document url-prefix() {
    .leaflet-simple-locate .fa,
    .leaflet-simple-locate .fab,
    .leaflet-simple-locate .far,
    .leaflet-simple-locate .fas {
        margin-top: .05rem;
        margin-bottom: -.05rem;
    }
}

/* Ana buton stili - Circular */
.leaflet-simple-locate {
    display: flex;
    align-items: center;
    justify-content: center;
    box-sizing: border-box;
    width: 2.5rem;
    height: 2.5rem;
    padding: 0;
    margin: 0;
    font-size: 1.375rem;
    color: rgba(var(--primary-rgb), 1);
    background-color: rgba(255, 255, 255, 1) !important;
    border: none !important;
    border-radius: 2.5rem;
    box-shadow: rgba(0, 0, 0, .2) 0 1px 4px;
    cursor: pointer;
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    text-size-adjust: none;
    -webkit-text-size-adjust: none;
}

.leaflet-simple-locate:active {
    background-color: #f0f0f0 !important;
}

.leaflet-simple-locate:active svg {
    fill: rgba(var(--primary-rgb), 1);
}

.leaflet-simple-locate:focus {
    outline: none;
}

.leaflet-simple-locate:focus-visible {
    outline: none;
}

.leaflet-simple-locate svg {
    fill: rgba(var(--primary-rgb), 1);
    width: 1.375rem;
    height: 1.375rem;
}

/* Konum ikonu stili */
.leaflet-simple-locate-icon {
    fill: rgba(var(--primary-rgb), 1);
    pointer-events: none !important;
    cursor: grab;
    background: transparent !important;
    border: none !important;
}

.leaflet-simple-locate-icon stop {
    stop-color: rgba(var(--primary-rgb), 1);
}

.leaflet-simple-locate-icon .orientation {
    transform: rotate(calc(-1 * var(--leaflet-simple-locate-orientation, 0deg)));
}

/* Doğruluk dairesi stili */
.leaflet-simple-locate-circle {
    display: var(--leaflet-simple-locate-circle-display);
    fill: rgba(var(--primary-rgb), 1);
    fill-opacity: .1;
    stroke: rgba(var(--primary-rgb), 1);
    stroke-width: 1;
    stroke-opacity: .3;
    pointer-events: none !important;
    cursor: grab;
}

/* Yön göstergesi */
.leaflet-simple-locate-orientation {
    transform: rotate(var(--leaflet-simple-locate-orientation, 0deg));
}

#leaflet-simple-locate-icon-spot {
    pointer-events: auto;
    cursor: pointer;
}

/* Spinner animasyonu */
.leaflet-simple-locate svg g {
    transform-origin: center;
}

/* Extended plugin kontrolleri */
.leaflet-control-simplelocate-settings,
.leaflet-control-weiYe-info {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}

.leaflet-control-simplelocate-settings button:hover {
    background: #e0e0e0 !important;
}

/* Responsive ayarlar */
@media (max-width: 480px) {
    .leaflet-simple-locate {
        width: 2.75rem;
        height: 2.75rem;
    }
    
    .leaflet-simple-locate svg {
        width: 1.5rem;
        height: 1.5rem;
    }
}
`;

    var style = document.createElement('style');
    style.id = 'leaflet-simple-locate-styles';
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    document.head.appendChild(style);
})();

// =====================================================
// PLUGIN CORE
// =====================================================
(function (factory) {

    if (typeof define === 'function' && define.amd) {  // eslint-disable-line no-undef
        // define an AMD module that relies on 'leaflet'
        define(['leaflet'], factory);  // eslint-disable-line no-undef

    } else if (typeof exports === 'object') {
        // define a Common JS module that relies on 'leaflet'
        module.exports = factory(require('leaflet'));  // eslint-disable-line no-undef

    } else if (typeof window !== 'undefined') {
        // attach your plugin to the global 'L' variable
        if (typeof window.L === "undefined") throw "Leaflet must be loaded first.";
        window.L.Control.SimpleLocate = factory(window.L);
    }
})(function (L) {
    "use strict";

    const SimpleLocate = L.Control.extend({
        options: {
            className: "",
            title: "Locate Geolocation and Orientation",
            ariaLabel: "",

            minAngleChange: 3,
            orientationSmoothing: 5,        // Yön yumuşatma için örnek sayısı (jitter azaltma)
            gimbalLockThreshold: 70,        // Beta açısı bu değeri aşınca gimbal lock koruması aktif (derece)
            clickTimeoutDelay: 500,

            setViewAfterClick: true,
            zoomLevel: undefined,
            drawCircle: true,

            // Wei Ye algoritması için optimal default parametreler
            medianWindowSize: 3,          // Median filtre pencere boyutu (hızlı tepki)
            kalmanProcessNoise: 0.05,     // Kalman Q değeri (dengeli)
            kalmanMeasurementNoise: 0.2,  // Kalman R değeri (orta güven)
            jumpThreshold: 0.0005,        // Ani sıçrama tespit eşiği
            enableFiltering: true,        // Filtreleme aktif
            lowPassFilterTau: 0.5,        // Low Pass tau (hızlı tepki)
            enableLowPassFilter: true,    // Low Pass aktif

            // ========== İÇ MEKAN KONUM İYİLEŞTİRMELERİ ==========
            
            // Geofence (Coğrafi Sınırlama) - Bina sınırları
            enableGeofence: true,         // Geofence aktif
            geofenceBounds: null,         // [[minLat, minLng], [maxLat, maxLng]] formatında
            geofenceCenter: null,         // [lat, lng] - Bina merkezi
            geofenceRadius: null,         // metre cinsinden maksimum mesafe
            geofencePolygon: null,        // [{lat, lng}, ...] - Gerçek polygon köşeleri (ÖNCELİKLİ)
            
            // Konum Güvenilirlik Sistemi
            maxAcceptableAccuracy: 100,   // Bu değerin üstündeki accuracy'ler reddedilir (metre)
            minAcceptableAccuracy: 5,     // Bu değerin altındaki accuracy'ler çok güvenilir kabul edilir
            
            // Hız Bazlı Sıçrama Tespiti
            maxHumanSpeed: 5,             // Maksimum insan yürüyüş hızı (m/s) - ~18 km/h
            maxIndoorSpeed: 3,            // İç mekanda maksimum kabul edilebilir hız (m/s)
            
            // Son İyi Konum Fallback
            enableLastGoodLocation: true, // Kötü konum geldiğinde son iyi konumu kullan
            lastGoodLocationTimeout: 30000, // Son iyi konum ne kadar süre geçerli (ms)
            maxConsecutiveBadLocations: 5, // Kaç kötü konum sonrası zorla güncelle
            
            // İç Mekan Optimizasyonları
            indoorMode: true,             // İç mekan modu aktif
            indoorMedianWindowSize: 7,    // İç mekanda daha büyük median penceresi
            indoorKalmanR: 0.5,           // İç mekanda ölçüme daha az güven
            indoorLowPassTau: 1.0,        // İç mekanda daha agresif yumuşatma
            
            // Konum Geçerleme
            enablePositionValidation: true, // Konum doğrulama aktif
            positionValidationStrict: false, // Katı mod - şüpheli konumları tamamen reddet
            
            // Marker görünürlük eşiği (metre)
            markerVisibilityThreshold: 30, // Accuracy bu değerin altındaysa marker gösterilir
            
            // ========== PEDESTRIAN DEAD RECKONING (PDR) ==========
            enableDeadReckoning: false,     // PDR varsayılan kapalı (kullanıcı açabilir)
            pdrStepLength: 0.65,            // Ortalama adım uzunluğu (metre)
            pdrStepThreshold: 1.2,          // Adım tespiti için ivme eşiği (g kuvveti)
            pdrStepCooldown: 250,           // İki adım arası minimum süre (ms) - çift sayımı engeller
            pdrMaxDuration: 60000,          // PDR maksimum aktif süresi (ms) - 60 saniye
            pdrMaxSteps: 100,               // PDR ile maksimum adım sayısı
            pdrAccuracyDecay: 0.5,          // Her adımda accuracy ne kadar artar (metre)
            pdrInitialAccuracy: 5,          // PDR başlangıç accuracy (metre)
            
            // ========== ALTITUDE NORMALİZASYON & KAT TESPİTİ ==========
            enableAltitude: false,          // Altitude işleme aktif (varsayılan kapalı)
            
            // Geoid ondülasyonu: Elipsoid (WGS84) ile MSL arasındaki fark
            // Android ham GPS altitude = elipsoid yüksekliği → MSL'e çevirmek için N çıkarılır
            // iOS zaten MSL döndürür → düzeltme gerekmez
            // Türkiye ortalaması ~36-40m, bölgeye göre ayarlanmalı
            // https://geographiclib.sourceforge.io/cgi-bin/GeoidEval adresinden bulunabilir
            geoidUndulation: 37.0,          // metre - Bina konumu için geoid ondülasyonu (N)
            
            // Altitude filtreleme
            altitudeFilterEnabled: true,    // Altitude değerini filtrele (gürültü azaltma)
            altitudeMedianWindow: 5,        // Altitude median filtre pencere boyutu
            altitudeLowPassTau: 2.0,        // Altitude low-pass filtre tau (yavaş değişim)
            altitudeMaxDelta: 10,           // Tek adımda max kabul edilebilir altitude değişimi (m)
            altitudeMinAccuracy: 20,        // Bu değerin üstündeki altitudeAccuracy reddedilir (m)
            
            // Kat tespiti
            enableFloorDetection: false,    // Kat tespiti aktif
            floorHeight: 3.0,              // Kat yüksekliği (metre) - standart bina
            groundFloorAltitude: null,      // Zemin kat rakımı (MSL metre) - KALİBRASYON GEREKLİ
            groundFloorNumber: 0,           // Zemin kat numarası (0 veya 1)
            floorHysteresis: 0.8,           // Kat değişimi için histerezis (metre) - titreşimi engeller
            floors: null,                   // Manuel kat tanımları: [{floor: 0, name: "Zemin", minAlt: 1050, maxAlt: 1053}, ...]

            afterClick: null,
            afterMarkerAdd: null,
            afterDeviceMove: null,

            htmlInit: `
<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
	<path d="M 8,1.5 A 6.5,6.5 0 0 0 1.5,8 6.5,6.5 0 0 0 8,14.5 6.5,6.5 0 0 0 14.5,8 6.5,6.5 0 0 0 8,1.5 Z m 0,2 A 4.5,4.5 0 0 1 12.5,8 4.5,4.5 0 0 1 8,12.5 4.5,4.5 0 0 1 3.5,8 4.5,4.5 0 0 1 8,3.5 Z" />
	<rect width="1.5" height="4" x="7.25" y="0.5" rx="0.5" ry="0.5" />
	<rect width="1.5" height="4" x="7.25" y="11.5" rx="0.5" ry="0.5" />
	<rect width="4" height="1.5" x="0.5" y="7.25" rx="0.5" ry="0.5" />
	<rect width="4" height="1.5" x="11.5" y="7.25" ry="0.5" rx="0.5" />
	<circle cx="8" cy="8" r="1" />
</svg>`,
            htmlSpinner: `
<svg width="16" height="16" viewBox="-8 -8 16 16" xmlns="http://www.w3.org/2000/svg">
	<g>
		<circle opacity=".7" cx="0" cy="-6" r=".9" transform="rotate(90)" />
		<circle opacity=".9" cx="0" cy="-6" r="1.3" transform="rotate(45)" />
		<circle opacity="1" cx="0" cy="-6" r="1.5" />
		<circle opacity=".95" cx="0" cy="-6" r="1.42" transform="rotate(-45)" />
		<circle opacity=".85" cx="0" cy="-6" r="1.26" transform="rotate(-90)" />
		<circle opacity=".7" cx="0" cy="-6" r="1.02" transform="rotate(-135)" />
		<circle opacity=".5" cx="0" cy="-6" r=".7" transform="rotate(-180)" />
		<circle opacity=".25" cx="0" cy="-6" r=".3" transform="rotate(-225)" />
		<animateTransform attributeName="transform" type="rotate" values="0;0;45;45;90;90;135;135;180;180;225;225;270;270;315;315;360" keyTimes="0;.125;.125;.25;.25;.375;.375;.5;.5;.675;.675;.75;.75;.875;.875;1;1" dur="1.3s" repeatCount="indefinite" />
	</g>
</svg>`,
            htmlGeolocation: `
<svg width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
	<path d="M 13.329384,2.6706085 C 13.133096,2.4743297 12.77601,2.4382611 12.303066,2.6103882 L 6.6307133,4.6742285 1.1816923,6.6577732 C 1.0668479,6.6995703 0.95157337,6.752486 0.83540381,6.8133451 0.27343954,7.1201064 0.41842508,7.4470449 1.2644998,7.5962244 l 6.0688263,1.0701854 1.0714872,6.0698222 c 0.1491847,0.84604 0.4751513,0.990031 0.7816575,0.427825 0.060857,-0.116165 0.1137803,-0.231436 0.1555779,-0.346273 L 11.324426,9.3702482 13.389608,3.6968841 C 13.56174,3.2239596 13.52567,2.8668883 13.329392,2.6706094 Z" />
</svg>`,
            htmlOrientation: `
<svg class="leaflet-simple-locate-orientation" width="16" height="16" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
	<path fill="#c00000" d="M 8,0 C 7.7058986,0 7.4109021,0.30139625 7.1855469,0.90234375 L 5.3378906,5.8300781 C 5.2559225,6.0486598 5.1908259,6.292468 5.1386719,6.5507812 6.0506884,6.193573 7.0205489,6.0068832 8,6 8.9768002,6.0005071 9.945249,6.1798985 10.857422,6.5292969 10.805917,6.2790667 10.741782,6.0425374 10.662109,5.8300781 L 8.8144531,0.90234375 C 8.5890978,0.30139615 8.2941007,0 8,0 Z" />
	<path d="M 8,5.9999998 C 7.0205501,6.006884 6.0506874,6.1935733 5.138672,6.5507817 4.9040515,7.7126196 4.9691485,9.1866095 5.3378906,10.169922 l 1.8476563,4.927734 c 0.4507105,1.201895 1.1781958,1.201894 1.628906,0 L 10.662109,10.169922 C 11.033147,9.1804875 11.097283,7.6944254 10.857422,6.5292967 9.9452497,6.1798989 8.9767993,6.0005076 8,5.9999998 Z m -1e-7,0.7499999 A 1.25,1.258 90 0 1 9.2578124,7.9999996 1.25,1.258 90 0 1 8,9.2500001 a 1.25,1.258 90 0 1 -1.2578124,-1.25 1.25,1.258 90 0 1 1.2578123,-1.2500004 z" />
</svg>`,
            iconGeolocation: L.divIcon({
                html: `
<svg width="24" height="24" viewBox="-12 -12 24 24" xmlns="http://www.w3.org/2000/svg">
	<defs>
		<filter id="gaussian">
			<feGaussianBlur stdDeviation="0.5" />
		</filter>
	</defs>
	<g id="leaflet-simple-locate-icon-spot">
		<circle fill="#000000" style="opacity:0.3;filter:url(#gaussian)" cx="1" cy="1" r="10" />
		<circle fill="#ffffff" r="10" />
		<circle r="6">
			<animate attributeName="r" values="6;8;6" dur="2s" repeatCount="indefinite" />
		</circle>
	</g>
</svg>`,
                className: "leaflet-simple-locate-icon",
                iconSize: [24, 24],
                iconAnchor: [12, 12],
            }),
            iconOrientation: L.divIcon({
                html: `
<svg width="96" height="96" viewBox="-48 -48 96 96" xmlns="http://www.w3.org/2000/svg">
	<defs>
		<linearGradient id="gradient" x2="0" y2="-48" gradientUnits="userSpaceOnUse">
			<stop style="stop-opacity:1" offset="0" />
			<stop style="stop-opacity:0" offset="1" />
		</linearGradient>
		<filter id="gaussian">
			<feGaussianBlur stdDeviation="0.5" />
		</filter>
	</defs>
	<path class="orientation" opacity="1" style="fill:url(#gradient)" d="M -24,-48 H 24 L 10,0 H -10 z">
		<animate attributeName="opacity" values=".75;.33;.75" dur="2s" repeatCount="indefinite" />
	</path>
	<g id="leaflet-simple-locate-icon-spot">
		<circle fill="#000000" style="opacity:0.3;filter:url(#gaussian)" cx="1" cy="1" r="10" />
		<circle fill="#ffffff" r="10" />
		<circle r="6">
			<animate attributeName="r" values="6;9;6" dur="2s" repeatCount="indefinite" />
		</circle>
	</g>
</svg>`,
                className: "leaflet-simple-locate-icon",
                iconSize: [96, 96],
                iconAnchor: [48, 48],
            }),
        },

        initialize: function (options) {
            L.Util.setOptions(this, options);

            // map related
            this._map = undefined;
            this._button = undefined;
            this._marker = undefined;
            this._circle = undefined;
            this._circleStyleInterval = undefined; // RADİKAL: Sürekli stil kontrolü için

            // button state
            this._clicked = undefined;
            this._geolocation = undefined;
            this._orientation = undefined;
            this._clickTimeout = undefined;

            // geolocation and orientation
            this._latitude = undefined;
            this._longitude = undefined;
            this._accuracy = undefined;
            this._angle = undefined;
            this._orientationSamples = [];    // Yön yumuşatma için son N örnek
            this._lastOrientationTime = 0;    // Son yön güncellemesi zamanı
            this._orientationCalibrated = false; // Kalibrasyon durumu
            this._lastReliableHeading = undefined; // Gimbal lock öncesi son güvenilir yön
            this._inGimbalLockZone = false;   // Gimbal lock bölgesinde mi

            this._lowPassFilterLat = null;
            this._lowPassFilterLng = null;
            this._lowPassFilterInitialized = false;
            
            // iOS tespiti
            this._isIOS = this._detectIOS();

            // Median Filtre için özellikleri ekle
            this._medianFilter = {
                windowSize: this.options.medianWindowSize,
                latHistory: [],
                lngHistory: [],
                accuracyHistory: [],
                timestampHistory: []
            };

            // Kalman Filtresi için özellikleri ekle
            this._kalmanFilter = {
                Q_lat: this.options.kalmanProcessNoise,
                Q_lng: this.options.kalmanProcessNoise,
                R_lat: this.options.kalmanMeasurementNoise,
                R_lng: this.options.kalmanMeasurementNoise,
                x_lat: null, // Durum tahmini (enlem)
                x_lng: null, // Durum tahmini (boylam)
                P_lat: null, // Tahmin hatası kovaryansı (enlem)
                P_lng: null  // Tahmin hatası kovaryansı (boylam)
            };

            // Wei Ye algoritması durumunu takip etmek için özellikler
            this._weiYeState = {
                lastFilteredPosition: null,
                lastRawPosition: null,
                isJumpDetected: false,
                filteringStats: {
                    totalUpdates: 0,
                    jumpsDetected: 0,
                    maxJumpDistance: 0
                }
            };

            // Hareket tespiti için ayrı geçmiş (Low Pass filtrelenmiş konumlar)
            this._movementHistory = {
                positions: [],
                timestamps: [],
                maxSize: 5 // Son 5 konumu tut
            };

            // ========== İÇ MEKAN İYİLEŞTİRMELERİ - YENİ STATE ==========
            
            // Son bilinen iyi konum
            this._lastGoodLocation = {
                latitude: null,
                longitude: null,
                accuracy: null,
                timestamp: null,
                confidence: 0 // 0-100 arası güvenilirlik skoru
            };
            
            // Kötü konum sayacı
            this._consecutiveBadLocations = 0;
            
            // Konum geçmişi (hız hesaplaması için)
            this._locationHistory = {
                positions: [],
                timestamps: [],
                accuracies: [],
                maxSize: 10
            };
            
            // Konum istatistikleri
            this._locationStats = {
                totalLocations: 0,
                rejectedLocations: 0,
                geofenceRejections: 0,
                speedRejections: 0,
                accuracyRejections: 0,
                fallbackUsed: 0
            };
            
            // Geofence cache (hesaplama optimizasyonu)
            this._geofenceCache = {
                isInside: null,
                lastCheck: null,
                checkInterval: 1000 // 1 saniye
            };
            
            // ========== ALTITUDE & KAT TESPİTİ STATE ==========
            this._altitude = {
                raw: null,                  // Ham altitude (platformdan gelen)
                normalized: null,           // Normalize edilmiş altitude (MSL)
                filtered: null,             // Filtrelenmiş altitude
                accuracy: null,             // Altitude accuracy
                floor: null,                // Tespit edilen kat numarası
                floorName: null,            // Kat adı
                medianBuffer: [],           // Median filtre buffer'ı
                lowPassFilter: null,        // LowPass filtre instance'ı
                lastStableFloor: null,      // Son kararlı kat (histerezis için)
                floorChangeTime: 0,         // Son kat değişim zamanı
                sampleCount: 0,             // Toplam altitude örneği sayısı
                platform: null              // Tespit edilen platform ('ios' | 'android' | 'unknown')
            };
            
            // ========== PEDESTRIAN DEAD RECKONING (PDR) STATE ==========
            this._pdr = {
                active: false,              // PDR şu an aktif mi
                startTime: null,            // PDR'ın başladığı zaman
                stepCount: 0,               // Algılanan adım sayısı
                lastStepTime: 0,            // Son adımın zamanı
                baseLatitude: null,          // PDR başlangıç enlemi
                baseLongitude: null,         // PDR başlangıç boylamı
                currentLatitude: null,       // PDR ile tahmin edilen enlem
                currentLongitude: null,      // PDR ile tahmin edilen boylam
                currentAccuracy: null,       // PDR tahmini accuracy (giderek artar)
                lastAccMagnitude: 0,         // Son ivme büyüklüğü
                isStepPhase: false,          // Adım döngüsünde zirve geçildi mi
                motionHandler: null,         // DeviceMotion event handler referansı
                accBuffer: [],              // İvme verisi buffer'ı (smoothing için)
                accBufferSize: 4            // Buffer boyutu
            };
        },
        
        // iOS tespit fonksiyonu
        _detectIOS: function() {
            if (typeof navigator === 'undefined') return false;
            
            const userAgent = navigator.userAgent || navigator.vendor || window.opera;
            
            // iOS cihazlarını tespit et
            return /iPad|iPhone|iPod/.test(userAgent) && !window.MSStream;
        },

        // Median Filtreyi uygula
        _applyMedianFilter: function (position) {
            const m = this._medianFilter;
            const now = position.timestamp || Date.now();

            // iOS için özel düzeltme: Eğer timestamp çok eskiyse veya çok büyük bir sıçrama varsa,
            // geçmişi temizle ve yeni konumu kabul et
            if (m.timestampHistory.length > 0) {
                const lastTimestamp = m.timestampHistory[m.timestampHistory.length - 1];
                const timeDiff = Math.abs(now - lastTimestamp) / 1000; // saniye cinsinden

                // iOS'ta bazen timestamp'ler düzgün gelmeyebilir veya çok büyük gecikmeler olabilir
                // Eğer 30 saniyeden fazla geçtiyse ve büyük bir mesafe varsa, geçmişi temizle
                if (timeDiff > 30 && m.latHistory.length > 0) {
                    const lastLat = m.latHistory[m.latHistory.length - 1];
                    const lastLng = m.lngHistory[m.lngHistory.length - 1];
                    const distance = L.latLng(lastLat, lastLng).distanceTo(L.latLng(position.latitude, position.longitude));

                    if (distance > 50) {
                        // iOS'ta büyük bir sıçrama ve uzun gecikme varsa, geçmişi temizle
                        m.latHistory = [];
                        m.lngHistory = [];
                        m.accuracyHistory = [];
                        m.timestampHistory = [];

                    }
                }
            }

            // Görsel aykırı değerleri tespit etmek için uzaklığı ölç
            if (m.latHistory.length > 0) {
                const lastLat = m.latHistory[m.latHistory.length - 1];
                const lastLng = m.lngHistory[m.lngHistory.length - 1];
                const distance = L.latLng(lastLat, lastLng).distanceTo(L.latLng(position.latitude, position.longitude));

            }

            // Yeni değerleri geçmişe ekle
            m.latHistory.push(position.latitude);
            m.lngHistory.push(position.longitude);
            m.accuracyHistory.push(position.accuracy);
            m.timestampHistory.push(now);

            // Pencere boyutunu aşarsa en eskisini kaldır
            while (m.latHistory.length > m.windowSize) {
                m.latHistory.shift();
                m.lngHistory.shift();
                m.accuracyHistory.shift();
                m.timestampHistory.shift();
            }

            // Eğer yeteri kadar veri yoksa filtreleme yapma
            if (m.latHistory.length < 3) {
                return {
                    latitude: position.latitude,
                    longitude: position.longitude,
                    accuracy: position.accuracy,
                    timestamp: now
                };
            }

            // Değerleri sırala ve ortancayı bul
            const sortedLat = [...m.latHistory].sort((a, b) => a - b);
            const sortedLng = [...m.lngHistory].sort((a, b) => a - b);
            const sortedAcc = [...m.accuracyHistory].sort((a, b) => a - b);

            const midIndex = Math.floor(sortedLat.length / 2);

            const medianLat = sortedLat[midIndex];
            const medianLng = sortedLng[midIndex];


            const medianDistance = L.latLng(position.latitude, position.longitude)
                .distanceTo(L.latLng(medianLat, medianLng));

            const maxAllowedDistance = Math.max(position.accuracy * 1.5, 15);

            if (medianDistance > maxAllowedDistance) {

                const normalizedDistance = Math.min(1.0, medianDistance / (maxAllowedDistance * 2));
                const blendFactor = Math.min(0.7, Math.max(0.3, 0.3 + normalizedDistance * 0.4));

                return {
                    latitude: blendFactor * position.latitude + (1 - blendFactor) * medianLat,
                    longitude: blendFactor * position.longitude + (1 - blendFactor) * medianLng,
                    accuracy: sortedAcc[midIndex],
                    timestamp: now
                };
            }

            return {
                latitude: medianLat,
                longitude: medianLng,
                accuracy: sortedAcc[midIndex],
                timestamp: now
            };
        },

        // ========== İÇ MEKAN İYİLEŞTİRMELERİ - YENİ FONKSİYONLAR ==========
        
        // Geofence kontrolü - konum bina sınırları içinde mi?
        _isInsideGeofence: function (lat, lng) {
            // Geofence devre dışıysa her zaman true döndür
            if (!this.options.enableGeofence) return { inside: true, reason: null };
            
            // ========== 1. POLYGON KONTROLÜ (ÖNCELİKLİ) ==========
            // Eğer geofencePolygon varsa, gerçek polygon kontrolü yap
            if (this.options.geofencePolygon && this.options.geofencePolygon.length >= 3) {
                const isInPolygon = this._pointInPolygon(lat, lng, this.options.geofencePolygon);
                
                if (!isInPolygon) {
                    return { 
                        inside: false, 
                        reason: 'polygon',
                        message: `Konum belirlenen alan dışında: [${lat.toFixed(6)}, ${lng.toFixed(6)}]`
                    };
                }
                // Polygon içindeyse, diğer kontrolleri atla
                return { inside: true, reason: null };
            }
            
            // ========== 2. BOUNDS KONTROLÜ (dikdörtgen sınır - fallback) ==========
            if (this.options.geofenceBounds) {
                const bounds = this.options.geofenceBounds;
                const minLat = bounds[0][0];
                const minLng = bounds[0][1];
                const maxLat = bounds[1][0];
                const maxLng = bounds[1][1];
                
                if (lat < minLat || lat > maxLat || lng < minLng || lng > maxLng) {
                    return { 
                        inside: false, 
                        reason: 'bounds',
                        message: `Konum bina sınırları dışında: [${lat.toFixed(6)}, ${lng.toFixed(6)}]`
                    };
                }
            }
            
            // ========== 3. RADIUS KONTROLÜ (dairesel sınır) ==========
            if (this.options.geofenceCenter && this.options.geofenceRadius) {
                const center = this.options.geofenceCenter;
                const maxRadius = this.options.geofenceRadius;
                
                const distance = L.latLng(lat, lng).distanceTo(L.latLng(center[0], center[1]));
                
                if (distance > maxRadius) {
                    return { 
                        inside: false, 
                        reason: 'radius',
                        distance: distance,
                        message: `Konum merkezden ${Math.round(distance)}m uzakta (max: ${maxRadius}m)`
                    };
                }
            }
            
            return { inside: true, reason: null };
        },
        
        // Point-in-Polygon algoritması (Ray Casting)
        _pointInPolygon: function (lat, lng, polygon) {
            // polygon = [{lat, lng}, {lat, lng}, ...] veya [[lat, lng], [lat, lng], ...]
            let inside = false;
            const n = polygon.length;
            
            for (let i = 0, j = n - 1; i < n; j = i++) {
                // Polygon noktalarını al
                let xi, yi, xj, yj;
                
                if (polygon[i].lat !== undefined) {
                    // {lat, lng} formatı
                    xi = polygon[i].lat;
                    yi = polygon[i].lng;
                    xj = polygon[j].lat;
                    yj = polygon[j].lng;
                } else {
                    // [lat, lng] formatı
                    xi = polygon[i][0];
                    yi = polygon[i][1];
                    xj = polygon[j][0];
                    yj = polygon[j][1];
                }
                
                // Ray casting algoritması
                const intersect = ((yi > lng) !== (yj > lng)) &&
                    (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
                
                if (intersect) inside = !inside;
            }
            
            return inside;
        },
        
        // Hız kontrolü - imkansız sıçramaları tespit et
        _checkSpeedValidity: function (newLat, newLng, timestamp) {
            const history = this._locationHistory;
            
            // Geçmiş yoksa geçerli kabul et
            if (history.positions.length === 0) {
                return { valid: true, speed: 0 };
            }
            
            // Son konumu al
            const lastPos = history.positions[history.positions.length - 1];
            const lastTime = history.timestamps[history.timestamps.length - 1];
            
            // Zaman farkını hesapla (saniye)
            const timeDiff = Math.abs(timestamp - lastTime) / 1000;
            
            // Çok kısa sürede gelen konumları atla (GPS noise)
            if (timeDiff < 0.5) {
                return { valid: true, speed: 0, reason: 'too_fast_update' };
            }
            
            // Mesafeyi hesapla
            const distance = L.latLng(lastPos.latitude, lastPos.longitude)
                .distanceTo(L.latLng(newLat, newLng));
            
            // Hızı hesapla (m/s)
            const speed = distance / timeDiff;
            
            // İç mekan modunda daha düşük hız limiti
            const maxSpeed = this.options.indoorMode 
                ? this.options.maxIndoorSpeed 
                : this.options.maxHumanSpeed;
            
            if (speed > maxSpeed) {
                return { 
                    valid: false, 
                    speed: speed,
                    distance: distance,
                    timeDiff: timeDiff,
                    reason: 'impossible_speed',
                    message: `İmkansız hız: ${speed.toFixed(1)} m/s (${(speed * 3.6).toFixed(1)} km/h), max: ${maxSpeed} m/s`
                };
            }
            
            return { valid: true, speed: speed };
        },
        
        // Konum güvenilirlik skorunu hesapla (0-100)
        _calculateLocationConfidence: function (position, geofenceResult, speedResult) {
            let confidence = 100;
            
            // Accuracy bazlı skor düşürme
            if (position.accuracy > this.options.maxAcceptableAccuracy) {
                confidence -= 50;
            } else if (position.accuracy > 50) {
                confidence -= 30;
            } else if (position.accuracy > 30) {
                confidence -= 20;
            } else if (position.accuracy > 15) {
                confidence -= 10;
            } else if (position.accuracy <= this.options.minAcceptableAccuracy) {
                confidence += 10; // Çok iyi accuracy bonus
            }
            
            // Geofence ihlali
            if (!geofenceResult.inside) {
                confidence -= 40;
            }
            
            // Hız ihlali
            if (!speedResult.valid) {
                confidence -= 30;
            }
            
            // iOS cihazlarda iç mekanda genellikle daha düşük güvenilirlik
            if (this._isIOS && this.options.indoorMode) {
                confidence -= 5;
            }
            
            // Sınırla 0-100 arası
            return Math.max(0, Math.min(100, confidence));
        },
        
        // Son iyi konumu güncelle
        _updateLastGoodLocation: function (position, confidence) {
            // Geofence kontrolü - sadece alan İÇİNDE olan konumları kaydet
            const geofenceCheck = this._isInsideGeofence(position.latitude, position.longitude);
            
            // Sadece yeterli güvenilirlikte VE alan içinde olan konumları kaydet
            if (confidence >= 50 && geofenceCheck.inside) {
                this._lastGoodLocation = {
                    latitude: position.latitude,
                    longitude: position.longitude,
                    accuracy: position.accuracy,
                    timestamp: position.timestamp || Date.now(),
                    confidence: confidence
                };
                this._consecutiveBadLocations = 0;
            } else {
                this._consecutiveBadLocations++;
                // Alan dışındaki konumu son iyi konum olarak kaydetme!
                if (!geofenceCheck.inside) {
                    console.log(`🚫 Alan dışı konum son iyi konum olarak kaydedilmedi`);
                }
            }
        },
        
        // Konum geçmişini güncelle
        _updateLocationHistory: function (position) {
            const history = this._locationHistory;
            
            history.positions.push({
                latitude: position.latitude,
                longitude: position.longitude
            });
            history.timestamps.push(position.timestamp || Date.now());
            history.accuracies.push(position.accuracy);
            
            // Maksimum boyutu aşarsa en eskisini kaldır
            while (history.positions.length > history.maxSize) {
                history.positions.shift();
                history.timestamps.shift();
                history.accuracies.shift();
            }
        },
        
        // Son iyi konumu kullan (fallback)
        _getLastGoodLocationFallback: function (currentPosition) {
            const lastGood = this._lastGoodLocation;
            
            // Son iyi konum yoksa veya çok eskiyse, mevcut konumu döndür
            if (!lastGood.latitude || !lastGood.longitude) {
                return null;
            }
            
            const now = Date.now();
            const age = now - lastGood.timestamp;
            
            // Timeout kontrolü
            if (age > this.options.lastGoodLocationTimeout) {
                return null;
            }
            
            // Çok fazla kötü konum geldiyse zorla güncelle
            if (this._consecutiveBadLocations >= this.options.maxConsecutiveBadLocations) {
                console.warn(`⚠️ ${this.options.maxConsecutiveBadLocations} ardışık kötü konum, zorla güncelleniyor`);
                this._consecutiveBadLocations = 0;
                return null;
            }
            
            this._locationStats.fallbackUsed++;
            
            return {
                latitude: lastGood.latitude,
                longitude: lastGood.longitude,
                accuracy: Math.max(lastGood.accuracy, currentPosition.accuracy), // Daha kötü accuracy kullan
                timestamp: currentPosition.timestamp,
                isFallback: true,
                originalPosition: currentPosition
            };
        },
        
        // Konum istatistiklerini al
        getLocationStats: function () {
            return { ...this._locationStats };
        },
        
        // Geofence'i dinamik olarak ayarla
        setGeofence: function (options) {
            if (options.bounds) {
                this.options.geofenceBounds = options.bounds;
            }
            if (options.center) {
                this.options.geofenceCenter = options.center;
            }
            if (options.radius) {
                this.options.geofenceRadius = options.radius;
            }
            // ========== POLYGON DESTEĞİ ==========
            if (options.polygon) {
                this.options.geofencePolygon = options.polygon;
                console.log('📐 Geofence polygon ayarlandı:', options.polygon.length, 'köşe');
            }
            // Cache'i temizle
            this._geofenceCache.isInside = null;
        },

        // Kalman Filtreyi uygula
        _applyWeiYeFilter: function (position) {
            // Filtreleme devre dışıysa, orijinal konumu döndür
            if (!this.options.enableFiltering) {
                return position;
            }
            
            this._locationStats.totalLocations++;
            const timestamp = position.timestamp || Date.now();
            
            const isIOSDevice = this._isIOS;
            const isIndoorMode = this.options.indoorMode;
            const isLowAccuracy = position.accuracy > 20;
            
            // ========== ADIM 1: ACCURACY KONTROLÜ ==========
            if (this.options.enablePositionValidation && 
                position.accuracy > this.options.maxAcceptableAccuracy) {
                
                this._locationStats.accuracyRejections++;
                console.warn(`⚠️ Accuracy çok yüksek: ${position.accuracy}m (max: ${this.options.maxAcceptableAccuracy}m)`);
                
                // Fallback kullan
                if (this.options.enableLastGoodLocation) {
                    const fallback = this._getLastGoodLocationFallback(position);
                    if (fallback) {
                        console.log(`📍 Son iyi konum kullanılıyor (accuracy rejection)`);
                        return fallback;
                    }
                }
                
                // Fallback yoksa veya katı modda - null döndür (marker güncellenmeyecek)
                console.warn(`🚫 Konum reddedildi (accuracy) - marker güncellenmeyecek`);
                return null;
            }
            
            // ========== ADIM 2: GEOFENCE KONTROLÜ ==========
            const geofenceResult = this._isInsideGeofence(position.latitude, position.longitude);
            
            if (!geofenceResult.inside) {
                this._locationStats.geofenceRejections++;
                
                // ═══ PDR AKTİVASYONU ═══
                // Dışarıdan sinyal geliyor = iç mekan sinyali kesilmiş
                // Son iç mekan konumundan PDR ile devam et
                if (this.options.enableDeadReckoning && !this._pdr.active) {
                    console.log("🦶 Geofence dışı sinyal → PDR başlatılıyor");
                    this._startDeadReckoning();
                }
                
                // PDR aktifse, PDR konumunu döndür (marker PDR ile güncelleniyor)
                if (this._pdr.active) {
                    return {
                        latitude: this._pdr.currentLatitude,
                        longitude: this._pdr.currentLongitude,
                        accuracy: this._pdr.currentAccuracy,
                        timestamp: position.timestamp,
                        isPDR: true
                    };
                }
                
                // PDR kapalıysa normal fallback mantığı
                if (this.options.enableLastGoodLocation) {
                    const fallback = this._getLastGoodLocationFallback(position);
                    if (fallback) {
                        console.log(`📍 Son iyi konum kullanılıyor (geofence rejection)`);
                        return fallback;
                    }
                }
                
                // Fallback yoksa - null döndür (marker güncellenmeyecek)
                console.warn(`🚫 Konum reddedildi (geofence) - marker güncellenmeyecek`);
                return null;
            }
            
            // ═══ İÇ MEKAN SİNYALİ GERİ GELDİ → PDR DURDUR ═══
            // Geofence içinden sinyal alınıyorsa PDR'a gerek yok
            if (this._pdr.active) {
                console.log("🦶 İç mekan sinyali geri geldi → PDR durduruluyor");
                this._stopDeadReckoning("iç mekan sinyali geri geldi");
            }
            
            // ========== ADIM 3: HIZ KONTROLÜ ==========
            const speedResult = this._checkSpeedValidity(
                position.latitude, 
                position.longitude, 
                timestamp
            );
            
            if (!speedResult.valid) {
                this._locationStats.speedRejections++;
                console.warn(`⚠️ Hız ihlali: ${speedResult.message}`);
                
                // Fallback kullan
                if (this.options.enableLastGoodLocation) {
                    const fallback = this._getLastGoodLocationFallback(position);
                    if (fallback) {
                        console.log(`📍 Son iyi konum kullanılıyor (speed rejection)`);
                        return fallback;
                    }
                }
                
                // Fallback yoksa - null döndür (marker güncellenmeyecek)
                console.warn(`🚫 Konum reddedildi (speed) - marker güncellenmeyecek`);
                return null;
            }
            
            // ========== ADIM 4: GÜVENİLİRLİK SKORU ==========
            const confidence = this._calculateLocationConfidence(position, geofenceResult, speedResult);
            
            // Konum geçmişini güncelle (hız hesaplaması için)
            this._updateLocationHistory(position);
            
            // ========== ADIM 5: İÇ MEKAN OPTİMİZASYONLARI ==========
            // İç mekan modunda filtre parametrelerini dinamik olarak ayarla
            if (isIndoorMode) {
                // Daha büyük median penceresi
                this._medianFilter.windowSize = this.options.indoorMedianWindowSize;
                
                // Daha yüksek Kalman R değeri (ölçüme daha az güven)
                this._kalmanFilter.R_lat = this.options.indoorKalmanR;
                this._kalmanFilter.R_lng = this.options.indoorKalmanR;
            }
            
            // iOS'ta çok düşük accuracy ile gelen konumları filtrele (sadece önceki konum varsa)
            if (isIOSDevice && position.accuracy > 45 && this._weiYeState.lastFilteredPosition) {
                return {
                    latitude: this._weiYeState.lastFilteredPosition.latitude,
                    longitude: this._weiYeState.lastFilteredPosition.longitude,
                    accuracy: this._weiYeState.lastFilteredPosition.accuracy,
                    timestamp: position.timestamp
                };
            }

            // İstatistikleri güncelle
            this._weiYeState.filteringStats.totalUpdates++;

            // Ham konumu kaydet
            this._weiYeState.lastRawPosition = {
                latitude: position.latitude,
                longitude: position.longitude,
                accuracy: position.accuracy
            };

            // Low Pass Filter'ı uygula
            let lowPassFiltered = position;

            if (this.options.enableLowPassFilter !== false && typeof LowPassFilter !== 'undefined') {
                // Low Pass Filter'ları ilk kullanım için başlat
                if (!this._lowPassFilterInitialized) {
                    // iOS için özel düzeltme: iOS'ta geolocation güncellemeleri daha az sıklıkta gelebilir
                    // Örnek frekansı dinamik olarak hesaplayacağız, başlangıçta 1 Hz varsayalım
                    const sampleFrequency = 1.0;

                    // Filtrenin zaman sabitini kullanıcı seçeneğinden al
                    // iOS için biraz daha düşük tau kullan (daha hızlı tepki)
                    const tau = this.options.lowPassFilterTau || 1.0;

                    // LowPassFilter nesnelerini oluştur
                    this._lowPassFilterLat = new LowPassFilter(sampleFrequency, tau);
                    this._lowPassFilterLng = new LowPassFilter(sampleFrequency, tau);

                    // İlk değerleri ayarla
                    this._lowPassFilterLat.addSample(position.latitude);
                    this._lowPassFilterLng.addSample(position.longitude);

                    // Filtre başlatıldı
                    this._lowPassFilterInitialized = true;

                    // Son timestamp'i kaydet (iOS için)
                    this._lastLowPassTimestamp = position.timestamp || Date.now();

                    // İlk filtreleme için ham değerleri kullan
                    lowPassFiltered = position;
                } else {
                    // iOS için özel düzeltme: Timestamp farkını kullanarak örnekleme frekansını hesapla
                    const currentTimestamp = position.timestamp || Date.now();
                    const timeDiff = Math.abs(currentTimestamp - (this._lastLowPassTimestamp || currentTimestamp)) / 1000; // saniye cinsinden

                    // iOS'ta timestamp'ler bazen düzgün gelmeyebilir veya çok büyük gecikmeler olabilir
                    // Eğer zaman farkı çok küçükse (< 0.1s) veya çok büyükse (> 60s), varsayılan değeri kullan
                    let actualSampleFrequency = 1.0;
                    if (timeDiff > 0.1 && timeDiff < 60) {
                        actualSampleFrequency = 1.0 / timeDiff;
                    }

                    // Örnekleme frekansını güncelle (iOS için)
                    if (this._lowPassFilterLat.setSampleFrequency) {
                        this._lowPassFilterLat.setSampleFrequency(actualSampleFrequency);
                        this._lowPassFilterLng.setSampleFrequency(actualSampleFrequency);
                    }

                    // Timestamp'i güncelle
                    this._lastLowPassTimestamp = currentTimestamp;

                    // Tau değerini kullanıcının hareketi durumuna göre dinamik olarak ayarla
                    let dynamicTau = this.options.lowPassFilterTau || 1.0;

                    // Hareket durumuna göre ayarlama
                    // Not: Hareket geçmişi Low Pass filtrelenmiş konumdan sonra güncellenecek
                    if (this._detectUserMoving()) {
                        // Hareket halindeyse daha düşük tau (daha hızlı tepki)
                        dynamicTau = Math.max(0.3, dynamicTau / 2);
                    } else {
                        // Durağan haldeyse daha yüksek tau (daha fazla yumuşatma)
                        dynamicTau = Math.min(2.0, dynamicTau * 1.5);
                    }

                    // Doğruluk durumuna göre ayarlama
                    if (position.accuracy > 20) {
                        // Düşük doğrulukta daha agresif filtreleme
                        dynamicTau = Math.min(3.0, dynamicTau * 1.5);
                    }

                    // iOS için özel düzeltme: Eğer zaman farkı çok büyükse (> 10s),
                    // tau değerini düşür (daha hızlı adapte ol)
                    if (timeDiff > 10) {
                        dynamicTau = Math.max(0.2, dynamicTau / 2);
                    }

                    // Tau değerini güncelle
                    this._lowPassFilterLat.setTau(dynamicTau);
                    this._lowPassFilterLng.setTau(dynamicTau);

                    // Yeni örnekleri ekle ve filtreleme yap
                    this._lowPassFilterLat.addSample(position.latitude);
                    this._lowPassFilterLng.addSample(position.longitude);

                    // Filtrelenmiş değerleri al
                    const filteredLat = this._lowPassFilterLat.lastOutput();
                    const filteredLng = this._lowPassFilterLng.lastOutput();

                    // iOS için özel düzeltme: Eğer filtrelenmiş değer ham değerden çok uzaksa,
                    // iOS'ta kuzeye kayma sorunu olabilir, filtrelenmiş değeri sınırla
                    const filteredDistance = L.latLng(position.latitude, position.longitude)
                        .distanceTo(L.latLng(filteredLat, filteredLng));

                    const maxAllowedDistance = Math.max(position.accuracy * 1.5, 15); // En az 15m

                    if (filteredDistance > maxAllowedDistance) {
                        // Dinamik blend faktörü: Mesafe ve accuracy'ye göre hesapla
                        // Mesafe arttıkça blend faktörü artar (daha fazla ham değer kullan)
                        const normalizedDistance = Math.min(1.0, filteredDistance / (maxAllowedDistance * 2));
                        const blendFactor = Math.min(0.8, Math.max(0.3, 0.3 + normalizedDistance * 0.5));

                        lowPassFiltered = {
                            latitude: blendFactor * position.latitude + (1 - blendFactor) * filteredLat,
                            longitude: blendFactor * position.longitude + (1 - blendFactor) * filteredLng,
                            accuracy: position.accuracy,
                            timestamp: position.timestamp,
                            lpfApplied: true
                        };

                    } else {
                        lowPassFiltered = {
                            latitude: filteredLat,
                            longitude: filteredLng,
                            accuracy: position.accuracy,
                            timestamp: position.timestamp,
                            lpfApplied: true
                        };
                    }

                }
            } else if (this.options.enableLowPassFilter !== false && typeof LowPassFilter === 'undefined') {
                console.warn('⚠️ LowPassFilter kütüphanesi yüklenemedi, Low Pass Filter atlanıyor');
                // Low Pass Filter olmadan devam et
                lowPassFiltered = position;
            }


            // Hareket geçmişini güncelle (Low Pass filtrelenmiş konum ile)
            // Bu, hareket tespiti için kullanılacak
            this._updateMovementHistory(lowPassFiltered);

            // Performans optimizasyonu: Çok düşük doğruluk değerlerinde (çok kötü GPS sinyali - binalarda)
            // daha agresif filtreleme yap, yüksek doğruluk değerlerinde (iyi GPS sinyali - açık alanda)
            // daha az filtreleme yap
            const isLowAccuracyNow = lowPassFiltered.accuracy > 20;

            // 2. Median filtre her zaman uygula, ancak pencere boyutu accuracy'ye göre ayarla
            // iOS için özel: Log analizine göre iOS'ta daha büyük pencere gerekli
            let medianWindowSize;
            if (isIOSDevice && isLowAccuracyNow) {
                // iOS + düşük accuracy: En büyük pencere (7-9)
                medianWindowSize = Math.min(9, Math.floor(this.options.medianWindowSize * 1.5));
            } else if (isIOSDevice) {
                // iOS + normal accuracy: Biraz büyütülmüş pencere (5-7)
                medianWindowSize = Math.min(7, this.options.medianWindowSize + 2);
            } else if (isLowAccuracyNow) {
                // Android + düşük accuracy: Normal pencere
                medianWindowSize = this.options.medianWindowSize;
            } else {
                // Android + yüksek accuracy: Küçük pencere
                medianWindowSize = Math.max(3, Math.floor(this.options.medianWindowSize * 0.6));
            }
            
            const originalWindowSize = this._medianFilter.windowSize;
            this._medianFilter.windowSize = medianWindowSize;

            let medianFiltered = this._applyMedianFilter(lowPassFiltered);

            // Pencere boyutunu geri yükle
            this._medianFilter.windowSize = originalWindowSize;

            // 3. Sıçrama tespiti: Low Pass filtrelenmiş konum ile median filtrelenmiş konum arasında
            // Bu daha tutarlı bir karşılaştırma sağlar
            // GPS'in doğruluğunu dikkate alarak sıçramayı hesapla - düşük doğrulukta daha toleranslı ol
            // iOS için özel: Log analizine göre iOS'ta daha yüksek eşik gerekli
            let jumpDistanceThreshold;
            if (isIOSDevice) {
                // iOS'ta accuracy genellikle daha kötü, daha toleranslı ol
                jumpDistanceThreshold = Math.max(8, lowPassFiltered.accuracy / 2.5); // En az 8m
            } else {
                jumpDistanceThreshold = Math.max(5, lowPassFiltered.accuracy / 3); // En az 5m
            } 

            // Sapma mesafesini hesapla (Low Pass çıktısı ile median çıktısı arasında)
            const jumpDistance = L.latLng(lowPassFiltered.latitude, lowPassFiltered.longitude)
                .distanceTo(L.latLng(medianFiltered.latitude, medianFiltered.longitude));

            // İstatistikler için en büyük sıçramayı kaydet
            if (jumpDistance > this._weiYeState.filteringStats.maxJumpDistance) {
                this._weiYeState.filteringStats.maxJumpDistance = jumpDistance;
            }

            // Sıçrama tespiti - mesafe ve koordinat farkını kontrol et
            // Low Pass filtrelenmiş konum ile median filtrelenmiş konum arasında karşılaştırma
            const latDiff = Math.abs(lowPassFiltered.latitude - medianFiltered.latitude);
            const lngDiff = Math.abs(lowPassFiltered.longitude - medianFiltered.longitude);
            const isJump = (jumpDistance > jumpDistanceThreshold) ||
                (latDiff > this.options.jumpThreshold || lngDiff > this.options.jumpThreshold);

            if (isJump) {
                this._weiYeState.filteringStats.jumpsDetected++;
                this._weiYeState.isJumpDetected = true;
            } else {
                this._weiYeState.isJumpDetected = false;
            }

            // 3. Kalman filtresi uygula, duruma göre parametre ayarla
            // Kalman filtresi ayarlarını hareket durumuna göre ayarla
            // Hareket geçmişi zaten Low Pass filtrelenmiş konum ile güncellendi
            const isUserMoving = this._detectUserMoving();

            // Hareket durumuna göre Kalman filtre parametreleri
            if (isUserMoving) {
                // Hareket halinde daha hızlı tepki vermeli
                this._kalmanFilter.Q_lat = this._kalmanFilter.Q_lng = this.options.kalmanProcessNoise * 2;
            } else {
                // Durağan haldeyken daha stabil filtreleme
                this._kalmanFilter.Q_lat = this._kalmanFilter.Q_lng = this.options.kalmanProcessNoise / 2;
            }

            // Kalman parametrelerini ayarla
            // İyileştirme: Kalman'a her zaman Low Pass filtrelenmiş değeri gönder
            // Sadece sıçrama varsa median filtrelenmiş değeri kullan
            let kalmanInput;
            if (isJump) {
                // Ani sıçrama tespit edildiğinde ölçüme daha az güven
                // iOS için daha yüksek R değeri (daha az güven)
                this._kalmanFilter.R_lat = this._kalmanFilter.R_lng = isIOSDevice ? 1.5 : 1.0;
                // Median filtrelenmiş değeri kullan (sıçramayı temizlemiş olur)
                kalmanInput = medianFiltered;
            } else {
                // Doğruluğa göre dinamik olarak Kalman filtre parametresini ayarla
                // iOS için özel: Log analizine göre daha yüksek R gerekli (ölçümlere daha az güven)
                let adaptiveR;
                if (isIOSDevice) {
                    // iOS: Daha yüksek R değeri (0.1-0.8 arası)
                    adaptiveR = Math.max(0.1, Math.min(0.8, lowPassFiltered.accuracy / 15));
                } else {
                    // Android: Normal R değeri (0.05-0.5 arası)
                    adaptiveR = Math.max(0.05, Math.min(0.5, lowPassFiltered.accuracy / 20));
                }
                this._kalmanFilter.R_lat = this._kalmanFilter.R_lng = adaptiveR;

                // Her zaman Low Pass filtrelenmiş değeri kullan (tutarlılık için)
                kalmanInput = lowPassFiltered;
            }

            // 4. Kalman filtresini uygula
            const kalmanFiltered = this._applyKalmanFilter(kalmanInput);
            
            // iOS için özel: Durağan halindeki küçük hareketleri filtrele
            // Log analizine göre iOS'ta durağan halinde bile 0.3-2m arası sürekli hareket var
            if (isIOSDevice && this._weiYeState.lastFilteredPosition && !isUserMoving) {
                const distanceFromLast = L.latLng(
                    this._weiYeState.lastFilteredPosition.latitude,
                    this._weiYeState.lastFilteredPosition.longitude
                ).distanceTo(L.latLng(kalmanFiltered.latitude, kalmanFiltered.longitude));
                
                // Durağan halinde 2m'den az hareket varsa, önceki konumu döndür (gürültüyü yok say)
                if (distanceFromLast < 2.0) {
                    return {
                        latitude: this._weiYeState.lastFilteredPosition.latitude,
                        longitude: this._weiYeState.lastFilteredPosition.longitude,
                        accuracy: kalmanFiltered.accuracy, // Accuracy'yi güncelle
                        timestamp: position.timestamp
                    };
                }
            }

            // 5. Filtrelenmiş konumun bilgilerini kaydet
            this._weiYeState.lastFilteredPosition = {
                latitude: kalmanFiltered.latitude,
                longitude: kalmanFiltered.longitude,
                accuracy: kalmanFiltered.accuracy,
                rawLatitude: position.latitude,
                rawLongitude: position.longitude,
                isFiltered: true,
                isJump: isJump,
                timestamp: position.timestamp
            };
            
            // 6. SON İYİ KONUMU GÜNCELLE
            // Filtrelenmiş konum için yeniden güvenilirlik hesapla
            const filteredGeofence = this._isInsideGeofence(kalmanFiltered.latitude, kalmanFiltered.longitude);
            const finalConfidence = this._calculateLocationConfidence(
                kalmanFiltered, 
                filteredGeofence, 
                { valid: true, speed: 0 }
            );
            this._updateLastGoodLocation(kalmanFiltered, finalConfidence);
            
            // Güvenilirlik bilgisini ekle
            kalmanFiltered.confidence = finalConfidence;
            kalmanFiltered.isIndoorMode = this.options.indoorMode;

            return kalmanFiltered;
        },

        onAdd: function (map) {
            this._map = map;

            this._button = L.DomUtil.create("button", "leaflet-simple-locate");
            if (this.options.className) L.DomUtil.addClass(this._button, this.options.className);
            L.DomEvent.disableClickPropagation(this._button);

            this._button.innerHTML = this.options.htmlInit;
            this._button.title = this.options.title;
            this._button.setAttribute("aria-label", this.options.ariaLabel ? this.options.ariaLabel : this.options.title);

            L.DomEvent
                .on(this._button, "click", L.DomEvent.stopPropagation)
                .on(this._button, "click", L.DomEvent.preventDefault)
                .on(this._button, "click", this._onClick, this);

            return this._button;
        },

        getLatLng: function () {
            if (!this._latitude || !this._longitude) return null;
            return {
                lat: this._latitude,
                lng: this._longitude,
            };
        },

        getAccuracy: function () {
            if (!this._accuracy) return null;
            return this._accuracy;
        },

        getAngle: function () {
            if (!this._angle) return null;
            return this._angle;
        },

        setZoomLevel: function (level) {
            this.options.zoomLevel = level;
        },

        _onClick: async function () {
            if (this._clickTimeout) {
                // console.log("_onClick: double click", new Date().toISOString());
                clearTimeout(this._clickTimeout);
                this._clickTimeout = undefined;

                if (this._clicked) {
                    if (this._geolocation) this._unwatchGeolocation();
                    if (this._orientation) this._unwatchOrientation();
                    this._clicked = undefined;
                    this._geolocation = undefined;
                    this._orientation = undefined;
                    this._updateButton();
                    this._map.off("layeradd", this._onLayerAdd, this);

                    // Filtreleme verilerini sıfırla
                    this._resetFilters();
                }
            } else {
                this._clickTimeout = setTimeout(() => {
                    // console.log("_onClick: single click", new Date().toISOString());
                    clearTimeout(this._clickTimeout);
                    this._clickTimeout = undefined;

                    if (!this._map) return;

                    if (this._clicked && this.options.setViewAfterClick) {
                        this._setView();
                        return;
                    }

                    this._clicked = true;
                    this._updateButton();
                    this._map.on("layeradd", this._onLayerAdd, this);

                    this._checkGeolocation().then((event) => {
                        this._geolocation = true;
                        this._onLocationFound(event.coords);
                        if (this.options.setViewAfterClick) this._setView();
                        this._watchGeolocation();
                        this._checkClickResult();
                    }).catch((error) => {
                        this._geolocation = false;
                        this._checkClickResult();
                    });

                    this._checkOrientation().then(() => {
                        // console.log("_checkOrientation", new Date().toISOString(), "success!");
                        this._orientation = true;
                        this._watchOrientation();
                        this._checkClickResult();
                    }).catch(() => {
                        // console.log("_checkOrientation", new Date().toISOString(), "failed!");
                        this._orientation = false;
                        this._checkClickResult();
                    });
                }, this.options.clickTimeoutDelay);
            }
        },

        // Filtreleme verilerini sıfırla
        _resetFilters: function () {
            // Median filtre verilerini sıfırla
            this._medianFilter.latHistory = [];
            this._medianFilter.lngHistory = [];
            this._medianFilter.accuracyHistory = [];
            this._medianFilter.timestampHistory = [];

            // Kalman filtre verilerini sıfırla
            this._kalmanFilter.x_lat = null;
            this._kalmanFilter.x_lng = null;
            this._kalmanFilter.P_lat = null;
            this._kalmanFilter.P_lng = null;

            // Wei Ye durumunu sıfırla
            this._weiYeState.lastFilteredPosition = null;
            this._weiYeState.lastRawPosition = null;
            this._weiYeState.isJumpDetected = false;
            this._weiYeState.filteringStats = {
                totalUpdates: 0,
                jumpsDetected: 0,
                maxJumpDistance: 0
            };
            this._lowPassFilterLat = null;
            this._lowPassFilterLng = null;
            this._lowPassFilterInitialized = false;
            this._lastLowPassTimestamp = null;

            // Hareket geçmişini sıfırla
            this._movementHistory.positions = [];
            this._movementHistory.timestamps = [];
            
            // ========== İÇ MEKAN İYİLEŞTİRMELERİ - SIFIRLAMA ==========
            
            // Son iyi konum sıfırla
            this._lastGoodLocation = {
                latitude: null,
                longitude: null,
                accuracy: null,
                timestamp: null,
                confidence: 0
            };
            
            // Kötü konum sayacı sıfırla
            this._consecutiveBadLocations = 0;
            
            // Konum geçmişi sıfırla
            this._locationHistory = {
                positions: [],
                timestamps: [],
                accuracies: [],
                maxSize: 10
            };
            
            // İstatistikleri sıfırla
            this._locationStats = {
                totalLocations: 0,
                rejectedLocations: 0,
                geofenceRejections: 0,
                speedRejections: 0,
                accuracyRejections: 0,
                fallbackUsed: 0
            };
            
            // Geofence cache sıfırla
            this._geofenceCache = {
                isInside: null,
                lastCheck: null,
                checkInterval: 1000
            };
            
            // Altitude sıfırla
            this._resetAltitude();
            
            // PDR durdur ve sıfırla
            this._stopDeadReckoning("filtreler sıfırlandı");
        },

        _checkClickResult: function () {
            this._updateButton();

            if (this.options.afterClick && typeof this._geolocation !== "undefined" && typeof this._orientation !== "undefined") {
                this.options.afterClick({
                    geolocation: this._geolocation,
                    orientation: this._orientation,
                });
            }

            if (this._geolocation === false && this._orientation === false) {
                this._clicked = undefined;
                this._geolocation = undefined;
                this._orientation = undefined;
            }
        },

        _checkGeolocation: function () {
            if (typeof navigator !== "object" || !("geolocation" in navigator) ||
                typeof navigator.geolocation.getCurrentPosition !== "function" || typeof navigator.geolocation.watchPosition !== "function") {
                return Promise.reject();
            }

            return new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        resolve(position);
                    },
                    (error) => {
                        reject(error);
                    },
                    { maximumAge: 0, enableHighAccuracy: true }
                );
            });
        },

        _checkOrientation: function () {
            if (!("ondeviceorientationabsolute" in window || "ondeviceorientation" in window) || !DeviceOrientationEvent)
                return Promise.reject();

            if (typeof DeviceOrientationEvent.requestPermission !== "function")
                return Promise.resolve();

            return DeviceOrientationEvent.requestPermission().then((permission) => {
                if (permission === "granted") return true;
                else return Promise.reject();
            });
        },

        _watchGeolocation: function () {
            this._map.locate({ watch: true, enableHighAccuracy: true });
            this._map.on("locationfound", this._onLocationFound, this);
            this._map.on("locationerror", this._onLocationError, this);
            this._map.on("zoomstart", this._onZoomStart, this);
            this._map.on("zoomend", this._onZoomEnd, this);
        },
        
        _onLocationError: function (error) {
            // Hata sessizce işlenir
        },

        _unwatchGeolocation: function () {
            // RADİKAL: Stil kontrolünü durdur
            this._stopCircleStyleWatcher();
            
            this._map.stopLocate();
            this._map.off("locationfound", this._onLocationFound, this);
            this._map.off("locationerror", this._onLocationError, this);
            this._map.off("zoomstart", this._onZoomStart, this);
            this._map.off("zoomend", this._onZoomEnd, this);

            if (this._circle) {
                this._map.removeLayer(this._circle);
                this._circle = undefined;
            }
            if (this._marker) {
                this._map.removeLayer(this._marker);
                this._marker = undefined;
            }
            this._latitude = undefined;
            this._longitude = undefined;
            this._accuracy = undefined;
        },

        _watchOrientation: function () {
            // console.log("_watchOrientation");
            L.DomEvent.on(window, "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation", this._onOrientation, this);
        },

        _unwatchOrientation: function () {
            // console.log("_unwatchOrientation");
            L.DomEvent.off(window, "ondeviceorientationabsolute" in window ? "deviceorientationabsolute" : "deviceorientation", this._onOrientation, this);
            document.documentElement.style.setProperty("--leaflet-simple-locate-orientation", "0deg");
            this._angle = undefined;
            this._orientationSamples = [];
            this._lastOrientationTime = 0;
            this._orientationCalibrated = false;
            this._compassUncalibratedWarned = false;
            this._lastReliableHeading = undefined;
            this._inGimbalLockZone = false;
        },

        _onLocationFound: function (event) {
            // Wei Ye algoritması ile konumu filtrele
            const filteredPosition = this._applyWeiYeFilter(event);
            
            // Konum reddedildiyse (null döndü) - marker güncellenmez, circle gösterilmez
            if (!filteredPosition) {
                console.log(`🚫 Reddedilen konum - marker ve circle gösterilmeyecek`);

                // Ham konum bilgileri alınsa bile circle göstermiyoruz (kullanıcı talebi)
                // Sadece varsa marker'ı kaldır
                if (this._marker) {
                    this._map.removeLayer(this._marker);
                    this._marker = undefined;
                }

                // Eğer circle varsa, kaldır (alan dışı circle artık gösterilmeyecek)
                if (this._circle) {
                    this._map.removeLayer(this._circle);
                    this._circle = undefined;
                }

                // Callback'i çağır (istatistikler için) - ham konum yerine son geçerli/filtrelenmiş bilgileri ver
                if (this.options.afterDeviceMove) {
                    this.options.afterDeviceMove({
                        lat: this._latitude,
                        lng: this._longitude,
                        accuracy: this._accuracy,
                        angle: this._angle,
                        isFiltered: true,
                        isRejected: true,
                        isJump: false,
                        filterStats: this._weiYeState.filteringStats,
                        confidence: 0,
                        locationStats: this._locationStats,
                        isFallback: false,
                        isIndoorMode: this.options.indoorMode,
                        consecutiveBadLocations: this._consecutiveBadLocations
                    });
                }
                return;
            }
            
            if (!filteredPosition.latitude || !filteredPosition.longitude) {
                return;
            }
            
            // ========== EK GÜVENLİK: FİLTRELENMİŞ KONUM İÇİN DE GEOFENCE KONTROLÜ ==========
            // Bu, filtreleme sonrası konumun hala alan içinde olduğundan emin olur
            const finalGeofenceCheck = this._isInsideGeofence(filteredPosition.latitude, filteredPosition.longitude);
            if (!finalGeofenceCheck.inside) {
                console.log(`🚫 Filtrelenmiş konum hala alan dışında - marker güncellenmeyecek, circle gri gösterilecek`);
                this._locationStats.geofenceRejections++;
                
                // Konum bilgilerini kaydet (circle için)
                this._latitude = filteredPosition.latitude;
                this._longitude = filteredPosition.longitude;
                this._accuracy = filteredPosition.accuracy;
                
                // Marker gizle, circle'ı gri göster
                if (this._marker) {
                    this._map.removeLayer(this._marker);
                    this._marker = undefined;
                }
                
                // Circle'ı gri renkte göster (alan dışı göstergesi)
                if (this.options.drawCircle && this._accuracy) {
                    if (this._circle) {
                        this._circle.setLatLng([this._latitude, this._longitude]);
                        this._circle.setRadius(this._accuracy);
                        this._circle.setStyle({
                            fillColor: '#9E9E9E',
                            color: '#9E9E9E',
                            fillOpacity: 0.1,
                            opacity: 0.4,
                            weight: 2,
                            dashArray: '8 4'
                        });
                    } else {
                        this._circle = L.circle([this._latitude, this._longitude], {
                            radius: this._accuracy,
                            fillColor: '#9E9E9E',
                            color: '#9E9E9E',
                            fillOpacity: 0.1,
                            opacity: 0.4,
                            weight: 2,
                            dashArray: '8 4'
                        }).addTo(this._map);
                    }
                }
                
                // Callback'i çağır
                if (this.options.afterDeviceMove) {
                    this.options.afterDeviceMove({
                        lat: this._latitude,
                        lng: this._longitude,
                        accuracy: this._accuracy,
                        angle: this._angle,
                        isFiltered: true,
                        isRejected: true,
                        isJump: false,
                        filterStats: this._weiYeState.filteringStats,
                        confidence: 0,
                        locationStats: this._locationStats,
                        isFallback: false,
                        isIndoorMode: this.options.indoorMode,
                        consecutiveBadLocations: this._consecutiveBadLocations
                    });
                }
                return;
            }

            // Önceki filtrelenmiş konumla aynıysa güncelleme yapma (micro değişiklikleri engelle)
            if (this._latitude && filteredPosition.latitude &&
                Math.round(this._latitude * 1000000) === Math.round(filteredPosition.latitude * 1000000) &&
                this._longitude && filteredPosition.longitude &&
                Math.round(this._longitude * 1000000) === Math.round(filteredPosition.longitude * 1000000) &&
                this._accuracy && filteredPosition.accuracy &&
                Math.round(this._accuracy * 100) === Math.round(filteredPosition.accuracy * 100)) {
                return;
            }

            // Filtrelenmiş değerleri kaydet
            this._latitude = filteredPosition.latitude;
            this._longitude = filteredPosition.longitude;
            this._accuracy = filteredPosition.accuracy;
            
            // ========== ALTITUDE İŞLEME ==========
            // Leaflet locationfound event'inde altitude bilgisi varsa işle
            if (this.options.enableAltitude && event.altitude !== undefined) {
                this._processAltitude(event);
            }

            // Marker'ı güncelle
            this._updateMarker();
        },

        _onOrientation: function (event) {
            if (event.alpha === null || event.alpha === undefined) return;
            
            let angle;
            
            // ===== ADIM 1: Ham açı hesaplama =====
            if (event.webkitCompassHeading !== undefined && event.webkitCompassHeading !== null) {
                // iOS: webkitCompassHeading direkt manyetik kuzey açısı verir (tilt-immune)
                if (event.webkitCompassAccuracy !== undefined && event.webkitCompassAccuracy < 0) {
                    if (!this._compassUncalibratedWarned) {
                        console.warn("🧭 Pusula kalibre edilmemiş. Cihazı 8 çizerek kalibre edin.");
                        this._compassUncalibratedWarned = true;
                    }
                    return;
                }
                this._compassUncalibratedWarned = false;
                angle = event.webkitCompassHeading;
            } else {
                // Android/Diğer: Gimbal-lock korumalı heading hesaplama
                angle = this._computeHeadingWithGimbalLockProtection(
                    event.alpha, event.beta, event.gamma
                );
            }
            
            if (angle === null || isNaN(angle)) return;
            
            // ===== ADIM 2: Ekran yönü düzeltmesi =====
            if ("orientation" in screen) {
                angle = (angle + screen.orientation.angle) % 360;
            }
            
            // ===== ADIM 3: Kalibrasyon tespiti =====
            if (this._angle !== undefined) {
                let absDelta = Math.abs(this._angleDelta(angle, this._angle));
                if (absDelta > 30) {
                    // Büyük değişim = muhtemel kalibrasyon düzeltmesi
                    this._orientationSamples = [];
                    this._orientationCalibrated = true;
                }
            }
            
            // ===== ADIM 4: Yön yumuşatma (jitter azaltma) =====
            const smoothingSize = this.options.orientationSmoothing || 5;
            this._orientationSamples.push(angle);
            if (this._orientationSamples.length > smoothingSize) {
                this._orientationSamples.shift();
            }
            
            // Dairesel ortalama (0°/360° geçişini doğru hesaplar)
            let smoothedAngle = this._circularMean(this._orientationSamples);
            
            // ===== ADIM 5: Minimum değişim filtresi =====
            if (this._angle !== undefined && 
                !this._orientationCalibrated &&
                Math.abs(this._angleDelta(smoothedAngle, this._angle)) < this.options.minAngleChange) {
                return;
            }
            this._orientationCalibrated = false;
            
            this._angle = (smoothedAngle + 360) % 360;
            this._lastOrientationTime = Date.now();

            document.documentElement.style.setProperty("--leaflet-simple-locate-orientation", -this._angle + "deg");
            this._updateMarker();
        },
        
        // Gimbal Lock korumalı pusula hesaplama
        // ─────────────────────────────────────
        // Euler açılarında beta≈90° olduğunda alpha 180° sıçrar (gimbal lock).
        // Bu fonksiyon her frame'de heading ve heading+180 arasından
        // son güvenilir yöne EN YAKIN olanı seçer.
        //
        // Neden çalışır:
        // - Gerçek dönüş: kademeli (frame başına 2-5°), lastReliable sürekli takip eder
        //   → heading her zaman flipped'den yakın → düzeltme gerekmez
        // - Gimbal lock: ani 180° sıçrama, lastReliable aynı kalır
        //   → flipped (= doğru yön) lastReliable'a daha yakın → otomatik düzeltilir
        _computeHeadingWithGimbalLockProtection: function (alpha, beta, gamma) {
            var heading = (360 - alpha) % 360;
            var absBeta = Math.abs(beta);
            var threshold = this.options.gimbalLockThreshold || 70;
            
            // ── Normal bölge (|beta| < threshold) ──
            // +Y ekseni (telefonun üst kenarı) yatay düzleme güçlü projeksiyon yapıyor
            // Heading güvenilir, referans olarak kaydet
            if (absBeta < threshold) {
                this._lastReliableHeading = heading;
                this._inGimbalLockZone = false;
                return heading;
            }
            
            // ── Gimbal lock bölgesi (|beta| >= threshold) ──
            // alpha 180° sıçramış olabilir. İki olası yorumu karşılaştır:
            //   1) heading (olduğu gibi)
            //   2) heading + 180° (gimbal lock düzeltmesi)
            // Son güvenilir yöne hangisi daha yakınsa onu seç.
            this._inGimbalLockZone = true;
            
            if (this._lastReliableHeading === undefined) {
                // İlk açılış - henüz referans yok, olduğu gibi kabul et
                this._lastReliableHeading = heading;
                return heading;
            }
            
            var delta1 = Math.abs(this._angleDelta(heading, this._lastReliableHeading));
            var flipped = (heading + 180) % 360;
            var delta2 = Math.abs(this._angleDelta(flipped, this._lastReliableHeading));
            
            if (delta2 < delta1) {
                // Gimbal lock tespit edildi - 180° düzeltme uygula
                heading = flipped;
            }
            
            // Gimbal lock bölgesinde de referansı güncelle (dönüşleri takip et)
            this._lastReliableHeading = heading;
            return heading;
        },
        
        // Dairesel (circular) ortalama - 0°/360° sınırında doğru çalışır
        _circularMean: function (angles) {
            if (!angles || angles.length === 0) return 0;
            
            var sinSum = 0;
            var cosSum = 0;
            var degToRad = Math.PI / 180;
            
            for (var i = 0; i < angles.length; i++) {
                sinSum += Math.sin(angles[i] * degToRad);
                cosSum += Math.cos(angles[i] * degToRad);
            }
            
            var mean = Math.atan2(sinSum / angles.length, cosSum / angles.length);
            mean = mean * (180 / Math.PI);
            if (mean < 0) mean += 360;
            
            return mean;
        },
        
        // İki açı arasındaki en kısa fark (-180 ile +180 arası)
        _angleDelta: function (a, b) {
            var delta = a - b;
            while (delta > 180) delta -= 360;
            while (delta < -180) delta += 360;
            return delta;
        },

        // ════════════════════════════════════════════════════════
        // ALTITUDE NORMALİZASYON & KAT TESPİTİ
        // iOS ve Android arasındaki altitude farkını normalize eder
        // ve iç mekanda kat tespiti yapar
        // ════════════════════════════════════════════════════════
        
        // Altitude verisini işle (her locationfound'da çağrılır)
        _processAltitude: function (position) {
            if (!this.options.enableAltitude) return;
            
            // Leaflet locationfound event'inde altitude bilgisi
            var rawAltitude = position.altitude;
            var altitudeAccuracy = position.altitudeAccuracy;
            
            // Altitude yoksa çık
            if (rawAltitude === null || rawAltitude === undefined) return;
            
            this._altitude.raw = rawAltitude;
            this._altitude.accuracy = altitudeAccuracy;
            this._altitude.sampleCount++;
            
            // Platform tespiti (ilk seferde)
            if (!this._altitude.platform) {
                this._altitude.platform = this._isIOS ? 'ios' : 'android';
            }
            
            // ═══ ADIM 1: ACCURACY KONTROLÜ ═══
            if (altitudeAccuracy !== null && altitudeAccuracy !== undefined &&
                altitudeAccuracy > this.options.altitudeMinAccuracy) {
                // Accuracy çok kötü, bu değeri kullanma
                return;
            }
            
            // ═══ ADIM 2: PLATFORM NORMALİZASYONU (MSL'e çevir) ═══
            var mslAltitude = this._normalizeAltitudeToMSL(rawAltitude);
            this._altitude.normalized = mslAltitude;
            
            // ═══ ADIM 3: ANİ SIÇRAMA KONTROLÜ ═══
            if (this._altitude.filtered !== null) {
                var altDelta = Math.abs(mslAltitude - this._altitude.filtered);
                if (altDelta > this.options.altitudeMaxDelta) {
                    // Ani sıçrama - muhtemelen GPS hatası, yoksay
                    console.warn('⛰️ Altitude sıçraması tespit edildi: ' + altDelta.toFixed(1) + 'm → yoksayıldı');
                    return;
                }
            }
            
            // ═══ ADIM 4: FİLTRELEME ═══
            var filteredAltitude;
            if (this.options.altitudeFilterEnabled) {
                filteredAltitude = this._filterAltitude(mslAltitude);
            } else {
                filteredAltitude = mslAltitude;
            }
            
            this._altitude.filtered = filteredAltitude;
            
            // ═══ ADIM 5: KAT TESPİTİ ═══
            if (this.options.enableFloorDetection) {
                this._detectFloor(filteredAltitude);
            }
        },
        
        // Android altitude'unu MSL'e normalize et
        // iOS zaten MSL döndürür, Android WGS84 elipsoid döndürür
        _normalizeAltitudeToMSL: function (rawAltitude) {
            if (this._altitude.platform === 'ios') {
                // iOS: Core Location zaten MSL (Mean Sea Level) döndürür
                return rawAltitude;
            }
            
            // Android: Elipsoid yüksekliği → MSL'e çevir
            // MSL = Elipsoid Yüksekliği - Geoid Ondülasyonu (N)
            var N = this.options.geoidUndulation;
            return rawAltitude - N;
        },
        
        // Altitude filtreleme (Median + LowPass)
        _filterAltitude: function (altitude) {
            // ─── Median Filtre ───
            var buffer = this._altitude.medianBuffer;
            var windowSize = this.options.altitudeMedianWindow;
            
            buffer.push(altitude);
            if (buffer.length > windowSize) {
                buffer.shift();
            }
            
            // Median hesapla
            var sorted = buffer.slice().sort(function (a, b) { return a - b; });
            var medianAltitude;
            var mid = Math.floor(sorted.length / 2);
            if (sorted.length % 2 === 0) {
                medianAltitude = (sorted[mid - 1] + sorted[mid]) / 2;
            } else {
                medianAltitude = sorted[mid];
            }
            
            // ─── Low Pass Filtre ───
            if (!this._altitude.lowPassFilter && typeof LowPassFilter !== 'undefined') {
                this._altitude.lowPassFilter = new LowPassFilter(this.options.altitudeLowPassTau);
            }
            
            if (this._altitude.lowPassFilter) {
                return this._altitude.lowPassFilter.apply(medianAltitude, Date.now() / 1000);
            }
            
            return medianAltitude;
        },
        
        // Kat tespiti
        _detectFloor: function (altitude) {
            var floor = null;
            var floorName = null;
            
            // ─── Yöntem 1: Manuel kat tanımları (öncelikli) ───
            if (this.options.floors && this.options.floors.length > 0) {
                for (var i = 0; i < this.options.floors.length; i++) {
                    var f = this.options.floors[i];
                    if (altitude >= f.minAlt && altitude < f.maxAlt) {
                        floor = f.floor;
                        floorName = f.name || ('Kat ' + f.floor);
                        break;
                    }
                }
            }
            // ─── Yöntem 2: Otomatik hesaplama (groundFloorAltitude + floorHeight) ───
            else if (this.options.groundFloorAltitude !== null) {
                var relativeHeight = altitude - this.options.groundFloorAltitude;
                var rawFloor = relativeHeight / this.options.floorHeight;
                floor = Math.round(rawFloor) + this.options.groundFloorNumber;
                floorName = 'Kat ' + floor;
            }
            
            if (floor === null) return;
            
            // ─── Histerezis: Küçük dalgalanmalarda kat değişimini engelle ───
            if (this._altitude.lastStableFloor !== null && floor !== this._altitude.lastStableFloor) {
                // Yeni katla eski kat arasındaki altitude farkı yeterli mi?
                var expectedAltForNewFloor;
                if (this.options.groundFloorAltitude !== null) {
                    expectedAltForNewFloor = this.options.groundFloorAltitude + 
                        (floor - this.options.groundFloorNumber) * this.options.floorHeight;
                    var distFromBoundary = Math.abs(altitude - expectedAltForNewFloor);
                    
                    // Kat sınırına yeterince yaklaşmadıysa kat değiştirme
                    if (distFromBoundary > (this.options.floorHeight / 2 - this.options.floorHysteresis)) {
                        // Histerezis eşiğini aştı → kat değiştir
                    } else {
                        // Sınırda salınım - önceki katı koru
                        floor = this._altitude.lastStableFloor;
                        floorName = 'Kat ' + floor;
                    }
                }
                
                // Minimum süre kontrolü (çok hızlı kat değişimini engelle)
                var now = Date.now();
                if (now - this._altitude.floorChangeTime < 3000) {
                    // Son 3 saniyede zaten kat değişimi oldu, bekle
                    floor = this._altitude.lastStableFloor;
                    floorName = 'Kat ' + floor;
                }
            }
            
            // Kat değiştiyse bildir
            if (this._altitude.floor !== floor) {
                var prevFloor = this._altitude.floor;
                this._altitude.floor = floor;
                this._altitude.floorName = floorName;
                this._altitude.lastStableFloor = floor;
                this._altitude.floorChangeTime = Date.now();
                
                console.log('🏢 Kat değişimi: ' + (prevFloor !== null ? prevFloor : '?') + 
                           ' → ' + floor + ' (altitude: ' + altitude.toFixed(1) + 'm MSL)');
            }
        },
        
        // Altitude verilerini sıfırla
        _resetAltitude: function () {
            this._altitude.raw = null;
            this._altitude.normalized = null;
            this._altitude.filtered = null;
            this._altitude.accuracy = null;
            this._altitude.floor = null;
            this._altitude.floorName = null;
            this._altitude.medianBuffer = [];
            this._altitude.lastStableFloor = null;
            this._altitude.sampleCount = 0;
            if (this._altitude.lowPassFilter && this._altitude.lowPassFilter.reset) {
                this._altitude.lowPassFilter.reset();
            }
        },
        
        // Dışarıdan altitude verilerini sorgula
        getAltitude: function () {
            return {
                raw: this._altitude.raw,
                normalized: this._altitude.normalized,
                filtered: this._altitude.filtered,
                accuracy: this._altitude.accuracy,
                floor: this._altitude.floor,
                floorName: this._altitude.floorName,
                platform: this._altitude.platform,
                sampleCount: this._altitude.sampleCount
            };
        },
        
        // Zemin kat kalibrasyonu (cihaz zemin kattayken çağrılır)
        calibrateGroundFloor: function () {
            if (this._altitude.filtered === null) {
                console.warn('⛰️ Kalibrasyon yapılamadı: Henüz altitude verisi yok');
                return null;
            }
            
            var groundAlt = this._altitude.filtered;
            this.options.groundFloorAltitude = groundAlt;
            this._altitude.floor = this.options.groundFloorNumber;
            this._altitude.floorName = 'Kat ' + this.options.groundFloorNumber;
            this._altitude.lastStableFloor = this.options.groundFloorNumber;
            
            console.log('⛰️ Zemin kat kalibre edildi: ' + groundAlt.toFixed(2) + 'm MSL');
            return groundAlt;
        },

        // ════════════════════════════════════════════════════════
        // PEDESTRIAN DEAD RECKONING (PDR)
        // İç mekan sinyali kesildiğinde sensörlerle konum tahmini
        // ════════════════════════════════════════════════════════
        
        // PDR'ı başlat - son bilinen iç mekan konumunu baz alarak
        _startDeadReckoning: function () {
            if (!this.options.enableDeadReckoning) return;
            if (this._pdr.active) return; // Zaten aktif
            
            // Baz konum: son bilinen geçerli iç mekan konumu
            var baseLat = this._latitude;
            var baseLng = this._longitude;
            
            if (!baseLat || !baseLng) {
                console.warn("🦶 PDR başlatılamadı: geçerli konum yok");
                return;
            }
            
            this._pdr.active = true;
            this._pdr.startTime = Date.now();
            this._pdr.stepCount = 0;
            this._pdr.lastStepTime = 0;
            this._pdr.baseLatitude = baseLat;
            this._pdr.baseLongitude = baseLng;
            this._pdr.currentLatitude = baseLat;
            this._pdr.currentLongitude = baseLng;
            this._pdr.currentAccuracy = this.options.pdrInitialAccuracy;
            this._pdr.lastAccMagnitude = 0;
            this._pdr.isStepPhase = false;
            this._pdr.accBuffer = [];
            
            // DeviceMotion dinlemeye başla
            var self = this;
            this._pdr.motionHandler = function (e) {
                self._onDeviceMotion(e);
            };
            
            window.addEventListener("devicemotion", this._pdr.motionHandler, false);
            
            console.log("🦶 PDR başlatıldı - Baz konum:", baseLat.toFixed(6), baseLng.toFixed(6));
            
            // Callback bildir
            if (this.options.afterDeviceMove) {
                this.options.afterDeviceMove({
                    lat: baseLat,
                    lng: baseLng,
                    accuracy: this._pdr.currentAccuracy,
                    angle: this._angle,
                    isPDR: true,
                    pdrStepCount: 0,
                    pdrActive: true
                });
            }
        },
        
        // PDR'ı durdur
        _stopDeadReckoning: function (reason) {
            if (!this._pdr.active) return;
            
            // DeviceMotion listener'ı kaldır
            if (this._pdr.motionHandler) {
                window.removeEventListener("devicemotion", this._pdr.motionHandler, false);
                this._pdr.motionHandler = null;
            }
            
            console.log("🦶 PDR durduruldu (" + (reason || "bilinmeyen") + ") - " + 
                        this._pdr.stepCount + " adım, " + 
                        ((Date.now() - this._pdr.startTime) / 1000).toFixed(1) + "s");
            
            this._pdr.active = false;
        },
        
        // DeviceMotion event handler - adım tespiti
        _onDeviceMotion: function (event) {
            if (!this._pdr.active) return;
            
            // Zaman/adım limiti kontrolü
            var now = Date.now();
            if (now - this._pdr.startTime > this.options.pdrMaxDuration) {
                this._stopDeadReckoning("süre limiti aşıldı");
                return;
            }
            if (this._pdr.stepCount >= this.options.pdrMaxSteps) {
                this._stopDeadReckoning("adım limiti aşıldı");
                return;
            }
            
            // İvmeölçer verisini al
            var acc = event.accelerationIncludingGravity;
            if (!acc || acc.x === null) return;
            
            // İvme büyüklüğü (toplam kuvvet vektörü)
            var magnitude = Math.sqrt(acc.x * acc.x + acc.y * acc.y + acc.z * acc.z);
            
            // Buffer'a ekle (gürültü azaltma)
            this._pdr.accBuffer.push(magnitude);
            if (this._pdr.accBuffer.length > this._pdr.accBufferSize) {
                this._pdr.accBuffer.shift();
            }
            
            // Buffer ortalaması
            var avgMag = 0;
            for (var i = 0; i < this._pdr.accBuffer.length; i++) {
                avgMag += this._pdr.accBuffer[i];
            }
            avgMag /= this._pdr.accBuffer.length;
            
            // Normalize: g kuvvetini çıkar (~9.81), sadece hareket ivmesine bak
            var g = 9.81;
            var delta = Math.abs(avgMag - g);
            
            // ═══ ADIM TESPİT ALGORİTMASI (zirve tespiti) ═══
            // İnsan yürüyüşünde her adımda ivme bir zirve yapar.
            // Eşik geçilince "zirve fazı"na gir, eşiğin altına düşünce "adım sayılır"
            var threshold = this.options.pdrStepThreshold;
            
            if (!this._pdr.isStepPhase && delta > threshold) {
                // Eşik aşıldı → zirve fazına gir
                this._pdr.isStepPhase = true;
            } else if (this._pdr.isStepPhase && delta < threshold * 0.6) {
                // Eşiğin altına düştü → bir adım tamamlandı
                this._pdr.isStepPhase = false;
                
                // Cooldown kontrolü (çift sayımı engelle)
                if (now - this._pdr.lastStepTime > this.options.pdrStepCooldown) {
                    this._pdr.lastStepTime = now;
                    this._onStepDetected();
                }
            }
            
            this._pdr.lastAccMagnitude = delta;
        },
        
        // Bir adım algılandı - konum güncelle
        _onStepDetected: function () {
            this._pdr.stepCount++;
            
            // Heading (pusula yönü) mevcut mu?
            var heading = this._angle;
            if (heading === undefined || heading === null) {
                // Heading yoksa PDR çalışamaz - son konumu koru
                console.warn("🦶 PDR: Heading verisi yok, adım sayıldı ama konum güncellenemiyor");
                return;
            }
            
            // Adım uzunluğu
            var stepLength = this.options.pdrStepLength;
            
            // Heading'i radyana çevir (0° = Kuzey, saat yönünde artar)
            var headingRad = heading * (Math.PI / 180);
            
            // Mevcut konumdan adım uzunluğu kadar heading yönünde ilerle
            // Enlem: 1 derece ≈ 111,320 metre
            // Boylam: 1 derece ≈ 111,320 × cos(enlem) metre
            var latOffset = (stepLength * Math.cos(headingRad)) / 111320;
            var lngOffset = (stepLength * Math.sin(headingRad)) / (111320 * Math.cos(this._pdr.currentLatitude * Math.PI / 180));
            
            var newLat = this._pdr.currentLatitude + latOffset;
            var newLng = this._pdr.currentLongitude + lngOffset;
            
            // Geofence sınır kontrolü - PDR konumu bina dışına çıkmasın
            var geofenceCheck = this._isInsideGeofence(newLat, newLng);
            if (!geofenceCheck.inside) {
                // Bina sınırına ulaşıldı - konum güncellenmez ama PDR devam eder
                // (kullanıcı geri dönebilir)
                console.log("🦶 PDR: Geofence sınırına ulaşıldı, konum güncellenmedi");
                return;
            }
            
            // Konumu güncelle
            this._pdr.currentLatitude = newLat;
            this._pdr.currentLongitude = newLng;
            
            // Accuracy: her adımda biraz artar (belirsizlik büyür)
            this._pdr.currentAccuracy += this.options.pdrAccuracyDecay;
            
            // Ana konum değişkenlerini güncelle
            this._latitude = newLat;
            this._longitude = newLng;
            this._accuracy = this._pdr.currentAccuracy;
            
            // Marker'ı güncelle
            this._updateMarker();
            
            // console.log("🦶 PDR Adım #" + this._pdr.stepCount + 
            //     " → [" + newLat.toFixed(6) + ", " + newLng.toFixed(6) + "]" +
            //     " accuracy: " + this._pdr.currentAccuracy.toFixed(1) + "m");
        },
        
        // PDR aktif mi? (dışarıdan sorgulanabilir)
        isDeadReckoningActive: function () {
            return this._pdr.active;
        },
        
        // PDR durumunu al
        getDeadReckoningState: function () {
            return {
                active: this._pdr.active,
                stepCount: this._pdr.stepCount,
                accuracy: this._pdr.currentAccuracy,
                duration: this._pdr.active ? Date.now() - this._pdr.startTime : 0,
                basePosition: this._pdr.baseLatitude ? {
                    lat: this._pdr.baseLatitude,
                    lng: this._pdr.baseLongitude
                } : null
            };
        },

        _onZoomStart: function () {
            if (this._circle) document.documentElement.style.setProperty("--leaflet-simple-locate-circle-display", "none");
        },

        _onZoomEnd: function () {
            if (this._circle) document.documentElement.style.setProperty("--leaflet-simple-locate-circle-display", "inline");
        },

        _onLayerAdd: function (event) {
            if (this.options.afterMarkerAdd && event.layer == this._marker) {
                // console.log("_onLayerAdd", new Date().toISOString(), event.layer.icon_name ? event.layer.icon_name : "undefined", event.layer);
                this.options.afterMarkerAdd();
            }
        },

        _setView: function () {
            if (!this._map || !this._latitude || !this._longitude) return;

            if (this.options.zoomLevel)
                this._map.setView([this._latitude, this._longitude], this.options.zoomLevel);
            else
                this._map.setView([this._latitude, this._longitude]);
        },

        _updateButton: function () {
            if (!this._clicked) {
                if (this._button.html_name !== "init") {
                    this._button.innerHTML = this.options.htmlInit;
                    this._button.html_name = "init";
                }
                return;
            }

            if (typeof this._geolocation === "undefined" || typeof this._orientation === "undefined") {
                if (this._button.html_name !== "spinner") {
                    this._button.innerHTML = this.options.htmlSpinner;
                    this._button.html_name = "spinner";
                }
                return;
            }

            if (this._orientation && this._button.html_name !== "orientation") {
                this._button.innerHTML = this.options.htmlOrientation;
                this._button.html_name = "orientation";
                return;
            }

            if (this._geolocation && this._button.html_name !== "geolocation") {
                this._button.innerHTML = this.options.htmlGeolocation;
                this._button.html_name = "geolocation";
            }
        },

        _updateMarker: function () {
            if (this.options.afterDeviceMove) {
                // Callback fonksiyonunu çağır, filtrelenmiş konumu ve filtreleme istatistiklerini kullan
                this.options.afterDeviceMove({
                    lat: this._latitude,
                    lng: this._longitude,
                    accuracy: this._accuracy,
                    angle: this._angle,
                    isFiltered: true,
                    isJump: this._weiYeState.isJumpDetected,
                    filterStats: this._weiYeState.filteringStats,
                    // ========== İÇ MEKAN İYİLEŞTİRMELERİ - YENİ BİLGİLER ==========
                    confidence: this._lastGoodLocation.confidence,
                    locationStats: this._locationStats,
                    isFallback: this._weiYeState.lastFilteredPosition?.isFallback || false,
                    isIndoorMode: this.options.indoorMode,
                    consecutiveBadLocations: this._consecutiveBadLocations,
                    // ========== PDR BİLGİLERİ ==========
                    isPDR: this._pdr.active,
                    pdrStepCount: this._pdr.stepCount,
                    pdrAccuracy: this._pdr.currentAccuracy,
                    // ========== ALTITUDE & KAT BİLGİLERİ ==========
                    altitude: this._altitude.filtered,
                    altitudeRaw: this._altitude.raw,
                    altitudeAccuracy: this._altitude.accuracy,
                    altitudePlatform: this._altitude.platform,
                    floor: this._altitude.floor,
                    floorName: this._altitude.floorName
                });
            }

            if (!this._latitude || !this._longitude || (this.options.drawCircle && !this._accuracy)) {
                return;
            }
            
            // ========== EK GÜVENLİK: MARKER GÜNCELLENİRKEN DE GEOFENCE KONTROLÜ ==========
            const markerGeofenceCheck = this._isInsideGeofence(this._latitude, this._longitude);
            if (!markerGeofenceCheck.inside) {
                console.log(`🚫 Marker konumu yeni alan dışında - marker ve circle gizleniyor`);
                // Marker'ı gizle
                if (this._marker) {
                    this._map.removeLayer(this._marker);
                    this._marker = undefined;
                }
                // Circle varsa kaldır (alan dışı circle gösterimi devre dışı)
                if (this._circle) {
                    this._map.removeLayer(this._circle);
                    this._circle = undefined;
                }
                return;
            }

            let icon_name;
            if (this._geolocation && this._orientation && this._angle) icon_name = "iconOrientation";
            else if (this._geolocation) icon_name = "iconGeolocation";
            else {
                return;
            }

            // Dinamik eşik: Accuracy eşiğin üzerindeyse, sadece soluk konum dairesini göster, işaretçiyi gizle
            const threshold = this.options.markerVisibilityThreshold || 30;
            const isLowAccuracy = this._accuracy > threshold;

            // Doğruluk dairesini her zaman güncelle - RADİKAL ÇÖZÜM
            if (this._circle) {
                this._circle.setLatLng([this._latitude, this._longitude]);
                this._circle.setRadius(this._accuracy);

                // Doğruluk düzeyine göre dairenin stilini ayarla
                const accuracyColor = this._getAccuracyColor(this._accuracy);

                // Düşük doğrulukta kesikli çizgi (accuracy > 5m)
                if (isLowAccuracy) {
                    this._circle.setStyle({
                        fillColor: accuracyColor,
                        color: accuracyColor,
                        fillOpacity: 0.1,   // Daha soluk fill
                        opacity: 0.3,       // Daha soluk stroke
                        weight: 2,
                        dashArray: '10 6'
                    });
                    
                    // RADİKAL: Her update'te dashArray'i zorla uygula
                    this._forceCircleDashArray(isLowAccuracy);
                } else {
                    // Yüksek doğrulukta düz çizgi (accuracy ≤ 5m)
                    this._circle.setStyle({
                        fillColor: accuracyColor,
                        color: accuracyColor,
                        fillOpacity: 0.2,
                        opacity: 0.8,       // Daha belirgin stroke
                        weight: 1,
                        dashArray: ''
                    });
                    
                    // RADİKAL: Düz çizgi için dashArray'i temizle
                    this._forceCircleDashArray(false);
                }

                // Sıçrama tespit edildiyse ve doğruluk düşük değilse visual feedback
                if (this._weiYeState.isJumpDetected && !isLowAccuracy) {
                    this._circle.setStyle({
                        dashArray: "8 4",
                        fillOpacity: 0.3,
                        opacity: 0.9
                    });

                    // Birkaç saniye sonra normale döndür
                    setTimeout(() => {
                        if (this._circle) {
                            this._circle.setStyle({
                                dashArray: isLowAccuracy ? "10 6" : "",
                                fillOpacity: isLowAccuracy ? 0.15 : 0.2,
                                opacity: isLowAccuracy ? 0.8 : 0.5
                            });
                            this._forceCircleDashArray(isLowAccuracy);
                        }
                    }, 2000);
                }

            } else if (this.options.drawCircle) {
                // İlk kez daire oluşturma
                const accuracyColor = this._getAccuracyColor(this._accuracy);
                this._circle = L.circle([this._latitude, this._longitude], {
                    radius: this._accuracy,
                    fillColor: accuracyColor,
                    color: accuracyColor,
                    fillOpacity: isLowAccuracy ? 0.1 : 0.2,   // Kesikli daha soluk fill
                    opacity: isLowAccuracy ? 0.3 : 0.8,       // Kesikli soluk, düz belirgin
                    weight: isLowAccuracy ? 2 : 1,
                    dashArray: isLowAccuracy ? '10 6' : ''
                }).addTo(this._map);
                
                // RADİKAL: Circle eklendikten hemen sonra dashArray'i zorla
                setTimeout(() => {
                    this._forceCircleDashArray(isLowAccuracy);
                    // RADİKAL: Sürekli kontrol eden mekanizmayı başlat
                    this._startCircleStyleWatcher();
                }, 10);
                
                // RADİKAL: Harita her hareket ettiğinde veya zoom değiştiğinde yeniden uygula
                this._map.on('moveend zoomend', () => {
                    if (this._circle && this._accuracy > 15) {  // TEST: 15m eşiği
                        this._forceCircleDashArray(true);
                    }
                });
            }

            // Konum marker'ını güncelle veya göster/gizle
            if (isLowAccuracy) {
                // Accuracy > 15m ise marker'ı gizle (varsa)
                if (this._marker) {
                    this._map.removeLayer(this._marker);
                    this._marker = undefined;
                }
            } else {
                // Accuracy ≤ 15m ise marker'ı göster ve güncelle
                if (this._marker && this._marker.icon_name === icon_name) {
                    this._marker.setLatLng([this._latitude, this._longitude]);
                } else {
                    if (this._marker) this._map.removeLayer(this._marker);
                    this._marker = L.marker([this._latitude, this._longitude], {
                        icon: this.options[icon_name]
                    });
                    this._marker.icon_name = icon_name;
                    this._marker.addTo(this._map);
                }
            }

            // Doğruluk bilgisini güncelle - opsiyonel
            this._lastAccuracy = this._accuracy;
        },

        // RADİKAL: Circle'a kesikli çizgiyi zorla uygula
        _forceCircleDashArray: function(isDashed) {
            if (!this._circle || !this._circle._path) return;
            
            const path = this._circle._path;
            
            if (isDashed) {
                // Kesikli çizgi - soluk siyah
                path.style.strokeDasharray = '10, 6';
                path.setAttribute('stroke-dasharray', '10, 6');
                path.style.strokeWidth = '2';
                path.setAttribute('stroke-width', '2');
                path.style.strokeOpacity = '0.3';  // Daha soluk
                path.setAttribute('stroke-opacity', '0.3');
                
            } else {
                // Düz çizgi - normal siyah
                path.style.strokeDasharray = '';
                path.setAttribute('stroke-dasharray', '');
                path.style.strokeWidth = '1';
                path.setAttribute('stroke-width', '1');
                path.style.strokeOpacity = '0.8';  // Daha belirgin
                path.setAttribute('stroke-opacity', '0.8');
                
            }
        },
        
        // RADİKAL: Sürekli stil kontrolü başlat
        _startCircleStyleWatcher: function() {
            // Eski interval varsa temizle
            if (this._circleStyleInterval) {
                clearInterval(this._circleStyleInterval);
            }
            
            // Her 100ms'de bir kontrol et ve gerekirse düzelt
            this._circleStyleInterval = setInterval(() => {
                if (this._circle && this._circle._path && this._accuracy) {
                    const threshold = this.options.markerVisibilityThreshold || 30;
                    const isLowAccuracy = this._accuracy > threshold;
                    const path = this._circle._path;
                    const currentDashArray = path.getAttribute('stroke-dasharray');
                    
                    // Yanlış durumda ise düzelt
                    if (isLowAccuracy && (!currentDashArray || currentDashArray === '')) {
                        this._forceCircleDashArray(true);
                    } else if (!isLowAccuracy && currentDashArray && currentDashArray !== '') {
                        this._forceCircleDashArray(false);
                    }
                }
            }, 100);
        },
        
        // RADİKAL: Stil kontrolünü durdur
        _stopCircleStyleWatcher: function() {
            if (this._circleStyleInterval) {
                clearInterval(this._circleStyleInterval);
                this._circleStyleInterval = undefined;
            }
        },

        // Doğruluk değerine göre renk döndür
        // Kullanıcı talebi: Her zaman siyah
        _getAccuracyColor: function (accuracy) {
            return '#000000'; // Her zaman siyah
        },

        // Kalman filtresini uygula
        _applyKalmanFilter: function (position) {
            const kf = this._kalmanFilter;

            // İlk ölçümde Kalman filtresini başlat
            if (kf.x_lat === null || kf.x_lng === null) {
                kf.x_lat = position.latitude;
                kf.x_lng = position.longitude;
                // Başlangıç kovaryansını yüksek tut (belirsizlik yüksek)
                kf.P_lat = 1.0;
                kf.P_lng = 1.0;

                return {
                    latitude: position.latitude,
                    longitude: position.longitude,
                    accuracy: position.accuracy,
                    timestamp: position.timestamp
                };
            }

            // iOS için özel düzeltme: Eğer timestamp çok eskiyse veya çok büyük bir sıçrama varsa,
            // filtreyi sıfırla ve yeni konumu kabul et
            const lastPosition = this._weiYeState.lastFilteredPosition;
            if (lastPosition && position.timestamp) {
                const timeDiff = Math.abs(position.timestamp - (lastPosition.timestamp || Date.now())) / 1000; // saniye cinsinden

                // iOS'ta bazen timestamp'ler düzgün gelmeyebilir veya çok büyük gecikmeler olabilir
                // Eğer 30 saniyeden fazla geçtiyse ve büyük bir mesafe varsa, filtreyi sıfırla
                if (timeDiff > 30) {
                    const distance = L.latLng(lastPosition.latitude, lastPosition.longitude)
                        .distanceTo(L.latLng(position.latitude, position.longitude));

                    if (distance > 50) {
                        // iOS'ta büyük bir sıçrama ve uzun gecikme varsa, filtreyi sıfırla
                        kf.x_lat = position.latitude;
                        kf.x_lng = position.longitude;
                        kf.P_lat = 1.0;
                        kf.P_lng = 1.0;

                        return {
                            latitude: position.latitude,
                            longitude: position.longitude,
                            accuracy: position.accuracy,
                            timestamp: position.timestamp
                        };
                    }
                }
            }

            // Kalman filtresi adımları
            // 1. Tahmin (Prediction)
            // Durum tahmini aynı kalır (durağan model varsayımı)
            const x_pred_lat = kf.x_lat;
            const x_pred_lng = kf.x_lng;

            // Tahmin hatası kovaryansı artar (Q eklenir)
            const P_pred_lat = kf.P_lat + kf.Q_lat;
            const P_pred_lng = kf.P_lng + kf.Q_lng;

            // 2. Güncelleme (Update)
            // Kalman kazancı
            const K_lat = P_pred_lat / (P_pred_lat + kf.R_lat);
            const K_lng = P_pred_lng / (P_pred_lng + kf.R_lng);

            // Güncellenmiş durum tahmini
            kf.x_lat = x_pred_lat + K_lat * (position.latitude - x_pred_lat);
            kf.x_lng = x_pred_lng + K_lng * (position.longitude - x_pred_lng);

            // Güncellenmiş tahmin hatası kovaryansı
            kf.P_lat = (1 - K_lat) * P_pred_lat;
            kf.P_lng = (1 - K_lng) * P_pred_lng;

            // iOS için özel düzeltme: Eğer filtrelenmiş konum çok uzaklaşırsa, 
            // iOS'ta genellikle kuzeye kayma sorunu olabilir
            // Bu durumda filtrelenmiş değeri sınırla
            const filteredDistance = L.latLng(position.latitude, position.longitude)
                .distanceTo(L.latLng(kf.x_lat, kf.x_lng));

            // Eğer filtrelenmiş konum ham konumdan çok uzaksa (accuracy'nin 2 katından fazla),
            // iOS'ta bu genellikle bir hata işaretidir
            const maxAllowedDistance = Math.max(position.accuracy * 2, 20); // En az 20m

            if (filteredDistance > maxAllowedDistance) {
                // Dinamik blend faktörü: Mesafe ve accuracy'ye göre hesapla
                // Mesafe arttıkça blend faktörü artar (daha fazla ham değer kullan)
                const normalizedDistance = Math.min(1.0, filteredDistance / (maxAllowedDistance * 2));
                const blendFactor = Math.min(0.85, Math.max(0.5, 0.5 + normalizedDistance * 0.35));

                kf.x_lat = blendFactor * position.latitude + (1 - blendFactor) * kf.x_lat;
                kf.x_lng = blendFactor * position.longitude + (1 - blendFactor) * kf.x_lng;
            }

            return {
                latitude: kf.x_lat,
                longitude: kf.x_lng,
                accuracy: position.accuracy,
                timestamp: position.timestamp
            };
        },

        // Kullanıcı hareketini tespit et
        // İyileştirme: Ayrı hareket geçmişi kullan (Low Pass filtrelenmiş konumlar)
        _detectUserMoving: function () {
            const mh = this._movementHistory;

            // Geçmiş penceresinde yeterli veri yoksa, hareket halinde kabul et
            if (mh.positions.length < 3) {
                return true; // Varsayılan olarak hareket halinde kabul et
            }

            // Son birkaç ölçüm arasındaki mesafeyi hesapla
            let totalDistance = 0;
            let timeSpan = 0;

            for (let i = 1; i < mh.positions.length; i++) {
                const prevPos = mh.positions[i - 1];
                const currPos = mh.positions[i];

                const distance = L.latLng(prevPos.latitude, prevPos.longitude)
                    .distanceTo(L.latLng(currPos.latitude, currPos.longitude));
                totalDistance += distance;

                if (mh.timestamps[i] && mh.timestamps[i - 1]) {
                    timeSpan += Math.abs(mh.timestamps[i] - mh.timestamps[i - 1]);
                }
            }

            // iOS için özel düzeltme: iOS'ta timestamp'ler bazen düzgün gelmeyebilir
            // Eğer zaman aralığı çok küçükse veya çok büyükse, varsayılan olarak hareket halinde kabul et
            if (timeSpan < 100 || timeSpan > 60000) { // 100ms'den az veya 60 saniyeden fazla
                return true;
            }

            // Hızı hesapla (m/s)
            const avgSpeed = (totalDistance / (timeSpan / 1000)); // m/s

            // iOS için özel: Log analizine göre iOS'ta durağan halinde bile 0.3-2m/s hareket var
            // Daha yüksek eşik kullan
            const speedThreshold = this._isIOS ? 0.8 : 0.5; // iOS: 0.8 m/s, Android: 0.5 m/s

            return avgSpeed > speedThreshold;
        },

        // Hareket geçmişini güncelle
        _updateMovementHistory: function (position) {
            const mh = this._movementHistory;
            const timestamp = position.timestamp || Date.now();

            // Yeni konumu ekle
            mh.positions.push({
                latitude: position.latitude,
                longitude: position.longitude
            });
            mh.timestamps.push(timestamp);

            // Maksimum boyutu aşarsa en eskisini kaldır
            while (mh.positions.length > mh.maxSize) {
                mh.positions.shift();
                mh.timestamps.shift();
            }
        },

        // Uzun süreli hareketsizlik tespiti (opsiyonel)
        _detectStationaryState: function () {
            const m = this._medianFilter;

            // Geçmiş penceresinde yeterli veri yoksa, durağan değil
            if (m.latHistory.length < m.windowSize) {
                return false;
            }

            // Penceredeki ilk ve son konum arasındaki farkı hesapla
            const firstLat = m.latHistory[0];
            const firstLng = m.lngHistory[0];
            const lastLat = m.latHistory[m.latHistory.length - 1];
            const lastLng = m.lngHistory[m.lngHistory.length - 1];

            const distance = L.latLng(firstLat, firstLng).distanceTo(L.latLng(lastLat, lastLng));

            // 5 metreden az hareket olduysa, durağan kabul et
            return distance < 5;
        }
    });

    L.control.simpleLocate = function (options) {
        return new SimpleLocate(options);
    };

    return SimpleLocate;
});