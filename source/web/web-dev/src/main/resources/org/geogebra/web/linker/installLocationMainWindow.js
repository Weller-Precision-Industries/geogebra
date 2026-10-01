// Robotutor fork: GWT's installLocationMainWindow.js without its inline
// <script>var $wnd = window;</script>, which a CSP without 'unsafe-inline'
// blocks. Assigning the global directly is equivalent.

var wndInstalled = false;

function getInstallLocationDoc() {
  setupInstallLocation();
  return window.document;
}

// This function is left for compatibility
// and may be used by custom linkers
function getInstallLocation() {
  return getInstallLocationDoc().body;
}

function setupInstallLocation() {
  if (wndInstalled) { return; }
  window.$wnd = window;
  wndInstalled = true;
}
