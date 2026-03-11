(function () {
  const host = window.location.hostname;

  const isLocal =
    host === "127.0.0.1" ||
    host === "localhost";

  window.APP_CONFIG = {
    API_BASE: isLocal
      ? "http://127.0.0.1:5000"
      : "https://finsage-backend-ab25.onrender.com"
  };
})();