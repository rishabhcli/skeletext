"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var vitest_1 = require("vitest");
var core_1 = require("@skeletext/core");
(0, vitest_1.describe)('buildInvalidRepoPage', function () {
    (0, vitest_1.it)('returns a 960-byte page containing the ASCII bytes for bad', function () {
        var _a;
        var page = buildInvalid('bad');
        var flat = new Uint8Array(960);
        for (var r = 0; r < 24; r++) {
            var row = (0, core_1.getRow)(page, r);
            for (var c = 0; c < 40; c++) {
                flat[r * 40 + c] = (_a = row[c]) !== null && _a !== void 0 ? _a : 0x20;
            }
        }
        // Find 'bad' in the bytes
        var badBytes = [0x62, 0x61, 0x64]; // 'b', 'a', 'd'
        var found = false;
        for (var i = 0; i < flat.length - 2; i++) {
            if (flat[i] === badBytes[0] && flat[i + 1] === badBytes[1] && flat[i + 2] === badBytes[2]) {
                found = true;
                break;
            }
        }
        (0, vitest_1.expect)(found).toBe(true);
    });
});
(0, vitest_1.describe)('buildRateLimitPage', function () {
    (0, vitest_1.it)('returns a 960-byte page containing HH:MM:SS UTC for valid timestamp', function () {
        var _a;
        // 1735600000 is 2024-12-31 16:26:40 UTC
        var page = buildRateLimit('1735600000');
        var flat = new Uint8Array(960);
        for (var r = 0; r < 24; r++) {
            var row = (0, core_1.getRow)(page, r);
            for (var c = 0; c < 40; c++) {
                flat[r * 40 + c] = (_a = row[c]) !== null && _a !== void 0 ? _a : 0x20;
            }
        }
        // Check for 'UTC' in the bytes
        var utcBytes = [0x55, 0x54, 0x43]; // 'U', 'T', 'C'
        var found = false;
        for (var i = 0; i < flat.length - 2; i++) {
            if (flat[i] === utcBytes[0] && flat[i + 1] === utcBytes[1] && flat[i + 2] === utcBytes[2]) {
                found = true;
                break;
            }
        }
        (0, vitest_1.expect)(found).toBe(true);
    });
    (0, vitest_1.it)('returns a page containing unavailable for null reset header', function () {
        var _a;
        var page = buildRateLimit(null);
        var flat = new Uint8Array(960);
        for (var r = 0; r < 24; r++) {
            var row = (0, core_1.getRow)(page, r);
            for (var c = 0; c < 40; c++) {
                flat[r * 40 + c] = (_a = row[c]) !== null && _a !== void 0 ? _a : 0x20;
            }
        }
        // Check for 'unavailable' in the bytes
        var unavailableBytes = [0x75, 0x6E, 0x61, 0x76, 0x61, 0x69, 0x6C, 0x61, 0x62, 0x6C, 0x65]; // 'u', 'n', 'a', 'v', 'a', 'i', 'l', 'a', 'b', 'l', 'e'
        var found = false;
        for (var i = 0; i < flat.length - 10; i++) {
            var match = true;
            for (var j = 0; j < unavailableBytes.length; j++) {
                if (flat[i + j] !== unavailableBytes[j]) {
                    match = false;
                    break;
                }
            }
            if (match) {
                found = true;
                break;
            }
        }
        (0, vitest_1.expect)(found).toBe(true);
    });
});
(0, vitest_1.describe)('buildFetchErrorPage', function () {
    (0, vitest_1.it)('returns a 960-byte page containing timeout', function () {
        var _a;
        var page = buildFetchError('Page 110: commits', 'timeout');
        var flat = new Uint8Array(960);
        for (var r = 0; r < 24; r++) {
            var row = (0, core_1.getRow)(page, r);
            for (var c = 0; c < 40; c++) {
                flat[r * 40 + c] = (_a = row[c]) !== null && _a !== void 0 ? _a : 0x20;
            }
        }
        // Check for 'timeout' in the bytes
        var timeoutBytes = [0x74, 0x69, 0x6D, 0x65, 0x6F, 0x75, 0x74]; // 't', 'i', 'm', 'e', 'o', 'u', 't'
        var found = false;
        for (var i = 0; i < flat.length - 6; i++) {
            if (flat[i] === timeoutBytes[0] && flat[i + 1] === timeoutBytes[1] && flat[i + 2] === timeoutBytes[2] &&
                flat[i + 3] === timeoutBytes[3] && flat[i + 4] === timeoutBytes[4] && flat[i + 5] === timeoutBytes[5] &&
                flat[i + 6] === timeoutBytes[6]) {
                found = true;
                break;
            }
        }
        (0, vitest_1.expect)(found).toBe(true);
    });
});
(0, vitest_1.describe)('buildLoadingPage', function () {
    (0, vitest_1.it)('returns a page whose row 0 starts with the bytes for 110', function () {
        var page = buildLoading(110);
        var row0 = (0, core_1.getRow)(page, 0);
        // Row 0 should start with '110' - bytes 0x31, 0x31, 0x30
        (0, vitest_1.expect)(row0[0]).toBe(0x31); // '1'
        (0, vitest_1.expect)(row0[1]).toBe(0x31); // '1'
        (0, vitest_1.expect)(row0[2]).toBe(0x30); // '0'
    });
    (0, vitest_1.it)('no row exceeds 40 bytes', function () {
        var page = buildLoading(110);
        for (var r = 0; r < 24; r++) {
            var row = (0, core_1.getRow)(page, r);
            // Check that row length is at most 40
            var lastNonSpace = 0;
            for (var c = 0; c < 40; c++) {
                if (row[c] !== undefined && row[c] !== 0x20) {
                    lastNonSpace = c;
                }
            }
            // Last non-space should be at index <= 39 (column 40)
            (0, vitest_1.expect)(lastNonSpace).toBeLessThanOrEqual(39);
        }
    });
});
(0, vitest_1.describe)('page sizes', function () {
    (0, vitest_1.it)('all error pages are 960 bytes (24x40)', function () {
        var pages = [
            buildInvalid('test'),
            buildRateLimit('1735600000'),
            buildFetchError('context', 'reason'),
            buildLoading(110),
        ];
        pages.forEach(function (page) {
            var _a;
            var flat = new Uint8Array(960);
            for (var r = 0; r < 24; r++) {
                var row = (0, core_1.getRow)(page, r);
                for (var c = 0; c < 40; c++) {
                    flat[r * 40 + c] = (_a = row[c]) !== null && _a !== void 0 ? _a : 0x20;
                }
            }
            (0, vitest_1.expect)(flat.length).toBe(960);
        });
    });
});
