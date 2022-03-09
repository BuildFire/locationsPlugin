if (typeof buildfire === 'undefined') throw 'please add buildfire.js first to use BuildFire services';
if (typeof buildfire.services === 'undefined') buildfire.services = {};

buildfire.services.Strings = class {
  constructor(language, stringsConfig) {
    this.language = language || "en-us";
    this._data = null;

    const obj = {};
    for (const sectionKey in stringsConfig) {
      const section = (obj[sectionKey] = {});
      for (const labelKey in stringsConfig[sectionKey].labels) {
        section[labelKey] = {
          defaultValue: stringsConfig[sectionKey].labels[labelKey].defaultValue,
          required: stringsConfig[sectionKey].labels[labelKey].required,
          isPlaceHolder: stringsConfig[sectionKey].labels[labelKey].isPlaceHolder
        };
      }
    }
    this._data = obj;
  }

  get collectionName() {
    return `$bfLanguageSettings_${this.language.toLowerCase()}`;
  }

  set(prop, value) {
    if (!this._data) throw 'Strings not ready';

    const s = prop.split(".");
    if (s.length !== 2) throw 'invalid string prop name';
    const segmentKey = s[0];
    const labelKey = s[1];

    if (!this._data[segmentKey][labelKey]) this._data[segmentKey][labelKey] = {};
    this._data[segmentKey][labelKey].value = value;
  }

  get(prop, enableVariables, context) {
    if (!this._data) throw 'Strings not ready';

    const s = prop.split(".");
    if (s.length !== 2) throw 'invalid string prop name';
    const segmentKey = s[0];
    const labelKey = s[1];

    let v;
    const l = this._data[segmentKey][labelKey];
    if (l.value || (l.value === "" && !l.required)) v = l.value;
    else v = l.defaultValue || "";

    /// use ${context.XXX} or global variables
    if (enableVariables) v = eval(`\`${v}\``);
    console.log('l: ', l)
    return { v, isPlaceHolder: l.isPlaceHolder };
  }

  createLanguage(language, callback) {
    buildfire.datastore.insert(this._data, this.collectionName, (e, obj) => {
      if (e) callback(e);
      else {
        this.id = obj.id;
        callback(null, obj);
      }
    });
  }

  deleteLanguage(callback) {
    buildfire.datastore.delete(this.id, this.collectionName, callback);
  }

  refresh(callback) {
    /// get has edge case bug https://app.asana.com/0/503101155812087/1130049011248026
    buildfire.datastore.search({ limit: 1 }, this.collectionName, (e, objs) => {
      if (e) {
        if (callback) callback(e);
      } else {
        let obj = { data: {} };
        if (objs.length > 0) {
          obj = objs[0];
          this.id = obj.id;
        }

        for (const sectionKey in obj.data) {
          if (!this._data[sectionKey]) this._data[sectionKey] = this._data[sectionKey] = {};
          for (const labelKey in obj.data[sectionKey]) {
            if (!this._data[sectionKey][labelKey]) this._data[sectionKey][labelKey] = {};
            const v = obj.data[sectionKey][labelKey];
            const i = this._data[sectionKey][labelKey];
            i.value = v.value;
          }
        }

        if (callback) callback();
      }
    });
  }

  init(callback) {
    const t = this;
    return new Promise((resolve, reject) => {
      t.refresh((e) => {
        if (e) {
          if (callback) callback(e);
          reject(e);
        } else resolve();
      });
    });
  }

  inject(element, enableVariables) {
    if (!element) element = document;
    const { type } = buildfire.getContext();
    console.log('type: ', type)
    element.querySelectorAll("*[bfString]").forEach((e) => {
      const { v, isPlaceHolder } = this.get(e.getAttribute("bfString"), enableVariables) || "";
      if (e.nodeName === "TEXTAREA") {
        if (e.classList.contains("bfwysiwyg") && tinymce.get(e.id)) {
          tinymce.get(e.id).setContent(v);
        } else e.innerHTML = v;
      } else if (e.nodeName === "INPUT") {
        const target = (isPlaceHolder && type !== 'control') ? 'placeholder' : 'value';
        e[target] = v;
      }
      else e.innerHTML = v;
    });
  }

  save(callback) {
    buildfire.datastore.save(this._data, this.collectionName, callback);
  }
};
