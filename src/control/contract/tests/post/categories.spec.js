// categories: every operation on categories and their subcategories, one block each, after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}`;
// What the contract's own list finds by that exact title, each with its id beside its details.
const listed = async (title) => (await call('listCategories', { title })).result.map((record) => ({ id: record.id, ...record.data }));
// A category with these subcategories, made through the contract.
const categoryWith = async (title, subcategories = []) => {
  const category = await call('createCategory', { title });
  for (const sub of subcategories) await call('createSubcategory', { categoryTitle: title, title: sub });
  return category;
};
const subTitles = async (title) => (await listed(title))[0].subcategories.map((sub) => sub.title);

// Calls nothing here answers: the widget refresh and analytics answer through spies.
const quiet = () => {
  if (buildfire.messaging && typeof buildfire.messaging.sendMessageToWidget === 'function') spyOn(buildfire.messaging, 'sendMessageToWidget');
  if (buildfire.analytics && typeof buildfire.analytics.registerEvent === 'function') spyOn(buildfire.analytics, 'registerEvent');
};

// Only the control panel makes categories, and its run comes first: it makes this one, once, and the app's run finds it.
const forTheApp = 'Post category for the app';
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? categoryWith(forTheApp, ['Gardens'])
    : call('listCategories', { title: forTheApp }).then(({ result: [record] }) => record || Promise.reject(new Error(`no category titled "${forTheApp}": the control run makes it`))));
  return madeCategory;
};

contract.describe('listCategories', () => {
  beforeEach(quiet);

  it('finds the category with that title, with its subcategories', async () => {
    await categoryForTheApp();
    const { result, totalRecord } = await call('listCategories', { title: forTheApp });
    expect(totalRecord).toBe(1);
    expect(result).toEqual([jasmine.objectContaining({
      id: jasmine.any(String),
      data: jasmine.objectContaining({ title: forTheApp, subcategories: [jasmine.objectContaining({ id: jasmine.any(String), title: 'Gardens' })] })
    })]);
  });

  it('finds nothing for a title no category has', async () => {
    expect(await call('listCategories', { title: unique('no such category') })).toEqual(jasmine.objectContaining({ result: [], totalRecord: 0 }));
  });

  it('shows every category when no title is given, 50 a page, A to Z', async () => {
    if (contract.host === 'control') {
      // More categories than a page, made through the contract's batch operation within its limit, given the time that takes.
      const stamp = Date.now();
      const many = Array.from({ length: 51 }, (value, index) => ({ title: `Post page category ${String(index).padStart(2, '0')} ${stamp}` }));
      expect(await call('createCategoriesAdvanced', { categories: many.slice(0, 50) })).toEqual(jasmine.objectContaining({ succeeded: 50 }));
      expect(await call('createCategoriesAdvanced', { categories: many.slice(50) })).toEqual(jasmine.objectContaining({ succeeded: 1 }));
    }
    const first = await call('listCategories', {});
    expect(first.totalRecord).toBeGreaterThan(50);
    expect(first.result.length).toBe(50);
    const titles = first.result.map((record) => record.data.title.toLowerCase());
    expect(titles).toEqual(titles.slice().sort());
    const second = await call('listCategories', { page: 1 });
    expect(second.result.length).toBe(Math.min(50, first.totalRecord - 50));
    expect(second.result.map((record) => record.id)).not.toContain(first.result[0].id);
  }, 300000);

  describe("the previous contract's data", () => {
    // Only the control panel makes categories, so the previous pre specs made these on the control, and both sides read them.
    it('still finds the categories the previous pre specs added, with their subcategories and icons', async () => {
      expect(await listed('Pre category for the app')).toEqual([jasmine.objectContaining({
        id: jasmine.any(String), title: 'Pre category for the app', subcategories: [jasmine.objectContaining({ id: jasmine.any(String), title: 'Pre gardens' })]
      })]);
      expect(await listed('Pre category (control)')).toEqual([jasmine.objectContaining({ title: 'Pre category (control)', subcategories: [] })]);
      expect(await subTitles('Pre category with subcategories (control)')).toEqual(['Pre gardens']);
      expect(await listed('Pre category to re-icon (control)')).toEqual([jasmine.objectContaining({ iconUrl: null, iconClassName: 'glyphicon glyphicon-leaf' })]);
    });

    it('no longer shows the categories the previous pre specs deleted', async () => {
      expect(await listed('Pre category to delete (control)')).toEqual([]);
      expect(await listed('Pre categories to delete one (control)')).toEqual([]);
    });
  });
});

