// categories: every operation on categories and their subcategories, one block each, after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}`;
const NO_SUCH_ID = '000000000000000000000000';

// What the contract's own search finds by that exact name.
const listed = async (title) => (await call('searchCategories', { title })).result.map((record) => ({ id: record.id, ...record.data }));
const titlesOf = (subcategories) => subcategories.map((sub) => sub.title);
// The plugin's refresh message and analytics registration get no answer here: spies stand in for them and only answer.
const quiet = () => {
  spyOn(buildfire.messaging, 'sendMessageToWidget');
  if (buildfire.analytics && buildfire.analytics.registerEvent) spyOn(buildfire.analytics, 'registerEvent');
};
const make = (label, extra = {}) => call('createCategory', { title: unique(label), ...extra });

// Only the control panel makes categories, and its run comes first: it makes this one, once, and the app's run finds it.
const forTheApp = 'Post category for the app';
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: forTheApp, subcategories: 'Post first sub, Post second sub' })
    : listed(forTheApp).then(([record]) => record || Promise.reject(new Error(`no category named "${forTheApp}": the control run makes it`))));
  return madeCategory;
};

contract.describe('searchCategories', () => {
  beforeEach(quiet);

  it('finds the category with that exact name, with its subcategories', async () => {
    const { id } = await categoryForTheApp();
    const found = await call('searchCategories', { title: forTheApp });
    expect(found).toEqual(jasmine.objectContaining({
      result: [jasmine.objectContaining({
        id,
        data: jasmine.objectContaining({
          title: forTheApp,
          subcategories: [jasmine.objectContaining({ id: jasmine.any(String), title: 'Post first sub' }), jasmine.objectContaining({ id: jasmine.any(String), title: 'Post second sub' })]
        })
      })],
      totalRecord: 1
    }));
  });

  it('shows every category when no name is given', async () => {
    await categoryForTheApp();
    const all = await call('searchCategories', {});
    expect(all.totalRecord).toBeGreaterThanOrEqual(1);
    expect(all.result.length).toBe(Math.min(all.totalRecord, 50));
    const second = await call('searchCategories', { page: 1 });
    expect(second.result.length).toBe(Math.max(0, Math.min(all.totalRecord - 50, 50)));
  });

  it('finds nothing for a name no category has', async () => {
    expect(await call('searchCategories', { title: unique('no such category') })).toEqual(jasmine.objectContaining({ result: [], totalRecord: 0 }));
  });
});

// controlBackground only: the categories tab manages categories.
contract.describe('createCategory', () => {
  beforeEach(quiet);

  it('adds a category from its name, and returns it', async () => {
    const title = unique('category');
    const created = await call('createCategory', { title });
    expect(created).toEqual(jasmine.objectContaining({
      id: jasmine.any(String), title, iconUrl: null, iconClassName: null, subcategories: []
    }));
    expect(await listed(title)).toEqual([jasmine.objectContaining({ id: created.id, title })]);
  });

  it('adds a category with its picture and subcategories', async () => {
    const title = unique('with subs');
    const created = await call('createCategory', { title, icon: ['https://example.com/icon.png'], subcategories: 'Pizza, Sushi , ' });
    expect(created).toEqual(jasmine.objectContaining({ iconUrl: 'https://example.com/icon.png', iconClassName: null }));
    expect(titlesOf(created.subcategories)).toEqual(['Pizza', 'Sushi']);
    expect(titlesOf((await listed(title))[0].subcategories)).toEqual(['Pizza', 'Sushi']);
  });

  it('adds a category with a library icon', async () => {
    const created = await make('library icon', { iconName: 'glyphicon glyphicon-cutlery' });
    expect(created).toEqual(jasmine.objectContaining({ iconUrl: null, iconClassName: 'glyphicon glyphicon-cutlery' }));
  });

  describe('refuses, and stores nothing', () => {
    it('without a name, or with an empty one', async () => {
      expect(await refusal(call('createCategory', {}))).toContain('title');
      expect(await refusal(call('createCategory', { title: '' }))).toContain('title');
      expect(await refusal(call('createCategory', { title: null }))).toContain('title');
    });

    it('a picture and a library icon at once', async () => {
      const title = unique('two icons');
      expect(await refusal(call('createCategory', { title, icon: ['https://example.com/icon.png'], iconName: 'glyphicon glyphicon-cutlery' }))).toContain('icon');
      expect(await listed(title)).toEqual([]);
    });

    it('a picture given as a bare URL', async () => {
      const title = unique('bare icon');
      expect(await refusal(call('createCategory', { title, icon: 'https://example.com/icon.png' }))).toContain('icon');
      expect(await listed(title)).toEqual([]);
    });

    it('a name that is not text', async () => {
      expect(await refusal(call('createCategory', { title: 42 }))).toContain('title');
    });
  });
});

