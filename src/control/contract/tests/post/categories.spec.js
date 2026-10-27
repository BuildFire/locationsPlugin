// categories: every operation on categories and their subcategories, one block each, after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));
const reason = (error) => String((error && error.message) || error);
// The reason a call was refused; fails the spec when the call succeeds.
const refusal = (promise) => promise.then(() => fail('expected the call to be refused'), reason);
const unique = (label) => `Post ${label} (${contract.host}) ${Date.now()}`;
// What the contract's own read finds by that exact name.
const found = async (title) => (await call('searchCategories', { title })).result;
const foundData = async (title) => (await found(title)).map((record) => record.data);
const subcategoriesOf = async (title) => (await foundData(title))[0].subcategories;
const create = async (label, extra) => {
  const title = unique(label);
  const category = await call('createCategory', { title, ...extra });
  return { title, id: category.id };
};
// A category made and removed, so its id matches no category the plugin lists.
const removedCategoryId = async () => {
  const { id } = await create('removed');
  await call('deleteCategoryAdvanced', { categoryId: id });
  return id;
};
// Calls nothing here answers: the refresh message to the widget and the analytics registration are the plugin's own
// bookkeeping, which the manifest never mentions, so their spies only answer.
const quietSideEffects = () => {
  spyOn(buildfire.messaging, 'sendMessageToWidget');
  spyOn(buildfire.analytics, 'registerEvent');
};
// Only the control panel makes categories, and its run comes first: it makes this one, once, and the app's run finds it.
const forTheApp = 'Post category for the app';
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control'
    ? call('createCategory', { title: forTheApp }).then((category) => ({ id: category.id }))
    : found(forTheApp).then(([record]) => record || Promise.reject(new Error(`no category titled "${forTheApp}": the control run makes it`))));
  return madeCategory;
};

contract.describe('searchCategories', () => {
  beforeEach(quietSideEffects);

  it('finds a category by its exact name, with its details', async () => {
    const { id } = await categoryForTheApp();
    expect(await call('searchCategories', { title: forTheApp })).toEqual(jasmine.objectContaining({
      result: [jasmine.objectContaining({
        id,
        data: jasmine.objectContaining({ title: forTheApp, subcategories: jasmine.any(Array) })
      })],
      totalRecord: 1
    }));
  });

  it('finds nothing for a name no category has', async () => {
    expect(await call('searchCategories', { title: unique('no such category') })).toEqual(jasmine.objectContaining({ result: [], totalRecord: 0 }));
  });

  it('shows every category when no name is given', async () => {
    await categoryForTheApp();
    if (contract.host === 'control') await create('second listed');
    const all = await call('searchCategories', {});
    expect(all.totalRecord).toBeGreaterThan(1);
    expect(all.result.length).toBeGreaterThan(1);
  });

  it('shows another page when one is given', async () => {
    await categoryForTheApp();
    const all = await call('searchCategories', {});
    const farPage = await call('searchCategories', { page: 1000 });
    expect(farPage.result).toEqual([]);
    expect(farPage.totalRecord).toBe(all.totalRecord);
  });

  it('shows at most 50 categories at a time', async () => {
    // More categories than a page, made on the control (the app's run finds them) through the batch operation, 50 a call.
    if (contract.host === 'control') {
      const batch = (from) => Array.from({ length: 50 }, (value, index) => ({ title: unique(`page category ${from + index}`) }));
      await call('createCategoriesAdvanced', { categories: batch(0) });
      await call('createCategoriesAdvanced', { categories: batch(50).slice(0, 1) });
    }
    const all = await call('searchCategories', {});
    expect(all.totalRecord).toBeGreaterThan(50);
    expect(all.result.length).toBe(50);
  }, 300000);
});