// controlBackground only, like every category write below: only the control panel manages categories.
contract.describe('createCategory', () => {
  beforeEach(quiet);

  it('adds a category from its title, and returns it', async () => {
    const title = unique('category');
    const created = await call('createCategory', { title });
    expect(created).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title, subcategories: [], iconUrl: null, iconClassName: null }));
    expect(await listed(title)).toEqual([jasmine.objectContaining({ id: created.id, title })]);
  });

  it('keeps an icon picture as one address, or an icon from the library', async () => {
    const pictured = unique('pictured');
    expect(await call('createCategory', { title: pictured, icon: ['https://example.com/icon.png'] })).toEqual(jasmine.objectContaining({ iconUrl: 'https://example.com/icon.png', iconClassName: null }));
    const libraryIcon = unique('library icon');
    await call('createCategory', { title: libraryIcon, iconClassName: 'glyphicon glyphicon-leaf' });
    expect(await listed(libraryIcon)).toEqual([jasmine.objectContaining({ iconUrl: null, iconClassName: 'glyphicon glyphicon-leaf' })]);
  });

  describe('refuses, and stores nothing', () => {
    it('without a title', async () => {
      expect(await refusal(call('createCategory', {}))).toContain('title');
      expect(await refusal(call('createCategory', { title: '' }))).toContain('title');
      expect(await refusal(call('createCategory', { title: null }))).toContain('title');
    });

    it('an icon that is not a list, or both kinds of icon', async () => {
      const bare = unique('bare icon');
      expect(await refusal(call('createCategory', { title: bare, icon: 'https://example.com/icon.png' }))).toContain('icon');
      const both = unique('both icons');
      expect(await refusal(call('createCategory', { title: both, icon: ['https://example.com/icon.png'], iconClassName: 'glyphicon glyphicon-leaf' }))).toContain('iconClassName');
      expect(await listed(bare)).toEqual([]);
      expect(await listed(both)).toEqual([]);
    });
  });
});

contract.describe('createCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('adds every category and reports each', async () => {
    const titles = [unique('batch one'), unique('batch two')];
    const result = await call('createCategoriesAdvanced', { categories: titles.map((title) => ({ title })) });
    expect(result).toEqual(jasmine.objectContaining({
      categories: [jasmine.objectContaining({ index: 0, id: jasmine.any(String), error: null }), jasmine.objectContaining({ index: 1, id: jasmine.any(String), error: null })],
      succeeded: 2,
      failed: 0
    }));
    for (const title of titles) expect(await listed(title)).toEqual([jasmine.objectContaining({ title })]);
  });

  describe('refuses the whole list, and writes none of it', () => {
    it('when one entry is invalid', async () => {
      const valid = unique('valid entry');
      expect(await refusal(call('createCategoriesAdvanced', { categories: [{ title: valid }, { title: '' }] }))).toContain('title');
      expect(await listed(valid)).toEqual([]);
    });

    it('when it is empty, or holds more than 50 entries', async () => {
      await expectAsync(call('createCategoriesAdvanced', { categories: [] })).toBeRejected();
      const categories = Array.from({ length: 51 }, (value, index) => ({ title: unique(`entry ${index}`) }));
      await expectAsync(call('createCategoriesAdvanced', { categories })).toBeRejected();
      expect(await listed(categories[0].title)).toEqual([]);
    });
  });
});

