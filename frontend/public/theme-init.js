(function () {
  try {
    var setting = localStorage.getItem("theme")
    document.documentElement.classList.toggle("dark", setting === "dark" ||
      (setting !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches))
    document.documentElement.classList.toggle("compact-density", localStorage.getItem("workspace-density") === "compact")
  } catch (_) {
    // Theme preference is optional.
  }
})()
