export default class Accordion {
  constructor({ element, active = null, multi = false, expanded = false }) {
    this.el = element;
    this.activePanel = active;
    this.multi = multi;
    this.expanded = expanded;

    this.init();
  }

  cacheDOM() {
    this.panels = this.el.querySelectorAll(".expansion-panel");
    this.headers = this.el.querySelectorAll(".expansion-panel-header");
    this.bodies = this.el.querySelectorAll(".expansion-panel-body");
  }

  init() {
    this.cacheDOM();
    this.setSize();
    this.initialExpand();
    this.attachEvents();
  }

  // Remove "active" class from all expansion panels.
  collapseAll() {
    for (const h of this.headers) {
      h.closest(".expansion-panel").classList.remove("active");
    }
  }

  expandAll() {
    for (const h of this.headers) {
      h.closest(".expansion-panel").classList.add("active");
    }
  }

  // Add "active" class to the parent expansion panel.
  expand(idx) {
    this.panels[idx].classList.add("active");
  }

  // Toggle "active" class to the parent expansion panel.
  toggle(idx) {
    this.panels[idx].classList.toggle("active");
  }

  // Get the height of each panel body and store it in attribute
  // for the CSS transition.
  setSize() {
    this.bodies.forEach((b, idx) => {
      const bound = b.querySelector(".expansion-panel-body-content")
      if(bound != null){
        bound.getBoundingClientRect();
        b.setAttribute("style", `--ht:${bound.height}px`);
      }
    });
  }

  initialExpand() {
    if (this.expanded) {
      this.expandAll();
    } else if (this.activePanel > 0 && this.activePanel < this.panels.length) {
      // Add the "active" class to the correct panel
      this.panels[this.activePanel - 1].classList.add("active");
      // Fix the current active panel index "zero based index"
      this.activePanel -= 1;
    }
  }

  attachEvents() {
    this.headers.forEach((h, idx) => {
      h.addEventListener('click', (e) => {
        const classList = [...e.target.classList];
        const controls = ['mdc-touch-target-wrapper', 'mdc-checkbox__native-control', 'mdc-switch__native-control'];

        if (controls.some((r) => classList.includes(r))) {
          return;
        }

        if (!this.multi) {
          // Check if there is an active panel and close it before opening another one.
          // If there is no active panel, close all the panels.
          if (this.activePanel === idx) {
            this.collapseAll();
            this.activePanel = null;
          } else {
            this.collapseAll();
            this.expand(idx);
            this.activePanel = idx;
          }
        } else {
          this.toggle(idx);
        }
      });
    });

    // Recalculate the panel body height and store it on resizing the window.
    addEventListener('resize', this.setSize.bind(this));
  }
}
