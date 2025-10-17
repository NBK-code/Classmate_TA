export function toggleTheme() {
    const el = document.documentElement;
    const next = el.classList.contains("dark") ? "light" : "dark";
    el.classList.toggle("dark", next === "dark");
    localStorage.setItem("theme", next);
  }
  export function initTheme() {
    const saved = localStorage.getItem("theme");
    if (saved === "dark") document.documentElement.classList.add("dark");
  }
  