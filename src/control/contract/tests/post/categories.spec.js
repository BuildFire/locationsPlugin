// categories: location categories and the subcategories kept inside them, one block per operation, after the helpers they share.
// Every operation but searchCategories is declared on the control panel only, so its block runs only in the control frame.
// The categories the running spec made, removed after it (removeMade), so the categories every location call reads stay few.
let made = [];
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))))
  .then((result) => {
    // The category made for the app is the widget run's, so it is never recorded.
    if (operation === 'createCategory' && result && result.id && parameters.title !== forTheApp) made.push(result.id);
    if (operation === 'createCategoriesAdvanced' && result && Array.isArray(result.categories)) {
      result.categories.forEach((entry) => entry.id && made.push(entry.id));
    }
    return result;
  });
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}`;

const PICTURE = 'https://example.com/category-icon.png';
const OTHER_PICTURE = 'https://example.com/category-icon-alt.png';
const LIBRARY_ICON = 'glyphicon glyphicon-cutlery';
const OTHER_LIBRARY_ICON = 'glyphicon glyphicon-shopping-cart';
// An id that matches no category: the shape of a real one. unknownId(0) is '000000000000000000000000'.
const NO_ID = '000000000000000000000000';
const unknownId = (index) => String(index).padStart(24, '0');
// Subcategory ids are UUIDs the contract makes: this one matches none.
const NO_SUBCATEGORY_ID = '00000000-0000-4000-8000-000000000000';
// The keys the manifest declares for categoryCreated's data.
const CATEGORY_CREATED_KEYS = ['categoryId', 'title', 'iconUrl', 'subcategories', 'createdOn', 'createdBy'];

// Nothing here answers these calls, which the contract makes without waiting for them: spies answer them as the real ones do.
// Only categoryCreated is a promise of the manifest; the refresh message to the widget and the analytics registration are the
// plugin's own bookkeeping, so their spies only answer.
const answerFireAndForget = () => {
  spyOn(buildfire.messaging, 'sendMessageToWidget');
  spyOn(buildfire.analytics, 'registerEvent');
  spyOn(buildfire.services.contract.events, 'send').and.callFake((eventName, data, callback) => (typeof callback === 'function' ? callback(null, []) : undefined));
};
// The data of every event of that name sent since the spy was set (or last reset).
const sentEvents = (name) => buildfire.services.contract.events.send.calls.allArgs()
  .filter(([eventName]) => eventName === name).map(([, data]) => data);

// What the contract's own read lists under that exact title: records { id, data }.
const listed = async (title) => (await call('searchCategories', { title })).result;
// A listing holding exactly one category, with that id and those details.
const holding = (id, data) => [jasmine.objectContaining({ id, data: jasmine.objectContaining(data) })];
// The details of the one category listed under that title.
const detailsOf = async (title) => {
  const records = await listed(title);
  expect(records.length).toBe(1);
  return (records[0] && records[0].data) || {};
};
const subcategoriesOf = async (title) => (await detailsOf(title)).subcategories || [];
const titlesOf = (subcategories) => subcategories.map((sub) => sub.title);
const idsOf = (subcategories) => subcategories.map((sub) => sub.id);
// A new category under a title only this spec uses.
const make = (label, details = {}) => call('createCategory', { title: unique(label), ...details });
// Every category searchCategories lists with no title, page after page.
const everyCategory = async () => {
  const first = await call('searchCategories', {});
  const records = [...first.result];
  for (let page = 1; records.length < first.totalRecord && page < 40; page += 1) {
    const { result } = await call('searchCategories', { page });
    if (!result.length) break;
    records.push(...result);
  }
  return { records, totalRecord: first.totalRecord };
};

// Removes what the spec made, through the contract, whether it passed or not: in batches of 50, or one by one when a batch is
// refused because the spec already removed one of them.
const removeMade = async () => {
  const ids = made;
  made = [];
  for (let start = 0; start < ids.length; start += 50) {
    const chunk = ids.slice(start, start + 50);
    try {
      await call('deleteCategoriesAdvanced', { categories: chunk.map((categoryId) => ({ categoryId })) });
    } catch (error) {
      for (const categoryId of chunk) await call('deleteCategoryAdvanced', { categoryId }).catch(() => null);
    }
  }
};

// Only the control panel makes categories, and its run comes first: it makes this one, once, and the app's run finds it.
const forTheApp = 'Post listed category for the app';
let madeForTheApp;
const categoryForTheApp = () => {
  madeForTheApp = madeForTheApp || (contract.host === 'control'
    ? call('createCategory', { title: forTheApp, iconClassName: LIBRARY_ICON, subcategories: 'Pizza, Burgers' })
    : call('searchCategories', { title: forTheApp }).then(({ result: [record] }) => (record
      ? { id: record.id, ...record.data }
      : Promise.reject(new Error(`no category titled "${forTheApp}": the control run makes it`)))));
  return madeForTheApp;
};

// The specs every update of one category makes, whether it finds the category by its title or by its id.
const describeCategoryChanges = (operation, target) => {
  const change = (category, changes) => call(operation, { ...target(category), ...changes });

  it('renames the category, and returns it', async () => {
    const category = await make('rename', { subcategories: 'Pizza' });
    const newTitle = unique('renamed');
    expect(await change(category, { newTitle })).toEqual(jasmine.objectContaining({
      id: category.id,
      title: newTitle,
      subcategories: [jasmine.objectContaining({ id: category.subcategories[0].id, title: 'Pizza' })],
      createdOn: jasmine.any(String),
      lastUpdatedOn: jasmine.any(String),
    }));
    expect(await listed(category.title)).toEqual([]);
    expect(await listed(newTitle)).toEqual(holding(category.id, { title: newTitle }));
  });

  it('keeps what it is not given', async () => {
    const category = await make('keep', { iconClassName: LIBRARY_ICON, subcategories: 'Pizza, Burgers' });
    const newTitle = unique('kept');
    await change(category, { newTitle });
    expect(await listed(newTitle)).toEqual(holding(category.id, {
      title: newTitle,
      iconClassName: LIBRARY_ICON,
      subcategories: [jasmine.objectContaining({ title: 'Pizza' }), jasmine.objectContaining({ title: 'Burgers' })],
    }));
  });

  it('sets a picture, which replaces the library icon', async () => {
    const category = await make('picture', { iconClassName: LIBRARY_ICON });
    const changed = await change(category, { newIcon: [PICTURE] });
    expect(changed).toEqual(jasmine.objectContaining({ id: category.id, iconUrl: PICTURE }));
    expect(changed.iconClassName || null).toBeNull();
    const details = await detailsOf(category.title);
    expect(details.iconUrl).toBe(PICTURE);
    expect(details.iconClassName || null).toBeNull();
  });

  it('sets a library icon, which replaces the picture', async () => {
    const category = await make('library icon', { icon: [PICTURE] });
    const changed = await change(category, { newIconClassName: OTHER_LIBRARY_ICON });
    expect(changed).toEqual(jasmine.objectContaining({ id: category.id, iconClassName: OTHER_LIBRARY_ICON }));
    expect(changed.iconUrl || null).toBeNull();
    const details = await detailsOf(category.title);
    expect(details.iconClassName).toBe(OTHER_LIBRARY_ICON);
    expect(details.iconUrl || null).toBeNull();
  });

  it('removes the picture with an empty list, and with null', async () => {
    const category = await make('clear picture', { icon: [PICTURE] });
    await change(category, { newIcon: [] });
    expect((await detailsOf(category.title)).iconUrl || null).toBeNull();
    await change(category, { newIcon: [OTHER_PICTURE] });
    expect((await detailsOf(category.title)).iconUrl).toBe(OTHER_PICTURE);
    await change(category, { newIcon: null });
    expect((await detailsOf(category.title)).iconUrl || null).toBeNull();
  });

  it('removes the library icon with an empty text, and with null', async () => {
    const category = await make('clear library icon', { iconClassName: LIBRARY_ICON });
    await change(category, { newIconClassName: '' });
    expect((await detailsOf(category.title)).iconClassName || null).toBeNull();
    await change(category, { newIconClassName: OTHER_LIBRARY_ICON });
    expect((await detailsOf(category.title)).iconClassName).toBe(OTHER_LIBRARY_ICON);
    await change(category, { newIconClassName: null });
    expect((await detailsOf(category.title)).iconClassName || null).toBeNull();
  });

  describe('refuses, and changes nothing', () => {
    const refused = [
      ['a call that changes nothing', {}, null],
      ['a null newTitle', { newTitle: null }, 'newTitle'],
      ['an empty newTitle', { newTitle: '' }, 'newTitle'],
      ['a newTitle that is not text', { newTitle: 42 }, 'newTitle'],
      ['a newIcon given as a bare string', { newIcon: OTHER_PICTURE }, 'newIcon'],
      ['a newIcon with two pictures', { newIcon: [PICTURE, OTHER_PICTURE] }, 'newIcon'],
      ['a new picture and a new library icon at once', { newIcon: [OTHER_PICTURE], newIconClassName: OTHER_LIBRARY_ICON }, 'newIconClassName'],
      ['a newIconClassName that is not text', { newIconClassName: 42 }, 'newIconClassName'],
    ];
    refused.forEach(([name, changes, named]) => {
      it(name, async () => {
        const category = await make('unchanged', { iconClassName: LIBRARY_ICON, subcategories: 'Pizza' });
        const why = await refusal(change(category, changes));
        if (named) expect(why).toContain(named);
        expect(await listed(category.title)).toEqual(holding(category.id, {
          title: category.title, iconClassName: LIBRARY_ICON, subcategories: [jasmine.objectContaining({ title: 'Pizza' })],
        }));
      });
    });
  });
};

// Refusals for a required text parameter: left out, null, empty, and not text. `parameters(name, value)` builds the call.
const MISSING_VALUES = [['without', undefined], ['with a null', null], ['with an empty', ''], ['with a numeric', 42]];
const withValue = (parameters, name, value) => {
  const result = { ...parameters };
  if (value === undefined) delete result[name];
  else result[name] = value;
  return result;
};

// How an operation on a subcategory finds its category (by title or id), and its subcategory too unless it is adding one.
// `extra` makes the call otherwise valid.
const describeFindingSubcategory = (operation, { usage, findsSubcategory, extra }) => {
  describe('finding its target', () => {
    const target = (category) => {
      const sub = category.subcategories[0];
      if (usage === 'basic') return { categoryTitle: category.title, ...(findsSubcategory ? { subcategoryTitle: sub.title } : {}) };
      return { categoryId: category.id, ...(findsSubcategory ? { subcategoryId: sub.id } : {}) };
    };
    const names = Object.keys(target({ title: 'x', id: 'x', subcategories: [{ title: 'x', id: 'x' }] }));
    const unchanged = async (category) => {
      expect(titlesOf(await subcategoriesOf(category.title))).toEqual(titlesOf(category.subcategories));
    };

    names.forEach((name) => {
      MISSING_VALUES.forEach(([how, value]) => {
        it(`refuses a call ${how} ${name}, and changes nothing`, async () => {
          const category = await make('lookup', { subcategories: 'Pizza, Burgers' });
          expect(await refusal(call(operation, withValue({ ...target(category), ...extra }, name, value)))).toContain(name);
          await unchanged(category);
        });
      });
    });

    if (usage === 'basic') {
      it('refuses a category title nothing has, naming it', async () => {
        const categoryTitle = unique('no such category');
        const params = { categoryTitle, ...(findsSubcategory ? { subcategoryTitle: 'Pizza' } : {}), ...extra };
        expect(await refusal(call(operation, params))).toContain(categoryTitle);
      });

      it('refuses a category title two categories share, saying how many, and changes neither', async () => {
        const title = unique('shared category');
        const first = await call('createCategory', { title, subcategories: 'Pizza, Burgers' });
        const second = await call('createCategory', { title, subcategories: 'Pizza, Burgers' });
        const why = await refusal(call(operation, { ...target(first), ...extra }));
        expect(why.replace(title, '')).toContain('2');
        const records = await listed(title);
        expect(records.map((record) => record.id).sort()).toEqual([first.id, second.id].sort());
        records.forEach((record) => expect(titlesOf(record.data.subcategories)).toEqual(['Pizza', 'Burgers']));
      });

      if (findsSubcategory) {
        it('refuses a subcategory title its category does not have, naming it', async () => {
          const category = await make('no such subcategory', { subcategories: 'Pizza, Burgers' });
          const why = await refusal(call(operation, { categoryTitle: category.title, subcategoryTitle: 'Tacos', ...extra }));
          expect(why).toContain('Tacos');
          await unchanged(category);
        });

        it('refuses a subcategory title two of its subcategories share, saying how many, and changes neither', async () => {
          const category = await make('twin subcategories', { subcategories: 'Pizza, Pizza' });
          const why = await refusal(call(operation, { categoryTitle: category.title, subcategoryTitle: 'Pizza', ...extra }));
          expect(why.replace(category.title, '')).toContain('2');
          expect(await subcategoriesOf(category.title)).toEqual(category.subcategories.map((sub) => jasmine.objectContaining({ id: sub.id, title: 'Pizza' })));
        });
      }
    } else {
      it('refuses a category id that matches nothing, naming it', async () => {
        const params = { categoryId: NO_ID, ...(findsSubcategory ? { subcategoryId: NO_SUBCATEGORY_ID } : {}), ...extra };
        expect(await refusal(call(operation, params))).toContain(NO_ID);
      });

      if (findsSubcategory) {
        it('refuses a subcategory id its category does not have, naming it, and changes nothing', async () => {
          const category = await make('no such subcategory id', { subcategories: 'Pizza, Burgers' });
          const why = await refusal(call(operation, { categoryId: category.id, subcategoryId: NO_SUBCATEGORY_ID, ...extra }));
          expect(why).toContain(NO_SUBCATEGORY_ID);
          await unchanged(category);
        });
      }
    }
  });
};

// The specs every addition of one subcategory makes, whether it finds the category by its title or by its id.
const describeSubcategoryCreation = (operation, target) => {
  it('adds a subcategory at the end of its category, and returns it', async () => {
    const category = await make('add subcategory', { subcategories: 'Pizza' });
    const created = await call(operation, { ...target(category), subcategoryTitle: 'Salads' });
    expect(created).toEqual(jasmine.objectContaining({ categoryId: category.id, id: jasmine.any(String), title: 'Salads' }));
    expect(created.iconUrl || null).toBeNull();
    expect(created.iconClassName || null).toBeNull();
    expect(await subcategoriesOf(category.title)).toEqual([
      jasmine.objectContaining({ id: category.subcategories[0].id, title: 'Pizza' }),
      jasmine.objectContaining({ id: created.id, title: 'Salads' }),
    ]);
  });

  it('adds a subcategory with an icon picture', async () => {
    const category = await make('add subcategory picture');
    const created = await call(operation, { ...target(category), subcategoryTitle: 'Salads', icon: [PICTURE] });
    expect(created).toEqual(jasmine.objectContaining({ categoryId: category.id, title: 'Salads', iconUrl: PICTURE }));
    expect(await subcategoriesOf(category.title)).toEqual([jasmine.objectContaining({ id: created.id, title: 'Salads', iconUrl: PICTURE })]);
  });

  it('adds a subcategory with a library icon', async () => {
    const category = await make('add subcategory library icon');
    const created = await call(operation, { ...target(category), subcategoryTitle: 'Salads', iconClassName: LIBRARY_ICON });
    expect(created).toEqual(jasmine.objectContaining({ categoryId: category.id, title: 'Salads', iconClassName: LIBRARY_ICON }));
    expect(await subcategoriesOf(category.title)).toEqual([jasmine.objectContaining({ id: created.id, title: 'Salads', iconClassName: LIBRARY_ICON })]);
  });

  describe('refuses, and adds nothing', () => {
    const refused = [
      ['without a subcategoryTitle', {}, 'subcategoryTitle'],
      ['a null subcategoryTitle', { subcategoryTitle: null }, 'subcategoryTitle'],
      ['an empty subcategoryTitle', { subcategoryTitle: '' }, 'subcategoryTitle'],
      ['a subcategoryTitle that is not text', { subcategoryTitle: 42 }, 'subcategoryTitle'],
      ['an icon given as a bare string', { subcategoryTitle: 'Salads', icon: PICTURE }, 'icon'],
      ['an icon with two pictures', { subcategoryTitle: 'Salads', icon: [PICTURE, OTHER_PICTURE] }, 'icon'],
      ['a null icon', { subcategoryTitle: 'Salads', icon: null }, 'icon'],
      ['a picture and a library icon at once', { subcategoryTitle: 'Salads', icon: [PICTURE], iconClassName: LIBRARY_ICON }, 'iconClassName'],
      ['a null iconClassName', { subcategoryTitle: 'Salads', iconClassName: null }, 'iconClassName'],
      ['an iconClassName that is not text', { subcategoryTitle: 'Salads', iconClassName: 42 }, 'iconClassName'],
    ];
    refused.forEach(([name, details, named]) => {
      it(name, async () => {
        const category = await make('refused subcategory', { subcategories: 'Pizza' });
        expect(await refusal(call(operation, { ...target(category), ...details }))).toContain(named);
        expect(titlesOf(await subcategoriesOf(category.title))).toEqual(['Pizza']);
      });
    });
  });
};

// The specs every update of one subcategory makes, whether it finds it by titles or by ids.
const describeSubcategoryChanges = (operation, target) => {
  const change = (category, sub, changes) => call(operation, { ...target(category, sub), ...changes });

  it('renames the subcategory, and returns it', async () => {
    const category = await make('rename subcategory', { subcategories: 'Pizza, Burgers' });
    const [pizza, burgers] = category.subcategories;
    expect(await change(category, pizza, { newTitle: 'Thin crust pizza' }))
      .toEqual(jasmine.objectContaining({ categoryId: category.id, id: pizza.id, title: 'Thin crust pizza' }));
    expect(await subcategoriesOf(category.title)).toEqual([
      jasmine.objectContaining({ id: pizza.id, title: 'Thin crust pizza' }),
      jasmine.objectContaining({ id: burgers.id, title: 'Burgers' }),
    ]);
  });

  it('keeps what it is not given, and every other subcategory', async () => {
    const category = await make('keep subcategory', { subcategories: 'Pizza, Burgers' });
    const [pizza, burgers] = category.subcategories;
    await change(category, pizza, { newIconClassName: LIBRARY_ICON });
    await change(category, pizza, { newTitle: 'Pizzas' });
    const [first, second] = await subcategoriesOf(category.title);
    expect(first).toEqual(jasmine.objectContaining({ id: pizza.id, title: 'Pizzas', iconClassName: LIBRARY_ICON }));
    expect(second).toEqual(jasmine.objectContaining({ id: burgers.id, title: 'Burgers' }));
    expect(second.iconClassName || null).toBeNull();
  });

  it('sets a picture, which replaces the library icon', async () => {
    const category = await make('subcategory picture', { subcategories: 'Pizza' });
    const [pizza] = category.subcategories;
    await change(category, pizza, { newIconClassName: LIBRARY_ICON });
    const changed = await change(category, pizza, { newIcon: [PICTURE] });
    expect(changed).toEqual(jasmine.objectContaining({ id: pizza.id, iconUrl: PICTURE }));
    expect(changed.iconClassName || null).toBeNull();
    const [stored] = await subcategoriesOf(category.title);
    expect(stored.iconUrl).toBe(PICTURE);
    expect(stored.iconClassName || null).toBeNull();
  });

  it('sets a library icon, which replaces the picture', async () => {
    const category = await make('subcategory library icon', { subcategories: 'Pizza' });
    const [pizza] = category.subcategories;
    await change(category, pizza, { newIcon: [PICTURE] });
    const changed = await change(category, pizza, { newIconClassName: LIBRARY_ICON });
    expect(changed).toEqual(jasmine.objectContaining({ id: pizza.id, iconClassName: LIBRARY_ICON }));
    expect(changed.iconUrl || null).toBeNull();
    const [stored] = await subcategoriesOf(category.title);
    expect(stored.iconClassName).toBe(LIBRARY_ICON);
    expect(stored.iconUrl || null).toBeNull();
  });

  it('removes the picture with an empty list, and with null', async () => {
    const category = await make('subcategory clear picture', { subcategories: 'Pizza' });
    const [pizza] = category.subcategories;
    await change(category, pizza, { newIcon: [PICTURE] });
    await change(category, pizza, { newIcon: [] });
    expect((await subcategoriesOf(category.title))[0].iconUrl || null).toBeNull();
    await change(category, pizza, { newIcon: [OTHER_PICTURE] });
    await change(category, pizza, { newIcon: null });
    expect((await subcategoriesOf(category.title))[0].iconUrl || null).toBeNull();
  });

  it('removes the library icon with an empty text, and with null', async () => {
    const category = await make('subcategory clear library icon', { subcategories: 'Pizza' });
    const [pizza] = category.subcategories;
    await change(category, pizza, { newIconClassName: LIBRARY_ICON });
    await change(category, pizza, { newIconClassName: '' });
    expect((await subcategoriesOf(category.title))[0].iconClassName || null).toBeNull();
    await change(category, pizza, { newIconClassName: OTHER_LIBRARY_ICON });
    await change(category, pizza, { newIconClassName: null });
    expect((await subcategoriesOf(category.title))[0].iconClassName || null).toBeNull();
  });

  describe('refuses, and changes nothing', () => {
    const refused = [
      ['a call that changes nothing', {}, null],
      ['a null newTitle', { newTitle: null }, 'newTitle'],
      ['an empty newTitle', { newTitle: '' }, 'newTitle'],
      ['a newTitle that is not text', { newTitle: 42 }, 'newTitle'],
      ['a newIcon given as a bare string', { newIcon: PICTURE }, 'newIcon'],
      ['a newIcon with two pictures', { newIcon: [PICTURE, OTHER_PICTURE] }, 'newIcon'],
      ['a new picture and a new library icon at once', { newIcon: [PICTURE], newIconClassName: LIBRARY_ICON }, 'newIconClassName'],
      ['a newIconClassName that is not text', { newIconClassName: 42 }, 'newIconClassName'],
    ];
    refused.forEach(([name, changes, named]) => {
      it(name, async () => {
        const category = await make('unchanged subcategory', { subcategories: 'Pizza, Burgers' });
        const why = await refusal(change(category, category.subcategories[0], changes));
        if (named) expect(why).toContain(named);
        const stored = await subcategoriesOf(category.title);
        expect(stored).toEqual(category.subcategories.map((sub) => jasmine.objectContaining({ id: sub.id, title: sub.title })));
        expect(stored[0].iconUrl || null).toBeNull();
        expect(stored[0].iconClassName || null).toBeNull();
      });
    });
  });
};

// The specs every removal of one subcategory makes.
const describeSubcategoryRemoval = (operation, target) => {
  it('removes the subcategory for good, keeps the others in order, and returns its ids', async () => {
    const category = await make('remove subcategory', { subcategories: 'Pizza, Burgers, Salads' });
    const [pizza, burgers, salads] = category.subcategories;
    expect(await call(operation, target(category, burgers))).toEqual(jasmine.objectContaining({ categoryId: category.id, id: burgers.id }));
    expect(await subcategoriesOf(category.title)).toEqual([
      jasmine.objectContaining({ id: pizza.id, title: 'Pizza' }),
      jasmine.objectContaining({ id: salads.id, title: 'Salads' }),
    ]);
  });

  it('removes the last subcategory, leaving the category', async () => {
    const category = await make('remove only subcategory', { subcategories: 'Pizza' });
    await call(operation, target(category, category.subcategories[0]));
    expect(await listed(category.title)).toEqual(holding(category.id, { title: category.title, subcategories: [] }));
  });
};

// The specs every move of one subcategory makes.
const describeSubcategoryMoves = (operation, target) => {
  it('moves a subcategory to the place given, and returns the category', async () => {
    const category = await make('move subcategory', { subcategories: 'Pizza, Burgers, Salads' });
    const [pizza, burgers, salads] = category.subcategories;
    expect(await call(operation, { ...target(category, salads), position: 1 })).toEqual(jasmine.objectContaining({
      id: category.id,
      title: category.title,
      subcategories: [
        jasmine.objectContaining({ id: salads.id, title: 'Salads' }),
        jasmine.objectContaining({ id: pizza.id, title: 'Pizza' }),
        jasmine.objectContaining({ id: burgers.id, title: 'Burgers' }),
      ],
      createdOn: jasmine.any(String),
      lastUpdatedOn: jasmine.any(String),
    }));
    expect(idsOf(await subcategoriesOf(category.title))).toEqual([salads.id, pizza.id, burgers.id]);
  });

  it('moves a subcategory to the last place', async () => {
    const category = await make('move subcategory last', { subcategories: 'Pizza, Burgers, Salads' });
    const [pizza, burgers, salads] = category.subcategories;
    await call(operation, { ...target(category, pizza), position: 3 });
    expect(idsOf(await subcategoriesOf(category.title))).toEqual([burgers.id, salads.id, pizza.id]);
  });

  describe('refuses a place out of range, and moves nothing', () => {
    const refused = [
      ['without a position', undefined],
      ['a null position', null],
      ['position 0', 0],
      ['a position past the last subcategory', 4],
      ['a position that is not a whole number', 1.5],
      ['a position that is not a number', '2'],
    ];
    refused.forEach(([name, position]) => {
      it(name, async () => {
        const category = await make('refused move', { subcategories: 'Pizza, Burgers, Salads' });
        const params = withValue({ ...target(category, category.subcategories[2]), position: 1 }, 'position', position);
        expect(await refusal(call(operation, params))).toContain('position');
        expect(idsOf(await subcategoriesOf(category.title))).toEqual(idsOf(category.subcategories));
      });
    });
  });
};

const byTitles = (category, sub) => ({ categoryTitle: category.title, subcategoryTitle: sub.title });
const byIds = (category, sub) => ({ categoryId: category.id, subcategoryId: sub.id });

// ======================= Categories =======================

// widgetBackground and controlBackground: runs in both frames, on the categories the control run made.
contract.describe('searchCategories', () => {
  // The control run makes categories here, and createCategory makes these calls nothing answers.
  // The categories made here stay: the app's run pages through them.
  beforeEach(() => {
    made = [];
    if (contract.host === 'control') answerFireAndForget();
  });

  it('finds the category the control panel made, by its exact title, with its details and subcategories', async () => {
    const made = await categoryForTheApp();
    expect(await call('searchCategories', { title: forTheApp })).toEqual(jasmine.objectContaining({
      result: [jasmine.objectContaining({
        id: made.id,
        data: jasmine.objectContaining({
          title: forTheApp,
          iconClassName: LIBRARY_ICON,
          subcategories: [
            jasmine.objectContaining({ id: jasmine.any(String), title: 'Pizza' }),
            jasmine.objectContaining({ id: jasmine.any(String), title: 'Burgers' }),
          ],
          createdOn: jasmine.any(String),
          lastUpdatedOn: jasmine.any(String),
        }),
      })],
      totalRecord: 1,
    }));
  });

  it('finds nothing for a title no category has', async () => {
    expect(await call('searchCategories', { title: unique('no such category') })).toEqual(jasmine.objectContaining({ result: [], totalRecord: 0 }));
  });

  it('matches the title exactly, not part of it', async () => {
    await categoryForTheApp();
    expect((await call('searchCategories', { title: 'Post listed category' })).result).toEqual([]);
  });

  it('lists every category when no title is given, with how many there are', async () => {
    const made = await categoryForTheApp();
    const first = await call('searchCategories', {});
    expect(first).toEqual(jasmine.objectContaining({ result: jasmine.any(Array), totalRecord: jasmine.any(Number) }));
    expect(first.totalRecord).toBeGreaterThan(0);
    const { records, totalRecord } = await everyCategory();
    expect(records.length).toBe(totalRecord);
    expect(records).toContain(jasmine.objectContaining({ id: made.id, data: jasmine.objectContaining({ title: forTheApp }) }));
  }, 120000);

  it('shows the first page when no page is given', async () => {
    await categoryForTheApp();
    const unpaged = await call('searchCategories', {});
    const first = await call('searchCategories', { page: 0 });
    expect(first.result.map((record) => record.id).sort()).toEqual(unpaged.result.map((record) => record.id).sort());
  });

  it('shows at most 50 categories a page, and the rest on the next page', async () => {
    if (contract.host === 'control') {
      // More categories than a page, made through the contract's batch operation within its limit of 50 a call.
      const stamp = `(${contract.host}) ${Date.now()}`;
      const categories = Array.from({ length: 50 }, (value, index) => ({ title: `Post page category ${index} ${stamp}` }));
      expect(await call('createCategoriesAdvanced', { categories })).toEqual(jasmine.objectContaining({ succeeded: 50 }));
      await call('createCategory', { title: `Post page category 50 ${stamp}` });
    }
    const first = await call('searchCategories', { page: 0 });
    expect(first.totalRecord).toBeGreaterThan(50);
    expect(first.result.length).toBe(50);
    const second = await call('searchCategories', { page: 1 });
    expect(second.result.length).toBe(Math.min(first.totalRecord - 50, 50));
    // The next page goes on where the first one ends, in title order.
    const lastOfFirst = first.result[first.result.length - 1].data.title.toLowerCase();
    expect(second.result.filter((record) => record.data.title.toLowerCase() < lastOfFirst)).toEqual([]);
  }, 120000);

  it('lists the categories by title, whatever their case', async () => {
    if (contract.host === 'control') {
      const stamp = `(${contract.host}) ${Date.now()}`;
      await call('createCategory', { title: `Post Zebra order ${stamp}` });
      await call('createCategory', { title: `post apple order ${stamp}` });
    }
    const { records } = await everyCategory();
    const titles = records.map((record) => record.data.title.toLowerCase());
    expect(titles).toEqual([...titles].sort());
  }, 120000);

  it('shows nothing past the last page', async () => {
    expect((await call('searchCategories', { page: 1000 })).result).toEqual([]);
  });
});

// controlBackground only, as is every block below: only the control panel manages categories.
contract.describe('createCategory', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  it('adds a category from its title alone, and returns it', async () => {
    const title = unique('category');
    const created = await call('createCategory', { title });
    expect(created).toEqual(jasmine.objectContaining({
      id: jasmine.any(String), title, subcategories: [], createdOn: jasmine.any(String), lastUpdatedOn: jasmine.any(String),
    }));
    expect(created.iconUrl || null).toBeNull();
    expect(created.iconClassName || null).toBeNull();
    expect(await call('searchCategories', { title })).toEqual(jasmine.objectContaining({ result: holding(created.id, { title, subcategories: [] }), totalRecord: 1 }));
  });

  it('adds a category with an icon picture and its subcategories, in order', async () => {
    const title = unique('with subcategories');
    const created = await call('createCategory', { title, icon: [PICTURE], subcategories: 'Pizza, Burgers' });
    const subcategories = [
      jasmine.objectContaining({ id: jasmine.any(String), title: 'Pizza' }),
      jasmine.objectContaining({ id: jasmine.any(String), title: 'Burgers' }),
    ];
    expect(created).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title, iconUrl: PICTURE, subcategories }));
    expect(created.subcategories[0].id).not.toBe(created.subcategories[1].id);
    expect(await listed(title)).toEqual(holding(created.id, {
      title,
      iconUrl: PICTURE,
      subcategories: created.subcategories.map((sub) => jasmine.objectContaining({ id: sub.id, title: sub.title })),
    }));
  });

  it('adds a category with a library icon', async () => {
    const title = unique('library icon');
    const created = await call('createCategory', { title, iconClassName: LIBRARY_ICON });
    expect(created).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title, iconClassName: LIBRARY_ICON }));
    expect(created.iconUrl || null).toBeNull();
    expect(await listed(title)).toEqual(holding(created.id, { title, iconClassName: LIBRARY_ICON }));
  });

  it('announces the new category with categoryCreated, and its details', async () => {
    const title = unique('announced');
    const created = await call('createCategory', { title, icon: [PICTURE], subcategories: 'Pizza, Burgers' });
    const payloads = sentEvents('categoryCreated');
    expect(payloads).toEqual([jasmine.objectContaining({
      categoryId: created.id, title, iconUrl: PICTURE, subcategories: ['Pizza', 'Burgers'], createdOn: jasmine.any(String),
    })]);
    expect(Object.keys(payloads[0]).filter((key) => !CATEGORY_CREATED_KEYS.includes(key))).toEqual([]);
  });

  describe('refuses, writes nothing and announces nothing', () => {
    const refused = [
      ['without a title', () => ({}), 'title'],
      ['a null title', () => ({ title: null }), 'title'],
      ['an empty title', () => ({ title: '' }), 'title'],
      ['a title of spaces only', () => ({ title: '   ' }), 'title'],
      ['a title that is not text', () => ({ title: 42 }), 'title'],
      ['an icon given as a bare string', (title) => ({ title, icon: PICTURE }), 'icon'],
      ['an icon with two pictures', (title) => ({ title, icon: [PICTURE, OTHER_PICTURE] }), 'icon'],
      ['a null icon', (title) => ({ title, icon: null }), 'icon'],
      ['an icon holding something other than a URL', (title) => ({ title, icon: [42] }), 'icon'],
      ['a picture and a library icon at once', (title) => ({ title, icon: [PICTURE], iconClassName: LIBRARY_ICON }), 'iconClassName'],
      ['a null iconClassName', (title) => ({ title, iconClassName: null }), 'iconClassName'],
      ['an iconClassName that is not text', (title) => ({ title, iconClassName: 42 }), 'iconClassName'],
      ['subcategories that are not text', (title) => ({ title, subcategories: ['Pizza', 'Burgers'] }), 'subcategories'],
    ];
    refused.forEach(([name, parameters, named]) => {
      it(name, async () => {
        const title = unique('refused');
        expect(await refusal(call('createCategory', parameters(title)))).toContain(named);
        expect(await listed(title)).toEqual([]);
        expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      });
    });
  });
});

contract.describe('createCategoriesAdvanced', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  it('adds every category, reports each, and announces each', async () => {
    const titles = [unique('batch one'), unique('batch two')];
    const result = await call('createCategoriesAdvanced', { categories: titles.map((title) => ({ title })) });
    expect(result).toEqual(jasmine.objectContaining({
      categories: [jasmine.objectContaining({ index: 0, id: jasmine.any(String) }), jasmine.objectContaining({ index: 1, id: jasmine.any(String) })],
      succeeded: 2,
      failed: 0,
    }));
    expect(result.categories.map((entry) => entry.error || null)).toEqual([null, null]);
    expect(await listed(titles[0])).toEqual(holding(result.categories[0].id, { title: titles[0] }));
    expect(await listed(titles[1])).toEqual(holding(result.categories[1].id, { title: titles[1] }));
    expect(sentEvents('categoryCreated')).toEqual([
      jasmine.objectContaining({ categoryId: result.categories[0].id, title: titles[0] }),
      jasmine.objectContaining({ categoryId: result.categories[1].id, title: titles[1] }),
    ]);
  });

  it('adds categories with icons and subcategories', async () => {
    const withPicture = unique('batch picture');
    const withLibraryIcon = unique('batch library icon');
    const result = await call('createCategoriesAdvanced', {
      categories: [
        { title: withPicture, icon: [PICTURE], subcategories: 'Pizza, Burgers' },
        { title: withLibraryIcon, iconClassName: LIBRARY_ICON },
      ],
    });
    expect(result).toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
    expect(await listed(withPicture)).toEqual(holding(result.categories[0].id, {
      iconUrl: PICTURE, subcategories: [jasmine.objectContaining({ title: 'Pizza' }), jasmine.objectContaining({ title: 'Burgers' })],
    }));
    expect(await listed(withLibraryIcon)).toEqual(holding(result.categories[1].id, { iconClassName: LIBRARY_ICON }));
  });

  describe('refuses the whole list, writes none of it and announces nothing', () => {
    const refused = [
      ['without categories', () => ({}), 'categories'],
      ['when it is empty', () => ({ categories: [] }), 'categories'],
      ['when it is not a list', (title) => ({ categories: { title } }), 'categories'],
      ['when an entry is not an object', (title) => ({ categories: [{ title }, 'Pizza'] }), 'categories'],
      ['when it holds more than 50 entries', (title) => ({ categories: Array.from({ length: 51 }, (value, index) => ({ title: index ? `${title} ${index}` : title })) }), '50'],
      ['when one entry has no title', (title) => ({ categories: [{ title }, { iconClassName: LIBRARY_ICON }] }), 'title'],
      ['when one entry has an empty title', (title) => ({ categories: [{ title }, { title: '' }] }), 'title'],
      ['when one entry has an icon given as a bare string', (title) => ({ categories: [{ title }, { title: `${title} icon`, icon: PICTURE }] }), 'icon'],
      ['when one entry has both a picture and a library icon', (title) => ({ categories: [{ title }, { title: `${title} icons`, icon: [PICTURE], iconClassName: LIBRARY_ICON }] }), 'iconClassName'],
    ];
    refused.forEach(([name, parameters, named]) => {
      it(name, async () => {
        const title = unique('refused batch');
        expect(await refusal(call('createCategoriesAdvanced', parameters(title)))).toContain(named);
        expect(await listed(title)).toEqual([]);
        expect(buildfire.services.contract.events.send).not.toHaveBeenCalled();
      });
    });
  });
});

contract.describe('updateCategory', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  describeCategoryChanges('updateCategory', (category) => ({ title: category.title }));

  describe('finding the category', () => {
    MISSING_VALUES.forEach(([how, value]) => {
      it(`refuses a call ${how} title`, async () => {
        expect(await refusal(call('updateCategory', withValue({ newIconClassName: LIBRARY_ICON }, 'title', value)))).toContain('title');
      });
    });

    it('refuses a title no category has, naming it', async () => {
      const title = unique('no such category');
      expect(await refusal(call('updateCategory', { title, newIconClassName: LIBRARY_ICON }))).toContain(title);
      expect(await listed(title)).toEqual([]);
    });

    it('refuses a title two categories share, saying how many, and changes neither', async () => {
      const title = unique('shared');
      const first = await call('createCategory', { title });
      const second = await call('createCategory', { title });
      const why = await refusal(call('updateCategory', { title, newIconClassName: LIBRARY_ICON }));
      expect(why.replace(title, '')).toContain('2');
      const records = await listed(title);
      expect(records.map((record) => record.id).sort()).toEqual([first.id, second.id].sort());
      records.forEach((record) => expect(record.data.iconClassName || null).toBeNull());
    });
  });
});

contract.describe('updateCategoryAdvanced', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  describeCategoryChanges('updateCategoryAdvanced', (category) => ({ categoryId: category.id }));

  describe('finding the category', () => {
    MISSING_VALUES.forEach(([how, value]) => {
      it(`refuses a call ${how} categoryId`, async () => {
        expect(await refusal(call('updateCategoryAdvanced', withValue({ newIconClassName: LIBRARY_ICON }, 'categoryId', value)))).toContain('categoryId');
      });
    });

    it('refuses an id that matches nothing, naming it', async () => {
      expect(await refusal(call('updateCategoryAdvanced', { categoryId: NO_ID, newTitle: unique('nowhere') }))).toContain(NO_ID);
    });
  });
});

contract.describe('updateCategoriesAdvanced', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  it('changes every category, and reports each', async () => {
    const first = await make('batch rename', { iconClassName: LIBRARY_ICON });
    const second = await make('batch icon', { subcategories: 'Pizza' });
    const newTitle = unique('batch renamed');
    const result = await call('updateCategoriesAdvanced', {
      categories: [{ categoryId: first.id, newTitle }, { categoryId: second.id, newIcon: [PICTURE] }],
    });
    expect(result).toEqual(jasmine.objectContaining({
      categories: [jasmine.objectContaining({ index: 0, id: first.id }), jasmine.objectContaining({ index: 1, id: second.id })],
      succeeded: 2,
      failed: 0,
    }));
    expect(result.categories.map((entry) => entry.error || null)).toEqual([null, null]);
    expect(await listed(first.title)).toEqual([]);
    expect(await listed(newTitle)).toEqual(holding(first.id, { title: newTitle, iconClassName: LIBRARY_ICON }));
    expect(await listed(second.title)).toEqual(holding(second.id, { iconUrl: PICTURE, subcategories: [jasmine.objectContaining({ title: 'Pizza' })] }));
  });

  it('clears an icon set to null or emptied, and keeps what an entry does not give', async () => {
    const withPicture = await make('batch clear picture', { icon: [PICTURE] });
    const withLibraryIcon = await make('batch clear library icon', { iconClassName: LIBRARY_ICON });
    await call('updateCategoriesAdvanced', {
      categories: [{ categoryId: withPicture.id, newIcon: null }, { categoryId: withLibraryIcon.id, newIconClassName: '' }],
    });
    const picture = await detailsOf(withPicture.title);
    expect(picture.iconUrl || null).toBeNull();
    const libraryIcon = await detailsOf(withLibraryIcon.title);
    expect(libraryIcon.iconClassName || null).toBeNull();
    expect(libraryIcon.title).toBe(withLibraryIcon.title);
  });

  describe('refuses the whole list, and changes none of it', () => {
    // The first entry is always a valid change of `category`: it must not be applied.
    const refused = [
      ['without categories', () => ({}), 'categories'],
      ['when it is empty', () => ({ categories: [] }), 'categories'],
      ['when it is not a list', (valid) => ({ categories: valid }), 'categories'],
      ['when it holds more than 50 entries', (valid) => ({ categories: [valid, ...Array.from({ length: 50 }, (value, index) => ({ categoryId: unknownId(index + 1), newTitle: 'Nowhere' }))] }), '50'],
      ['when one entry changes nothing', (valid, other) => ({ categories: [valid, { categoryId: other.id }] }), null],
      ['when one entry has no categoryId', (valid) => ({ categories: [valid, { newTitle: 'Nowhere' }] }), 'categoryId'],
      ['when one entry removes the title', (valid, other) => ({ categories: [valid, { categoryId: other.id, newTitle: null }] }), 'newTitle'],
      ['when one entry has a newIcon given as a bare string', (valid, other) => ({ categories: [valid, { categoryId: other.id, newIcon: PICTURE }] }), 'newIcon'],
      ['when one entry has an id that matches nothing', (valid) => ({ categories: [valid, { categoryId: NO_ID, newIconClassName: LIBRARY_ICON }] }), NO_ID],
      ['when the same category is listed twice', (valid, other) => ({ categories: [valid, { categoryId: other.id, newIconClassName: LIBRARY_ICON }, { categoryId: other.id, newIconClassName: OTHER_LIBRARY_ICON }] }), null],
    ];
    refused.forEach(([name, parameters, named]) => {
      it(name, async () => {
        const category = await make('batch unchanged');
        const other = await make('batch other');
        const why = await refusal(call('updateCategoriesAdvanced', parameters({ categoryId: category.id, newIconClassName: LIBRARY_ICON }, other)));
        if (named) expect(why).toContain(named);
        expect((await detailsOf(category.title)).iconClassName || null).toBeNull();
        expect((await detailsOf(other.title)).iconClassName || null).toBeNull();
      });
    });
  });
});

contract.describe('deleteCategory', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  it('removes the category found by its title, and returns its id and when', async () => {
    const category = await make('delete', { subcategories: 'Pizza' });
    expect(await call('deleteCategory', { title: category.title })).toEqual(jasmine.objectContaining({ id: category.id, deletedOn: jasmine.any(String) }));
    expect(await call('searchCategories', { title: category.title })).toEqual(jasmine.objectContaining({ result: [], totalRecord: 0 }));
  });

  it('no longer finds a removed category by its title', async () => {
    const category = await make('deleted once');
    await call('deleteCategory', { title: category.title });
    expect(await refusal(call('deleteCategory', { title: category.title }))).toContain(category.title);
    expect(await refusal(call('updateCategory', { title: category.title, newIconClassName: LIBRARY_ICON }))).toContain(category.title);
  });

  it('keeps every other category', async () => {
    const kept = await make('kept');
    const removed = await make('removed');
    await call('deleteCategory', { title: removed.title });
    expect(await listed(kept.title)).toEqual(holding(kept.id, { title: kept.title }));
  });

  describe('refuses, and removes nothing', () => {
    MISSING_VALUES.forEach(([how, value]) => {
      it(`a call ${how} title`, async () => {
        expect(await refusal(call('deleteCategory', withValue({}, 'title', value)))).toContain('title');
      });
    });

    it('a title no category has, naming it', async () => {
      const title = unique('no such category');
      expect(await refusal(call('deleteCategory', { title }))).toContain(title);
    });

    it('a title two categories share, saying how many, and removes neither', async () => {
      const title = unique('shared');
      const first = await call('createCategory', { title });
      const second = await call('createCategory', { title });
      const why = await refusal(call('deleteCategory', { title }));
      expect(why.replace(title, '')).toContain('2');
      expect((await listed(title)).map((record) => record.id).sort()).toEqual([first.id, second.id].sort());
    });
  });
});

contract.describe('deleteCategoryAdvanced', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  it('removes the category with that id, and returns its id and when', async () => {
    const category = await make('delete by id');
    expect(await call('deleteCategoryAdvanced', { categoryId: category.id })).toEqual(jasmine.objectContaining({ id: category.id, deletedOn: jasmine.any(String) }));
    expect(await listed(category.title)).toEqual([]);
  });

  it('keeps every other category', async () => {
    const kept = await make('kept by id');
    const removed = await make('removed by id');
    await call('deleteCategoryAdvanced', { categoryId: removed.id });
    expect(await listed(kept.title)).toEqual(holding(kept.id, { title: kept.title }));
  });

  describe('refuses, and removes nothing', () => {
    MISSING_VALUES.forEach(([how, value]) => {
      it(`a call ${how} categoryId`, async () => {
        expect(await refusal(call('deleteCategoryAdvanced', withValue({}, 'categoryId', value)))).toContain('categoryId');
      });
    });

    it('an id that matches nothing, naming it', async () => {
      expect(await refusal(call('deleteCategoryAdvanced', { categoryId: NO_ID }))).toContain(NO_ID);
    });
  });
});

contract.describe('deleteCategoriesAdvanced', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  it('removes every category, and reports each', async () => {
    const first = await make('batch delete one');
    const second = await make('batch delete two');
    const kept = await make('batch delete kept');
    const result = await call('deleteCategoriesAdvanced', { categories: [{ categoryId: first.id }, { categoryId: second.id }] });
    expect(result).toEqual(jasmine.objectContaining({
      categories: [jasmine.objectContaining({ index: 0, id: first.id }), jasmine.objectContaining({ index: 1, id: second.id })],
      succeeded: 2,
      failed: 0,
    }));
    expect(result.categories.map((entry) => entry.error || null)).toEqual([null, null]);
    expect(await listed(first.title)).toEqual([]);
    expect(await listed(second.title)).toEqual([]);
    expect(await listed(kept.title)).toEqual(holding(kept.id, { title: kept.title }));
  });

  describe('refuses the whole list, and removes none of it', () => {
    const refused = [
      ['without categories', () => ({}), 'categories'],
      ['when it is empty', () => ({ categories: [] }), 'categories'],
      ['when it is not a list', (category) => ({ categories: { categoryId: category.id } }), 'categories'],
      ['when it holds more than 50 entries', (category) => ({ categories: [{ categoryId: category.id }, ...Array.from({ length: 50 }, (value, index) => ({ categoryId: unknownId(index + 1) }))] }), '50'],
      ['when one entry has no categoryId', (category) => ({ categories: [{ categoryId: category.id }, {}] }), 'categoryId'],
      ['when one entry has an id that matches nothing', (category) => ({ categories: [{ categoryId: category.id }, { categoryId: NO_ID }] }), NO_ID],
      ['when the same category is listed twice', (category) => ({ categories: [{ categoryId: category.id }, { categoryId: category.id }] }), null],
    ];
    refused.forEach(([name, parameters, named]) => {
      it(name, async () => {
        const category = await make('batch delete refused');
        const why = await refusal(call('deleteCategoriesAdvanced', parameters(category)));
        if (named) expect(why).toContain(named);
        expect(await listed(category.title)).toEqual(holding(category.id, { title: category.title }));
      });
    });
  });
});

// ======================= Subcategories =======================

contract.describe('createSubcategory', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  describeSubcategoryCreation('createSubcategory', (category) => ({ categoryTitle: category.title }));
  describeFindingSubcategory('createSubcategory', { usage: 'basic', findsSubcategory: false, extra: { subcategoryTitle: 'Salads' } });
});

contract.describe('createSubcategoryAdvanced', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  describeSubcategoryCreation('createSubcategoryAdvanced', (category) => ({ categoryId: category.id }));
  describeFindingSubcategory('createSubcategoryAdvanced', { usage: 'advanced', findsSubcategory: false, extra: { subcategoryTitle: 'Salads' } });
});

contract.describe('createSubcategoriesAdvanced', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  it('adds every subcategory at the end of its category, in order, and reports each', async () => {
    const first = await make('batch subcategories one', { subcategories: 'Pizza' });
    const second = await make('batch subcategories two');
    const result = await call('createSubcategoriesAdvanced', {
      subcategories: [
        { categoryId: first.id, subcategoryTitle: 'Burgers' },
        { categoryId: second.id, subcategoryTitle: 'Coffee', iconClassName: LIBRARY_ICON },
        { categoryId: first.id, subcategoryTitle: 'Salads', icon: [PICTURE] },
      ],
    });
    expect(result).toEqual(jasmine.objectContaining({
      subcategories: [0, 1, 2].map((index) => jasmine.objectContaining({ index, id: jasmine.any(String) })),
      succeeded: 3,
      failed: 0,
    }));
    expect(result.subcategories.map((entry) => entry.error || null)).toEqual([null, null, null]);
    const [burgers, coffee, salads] = result.subcategories.map((entry) => entry.id);
    expect(await subcategoriesOf(first.title)).toEqual([
      jasmine.objectContaining({ id: first.subcategories[0].id, title: 'Pizza' }),
      jasmine.objectContaining({ id: burgers, title: 'Burgers' }),
      jasmine.objectContaining({ id: salads, title: 'Salads', iconUrl: PICTURE }),
    ]);
    expect(await subcategoriesOf(second.title)).toEqual([jasmine.objectContaining({ id: coffee, title: 'Coffee', iconClassName: LIBRARY_ICON })]);
  });

  describe('refuses the whole list, and adds none of it', () => {
    // The first entry is always a valid addition to `category`: it must not be made.
    const refused = [
      ['without subcategories', () => ({}), 'subcategories'],
      ['when it is empty', () => ({ subcategories: [] }), 'subcategories'],
      ['when it is not a list', (valid) => ({ subcategories: valid }), 'subcategories'],
      ['when it holds more than 50 entries', (valid) => ({ subcategories: Array.from({ length: 51 }, (value, index) => ({ ...valid, subcategoryTitle: `Dish ${index}` })) }), '50'],
      ['when one entry has no subcategoryTitle', (valid) => ({ subcategories: [valid, { categoryId: valid.categoryId }] }), 'subcategoryTitle'],
      ['when one entry has no categoryId', (valid) => ({ subcategories: [valid, { subcategoryTitle: 'Coffee' }] }), 'categoryId'],
      ['when one entry has an icon given as a bare string', (valid) => ({ subcategories: [valid, { ...valid, subcategoryTitle: 'Coffee', icon: PICTURE }] }), 'icon'],
      ['when one entry has a category id that matches nothing', (valid) => ({ subcategories: [valid, { categoryId: NO_ID, subcategoryTitle: 'Coffee' }] }), NO_ID],
    ];
    refused.forEach(([name, parameters, named]) => {
      it(name, async () => {
        const category = await make('batch subcategories refused', { subcategories: 'Pizza' });
        expect(await refusal(call('createSubcategoriesAdvanced', parameters({ categoryId: category.id, subcategoryTitle: 'Salads' })))).toContain(named);
        expect(titlesOf(await subcategoriesOf(category.title))).toEqual(['Pizza']);
      });
    });
  });
});

contract.describe('updateSubcategory', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  describeSubcategoryChanges('updateSubcategory', byTitles);
  describeFindingSubcategory('updateSubcategory', { usage: 'basic', findsSubcategory: true, extra: { newTitle: 'Salads' } });
});

contract.describe('updateSubcategoryAdvanced', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  describeSubcategoryChanges('updateSubcategoryAdvanced', byIds);
  describeFindingSubcategory('updateSubcategoryAdvanced', { usage: 'advanced', findsSubcategory: true, extra: { newTitle: 'Salads' } });
});

contract.describe('updateSubcategoriesAdvanced', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  it('changes every subcategory, keeps the rest, and reports each', async () => {
    const first = await make('batch change subcategories one', { subcategories: 'Pizza, Burgers' });
    const second = await make('batch change subcategories two', { subcategories: 'Coffee' });
    const [pizza, burgers] = first.subcategories;
    const [coffee] = second.subcategories;
    const result = await call('updateSubcategoriesAdvanced', {
      subcategories: [
        { categoryId: first.id, subcategoryId: pizza.id, newTitle: 'Pizzas' },
        { categoryId: first.id, subcategoryId: burgers.id, newIcon: [PICTURE] },
        { categoryId: second.id, subcategoryId: coffee.id, newIconClassName: LIBRARY_ICON },
      ],
    });
    expect(result).toEqual(jasmine.objectContaining({
      subcategories: [
        jasmine.objectContaining({ index: 0, id: pizza.id }),
        jasmine.objectContaining({ index: 1, id: burgers.id }),
        jasmine.objectContaining({ index: 2, id: coffee.id }),
      ],
      succeeded: 3,
      failed: 0,
    }));
    expect(result.subcategories.map((entry) => entry.error || null)).toEqual([null, null, null]);
    expect(await subcategoriesOf(first.title)).toEqual([
      jasmine.objectContaining({ id: pizza.id, title: 'Pizzas' }),
      jasmine.objectContaining({ id: burgers.id, title: 'Burgers', iconUrl: PICTURE }),
    ]);
    expect(await subcategoriesOf(second.title)).toEqual([jasmine.objectContaining({ id: coffee.id, title: 'Coffee', iconClassName: LIBRARY_ICON })]);
  });

  it('clears an icon set to null or emptied', async () => {
    const category = await make('batch clear subcategory icons', { subcategories: 'Pizza, Burgers' });
    const [pizza, burgers] = category.subcategories;
    await call('updateSubcategoriesAdvanced', {
      subcategories: [
        { categoryId: category.id, subcategoryId: pizza.id, newIcon: [PICTURE] },
        { categoryId: category.id, subcategoryId: burgers.id, newIconClassName: LIBRARY_ICON },
      ],
    });
    await call('updateSubcategoriesAdvanced', {
      subcategories: [
        { categoryId: category.id, subcategoryId: pizza.id, newIcon: null },
        { categoryId: category.id, subcategoryId: burgers.id, newIconClassName: '' },
      ],
    });
    const [storedPizza, storedBurgers] = await subcategoriesOf(category.title);
    expect(storedPizza.iconUrl || null).toBeNull();
    expect(storedBurgers.iconClassName || null).toBeNull();
    expect(titlesOf([storedPizza, storedBurgers])).toEqual(['Pizza', 'Burgers']);
  });

  describe('refuses the whole list, and changes none of it', () => {
    // The first entry is always a valid rename of the category's first subcategory: it must not be applied.
    const refused = [
      ['without subcategories', () => ({}), 'subcategories'],
      ['when it is empty', () => ({ subcategories: [] }), 'subcategories'],
      ['when it is not a list', (valid) => ({ subcategories: valid }), 'subcategories'],
      ['when it holds more than 50 entries', (valid) => ({ subcategories: [valid, ...Array.from({ length: 50 }, (value, index) => ({ categoryId: unknownId(index + 1), subcategoryId: NO_SUBCATEGORY_ID, newTitle: 'Nowhere' }))] }), '50'],
      ['when one entry changes nothing', (valid, other) => ({ subcategories: [valid, other] }), null],
      ['when one entry has no categoryId', (valid, other) => ({ subcategories: [valid, { subcategoryId: other.subcategoryId, newTitle: 'Nowhere' }] }), 'categoryId'],
      ['when one entry has no subcategoryId', (valid, other) => ({ subcategories: [valid, { categoryId: other.categoryId, newTitle: 'Nowhere' }] }), 'subcategoryId'],
      ['when one entry removes the title', (valid, other) => ({ subcategories: [valid, { ...other, newTitle: null }] }), 'newTitle'],
      ['when one entry has a newIcon given as a bare string', (valid, other) => ({ subcategories: [valid, { ...other, newIcon: PICTURE }] }), 'newIcon'],
      ['when one entry has a category id that matches nothing', (valid, other) => ({ subcategories: [valid, { categoryId: NO_ID, subcategoryId: other.subcategoryId, newTitle: 'Nowhere' }] }), NO_ID],
      ['when one entry has a subcategory id that matches nothing', (valid, other) => ({ subcategories: [valid, { categoryId: other.categoryId, subcategoryId: NO_SUBCATEGORY_ID, newTitle: 'Nowhere' }] }), NO_SUBCATEGORY_ID],
      ['when the same subcategory is listed twice', (valid, other) => ({ subcategories: [valid, { ...other, newTitle: 'Once' }, { ...other, newTitle: 'Twice' }] }), null],
    ];
    refused.forEach(([name, parameters, named]) => {
      it(name, async () => {
        const category = await make('batch subcategories unchanged', { subcategories: 'Pizza, Burgers' });
        const [pizza, burgers] = category.subcategories;
        const valid = { categoryId: category.id, subcategoryId: pizza.id, newTitle: 'Pizzas' };
        const other = { categoryId: category.id, subcategoryId: burgers.id };
        const why = await refusal(call('updateSubcategoriesAdvanced', parameters(valid, other)));
        if (named) expect(why).toContain(named);
        expect(titlesOf(await subcategoriesOf(category.title))).toEqual(['Pizza', 'Burgers']);
      });
    });
  });
});

contract.describe('deleteSubcategory', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  describeSubcategoryRemoval('deleteSubcategory', byTitles);
  describeFindingSubcategory('deleteSubcategory', { usage: 'basic', findsSubcategory: true, extra: {} });
});

contract.describe('deleteSubcategoryAdvanced', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  describeSubcategoryRemoval('deleteSubcategoryAdvanced', byIds);
  describeFindingSubcategory('deleteSubcategoryAdvanced', { usage: 'advanced', findsSubcategory: true, extra: {} });
});

contract.describe('deleteSubcategoriesAdvanced', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  it('removes every subcategory for good, keeps the rest, and reports each', async () => {
    const first = await make('batch remove subcategories one', { subcategories: 'Pizza, Burgers, Salads' });
    const second = await make('batch remove subcategories two', { subcategories: 'Coffee' });
    const [pizza, burgers, salads] = first.subcategories;
    const [coffee] = second.subcategories;
    const result = await call('deleteSubcategoriesAdvanced', {
      subcategories: [
        { categoryId: first.id, subcategoryId: pizza.id },
        { categoryId: second.id, subcategoryId: coffee.id },
        { categoryId: first.id, subcategoryId: salads.id },
      ],
    });
    expect(result).toEqual(jasmine.objectContaining({
      subcategories: [
        jasmine.objectContaining({ index: 0, id: pizza.id }),
        jasmine.objectContaining({ index: 1, id: coffee.id }),
        jasmine.objectContaining({ index: 2, id: salads.id }),
      ],
      succeeded: 3,
      failed: 0,
    }));
    expect(result.subcategories.map((entry) => entry.error || null)).toEqual([null, null, null]);
    expect(await subcategoriesOf(first.title)).toEqual([jasmine.objectContaining({ id: burgers.id, title: 'Burgers' })]);
    expect(await listed(second.title)).toEqual(holding(second.id, { subcategories: [] }));
  });

  describe('refuses the whole list, and removes none of it', () => {
    // The first entry is always a valid removal of the category's first subcategory: it must not be made.
    const refused = [
      ['without subcategories', () => ({}), 'subcategories'],
      ['when it is empty', () => ({ subcategories: [] }), 'subcategories'],
      ['when it is not a list', (valid) => ({ subcategories: valid }), 'subcategories'],
      ['when it holds more than 50 entries', (valid) => ({ subcategories: [valid, ...Array.from({ length: 50 }, (value, index) => ({ categoryId: unknownId(index + 1), subcategoryId: NO_SUBCATEGORY_ID }))] }), '50'],
      ['when one entry has no categoryId', (valid, other) => ({ subcategories: [valid, { subcategoryId: other.subcategoryId }] }), 'categoryId'],
      ['when one entry has no subcategoryId', (valid, other) => ({ subcategories: [valid, { categoryId: other.categoryId }] }), 'subcategoryId'],
      ['when one entry has a category id that matches nothing', (valid, other) => ({ subcategories: [valid, { categoryId: NO_ID, subcategoryId: other.subcategoryId }] }), NO_ID],
      ['when one entry has a subcategory id that matches nothing', (valid, other) => ({ subcategories: [valid, { categoryId: other.categoryId, subcategoryId: NO_SUBCATEGORY_ID }] }), NO_SUBCATEGORY_ID],
      ['when the same subcategory is listed twice', (valid) => ({ subcategories: [valid, { ...valid }] }), null],
    ];
    refused.forEach(([name, parameters, named]) => {
      it(name, async () => {
        const category = await make('batch remove refused', { subcategories: 'Pizza, Burgers' });
        const [pizza, burgers] = category.subcategories;
        const why = await refusal(call('deleteSubcategoriesAdvanced', parameters(
          { categoryId: category.id, subcategoryId: pizza.id }, { categoryId: category.id, subcategoryId: burgers.id },
        )));
        if (named) expect(why).toContain(named);
        expect(titlesOf(await subcategoriesOf(category.title))).toEqual(['Pizza', 'Burgers']);
      });
    });
  });
});

contract.describe('updateSubcategoryOrder', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  describeSubcategoryMoves('updateSubcategoryOrder', byTitles);
  describeFindingSubcategory('updateSubcategoryOrder', { usage: 'basic', findsSubcategory: true, extra: { position: 2 } });
});

contract.describe('updateSubcategoryOrderAdvanced', () => {
  beforeEach(answerFireAndForget);
  afterEach(removeMade);

  describeSubcategoryMoves('updateSubcategoryOrderAdvanced', byIds);
  describeFindingSubcategory('updateSubcategoryOrderAdvanced', { usage: 'advanced', findsSubcategory: true, extra: { position: 2 } });
});