contract.describe('updateCategory', () => {
  beforeEach(quiet);

  it('renames the category, keeping its subcategories', async () => {
    const title = unique('rename');
    const created = await categoryWith(title, ['Gardens']);
    expect(await call('updateCategory', { title, newTitle: `${title} renamed` })).toEqual(jasmine.objectContaining({ id: created.id, title: `${title} renamed` }));
    expect(await listed(title)).toEqual([]);
    expect(await subTitles(`${title} renamed`)).toEqual(['Gardens']);
  });

  it('switches between an icon picture and a library icon', async () => {
    const title = unique('icon');
    await call('createCategory', { title, iconClassName: 'glyphicon glyphicon-leaf' });
    await call('updateCategory', { title, newIcon: ['https://example.com/new-icon.png'] });
    expect(await listed(title)).toEqual([jasmine.objectContaining({ iconUrl: 'https://example.com/new-icon.png', iconClassName: null })]);
    await call('updateCategory', { title, newIconClassName: 'glyphicon glyphicon-tree-deciduous' });
    expect(await listed(title)).toEqual([jasmine.objectContaining({ iconUrl: null, iconClassName: 'glyphicon glyphicon-tree-deciduous' })]);
  });

  describe('refuses, and changes nothing', () => {
    it('a title no category has, naming it', async () => {
      const title = unique('missing');
      expect(await refusal(call('updateCategory', { title, newTitle: 'x' }))).toContain(title);
    });

    it('a title two categories share, saying how many', async () => {
      const title = unique('shared');
      await call('createCategoriesAdvanced', { categories: [{ title }, { title }] });
      expect((await refusal(call('updateCategory', { title, newTitle: 'x' }))).replace(title, '')).toContain('2');
      expect((await listed(title)).length).toBe(2);
    });

    it('removing the title, or a call that changes nothing', async () => {
      const title = unique('keep');
      await call('createCategory', { title });
      expect(await refusal(call('updateCategory', { title, newTitle: null }))).toContain('newTitle');
      expect(await refusal(call('updateCategory', { title, newTitle: '' }))).toContain('newTitle');
      await expectAsync(call('updateCategory', { title })).toBeRejected();
      expect(await listed(title)).toEqual([jasmine.objectContaining({ title })]);
    });

    it('without a title', async () => {
      expect(await refusal(call('updateCategory', { newTitle: 'x' }))).toContain('title');
    });
  });

  describe("the previous contract's data", () => {
    it('changes a category the previous pre specs added', async () => {
      const title = `Pre category renamed (${contract.host})`;
      expect(await call('updateCategory', { title, newIconClassName: 'glyphicon glyphicon-star' })).toEqual(jasmine.objectContaining({ title, iconClassName: 'glyphicon glyphicon-star' }));
      expect(await listed(title)).toEqual([jasmine.objectContaining({ title, iconUrl: null, iconClassName: 'glyphicon glyphicon-star' })]);
    });
  });
});

contract.describe('updateCategoryAdvanced', () => {
  beforeEach(quiet);

  it('renames the category with that id', async () => {
    const title = unique('by id');
    const { id } = await call('createCategory', { title });
    expect(await call('updateCategoryAdvanced', { categoryId: id, newTitle: `${title} renamed` })).toEqual(jasmine.objectContaining({ id, title: `${title} renamed` }));
    expect(await listed(`${title} renamed`)).toEqual([jasmine.objectContaining({ id })]);
  });

  it('refuses an id that matches nothing, or none', async () => {
    expect(await refusal(call('updateCategoryAdvanced', { categoryId: '000000000000000000000000', newTitle: 'x' }))).toContain('000000000000000000000000');
    expect(await refusal(call('updateCategoryAdvanced', { newTitle: 'x' }))).toContain('categoryId');
  });

  describe("the previous contract's data", () => {
    it('changes a category the previous pre specs added, by its id', async () => {
      const title = `Pre batch category two (${contract.host})`;
      const [{ id, iconClassName }] = await listed(title);
      expect(iconClassName).toBe('glyphicon glyphicon-star');
      await call('updateCategoryAdvanced', { categoryId: id, newIcon: ['https://example.com/post-icon.png'] });
      expect(await listed(title)).toEqual([jasmine.objectContaining({ id, iconUrl: 'https://example.com/post-icon.png', iconClassName: null })]);
    });
  });
});

contract.describe('updateCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('changes every category and reports each', async () => {
    const titles = [unique('many one'), unique('many two')];
    const { categories } = await call('createCategoriesAdvanced', { categories: titles.map((title) => ({ title })) });
    const result = await call('updateCategoriesAdvanced', { categories: categories.map((entry, index) => ({ categoryId: entry.id, newTitle: `${titles[index]} changed` })) });
    expect(result).toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
    for (const title of titles) expect(await listed(`${title} changed`)).toEqual([jasmine.objectContaining({ title: `${title} changed` })]);
  });

  it('refuses the whole list when an id matches nothing, or is listed twice', async () => {
    const title = unique('kept');
    const { id } = await call('createCategory', { title });
    await expectAsync(call('updateCategoriesAdvanced', { categories: [{ categoryId: id, newTitle: 'x' }, { categoryId: '000000000000000000000000', newTitle: 'y' }] })).toBeRejected();
    await expectAsync(call('updateCategoriesAdvanced', { categories: [{ categoryId: id, newTitle: 'x' }, { categoryId: id, newTitle: 'y' }] })).toBeRejected();
    expect(await listed(title)).toEqual([jasmine.objectContaining({ id })]);
  });

  describe("the previous contract's data", () => {
    it('changes several categories the previous pre specs added', async () => {
      const [one] = await listed(`Pre categories changed one (${contract.host})`);
      const [two] = await listed(`Pre categories to change two (${contract.host})`);
      expect(two.iconUrl).toBe('https://example.com/pre-icon.png');
      const newTitle = unique('pre changed again');
      expect(await call('updateCategoriesAdvanced', { categories: [{ categoryId: one.id, newTitle }, { categoryId: two.id, newIconClassName: 'glyphicon glyphicon-leaf' }] }))
        .toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
      expect(await listed(newTitle)).toEqual([jasmine.objectContaining({ id: one.id })]);
      expect(await listed(`Pre categories to change two (${contract.host})`)).toEqual([jasmine.objectContaining({ iconUrl: null, iconClassName: 'glyphicon glyphicon-leaf' })]);
    });
  });
});

