
(function () {
  "use strict";

  const isLocal =
    window.location.hostname === "127.0.0.1" ||
    window.location.hostname === "localhost";

  window.APP_CONFIG = {
    API_BASE: isLocal ? "http://127.0.0.1:5000" : ""
  };
})();
