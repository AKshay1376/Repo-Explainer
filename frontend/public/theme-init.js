(function () {
  try {
    document.documentElement.classList.toggle("dark", localStorage.getItem("theme") === "dark")
  } catch (_) {
    // Theme preference is optional.
  }
})()
