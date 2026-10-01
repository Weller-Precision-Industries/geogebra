// As OLMS's host does (graph-frame-bridge.ts, focusBesideFrame): when Tab leaves the calculator,
// focus the control after (or before) the frame.
window.addEventListener("message", function (event) {
	var frame = document.getElementById("calculator");
	if (event.source !== frame.contentWindow || !event.data || event.data.type !== "tab-exit") return;
	document.getElementById(event.data.direction === "backward" ? "before" : "after").focus();
});
