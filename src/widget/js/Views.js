class Views {
  constructor() {
    this.templates = {};
  }

  fetch(view) {
    return new Promise((resolve) => {
      if (this.templates[view]) {
        console.warn(`template ${view} already exist.`);
        return resolve();
      }

      const xhr = new XMLHttpRequest();
      xhr.onload = () => {
        const content = xhr.responseText;
        this.templates[view] = new DOMParser().parseFromString(content, 'text/html');
        console.log(`this in fetch: ${view}, ${this}`)
        resolve(view);
      };
      xhr.onerror = () => {
        console.error(`fetching template ${view} failed.`);
      };
      xhr.open('GET', `./templates/${view}.html`);
      xhr.send(null);
    });
  }

  inject(view) {
    console.log(`this -> : ${view}, ${this}`)
    if (!this.templates[view]) {
      console.warn(`template ${view} not found.`);
      return;
    }
    const templateElement = document.querySelector(`#${view}`);
    const createTemplate = document.importNode(this.templates[view].querySelector('template').content, true);
    templateElement.innerHTML = '';
    templateElement.appendChild(createTemplate);
  }

  clear(view) {
    if (!this.templates[view]) {
      console.warn(`template ${view} not found.`);
      return;
    }
    document.querySelector(`section#${view}`).innerHTML = '';
  }
}

export default new Views();
