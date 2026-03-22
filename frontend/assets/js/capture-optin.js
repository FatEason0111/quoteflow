(function () {
  try {
    var params = new URLSearchParams(window.location.search);
    var enabled =
      params.get("figmaCapture") === "1" ||
      window.localStorage.getItem("pricetool-figma-capture") === "1";

    if (!enabled) {
      return;
    }

    var script = document.createElement("script");
    script.src = "https://mcp.figma.com/mcp/html-to-design/capture.js";
    script.async = true;
    document.head.appendChild(script);
  } catch (error) {
    // Ignore capture opt-in failures so production browsing never breaks.
  }
})();