contract.describe('deleteCategory', () => {
  beforeEach(quiet);

  it('removes the category from the list, keeping it behind the scenes', async () => {
    const title = unique('delete');
    const { id } = await call('createCategory', { title });
    expect(await call('deleteCategory', { title })).toEqual(jasmine.objectContaining({ id, title }));
    expect(await listed(title)).toEqual([]);
    // White box: the description promises the removed category is kept behind the scenes, and no operation reads removed
    // categories back, so the store is read to confirm it is still there, marked removed.
    const kept = await new Promise((resolve, reject) => buildfire.publicData.getById(id, 'categories', (error, record) => (error ? reject(error) : resolve(record.data))));
    expect(kept).toEqual(jasmine.objectContaining({ title, deletedOn: jasmine.any(String) }));
  });

  it('refuses a title no category has, naming it', async () => {
    const title = unique('missing');
    expect(await refusal(call('deleteCategory', { title }))).toContain(title);
  });

  it('refuses without a title', async () => {
    expect(await refusal(call('deleteCategory', {}))).toContain('title');
  });

  describe("the previous contract's data", () => {
    it('removes a category the previous pre specs added', async () => {
      const title = `Pre category with a library icon (${contract.host})`;
      expect(await call('deleteCategory', { title })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
      expect(await listed(title)).toEqual([]);
    });
  });
});

contract.describe('deleteCategoryAdvanced', () => {
  beforeEach(quiet);

  it('removes the category with that id, and then no longer finds it', async () => {
    const title = unique('delete by id');
    const { id } = await call('createCategory', { title });
    expect(await call('deleteCategoryAdvanced', { categoryId: id })).toEqual(jasmine.objectContaining({ id, title }));
    expect(await listed(title)).toEqual([]);
    expect(await refusal(call('deleteCategoryAdvanced', { categoryId: id }))).toContain(id);
  });

  it('refuses an id that matches nothing', async () => {
    expect(await refusal(call('deleteCategoryAdvanced', { categoryId: '000000000000000000000000' }))).toContain('000000000000000000000000');
  });

  describe("the previous contract's data", () => {
    it('removes a category the previous pre specs added, by its id', async () => {
      const title = `Pre batch category one (${contract.host})`;
      const [{ id }] = await listed(title);
      expect(await call('deleteCategoryAdvanced', { categoryId: id })).toEqual(jasmine.objectContaining({ id }));
      expect(await listed(title)).toEqual([]);
    });
  });
});

contract.describe('deleteCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('removes every category and reports each', async () => {
    const titles = [unique('gone one'), unique('gone two')];
    const { categories } = await call('createCategoriesAdvanced', { categories: titles.map((title) => ({ title })) });
    expect(await call('deleteCategoriesAdvanced', { categories: categories.map((entry) => ({ categoryId: entry.id })) })).toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
    for (const title of titles) expect(await listed(title)).toEqual([]);
  });

  it('refuses the whole list when an id matches nothing, and removes none of it', async () => {
    const title = unique('survivor');
    const { id } = await call('createCategory', { title });
    await expectAsync(call('deleteCategoriesAdvanced', { categories: [{ categoryId: id }, { categoryId: '000000000000000000000000' }] })).toBeRejected();
    await expectAsync(call('deleteCategoriesAdvanced', { categories: [] })).toBeRejected();
    expect(await listed(title)).toEqual([jasmine.objectContaining({ id })]);
  });

  describe("the previous contract's data", () => {
    it('removes several categories the previous pre specs added', async () => {
      const titles = [`Pre category with an icon (${contract.host})`, `Pre category renamed by id (${contract.host})`];
      const ids = [];
      for (const title of titles) ids.push((await listed(title))[0].id);
      expect(await call('deleteCategoriesAdvanced', { categories: ids.map((categoryId) => ({ categoryId })) })).toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
      for (const title of titles) expect(await listed(title)).toEqual([]);
    });
  });
});

