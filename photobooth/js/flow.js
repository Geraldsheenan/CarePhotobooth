// photobooth/js/flow.js
document.addEventListener("DOMContentLoaded", () => {
  const startBtn = document.getElementById("pbStartBtn");
  if (startBtn) {
    startBtn.addEventListener("click", () => {
      window.location.href = "./layout.html";
    });
  }
});