contract.describe('createCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('adds every category, and reports each', async () => {
    const titles = [unique('batch one'), unique('batch two')];
    const result = await call('createCategoriesAdvanced', { categories: [{ title: titles[0] }, { title: titles[1], subcategories: 'Inner' }] });
    expect(result).toEqual(jasmine.objectContaining({
      categories: [jasmine.objectContaining({ index: 0, id: jasmine.any(String), error: null }), jasmine.objectContaining({ index: 1, id: jasmine.any(String), error: null })],
      succeeded: 2,
      failed: 0
    }));
    expect(await listed(titles[0])).toEqual([jasmine.objectContaining({ id: result.categories[0].id })]);
    expect(titlesOf((await listed(titles[1]))[0].subcategories)).toEqual(['Inner']);
  });

  describe('refuses the whole list, and writes none of it', () => {
    it('when one entry is invalid', async () => {
      const valid = unique('valid entry');
      expect(await refusal(call('createCategoriesAdvanced', { categories: [{ title: valid }, { title: '' }] }))).toContain('title');
      expect(await listed(valid)).toEqual([]);
    });

    it('when it is empty, or holds more than 50 entries', async () => {
      expect(await refusal(call('createCategoriesAdvanced', { categories: [] }))).toContain('categories');
      const categories = Array.from({ length: 51 }, (value, index) => ({ title: unique(`entry ${index}`) }));
      expect(await refusal(call('createCategoriesAdvanced', { categories }))).toContain('categories');
      expect(await listed(categories[0].title)).toEqual([]);
    });
  });
});

contract.describe('updateCategory', () => {
  beforeEach(quiet);

  it('renames the category, keeping its subcategories', async () => {
    const created = await make('rename', { subcategories: 'Kept' });
    const updated = await call('updateCategory', { title: created.title, newTitle: `${created.title} renamed` });
    expect(updated).toEqual(jasmine.objectContaining({ id: created.id, title: `${created.title} renamed` }));
    expect(await listed(created.title)).toEqual([]);
    expect(titlesOf((await listed(`${created.title} renamed`))[0].subcategories)).toEqual(['Kept']);
  });

  it('swaps a picture for a library icon, and clears it', async () => {
    const created = await make('icon swap', { icon: ['https://example.com/icon.png'] });
    expect(await call('updateCategory', { title: created.title, newIconName: 'glyphicon glyphicon-star' })).toEqual(jasmine.objectContaining({ iconUrl: null, iconClassName: 'glyphicon glyphicon-star' }));
    expect(await call('updateCategory', { title: created.title, newIcon: ['https://example.com/other.png'] })).toEqual(jasmine.objectContaining({ iconUrl: 'https://example.com/other.png', iconClassName: null }));
    expect(await call('updateCategory', { title: created.title, newIcon: null })).toEqual(jasmine.objectContaining({ iconUrl: null }));
    expect((await listed(created.title))[0]).toEqual(jasmine.objectContaining({ iconUrl: null, iconClassName: null }));
  });

  describe('refuses, and changes nothing', () => {
    it('a name no category has', async () => {
      const title = unique('missing');
      expect(await refusal(call('updateCategory', { title, newTitle: 'x' }))).toContain(title);
    });

    it('a name two categories share, saying how many', async () => {
      const title = unique('shared');
      await call('createCategory', { title });
      await call('createCategory', { title });
      expect((await refusal(call('updateCategory', { title, newIconName: 'glyphicon glyphicon-star' }))).replace(title, '')).toContain('2');
      expect((await listed(title)).map((category) => category.iconClassName)).toEqual([null, null]);
    });

    it('removing the name', async () => {
      const created = await make('keep name');
      expect(await refusal(call('updateCategory', { title: created.title, newTitle: null }))).toContain('newTitle');
      expect(await listed(created.title)).toEqual([jasmine.objectContaining({ id: created.id })]);
    });

    it('a call that changes nothing, and one without its name', async () => {
      const created = await make('nothing');
      expect(await refusal(call('updateCategory', { title: created.title }))).toContain('newTitle');
      expect(await refusal(call('updateCategory', { newTitle: 'x' }))).toContain('title');
    });
  });
});