// controlBackground only: categories are made in the control panel.
contract.describe('createCategory', () => {
  beforeEach(quietSideEffects);

  it('adds a category from its name, and returns it', async () => {
    const title = unique('category');
    const created = await call('createCategory', { title });
    expect(created).toEqual(jasmine.objectContaining({
      id: jasmine.any(String), title, iconUrl: null, iconClassName: null, subcategories: []
    }));
    expect(await found(title)).toEqual([jasmine.objectContaining({ id: created.id, data: jasmine.objectContaining({ title }) })]);
  });

  it('adds a category with a picture, kept as one image', async () => {
    const title = unique('pictured');
    const created = await call('createCategory', { title, icon: ['https://example.com/post-icon.png'] });
    expect(created).toEqual(jasmine.objectContaining({ iconUrl: 'https://example.com/post-icon.png', iconClassName: null }));
    expect(await foundData(title)).toEqual([jasmine.objectContaining({ iconUrl: 'https://example.com/post-icon.png' })]);
  });

  it('adds a category with a font icon', async () => {
    const title = unique('font icon');
    const created = await call('createCategory', { title, iconName: 'glyphicon glyphicon-star' });
    expect(created).toEqual(jasmine.objectContaining({ iconUrl: null, iconClassName: 'glyphicon glyphicon-star' }));
    expect(await foundData(title)).toEqual([jasmine.objectContaining({ iconClassName: 'glyphicon glyphicon-star' })]);
  });

  it('adds a category with an empty picture list as one without a picture', async () => {
    const title = unique('no picture');
    expect(await call('createCategory', { title, icon: [] })).toEqual(jasmine.objectContaining({ iconUrl: null }));
  });

  describe('refuses, and stores nothing', () => {
    it('without a name', async () => {
      expect(await refusal(call('createCategory', {}))).toContain('title');
    });

    it('with no name', async () => {
      expect(await refusal(call('createCategory', { title: null }))).toContain('title');
    });

    it('with an empty name', async () => {
      expect(await refusal(call('createCategory', { title: '' }))).toContain('title');
    });

    it('with a name that is not text', async () => {
      expect(await refusal(call('createCategory', { title: 42 }))).toContain('title');
    });

    it('with a picture that is not a list', async () => {
      const title = unique('bare picture');
      expect(await refusal(call('createCategory', { title, icon: 'https://example.com/post-icon.png' }))).toContain('icon');
      expect(await found(title)).toEqual([]);
    });

    it('with more than one picture', async () => {
      const title = unique('two pictures');
      expect(await refusal(call('createCategory', { title, icon: ['https://example.com/a.png', 'https://example.com/b.png'] }))).toContain('icon');
      expect(await found(title)).toEqual([]);
    });

    it('with both a picture and a font icon', async () => {
      const title = unique('both icons');
      await expectAsync(call('createCategory', { title, icon: ['https://example.com/a.png'], iconName: 'glyphicon glyphicon-star' })).toBeRejected();
      expect(await found(title)).toEqual([]);
    });

    it('with an empty font icon', async () => {
      const title = unique('empty font icon');
      expect(await refusal(call('createCategory', { title, iconName: '' }))).toContain('iconName');
      expect(await found(title)).toEqual([]);
    });
  });
});

contract.describe('createCategoriesAdvanced', () => {
  beforeEach(quietSideEffects);

  it('adds every category, and reports each', async () => {
    const titles = [unique('batch one'), unique('batch two')];
    const result = await call('createCategoriesAdvanced', {
      categories: [{ title: titles[0] }, { title: titles[1], icon: ['https://example.com/batch.png'] }]
    });
    expect(result).toEqual(jasmine.objectContaining({
      categories: [jasmine.objectContaining({ index: 0, id: jasmine.any(String), error: null }), jasmine.objectContaining({ index: 1, id: jasmine.any(String), error: null })],
      succeeded: 2,
      failed: 0
    }));
    expect(await foundData(titles[0])).toEqual([jasmine.objectContaining({ title: titles[0] })]);
    expect(await foundData(titles[1])).toEqual([jasmine.objectContaining({ iconUrl: 'https://example.com/batch.png' })]);
  });

  describe('refuses the whole list, and adds none of it', () => {
    it('when one entry is invalid', async () => {
      const valid = unique('valid entry');
      expect(await refusal(call('createCategoriesAdvanced', { categories: [{ title: valid }, { icon: ['https://example.com/a.png'] }] }))).toContain('title');
      expect(await found(valid)).toEqual([]);
    });

    it('when an entry is not a category', async () => {
      const valid = unique('valid beside text');
      await expectAsync(call('createCategoriesAdvanced', { categories: [{ title: valid }, 'Parks'] })).toBeRejected();
      expect(await found(valid)).toEqual([]);
    });

    it('when it is empty', async () => {
      expect(await refusal(call('createCategoriesAdvanced', { categories: [] }))).toContain('categories');
    });

    it('when it is left out', async () => {
      expect(await refusal(call('createCategoriesAdvanced', {}))).toContain('categories');
    });

    it('when it holds more than 50 entries', async () => {
      const categories = Array.from({ length: 51 }, (value, index) => ({ title: unique(`too many ${index}`) }));
      await expectAsync(call('createCategoriesAdvanced', { categories })).toBeRejected();
      expect(await found(categories[0].title)).toEqual([]);
    });
  });
});

