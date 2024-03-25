import "../lib/jasmine";
import "../lib/jasmine-html";
import "../lib/boot";

import Categories from "../../../repository/Categories";
import authManager from "../../../UserAccessControl/authManager";
import Category from "../../../entities/Category";

const run = () => {
  describe("Categories", () => {
    const category= {
      title: "Restaurant",
      createdBy: authManager.sanitizedCurrentUser,
      createdAt: new Date()
    }


    it("create category", (done) => {
      Categories.create(new Category(category).toJSON()).then((resp) => {
        category.id = resp.id;
        expect(resp.id).toBeDefined();
        done();
      });
    });

    it("search category", (done) => {
      Categories.search().then((resp) => {
        expect(Array.isArray(resp)).toBeTrue();
        expect(resp.length).toBeGreaterThan(0);
        done();
      });
    });

    it("update category", (done) => {
      Categories.search().then((result) => {
        const cat = result[result.length -1]
        cat.title = 'Moe Restaurant'
        Categories.update(cat.id, new Category(cat).toJSON()).then((resp) => {
          expect(resp.data.title).toEqual('Moe Restaurant');
          done();
        });
      })
    });

    it("delete category", (done) => {
      Categories.search().then((result) => {
        const cat = result[result.length -1];
        cat.deletedOn = new Date();
        cat.deletedBy = authManager.sanitizedCurrentUser;
        Categories.delete(cat.id, new Category(cat).toJSON()).then((resp) => {
          expect(resp.data.deletedOn).toBeTruthy()
          done();
        });
      })
    });
  });

}

export default {
  run
}
