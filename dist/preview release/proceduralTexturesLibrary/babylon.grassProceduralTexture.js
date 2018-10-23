(function webpackUniversalModuleDefinition(root, factory) {
	if(typeof exports === 'object' && typeof module === 'object')
		module.exports = factory(require("babylonjs"));
	else if(typeof define === 'function' && define.amd)
		define("babylonjs-procedural-textures", ["babylonjs"], factory);
	else if(typeof exports === 'object')
		exports["babylonjs-procedural-textures"] = factory(require("babylonjs"));
	else
		root["PTLIB"] = factory(root["BABYLON"]);
})(window, function(__WEBPACK_EXTERNAL_MODULE_babylonjs__) {
return /******/ (function(modules) { // webpackBootstrap
/******/ 	// The module cache
/******/ 	var installedModules = {};
/******/
/******/ 	// The require function
/******/ 	function __webpack_require__(moduleId) {
/******/
/******/ 		// Check if module is in cache
/******/ 		if(installedModules[moduleId]) {
/******/ 			return installedModules[moduleId].exports;
/******/ 		}
/******/ 		// Create a new module (and put it into the cache)
/******/ 		var module = installedModules[moduleId] = {
/******/ 			i: moduleId,
/******/ 			l: false,
/******/ 			exports: {}
/******/ 		};
/******/
/******/ 		// Execute the module function
/******/ 		modules[moduleId].call(module.exports, module, module.exports, __webpack_require__);
/******/
/******/ 		// Flag the module as loaded
/******/ 		module.l = true;
/******/
/******/ 		// Return the exports of the module
/******/ 		return module.exports;
/******/ 	}
/******/
/******/
/******/ 	// expose the modules object (__webpack_modules__)
/******/ 	__webpack_require__.m = modules;
/******/
/******/ 	// expose the module cache
/******/ 	__webpack_require__.c = installedModules;
/******/
/******/ 	// define getter function for harmony exports
/******/ 	__webpack_require__.d = function(exports, name, getter) {
/******/ 		if(!__webpack_require__.o(exports, name)) {
/******/ 			Object.defineProperty(exports, name, { enumerable: true, get: getter });
/******/ 		}
/******/ 	};
/******/
/******/ 	// define __esModule on exports
/******/ 	__webpack_require__.r = function(exports) {
/******/ 		if(typeof Symbol !== 'undefined' && Symbol.toStringTag) {
/******/ 			Object.defineProperty(exports, Symbol.toStringTag, { value: 'Module' });
/******/ 		}
/******/ 		Object.defineProperty(exports, '__esModule', { value: true });
/******/ 	};
/******/
/******/ 	// create a fake namespace object
/******/ 	// mode & 1: value is a module id, require it
/******/ 	// mode & 2: merge all properties of value into the ns
/******/ 	// mode & 4: return value when already ns object
/******/ 	// mode & 8|1: behave like require
/******/ 	__webpack_require__.t = function(value, mode) {
/******/ 		if(mode & 1) value = __webpack_require__(value);
/******/ 		if(mode & 8) return value;
/******/ 		if((mode & 4) && typeof value === 'object' && value && value.__esModule) return value;
/******/ 		var ns = Object.create(null);
/******/ 		__webpack_require__.r(ns);
/******/ 		Object.defineProperty(ns, 'default', { enumerable: true, value: value });
/******/ 		if(mode & 2 && typeof value != 'string') for(var key in value) __webpack_require__.d(ns, key, function(key) { return value[key]; }.bind(null, key));
/******/ 		return ns;
/******/ 	};
/******/
/******/ 	// getDefaultExport function for compatibility with non-harmony modules
/******/ 	__webpack_require__.n = function(module) {
/******/ 		var getter = module && module.__esModule ?
/******/ 			function getDefault() { return module['default']; } :
/******/ 			function getModuleExports() { return module; };
/******/ 		__webpack_require__.d(getter, 'a', getter);
/******/ 		return getter;
/******/ 	};
/******/
/******/ 	// Object.prototype.hasOwnProperty.call
/******/ 	__webpack_require__.o = function(object, property) { return Object.prototype.hasOwnProperty.call(object, property); };
/******/
/******/ 	// __webpack_public_path__
/******/ 	__webpack_require__.p = "";
/******/
/******/
/******/ 	// Load entry module and return exports
/******/ 	return __webpack_require__(__webpack_require__.s = "./legacy/legacy-grass.ts");
/******/ })
/************************************************************************/
/******/ ({

/***/ "../node_modules/webpack/buildin/global.js":
/*!*************************************************!*\
  !*** ../node_modules/webpack/buildin/global.js ***!
  \*************************************************/
/*! no static exports found */
/***/ (function(module, exports) {

var g;

// This works in non-strict mode
g = (function() {
	return this;
})();

try {
	// This works if eval is allowed (see CSP)
	g = g || Function("return this")() || (1, eval)("this");
} catch (e) {
	// This works if the window reference is available
	if (typeof window === "object") g = window;
}

// g can still be undefined, but nothing to do about it...
// We return undefined, instead of nothing here, so it's
// easier to handle this case. if(!global) { ...}

module.exports = g;


/***/ }),

/***/ "./legacy/legacy-grass.ts":
/*!********************************!*\
  !*** ./legacy/legacy-grass.ts ***!
  \********************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";
/* WEBPACK VAR INJECTION */(function(global) {
function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
var proceduralTexture = __webpack_require__(/*! ../src/grass */ "./src/grass/index.ts");
/**
 * This is the entry point for the UMD module.
 * The entry point for a future ESM package should be index.ts
 */
var globalObject = (typeof global !== 'undefined') ? global : ((typeof window !== 'undefined') ? window : undefined);
if (typeof globalObject !== "undefined") {
    for (var key in proceduralTexture) {
        globalObject.BABYLON[key] = proceduralTexture[key];
    }
}
__export(__webpack_require__(/*! ../src/grass */ "./src/grass/index.ts"));

/* WEBPACK VAR INJECTION */}.call(this, __webpack_require__(/*! ./../../node_modules/webpack/buildin/global.js */ "../node_modules/webpack/buildin/global.js")))

/***/ }),

/***/ "./src/grass/grassProceduralTexture.fragment.ts":
/*!******************************************************!*\
  !*** ./src/grass/grassProceduralTexture.fragment.ts ***!
  \******************************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

Object.defineProperty(exports, "__esModule", { value: true });
var babylonjs_1 = __webpack_require__(/*! babylonjs */ "babylonjs");
var name = 'grassProceduralTexturePixelShader';
exports.name = name;
var shader = "precision highp float;\nvarying vec2 vPosition;\nvarying vec2 vUV;\nuniform vec3 herb1Color;\nuniform vec3 herb2Color;\nuniform vec3 herb3Color;\nuniform vec3 groundColor;\nfloat rand(vec2 n) {\nreturn fract(cos(dot(n,vec2(12.9898,4.1414)))*43758.5453);\n}\nfloat noise(vec2 n) {\nconst vec2 d=vec2(0.0,1.0);\nvec2 b=floor(n),f=smoothstep(vec2(0.0),vec2(1.0),fract(n));\nreturn mix(mix(rand(b),rand(b+d.yx),f.x),mix(rand(b+d.xy),rand(b+d.yy),f.x),f.y);\n}\nfloat fbm(vec2 n) {\nfloat total=0.0,amplitude=1.0;\nfor (int i=0; i<4; i++) {\ntotal+=noise(n)*amplitude;\nn+=n;\namplitude*=0.5;\n}\nreturn total;\n}\nvoid main(void) {\nvec3 color=mix(groundColor,herb1Color,rand(gl_FragCoord.xy*4.0));\ncolor=mix(color,herb2Color,rand(gl_FragCoord.xy*8.0));\ncolor=mix(color,herb3Color,rand(gl_FragCoord.xy));\ncolor=mix(color,herb1Color,fbm(gl_FragCoord.xy*16.0));\ngl_FragColor=vec4(color,1.0);\n}";
exports.shader = shader;
babylonjs_1.Effect.ShadersStore[name] = shader;


/***/ }),