contract.describe('updateCategory', () => {
  beforeEach(quietSideEffects);

  it('changes only what it is given, and returns the category', async () => {
    const { title, id } = await create('update', { icon: ['https://example.com/kept.png'] });
    const renamed = `${title} renamed`;
    expect(await call('updateCategory', { title, newTitle: renamed })).toEqual(jasmine.objectContaining({
      id, title: renamed, iconUrl: 'https://example.com/kept.png', subcategories: []
    }));
    expect(await found(title)).toEqual([]);
    expect(await foundData(renamed)).toEqual([jasmine.objectContaining({ title: renamed, iconUrl: 'https://example.com/kept.png' })]);
  });

  it('swaps the picture for a font icon, and back', async () => {
    const { title } = await create('icon swap', { icon: ['https://example.com/first.png'] });
    expect(await call('updateCategory', { title, newIconName: 'glyphicon glyphicon-star' })).toEqual(jasmine.objectContaining({ iconUrl: null, iconClassName: 'glyphicon glyphicon-star' }));
    expect(await foundData(title)).toEqual([jasmine.objectContaining({ iconUrl: null, iconClassName: 'glyphicon glyphicon-star' })]);
    expect(await call('updateCategory', { title, newIcon: ['https://example.com/second.png'] })).toEqual(jasmine.objectContaining({ iconUrl: 'https://example.com/second.png', iconClassName: null }));
    expect(await foundData(title)).toEqual([jasmine.objectContaining({ iconUrl: 'https://example.com/second.png', iconClassName: null })]);
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
      expect(await foundData(title)).toEqual([jasmine.objectContaining({ iconClassName: null }), jasmine.objectContaining({ iconClassName: null })]);
    });

    it('removing the name', async () => {
      const { title } = await create('keep name');
      expect(await refusal(call('updateCategory', { title, newTitle: null }))).toContain('newTitle');
      expect(await refusal(call('updateCategory', { title, newTitle: '' }))).toContain('newTitle');
      expect(await found(title)).toEqual([jasmine.objectContaining({ data: jasmine.objectContaining({ title }) })]);
    });

    it('a picture that is not a list of one', async () => {
      const { title } = await create('bad picture', { icon: ['https://example.com/kept.png'] });
      expect(await refusal(call('updateCategory', { title, newIcon: 'https://example.com/new.png' }))).toContain('newIcon');
      expect(await refusal(call('updateCategory', { title, newIcon: [] }))).toContain('newIcon');
      expect(await refusal(call('updateCategory', { title, newIcon: null }))).toContain('newIcon');
      expect(await foundData(title)).toEqual([jasmine.objectContaining({ iconUrl: 'https://example.com/kept.png' })]);
    });

    it('a picture and a font icon together', async () => {
      const { title } = await create('both new icons');
      await expectAsync(call('updateCategory', { title, newIcon: ['https://example.com/a.png'], newIconName: 'glyphicon glyphicon-star' })).toBeRejected();
      expect(await foundData(title)).toEqual([jasmine.objectContaining({ iconUrl: null, iconClassName: null })]);
    });

    it('removing the font icon', async () => {
      const { title } = await create('keep font icon', { iconName: 'glyphicon glyphicon-star' });
      expect(await refusal(call('updateCategory', { title, newIconName: null }))).toContain('newIconName');
      expect(await foundData(title)).toEqual([jasmine.objectContaining({ iconClassName: 'glyphicon glyphicon-star' })]);
    });

    it('a call that changes nothing', async () => {
      const { title } = await create('nothing');
      await expectAsync(call('updateCategory', { title })).toBeRejected();
    });

    it('without a name', async () => {
      expect(await refusal(call('updateCategory', { newTitle: 'x' }))).toContain('title');
      expect(await refusal(call('updateCategory', { title: null, newTitle: 'x' }))).toContain('title');
      expect(await refusal(call('updateCategory', { title: '', newTitle: 'x' }))).toContain('title');
    });
  });
});