contract.describe('updateCategoryAdvanced', () => {
  beforeEach(quiet);

  it('changes the category with that id', async () => {
    const created = await make('by id');
    expect(await call('updateCategoryAdvanced', { categoryId: created.id, newTitle: `${created.title} new` })).toEqual(jasmine.objectContaining({ id: created.id, title: `${created.title} new` }));
  });

  it('refuses an id that matches nothing, and one already deleted', async () => {
    expect(await refusal(call('updateCategoryAdvanced', { categoryId: NO_SUCH_ID, newTitle: 'x' }))).toContain(NO_SUCH_ID);
    const created = await make('deleted');
    await call('deleteCategoryAdvanced', { categoryId: created.id });
    expect(await refusal(call('updateCategoryAdvanced', { categoryId: created.id, newTitle: 'x' }))).toContain(created.id);
  });
});

contract.describe('updateCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('changes every category, and reports each', async () => {
    const one = await make('batch update one');
    const two = await make('batch update two');
    const result = await call('updateCategoriesAdvanced', { categories: [{ categoryId: one.id, newIconName: 'a' }, { categoryId: two.id, newIconName: 'b' }] });
    expect(result).toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
    expect((await listed(one.title))[0].iconClassName).toBe('a');
    expect((await listed(two.title))[0].iconClassName).toBe('b');
  });

  describe('refuses the whole list, and changes none of it', () => {
    it('when one id matches nothing', async () => {
      const one = await make('batch known');
      expect(await refusal(call('updateCategoriesAdvanced', { categories: [{ categoryId: one.id, newIconName: 'a' }, { categoryId: NO_SUCH_ID, newIconName: 'b' }] }))).toContain(NO_SUCH_ID);
      expect((await listed(one.title))[0].iconClassName).toBeNull();
    });

    it('when the same category is listed twice', async () => {
      const one = await make('batch twice');
      await expectAsync(call('updateCategoriesAdvanced', { categories: [{ categoryId: one.id, newIconName: 'a' }, { categoryId: one.id, newIconName: 'b' }] })).toBeRejected();
      expect((await listed(one.title))[0].iconClassName).toBeNull();
    });

    it('when one entry changes nothing, or the list is empty', async () => {
      const one = await make('batch empty change');
      expect(await refusal(call('updateCategoriesAdvanced', { categories: [{ categoryId: one.id }] }))).toContain('newTitle');
      expect(await refusal(call('updateCategoriesAdvanced', { categories: [] }))).toContain('categories');
    });
  });
});

contract.describe('deleteCategory', () => {
  beforeEach(quiet);

  it('removes the category from the app', async () => {
    const created = await make('delete');
    expect(await call('deleteCategory', { title: created.title })).toEqual(jasmine.objectContaining({ id: created.id, title: created.title }));
    expect(await listed(created.title)).toEqual([]);
  });

  describe('refuses, and removes nothing', () => {
    it('a name no category has', async () => {
      const title = unique('missing');
      expect(await refusal(call('deleteCategory', { title }))).toContain(title);
    });

    it('a name two categories share, saying how many', async () => {
      const title = unique('shared');
      await call('createCategory', { title });
      await call('createCategory', { title });
      expect((await refusal(call('deleteCategory', { title }))).replace(title, '')).toContain('2');
      expect((await listed(title)).length).toBe(2);
    });

    it('without a name', async () => {
      expect(await refusal(call('deleteCategory', {}))).toContain('title');
    });
  });
});

contract.describe('deleteCategoryAdvanced', () => {
  beforeEach(quiet);

  it('removes the category with that id', async () => {
    const created = await make('delete by id');
    expect(await call('deleteCategoryAdvanced', { categoryId: created.id })).toEqual(jasmine.objectContaining({ id: created.id }));
    expect(await listed(created.title)).toEqual([]);
  });

  it('refuses an id that matches nothing, and one already removed', async () => {
    expect(await refusal(call('deleteCategoryAdvanced', { categoryId: NO_SUCH_ID }))).toContain(NO_SUCH_ID);
    const created = await make('removed twice');
    await call('deleteCategoryAdvanced', { categoryId: created.id });
    expect(await refusal(call('deleteCategoryAdvanced', { categoryId: created.id }))).toContain(created.id);
  });
});