contract.describe('createSubcategory', () => {
  beforeEach(quiet);

  it('adds a subcategory at the end of the category', async () => {
    const title = unique('parent');
    const category = await categoryWith(title, ['First']);
    const created = await call('createSubcategory', { categoryTitle: title, title: 'Second' });
    expect(created).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title: 'Second', categoryId: category.id, categoryTitle: title }));
    expect(await subTitles(title)).toEqual(['First', 'Second']);
  });

  describe('refuses, and adds nothing', () => {
    it('a category title no category has, naming it', async () => {
      const categoryTitle = unique('missing');
      expect(await refusal(call('createSubcategory', { categoryTitle, title: 'Gardens' }))).toContain(categoryTitle);
    });

    it('without a category title or a title', async () => {
      const title = unique('empty parent');
      await call('createCategory', { title });
      expect(await refusal(call('createSubcategory', { title: 'Gardens' }))).toContain('categoryTitle');
      expect(await refusal(call('createSubcategory', { categoryTitle: title }))).toContain('title');
      expect(await refusal(call('createSubcategory', { categoryTitle: title, title: '' }))).toContain('title');
      expect(await subTitles(title)).toEqual([]);
    });
  });

  describe("the previous contract's data", () => {
    it('adds a subcategory to a category the previous pre specs added', async () => {
      const categoryTitle = `Pre category with a subcategory to delete (${contract.host})`;
      expect(await subTitles(categoryTitle)).toEqual([]);
      await call('createSubcategory', { categoryTitle, title: 'Post added' });
      expect(await subTitles(categoryTitle)).toEqual(['Post added']);
    });
  });
});

contract.describe('createSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it("adds a subcategory to the category with that id", async () => {
    const title = unique('parent by id');
    const { id } = await call('createCategory', { title });
    expect(await call('createSubcategoryAdvanced', { categoryId: id, title: 'Gardens' })).toEqual(jasmine.objectContaining({ categoryId: id, title: 'Gardens' }));
    expect(await subTitles(title)).toEqual(['Gardens']);
  });

  it('refuses a category id that matches nothing', async () => {
    expect(await refusal(call('createSubcategoryAdvanced', { categoryId: '000000000000000000000000', title: 'Gardens' }))).toContain('000000000000000000000000');
  });

  describe("the previous contract's data", () => {
    it('adds a subcategory to a category the previous pre specs added, by its id', async () => {
      const title = `Pre category with a subcategory to delete by id (${contract.host})`;
      const [{ id }] = await listed(title);
      await call('createSubcategoryAdvanced', { categoryId: id, title: 'Post added' });
      expect(await subTitles(title)).toEqual(['Post added']);
    });
  });
});

contract.describe('createSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('adds every subcategory, several to one category, and reports each', async () => {
    const title = unique('batch parent');
    const { id } = await call('createCategory', { title });
    const result = await call('createSubcategoriesAdvanced', { subcategories: [{ categoryId: id, title: 'One' }, { categoryId: id, title: 'Two' }] });
    expect(result).toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
    expect(await subTitles(title)).toEqual(['One', 'Two']);
  });

  it('refuses the whole list when a category id matches nothing, and adds none of it', async () => {
    const title = unique('batch refused');
    const { id } = await call('createCategory', { title });
    await expectAsync(call('createSubcategoriesAdvanced', { subcategories: [{ categoryId: id, title: 'One' }, { categoryId: '000000000000000000000000', title: 'Two' }] })).toBeRejected();
    await expectAsync(call('createSubcategoriesAdvanced', { subcategories: [] })).toBeRejected();
    expect(await subTitles(title)).toEqual([]);
  });

  describe("the previous contract's data", () => {
    it('adds several subcategories to a category the previous pre specs added', async () => {
      const title = `Pre category with batch deletes (${contract.host})`;
      const [{ id }] = await listed(title);
      expect(await call('createSubcategoriesAdvanced', { subcategories: [{ categoryId: id, title: 'Post one' }, { categoryId: id, title: 'Post two' }] }))
        .toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
      expect(await subTitles(title)).toEqual(['Post one', 'Post two']);
    });
  });
});