contract.describe('updateCategoryAdvanced', () => {
  beforeEach(quietSideEffects);

  it("changes the category with that id, and returns it", async () => {
    const { title, id } = await create('by id');
    expect(await call('updateCategoryAdvanced', { categoryId: id, newTitle: `${title} renamed`, newIcon: ['https://example.com/id.png'] }))
      .toEqual(jasmine.objectContaining({ id, title: `${title} renamed`, iconUrl: 'https://example.com/id.png' }));
    expect(await foundData(`${title} renamed`)).toEqual([jasmine.objectContaining({ iconUrl: 'https://example.com/id.png' })]);
  });

  describe('refuses, and changes nothing', () => {
    it('an id that matches no category', async () => {
      const categoryId = await removedCategoryId();
      await expectAsync(call('updateCategoryAdvanced', { categoryId, newTitle: unique('never') })).toBeRejected();
    });

    it('a call that changes nothing', async () => {
      const { id } = await create('id nothing');
      await expectAsync(call('updateCategoryAdvanced', { categoryId: id })).toBeRejected();
    });

    it('removing the name', async () => {
      const { title, id } = await create('id keep name');
      expect(await refusal(call('updateCategoryAdvanced', { categoryId: id, newTitle: null }))).toContain('newTitle');
      expect(await found(title)).toEqual([jasmine.objectContaining({ id })]);
    });

    it('without an id', async () => {
      expect(await refusal(call('updateCategoryAdvanced', { newTitle: 'x' }))).toContain('categoryId');
      expect(await refusal(call('updateCategoryAdvanced', { categoryId: null, newTitle: 'x' }))).toContain('categoryId');
      expect(await refusal(call('updateCategoryAdvanced', { categoryId: '', newTitle: 'x' }))).toContain('categoryId');
    });
  });
});

contract.describe('updateCategoriesAdvanced', () => {
  beforeEach(quietSideEffects);

  it('changes every category, and reports each', async () => {
    const one = await create('batch update one');
    const two = await create('batch update two');
    const result = await call('updateCategoriesAdvanced', {
      categories: [{ categoryId: one.id, newTitle: `${one.title} changed` }, { categoryId: two.id, newIconName: 'glyphicon glyphicon-star' }]
    });
    expect(result).toEqual(jasmine.objectContaining({
      categories: [jasmine.objectContaining({ index: 0, id: one.id, error: null }), jasmine.objectContaining({ index: 1, id: two.id, error: null })],
      succeeded: 2,
      failed: 0
    }));
    expect(await foundData(`${one.title} changed`)).toEqual([jasmine.objectContaining({ title: `${one.title} changed` })]);
    expect(await foundData(two.title)).toEqual([jasmine.objectContaining({ iconClassName: 'glyphicon glyphicon-star' })]);
  });

  describe('refuses the whole list, and changes none of it', () => {
    it('when one entry is invalid', async () => {
      const one = await create('batch valid');
      const two = await create('batch invalid');
      expect(await refusal(call('updateCategoriesAdvanced', {
        categories: [{ categoryId: one.id, newTitle: `${one.title} changed` }, { categoryId: two.id, newTitle: null }]
      }))).toContain('newTitle');
      expect(await found(one.title)).toEqual([jasmine.objectContaining({ id: one.id })]);
    });

    it('when an id matches no category', async () => {
      const one = await create('batch known');
      const categoryId = await removedCategoryId();
      await expectAsync(call('updateCategoriesAdvanced', {
        categories: [{ categoryId: one.id, newTitle: `${one.title} changed` }, { categoryId, newTitle: unique('never') }]
      })).toBeRejected();
      expect(await found(one.title)).toEqual([jasmine.objectContaining({ id: one.id })]);
    });

    it('when the same category is listed twice', async () => {
      const one = await create('batch twice');
      await expectAsync(call('updateCategoriesAdvanced', {
        categories: [{ categoryId: one.id, newTitle: `${one.title} a` }, { categoryId: one.id, newTitle: `${one.title} b` }]
      })).toBeRejected();
      expect(await found(one.title)).toEqual([jasmine.objectContaining({ id: one.id })]);
    });

    it('when it is empty', async () => {
      await expectAsync(call('updateCategoriesAdvanced', { categories: [] })).toBeRejected();
    });

    it('when it holds more than 50 entries', async () => {
      const one = await create('batch too many');
      const categories = Array.from({ length: 51 }, (value, index) => ({ categoryId: one.id, newTitle: `${one.title} ${index}` }));
      await expectAsync(call('updateCategoriesAdvanced', { categories })).toBeRejected();
      expect(await found(one.title)).toEqual([jasmine.objectContaining({ id: one.id })]);
    });
  });
});

