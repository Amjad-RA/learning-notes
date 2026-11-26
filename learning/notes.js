/* Study notes behaviours, adapted from the Claude Exam Notes site (assets/js/app.js).
   Used with notes.css by note pages in 04-study/learning/.
   1. Theme toggle (same "theme" key as tools/page.js, so the choice is shared)
   2. Table of contents: a sidebar on desktop, a bar that sticks to the top on phones
   3. Filter box   4. "Done" ticks per module: body[data-notes="fsd"] saves the
      data-mod numbers of the done sections in localStorage "fsd:done"
      (the Learning hub card reads the same key)
   5. Phone-friendly tables and diagrams   6. Practice quizzes
   7. Animated diagram controls   8. Practise with Gemini                                           */
(() => {
  const root = document.documentElement;

  /* 1. Theme */
  try { const t = localStorage.getItem("theme"); if (t) root.dataset.theme = t; } catch {}
  const isDark = () => root.dataset.theme ? root.dataset.theme === "dark" : matchMedia("(prefers-color-scheme: dark)").matches;
  document.querySelectorAll("[data-theme-toggle]").forEach((btn) => {
    const sync = () => {
      btn.textContent = isDark() ? "☀️" : "🌙";
      btn.setAttribute("aria-label", isDark() ? "Switch to light theme" : "Switch to dark theme");
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.content = getComputedStyle(root).getPropertyValue("--bg").trim();
    };
    btn.addEventListener("click", () => {
      root.dataset.theme = isDark() ? "light" : "dark";
      try { localStorage.setItem("theme", root.dataset.theme); } catch {}
      sync();
    });
    sync();
  });

  const domains = [...document.querySelectorAll("section.domain[id]")];

  /* 2. Table of contents + scroll spy */
  const toc = document.querySelector("[data-toc]");
  const aside = toc?.closest(".toc");
  let tocLinks = [], tocMeta = null;
  if (toc && domains.length) {
    domains.forEach((sec) => {
      const a = document.createElement("a");
      a.href = `#${sec.id}`;
      a.dataset.target = sec.id;
      if (sec.classList.contains("empty")) a.classList.add("empty");
      const num = sec.querySelector(".domain-num")?.textContent.trim();
      if (num) { const n = document.createElement("span"); n.className = "toc-num"; n.textContent = num; a.appendChild(n); }
      const label = document.createElement("span");
      label.className = "toc-label";
      label.textContent = sec.dataset.short || sec.querySelector("h2")?.textContent.trim() || sec.id;
      a.appendChild(label);
      toc.appendChild(a);
    });
    tocLinks = [...toc.querySelectorAll("a")];

    const panel = document.createElement("div");
    panel.className = "toc-panel";
    panel.id = "toc-panel";
    panel.append(...aside.childNodes);
    const toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "toc-toggle";
    toggle.setAttribute("aria-expanded", "false");
    toggle.setAttribute("aria-controls", "toc-panel");
    toggle.innerHTML = `<span class="toc-cur"><span class="toc-label">${panel.querySelector(".toc-title")?.textContent ?? "Sections"}</span></span>
      <span class="toc-meta"></span><span class="toc-caret" aria-hidden="true">▼</span>`;
    aside.append(toggle, panel);
    const cur = toggle.querySelector(".toc-cur");
    tocMeta = toggle.querySelector(".toc-meta");
    const setOpen = (open) => { aside.classList.toggle("open", open); toggle.setAttribute("aria-expanded", String(open)); };
    toggle.addEventListener("click", () => setOpen(!aside.classList.contains("open")));
    tocLinks.forEach((a) => a.addEventListener("click", () => setOpen(false)));
    document.addEventListener("click", (e) => { if (!aside.contains(e.target)) setOpen(false); });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });

    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        tocLinks.forEach((l) => {
          const on = l.dataset.target === e.target.id;
          l.classList.toggle("active", on);
          if (on) cur.replaceChildren(...[...l.children].map((c) => c.cloneNode(true)));
        });
      });
    }, { rootMargin: "-20% 0px -70% 0px" });
    domains.forEach((s) => io.observe(s));
  }

  /* 3. Filter box: hides sections that don't contain the text */
  const search = document.querySelector("[data-search]");
  search?.addEventListener("input", () => {
    const q = search.value.trim().toLowerCase();
    domains.forEach((s) => s.classList.toggle("hidden", !!q && !s.textContent.toLowerCase().includes(q)));
  });

  /* 4. Done ticks */
  const notes = document.body.dataset.notes;
  if (notes) {
    const KEY = `${notes}:done`;
    let done = [];
    try { done = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch {}
    const mods = domains.filter((d) => d.dataset.mod);
    const render = () => {
      const n = mods.filter((d) => done.includes(+d.dataset.mod)).length;
      const pct = mods.length ? Math.round((n / mods.length) * 100) : 0;
      tocLinks.forEach((l) => {
        const sec = document.getElementById(l.dataset.target);
        l.classList.toggle("done", !!sec?.dataset.mod && done.includes(+sec.dataset.mod));
      });
      if (tocMeta) tocMeta.textContent = `${n}/${mods.length} done`;
      document.querySelectorAll("[data-done-count]").forEach((el) => { el.textContent = `${n} of ${mods.length}`; });
      document.querySelectorAll("[data-progress-self]").forEach((el) => {
        el.querySelector("i").style.width = `${pct}%`;
        const label = el.nextElementSibling;
        if (label?.classList.contains("progress-label")) label.textContent = `${pct}% of modules marked done`;
      });
    };
    mods.forEach((sec) => {
      const m = +sec.dataset.mod;
      const label = document.createElement("label");
      label.className = "done-toggle";
      label.innerHTML = `<input type="checkbox"> Done`;
      const box = label.querySelector("input");
      box.checked = done.includes(m);
      sec.classList.toggle("is-done", box.checked);
      box.addEventListener("change", () => {
        done = box.checked ? [...new Set([...done, m])] : done.filter((x) => x !== m);
        sec.classList.toggle("is-done", box.checked);
        try { localStorage.setItem(KEY, JSON.stringify(done)); } catch {}
        render();
      });
      sec.querySelector(".domain-head")?.appendChild(label);
    });
    render();
  }

  /* 5. Phones: tables with 3+ columns become one card per row */
  document.querySelectorAll("table.compare").forEach((t) => {
    const heads = [...t.querySelectorAll("thead th")].map((th) => th.textContent.trim());
    if (heads.length < 3) return;
    t.classList.add("stackable");
    t.querySelectorAll("tbody tr").forEach((tr) => {
      [...tr.children].forEach((cell, i) => {
        if (cell.tagName !== "TD") return;
        cell.dataset.label = heads[i] ?? "";
        const value = document.createElement("div");
        value.className = "cv";
        value.append(...cell.childNodes);
        cell.append(value);
      });
    });
  });
  //    Diagrams wider than the screen scroll sideways; mark them for the swipe hint
  const figs = [...document.querySelectorAll("figure.dg")];
  const markScrolling = () => figs.forEach((f) => {
    const box = f.querySelector(".dg-scroll");
    if (box) f.classList.toggle("scrolls", box.scrollWidth > box.clientWidth + 2);
  });
  if (figs.length) {
    markScrolling();
    let t;
    addEventListener("resize", () => { clearTimeout(t); t = setTimeout(markScrolling, 150); });
  }

  /* 6. Quizzes: <div class="quiz" data-answer="B"> */
  document.querySelectorAll(".quiz[data-answer]").forEach((quiz) => {
    const answer = quiz.dataset.answer.trim().toUpperCase().charCodeAt(0) - 65;
    const opts = [...quiz.querySelectorAll("ol > li")];
    opts.forEach((li, i) => {
      li.tabIndex = 0;
      const pick = () => {
        if (quiz.classList.contains("answered")) return;
        quiz.classList.add("answered");
        opts[answer]?.classList.add("correct");
        if (i !== answer) li.classList.add("wrong");
      };
      li.addEventListener("click", pick);
      li.addEventListener("keydown", (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), pick()));
    });
  });

  /* 7. Animated diagrams (figure.dg.anim): Pause / Play and Replay buttons; they pause off screen
        and start paused for people who ask for reduced motion. */
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  document.querySelectorAll("figure.dg.anim").forEach((fig) => {
    const svg = fig.querySelector("svg");
    if (!svg?.pauseAnimations) return;
    let user = reduce ? "paused" : "playing";
    const bar = document.createElement("div");
    bar.className = "anim-ctl";
    bar.innerHTML = `<button type="button" data-a="toggle"></button><button type="button" data-a="replay">↺ Replay</button><span class="live">animated</span>`;
    const toggle = bar.querySelector('[data-a="toggle"]');
    const paint = () => { toggle.textContent = user === "playing" ? "⏸ Pause" : "▶ Play"; };
    toggle.addEventListener("click", () => {
      user = user === "playing" ? "paused" : "playing";
      user === "playing" ? svg.unpauseAnimations() : svg.pauseAnimations();
      paint();
    });
    bar.querySelector('[data-a="replay"]').addEventListener("click", () => {
      svg.setCurrentTime(0);
      user = "playing"; svg.unpauseAnimations(); paint();
    });
    fig.querySelector(".dg-scroll").after(bar);

    // Phones: the diagram scrolls sideways, so its caption line can be off screen. Show every step as a
    // numbered list under it too, with the step that's playing now highlighted.
    const dur = parseFloat(svg.querySelector("text.cap animate")?.getAttribute("dur")) || 0;
    const steps = [...svg.querySelectorAll("text.cap")].map((t) => {
      const k = t.querySelector("animate").getAttribute("keyTimes").split(";").map(Number);
      return { text: t.textContent.trim(), a: k[2], b: k[3] };
    });
    if (steps.length && dur) {
      const ol = document.createElement("ol");
      ol.className = "anim-steps";
      ol.setAttribute("aria-label", "Steps in this animation");
      steps.forEach((st) => { const li = document.createElement("li"); li.textContent = st.text; ol.appendChild(li); });
      bar.after(ol);
      const lis = [...ol.children];
      let last = -1;
      setInterval(() => {
        if (!ol.offsetParent) return;                // hidden on wider screens
        const f = (svg.getCurrentTime() % dur) / dur;
        const i = steps.findIndex((st) => f >= st.a && f < st.b);
        if (i === last) return;
        last = i;
        lis.forEach((li, j) => li.classList.toggle("now", j === i));
      }, 250);
    }
    if (reduce) { svg.setCurrentTime(1.5); svg.pauseAnimations(); }
    paint();
    new IntersectionObserver(([e]) => {
      if (user !== "playing") return;
      e.isIntersecting ? svg.unpauseAnimations() : svg.pauseAnimations();
    }).observe(fig);
  });

  /* 8. "Practise with Gemini": every module (section[data-mod]) gets a card that copies a prompt built from
        that module's own notes (plain words, topics, key points, flashcards, practice and senior questions,
        summary) and opens Gemini: the app on Android, gemini.google.com elsewhere. Gemini first teaches the
        module from beginner to senior level, then runs a mock interview with feedback and a score.
        Two languages: English, or Malayalam explanations with English technical terms. */
  const topic = document.querySelector(".hero h1")?.textContent.trim() || document.title;
  const GEMINI_WEB = "https://gemini.google.com/app";
  const geminiHref = /Android/i.test(navigator.userAgent)
    ? "intent://gemini.google.com/app#Intent;scheme=https;package=com.google.android.apps.bard;S.browser_fallback_url="
      + encodeURIComponent(GEMINI_WEB) + ";end"
    : GEMINI_WEB;
  const clean = (el) => {
    if (!el) return "";
    const c = el.cloneNode(true);
    c.querySelectorAll(".label, svg, .anim-ctl, .anim-steps").forEach((e) => e.remove());
    return c.textContent.replace(/\s+/g, " ").trim();
  };
  const buildPrompt = (sec, lang) => {
    const num = sec.dataset.mod;
    const title = clean(sec.querySelector(".domain-head h2"));
    const list = (sel, fn) => [...sec.querySelectorAll(sel)].map(fn).filter(Boolean);
    const words = list(".plain dt", (dt) => `- ${clean(dt)}: ${clean(dt.nextElementSibling)}`);
    const topics = list(":scope > h3.sub", (h) => /^\d/.test(clean(h)) ? "- " + clean(h) : "");
    const facts = [
      ...list("figure.dg figcaption", (f) => "- " + clean(f).replace(/^↔ Swipe the diagram to see all of it\. /, "")),
      ...list(".callout", (c) => `- ${c.querySelector(".label")?.textContent.trim() || "Note"}: ${clean(c)}`),
      ...list(":scope > .flashcards details.qa", (d) => `- Q: ${clean(d.querySelector("summary"))} A: ${clean(d.querySelector(".a"))}`),
      ...list(".quiz", (q) => `- Practice question: ${clean(q.querySelector(".q"))} Answer: ${clean(q.querySelector(".why"))}`),
      ...list(".cheatsheet li", (li) => "- " + clean(li)),
    ];
    const senior = [
      ...list(".senior .card", (c) => `- ${clean(c.querySelector("h3"))}: ${[...c.querySelectorAll("li")].map(clean).join("; ")}`),
      ...list(".senior details.qa", (d) => `- Senior question: ${clean(d.querySelector("summary"))} Model answer: ${clean(d.querySelector(".a"))}`),
    ];
    const ml = lang === "ml";
    return [
      `You are my friendly but demanding ${topic} mentor. I am a frontend engineer preparing for senior engineer interviews. Teach me Module ${num}: ${title}${ml ? ", explaining in simple Malayalam" : ", in clear, simple English"}.`,
      ml ? "Keep every technical term (API, cache, WebSocket, CSP and so on) in English, and explain it in Malayalam the first time it appears." : "Explain every technical term the first time it appears.",
      "",
      "Part 1: teach the module. Ask me no questions yet.",
      "- Start from zero with an everyday analogy, then build up step by step to how a senior engineer thinks about it.",
      "- Cover every topic and key point below, in order, with a small real-world example for each main idea.",
      "- Clearly warn me about each trap listed below.",
      "- End Part 1 with what separates a senior answer from a junior one on this topic, then a five-point recap.",
      "- If the lesson is too long for one reply, stop at the end of a topic and tell me to type \"continue\".",
      "",
      "Part 2: mock interview, only after the lesson.",
      "- Ask me 6 questions one at a time: 2 beginner, 2 intermediate, 2 senior-level design questions. Use the practice and senior questions below where they fit.",
      "- I may answer by voice. After each answer: say what was right, what was missing or wrong, and give a short model answer. Comment on my clarity and structure too.",
      "- Then ask the next question.",
      "- At the end, give me a score card: a score out of 10 for each question, overall level (junior, mid, senior), my three weakest topics, and what to revise.",
      "",
      "Teach only from the notes below plus well-established facts. If something isn't covered and you're not sure, say so instead of guessing.",
      "",
      ...(words.length ? ["Words to know:", ...words, ""] : []),
      "Topics:", ...topics, "",
      "Key points:", ...facts, "",
      ...(senior.length ? ["Senior level:", ...senior, ""] : []),
      ml ? "Start now with Part 1: greet me in Malayalam, then begin the lesson." : "Start now with Part 1: greet me, then begin the lesson.",
    ].join("\n");
  };
  const copyText = (text) => {
    // Synchronous copy first, so it completes before the link opens Gemini.
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:0;left:-9999px;opacity:0";
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    let ok = false;
    try { ok = document.execCommand("copy"); } catch {}
    ta.remove();
    if (!ok && navigator.clipboard) navigator.clipboard.writeText(text).catch(() => {});
    return ok || !!navigator.clipboard;
  };
  domains.filter((d) => d.dataset.mod).forEach((sec) => {
    const card = document.createElement("div");
    card.className = "gm-card";
    card.innerHTML = `
      <a class="gm-btn" data-lang="en" target="_blank" rel="noopener"><span aria-hidden="true">✨</span> Practise with Gemini</a>
      <a class="gm-btn alt" data-lang="ml" target="_blank" rel="noopener" lang="ml">മലയാളത്തിൽ</a>
      <span class="gm-status" aria-live="polite">Copies a prompt and opens Gemini: a lesson from beginner to senior level, then a mock interview with a score card.</span>
      <details class="gm-prompt"><summary>See the prompt</summary><textarea readonly rows="9" aria-label="Gemini prompt"></textarea></details>`;
    const status = card.querySelector(".gm-status");
    const ta = card.querySelector("textarea");
    let prompts = null;   // built on first use, after the page is ready
    const get = (lang) => { prompts ??= { en: buildPrompt(sec, "en"), ml: buildPrompt(sec, "ml") }; return prompts[lang]; };
    card.querySelector(".gm-prompt").addEventListener("toggle", () => { ta.value = get("en"); });
    card.querySelectorAll(".gm-btn").forEach((link) => {
      link.href = geminiHref;
      link.addEventListener("click", () => {
        const text = get(link.dataset.lang);
        ta.value = text;
        const ok = copyText(text);
        status.textContent = ok
          ? "✓ Prompt copied. In Gemini, paste and send. For a spoken interview, use Gemini Live, or Listen (read aloud) in the reply's ⋮ menu."
          : "Couldn't copy automatically. Open \"See the prompt\", copy it, and paste it into Gemini.";
        status.classList.toggle("ok", ok);
      });
    });
    (sec.querySelector(":scope > .plain") || sec.querySelector(".domain-head"))?.after(card);
  });
})();