contract.describe('updateSubcategory', () => {
  beforeEach(quiet);

  it('renames the subcategory and changes its icon, keeping its place', async () => {
    const title = unique('sub parent');
    await categoryWith(title, ['First', 'Second']);
    expect(await call('updateSubcategory', { categoryTitle: title, title: 'First', newTitle: 'Renamed', newIcon: ['https://example.com/sub.png'] }))
      .toEqual(jasmine.objectContaining({ title: 'Renamed', iconUrl: 'https://example.com/sub.png', iconClassName: null }));
    expect(await subTitles(title)).toEqual(['Renamed', 'Second']);
  });

  describe('refuses, and changes nothing', () => {
    it('a subcategory title the category does not have, naming it', async () => {
      const title = unique('sub missing');
      await categoryWith(title, ['First']);
      expect(await refusal(call('updateSubcategory', { categoryTitle: title, title: 'Nope', newTitle: 'x' }))).toContain('Nope');
    });

    it('a subcategory title two subcategories share, saying how many', async () => {
      const title = unique('sub shared');
      await categoryWith(title, ['Twin', 'Twin']);
      expect((await refusal(call('updateSubcategory', { categoryTitle: title, title: 'Twin', newTitle: 'x' }))).replace(title, '')).toContain('2');
      expect(await subTitles(title)).toEqual(['Twin', 'Twin']);
    });

    it('removing the title, or a call that changes nothing', async () => {
      const title = unique('sub keep');
      await categoryWith(title, ['First']);
      expect(await refusal(call('updateSubcategory', { categoryTitle: title, title: 'First', newTitle: null }))).toContain('newTitle');
      await expectAsync(call('updateSubcategory', { categoryTitle: title, title: 'First' })).toBeRejected();
      expect(await subTitles(title)).toEqual(['First']);
    });
  });

  describe("the previous contract's data", () => {
    it('renames a subcategory the previous pre specs renamed', async () => {
      const categoryTitle = `Pre category with a subcategory to rename (${contract.host})`;
      expect(await subTitles(categoryTitle)).toEqual(['Pre new name']);
      expect(await call('updateSubcategory', { categoryTitle, title: 'Pre new name', newTitle: 'Post new name' })).toEqual(jasmine.objectContaining({ title: 'Post new name' }));
      expect(await subTitles(categoryTitle)).toEqual(['Post new name']);
    });
  });
});

contract.describe('updateSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it('renames the subcategory with those ids', async () => {
    const title = unique('sub by id');
    const { id } = await call('createCategory', { title });
    const sub = await call('createSubcategoryAdvanced', { categoryId: id, title: 'First' });
    await call('updateSubcategoryAdvanced', { categoryId: id, subcategoryId: sub.id, newIconClassName: 'glyphicon glyphicon-leaf', newTitle: 'Renamed' });
    expect((await listed(title))[0].subcategories).toEqual([jasmine.objectContaining({ id: sub.id, title: 'Renamed', iconClassName: 'glyphicon glyphicon-leaf', iconUrl: null })]);
  });

  it('refuses a subcategory id that matches nothing', async () => {
    const title = unique('sub unknown');
    const { id } = await call('createCategory', { title });
    expect(await refusal(call('updateSubcategoryAdvanced', { categoryId: id, subcategoryId: 'no-such-subcategory', newTitle: 'x' }))).toContain('no-such-subcategory');
  });

  describe("the previous contract's data", () => {
    it('changes a subcategory the previous pre specs added, by its ids', async () => {
      const title = `Pre category with a subcategory to rename by id (${contract.host})`;
      const [{ id, subcategories: [sub] }] = await listed(title);
      expect(sub).toEqual(jasmine.objectContaining({ title: 'Pre new name', iconClassName: 'glyphicon glyphicon-leaf' }));
      await call('updateSubcategoryAdvanced', { categoryId: id, subcategoryId: sub.id, newIcon: ['https://example.com/post-sub.png'] });
      expect((await listed(title))[0].subcategories).toEqual([jasmine.objectContaining({ id: sub.id, title: 'Pre new name', iconUrl: 'https://example.com/post-sub.png', iconClassName: null })]);
    });
  });
});