contract.describe('deleteCategory', () => {
  beforeEach(quietSideEffects);

  it('removes the category, so it is no longer listed', async () => {
    const { title, id } = await create('delete');
    expect(await call('deleteCategory', { title })).toEqual(jasmine.objectContaining({ id, title, deleted: true }));
    expect(await found(title)).toEqual([]);
  });

  it('leaves every other category alone', async () => {
    const kept = await create('kept');
    const { title } = await create('deleted');
    await call('deleteCategory', { title });
    expect(await found(kept.title)).toEqual([jasmine.objectContaining({ id: kept.id })]);
  });

  describe('refuses, and removes nothing', () => {
    it('a name no category has', async () => {
      const title = unique('missing');
      expect(await refusal(call('deleteCategory', { title }))).toContain(title);
    });

    it('a name two categories share, saying how many', async () => {
      const title = unique('shared delete');
      await call('createCategory', { title });
      await call('createCategory', { title });
      expect((await refusal(call('deleteCategory', { title }))).replace(title, '')).toContain('2');
      expect((await found(title)).length).toBe(2);
    });

    it('without a name', async () => {
      expect(await refusal(call('deleteCategory', {}))).toContain('title');
      expect(await refusal(call('deleteCategory', { title: null }))).toContain('title');
      expect(await refusal(call('deleteCategory', { title: '' }))).toContain('title');
    });
  });
});

contract.describe('deleteCategoryAdvanced', () => {
  beforeEach(quietSideEffects);

  it('removes the category with that id', async () => {
    const { title, id } = await create('delete by id');
    expect(await call('deleteCategoryAdvanced', { categoryId: id })).toEqual(jasmine.objectContaining({ id, title, deleted: true }));
    expect(await found(title)).toEqual([]);
  });

  it('refuses an id that matches no category', async () => {
    const categoryId = await removedCategoryId();
    await expectAsync(call('deleteCategoryAdvanced', { categoryId })).toBeRejected();
  });

  it('refuses without an id', async () => {
    expect(await refusal(call('deleteCategoryAdvanced', {}))).toContain('categoryId');
    expect(await refusal(call('deleteCategoryAdvanced', { categoryId: null }))).toContain('categoryId');
    expect(await refusal(call('deleteCategoryAdvanced', { categoryId: '' }))).toContain('categoryId');
  });
});

contract.describe('deleteCategoriesAdvanced', () => {
  beforeEach(quietSideEffects);

  it('removes every category, and reports each', async () => {
    const one = await create('batch delete one');
    const two = await create('batch delete two');
    expect(await call('deleteCategoriesAdvanced', { categories: [{ categoryId: one.id }, { categoryId: two.id }] })).toEqual(jasmine.objectContaining({
      categories: [jasmine.objectContaining({ index: 0, id: one.id, error: null }), jasmine.objectContaining({ index: 1, id: two.id, error: null })],
      succeeded: 2,
      failed: 0
    }));
    expect(await found(one.title)).toEqual([]);
    expect(await found(two.title)).toEqual([]);
  });

  describe('refuses the whole list, and removes none of it', () => {
    it('when an id matches no category', async () => {
      const one = await create('batch delete known');
      const categoryId = await removedCategoryId();
      await expectAsync(call('deleteCategoriesAdvanced', { categories: [{ categoryId: one.id }, { categoryId }] })).toBeRejected();
      expect(await found(one.title)).toEqual([jasmine.objectContaining({ id: one.id })]);
    });

    it('when the same category is listed twice', async () => {
      const one = await create('batch delete twice');
      await expectAsync(call('deleteCategoriesAdvanced', { categories: [{ categoryId: one.id }, { categoryId: one.id }] })).toBeRejected();
      expect(await found(one.title)).toEqual([jasmine.objectContaining({ id: one.id })]);
    });

    it('when an entry has no id', async () => {
      const one = await create('batch delete no id');
      expect(await refusal(call('deleteCategoriesAdvanced', { categories: [{ categoryId: one.id }, {}] }))).toContain('categoryId');
      expect(await found(one.title)).toEqual([jasmine.objectContaining({ id: one.id })]);
    });

    it('when it is empty', async () => {
      await expectAsync(call('deleteCategoriesAdvanced', { categories: [] })).toBeRejected();
    });
  });
});