contract.describe('deleteCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('removes every category, and reports each', async () => {
    const one = await make('batch delete one');
    const two = await make('batch delete two');
    expect(await call('deleteCategoriesAdvanced', { categories: [{ categoryId: one.id }, { categoryId: two.id }] })).toEqual(jasmine.objectContaining({
      categories: [jasmine.objectContaining({ index: 0, id: one.id, error: null }), jasmine.objectContaining({ index: 1, id: two.id, error: null })],
      succeeded: 2,
      failed: 0
    }));
    expect(await listed(one.title)).toEqual([]);
    expect(await listed(two.title)).toEqual([]);
  });

  it('refuses the whole list when one id matches nothing, or one is listed twice', async () => {
    const one = await make('batch delete known');
    expect(await refusal(call('deleteCategoriesAdvanced', { categories: [{ categoryId: one.id }, { categoryId: NO_SUCH_ID }] }))).toContain(NO_SUCH_ID);
    await expectAsync(call('deleteCategoriesAdvanced', { categories: [{ categoryId: one.id }, { categoryId: one.id }] })).toBeRejected();
    expect((await listed(one.title)).length).toBe(1);
    expect(await refusal(call('deleteCategoriesAdvanced', { categories: [] }))).toContain('categories');
  });
});

contract.describe('createSubcategory', () => {
  beforeEach(quiet);

  it('adds a subcategory at the end of its category, and returns it', async () => {
    const category = await make('parent', { subcategories: 'First' });
    const created = await call('createSubcategory', { category: category.title, title: 'Second', icon: ['https://example.com/sub.png'] });
    expect(created).toEqual(jasmine.objectContaining({
      id: jasmine.any(String), title: 'Second', iconUrl: 'https://example.com/sub.png', iconClassName: null, categoryId: category.id, categoryTitle: category.title
    }));
    expect(titlesOf((await listed(category.title))[0].subcategories)).toEqual(['First', 'Second']);
  });

  describe('refuses, and adds nothing', () => {
    it('a category no one has', async () => {
      const name = unique('no parent');
      expect(await refusal(call('createSubcategory', { category: name, title: 'Orphan' }))).toContain(name);
    });

    it('without a name, or without its category', async () => {
      const category = await make('parent no name');
      expect(await refusal(call('createSubcategory', { category: category.title }))).toContain('title');
      expect(await refusal(call('createSubcategory', { category: category.title, title: '' }))).toContain('title');
      expect(await refusal(call('createSubcategory', { title: 'Orphan' }))).toContain('category');
      expect((await listed(category.title))[0].subcategories).toEqual([]);
    });
  });
});

contract.describe('createSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it("adds a subcategory to the category with that id", async () => {
    const category = await make('parent by id');
    expect(await call('createSubcategoryAdvanced', { categoryId: category.id, title: 'Only', iconName: 'glyphicon glyphicon-star' })).toEqual(jasmine.objectContaining({
      title: 'Only', iconClassName: 'glyphicon glyphicon-star', categoryId: category.id
    }));
  });

  it('refuses an id that matches nothing', async () => {
    expect(await refusal(call('createSubcategoryAdvanced', { categoryId: NO_SUCH_ID, title: 'Orphan' }))).toContain(NO_SUCH_ID);
  });
});

contract.describe('createSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('adds every subcategory, in order, and reports each', async () => {
    const category = await make('batch parent');
    const result = await call('createSubcategoriesAdvanced', { subcategories: [{ categoryId: category.id, title: 'One' }, { categoryId: category.id, title: 'Two' }] });
    expect(result).toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
    expect(titlesOf((await listed(category.title))[0].subcategories)).toEqual(['One', 'Two']);
  });

  it('refuses the whole list when one entry is invalid, or one category id matches nothing', async () => {
    const category = await make('batch parent refused');
    expect(await refusal(call('createSubcategoriesAdvanced', { subcategories: [{ categoryId: category.id, title: 'One' }, { categoryId: category.id }] }))).toContain('title');
    expect(await refusal(call('createSubcategoriesAdvanced', { subcategories: [{ categoryId: category.id, title: 'One' }, { categoryId: NO_SUCH_ID, title: 'Two' }] }))).toContain(NO_SUCH_ID);
    expect((await listed(category.title))[0].subcategories).toEqual([]);
    expect(await refusal(call('createSubcategoriesAdvanced', { subcategories: [] }))).toContain('subcategories');
  });
});