/***/ "./src/grass/grassProceduralTexture.ts":
/*!*********************************************!*\
  !*** ./src/grass/grassProceduralTexture.ts ***!
  \*********************************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p]; };
        return extendStatics(d, b);
    }
    return function (d, b) {
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
var babylonjs_1 = __webpack_require__(/*! babylonjs */ "babylonjs");
__webpack_require__(/*! ./grassProceduralTexture.fragment */ "./src/grass/grassProceduralTexture.fragment.ts");
var GrassProceduralTexture = /** @class */ (function (_super) {
    __extends(GrassProceduralTexture, _super);
    function GrassProceduralTexture(name, size, scene, fallbackTexture, generateMipMaps) {
        var _this = _super.call(this, name, size, "grassProceduralTexture", scene, fallbackTexture, generateMipMaps) || this;
        _this._groundColor = new babylonjs_1.Color3(1, 1, 1);
        _this._grassColors = [
            new babylonjs_1.Color3(0.29, 0.38, 0.02),
            new babylonjs_1.Color3(0.36, 0.49, 0.09),
            new babylonjs_1.Color3(0.51, 0.6, 0.28)
        ];
        _this.updateShaderUniforms();
        return _this;
    }
    GrassProceduralTexture.prototype.updateShaderUniforms = function () {
        this.setColor3("herb1Color", this._grassColors[0]);
        this.setColor3("herb2Color", this._grassColors[1]);
        this.setColor3("herb3Color", this._grassColors[2]);
        this.setColor3("groundColor", this._groundColor);
    };
    Object.defineProperty(GrassProceduralTexture.prototype, "grassColors", {
        get: function () {
            return this._grassColors;
        },
        set: function (value) {
            this._grassColors = value;
            this.updateShaderUniforms();
        },
        enumerable: true,
        configurable: true
    });
    Object.defineProperty(GrassProceduralTexture.prototype, "groundColor", {
        get: function () {
            return this._groundColor;
        },
        set: function (value) {
            this._groundColor = value;
            this.updateShaderUniforms();
        },
        enumerable: true,
        configurable: true
    });
    /**
     * Serializes this grass procedural texture
     * @returns a serialized grass procedural texture object
     */
    GrassProceduralTexture.prototype.serialize = function () {
        var serializationObject = babylonjs_1.SerializationHelper.Serialize(this, _super.prototype.serialize.call(this));
        serializationObject.customType = "BABYLON.GrassProceduralTexture";
        serializationObject.grassColors = [];
        for (var i = 0; i < this._grassColors.length; i++) {
            serializationObject.grassColors.push(this._grassColors[i].asArray());
        }
        return serializationObject;
    };
    /**
     * Creates a Grass Procedural Texture from parsed grass procedural texture data
     * @param parsedTexture defines parsed texture data
     * @param scene defines the current scene
     * @param rootUrl defines the root URL containing grass procedural texture information
     * @returns a parsed Grass Procedural Texture
     */
    GrassProceduralTexture.Parse = function (parsedTexture, scene, rootUrl) {
        var texture = babylonjs_1.SerializationHelper.Parse(function () { return new GrassProceduralTexture(parsedTexture.name, parsedTexture._size, scene, undefined, parsedTexture._generateMipMaps); }, parsedTexture, scene, rootUrl);
        var colors = [];
        for (var i = 0; i < parsedTexture.grassColors.length; i++) {
            colors.push(babylonjs_1.Color3.FromArray(parsedTexture.grassColors[i]));
        }
        texture.grassColors = colors;
        return texture;
    };
    __decorate([
        babylonjs_1.serializeAsColor3()
    ], GrassProceduralTexture.prototype, "groundColor", null);
    return GrassProceduralTexture;
}(babylonjs_1.ProceduralTexture));
exports.GrassProceduralTexture = GrassProceduralTexture;


/***/ }),

/***/ "./src/grass/index.ts":
/*!****************************!*\
  !*** ./src/grass/index.ts ***!
  \****************************/
/*! no static exports found */
/***/ (function(module, exports, __webpack_require__) {

"use strict";

function __export(m) {
    for (var p in m) if (!exports.hasOwnProperty(p)) exports[p] = m[p];
}
Object.defineProperty(exports, "__esModule", { value: true });
__export(__webpack_require__(/*! ./grassProceduralTexture */ "./src/grass/grassProceduralTexture.ts"));


/***/ }),

/***/ "babylonjs":
/*!****************************************************************************************************!*\
  !*** external {"root":"BABYLON","commonjs":"babylonjs","commonjs2":"babylonjs","amd":"babylonjs"} ***!
  \****************************************************************************************************/
/*! no static exports found */
/***/ (function(module, exports) {

module.exports = __WEBPACK_EXTERNAL_MODULE_babylonjs__;

/***/ })

/******/ });
});
//# sourceMappingURL=babylon.grassProceduralTexture.js.map