const { getDefaultConfig } = require("expo/metro-config");
const { withNativeWind } = require("nativewind/metro");
const path = require("path");

// Robust path resolution for Windows
const projectRoot = __dirname;
const inputPath = path.resolve(projectRoot, "global.css");

const config = getDefaultConfig(projectRoot);

// Enable WASM support for web SQLite
config.resolver.assetExts.push("wasm");

module.exports = withNativeWind(config, { input: inputPath });
