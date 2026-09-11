// Apply the saved theme before first paint to avoid a visible color flash.
try {
  var storedTheme = localStorage.getItem('theme')
  var useDarkTheme = storedTheme ? storedTheme === 'dark' : true
  if (useDarkTheme) document.documentElement.classList.add('dark')
} catch (_) {
  // Storage can be unavailable in privacy-restricted browser contexts.
}