contract.describe('createSubcategory', () => {
  beforeEach(quietSideEffects);

  it('adds a subcategory to the end of the category, and returns it', async () => {
    const { title, id } = await create('with subcategories');
    await call('createSubcategory', { categoryTitle: title, title: 'Post first' });
    expect(await call('createSubcategory', { categoryTitle: title, title: 'Post second' })).toEqual(jasmine.objectContaining({
      categoryId: id, id: jasmine.any(String), title: 'Post second', iconUrl: null, iconClassName: null
    }));
    expect((await subcategoriesOf(title)).map((subcategory) => subcategory.title)).toEqual(['Post first', 'Post second']);
  });

  describe('refuses, and adds nothing', () => {
    it('a category name no category has', async () => {
      const categoryTitle = unique('missing parent');
      expect(await refusal(call('createSubcategory', { categoryTitle, title: 'Post orphan' }))).toContain(categoryTitle);
    });

    it('without a name', async () => {
      const { title } = await create('subcategory without name');
      expect(await refusal(call('createSubcategory', { categoryTitle: title }))).toContain('title');
      expect(await refusal(call('createSubcategory', { categoryTitle: title, title: null }))).toContain('title');
      expect(await refusal(call('createSubcategory', { categoryTitle: title, title: '' }))).toContain('title');
      expect(await subcategoriesOf(title)).toEqual([]);
    });

    it('without a category name', async () => {
      expect(await refusal(call('createSubcategory', { title: 'Post orphan' }))).toContain('categoryTitle');
      expect(await refusal(call('createSubcategory', { categoryTitle: '', title: 'Post orphan' }))).toContain('categoryTitle');
    });
  });
});

contract.describe('createSubcategoryAdvanced', () => {
  beforeEach(quietSideEffects);

  it("adds a subcategory to the category with that id", async () => {
    const { title, id } = await create('subcategory by id');
    expect(await call('createSubcategoryAdvanced', { categoryId: id, title: 'Post by id' })).toEqual(jasmine.objectContaining({ categoryId: id, title: 'Post by id' }));
    expect(await subcategoriesOf(title)).toEqual([jasmine.objectContaining({ title: 'Post by id' })]);
  });

  it('refuses an id that matches no category', async () => {
    const categoryId = await removedCategoryId();
    await expectAsync(call('createSubcategoryAdvanced', { categoryId, title: 'Post never' })).toBeRejected();
  });

  it('refuses without an id or a name', async () => {
    const { id } = await create('subcategory by id missing');
    expect(await refusal(call('createSubcategoryAdvanced', { title: 'Post never' }))).toContain('categoryId');
    expect(await refusal(call('createSubcategoryAdvanced', { categoryId: id }))).toContain('title');
  });
});

contract.describe('updateSubcategory', () => {
  beforeEach(quietSideEffects);

  const withSubcategories = async (label, names) => {
    const category = await create(label);
    for (const name of names) await call('createSubcategory', { categoryTitle: category.title, title: name });
    return category;
  };

  it('renames a subcategory, and leaves the others alone', async () => {
    const { title, id } = await withSubcategories('rename subcategory', ['Post pizza', 'Post sushi']);
    expect(await call('updateSubcategory', { categoryTitle: title, title: 'Post pizza', newTitle: 'Post pasta' })).toEqual(jasmine.objectContaining({ categoryId: id, title: 'Post pasta' }));
    expect((await subcategoriesOf(title)).map((subcategory) => subcategory.title)).toEqual(['Post pasta', 'Post sushi']);
  });

  it('swaps its picture for a font icon', async () => {
    const { title } = await withSubcategories('subcategory icon', ['Post icon']);
    await call('updateSubcategory', { categoryTitle: title, title: 'Post icon', newIcon: ['https://example.com/sub.png'] });
    expect(await subcategoriesOf(title)).toEqual([jasmine.objectContaining({ iconUrl: 'https://example.com/sub.png', iconClassName: null })]);
    await call('updateSubcategory', { categoryTitle: title, title: 'Post icon', newIconName: 'glyphicon glyphicon-star' });
    expect(await subcategoriesOf(title)).toEqual([jasmine.objectContaining({ iconUrl: null, iconClassName: 'glyphicon glyphicon-star' })]);
  });

  describe('refuses, and changes nothing', () => {
    it('a subcategory name the category does not have', async () => {
      const { title } = await withSubcategories('missing subcategory', ['Post here']);
      expect(await refusal(call('updateSubcategory', { categoryTitle: title, title: 'Post elsewhere', newTitle: 'x' }))).toContain('Post elsewhere');
    });

    it('a subcategory name two subcategories share, saying how many', async () => {
      const { title } = await withSubcategories('shared subcategory', ['Post twin', 'Post twin']);
      expect(await refusal(call('updateSubcategory', { categoryTitle: title, title: 'Post twin', newTitle: 'Post single' }))).toContain('2');
      expect((await subcategoriesOf(title)).map((subcategory) => subcategory.title)).toEqual(['Post twin', 'Post twin']);
    });

    it('removing the name', async () => {
      const { title } = await withSubcategories('keep subcategory name', ['Post kept']);
      expect(await refusal(call('updateSubcategory', { categoryTitle: title, title: 'Post kept', newTitle: null }))).toContain('newTitle');
      expect(await subcategoriesOf(title)).toEqual([jasmine.objectContaining({ title: 'Post kept' })]);
    });

    it('a call that changes nothing', async () => {
      const { title } = await withSubcategories('subcategory nothing', ['Post same']);
      await expectAsync(call('updateSubcategory', { categoryTitle: title, title: 'Post same' })).toBeRejected();
    });

    it('without the names', async () => {
      expect(await refusal(call('updateSubcategory', { title: 'Post same', newTitle: 'x' }))).toContain('categoryTitle');
      expect(await refusal(call('updateSubcategory', { categoryTitle: 'Post any', newTitle: 'x' }))).toContain('title');
    });
  });
});