contract.describe('updateSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('changes every subcategory and reports each', async () => {
    const title = unique('subs batch');
    const { id } = await call('createCategory', { title });
    const one = await call('createSubcategoryAdvanced', { categoryId: id, title: 'One' });
    const two = await call('createSubcategoryAdvanced', { categoryId: id, title: 'Two' });
    const result = await call('updateSubcategoriesAdvanced', { subcategories: [{ categoryId: id, subcategoryId: one.id, newTitle: 'Uno' }, { categoryId: id, subcategoryId: two.id, newTitle: 'Dos' }] });
    expect(result).toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
    expect(await subTitles(title)).toEqual(['Uno', 'Dos']);
  });

  it('refuses the whole list when an id matches nothing, and changes none of it', async () => {
    const title = unique('subs refused');
    const { id } = await call('createCategory', { title });
    const one = await call('createSubcategoryAdvanced', { categoryId: id, title: 'One' });
    await expectAsync(call('updateSubcategoriesAdvanced', { subcategories: [{ categoryId: id, subcategoryId: one.id, newTitle: 'Uno' }, { categoryId: id, subcategoryId: 'no-such-subcategory', newTitle: 'x' }] })).toBeRejected();
    expect(await subTitles(title)).toEqual(['One']);
  });

  describe("the previous contract's data", () => {
    it('changes several subcategories the previous pre specs added', async () => {
      const title = `Pre category with batch changes (${contract.host})`;
      const [{ id, subcategories }] = await listed(title);
      expect(subcategories.map((sub) => sub.title)).toEqual(['Pre uno', 'Pre two']);
      expect(await call('updateSubcategoriesAdvanced', { subcategories: subcategories.map((sub, index) => ({ categoryId: id, subcategoryId: sub.id, newTitle: `Post ${index}` })) }))
        .toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
      expect(await subTitles(title)).toEqual(['Post 0', 'Post 1']);
    });
  });
});

contract.describe('deleteSubcategory', () => {
  beforeEach(quiet);

  it('removes the subcategory from its category', async () => {
    const title = unique('sub delete');
    await categoryWith(title, ['Keep', 'Remove']);
    expect(await call('deleteSubcategory', { categoryTitle: title, title: 'Remove' })).toEqual(jasmine.objectContaining({ title: 'Remove', id: jasmine.any(String) }));
    expect(await subTitles(title)).toEqual(['Keep']);
  });

  it('refuses a subcategory the category does not have, naming it', async () => {
    const title = unique('sub delete missing');
    await categoryWith(title, ['Keep']);
    expect(await refusal(call('deleteSubcategory', { categoryTitle: title, title: 'Nope' }))).toContain('Nope');
    expect(await subTitles(title)).toEqual(['Keep']);
  });

  describe("the previous contract's data", () => {
    it('removes a subcategory the previous pre specs added', async () => {
      const categoryTitle = `Pre category with a subcategory to re-icon (${contract.host})`;
      expect(await subTitles(categoryTitle)).toEqual(['Pre iconed']);
      await call('deleteSubcategory', { categoryTitle, title: 'Pre iconed' });
      expect(await subTitles(categoryTitle)).toEqual([]);
    });
  });
});

contract.describe('deleteSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it('removes the subcategory with those ids', async () => {
    const title = unique('sub delete by id');
    const { id } = await call('createCategory', { title });
    const sub = await call('createSubcategoryAdvanced', { categoryId: id, title: 'Remove' });
    await call('deleteSubcategoryAdvanced', { categoryId: id, subcategoryId: sub.id });
    expect(await subTitles(title)).toEqual([]);
  });

  it('refuses ids that match nothing', async () => {
    expect(await refusal(call('deleteSubcategoryAdvanced', { categoryId: '000000000000000000000000', subcategoryId: 'x' }))).toContain('000000000000000000000000');
  });

  describe("the previous contract's data", () => {
    it('removes a subcategory the previous pre specs added, by its ids', async () => {
      const title = `Pre category with a subcategory by id (${contract.host})`;
      const [{ id, subcategories: [sub] }] = await listed(title);
      expect(sub.title).toBe('Pre museums');
      await call('deleteSubcategoryAdvanced', { categoryId: id, subcategoryId: sub.id });
      expect(await subTitles(title)).toEqual([]);
    });
  });
});

