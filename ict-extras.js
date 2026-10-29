/* ICT extras: sticky "Join the free Discord" bar on phones and a cursor spotlight on
   cards for mouse users. Pairs with ict-extras.css. Plain script, loaded with defer. */
(() => {
  const INVITE = "https://discord.gg/XdWaEBXQ6G";
  const media = (query) => window.matchMedia(query);

  /* ---------- 1. Sticky join bar (<= 700px) ----------
     Slides up once the hero's Discord button has scrolled away. Hidden again while any
     Discord button in <main> is on screen (the hero one, the section one, the viewer's),
     and near the footer so its links stay reachable. Buttons are found by their invite
     href, not by section ids, so the bar survives layout changes. */
  function initJoinBar() {
    if (!("IntersectionObserver" in window)) return;
    const main = document.querySelector("main") || document.body;
    const ctas = [...main.querySelectorAll('a[href*="discord.gg"]')];
    const heroButton = document.querySelector('.hero a[href*="discord.gg"]') || ctas[0];
    if (!heroButton) return;
    const footer = document.querySelector(".site-footer") || document.querySelector("footer");
    const phone = media("(max-width: 700px)");

    const bar = document.createElement("div");
    bar.className = "ict-joinbar";
    bar.innerHTML =
      '<div class="ict-joinbar__inner">' +
      '<p class="ict-joinbar__count" hidden><b data-joinbar-count></b><span>Traders</span></p>' +
      '<a class="ict-joinbar__btn" href="' + INVITE + '" target="_blank" rel="noopener noreferrer">' +
      '<i class="fa-brands fa-discord" aria-hidden="true"></i>Join the free Discord</a>' +
      "</div>";
    bar.setAttribute("aria-hidden", "true");
    bar.inert = true;
    document.body.appendChild(bar);

    // Member count, copied from the hero once the Discord invite fetch fills it.
    const source = document.querySelector("[data-hero-members-count]");
    const countBox = bar.querySelector(".ict-joinbar__count");
    const countText = bar.querySelector("[data-joinbar-count]");
    const fillCount = () => {
      const text = ((source && source.textContent) || "").trim();
      if (!/\d/.test(text)) return;
      countText.textContent = text;
      countBox.hidden = false;
    };
    if (source) {
      fillCount();
      new MutationObserver(fillCount).observe(source, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    }

    let passedHero = false;
    let nearFooter = false;
    let shown = false;
    const onScreen = new Set();

    const sync = () => {
      const want = phone.matches && passedHero && onScreen.size === 0 && !nearFooter;
      if (want === shown) return;
      shown = want;
      bar.classList.toggle("is-shown", want);
      bar.setAttribute("aria-hidden", String(!want));
      bar.inert = !want;
    };

    // A button tucked under the sticky header counts as gone.
    const headerBar = document.querySelector("[data-header-bar]");
    const headerHeight = Math.round((headerBar && headerBar.offsetHeight) || 0);
    const ctaObserver = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) onScreen.add(entry.target);
          else onScreen.delete(entry.target);
          if (entry.target === heroButton) {
            const top = entry.rootBounds ? entry.rootBounds.top : headerHeight;
            passedHero = !entry.isIntersecting && entry.boundingClientRect.top < top;
          }
        }
        sync();
      },
      { rootMargin: "-" + headerHeight + "px 0px 0px 0px" },
    );
    new Set([heroButton, ...ctas]).forEach((cta) => ctaObserver.observe(cta));

    if (footer) {
      new IntersectionObserver(
        (entries) => {
          nearFooter = entries[entries.length - 1].isIntersecting;
          sync();
        },
        { rootMargin: "0px 0px 96px 0px" },
      ).observe(footer);
    }

    phone.addEventListener("change", sync);
  }

  /* ---------- 2. Cursor spotlight on cards (hover-capable fine pointers) ----------
     A soft light follows the cursor inside the card under it and brightens the card's
     border near the cursor. Uses the card's free pseudo-element (::after, else ::before);
     nested cards light only the outermost one. */
  function initSpotlight() {
    const finePointer = media("(hover: hover) and (pointer: fine)");
    const CARDS =
      ".bento-tile, #indicators .indicator-tab, #discord .community-layout, .journal-shot";
    let active = null;
    let frame = 0;
    let x = -1;
    let y = -1;

    const cardAt = (node) => {
      let card = node && node.closest ? node.closest(CARDS) : null;
      while (card && card.parentElement) {
        const outer = card.parentElement.closest(CARDS);
        if (!outer) break;
        card = outer;
      }
      return card;
    };

    const isFree = (card, pseudo) => {
      const content = getComputedStyle(card, pseudo).content;
      return !content || content === "none" || content === "normal";
    };

    const prepare = (card) => {
      const known = card.dataset.ictSpot;
      if (known) return known !== "off";
      const mode = isFree(card, "::after") ? "a" : isFree(card, "::before") ? "b" : "off";
      card.dataset.ictSpot = mode;
      if (mode === "off") return false;
      const style = getComputedStyle(card);
      card.classList.add("ict-spot", "ict-spot--" + mode);
      if (style.position === "static") card.classList.add("ict-spot--rel");
      if (style.overflowX !== "visible" || style.overflowY !== "visible") {
        card.classList.add("ict-spot--inner");
      }
      return true;
    };

    const paint = () => {
      frame = 0;
      if (!active) return;
      const rect = active.getBoundingClientRect();
      active.style.setProperty("--mx", (x - rect.left).toFixed(1) + "px");
      active.style.setProperty("--my", (y - rect.top).toFixed(1) + "px");
    };

    const setActive = (card) => {
      if (card === active) return;
      if (active) active.classList.remove("is-spot-on");
      active = card && prepare(card) ? card : null;
      if (active) {
        paint(); // place the light before it fades in
        active.classList.add("is-spot-on");
      }
    };

    document.addEventListener(
      "pointermove",
      (event) => {
        if (!finePointer.matches || (event.pointerType && event.pointerType !== "mouse" && event.pointerType !== "pen")) {
          return;
        }
        x = event.clientX;
        y = event.clientY;
        setActive(cardAt(event.target));
        if (active && !frame) frame = requestAnimationFrame(paint);
      },
      { passive: true },
    );

    // Scrolling moves cards under a still cursor: re-check what is under it.
    let scrollFrame = 0;
    window.addEventListener(
      "scroll",
      () => {
        if (x < 0 || scrollFrame || !finePointer.matches) return;
        scrollFrame = requestAnimationFrame(() => {
          scrollFrame = 0;
          setActive(cardAt(document.elementFromPoint(x, y)));
          paint();
        });
      },
      { passive: true },
    );

    const clear = () => {
      x = y = -1;
      setActive(null);
    };
    document.documentElement.addEventListener("pointerleave", clear);
    window.addEventListener("blur", clear);
    finePointer.addEventListener("change", () => {
      if (!finePointer.matches) clear();
    });
  }

  initJoinBar();
  initSpotlight();
})();
