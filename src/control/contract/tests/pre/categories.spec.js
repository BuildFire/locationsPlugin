// categories: every operation on categories and the subcategories inside them, one block each, after the helpers they share.
const call = (operation, parameters) => new Promise((resolve, reject) =>
  contract.invoke(operation, parameters, (error, result) => (error ? reject(error) : resolve(result))));

const ICON = 'https://example.com/pre-category-icon.png';

// A refresh message to the widget and analytics, which nothing here answers: the spies only answer.
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
const forTheApp = 'Pre listed category for the app';
let madeCategory;
const categoryForTheApp = () => {
  madeCategory = madeCategory || (contract.host === 'control' ? call('createCategory', { title: forTheApp, subcategories: 'Pre first, Pre second' }) : Promise.resolve());
  return madeCategory;
};

contract.describe('searchCategories', () => {
  beforeEach(quiet);

  it('finds a category by its name', async () => {
    await categoryForTheApp();
    expect(await call('searchCategories', { title: forTheApp })).toEqual(jasmine.objectContaining({
      result: jasmine.arrayContaining([jasmine.objectContaining({ id: jasmine.any(String), data: jasmine.objectContaining({ title: forTheApp }) })]),
    }));
  });

  it('shows a page of the categories', async () => {
    await categoryForTheApp();
    expect(await call('searchCategories', { title: forTheApp, page: 0 })).toEqual(jasmine.objectContaining({
      result: jasmine.arrayContaining([jasmine.objectContaining({ data: jasmine.objectContaining({ title: forTheApp }) })]),
    }));
  });
});