contract.describe('updateSubcategoryAdvanced', () => {
  beforeEach(quietSideEffects);

  it('changes the subcategory with that id', async () => {
    const { title, id } = await create('subcategory update by id');
    const subcategory = await call('createSubcategory', { categoryTitle: title, title: 'Post by id' });
    expect(await call('updateSubcategoryAdvanced', { categoryId: id, subcategoryId: subcategory.id, newTitle: 'Post renamed by id' }))
      .toEqual(jasmine.objectContaining({ categoryId: id, id: subcategory.id, title: 'Post renamed by id' }));
    expect(await subcategoriesOf(title)).toEqual([jasmine.objectContaining({ id: subcategory.id, title: 'Post renamed by id' })]);
  });

  it('refuses a subcategory id the category does not have', async () => {
    const { title, id } = await create('subcategory gone');
    const subcategory = await call('createSubcategory', { categoryTitle: title, title: 'Post gone' });
    await call('deleteSubcategory', { categoryTitle: title, title: 'Post gone' });
    await expectAsync(call('updateSubcategoryAdvanced', { categoryId: id, subcategoryId: subcategory.id, newTitle: 'x' })).toBeRejected();
    expect(await subcategoriesOf(title)).toEqual([]);
  });

  it('refuses without the ids', async () => {
    expect(await refusal(call('updateSubcategoryAdvanced', { subcategoryId: 'x', newTitle: 'x' }))).toContain('categoryId');
    expect(await refusal(call('updateSubcategoryAdvanced', { categoryId: 'x', newTitle: 'x' }))).toContain('subcategoryId');
  });
});

contract.describe('deleteSubcategory', () => {
  beforeEach(quietSideEffects);

  it('removes the subcategory, and leaves the others alone', async () => {
    const { title, id } = await create('delete subcategory');
    const removed = await call('createSubcategory', { categoryTitle: title, title: 'Post removed' });
    await call('createSubcategory', { categoryTitle: title, title: 'Post kept' });
    expect(await call('deleteSubcategory', { categoryTitle: title, title: 'Post removed' })).toEqual(jasmine.objectContaining({
      categoryId: id, id: removed.id, title: 'Post removed', deleted: true
    }));
    expect((await subcategoriesOf(title)).map((subcategory) => subcategory.title)).toEqual(['Post kept']);
  });

  it('refuses a subcategory name the category does not have', async () => {
    const { title } = await create('delete missing subcategory');
    await call('createSubcategory', { categoryTitle: title, title: 'Post kept' });
    expect(await refusal(call('deleteSubcategory', { categoryTitle: title, title: 'Post absent' }))).toContain('Post absent');
    expect((await subcategoriesOf(title)).length).toBe(1);
  });

  it('refuses without the names', async () => {
    expect(await refusal(call('deleteSubcategory', { title: 'Post kept' }))).toContain('categoryTitle');
    expect(await refusal(call('deleteSubcategory', { categoryTitle: 'Post any' }))).toContain('title');
  });
});

