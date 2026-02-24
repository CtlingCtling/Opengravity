/*  ansi_up.js
 *  author : Dru Nelson
 *  license : MIT
 *  http://github.com/drudru/ansi_up
 */
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define(['exports'], factory);
    } else if (typeof exports === 'object' && typeof exports.nodeName !== 'string') {
        factory(exports);
    } else {
        var exp = {};
        factory(exp);
        root.AnsiUp = exp.default;
    }
}(this, function (exports) {
    "use strict";
    var __makeTemplateObject = (this && this.__makeTemplateObject) || function (cooked, raw) {
        if (Object.defineProperty) { Object.defineProperty(cooked, "raw", { value: raw }); } else { cooked.raw = raw; }
        return cooked;
    };
    var PacketKind;
    (function (PacketKind) {
        PacketKind[PacketKind["EOS"] = 0] = "EOS";
        PacketKind[PacketKind["Text"] = 1] = "Text";
        PacketKind[PacketKind["Incomplete"] = 2] = "Incomplete";
        PacketKind[PacketKind["ESC"] = 3] = "ESC";
        PacketKind[PacketKind["Unknown"] = 4] = "Unknown";
        PacketKind[PacketKind["SGR"] = 5] = "SGR";
        PacketKind[PacketKind["OSCURL"] = 6] = "OSCURL";
    })(PacketKind || (PacketKind = {}));
    var AnsiUp = (function () {
        function AnsiUp() {
            this.VERSION = "5.1.0";
            this.setup_palettes();
            this._use_classes = false;
            this.bold = false;
            this.italic = false;
            this.underline = false;
            this.fg = this.bg = null;
            this._buffer = '';
            this._url_whitelist = { 'http': 1, 'https': 1 };
        }
        Object.defineProperty(AnsiUp.prototype, "use_classes", {
            get: function () { return this._use_classes; },
            set: function (arg) { this._use_classes = arg; },
            enumerable: false,
            configurable: true
        });
        AnsiUp.prototype.setup_palettes = function () {
            var _this = this;
            this.ansi_colors = [
                [
                    { rgb: [0, 0, 0], class_name: "ansi-black" },
                    { rgb: [187, 0, 0], class_name: "ansi-red" },
                    { rgb: [0, 187, 0], class_name: "ansi-green" },
                    { rgb: [187, 187, 0], class_name: "ansi-yellow" },
                    { rgb: [0, 0, 187], class_name: "ansi-blue" },
                    { rgb: [187, 0, 187], class_name: "ansi-magenta" },
                    { rgb: [0, 187, 187], class_name: "ansi-cyan" },
                    { rgb: [255, 255, 255], class_name: "ansi-white" }
                ],
                [
                    { rgb: [85, 85, 85], class_name: "ansi-bright-black" },
                    { rgb: [255, 85, 85], class_name: "ansi-bright-red" },
                    { rgb: [0, 255, 0], class_name: "ansi-bright-green" },
                    { rgb: [255, 255, 85], class_name: "ansi-bright-yellow" },
                    { rgb: [85, 85, 255], class_name: "ansi-bright-blue" },
                    { rgb: [255, 85, 255], class_name: "ansi-bright-magenta" },
                    { rgb: [85, 255, 255], class_name: "ansi-bright-cyan" },
                    { rgb: [255, 255, 255], class_name: "ansi-bright-white" }
                ]
            ];
            this.palette_256 = [];
            this.ansi_colors.forEach(function (palette) {
                palette.forEach(function (rec) { _this.palette_256.push(rec); });
            });
            var levels = [0, 95, 135, 175, 215, 255];
            for (var r = 0; r < 6; ++r) {
                for (var g = 0; g < 6; ++g) {
                    for (var b = 0; b < 6; ++b) {
                        this.palette_256.push({ rgb: [levels[r], levels[g], levels[b]], class_name: 'truecolor' });
                    }
                }
            }
            var grey_level = 8;
            for (var i = 0; i < 24; ++i, grey_level += 10) {
                this.palette_256.push({ rgb: [grey_level, grey_level, grey_level], class_name: 'truecolor' });
            }
        };
        AnsiUp.prototype.escape_txt_for_html = function (txt) {
            return txt.replace(/[&<>"']/gm, function (str) {
                if (str === "&") return "&amp;";
                if (str === "<") return "&lt;";
                if (str === ">") return "&gt;";
                if (str === "\"") return "&quot;";
                if (str === "'") return "&#x27;";
            });
        };
        AnsiUp.prototype.append_buffer = function (txt) { this._buffer += txt; };
        AnsiUp.prototype.get_next_packet = function () {
            var pkt = { kind: PacketKind.EOS, text: '', url: '' };
            var len = this._buffer.length;
            if (len == 0) return pkt;
            var pos = this._buffer.indexOf("\x1B");
            if (pos == -1) {
                pkt.kind = PacketKind.Text;
                pkt.text = this._buffer;
                this._buffer = '';
                return pkt;
            }
            if (pos > 0) {
                pkt.kind = PacketKind.Text;
                pkt.text = this._buffer.slice(0, pos);
                this._buffer = this._buffer.slice(pos);
                return pkt;
            }
            if (pos == 0) {
                if (len == 1) return { kind: PacketKind.Incomplete };
                var next_char = this._buffer.charAt(1);
                if ((next_char != '[') && (next_char != ']')) {
                    pkt.kind = PacketKind.ESC;
                    pkt.text = this._buffer.slice(0, 1);
                    this._buffer = this._buffer.slice(1);
                    return pkt;
                }
                if (next_char == '[') {
                    if (!this._csi_regex) {
                        this._csi_regex = rgx(__makeTemplateObject(["\n                        ^                           # beginning of line\n                        (?:                         # legal sequence\n                          \u001B[                      # CSI\n                          ([<-?]?)              # private-mode char\n                          ([d;]*)                    # any digits or semicolons\n                          ([ -/]?               # an intermediate modifier\n                          [@-~])                # the command\n                        )\n                        |                           # alternate (second attempt)\n                        (?:                         # illegal sequence\n                          \u001B[                      # CSI\n                          [ -~]*                # anything legal\n                          ([\0-\u001F:])              # anything illegal\n                        )\n                    "], ["\n                        ^                           # beginning of line\n                        (?:                         # legal sequence\n                          \\x1b\\[                      # CSI\n                          ([\\x3c-\\x3f]?)              # private-mode char\n                          ([\\d;]*)                    # any digits or semicolons\n                          ([\\x20-\\x2f]?               # an intermediate modifier\n                          [\\x40-\\x7e])                # the command\n                        )\n                        |                           # alternate (second attempt)\n                        (?:                         # illegal sequence\n                          \\x1b\\[                      # CSI\n                          [\\x20-\\x7e]*                # anything legal\n                          ([\\x00-\\x1f:])              # anything illegal\n                        )\n                    "]));
                    }
                    var match = this._buffer.match(this._csi_regex);
                    if (match === null) return { kind: PacketKind.Incomplete };
                    if (match[4]) {
                        pkt.kind = PacketKind.ESC;
                        pkt.text = this._buffer.slice(0, 1);
                        this._buffer = this._buffer.slice(1);
                        return pkt;
                    }
                    pkt.kind = ((match[1] != '') || (match[3] != 'm')) ? PacketKind.Unknown : PacketKind.SGR;
                    pkt.text = match[2];
                    this._buffer = this._buffer.slice(match[0].length);
                    return pkt;
                }
            }
            return pkt;
        };
        AnsiUp.prototype.ansi_to_html = function (txt) {
            this.append_buffer(txt);
            var blocks = [];
            while (true) {
                var packet = this.get_next_packet();
                if (packet.kind == PacketKind.EOS || packet.kind == PacketKind.Incomplete) break;
                if (packet.kind == PacketKind.ESC || packet.kind == PacketKind.Unknown) continue;
                if (packet.kind == PacketKind.Text) blocks.push(this.transform_to_html(this.with_state(packet)));
                else if (packet.kind == PacketKind.SGR) this.process_ansi(packet);
            }
            return blocks.join("");
        };
        AnsiUp.prototype.with_state = function (pkt) {
            return { bold: this.bold, italic: this.italic, underline: this.underline, fg: this.fg, bg: this.bg, text: pkt.text };
        };
        AnsiUp.prototype.process_ansi = function (pkt) {
            var sgr_cmds = pkt.text.split(';');
            while (sgr_cmds.length > 0) {
                var sgr_cmd_str = sgr_cmds.shift();
                var num = parseInt(sgr_cmd_str, 10);
                if (isNaN(num) || num === 0) {
                    this.fg = this.bg = null; this.bold = this.italic = this.underline = false;
                } else if (num === 1) { this.bold = true; }
                else if (num === 22) { this.bold = false; }
                else if ((num >= 30) && (num < 38)) { this.fg = this.ansi_colors[0][(num - 30)]; }
                else if ((num >= 90) && (num < 98)) { this.fg = this.ansi_colors[1][(num - 90)]; }
            }
        };
        AnsiUp.prototype.transform_to_html = function (fragment) {
            var txt = fragment.text;
            if (txt.length === 0) return txt;
            txt = this.escape_txt_for_html(txt);
            if (!fragment.bold && !fragment.italic && !fragment.underline && fragment.fg === null && fragment.bg === null) return txt;
            var styles = [];
            if (fragment.bold) styles.push('font-weight:bold');
            if (fragment.fg) styles.push("color:rgb(" + fragment.fg.rgb.join(',') + ")");
            return "<span style=\"" + styles.join(';') + "\">" + txt + "</span>";
        };
        return AnsiUp;
    }());
    function rgx(tmplObj) {
        return new RegExp(tmplObj.raw[0].replace(/^\s+|\s+\n|\s*#[\s\S]*?\n|\n/gm, ''));
    }
    exports.default = AnsiUp;
}));
