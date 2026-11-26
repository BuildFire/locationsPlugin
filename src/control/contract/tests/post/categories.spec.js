// categories: every operation on categories and the subcategories inside them, one block each, after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// How a call was refused: its code (ContractOperationInvokeError.CODES) and its reason; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => { fail('expected the call to be refused'); return {}; },
  (error) => ({ code: (error && error.code) || 'unknown', reason: reason(error) }));
// What a refusal is expected to be: its code, and a reason naming the text given.
const refused = (code, text) => ({ code, reason: jasmine.stringContaining(text) });
// Each required parameter left out, empty or nothing is refused, naming it, before anything is looked up or written.
const refusesEachRequired = async (operation, valid, names) => {
  for (const name of names) {
    for (const value of [undefined, null, '']) {
      expect(await refusal(call(operation, { ...valid, [name]: value }))).withContext(`${name}: ${value}`).toEqual(refused('validation', name));
    }
  }
};
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}`;

const ICON = 'https://example.com/category-icon.png';
// What the contract's own read finds by that name: each category's details.
const listed = async (title) => (await call('searchCategories', { title })).result.map((record) => ({ ...record.data, id: record.id }));
const create = (label, extra = {}) => call('createCategory', { title: unique(label), ...extra });
const subcategoryTitles = async (title) => (await listed(title))[0].subcategories.map((sub) => sub.title);

// A refresh message to the widget the manifest never mentions, and analytics: the spies only answer.
const answer = (object, method) => {
  if (object && typeof object[method] === 'function') {
    spyOn(object, method).and.callFake((...args) => {
      const callback = args.find((arg) => typeof arg === 'function');
      if (callback) callback(null, {});
    });
  }
};
const quiet = () => {
  answer(buildfire.messaging, 'sendMessageToWidget');
  answer(buildfire.analytics, 'registerEvent');
};

// Only the control panel makes categories, and its run comes first: it makes this one, once, and the app's run finds it.
const forTheApp = 'Post listed category for the app';
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: forTheApp, iconName: 'glyphicon glyphicon-star', subcategories: 'Post first for the app, Post second for the app' })
    : listed(forTheApp).then(([category]) => category || Promise.reject(new Error(`no category named "${forTheApp}": the control run makes it`))));
  return madeCategory;
};

contract.describe('searchCategories', () => {
  beforeEach(quiet);

  it('finds a category by its name, with its subcategories', async () => {
    const { id } = await categoryForTheApp();
    expect(await call('searchCategories', { title: forTheApp })).toEqual(jasmine.objectContaining({
      result: [jasmine.objectContaining({
        id,
        data: jasmine.objectContaining({
          title: forTheApp, iconClassName: 'glyphicon glyphicon-star', subcategories: [jasmine.objectContaining({ title: 'Post first for the app' }), jasmine.objectContaining({ title: 'Post second for the app' })],
        }),
      })],
      totalRecord: 1,
    }));
  });

  it('finds nothing for a name no category has', async () => {
    expect(await call('searchCategories', { title: unique('no such category') })).toEqual(jasmine.objectContaining({ result: [], totalRecord: 0 }));
  });

  it('shows every category, the first 50 by name, when no name is given', async () => {
    await categoryForTheApp();
    const { result, totalRecord } = await call('searchCategories', {});
    expect(totalRecord).toBeGreaterThanOrEqual(1);
    expect(result.length).toBe(Math.min(totalRecord, 50));
    const names = result.map((record) => record.data.title.toLowerCase());
    expect(names).toEqual(names.slice().sort());
  });

  it('shows the page asked for', async () => {
    await categoryForTheApp();
    expect((await call('searchCategories', { title: forTheApp, page: 0 })).result.length).toBe(1);
    expect((await call('searchCategories', { title: forTheApp, page: 1 })).result).toEqual([]);
  });
});

// controlBackground only: the control panel manages categories.
contract.describe('createCategory', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('createCategory', { title: 'Post required' }, ['title']));

  it('adds a category from its name, and returns it', async () => {
    const title = unique('category');
    const made = await call('createCategory', { title });
    expect(made).toEqual({
      id: jasmine.any(String), title, iconUrl: null, iconClassName: null, subcategories: [],
    });
    expect(await listed(title)).toEqual([jasmine.objectContaining({ id: made.id, title, subcategories: [] })]);
  });

  it('adds a category with a picture and its subcategories', async () => {
    const title = unique('with subcategories');
    const made = await call('createCategory', { title, icon: [ICON], subcategories: 'Pizza, Burgers' });
    expect(made).toEqual(jasmine.objectContaining({
      title, iconUrl: ICON, iconClassName: null, subcategories: [jasmine.objectContaining({ id: jasmine.any(String), title: 'Pizza' }), jasmine.objectContaining({ id: jasmine.any(String), title: 'Burgers' })],
    }));
    expect(await subcategoryTitles(title)).toEqual(['Pizza', 'Burgers']);
  });

  it('adds a category with a library icon', async () => {
    const made = await create('font icon', { iconName: 'glyphicon glyphicon-cutlery' });
    expect(made).toEqual(jasmine.objectContaining({ iconUrl: null, iconClassName: 'glyphicon glyphicon-cutlery' }));
  });

  it('still takes a single picture that is not in a list', async () => {
    const made = await create('single icon', { icon: ICON });
    expect((await listed(made.title))[0].iconUrl).toBe(ICON);
  });

  describe('refuses, and adds nothing', () => {
    it('without a name, or with an empty one', async () => {
      expect(await refusal(call('createCategory', {}))).toEqual(refused('validation', 'title'));
      expect(await refusal(call('createCategory', { title: '' }))).toEqual(refused('validation', 'title'));
    });

    it('a picture and a library icon together', async () => {
      const title = unique('both icons');
      expect(await refusal(call('createCategory', { title, icon: [ICON], iconName: 'glyphicon glyphicon-star' }))).toEqual(refused('validation', 'icon'));
      expect(await listed(title)).toEqual([]);
    });

    it('two pictures', async () => {
      const title = unique('two icons');
      expect(await refusal(call('createCategory', { title, icon: [ICON, ICON] }))).toEqual(refused('validation', 'icon'));
      expect(await listed(title)).toEqual([]);
    });
  });
});

contract.describe('createCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('createCategoriesAdvanced', {}, ['categories']));

  it('adds every category, and reports each', async () => {
    const titles = [unique('batch one'), unique('batch two')];
    const result = await call('createCategoriesAdvanced', { categories: [{ title: titles[0] }, { title: titles[1], subcategories: 'One' }] });
    expect(result).toEqual({
      categories: [jasmine.objectContaining({ index: 0, id: jasmine.any(String) }), jasmine.objectContaining({ index: 1, id: jasmine.any(String) })], succeeded: 2, failed: 0,
    });
    expect(await listed(titles[0])).toEqual([jasmine.objectContaining({ id: result.categories[0].id })]);
    expect(await subcategoryTitles(titles[1])).toEqual(['One']);
  });

  describe('refuses the whole list, and adds none of it', () => {
    it('when one entry is invalid', async () => {
      const valid = unique('valid entry');
      expect(await refusal(call('createCategoriesAdvanced', { categories: [{ title: valid }, { title: '' }] }))).toEqual(refused('validation', 'title'));
      expect(await listed(valid)).toEqual([]);
    });

    it('when it is empty, or holds more than 50 entries', async () => {
      expect(await refusal(call('createCategoriesAdvanced', { categories: [] }))).toEqual(refused('validation', 'categories'));
      const categories = Array.from({ length: 51 }, (value, index) => ({ title: unique(`entry ${index}`) }));
      expect(await refusal(call('createCategoriesAdvanced', { categories }))).toEqual(refused('validation', 'categories'));
      expect(await listed(categories[0].title)).toEqual([]);
    });
  });
});

contract.describe('updateCategory', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateCategory', { title: 'Post required', newIconName: 'x' }, ['title']));

  it('renames a category found by its name, and returns it', async () => {
    const made = await create('rename');
    const newTitle = `${made.title} renamed`;
    expect(await call('updateCategory', { title: made.title, newTitle })).toEqual(jasmine.objectContaining({ id: made.id, title: newTitle }));
    expect(await listed(made.title)).toEqual([]);
    expect(await listed(newTitle)).toEqual([jasmine.objectContaining({ id: made.id })]);
  });

  it('swaps its picture for a library icon, and removes it', async () => {
    const made = await create('icon swap', { icon: [ICON] });
    expect(await call('updateCategory', { title: made.title, newIconName: 'glyphicon glyphicon-star' })).toEqual(jasmine.objectContaining({ iconUrl: null, iconClassName: 'glyphicon glyphicon-star' }));
    expect(await call('updateCategory', { title: made.title, newIcon: [ICON] })).toEqual(jasmine.objectContaining({ iconUrl: ICON, iconClassName: null }));
    expect(await call('updateCategory', { title: made.title, newIcon: null })).toEqual(jasmine.objectContaining({ iconUrl: null, iconClassName: null }));
    expect(await listed(made.title)).toEqual([jasmine.objectContaining({ iconUrl: null, iconClassName: null })]);
  });

  it('keeps its subcategories', async () => {
    const made = await create('keeps subcategories', { subcategories: 'Kept' });
    await call('updateCategory', { title: made.title, newIconName: 'glyphicon glyphicon-heart' });
    expect(await subcategoryTitles(made.title)).toEqual(['Kept']);
  });

  describe('refuses, and changes nothing', () => {
    it('a name no category has', async () => {
      const title = unique('missing');
      expect(await refusal(call('updateCategory', { title, newIconName: 'x' }))).toEqual(refused('notFound', title));
    });

    it('a name two categories share, saying how many', async () => {
      const title = unique('shared');
      await call('createCategory', { title });
      await call('createCategory', { title });
      const { code, reason: why } = await refusal(call('updateCategory', { title, newIconName: 'glyphicon glyphicon-star' }));
      expect(code).toBe('conflict');
      expect(why.replace(title, '')).toContain('2');
      expect((await listed(title)).map((category) => category.iconClassName)).toEqual([null, null]);
    });

    it('removing the name', async () => {
      const made = await create('keep name');
      expect(await refusal(call('updateCategory', { title: made.title, newTitle: null }))).toEqual(refused('validation', 'newTitle'));
      expect(await listed(made.title)).toEqual([jasmine.objectContaining({ id: made.id })]);
    });

    it('a call that changes nothing, or names nothing', async () => {
      const made = await create('nothing');
      expect((await refusal(call('updateCategory', { title: made.title }))).code).toBe('validation');
      expect(await refusal(call('updateCategory', { newTitle: 'x' }))).toEqual(refused('validation', 'title'));
    });
  });
});

contract.describe('updateCategoryAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateCategoryAdvanced', { categoryId: '000000000000000000000000', newIconName: 'x' }, ['categoryId']));

  it('changes the category with that id', async () => {
    const made = await create('update by id');
    expect(await call('updateCategoryAdvanced', { categoryId: made.id, newIcon: [ICON] })).toEqual(jasmine.objectContaining({ id: made.id, iconUrl: ICON }));
    expect(await listed(made.title)).toEqual([jasmine.objectContaining({ iconUrl: ICON })]);
  });

  it('refuses an id no category has, or one that was removed', async () => {
    expect(await refusal(call('updateCategoryAdvanced', { categoryId: '000000000000000000000000', newTitle: 'x' }))).toEqual(refused('notFound', '000000000000000000000000'));
    const made = await create('removed');
    await call('deleteCategoryAdvanced', { categoryId: made.id });
    expect(await refusal(call('updateCategoryAdvanced', { categoryId: made.id, newTitle: 'x' }))).toEqual(refused('notFound', made.id));
  });

  it('refuses without an id', async () => {
    expect(await refusal(call('updateCategoryAdvanced', { newTitle: 'x' }))).toEqual(refused('validation', 'categoryId'));
  });
});

contract.describe('updateCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateCategoriesAdvanced', {}, ['categories']));

  it('changes every category, and reports each', async () => {
    const one = await create('batch update one');
    const two = await create('batch update two');
    expect(await call('updateCategoriesAdvanced', { categories: [{ categoryId: one.id, newIconName: 'glyphicon glyphicon-star' }, { categoryId: two.id, newTitle: `${two.title} renamed` }] })).toEqual({
      categories: [jasmine.objectContaining({ index: 0, id: one.id }), jasmine.objectContaining({ index: 1, id: two.id })], succeeded: 2, failed: 0,
    });
    expect(await listed(one.title)).toEqual([jasmine.objectContaining({ iconClassName: 'glyphicon glyphicon-star' })]);
    expect(await listed(`${two.title} renamed`)).toEqual([jasmine.objectContaining({ id: two.id })]);
  });

  describe('refuses the whole list, and changes none of it', () => {
    it('when one id matches no category', async () => {
      const made = await create('batch unknown');
      expect(await refusal(call('updateCategoriesAdvanced', { categories: [{ categoryId: made.id, newIconName: 'x' }, { categoryId: '000000000000000000000000', newIconName: 'x' }] }))).toEqual(refused('notFound', '000000000000000000000000'));
      expect(await listed(made.title)).toEqual([jasmine.objectContaining({ iconClassName: null })]);
    });

    it('when the same category is listed twice', async () => {
      const made = await create('batch twice');
      expect((await refusal(call('updateCategoriesAdvanced', { categories: [{ categoryId: made.id, newIconName: 'x' }, { categoryId: made.id, newIconName: 'y' }] }))).code).toBe('validation');
      expect(await listed(made.title)).toEqual([jasmine.objectContaining({ iconClassName: null })]);
    });

    it('when one entry changes nothing, or the list is empty', async () => {
      const made = await create('batch invalid');
      expect(await refusal(call('updateCategoriesAdvanced', { categories: [{ categoryId: made.id }] }))).toEqual(refused('validation', 'entry 0'));
      expect(await refusal(call('updateCategoriesAdvanced', { categories: [] }))).toEqual(refused('validation', 'categories'));
    });
  });
});

contract.describe('deleteCategory', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('deleteCategory', { title: 'Post required' }, ['title']));

  it('removes a category found by its name from the app', async () => {
    const made = await create('delete');
    expect(await call('deleteCategory', { title: made.title })).toEqual({ id: made.id, title: made.title });
    expect(await listed(made.title)).toEqual([]);
  });

  it('refuses a name no category has, including one already removed', async () => {
    const made = await create('delete twice');
    await call('deleteCategory', { title: made.title });
    expect(await refusal(call('deleteCategory', { title: made.title }))).toEqual(refused('notFound', made.title));
  });

  it('refuses a name two categories share, and removes neither', async () => {
    const title = unique('shared delete');
    await call('createCategory', { title });
    await call('createCategory', { title });
    expect((await refusal(call('deleteCategory', { title }))).code).toBe('conflict');
    expect((await listed(title)).length).toBe(2);
  });

  it('refuses without a name', async () => {
    expect(await refusal(call('deleteCategory', {}))).toEqual(refused('validation', 'title'));
  });
});

contract.describe('deleteCategoryAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('deleteCategoryAdvanced', { categoryId: '000000000000000000000000' }, ['categoryId']));

  it('removes the category with that id from the app', async () => {
    const made = await create('delete by id');
    expect(await call('deleteCategoryAdvanced', { categoryId: made.id })).toEqual({ id: made.id, title: made.title });
    expect(await listed(made.title)).toEqual([]);
  });

  it('refuses an id no category has, or one already removed', async () => {
    expect(await refusal(call('deleteCategoryAdvanced', { categoryId: '000000000000000000000000' }))).toEqual(refused('notFound', '000000000000000000000000'));
    const made = await create('removed by id');
    await call('deleteCategoryAdvanced', { categoryId: made.id });
    expect(await refusal(call('deleteCategoryAdvanced', { categoryId: made.id }))).toEqual(refused('notFound', made.id));
  });

  it('refuses without an id', async () => {
    expect(await refusal(call('deleteCategoryAdvanced', {}))).toEqual(refused('validation', 'categoryId'));
  });
});

contract.describe('deleteCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('deleteCategoriesAdvanced', {}, ['categories']));

  it('removes every category, and reports each', async () => {
    const one = await create('batch delete one');
    const two = await create('batch delete two');
    expect(await call('deleteCategoriesAdvanced', { categories: [{ categoryId: one.id }, { categoryId: two.id }] })).toEqual({
      categories: [jasmine.objectContaining({ index: 0, id: one.id }), jasmine.objectContaining({ index: 1, id: two.id })], succeeded: 2, failed: 0,
    });
    expect(await listed(one.title)).toEqual([]);
    expect(await listed(two.title)).toEqual([]);
  });

  describe('refuses the whole list, and removes none of it', () => {
    it('when one id matches no category', async () => {
      const made = await create('batch delete unknown');
      expect(await refusal(call('deleteCategoriesAdvanced', { categories: [{ categoryId: made.id }, { categoryId: '000000000000000000000000' }] }))).toEqual(refused('notFound', '000000000000000000000000'));
      expect(await listed(made.title)).toEqual([jasmine.objectContaining({ id: made.id })]);
    });

    it('when the same category is listed twice, or the list is empty', async () => {
      const made = await create('batch delete twice');
      expect((await refusal(call('deleteCategoriesAdvanced', { categories: [{ categoryId: made.id }, { categoryId: made.id }] }))).code).toBe('validation');
      expect(await listed(made.title)).toEqual([jasmine.objectContaining({ id: made.id })]);
      expect(await refusal(call('deleteCategoriesAdvanced', { categories: [] }))).toEqual(refused('validation', 'categories'));
    });
  });
});

contract.describe('createSubcategory', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('createSubcategory', { category: 'Post required', title: 'Post required' }, ['category', 'title']));

  it('adds a subcategory to the end of a category found by its name', async () => {
    const made = await create('parent', { subcategories: 'First' });
    expect(await call('createSubcategory', { category: made.title, title: 'Second' })).toEqual({
      id: jasmine.any(String), title: 'Second', iconUrl: null, iconClassName: null, categoryId: made.id, categoryTitle: made.title,
    });
    expect(await subcategoryTitles(made.title)).toEqual(['First', 'Second']);
  });

  it('adds one with a picture, or with a library icon', async () => {
    const made = await create('parent icons');
    expect(await call('createSubcategory', { category: made.title, title: 'Pictured', icon: [ICON] })).toEqual(jasmine.objectContaining({ iconUrl: ICON, iconClassName: null }));
    expect(await call('createSubcategory', { category: made.title, title: 'Iconed', iconName: 'glyphicon glyphicon-star' })).toEqual(jasmine.objectContaining({ iconUrl: null, iconClassName: 'glyphicon glyphicon-star' }));
  });

  describe('refuses, and adds nothing', () => {
    it('a category no category has', async () => {
      const category = unique('missing');
      expect(await refusal(call('createSubcategory', { category, title: 'Lost' }))).toEqual(refused('notFound', category));
    });

    it('a category name two categories share', async () => {
      const title = unique('shared parent');
      await call('createCategory', { title });
      await call('createCategory', { title });
      expect((await refusal(call('createSubcategory', { category: title, title: 'Lost' }))).code).toBe('conflict');
    });

    it('without a name, or without its category', async () => {
      const made = await create('parent no name');
      expect(await refusal(call('createSubcategory', { category: made.title }))).toEqual(refused('validation', 'title'));
      expect(await refusal(call('createSubcategory', { title: 'Lost' }))).toEqual(refused('validation', 'category'));
      expect(await subcategoryTitles(made.title)).toEqual([]);
    });
  });
});

contract.describe('createSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('createSubcategoryAdvanced', { categoryId: '000000000000000000000000', title: 'Post required' }, ['categoryId', 'title']));

  it('adds a subcategory to the category with that id', async () => {
    const made = await create('parent by id');
    expect(await call('createSubcategoryAdvanced', { categoryId: made.id, title: 'By id' })).toEqual(jasmine.objectContaining({ title: 'By id', categoryId: made.id }));
    expect(await subcategoryTitles(made.title)).toEqual(['By id']);
  });

  it('refuses an id no category has', async () => {
    expect(await refusal(call('createSubcategoryAdvanced', { categoryId: '000000000000000000000000', title: 'Lost' }))).toEqual(refused('notFound', '000000000000000000000000'));
  });

  it('refuses without an id or a name', async () => {
    expect(await refusal(call('createSubcategoryAdvanced', { title: 'Lost' }))).toEqual(refused('validation', 'categoryId'));
    expect(await refusal(call('createSubcategoryAdvanced', { categoryId: '000000000000000000000000' }))).toEqual(refused('validation', 'title'));
  });
});

contract.describe('createSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('createSubcategoriesAdvanced', {}, ['subcategories']));

  it('adds every subcategory, in order, and reports each', async () => {
    const made = await create('batch parent');
    const result = await call('createSubcategoriesAdvanced', { subcategories: [{ categoryId: made.id, title: 'One' }, { categoryId: made.id, title: 'Two' }] });
    expect(result).toEqual({
      subcategories: [jasmine.objectContaining({ index: 0, id: jasmine.any(String) }), jasmine.objectContaining({ index: 1, id: jasmine.any(String) })], succeeded: 2, failed: 0,
    });
    expect(await subcategoryTitles(made.title)).toEqual(['One', 'Two']);
  });

  describe('refuses the whole list, and adds none of it', () => {
    it('when one id matches no category', async () => {
      const made = await create('batch parent unknown');
      expect(await refusal(call('createSubcategoriesAdvanced', { subcategories: [{ categoryId: made.id, title: 'One' }, { categoryId: '000000000000000000000000', title: 'Two' }] }))).toEqual(refused('notFound', '000000000000000000000000'));
      expect(await subcategoryTitles(made.title)).toEqual([]);
    });

    it('when one entry has no name, or the list is empty', async () => {
      const made = await create('batch parent invalid');
      expect(await refusal(call('createSubcategoriesAdvanced', { subcategories: [{ categoryId: made.id, title: 'One' }, { categoryId: made.id }] }))).toEqual(refused('validation', 'title'));
      expect(await subcategoryTitles(made.title)).toEqual([]);
      expect(await refusal(call('createSubcategoriesAdvanced', { subcategories: [] }))).toEqual(refused('validation', 'subcategories'));
    });
  });
});

contract.describe('updateSubcategory', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateSubcategory', { category: 'Post required', title: 'Post required', newTitle: 'x' }, ['category', 'title']));

  it("renames a subcategory found by its category's name and its own", async () => {
    const made = await create('rename sub', { subcategories: 'Old, Other' });
    expect(await call('updateSubcategory', { category: made.title, title: 'Old', newTitle: 'New' })).toEqual(jasmine.objectContaining({ title: 'New', categoryId: made.id, categoryTitle: made.title }));
    expect(await subcategoryTitles(made.title)).toEqual(['New', 'Other']);
  });

  it('sets its picture, and removes it', async () => {
    const made = await create('sub icon', { subcategories: 'Pictured' });
    expect(await call('updateSubcategory', { category: made.title, title: 'Pictured', newIcon: [ICON] })).toEqual(jasmine.objectContaining({ iconUrl: ICON, iconClassName: null }));
    expect(await call('updateSubcategory', { category: made.title, title: 'Pictured', newIcon: [] })).toEqual(jasmine.objectContaining({ iconUrl: null }));
  });

  describe('refuses, and changes nothing', () => {
    it('a subcategory its category does not have', async () => {
      const made = await create('sub missing', { subcategories: 'Here' });
      expect(await refusal(call('updateSubcategory', { category: made.title, title: 'Elsewhere', newTitle: 'x' }))).toEqual(refused('notFound', 'Elsewhere'));
    });

    it('a name two of its subcategories share', async () => {
      const made = await create('sub shared', { subcategories: 'Twin, Twin' });
      expect((await refusal(call('updateSubcategory', { category: made.title, title: 'Twin', newTitle: 'x' }))).code).toBe('conflict');
      expect(await subcategoryTitles(made.title)).toEqual(['Twin', 'Twin']);
    });

    it('a category no category has', async () => {
      const category = unique('missing');
      expect(await refusal(call('updateSubcategory', { category, title: 'Here', newTitle: 'x' }))).toEqual(refused('notFound', category));
    });

    it('removing its name, or a call that changes nothing', async () => {
      const made = await create('sub keep', { subcategories: 'Kept' });
      expect(await refusal(call('updateSubcategory', { category: made.title, title: 'Kept', newTitle: null }))).toEqual(refused('validation', 'newTitle'));
      expect((await refusal(call('updateSubcategory', { category: made.title, title: 'Kept' }))).code).toBe('validation');
      expect(await subcategoryTitles(made.title)).toEqual(['Kept']);
    });
  });
});

contract.describe('updateSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateSubcategoryAdvanced', { categoryId: '000000000000000000000000', subcategoryId: 'x', newTitle: 'x' }, ['categoryId', 'subcategoryId']));

  it('changes the subcategory with that id', async () => {
    const made = await create('sub by id', { subcategories: 'Before' });
    const [sub] = made.subcategories;
    expect(await call('updateSubcategoryAdvanced', { categoryId: made.id, subcategoryId: sub.id, newTitle: 'After' })).toEqual(jasmine.objectContaining({ id: sub.id, title: 'After' }));
    expect(await subcategoryTitles(made.title)).toEqual(['After']);
  });

  it('refuses ids no category or subcategory has', async () => {
    const made = await create('sub unknown id', { subcategories: 'Here' });
    expect(await refusal(call('updateSubcategoryAdvanced', { categoryId: '000000000000000000000000', subcategoryId: made.subcategories[0].id, newTitle: 'x' }))).toEqual(refused('notFound', '000000000000000000000000'));
    expect(await refusal(call('updateSubcategoryAdvanced', { categoryId: made.id, subcategoryId: 'no-such-subcategory', newTitle: 'x' }))).toEqual(refused('notFound', 'no-such-subcategory'));
  });

  it('refuses without the ids', async () => {
    expect(await refusal(call('updateSubcategoryAdvanced', { subcategoryId: 'x', newTitle: 'x' }))).toEqual(refused('validation', 'categoryId'));
    expect(await refusal(call('updateSubcategoryAdvanced', { categoryId: 'x', newTitle: 'x' }))).toEqual(refused('validation', 'subcategoryId'));
  });
});

contract.describe('updateSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateSubcategoriesAdvanced', {}, ['subcategories']));

  it('changes every subcategory, and reports each', async () => {
    const made = await create('batch sub update', { subcategories: 'A, B' });
    const [a, b] = made.subcategories;
    expect(await call('updateSubcategoriesAdvanced', { subcategories: [{ categoryId: made.id, subcategoryId: a.id, newTitle: 'A2' }, { categoryId: made.id, subcategoryId: b.id, newIconName: 'glyphicon glyphicon-star' }] })).toEqual({
      subcategories: [jasmine.objectContaining({ index: 0, id: a.id }), jasmine.objectContaining({ index: 1, id: b.id })], succeeded: 2, failed: 0,
    });
    expect((await listed(made.title))[0].subcategories).toEqual([jasmine.objectContaining({ title: 'A2' }), jasmine.objectContaining({ title: 'B', iconClassName: 'glyphicon glyphicon-star' })]);
  });

  describe('refuses the whole list, and changes none of it', () => {
    it('when one id matches nothing', async () => {
      const made = await create('batch sub unknown', { subcategories: 'A' });
      expect(await refusal(call('updateSubcategoriesAdvanced', { subcategories: [{ categoryId: made.id, subcategoryId: made.subcategories[0].id, newTitle: 'x' }, { categoryId: made.id, subcategoryId: 'no-such-subcategory', newTitle: 'y' }] }))).toEqual(refused('notFound', 'no-such-subcategory'));
      expect(await subcategoryTitles(made.title)).toEqual(['A']);
    });

    it('when the same subcategory is listed twice, or the list is empty', async () => {
      const made = await create('batch sub twice', { subcategories: 'A' });
      const entry = { categoryId: made.id, subcategoryId: made.subcategories[0].id, newTitle: 'x' };
      expect((await refusal(call('updateSubcategoriesAdvanced', { subcategories: [entry, entry] }))).code).toBe('validation');
      expect(await subcategoryTitles(made.title)).toEqual(['A']);
      expect(await refusal(call('updateSubcategoriesAdvanced', { subcategories: [] }))).toEqual(refused('validation', 'subcategories'));
    });
  });
});

contract.describe('deleteSubcategory', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('deleteSubcategory', { category: 'Post required', title: 'Post required' }, ['category', 'title']));

  it("removes a subcategory found by its category's name and its own", async () => {
    const made = await create('delete sub', { subcategories: 'Gone, Stays' });
    expect(await call('deleteSubcategory', { category: made.title, title: 'Gone' })).toEqual({
      id: made.subcategories[0].id, title: 'Gone', categoryId: made.id, categoryTitle: made.title,
    });
    expect(await subcategoryTitles(made.title)).toEqual(['Stays']);
  });

  it('refuses a subcategory its category does not have, and removes nothing', async () => {
    const made = await create('delete sub missing', { subcategories: 'Here' });
    expect(await refusal(call('deleteSubcategory', { category: made.title, title: 'Elsewhere' }))).toEqual(refused('notFound', 'Elsewhere'));
    expect(await subcategoryTitles(made.title)).toEqual(['Here']);
  });

  it('refuses a name two of its subcategories share', async () => {
    const made = await create('delete sub shared', { subcategories: 'Twin, Twin' });
    expect((await refusal(call('deleteSubcategory', { category: made.title, title: 'Twin' }))).code).toBe('conflict');
    expect(await subcategoryTitles(made.title)).toEqual(['Twin', 'Twin']);
  });

  it('refuses without its name or its category', async () => {
    expect(await refusal(call('deleteSubcategory', { title: 'x' }))).toEqual(refused('validation', 'category'));
    expect(await refusal(call('deleteSubcategory', { category: 'x' }))).toEqual(refused('validation', 'title'));
  });
});

contract.describe('deleteSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('deleteSubcategoryAdvanced', { categoryId: '000000000000000000000000', subcategoryId: 'x' }, ['categoryId', 'subcategoryId']));

  it('removes the subcategory with that id', async () => {
    const made = await create('delete sub by id', { subcategories: 'Gone' });
    expect(await call('deleteSubcategoryAdvanced', { categoryId: made.id, subcategoryId: made.subcategories[0].id })).toEqual(jasmine.objectContaining({ id: made.subcategories[0].id, title: 'Gone' }));
    expect(await subcategoryTitles(made.title)).toEqual([]);
  });

  it('refuses ids no category or subcategory has', async () => {
    const made = await create('delete sub unknown', { subcategories: 'Here' });
    expect(await refusal(call('deleteSubcategoryAdvanced', { categoryId: '000000000000000000000000', subcategoryId: made.subcategories[0].id }))).toEqual(refused('notFound', '000000000000000000000000'));
    expect(await refusal(call('deleteSubcategoryAdvanced', { categoryId: made.id, subcategoryId: 'no-such-subcategory' }))).toEqual(refused('notFound', 'no-such-subcategory'));
    expect(await subcategoryTitles(made.title)).toEqual(['Here']);
  });

  it('refuses without the ids', async () => {
    expect(await refusal(call('deleteSubcategoryAdvanced', { subcategoryId: 'x' }))).toEqual(refused('validation', 'categoryId'));
  });
});

contract.describe('deleteSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('deleteSubcategoriesAdvanced', {}, ['subcategories']));

  it('removes every subcategory, and reports each', async () => {
    const made = await create('batch sub delete', { subcategories: 'A, B, C' });
    const [a, b] = made.subcategories;
    expect(await call('deleteSubcategoriesAdvanced', { subcategories: [{ categoryId: made.id, subcategoryId: a.id }, { categoryId: made.id, subcategoryId: b.id }] })).toEqual({
      subcategories: [jasmine.objectContaining({ index: 0, id: a.id }), jasmine.objectContaining({ index: 1, id: b.id })], succeeded: 2, failed: 0,
    });
    expect(await subcategoryTitles(made.title)).toEqual(['C']);
  });

  describe('refuses the whole list, and removes none of it', () => {
    it('when one id matches nothing', async () => {
      const made = await create('batch sub delete unknown', { subcategories: 'A' });
      expect(await refusal(call('deleteSubcategoriesAdvanced', { subcategories: [{ categoryId: made.id, subcategoryId: made.subcategories[0].id }, { categoryId: '000000000000000000000000', subcategoryId: 'x' }] }))).toEqual(refused('notFound', '000000000000000000000000'));
      expect(await subcategoryTitles(made.title)).toEqual(['A']);
    });

    it('when the same subcategory is listed twice, or the list is empty', async () => {
      const made = await create('batch sub delete twice', { subcategories: 'A' });
      const entry = { categoryId: made.id, subcategoryId: made.subcategories[0].id };
      expect((await refusal(call('deleteSubcategoriesAdvanced', { subcategories: [entry, entry] }))).code).toBe('validation');
      expect(await subcategoryTitles(made.title)).toEqual(['A']);
      expect(await refusal(call('deleteSubcategoriesAdvanced', { subcategories: [] }))).toEqual(refused('validation', 'subcategories'));
    });
  });
});

contract.describe('updateSubcategoryOrder', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateSubcategoryOrder', { category: 'Post required', title: 'Post required', position: 1 }, ['category', 'title', 'position']));

  it("moves a subcategory to another place in its category's list", async () => {
    const made = await create('order', { subcategories: 'One, Two, Three' });
    const result = await call('updateSubcategoryOrder', { category: made.title, title: 'Three', position: 1 });
    expect(result).toEqual(jasmine.objectContaining({ id: made.id, subcategories: [jasmine.objectContaining({ title: 'Three' }), jasmine.objectContaining({ title: 'One' }), jasmine.objectContaining({ title: 'Two' })] }));
    expect(await subcategoryTitles(made.title)).toEqual(['Three', 'One', 'Two']);
  });

  describe('refuses, and moves nothing', () => {
    it('a place past the end of the list', async () => {
      const made = await create('order past end', { subcategories: 'One, Two' });
      expect(await refusal(call('updateSubcategoryOrder', { category: made.title, title: 'One', position: 3 }))).toEqual(refused('validation', 'position'));
      expect(await refusal(call('updateSubcategoryOrder', { category: made.title, title: 'One', position: 0 }))).toEqual(refused('validation', 'position'));
      expect(await refusal(call('updateSubcategoryOrder', { category: made.title, title: 'One', position: 1.5 }))).toEqual(refused('validation', 'position'));
      expect(await subcategoryTitles(made.title)).toEqual(['One', 'Two']);
    });

    it('a subcategory its category does not have', async () => {
      const made = await create('order missing', { subcategories: 'One' });
      expect(await refusal(call('updateSubcategoryOrder', { category: made.title, title: 'Elsewhere', position: 1 }))).toEqual(refused('notFound', 'Elsewhere'));
    });

    it('without a place', async () => {
      const made = await create('order no place', { subcategories: 'One' });
      expect(await refusal(call('updateSubcategoryOrder', { category: made.title, title: 'One' }))).toEqual(refused('validation', 'position'));
    });
  });
});

contract.describe('updateSubcategoryOrderAdvanced', () => {
  beforeEach(quiet);

  it('refuses each required detail left out, empty or nothing, naming it', () => refusesEachRequired('updateSubcategoryOrderAdvanced', { categoryId: '000000000000000000000000', subcategoryId: 'x', position: 1 }, ['categoryId', 'subcategoryId', 'position']));

  it('moves the subcategory with that id', async () => {
    const made = await create('order by id', { subcategories: 'One, Two' });
    await call('updateSubcategoryOrderAdvanced', { categoryId: made.id, subcategoryId: made.subcategories[1].id, position: 1 });
    expect(await subcategoryTitles(made.title)).toEqual(['Two', 'One']);
  });

  it('refuses ids no category or subcategory has', async () => {
    const made = await create('order unknown', { subcategories: 'One' });
    expect(await refusal(call('updateSubcategoryOrderAdvanced', { categoryId: '000000000000000000000000', subcategoryId: made.subcategories[0].id, position: 1 }))).toEqual(refused('notFound', '000000000000000000000000'));
    expect(await refusal(call('updateSubcategoryOrderAdvanced', { categoryId: made.id, subcategoryId: 'no-such-subcategory', position: 1 }))).toEqual(refused('notFound', 'no-such-subcategory'));
  });

  it('refuses without the ids', async () => {
    expect(await refusal(call('updateSubcategoryOrderAdvanced', { subcategoryId: 'x', position: 1 }))).toEqual(refused('validation', 'categoryId'));
  });
});
