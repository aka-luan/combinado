/**
 * Minimal quiz widget for teach lessons.
 * Markup:
 *   <div class="quiz" data-answer="0" data-ok="…" data-bad="…">
 *     <h3>…</h3>
 *     <div class="quiz-options">
 *       <button type="button">…</button>
 *       …
 *     </div>
 *     <p class="quiz-feedback" aria-live="polite"></p>
 *   </div>
 */
(function () {
  function initQuiz(root) {
    const answer = Number(root.dataset.answer);
    const ok = root.dataset.ok || "Correct.";
    const bad = root.dataset.bad || "Not quite — try again.";
    const buttons = [...root.querySelectorAll(".quiz-options button")];
    const feedback = root.querySelector(".quiz-feedback");

    buttons.forEach((btn, index) => {
      btn.addEventListener("click", () => {
        const correct = index === answer;
        buttons.forEach((b, i) => {
          b.disabled = true;
          if (i === answer) b.dataset.state = "correct";
          else if (i === index && !correct) b.dataset.state = "incorrect";
        });
        if (feedback) {
          feedback.textContent = correct ? ok : bad;
          feedback.dataset.kind = correct ? "ok" : "bad";
        }
      });
    });
  }

  document.querySelectorAll(".quiz").forEach(initQuiz);
})();