contract.describe('updateSubcategory', () => {
  beforeEach(quiet);

  it('renames a subcategory and sets its picture, keeping its place', async () => {
    const category = await make('sub update', { subcategories: 'A, B, C' });
    const updated = await call('updateSubcategory', { category: category.title, title: 'B', newTitle: 'Bee', newIcon: ['https://example.com/bee.png'] });
    expect(updated).toEqual(jasmine.objectContaining({ title: 'Bee', iconUrl: 'https://example.com/bee.png', categoryId: category.id }));
    expect(titlesOf((await listed(category.title))[0].subcategories)).toEqual(['A', 'Bee', 'C']);
  });

  it('clears its icon with null', async () => {
    const category = await make('sub clear icon', { subcategories: 'A' });
    await call('updateSubcategory', { category: category.title, title: 'A', newIconName: 'glyphicon glyphicon-star' });
    expect(await call('updateSubcategory', { category: category.title, title: 'A', newIconName: null })).toEqual(jasmine.objectContaining({ iconClassName: null }));
  });

  describe('refuses, and changes nothing', () => {
    it('a subcategory its category does not have', async () => {
      const category = await make('sub missing', { subcategories: 'A' });
      expect(await refusal(call('updateSubcategory', { category: category.title, title: 'Z', newTitle: 'x' }))).toContain('Z');
    });

    it('a name two subcategories share, saying how many', async () => {
      const category = await make('sub shared', { subcategories: 'Twin, Twin' });
      expect((await refusal(call('updateSubcategory', { category: category.title, title: 'Twin', newTitle: 'x' }))).replace(category.title, '')).toContain('2');
      expect(titlesOf((await listed(category.title))[0].subcategories)).toEqual(['Twin', 'Twin']);
    });

    it('removing the name, or changing nothing', async () => {
      const category = await make('sub keep', { subcategories: 'A' });
      expect(await refusal(call('updateSubcategory', { category: category.title, title: 'A', newTitle: '' }))).toContain('newTitle');
      expect(await refusal(call('updateSubcategory', { category: category.title, title: 'A' }))).toContain('newTitle');
      expect(titlesOf((await listed(category.title))[0].subcategories)).toEqual(['A']);
    });
  });
});

contract.describe('updateSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it('changes the subcategory with that id', async () => {
    const category = await make('sub by id', { subcategories: 'A' });
    const [sub] = category.subcategories;
    expect(await call('updateSubcategoryAdvanced', { categoryId: category.id, subcategoryId: sub.id, newTitle: 'Aa' })).toEqual(jasmine.objectContaining({ id: sub.id, title: 'Aa' }));
  });

  it('refuses ids that match nothing', async () => {
    const category = await make('sub unknown id', { subcategories: 'A' });
    expect(await refusal(call('updateSubcategoryAdvanced', { categoryId: category.id, subcategoryId: 'no-such-sub', newTitle: 'x' }))).toContain('no-such-sub');
    expect(await refusal(call('updateSubcategoryAdvanced', { categoryId: NO_SUCH_ID, subcategoryId: category.subcategories[0].id, newTitle: 'x' }))).toContain(NO_SUCH_ID);
  });
});

contract.describe('updateSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('changes every subcategory, and reports each', async () => {
    const category = await make('sub batch', { subcategories: 'A, B' });
    const [a, b] = category.subcategories;
    const result = await call('updateSubcategoriesAdvanced', {
      subcategories: [{ categoryId: category.id, subcategoryId: a.id, newTitle: 'A2' }, { categoryId: category.id, subcategoryId: b.id, newTitle: 'B2' }]
    });
    expect(result).toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
    expect(titlesOf((await listed(category.title))[0].subcategories)).toEqual(['A2', 'B2']);
  });

  it('refuses the whole list when one id matches nothing, or one is listed twice', async () => {
    const category = await make('sub batch refused', { subcategories: 'A' });
    const [a] = category.subcategories;
    expect(await refusal(call('updateSubcategoriesAdvanced', {
      subcategories: [{ categoryId: category.id, subcategoryId: a.id, newTitle: 'x' }, { categoryId: category.id, subcategoryId: 'no-such-sub', newTitle: 'y' }]
    }))).toContain('no-such-sub');
    await expectAsync(call('updateSubcategoriesAdvanced', {
      subcategories: [{ categoryId: category.id, subcategoryId: a.id, newTitle: 'x' }, { categoryId: category.id, subcategoryId: a.id, newTitle: 'y' }]
    })).toBeRejected();
    expect(titlesOf((await listed(category.title))[0].subcategories)).toEqual(['A']);
  });
});