contract.describe('deleteSubcategoryAdvanced', () => {
  beforeEach(quietSideEffects);

  it('removes the subcategory with that id', async () => {
    const { title, id } = await create('delete subcategory by id');
    const subcategory = await call('createSubcategory', { categoryTitle: title, title: 'Post by id' });
    expect(await call('deleteSubcategoryAdvanced', { categoryId: id, subcategoryId: subcategory.id })).toEqual(jasmine.objectContaining({ id: subcategory.id, deleted: true }));
    expect(await subcategoriesOf(title)).toEqual([]);
  });

  it('refuses an id that matches no category', async () => {
    const categoryId = await removedCategoryId();
    await expectAsync(call('deleteSubcategoryAdvanced', { categoryId, subcategoryId: 'x' })).toBeRejected();
  });

  it('refuses without the ids', async () => {
    expect(await refusal(call('deleteSubcategoryAdvanced', { subcategoryId: 'x' }))).toContain('categoryId');
    expect(await refusal(call('deleteSubcategoryAdvanced', { categoryId: 'x' }))).toContain('subcategoryId');
  });
});

contract.describe('updateSubcategoryOrder', () => {
  beforeEach(quietSideEffects);

  const threeSubcategories = async (label) => {
    const category = await create(label);
    for (const name of ['Post one', 'Post two', 'Post three']) await call('createSubcategory', { categoryTitle: category.title, title: name });
    return category;
  };

  it('moves a subcategory to its new place, and returns the new order', async () => {
    const { title, id } = await threeSubcategories('reorder');
    const result = await call('updateSubcategoryOrder', { categoryTitle: title, title: 'Post three', position: 1 });
    expect(result).toEqual(jasmine.objectContaining({ categoryId: id }));
    expect(result.subcategories.map((subcategory) => subcategory.title)).toEqual(['Post three', 'Post one', 'Post two']);
    expect((await subcategoriesOf(title)).map((subcategory) => subcategory.title)).toEqual(['Post three', 'Post one', 'Post two']);
  });

  describe('refuses, and keeps the order', () => {
    it('a place past the end of the list', async () => {
      const { title } = await threeSubcategories('reorder too far');
      expect(await refusal(call('updateSubcategoryOrder', { categoryTitle: title, title: 'Post one', position: 4 }))).toContain('position');
      expect((await subcategoriesOf(title)).map((subcategory) => subcategory.title)).toEqual(['Post one', 'Post two', 'Post three']);
    });

    it('a place before the start, or not a whole number', async () => {
      const { title } = await threeSubcategories('reorder bad place');
      expect(await refusal(call('updateSubcategoryOrder', { categoryTitle: title, title: 'Post one', position: 0 }))).toContain('position');
      expect(await refusal(call('updateSubcategoryOrder', { categoryTitle: title, title: 'Post one', position: 1.5 }))).toContain('position');
      expect(await refusal(call('updateSubcategoryOrder', { categoryTitle: title, title: 'Post one', position: '2' }))).toContain('position');
      expect(await refusal(call('updateSubcategoryOrder', { categoryTitle: title, title: 'Post one' }))).toContain('position');
    });

    it('a subcategory name the category does not have', async () => {
      const { title } = await threeSubcategories('reorder missing');
      expect(await refusal(call('updateSubcategoryOrder', { categoryTitle: title, title: 'Post four', position: 1 }))).toContain('Post four');
    });
  });
});

contract.describe('updateSubcategoryOrderAdvanced', () => {
  beforeEach(quietSideEffects);

  it('moves the subcategory with that id', async () => {
    const { title, id } = await create('reorder by id');
    await call('createSubcategory', { categoryTitle: title, title: 'Post one' });
    const second = await call('createSubcategory', { categoryTitle: title, title: 'Post two' });
    await call('updateSubcategoryOrderAdvanced', { categoryId: id, subcategoryId: second.id, position: 1 });
    expect((await subcategoriesOf(title)).map((subcategory) => subcategory.title)).toEqual(['Post two', 'Post one']);
  });

  it('refuses an id that matches no category', async () => {
    const categoryId = await removedCategoryId();
    await expectAsync(call('updateSubcategoryOrderAdvanced', { categoryId, subcategoryId: 'x', position: 1 })).toBeRejected();
  });

  it('refuses without the ids or the place', async () => {
    expect(await refusal(call('updateSubcategoryOrderAdvanced', { subcategoryId: 'x', position: 1 }))).toContain('categoryId');
    expect(await refusal(call('updateSubcategoryOrderAdvanced', { categoryId: 'x', position: 1 }))).toContain('subcategoryId');
    expect(await refusal(call('updateSubcategoryOrderAdvanced', { categoryId: 'x', subcategoryId: 'x' }))).toContain('position');
  });
});