contract.describe('deleteSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('removes every subcategory and reports each', async () => {
    const title = unique('subs delete');
    const { id } = await call('createCategory', { title });
    const one = await call('createSubcategoryAdvanced', { categoryId: id, title: 'One' });
    const two = await call('createSubcategoryAdvanced', { categoryId: id, title: 'Two' });
    await call('createSubcategoryAdvanced', { categoryId: id, title: 'Three' });
    expect(await call('deleteSubcategoriesAdvanced', { subcategories: [{ categoryId: id, subcategoryId: one.id }, { categoryId: id, subcategoryId: two.id }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
    expect(await subTitles(title)).toEqual(['Three']);
  });

  it('refuses the whole list when an id is listed twice, and removes none of it', async () => {
    const title = unique('subs twice');
    const { id } = await call('createCategory', { title });
    const one = await call('createSubcategoryAdvanced', { categoryId: id, title: 'One' });
    await expectAsync(call('deleteSubcategoriesAdvanced', { subcategories: [{ categoryId: id, subcategoryId: one.id }, { categoryId: id, subcategoryId: one.id }] })).toBeRejected();
    expect(await subTitles(title)).toEqual(['One']);
  });

  describe("the previous contract's data", () => {
    it('removes several subcategories the previous pre specs added', async () => {
      const title = `Pre category with batch subcategories (${contract.host})`;
      const [{ id, subcategories }] = await listed(title);
      expect(subcategories.map((sub) => sub.title)).toEqual(['Pre one', 'Pre two']);
      expect(await call('deleteSubcategoriesAdvanced', { subcategories: subcategories.map((sub) => ({ categoryId: id, subcategoryId: sub.id })) }))
        .toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
      expect(await subTitles(title)).toEqual([]);
    });
  });
});

contract.describe('updateSubcategoryOrder', () => {
  beforeEach(quiet);

  it('moves a subcategory to another place', async () => {
    const title = unique('sub order');
    await categoryWith(title, ['A', 'B', 'C']);
    const result = await call('updateSubcategoryOrder', { categoryTitle: title, title: 'C', position: 1 });
    expect(result.subcategories.map((sub) => sub.title)).toEqual(['C', 'A', 'B']);
    expect(await subTitles(title)).toEqual(['C', 'A', 'B']);
  });

  it('refuses a position past the end, or none, and moves nothing', async () => {
    const title = unique('sub order range');
    await categoryWith(title, ['A', 'B']);
    expect(await refusal(call('updateSubcategoryOrder', { categoryTitle: title, title: 'A', position: 3 }))).toContain('position');
    expect(await refusal(call('updateSubcategoryOrder', { categoryTitle: title, title: 'A' }))).toContain('position');
    expect(await subTitles(title)).toEqual(['A', 'B']);
  });

  describe("the previous contract's data", () => {
    it('moves a subcategory the previous pre specs moved', async () => {
      const categoryTitle = `Pre category to reorder (${contract.host})`;
      expect(await subTitles(categoryTitle)).toEqual(['Pre second', 'Pre first']);
      await call('updateSubcategoryOrder', { categoryTitle, title: 'Pre first', position: 1 });
      expect(await subTitles(categoryTitle)).toEqual(['Pre first', 'Pre second']);
    });
  });
});

contract.describe('updateSubcategoryOrderAdvanced', () => {
  beforeEach(quiet);

  it('moves the subcategory with those ids', async () => {
    const title = unique('sub order by id');
    const { id } = await call('createCategory', { title });
    await call('createSubcategoryAdvanced', { categoryId: id, title: 'A' });
    const b = await call('createSubcategoryAdvanced', { categoryId: id, title: 'B' });
    await call('updateSubcategoryOrderAdvanced', { categoryId: id, subcategoryId: b.id, position: 1 });
    expect(await subTitles(title)).toEqual(['B', 'A']);
  });

  it('refuses ids that match nothing', async () => {
    expect(await refusal(call('updateSubcategoryOrderAdvanced', { categoryId: '000000000000000000000000', subcategoryId: 'x', position: 1 }))).toContain('000000000000000000000000');
  });

  describe("the previous contract's data", () => {
    it('moves a subcategory the previous pre specs moved, by its ids', async () => {
      const title = `Pre category to reorder by id (${contract.host})`;
      const [{ id, subcategories }] = await listed(title);
      expect(subcategories.map((sub) => sub.title)).toEqual(['Pre second', 'Pre first']);
      await call('updateSubcategoryOrderAdvanced', { categoryId: id, subcategoryId: subcategories[1].id, position: 1 });
      expect(await subTitles(title)).toEqual(['Pre first', 'Pre second']);
    });
  });
});