contract.describe('deleteSubcategory', () => {
  beforeEach(quiet);

  it('removes the subcategory, keeping the rest in order', async () => {
    const category = await make('sub delete', { subcategories: 'A, B, C' });
    expect(await call('deleteSubcategory', { category: category.title, title: 'B' })).toEqual(jasmine.objectContaining({ title: 'B', categoryId: category.id }));
    expect(titlesOf((await listed(category.title))[0].subcategories)).toEqual(['A', 'C']);
  });

  it('refuses a subcategory its category does not have, and removes nothing', async () => {
    const category = await make('sub delete missing', { subcategories: 'A' });
    expect(await refusal(call('deleteSubcategory', { category: category.title, title: 'Z' }))).toContain('Z');
    expect(titlesOf((await listed(category.title))[0].subcategories)).toEqual(['A']);
  });
});

contract.describe('deleteSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it('removes the subcategory with that id', async () => {
    const category = await make('sub delete by id', { subcategories: 'A, B' });
    await call('deleteSubcategoryAdvanced', { categoryId: category.id, subcategoryId: category.subcategories[0].id });
    expect(titlesOf((await listed(category.title))[0].subcategories)).toEqual(['B']);
  });

  it('refuses an id that matches nothing', async () => {
    const category = await make('sub delete unknown', { subcategories: 'A' });
    expect(await refusal(call('deleteSubcategoryAdvanced', { categoryId: category.id, subcategoryId: 'no-such-sub' }))).toContain('no-such-sub');
  });
});

contract.describe('deleteSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('removes every subcategory, and reports each', async () => {
    const category = await make('sub batch delete', { subcategories: 'A, B, C' });
    const [a, , c] = category.subcategories;
    expect(await call('deleteSubcategoriesAdvanced', {
      subcategories: [{ categoryId: category.id, subcategoryId: a.id }, { categoryId: category.id, subcategoryId: c.id }]
    })).toEqual(jasmine.objectContaining({ succeeded: 2, failed: 0 }));
    expect(titlesOf((await listed(category.title))[0].subcategories)).toEqual(['B']);
  });

  it('refuses the whole list when one id matches nothing', async () => {
    const category = await make('sub batch delete refused', { subcategories: 'A' });
    expect(await refusal(call('deleteSubcategoriesAdvanced', {
      subcategories: [{ categoryId: category.id, subcategoryId: category.subcategories[0].id }, { categoryId: category.id, subcategoryId: 'no-such-sub' }]
    }))).toContain('no-such-sub');
    expect(titlesOf((await listed(category.title))[0].subcategories)).toEqual(['A']);
  });
});

contract.describe('updateSubcategoryOrder', () => {
  beforeEach(quiet);

  it('moves a subcategory to another place in its category', async () => {
    const category = await make('sub order', { subcategories: 'A, B, C' });
    const moved = await call('updateSubcategoryOrder', { category: category.title, title: 'C', position: 1 });
    expect(titlesOf(moved.subcategories)).toEqual(['C', 'A', 'B']);
    expect(titlesOf((await listed(category.title))[0].subcategories)).toEqual(['C', 'A', 'B']);
  });

  describe('refuses, and moves nothing', () => {
    it('a place past the end of the list', async () => {
      const category = await make('sub order past', { subcategories: 'A, B' });
      expect(await refusal(call('updateSubcategoryOrder', { category: category.title, title: 'A', position: 3 }))).toContain('position');
      expect(titlesOf((await listed(category.title))[0].subcategories)).toEqual(['A', 'B']);
    });

    it('a place below 1, or one that is not a number', async () => {
      const category = await make('sub order bad', { subcategories: 'A, B' });
      expect(await refusal(call('updateSubcategoryOrder', { category: category.title, title: 'A', position: 0 }))).toContain('position');
      expect(await refusal(call('updateSubcategoryOrder', { category: category.title, title: 'A', position: 'first' }))).toContain('position');
    });
  });
});

contract.describe('updateSubcategoryOrderAdvanced', () => {
  beforeEach(quiet);

  it('moves the subcategory with that id', async () => {
    const category = await make('sub order by id', { subcategories: 'A, B' });
    const moved = await call('updateSubcategoryOrderAdvanced', { categoryId: category.id, subcategoryId: category.subcategories[1].id, position: 1 });
    expect(titlesOf(moved.subcategories)).toEqual(['B', 'A']);
  });

  it('refuses ids that match nothing', async () => {
    const category = await make('sub order unknown', { subcategories: 'A' });
    expect(await refusal(call('updateSubcategoryOrderAdvanced', { categoryId: category.id, subcategoryId: 'no-such-sub', position: 1 }))).toContain('no-such-sub');
  });
});
