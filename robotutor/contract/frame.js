/* global window, document */
// Mirrors how OLMS embeds the bundle (public/embed/geogebra-graph.js): the same applet
// parameters and loader hook. Exposes the Apps API to the contract tests as window.__api
// and records client events in window.__events.
(function () {
	"use strict";
	var params = {
		appName: "graphing",
		width: String(Math.max(320, window.innerWidth)),
		height: String(Math.max(320, window.innerHeight)),
		language: "en",
		showToolBar: "false",
		showMenuBar: "false",
		showAlgebraInput: "true",
		showResetIcon: "false",
		showAppsPicker: "false",
		showFullscreenButton: "false",
		showZoomButtons: "true",
		enableRightClick: "false",
		enableLabelDrags: "false",
		enableShiftDragZoom: "true",
		enableFileFeatures: "false",
		enable3D: "false",
		enableCAS: "false",
		allowStyleBar: "false",
		errorDialogsActive: "false",
		showKeyboardOnFocus: "false",
		tabExit: "true",
		geometryCommands: "true",
		disableJavaScript: "true",
		useBrowserForJS: "false",
	};
	// Tests override parameters through the page's query string, e.g. ?previewPoints=false.
	new URLSearchParams(window.location.search).forEach(function (value, key) {
		if (key !== "frameWidth" && key !== "frameHeight") params[key] = value;
	});
	var host = document.getElementById("calculator");
	Object.keys(params).forEach(function (key) {
		host.setAttribute("data-param-" + key.toLowerCase(), params[key]);
	});
	window.__events = [];
	window.renderGGBElementReady = function () {
		window.renderGGBElement(host, function (api) {
			api.registerClientListener(function (event) {
				window.__events.push({ type: event.type, argument: event.argument });
				// As OLMS's frame does: the sandboxed frame cannot focus its host, so it asks.
				if (event.type === "tabExit") window.parent.postMessage({ type: "tab-exit", direction: event.argument }, "*");
			});
			window.__api = api;
		});
	};
	var script = document.createElement("script");
	script.src = "/vendor/__COMMIT__/web3d/web3d.nocache.js";
	document.head.appendChild(script);
})();