contract.describe('createCategory', () => {
  beforeEach(quiet);

  it('adds a category from its name', async () => {
    const title = `Pre category (${contract.host})`;
    expect(await call('createCategory', { title })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });

  it('adds a category with a picture and subcategories', async () => {
    const title = `Pre category with a picture (${contract.host})`;
    expect(await call('createCategory', { title, icon: [ICON], subcategories: 'Pizza, Burgers' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });

  it('adds a category with a library icon', async () => {
    const title = `Pre category with an icon (${contract.host})`;
    expect(await call('createCategory', { title, iconName: 'glyphicon glyphicon-cutlery' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });
});

contract.describe('createCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('adds several categories at once', async () => {
    const categories = [
      { title: `Pre batch category one (${contract.host})` },
      { title: `Pre batch category two (${contract.host})`, icon: [ICON], subcategories: 'One' },
      { title: `Pre batch category three (${contract.host})`, iconName: 'glyphicon glyphicon-star' },
    ];
    expect(await call('createCategoriesAdvanced', { categories })).toEqual(jasmine.objectContaining({ succeeded: 3 }));
  });
});

contract.describe('updateCategory', () => {
  beforeEach(quiet);

  it('renames a category found by its name', async () => {
    const title = `Pre category to rename (${contract.host})`;
    await call('createCategory', { title });
    expect(await call('updateCategory', { title, newTitle: `Pre category renamed (${contract.host})` })).toEqual(jasmine.objectContaining({ id: jasmine.any(String) }));
  });

  it("changes a category's picture and icon", async () => {
    const title = `Pre category to change (${contract.host})`;
    await call('createCategory', { title });
    expect(await call('updateCategory', { title, newIcon: [ICON] })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
    expect(await call('updateCategory', { title, newIconName: 'glyphicon glyphicon-heart' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });
});

contract.describe('updateCategoryAdvanced', () => {
  beforeEach(quiet);

  it('changes a category by its id', async () => {
    const { id } = await call('createCategory', { title: `Pre category to change by id (${contract.host})` });
    expect(await call('updateCategoryAdvanced', { categoryId: id, newTitle: `Pre category changed by id (${contract.host})`, newIcon: null })).toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('updateCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('changes several categories at once', async () => {
    const one = await call('createCategory', { title: `Pre batch category to change one (${contract.host})` });
    const two = await call('createCategory', { title: `Pre batch category to change two (${contract.host})` });
    expect(await call('updateCategoriesAdvanced', { categories: [{ categoryId: one.id, newIconName: 'glyphicon glyphicon-star' }, { categoryId: two.id, newTitle: `Pre batch category changed two (${contract.host})`, newIcon: [ICON] }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('deleteCategory', () => {
  beforeEach(quiet);

  it('removes a category found by its name', async () => {
    const title = `Pre category to delete (${contract.host})`;
    await call('createCategory', { title });
    expect(await call('deleteCategory', { title })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title }));
  });
});

contract.describe('deleteCategoryAdvanced', () => {
  beforeEach(quiet);

  it('removes a category by its id', async () => {
    const { id } = await call('createCategory', { title: `Pre category to delete by id (${contract.host})` });
    expect(await call('deleteCategoryAdvanced', { categoryId: id })).toEqual(jasmine.objectContaining({ id }));
  });
});

contract.describe('deleteCategoriesAdvanced', () => {
  beforeEach(quiet);

  it('removes several categories at once', async () => {
    const one = await call('createCategory', { title: `Pre batch category to delete one (${contract.host})` });
    const two = await call('createCategory', { title: `Pre batch category to delete two (${contract.host})` });
    expect(await call('deleteCategoriesAdvanced', { categories: [{ categoryId: one.id }, { categoryId: two.id }] })).toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('createSubcategory', () => {
  beforeEach(quiet);

  it('adds a subcategory to a category found by its name', async () => {
    const category = `Pre category for a subcategory (${contract.host})`;
    await call('createCategory', { title: category });
    expect(await call('createSubcategory', { category, title: 'Pre subcategory' })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title: 'Pre subcategory' }));
  });

  it('adds subcategories with a picture and with an icon', async () => {
    const category = `Pre category for pictured subcategories (${contract.host})`;
    await call('createCategory', { title: category });
    expect(await call('createSubcategory', { category, title: 'Pre pictured', icon: [ICON] })).toEqual(jasmine.objectContaining({ title: 'Pre pictured' }));
    expect(await call('createSubcategory', { category, title: 'Pre iconed', iconName: 'glyphicon glyphicon-star' })).toEqual(jasmine.objectContaining({ title: 'Pre iconed' }));
  });
});

contract.describe('createSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it('adds a subcategory to a category by its id', async () => {
    const { id } = await call('createCategory', { title: `Pre category for a subcategory by id (${contract.host})` });
    expect(await call('createSubcategoryAdvanced', { categoryId: id, title: 'Pre by id', icon: [ICON] })).toEqual(jasmine.objectContaining({ title: 'Pre by id', categoryId: id }));
  });
});

contract.describe('createSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('adds several subcategories at once', async () => {
    const { id } = await call('createCategory', { title: `Pre category for batch subcategories (${contract.host})` });
    expect(await call('createSubcategoriesAdvanced', { subcategories: [{ categoryId: id, title: 'Pre one' }, { categoryId: id, title: 'Pre two', iconName: 'glyphicon glyphicon-star' }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('updateSubcategory', () => {
  beforeEach(quiet);

  it("renames a subcategory found by its category's name and its own", async () => {
    const category = `Pre category with a subcategory to rename (${contract.host})`;
    await call('createCategory', { title: category, subcategories: 'Old' });
    expect(await call('updateSubcategory', { category, title: 'Old', newTitle: 'New' })).toEqual(jasmine.objectContaining({ title: 'New' }));
  });

  it("changes a subcategory's picture and icon", async () => {
    const category = `Pre category with a subcategory to change (${contract.host})`;
    await call('createCategory', { title: category, subcategories: 'Pictured' });
    expect(await call('updateSubcategory', { category, title: 'Pictured', newIcon: [ICON] })).toEqual(jasmine.objectContaining({ title: 'Pictured' }));
    expect(await call('updateSubcategory', { category, title: 'Pictured', newIconName: 'glyphicon glyphicon-star' })).toEqual(jasmine.objectContaining({ title: 'Pictured' }));
  });
});

contract.describe('updateSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it('changes a subcategory by its ids', async () => {
    const made = await call('createCategory', { title: `Pre category with a subcategory by id (${contract.host})`, subcategories: 'Before' });
    expect(await call('updateSubcategoryAdvanced', { categoryId: made.id, subcategoryId: made.subcategories[0].id, newTitle: 'After', newIcon: null }))
      .toEqual(jasmine.objectContaining({ id: made.subcategories[0].id }));
  });
});

contract.describe('updateSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('changes several subcategories at once', async () => {
    const made = await call('createCategory', { title: `Pre category with batch subcategories to change (${contract.host})`, subcategories: 'A, B' });
    const [a, b] = made.subcategories;
    expect(await call('updateSubcategoriesAdvanced', { subcategories: [{ categoryId: made.id, subcategoryId: a.id, newTitle: 'A2' }, { categoryId: made.id, subcategoryId: b.id, newIcon: [ICON] }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('deleteSubcategory', () => {
  beforeEach(quiet);

  it("removes a subcategory found by its category's name and its own", async () => {
    const category = `Pre category with a subcategory to delete (${contract.host})`;
    await call('createCategory', { title: category, subcategories: 'Gone, Stays' });
    expect(await call('deleteSubcategory', { category, title: 'Gone' })).toEqual(jasmine.objectContaining({ title: 'Gone' }));
  });
});

contract.describe('deleteSubcategoryAdvanced', () => {
  beforeEach(quiet);

  it('removes a subcategory by its ids', async () => {
    const made = await call('createCategory', { title: `Pre category with a subcategory to delete by id (${contract.host})`, subcategories: 'Gone' });
    expect(await call('deleteSubcategoryAdvanced', { categoryId: made.id, subcategoryId: made.subcategories[0].id })).toEqual(jasmine.objectContaining({ id: made.subcategories[0].id }));
  });
});

contract.describe('deleteSubcategoriesAdvanced', () => {
  beforeEach(quiet);

  it('removes several subcategories at once', async () => {
    const made = await call('createCategory', { title: `Pre category with batch subcategories to delete (${contract.host})`, subcategories: 'A, B, C' });
    const [a, b] = made.subcategories;
    expect(await call('deleteSubcategoriesAdvanced', { subcategories: [{ categoryId: made.id, subcategoryId: a.id }, { categoryId: made.id, subcategoryId: b.id }] }))
      .toEqual(jasmine.objectContaining({ succeeded: 2 }));
  });
});

contract.describe('updateSubcategoryOrder', () => {
  beforeEach(quiet);

  it("moves a subcategory to the first place in its category's list", async () => {
    const category = `Pre category with subcategories to order (${contract.host})`;
    await call('createCategory', { title: category, subcategories: 'One, Two, Three' });
    expect(await call('updateSubcategoryOrder', { category, title: 'Three', position: 1 })).toEqual(jasmine.objectContaining({ id: jasmine.any(String), title: category }));
  });
});

contract.describe('updateSubcategoryOrderAdvanced', () => {
  beforeEach(quiet);

  it('moves a subcategory by its ids', async () => {
    const made = await call('createCategory', { title: `Pre category with subcategories to order by id (${contract.host})`, subcategories: 'One, Two' });
    expect(await call('updateSubcategoryOrderAdvanced', { categoryId: made.id, subcategoryId: made.subcategories[1].id, position: 1 })).toEqual(jasmine.objectContaining({ id: made.id }));
  });
});
