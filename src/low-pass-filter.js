/**

 * GPS/Geolocation verilerindeki yüksek frekanslı gürültüyü azaltır
 * 
 * @author SimpleLocate Team
 * @version 1.0.0
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory);
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory();
    } else {
        root.LowPassFilter = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    /**
     * LowPassFilter Constructor
     * @param {number} sampleFrequency - Örnekleme frekansı (Hz)
     * @param {number} tau - Zaman sabiti (saniye) - Daha yüksek = daha fazla yumuşatma
     */
    function LowPassFilter(sampleFrequency, tau) {
        this._sampleFrequency = sampleFrequency || 1.0;
        this._tau = tau || 1.0;
        this._alpha = this._calculateAlpha();
        this._lastOutput = null;
        this._initialized = false;
    }

    /**
     * Alpha katsayısını hesapla
     * alpha = dt / (tau + dt) where dt = 1/sampleFrequency
     */
    LowPassFilter.prototype._calculateAlpha = function () {
        var dt = 1.0 / this._sampleFrequency;
        return dt / (this._tau + dt);
    };

    /**
     * Örnekleme frekansını güncelle
     * @param {number} frequency - Yeni örnekleme frekansı (Hz)
     */
    LowPassFilter.prototype.setSampleFrequency = function (frequency) {
        if (frequency > 0) {
            this._sampleFrequency = frequency;
            this._alpha = this._calculateAlpha();
        }
    };

    /**
     * Zaman sabitini güncelle
     * @param {number} tau - Yeni zaman sabiti (saniye)
     */
    LowPassFilter.prototype.setTau = function (tau) {
        if (tau > 0) {
            this._tau = tau;
            this._alpha = this._calculateAlpha();
        }
    };

    /**
     * Yeni örnek ekle ve filtrelenmiş değeri hesapla
     * @param {number} sample - Yeni giriş değeri
     * @returns {number} Filtrelenmiş çıkış değeri
     */
    LowPassFilter.prototype.addSample = function (sample) {
        if (!this._initialized) {
            this._lastOutput = sample;
            this._initialized = true;
            return sample;
        }

        // y[n] = alpha * x[n] + (1 - alpha) * y[n-1]
        this._lastOutput = this._alpha * sample + (1 - this._alpha) * this._lastOutput;
        return this._lastOutput;
    };

    /**
     * Son filtrelenmiş çıkış değerini döndür
     * @returns {number|null}
     */
    LowPassFilter.prototype.lastOutput = function () {
        return this._lastOutput;
    };

    /**
     * Filtreyi sıfırla
     */
    LowPassFilter.prototype.reset = function () {
        this._lastOutput = null;
        this._initialized = false;
    };

    /**
     * Mevcut alpha değerini döndür
     * @returns {number}
     */
    LowPassFilter.prototype.getAlpha = function () {
        return this._alpha;
    };

    /**
     * Filtre başlatılmış mı?
     * @returns {boolean}
     */
    LowPassFilter.prototype.isInitialized = function () {
        return this._initialized;
    };

    return LowPassFilter;
}));



